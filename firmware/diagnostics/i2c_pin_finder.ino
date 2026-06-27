/*
 * I2C Bus + Pin Finder for the BFS custom PCB (ESP32-S3-WROOM-1-N16R2)
 * -------------------------------------------------------------------
 * The freelancer never handed over the GPIO map, so this sweeps every
 * plausible S3 GPIO pair looking for the two devices we expect:
 *
 *     0x48  ADS1115   (force ADC, ADDR -> GND)
 *     0x28  BNO055    (IMU, COM3/ADR -> GND)
 *
 * When a pin pair ACKs either chip it locks on and runs a full
 * 0x03-0x77 bus scan, so you see EVERYTHING soldered and talking --
 * including a chip sitting at the WRONG address (a mis-strapped ADDR
 * pin shows up as an "unexpected device"). Repeats every 8s.
 *
 * Expected good result:
 *     >>> I2C BUS FOUND: SDA=GPIOxx  SCL=GPIOyy <<<
 *       0x28  BNO055 (IMU)
 *       0x48  ADS1115 (force)
 *
 * Serial @ 115200. NOTE: this board has no UART bridge -- flash with
 * "USB CDC On Boot: Enabled" or Serial output goes nowhere.
 */

#include <Wire.h>

// S3 GPIOs safe to probe. Deliberately excluded:
//   19/20  = native USB D-/D+ (probing them kills our serial link)
//   26-37  = internal flash / PSRAM
//   0/3/45/46 = boot strapping pins
int candidate_pins[] = {1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
                        15, 16, 17, 18, 21, 38, 39, 40, 41, 42, 47, 48};
const int num_pins = sizeof(candidate_pins) / sizeof(candidate_pins[0]);

struct Target { uint8_t addr; const char* name; };
Target targets[] = {
  { 0x28, "BNO055 (IMU)" },
  { 0x48, "ADS1115 (force)" },
};
const int num_targets = sizeof(targets) / sizeof(targets[0]);

bool probe(uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}

void fullBusScan() {
  int n = 0;
  for (uint8_t a = 0x03; a <= 0x77; a++) {
    if (probe(a)) {
      const char* label = "(unexpected device!)";
      for (int t = 0; t < num_targets; t++)
        if (targets[t].addr == a) label = targets[t].name;
      Serial.printf("      0x%02X  %s\n", a, label);
      n++;
    }
  }
  if (n == 0) Serial.println("      (nothing ACKed on this pair)");
  for (int t = 0; t < num_targets; t++) {
    if (!probe(targets[t].addr))
      Serial.printf("      MISSING: 0x%02X %s -- check solder/power\n",
                    targets[t].addr, targets[t].name);
  }
}

void doScan() {
  Serial.println("\n========== I2C SWEEP ==========");
  bool found = false;

  for (int i = 0; i < num_pins && !found; i++) {
    for (int j = 0; j < num_pins && !found; j++) {
      if (i == j) continue;
      int sda = candidate_pins[i];
      int scl = candidate_pins[j];

      Wire.begin(sda, scl);
      delay(20);

      for (int t = 0; t < num_targets; t++) {
        if (probe(targets[t].addr)) {
          Serial.printf("\n>>> I2C BUS FOUND: SDA=GPIO%d  SCL=GPIO%d <<<\n",
                        sda, scl);
          Serial.printf("    (locked on after %s ACKed)\n", targets[t].name);
          fullBusScan();
          found = true;
          break;
        }
      }
      Wire.end();
    }
  }

  if (!found) {
    Serial.println("NO I2C DEVICES on any pin pair. Check:");
    Serial.println("  - 3.3V rail live at the ADS1115 / BNO055 VDD pins?");
    Serial.println("  - Both chips actually soldered (reflow under the LGA)?");
    Serial.println("  - I2C pull-ups R21/R22 (4.7k) populated?");
  }
  Serial.println("Repeating in 8s...");
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\n**** BFS BOARD ALIVE -- hunting for I2C bus ****");
}

void loop() {
  doScan();
  delay(8000);
}
