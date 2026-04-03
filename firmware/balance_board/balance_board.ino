/**
 * Balance Board — 4-Sensor FSR Bilateral Balance Monitor (ADS1115 version)
 * v3.0 — Added diagnostics, I2C retry, configurable PGA, serial commands
 *
 * Reads 4 square FSRs (Interlink 406 / Adafruit 1075) via two ADS1115 16-bit
 * ADC breakout boards over I2C. Each ADS handles one foot (2 sensors per board).
 *
 * Sensor layout (matches physical wiring):
 *   FL (front-left)  = left toe    → ADS @ 0x49 (RIGHT board), A1
 *   FR (front-right) = right toe   → ADS @ 0x48 (LEFT board), A0
 *   RL (rear-left)   = left heel   → ADS @ 0x49 (RIGHT board), A0
 *   RR (rear-right)  = right heel  → ADS @ 0x48 (LEFT board), A1
 *
 * Wiring (voltage divider):
 *   3.3V → R_pullup → junction → FSR → GND. ADS reads junction voltage.
 *   Target: R_pullup = 100kΩ for best dynamic range with body weight.
 *   Note: Some ADS1115 breakout boards have on-board pull-ups — check!
 *
 *   I2C: SDA = GPIO 4, SCL = GPIO 5
 *   ADS-LEFT  ADDR → GND  (address 0x48)
 *   ADS-RIGHT ADDR → 3.3V (address 0x49)
 *
 * Serial Commands (send via Serial Monitor):
 *   'd' — Diagnostic dump (raw voltages, estimated pull-up R)
 *   'r' — Recapture baseline (step off board first!)
 *   'g' — Cycle PGA gain (4.096 → 2.048 → 1.024 → 0.512 → 0.256 → 6.144 → 4.096)
 *   'h' — Print help / command list
 *
 * Hardware: ESP32-S3-DevKitC-1 N16R8 + 2x ADS1115 breakout boards
 */

#include <Wire.h>

// ─── Forward Declarations ─────────────────────────────────────────────────────
struct SensorMap;
struct SensorReading;
struct BalanceMetrics;
static BalanceMetrics compute_balance(SensorReading* s);
static void print_output(SensorReading* s, BalanceMetrics* m);
static void print_balance_bar(float left_pct);
static void run_diagnostic();
static void print_help();

// ─── I2C Configuration ────────────────────────────────────────────────────────
#define I2C_SDA     4
#define I2C_SCL     5
#define I2C_MAX_RETRIES  3    // Retry failed I2C reads

// ─── ADS1115 Addresses ────────────────────────────────────────────────────────
#define ADS_LEFT    0x48    // ADDR → GND
#define ADS_RIGHT   0x49    // ADDR → 3.3V

// ─── ADS1115 Register Map ─────────────────────────────────────────────────────
#define ADS_REG_CONVERSION  0x00
#define ADS_REG_CONFIG      0x01

// ─── ADS1115 Config Bits ──────────────────────────────────────────────────────
// [15]    OS: start single conversion = 1
// [14:12] MUX: single-ended input select
// [11:9]  PGA: gain (configurable at runtime)
// [8]     MODE: single-shot = 1
// [7:5]   DR: 128 SPS = 100
// [4:0]   Comparator: disabled = 11
#define ADS_MUX_A0       0x4000  // MUX[14:12] = 100 → AIN0 vs GND
#define ADS_MUX_A1       0x5000  // MUX[14:12] = 101 → AIN1 vs GND
#define ADS_MUX_A2       0x6000  // MUX[14:12] = 110 → AIN2 vs GND
#define ADS_MUX_A3       0x7000  // MUX[14:12] = 111 → AIN3 vs GND

static const uint16_t mux_channels[4] = { ADS_MUX_A0, ADS_MUX_A1, ADS_MUX_A2, ADS_MUX_A3 };

// ─── PGA Configuration ───────────────────────────────────────────────────────
// PGA bits [11:9] in config register
struct PGASetting {
    uint16_t bits;       // Config register bits for this gain
    float    fs_volts;   // Full-scale voltage
    float    lsb_mv;     // mV per count
    const char* label;
};

static const PGASetting pga_table[] = {
    { 0x0000, 6.144, 0.1875, "+/-6.144V" },  // index 0
    { 0x0200, 4.096, 0.125,  "+/-4.096V" },  // index 1 (default)
    { 0x0400, 2.048, 0.0625, "+/-2.048V" },  // index 2
    { 0x0600, 1.024, 0.03125,"+/-1.024V" },  // index 3
    { 0x0800, 0.512, 0.015625,"+/-0.512V"},  // index 4
    { 0x0A00, 0.256, 0.0078125,"+/-0.256V"}, // index 5
};
#define PGA_COUNT 6

static int pga_index = 3;  // Start at ±1.024V — best for body weight on FSRs
                            // Under 183lbs, junction voltage is ~49mV → 1560 counts
                            // (was ±6.144V before, giving only ~260 counts of range!)
                            // Baseline will clip at 32767 (3.3V >> 1.024V) — this is fine,
                            // it means all sensors have identical baseline = maximum resolution

// Build config base from current PGA (OS=1, single-shot, 128SPS, comp off)
// Bits: [15] OS=1, [14:12] MUX (set separately), [11:9] PGA (from table),
//       [8] MODE=1 (single-shot), [7:5] DR=100 (128SPS), [4:0] COMP=00011 (off)
static uint16_t get_config_base() {
    return 0x8103 | pga_table[pga_index].bits | 0x0080;
    // 0x8103 = OS(1) bit15 + MODE(1) bit8 + COMP_QUE(11) bits1:0
    // 0x0080 = DR[7:5] = 100 (128 SPS)
}

// ─── Sampling Configuration ───────────────────────────────────────────────────
#define OVERSAMPLE      4       // Average 4 ADS readings per sensor for noise rejection
#define OUTPUT_RATE_HZ  40      // Serial output rate (40Hz)
#define BAUD            115200

// ─── Baseline ─────────────────────────────────────────────────────────────────
#define BASELINE_SAMPLES    32
#define BASELINE_SETTLE_MS  1000
#define NOISE_THRESHOLD     50    // Lowered from 200 — detect smaller force differences

// ─── Sensor Mapping ───────────────────────────────────────────────────────────
// Index: 0=FL, 1=FR, 2=RL, 3=RR
struct SensorMap {
    uint8_t  ads_addr;
    uint16_t mux;
    const char* label;
};

static SensorMap sensor_map[4] = {
    { ADS_RIGHT, ADS_MUX_A1, "FL" },   // Front-left (left toe)  → ADS 0x49, A1
    { ADS_LEFT,  ADS_MUX_A0, "FR" },   // Front-right (right toe) → ADS 0x48, A0
    { ADS_RIGHT, ADS_MUX_A0, "RL" },   // Rear-left (left heel)  → ADS 0x49, A0
    { ADS_LEFT,  ADS_MUX_A1, "RR" },   // Rear-right (right heel) → ADS 0x48, A1
};

// ─── Global State ─────────────────────────────────────────────────────────────

struct SensorReading {
    int16_t  raw;       // Raw ADS1115 value (signed 16-bit)
    int16_t  zeroed;    // Baseline-subtracted
    float    force;     // Inverted so positive = more pressure
};

static int16_t baseline[4] = {0, 0, 0, 0};
static uint32_t last_output_ms = 0;
static const uint32_t output_interval_ms = 1000 / OUTPUT_RATE_HZ;
static uint32_t frame_count = 0;
static bool diagnostic_mode = false;    // When true, print raw+voltage every frame
static uint32_t i2c_errors = 0;        // Running count of I2C failures
static uint32_t i2c_retries_used = 0;  // Running count of retries that succeeded

// ─── ADS1115 I2C Functions (with retry) ─────────────────────────────────────

static void ads_write_config(uint8_t addr, uint16_t config) {
    Wire.beginTransmission(addr);
    Wire.write(ADS_REG_CONFIG);
    Wire.write((uint8_t)(config >> 8));
    Wire.write((uint8_t)(config & 0xFF));
    Wire.endTransmission();
}

static int16_t ads_read_conversion(uint8_t addr) {
    Wire.beginTransmission(addr);
    Wire.write(ADS_REG_CONVERSION);
    uint8_t err = Wire.endTransmission();
    if (err != 0) {
        i2c_errors++;
        return -1;  // Signal read failure
    }
    Wire.requestFrom(addr, (uint8_t)2);
    if (Wire.available() == 2) {
        uint8_t hi = Wire.read();
        uint8_t lo = Wire.read();
        return (int16_t)((hi << 8) | lo);
    }
    i2c_errors++;
    return -1;  // Signal read failure
}

static bool ads_conversion_ready(uint8_t addr) {
    Wire.beginTransmission(addr);
    Wire.write(ADS_REG_CONFIG);
    Wire.endTransmission();
    Wire.requestFrom(addr, (uint8_t)2);
    if (Wire.available() == 2) {
        uint8_t hi = Wire.read();
        Wire.read();
        return (hi & 0x80) != 0;
    }
    return false;
}

static int16_t ads_read_single(uint8_t addr, uint16_t mux_bits) {
    uint16_t config = get_config_base() | mux_bits;
    ads_write_config(addr, config);

    // Wait for conversion (128 SPS = ~8ms max)
    delayMicroseconds(8500);

    // Poll for completion
    int retries = 10;
    while (!ads_conversion_ready(addr) && retries-- > 0) {
        delayMicroseconds(500);
    }

    return ads_read_conversion(addr);
}

// Read with I2C retry — if we get -1 (failure), retry up to I2C_MAX_RETRIES times
static int16_t ads_read_reliable(uint8_t addr, uint16_t mux_bits) {
    for (int attempt = 0; attempt < I2C_MAX_RETRIES; attempt++) {
        int16_t val = ads_read_single(addr, mux_bits);
        if (val != -1) {
            if (attempt > 0) i2c_retries_used++;
            return val;
        }
        // Small delay before retry
        delayMicroseconds(1000);
    }
    // All retries failed — return 0 (will be caught as dropout)
    return 0;
}

static int16_t read_oversampled(uint8_t ads_addr, uint16_t mux_bits) {
    int32_t sum = 0;
    int good_reads = 0;
    for (int i = 0; i < OVERSAMPLE; i++) {
        int16_t val = ads_read_reliable(ads_addr, mux_bits);
        if (val != 0 || i == 0) {  // Accept 0 only on first read (could be legit)
            sum += val;
            good_reads++;
        }
    }
    if (good_reads == 0) return 0;
    return (int16_t)(sum / good_reads);
}

// ─── I2C Scanner (debug) ─────────────────────────────────────────────────────

static bool check_ads(uint8_t addr) {
    Wire.beginTransmission(addr);
    uint8_t err = Wire.endTransmission();
    return (err == 0);
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

static void run_diagnostic() {
    Serial.println();
    Serial.println("═══════════════════════════════════════════════════════");
    Serial.println("  DIAGNOSTIC DUMP");
    Serial.println("═══════════════════════════════════════════════════════");

    // Current PGA
    Serial.print("  PGA: ");
    Serial.print(pga_table[pga_index].label);
    Serial.print("  (LSB = ");
    Serial.print(pga_table[pga_index].lsb_mv, 4);
    Serial.println(" mV)");
    Serial.println();

    // Read raw values for all 4 channels on both boards
    Serial.println("  Board  Ch   Raw Count   Voltage(mV)  Voltage(V)");
    Serial.println("  -----  --   ---------   -----------  ----------");

    for (int i = 0; i < 4; i++) {
        int16_t raw = ads_read_reliable(sensor_map[i].ads_addr, sensor_map[i].mux);
        float mv = raw * pga_table[pga_index].lsb_mv;
        float v = mv / 1000.0;

        char buf[80];
        const char* board = (sensor_map[i].ads_addr == ADS_LEFT) ? "LEFT " : "RIGHT";
        const char* ch = (sensor_map[i].mux == ADS_MUX_A0) ? "A0" : "A1";
        snprintf(buf, sizeof(buf), "  %s  %s   %-10d  %-12.2f %-10.4f  [%s]",
                 board, ch, raw, mv, v, sensor_map[i].label);
        Serial.println(buf);
    }

    // Estimate pull-up resistor value
    // At no-load: junction ≈ 3.3V (R_fsr very high)
    // At load: V_junction = 3.3 × R_fsr / (R_pullup + R_fsr)
    // Baseline gives us unloaded voltage
    Serial.println();
    Serial.println("  Baseline values (captured at startup, unloaded):");
    for (int i = 0; i < 4; i++) {
        float base_mv = baseline[i] * pga_table[pga_index].lsb_mv;
        float base_v = base_mv / 1000.0;
        char buf[60];
        snprintf(buf, sizeof(buf), "    %s: %d counts = %.1f mV = %.3f V",
                 sensor_map[i].label, baseline[i], base_mv, base_v);
        Serial.println(buf);
    }

    // If we have a current reading, estimate R_pullup
    Serial.println();
    Serial.println("  Pull-up resistor estimate (if board is loaded):");
    Serial.println("  Assumes FSR ~ 5kΩ under body weight (~45 lbs/sensor)");
    for (int i = 0; i < 4; i++) {
        int16_t raw = ads_read_reliable(sensor_map[i].ads_addr, sensor_map[i].mux);
        float v_junction = raw * pga_table[pga_index].lsb_mv / 1000.0;
        // V = 3.3 × R_fsr / (R_pullup + R_fsr)
        // R_pullup = R_fsr × (3.3 / V - 1)
        if (v_junction > 0.01 && v_junction < 3.2) {
            float r_fsr_assumed = 5000.0;  // 5kΩ estimate
            float r_pullup_est = r_fsr_assumed * (3.3 / v_junction - 1.0);
            char buf[60];
            snprintf(buf, sizeof(buf), "    %s: V=%.3fV → R_pullup ≈ %.0f Ω (%.1f kΩ)",
                     sensor_map[i].label, v_junction, r_pullup_est, r_pullup_est / 1000.0);
            Serial.println(buf);
        } else {
            char buf[60];
            snprintf(buf, sizeof(buf), "    %s: V=%.3fV — cannot estimate (unloaded or clipped)",
                     sensor_map[i].label, v_junction);
            Serial.println(buf);
        }
    }

    // I2C health
    Serial.println();
    char errbuf[60];
    snprintf(errbuf, sizeof(errbuf), "  I2C errors: %lu  |  Retries used: %lu",
             (unsigned long)i2c_errors, (unsigned long)i2c_retries_used);
    Serial.println(errbuf);

    // Recommended PGA
    Serial.println();
    Serial.println("  PGA recommendation:");
    int16_t max_raw = 0;
    for (int i = 0; i < 4; i++) {
        int16_t raw = ads_read_reliable(sensor_map[i].ads_addr, sensor_map[i].mux);
        if (raw > max_raw) max_raw = raw;
    }
    float max_v = max_raw * pga_table[pga_index].lsb_mv / 1000.0;
    Serial.print("    Current max sensor voltage: ");
    Serial.print(max_v, 3);
    Serial.println(" V");

    // Find smallest PGA that still fits the max voltage (with 10% headroom)
    float needed = max_v * 1.1;
    for (int p = PGA_COUNT - 1; p >= 0; p--) {
        if (pga_table[p].fs_volts >= needed) {
            Serial.print("    Recommended PGA: ");
            Serial.print(pga_table[p].label);
            if (p == pga_index) {
                Serial.println(" (current — no change needed)");
            } else {
                Serial.println(" (press 'g' to cycle to this gain)");
            }
            break;
        }
    }

    Serial.println("═══════════════════════════════════════════════════════");
    Serial.println();
}

static void print_help() {
    Serial.println();
    Serial.println("──── Serial Commands ────");
    Serial.println("  'd' — Diagnostic dump (voltages, pull-up estimate, I2C health)");
    Serial.println("  'r' — Recapture baseline (step off board first!)");
    Serial.println("  'g' — Cycle PGA gain setting");
    Serial.println("  'v' — Toggle verbose mode (raw counts + voltage every frame)");
    Serial.println("  'h' — This help message");
    Serial.println("─────────────────────────");
    Serial.println();
}

// ─── Baseline Capture ─────────────────────────────────────────────────────────

static void capture_baseline() {
    Serial.println("Capturing baseline — keep the board UNLOADED...");
    delay(BASELINE_SETTLE_MS);

    int32_t accum[4] = {0, 0, 0, 0};
    for (int s = 0; s < BASELINE_SAMPLES; s++) {
        for (int i = 0; i < 4; i++) {
            accum[i] += read_oversampled(sensor_map[i].ads_addr, sensor_map[i].mux);
        }
        delay(5);
    }
    for (int i = 0; i < 4; i++) {
        baseline[i] = (int16_t)(accum[i] / BASELINE_SAMPLES);
    }

    Serial.print("Baseline captured: ");
    for (int i = 0; i < 4; i++) {
        float mv = baseline[i] * pga_table[pga_index].lsb_mv;
        char buf[40];
        snprintf(buf, sizeof(buf), "%s=%d (%.0fmV)", sensor_map[i].label, baseline[i], mv);
        Serial.print(buf);
        if (i < 3) Serial.print(", ");
    }
    Serial.println();

    // At low PGA gains (±1.024V or lower), baseline will clip at 32767
    // because unloaded junction voltage (~3.3V) exceeds the PGA range.
    // This is EXPECTED and actually desirable — all sensors get identical
    // baseline, maximizing resolution for the loaded voltage range.
    bool all_clipped = true;
    for (int i = 0; i < 4; i++) {
        if (baseline[i] < 32000) all_clipped = false;
        if (baseline[i] < 100) {
            Serial.print("  WARNING: ");
            Serial.print(sensor_map[i].label);
            Serial.println(" baseline very low — sensor may not be connected!");
        }
    }
    if (all_clipped && pga_index >= 2) {
        Serial.println("  (Baseline clipped at max — normal for this PGA gain)");
    }

    Serial.println("Ready — step on the board.  ('h' for commands)");
    Serial.println();
}

// ─── Force Estimation ─────────────────────────────────────────────────────────
// No pressure: R_fsr very high → junction ≈ 3.3V → ADS reads high
// Pressure: R_fsr drops → junction drops → ADS reads lower
// HIGHER pressure = LOWER ADS reading. We invert for intuitive output.

static float adc_to_force(int16_t zeroed_value) {
    float inverted = (float)(-zeroed_value);
    if (inverted < 0) inverted = 0;
    return inverted;
}

// ─── Balance Metrics ──────────────────────────────────────────────────────────

struct BalanceMetrics {
    float left_total;       // FL + RL
    float right_total;      // FR + RR
    float left_pct;
    float right_pct;
    float left_ap;          // +1 = ball, -1 = heel
    float right_ap;
    float front_pct;        // front sensors as % of total
    float total_force;
    bool  loaded;
};

static BalanceMetrics compute_balance(SensorReading* s) {
    BalanceMetrics m;

    m.left_total  = s[0].force + s[2].force;  // FL + RL
    m.right_total = s[1].force + s[3].force;  // FR + RR
    m.total_force = m.left_total + m.right_total;

    m.loaded = (m.total_force > NOISE_THRESHOLD * 2);

    if (m.total_force > 0.1) {
        m.left_pct  = 100.0 * m.left_total / m.total_force;
        m.right_pct = 100.0 * m.right_total / m.total_force;
        float front_total = s[0].force + s[1].force;  // FL + FR
        m.front_pct = 100.0 * front_total / m.total_force;
    } else {
        m.left_pct = 50.0;
        m.right_pct = 50.0;
        m.front_pct = 50.0;
    }

    if (m.left_total > 0.1) {
        m.left_ap = (s[0].force - s[2].force) / m.left_total;
    } else {
        m.left_ap = 0.0;
    }

    if (m.right_total > 0.1) {
        m.right_ap = (s[1].force - s[3].force) / m.right_total;
    } else {
        m.right_ap = 0.0;
    }

    return m;
}

// ─── Display ──────────────────────────────────────────────────────────────────

static void print_balance_bar(float left_pct) {
    int bar_width = 40;
    int marker = (int)(left_pct / 100.0 * bar_width);
    if (marker < 0) marker = 0;
    if (marker > bar_width) marker = bar_width;

    Serial.print("  L |");
    for (int i = 0; i < bar_width; i++) {
        if (i == bar_width / 2) Serial.print("|");
        else if (i == marker) Serial.print("*");
        else Serial.print("-");
    }
    Serial.println("| R");
}

static void print_output(SensorReading* s, BalanceMetrics* m) {
    if (frame_count % 40 == 0) {
        Serial.println();
        if (diagnostic_mode) {
            Serial.println("  FL      FR      RL      RR     | L%    R%   F%   | L-AP   R-AP | raw_FL  raw_FR  raw_RL  raw_RR");
            Serial.println("  ------  ------  ------  ------ | ----  ---- ---- | -----  ----- | ------  ------  ------  ------");
        } else {
            Serial.println("  FL      FR      RL      RR     | L%    R%   F%   | L-AP   R-AP");
            Serial.println("  ------  ------  ------  ------ | ----  ---- ---- | -----  -----");
        }
    }

    // Force values
    Serial.print("  ");
    for (int i = 0; i < 4; i++) {
        char buf[10];
        snprintf(buf, sizeof(buf), "%-8.0f", s[i].force);
        Serial.print(buf);
    }

    // Percentages (L/R and Front)
    Serial.print("| ");
    char pctbuf[32];
    snprintf(pctbuf, sizeof(pctbuf), "%-6.1f%-6.1f%-5.1f", m->left_pct, m->right_pct, m->front_pct);
    Serial.print(pctbuf);

    // A/P ratios
    Serial.print("| ");
    char apbuf[32];
    snprintf(apbuf, sizeof(apbuf), "%-7.2f%-7.2f", m->left_ap, m->right_ap);
    Serial.print(apbuf);

    // Verbose/diagnostic: also print raw ADC counts
    if (diagnostic_mode) {
        Serial.print("| ");
        for (int i = 0; i < 4; i++) {
            char buf[10];
            snprintf(buf, sizeof(buf), "%-8d", s[i].raw);
            Serial.print(buf);
        }
    }

    Serial.println();

    if (frame_count % 5 == 0 && m->loaded) {
        print_balance_bar(m->left_pct);
    }
}

// ─── Serial Command Handler ─────────────────────────────────────────────────

static void handle_serial_command(char cmd) {
    switch (cmd) {
        case 'd':
        case 'D':
            run_diagnostic();
            break;

        case 'r':
        case 'R':
            capture_baseline();
            break;

        case 'g':
        case 'G':
            pga_index = (pga_index + 1) % PGA_COUNT;
            Serial.print("PGA changed to: ");
            Serial.print(pga_table[pga_index].label);
            Serial.print("  (LSB = ");
            Serial.print(pga_table[pga_index].lsb_mv, 4);
            Serial.println(" mV)");
            Serial.println("NOTE: Baseline is now invalid — press 'r' to recapture!");
            break;

        case 'v':
        case 'V':
            diagnostic_mode = !diagnostic_mode;
            Serial.print("Verbose/diagnostic mode: ");
            Serial.println(diagnostic_mode ? "ON (showing raw counts)" : "OFF");
            break;

        case 'h':
        case 'H':
        case '?':
            print_help();
            break;

        default:
            break;  // Ignore unknown characters (newlines, etc.)
    }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

void setup() {
    Serial.begin(BAUD);

    // Wait for USB serial connection
    uint32_t start = millis();
    while (!Serial && (millis() - start < 3000)) {
        delay(10);
    }

    Serial.println();
    Serial.println("════════════════════════════════════════════════════════");
    Serial.println("  Balance Board — 4-Sensor FSR v3.0 (ADS1115 I2C)");
    Serial.println("  Send 'h' for serial commands");
    Serial.println("════════════════════════════════════════════════════════");
    Serial.println();

    // Initialize I2C
    Wire.begin(I2C_SDA, I2C_SCL);
    Wire.setClock(400000);  // 400kHz fast mode

    // Check for ADS1115 boards
    Serial.print("Scanning I2C for ADS1115 boards... ");
    bool left_ok  = check_ads(ADS_LEFT);
    bool right_ok = check_ads(ADS_RIGHT);

    Serial.print("LEFT (0x48): ");
    Serial.print(left_ok ? "FOUND" : "NOT FOUND");
    Serial.print("  |  RIGHT (0x49): ");
    Serial.println(right_ok ? "FOUND" : "NOT FOUND");

    if (!left_ok || !right_ok) {
        Serial.println();
        Serial.println("ERROR: One or both ADS1115 boards not detected!");
        Serial.println("Check wiring:");
        Serial.println("  - SDA (GPIO 4) connected to both ADS SDA pins?");
        Serial.println("  - SCL (GPIO 5) connected to both ADS SCL pins?");
        Serial.println("  - Both ADS boards powered (VDD to 3.3V, GND to GND)?");
        Serial.println("  - LEFT ADS: ADDR pin to GND");
        Serial.println("  - RIGHT ADS: ADDR pin to 3.3V");
        Serial.println();
        Serial.println("Halting. Fix wiring and reset.");

        while (true) {
            delay(1000);
            Serial.println("(waiting for ADS1115 boards...)");
        }
    }

    // Current PGA setting
    Serial.print("PGA: ");
    Serial.println(pga_table[pga_index].label);
    Serial.println();

    // Startup diagnostic: read raw voltages on all channels
    // Use highest PGA first to get true unloaded voltage (won't clip)
    int saved_pga = pga_index;
    pga_index = 0;  // ±6.144V for accurate unloaded reading
    Serial.println("── Startup Voltage Check (all channels, unloaded) ──");
    Serial.println("  (Using PGA +/-6.144V for accurate unloaded measurement)");
    for (int i = 0; i < 4; i++) {
        int16_t raw = ads_read_reliable(sensor_map[i].ads_addr, sensor_map[i].mux);
        float mv = raw * pga_table[0].lsb_mv;  // Use PGA 0 LSB
        float v = mv / 1000.0;
        char buf[80];
        snprintf(buf, sizeof(buf), "  %s: %6d counts = %7.1f mV = %.3f V",
                 sensor_map[i].label, raw, mv, v);
        Serial.println(buf);
    }
    pga_index = saved_pga;  // Restore target PGA
    Serial.print("  Switching to operating PGA: ");
    Serial.println(pga_table[pga_index].label);
    Serial.println("────────────────────────────────────────────────────");
    Serial.println();

    // Capture baseline (board must be unloaded)
    capture_baseline();

    last_output_ms = millis();
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

void loop() {
    // Check for serial commands
    while (Serial.available()) {
        char c = Serial.read();
        handle_serial_command(c);
    }

    uint32_t now = millis();

    if ((now - last_output_ms) >= output_interval_ms) {
        last_output_ms = now;

        // Read all 4 sensors via ADS1115 (with retry)
        SensorReading readings[4];
        for (int i = 0; i < 4; i++) {
            readings[i].raw = read_oversampled(sensor_map[i].ads_addr, sensor_map[i].mux);
            readings[i].zeroed = readings[i].raw - baseline[i];
            readings[i].force = adc_to_force(readings[i].zeroed);
        }

        // Compute balance metrics
        BalanceMetrics metrics = compute_balance(readings);

        // Output
        if (metrics.loaded) {
            print_output(readings, &metrics);
        } else {
            if (frame_count % 20 == 0) {
                Serial.println("  (no load detected — step on the board)");
            }
        }

        frame_count++;
    }
}
