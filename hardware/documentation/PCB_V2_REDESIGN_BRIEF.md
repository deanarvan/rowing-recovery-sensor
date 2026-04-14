# PCB V2 Redesign Brief — FlexiForce Sensor Upgrade

**Project:** Rowing/Balance Board Rehabilitation Sensor — V2
**Date:** April 2026
**Board Size:** 50mm x 70mm (same as V1)
**Manufacturing:** JLCPCB / PCBWay compatible
**Revision Purpose:** Replace FSR-402 voltage dividers with FlexiForce A301 op-amp conditioning circuits. Fix V1 routing defect (A0/A1 short on right ADS1115).

---

## Executive Summary

V1 used FSR-402 sensors that saturate at ~100N — patient needs 1,500N+ for clinical testing. V2 switches to Tekscan FlexiForce A301 thin-film sensors (0.2mm thick, range up to 4,448N) with an active op-amp conditioning circuit. This replaces the 6x passive voltage dividers and one of the two ADS1115 ADCs. Everything else (ESP32, USB-C, power supply, BLE) is unchanged.

### What Changes

| V1 (Current) | V2 (New) |
|---|---|
| 2x ADS1115 ADCs | **1x ADS1115 ADC** (single chip, all 4 channels) |
| 6x 10kΩ voltage dividers | **4x inverting op-amp circuits** (1x MCP6004 quad) |
| 6x JST-PH 2-pin connectors | **4x JST-PH 2-pin connectors** (heel+toe per foot) |
| FSR-402 sensors (100N max) | FlexiForce A301 sensors (4,448N max) |
| 6 sensor channels | **4 sensor channels** (no ball-of-foot) |
| Right ADS1115 A0/A1 shorted | **Defect eliminated** (only 1 ADS1115, all 4 channels used) |

### What Stays the Same

- ESP32-WROOM-32 (or ESP32-S3) module — same BLE stack
- USB-C connector + CP2102N USB-to-UART bridge
- AMS1117-3.3 LDO voltage regulator
- BOOT button (GPIO0) + RESET button (EN)
- I2C pull-ups (4.7kΩ on SDA/SCL)
- Power LED + current-limiting resistor
- Board size: 50mm x 70mm, 2-layer
- Power: 5V USB → 3.3V regulated

---

## System Block Diagram (V2)

```
┌─────────────┐
│  USB-C 5V   │
└──────┬──────┘
       │
       ├─ CP2102N UART Bridge (U2)
       │  (TX → ESP32 GPIO1, RX ← ESP32 GPIO3)
       │
       ├─ AMS1117-3.3 LDO (U1)
       │
       ├─ ESP32-WROOM-32 (U3)
       │  ├─ I2C SDA = GPIO21, SCL = GPIO22
       │  ├─ GPIO0 (BOOT button)
       │  ├─ EN (RESET button)
       │  └─ BLE antenna (keep-out zone)
       │
       ├─ MCP6004 Quad Op-Amp (U4) ← NEW
       │  ├─ Ch A (pin 1) ← Left Heel FlexiForce → ADS1115 A0
       │  ├─ Ch B (pin 7) ← Left Toe FlexiForce  → ADS1115 A1
       │  ├─ Ch C (pin 8) ← Right Heel FlexiForce → ADS1115 A2
       │  └─ Ch D (pin 14)← Right Toe FlexiForce  → ADS1115 A3
       │
       └─ ADS1115 @ 0x48 (U5) ← ONE chip only
          ├─ A0 ← Op-amp Ch A output (Left Heel)
          ├─ A1 ← Op-amp Ch B output (Left Toe)
          ├─ A2 ← Op-amp Ch C output (Right Heel)
          ├─ A3 ← Op-amp Ch D output (Right Toe)
          ├─ ADDR → GND (address 0x48)
          └─ I2C bus (SDA/SCL)
```

---

## FlexiForce A301 Conditioning Circuit — Per Channel

The FlexiForce A301 is a 2-terminal variable-resistance sensor. Unlike the FSR-402 (which used a passive voltage divider), it requires an **inverting op-amp circuit** for linear output.

### Schematic (one of 4 identical channels)

```
                          Rf (feedback resistor)
                    ┌──────────────────────────┐
                    │                          │
                    │      ┌──────────┐        │
 Vref ─── Rd ──────┤(-)   │  1/4 of  │  (out) ├───── To ADS1115 input (A0-A3)
  │                │      │  MCP6004 │        │
  │   FlexiForce   │(+)   │          │        │
  │   ┌────────┐   │      └──────────┘        │
  └───┤ sensor ├───┘                           │
      └────────┘   │                           │
                   GND                         │
                                          Cf (optional)
                                         100pF - 1nF
```

### How It Works

1. **Vref** (reference voltage, ~0.5V from a voltage divider off 3.3V) drives a small current through **Rd** (drive resistor) and through the **FlexiForce sensor** to ground.
2. The current through the sensor depends on its resistance, which decreases with applied force.
3. The op-amp in inverting configuration converts this current to a voltage: **Vout = Vref × (Rf / Rsensor)**
4. As force increases → Rsensor decreases → Vout increases → ADS1115 reads higher.
5. **Rf** (feedback resistor) sets the measurement range.

### Component Values

| Component | Value | Purpose | Notes |
|-----------|-------|---------|-------|
| **Rf** (feedback) | **10kΩ** | Sets force range to ~0-2000N | See range table below |
| **Rd** (drive) | **10kΩ** | Limits reference current | Sets Vref attenuation |
| **Cf** (optional) | **100pF** | Low-pass filter on output | Reduces high-freq noise |
| **Rvd1** | **47kΩ** | Voltage divider top (Vref gen) | Shared across all 4 channels |
| **Rvd2** | **10kΩ** | Voltage divider bottom (Vref gen) | Generates Vref ≈ 0.58V |

### Force Range vs Feedback Resistor

| Rf Value | Approx. Force Range | Output at Full Scale | Best For |
|----------|--------------------|--------------------|----------|
| 49.9kΩ | 0 – 445N (100 lbs) | ~3.0V | Light touch testing |
| **10kΩ** | **0 – 2,000N (450 lbs)** | **~3.0V** | **Rehab: standing, squats** |
| 4.7kΩ | 0 – 3,500N (800 lbs) | ~3.0V | Heavy dynamic loading |
| 1kΩ | 0 – 4,448N (1,000 lbs) | ~3.0V | Maximum range |

**Recommended: Rf = 10kΩ** for clinical rehabilitation monitoring. This gives 0–2,000N per sensor (4 sensors × 2,000N = 8,000N total capacity = ~9.7× bodyweight for 84kg patient). More than sufficient for heel raises (2.5×BW), squats (2×BW), and jump landing (3×BW).

**Designer note:** If field-adjustable range is desired, replace each Rf with a **10kΩ trimpot** (e.g., Bourns 3296W or 0603 trimpot). This allows calibration without board rework.

---

## Vref Generation (Shared)

A single voltage divider generates the reference voltage for all 4 op-amp channels:

```
3.3V ─── Rvd1 (47kΩ) ──┬── Vref (~0.58V) ──→ To Rd on each of 4 channels
                         │
                    Rvd2 (10kΩ)
                         │
                        GND
                         │
                    Cvref (100nF)  ← bypass cap for stable Vref
```

**Vref = 3.3V × 10kΩ / (47kΩ + 10kΩ) = 0.579V**

This low Vref ensures the op-amp output stays within the ADS1115's 0–3.3V input range across the full force range.

---

## MCP6004 Pinout and Wiring

The MCP6004 is a **quad** rail-to-rail op-amp in a 14-pin SOIC (or DIP) package. One chip handles all 4 sensor channels.

```
MCP6004 (SOIC-14 or DIP-14)
┌──────────────────┐
│ 1  OUT_A    VDD 14│──── 3.3V
│ 2  IN-_A   OUT_D 13│──── → ADS1115 A3 (Right Toe)
│ 3  IN+_A   IN-_D 12│──── Rf_D + Rd_D
│ 4  VSS     IN+_D 11│──── GND (via sensor)
│ 5  IN+_B   IN-_C 10│──── Rf_C + Rd_C
│ 6  IN-_B   IN+_C  9│──── GND (via sensor)
│ 7  OUT_B   OUT_C   8│──── → ADS1115 A2 (Right Heel)
└──────────────────┘
```

### Channel Assignment

| MCP6004 Channel | Op-Amp Pins (OUT, IN-, IN+) | Sensor | ADS1115 Input |
|---|---|---|---|
| A | Pin 1 (out), Pin 2 (in-), Pin 3 (in+) | Left Heel | A0 |
| B | Pin 7 (out), Pin 6 (in-), Pin 5 (in+) | Left Toe | A1 |
| C | Pin 8 (out), Pin 10 (in-), Pin 9 (in+) | Right Heel | A2 |
| D | Pin 13 (out), Pin 12 (in-), Pin 14 (in+) | Right Toe | A3 |

### Per-Channel Wiring Detail

For **each** of the 4 channels (A through D):

| Connection | From | To | Notes |
|---|---|---|---|
| Feedback resistor (Rf) | MCP6004 OUT pin | MCP6004 IN- pin | 10kΩ 0603, 1% tolerance recommended |
| Drive resistor (Rd) | Vref net | MCP6004 IN- pin | 10kΩ 0603, 1% tolerance recommended |
| Sensor pin 1 | MCP6004 IN+ pin | FlexiForce connector pin 1 | Non-inverting input |
| Sensor pin 2 | GND | FlexiForce connector pin 2 | Ground reference |
| Output to ADC | MCP6004 OUT pin | ADS1115 Ax input | Direct trace, keep short |
| Optional filter cap (Cf) | MCP6004 OUT pin | GND | 100pF 0603, optional |

### MCP6004 Power

| Pin | Connection | Decoupling |
|---|---|---|
| VDD (pin 14) | 3.3V rail | 100nF ceramic (0603) to GND, placed within 5mm of pin |
| VSS (pin 4) | GND | Direct to ground plane |

---

## ADS1115 Configuration (U5)

**One ADS1115 only** (V1 had two). Address 0x48 (ADDR pin to GND).

| Pin | Name | Connection |
|---|---|---|
| 1 | VDD | 3.3V (via 100nF decoupling cap) |
| 2 | A0 | Op-amp Ch A output (Left Heel) |
| 3 | A1 | Op-amp Ch B output (Left Toe) |
| 4 | A2 | Op-amp Ch C output (Right Heel) |
| 5 | A3 | Op-amp Ch D output (Right Toe) |
| 6 | GND | Ground plane |
| 7 | SDA | I2C SDA bus (GPIO21) |
| 8 | SCL | I2C SCL bus (GPIO22) |
| 9 | ADDR | GND (sets address 0x48) |
| 10 | ALERT | Not connected (leave floating or tie to 3.3V via 10kΩ) |

**All 4 analog inputs are used** — no floating inputs, eliminating the V1 crosstalk problem.

**Firmware ADC configuration:**
- Gain: `GAIN_ONE` (+/-4.096V range, LSB = 125µV) — recommended for 0–3.3V op-amp output
- Sample rate: 128 SPS (default, adequate for 50Hz per-channel)
- Mode: Single-ended reads on A0–A3

---

## Sensor Connectors (J2–J5)

**4x 2-pin 0.1" (2.54mm) pitch female through-hole headers**

The FlexiForce A301 terminates in 2 male square pins at 0.1" pitch. These plug directly into standard 2-pin female headers on the PCB — no adapter cables, no soldering to the sensor, instant swap if a sensor needs replacement.

| Connector | Sensor | Op-Amp Channel | ADS1115 Input |
|---|---|---|---|
| J2 | Left Heel FlexiForce | MCP6004 Ch A | A0 |
| J3 | Left Toe FlexiForce | MCP6004 Ch B | A1 |
| J4 | Right Heel FlexiForce | MCP6004 Ch C | A2 |
| J5 | Right Toe FlexiForce | MCP6004 Ch D | A3 |

**Each connector:**
- Pin 1: Sensor signal → MCP6004 IN+ (non-inverting input)
- Pin 2: GND

**Part:** Standard 2-pin 2.54mm female header, through-hole (e.g., LCSC C35165 or any generic 1x2 female header). Place connectors along the board edge for easy cable routing to the balance board.

---

## Complete Bill of Materials (V2)

### Retained from V1 (unchanged)

| Designator | Value | Description | LCSC | Qty |
|---|---|---|---|---|
| U1 | AMS1117-3.3 | 3.3V LDO Regulator | C6186 | 1 |
| U2 | CP2102N | USB-to-UART Bridge | C7520 | 1 |
| U3 | ESP32-WROOM-32 | BLE/WiFi MCU Module | C529143 | 1 |
| R7 | 1kΩ | LED current limiting | C14663 | 1 |
| R10 | 4.7kΩ | I2C SDA pull-up | C14631 | 1 |
| R11 | 4.7kΩ | I2C SCL pull-up | C14631 | 1 |
| R12 | 10kΩ | GPIO0 (BOOT) pull-up | C14663 | 1 |
| R13 | 10kΩ | EN (RESET) pull-up | C14663 | 1 |
| R14 | 22Ω | USB D+ series resistor | C25119 | 1 |
| R15 | 22Ω | USB D- series resistor | C25119 | 1 |
| C1 | 100nF | CP2102N VCC decoupling | C14663 | 1 |
| C2 | 10µF | Input bulk cap (5V) | C13585 | 1 |
| C3 | 100nF | LDO output decoupling | C14663 | 1 |
| C4 | 10µF | LDO output bulk cap | C13585 | 1 |
| C5 | 100nF | ESP32 VCC decoupling | C14663 | 1 |
| C10 | 100nF | BOOT button debounce (optional) | C14663 | 1 |
| C11 | 100nF | RESET button debounce (optional) | C14663 | 1 |
| LED1 | Red LED | Power indicator | C2286 | 1 |
| SW1 | 6x6mm | BOOT button | C318884 | 1 |
| SW2 | 6x6mm | RESET button | C318884 | 1 |
| J1 | USB-C | USB-C mid-mount connector | C165948 | 1 |

### Removed from V1

| V1 Designator | Part | Reason |
|---|---|---|
| U4 | ADS1115 @ 0x48 | Replaced by U5 (single ADS1115 reading op-amp outputs) |
| U5 | ADS1115 @ 0x49 | Had A0/A1 routing defect; eliminated entirely |
| R1–R6 | 10kΩ (×6) | Voltage dividers no longer needed |
| C6–C9 | 100nF (×4) | ADS1115 decoupling no longer needed (keep 2 for U5) |
| J2–J7 | JST-PH 2-pin (×6) | Replaced with 2.54mm female headers for direct FlexiForce plug-in |

### New in V2

| Designator | Value | Description | Package | LCSC | Qty |
|---|---|---|---|---|---|
| **U4** | **MCP6004-I/ST** | **Quad Rail-to-Rail Op-Amp** | **SOIC-14** | **C7378** | **1** |
| **U5** | **ADS1115** | **16-bit I2C ADC (single)** | **MSOP-10** | **C21992** | **1** |
| **Rf1** | **10kΩ 1%** | **Feedback resistor, Ch A (L Heel)** | **0603** | **C25804** | **1** |
| **Rf2** | **10kΩ 1%** | **Feedback resistor, Ch B (L Toe)** | **0603** | **C25804** | **1** |
| **Rf3** | **10kΩ 1%** | **Feedback resistor, Ch C (R Heel)** | **0603** | **C25804** | **1** |
| **Rf4** | **10kΩ 1%** | **Feedback resistor, Ch D (R Toe)** | **0603** | **C25804** | **1** |
| **Rd1** | **10kΩ 1%** | **Drive resistor, Ch A** | **0603** | **C25804** | **1** |
| **Rd2** | **10kΩ 1%** | **Drive resistor, Ch B** | **0603** | **C25804** | **1** |
| **Rd3** | **10kΩ 1%** | **Drive resistor, Ch C** | **0603** | **C25804** | **1** |
| **Rd4** | **10kΩ 1%** | **Drive resistor, Ch D** | **0603** | **C25804** | **1** |
| **Rvd1** | **47kΩ 1%** | **Vref divider top** | **0603** | **C25819** | **1** |
| **Rvd2** | **10kΩ 1%** | **Vref divider bottom** | **0603** | **C25804** | **1** |
| **Cvref** | **100nF** | **Vref bypass cap** | **0603** | **C14663** | **1** |
| **Cpa** | **100nF** | **MCP6004 VDD decoupling** | **0603** | **C14663** | **1** |
| **Cpb** | **10µF** | **MCP6004 VDD bulk cap** | **1206** | **C13585** | **1** |
| **Ca5** | **100nF** | **ADS1115 VDD decoupling** | **0603** | **C14663** | **1** |
| **J2** | **2-pin 2.54mm female header** | **Left Heel sensor (direct FlexiForce plug-in)** | **TH 2.54mm** | **C35165** | **1** |
| **J3** | **2-pin 2.54mm female header** | **Left Toe sensor (direct FlexiForce plug-in)** | **TH 2.54mm** | **C35165** | **1** |
| **J4** | **2-pin 2.54mm female header** | **Right Heel sensor (direct FlexiForce plug-in)** | **TH 2.54mm** | **C35165** | **1** |
| **J5** | **2-pin 2.54mm female header** | **Right Toe sensor (direct FlexiForce plug-in)** | **TH 2.54mm** | **C35165** | **1** |

### V2 BOM Summary

| Category | Component Count | Est. Cost |
|---|---|---|
| Retained from V1 | 21 components | ~$11 |
| New analog front-end | 18 components | ~$4 |
| **Total** | **39 components** | **~$15/board** |

PCB fabrication (5 boards, JLCPCB): ~$2–5 each

---

## PCB Layout Recommendations

### Analog Signal Routing (Critical)

1. **Keep op-amp output traces SHORT** — route MCP6004 outputs directly to ADS1115 inputs with minimal trace length (<10mm ideal).
2. **Star ground** — connect MCP6004 VSS, ADS1115 GND, and Vref divider GND to a common point on the ground plane near the analog section.
3. **Separate analog and digital ground regions** — ESP32 and CP2102N are digital; MCP6004 and ADS1115 are analog. Connect ground regions at a single point under the LDO.
4. **Vref trace** — route the Vref net from the divider to all 4 Rd resistors on the top layer, away from digital switching traces.
5. **Sensor connector placement** — J2–J5 along one or two board edges for easy cable routing to the balance board.

### Component Placement

```
50mm × 70mm Board (Top View)
┌──────────────────────────────────────┐
│  [USB-C]  [CP2102N]  [LED] [SW1][SW2]│  ← Digital section (top edge)
│                                      │
│         [ESP32-WROOM-32]             │  ← Center (keep BLE antenna
│         (large module)               │     clear of ground plane)
│                                      │
│  [MCP6004]  [ADS1115]               │  ← Analog section (bottom half)
│  [Rf1-4]    [Rd1-4]                 │
│  [Rvd1/2]   [Cvref]                 │
│                                      │
│  [J2]  [J3]  [J4]  [J5]            │  ← Sensor connectors (bottom edge)
└──────────────────────────────────────┘
```

### ESP32 Antenna Keep-Out

Same as V1: no copper (traces or ground plane) within 10mm of the ESP32 antenna end. Place the ESP32 module so the antenna overhangs the board edge or has a clear zone.

---

## Firmware Notes (V2)

The BLE data struct, service UUID, and characteristic UUID are **unchanged**. The web app requires no modifications.

### Key Firmware Changes

```cpp
// V2: Only ONE ADS1115 at 0x48, reading 4 op-amp outputs
Adafruit_ADS1115 ads;

void setup() {
  Wire.begin(21, 22);  // I2C SDA=GPIO21, SCL=GPIO22
  ads.begin(0x48, &Wire);
  ads.setGain(GAIN_ONE);  // +/-4.096V range for 0-3.3V op-amp output
  // ... BLE setup unchanged
}

void loop() {
  if (deviceConnected) {
    sensorData.left_heel  = ads.readADC_SingleEnded(0);  // Ch A output
    sensorData.left_ball  = 0;  // No ball sensor in 4-sensor config
    sensorData.left_toe   = ads.readADC_SingleEnded(1);  // Ch B output
    sensorData.right_heel = ads.readADC_SingleEnded(2);  // Ch C output
    sensorData.right_ball = 0;  // No ball sensor in 4-sensor config
    sensorData.right_toe  = ads.readADC_SingleEnded(3);  // Ch D output

    pCharacteristic->setValue((uint8_t*)&sensorData, sizeof(sensorData));
    pCharacteristic->notify();
    delay(20);  // 50Hz
  }
  // ... disconnect handling unchanged
}
```

### Calibration Procedure (Post-Assembly)

1. Power board with no load on sensors → record zero-offset reading per channel
2. Place known weight (e.g., 20kg plate) centered on each sensor → record loaded reading
3. Compute: `scale_factor = known_force_N / (loaded_reading - zero_reading)`
4. Store per-channel scale factors in ESP32 NVS (non-volatile storage) or hardcode in firmware
5. **Expected with Rf=10kΩ:** ~16 ADC counts per Newton (full range 0–2000N maps to 0–32,000 counts)

---

## Testing Checklist (V2)

### Power-On
- [ ] LED1 illuminates
- [ ] 3.3V rail measures 3.28–3.35V
- [ ] No excessive current draw (< 100mA with no BLE connection)

### Vref Verification
- [ ] Measure Vref node: should be 0.55–0.60V

### Op-Amp Verification (no sensors connected)
- [ ] MCP6004 pin 14 (VDD): 3.3V
- [ ] MCP6004 pin 4 (VSS): 0V
- [ ] Each op-amp output (pins 1, 7, 8, 13): ~0V (no sensor = no current = no output)

### ADC Verification
- [ ] I2C scanner finds 0x48
- [ ] With no sensors: all 4 channels read near 0
- [ ] With sensor pressed by hand: reading increases smoothly

### Sensor Verification
- [ ] Connect FlexiForce A301 to each connector
- [ ] Light finger press: small reading (100–500 counts)
- [ ] Full hand press: larger reading (5,000–15,000 counts)
- [ ] No saturation at full standing bodyweight (should read ~13,000 counts for 800N)

### BLE Verification
- [ ] Device advertises as "Rowing_Sensors"
- [ ] Web app connects and displays live force data
- [ ] All 4 channels respond independently
- [ ] 50Hz data rate confirmed

### Clinical Verification
- [ ] Bilateral stance: Left% ≈ Right% (±5%)
- [ ] Single-leg stance: loaded side reads ~800N (1x BW)
- [ ] Heel raise: peak reads >1,200N (>1.5x BW) — NO SATURATION
- [ ] Squat: peak reads >1,500N (>1.8x BW) — NO SATURATION

---

## Reference Datasheets

| Component | Datasheet |
|---|---|
| FlexiForce A301 | https://www.tekscan.com/products-solutions/force-sensors/flexiforce-a301-sensor |
| FlexiForce Integration Guide | https://www.tekscan.com/resources/user-manual/flexiforce-sensors-integration-guide |
| MCP6004 | https://ww1.microchip.com/downloads/en/DeviceDoc/MCP6001-1R-1U-2-4-1MHz-Low-Power-Op-Amp-DS20001733L.pdf |
| ADS1115 | https://www.ti.com/lit/ds/symlink/ads1115.pdf |
| ESP32-WROOM-32 | https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32_datasheet_en.pdf |
| CP2102N | https://www.silabs.com/documents/public/data-sheets/cp2102n-a01-datasheet.pdf |

---

## Sensor Purchase Information

| Item | Part Number | Qty | Unit Price | Source |
|---|---|---|---|---|
| FlexiForce A301-100 | 3718-A301-100-ND | 6 | $12.22 | [DigiKey](https://www.digikey.com/en/products/detail/tekscan/A301-100/14565594) |
| MCP6004-I/ST (SOIC-14) | C7378 | 2 | ~$0.50 | LCSC |
| 10kΩ 1% 0603 resistor | C25804 | 10 | ~$0.01 | LCSC |
| 47kΩ 1% 0603 resistor | C25819 | 2 | ~$0.01 | LCSC |

**Total sensor + conditioning cost: ~$75 for 6 sensors + all passives**

---

## Document Version

**V2.0** — April 2026
**Author:** Dean Arvan
**Changes from V1:** Complete analog front-end redesign. FSR-402 voltage dividers replaced with FlexiForce A301 op-amp conditioning. Dual ADS1115 reduced to single ADS1115. V1 A0/A1 routing defect eliminated.
