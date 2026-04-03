/*
 * I2C Pin Finder for ESP32-S3 (Looping version)
 * Repeats scan every 10 seconds so you can't miss the output.
 */

#include <Wire.h>

int candidate_pins[] = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 38, 39, 40, 41, 42, 45, 46, 47, 48};
int num_pins = sizeof(candidate_pins) / sizeof(candidate_pins[0]);

void doScan() {
  Serial.println();
  Serial.println("=================================");
  Serial.println("  I2C PIN SCAN STARTING...");
  Serial.println("=================================");
  Serial.println();

  bool found_any = false;

  for (int i = 0; i < num_pins; i++) {
    for (int j = 0; j < num_pins; j++) {
      if (i == j) continue;

      int sda = candidate_pins[i];
      int scl = candidate_pins[j];

      Wire.begin(sda, scl);
      delay(30);

      bool has_48 = false;
      bool has_49 = false;

      Wire.beginTransmission(0x48);
      if (Wire.endTransmission() == 0) has_48 = true;

      Wire.beginTransmission(0x49);
      if (Wire.endTransmission() == 0) has_49 = true;

      Wire.end();

      if (has_48 || has_49) {
        Serial.printf(">>> HIT! SDA=GPIO%d, SCL=GPIO%d <<<\n", sda, scl);
        if (has_48) Serial.println("    0x48 (Left ADC) responding");
        if (has_49) Serial.println("    0x49 (Right ADC) responding");
        Serial.println();
        found_any = true;
      }
    }

    // Progress every few pins
    if (i % 7 == 0) {
      Serial.printf("  ...scanning (pin %d/%d)\n", i + 1, num_pins);
    }
  }

  if (!found_any) {
    Serial.println("NO ADS1115 FOUND on any pin pair.");
    Serial.println("Check: is 3.3V rail live? Are ADS chips soldered?");
  }

  Serial.println();
  Serial.println("Scan done. Will repeat in 10 seconds...");
  Serial.println();
}

void setup() {
  Serial.begin(115200);
  // Blink the LED so we know the board is alive even without serial
  // (most S3 dev boards don't have a user LED, but just in case)
  delay(2000);
  Serial.println("**** BOARD IS ALIVE ****");
}

void loop() {
  doScan();
  delay(10000);
}
