# Quick Reference Guide
## Rowing/Balance Board Rehabilitation Sensor PCB

---

## At-a-Glance Specifications

| Parameter | Value |
|-----------|-------|
| **Board Size** | 50mm × 70mm |
| **Layers** | 2 (top + bottom) |
| **Main Processor** | ESP32-WROOM-32 |
| **ADCs** | 2× ADS1115 (16-bit) |
| **Sensor Channels** | 6 (FSR inputs) |
| **Wireless** | BLE @ 50Hz sampling |
| **Power Input** | 5V USB-C |
| **Regulated Output** | 3.3V LDO |
| **Programming** | UART via CP2102N USB-to-UART bridge |

---

## Component Pinouts (Critical)

### ESP32-WROOM-32 (U3)
```
Pin  Name      Connection
1    GND       Ground plane
2    VCC       3.3V rail
3    RXD       UART input from CP2102N
4    EN        Reset button + 10kΩ pullup
27   GPIO0     BOOT button + 10kΩ pullup
21   GPIO21    I2C SDA (4.7kΩ pullup)
22   GPIO22    I2C SCL (4.7kΩ pullup)
```

### ADS1115 #1 @ 0x48 (U4 - Left Foot)
```
Pin  Name      Connection
1    VDD       3.3V
2    A0        Left Heel FSR (via R1 divider)
3    A1        Left Ball FSR (via R2 divider)
4    A2        Left Toe FSR (via R3 divider)
5    GND       Ground
6    SDA       I2C_SDA
7    SCL       I2C_SCL
8    ADDR      GND (sets address to 0x48)
```

### ADS1115 #2 @ 0x49 (U5 - Right Foot)
```
Pin  Name      Connection
1    VDD       3.3V
2    A0        Right Heel FSR (via R4 divider)
3    A1        Right Ball FSR (via R5 divider)
4    A2        Right Toe FSR (via R6 divider)
5    GND       Ground
6    SDA       I2C_SDA
7    SCL       I2C_SCL
8    ADDR      3.3V (sets address to 0x49)
```

### CP2102N (U2)
```
Pin  Name      Connection
1    VCC       3.3V (via 100nF cap)
3    D+        USB pin 7 (via 22Ω resistor)
4    D-        USB pin 3 (via 22Ω resistor)
5    TXD       ESP32 GPIO1 (via 1kΩ resistor)
6    RXD       ESP32 GPIO3 (via 1kΩ resistor)
10   REGIN     5V_USB (via 100nF cap)
```

---

## I2C Address Configuration

```
ADS1115 #1 (Left Foot):  0x48  ← ADDR pin tied to GND
ADS1115 #2 (Right Foot): 0x49  ← ADDR pin tied to 3.3V
```

## FSR Connector Pin Assignment

| Connector | Location | FSR Input | ADS Chip | ADS Channel |
|-----------|----------|-----------|----------|------------|
| J2 | Left Foot | Heel | 0x48 | A0 |
| J3 | Left Foot | Ball | 0x48 | A1 |
| J4 | Left Foot | Toe | 0x48 | A2 |
| J5 | Right Foot | Heel | 0x49 | A0 |
| J6 | Right Foot | Ball | 0x49 | A1 |
| J7 | Right Foot | Toe | 0x49 | A2 |

**Each JST-PH 2-pin connector:**
- Pin 1: GND
- Pin 2: Sensor signal (to ADS input via 10kΩ voltage divider)

---

## Voltage Rails

| Rail | Voltage | Source | Current |
|------|---------|--------|---------|
| 5V_USB | 5.0V | USB-C connector | Max 500mA |
| 3V3 | 3.3V | AMS1117 LDO | Max 1A (typically <300mA) |
| GND | 0V | Ground plane | Reference |

---

## Critical Pull-Up Resistors

| Signal | Value | Pulls To | Component | Notes |
|--------|-------|----------|-----------|-------|
| I2C_SDA | 4.7kΩ | 3V3 | R10 | Required for I2C bus |
| I2C_SCL | 4.7kΩ | 3V3 | R11 | Required for I2C bus |
| GPIO0 (BOOT) | 10kΩ | 3V3 | R12 | Boot button pin |
| EN (Reset) | 10kΩ | 3V3 | R13 | Reset button pin |

---

## Programming Instructions

### Step 1: Enter Bootloader Mode

1. **Hold BOOT button (SW1)** - don't release
2. **Press RESET button (SW2)** - briefly
3. **Release RESET button**
4. **Release BOOT button**

Board is now in bootloader mode (ready to accept firmware).

### Step 2: Flash Firmware

Using Arduino IDE:
1. Select board: **ESP32 Dev Module**
2. Select port: **CP2102N COM port**
3. Set baud rate: **921600**
4. Click **Upload**

### Step 3: Monitor Serial Output

Open Serial Monitor:
- Port: CP2102N COM port
- Baud rate: **115200**
- Should see startup messages

---

## Testing Procedures (In Order)

### 1. Power-On Test
```
Power Supply: 5V external (NOT USB initially)
Expected:
  - LED1 (red) illuminates
  - No smoke or unusual heat
  - 5V_USB measures ~5.0V
  - 3V3 measures ~3.3V
```

### 2. I2C Bus Test
```
Firmware: I2C Scanner
Expected Output:
  I2C device found at address 0x48
  I2C device found at address 0x49
```

### 3. ADC Test
```
Firmware: ADC Reader
With nothing connected: All channels read ~0
Jumper connector pin 2 to 3V3: Channel reads ~32767
Jumper connector pin 2 to GND: Channel reads ~0
```

### 4. Full System Test
```
Firmware: Complete firmware with BLE
Expected:
  - BLE device visible on phone app
  - All 6 channels streaming data
  - Sampling rate: 50Hz
  - Data responsive to pressure on sensors
```

---

## Troubleshooting Flowchart

```
PCB won't power on
├─→ Check USB cable (try different one)
├─→ Check 5V input with multimeter
├─→ Check for shorts: 5V_USB to GND (should be >100kΩ)
└─→ If shorted, inspect solder joints for bridges

Power on but USB not recognized
├─→ Install CP2102N drivers (Windows only)
├─→ Check D+/D- solder joints
├─→ Measure U2 VCC (should be 3.3V)
├─→ Try different USB cable
└─→ Inspect USB connector solder

USB recognized but I2C fails
├─→ Measure SDA voltage (should be 3.3V)
├─→ Measure SCL voltage (should be 3.3V)
├─→ Check R10, R11 are 4.7kΩ
├─→ Measure U4 VCC (should be 3.3V)
├─→ Measure U5 VCC (should be 3.3V)
└─→ Check ADDR pins: U4→GND, U5→3V3

I2C detected but ADC not responding
├─→ Check ADS IC solder joints for cold solder
├─→ Verify ADDR pin connections
├─→ Measure voltage on A0-A3 pins (0-3.3V range)
└─→ Try replacing ADS IC if available

Random crashes/resets
├─→ Check USB power quality (oscilloscope if available)
├─→ Verify 3V3 under load doesn't sag
├─→ Check C5, C6, C7 solder joints
├─→ Try different power source (powered hub vs computer)
└─→ Simplify firmware to isolate issue
```

---

## Bill of Materials (Abbreviated)

| Qty | Part | Value | LCSC Part # | Est. Cost |
|-----|------|-------|------------|-----------|
| 1 | U1 | AMS1117-3.3 | C6186 | $0.10 |
| 1 | U2 | CP2102N | C7520 | $0.80 |
| 1 | U3 | ESP32-WROOM-32 | C529143 | $8.50 |
| 2 | U4,U5 | ADS1115 | C21992 | $2.40 |
| 15 | R1-R15 | Various | Various | $0.15 |
| 11 | C1-C11 | 100nF/10µF | Various | $0.15 |
| 1 | LED1 | Red LED | C2286 | $0.05 |
| 2 | SW1,SW2 | 6×6mm Button | C318884 | $0.20 |
| 1 | J1 | USB-C | C165948 | $0.35 |
| 6 | J2-J7 | JST-PH 2-pin | C157436 | $0.60 |
| | | **TOTAL COMPONENTS** | | **~$13-15** |
| | | **PCB (5 units)** | | **~$2-5 each** |
| | | **Per Board Cost** | | **~$15-20** |

---

## Manufacturing Checklist

### Pre-Order
- [ ] All Gerber files generated
- [ ] DRC passed (no errors)
- [ ] Board dimensions verified: 50×70mm
- [ ] 3D preview reviewed
- [ ] BOM complete and parts available

### Ordering
- [ ] JLCPCB account created
- [ ] Gerber ZIP uploaded
- [ ] Options selected:
  - [ ] Qty: 5
  - [ ] 2 layers
  - [ ] HASL or ENIG finish
  - [ ] Lead-free if available
- [ ] Quote reviewed and acceptable
- [ ] Order placed

### Assembly
- [ ] Components received and sorted
- [ ] Soldering equipment ready
- [ ] ESD precautions in place
- [ ] Reflow oven or hot air station prepared
- [ ] Solder paste applied
- [ ] Components placed (follow sequence)
- [ ] Reflow cycle completed
- [ ] Board cooled completely
- [ ] Visual inspection passed
- [ ] Continuity testing passed

### Testing
- [ ] Power-on test: LED illuminates
- [ ] USB recognized: COM port visible
- [ ] I2C scanner: Finds 0x48 and 0x49
- [ ] ADC test: All channels respond
- [ ] UART test: Serial data readable
- [ ] BLE test: Device advertises
- [ ] Full system test: All 6 channels working

---

## Firmware Framework

### Arduino IDE Setup

```cpp
#include <Wire.h>
#include <Adafruit_ADS1X15.h>
#include <BLEDevice.h>
#include <BLEServer.h>

Adafruit_ADS1115 ads_left(0x48);   // Left foot
Adafruit_ADS1115 ads_right(0x49);  // Right foot

#define I2C_SDA 21
#define I2C_SCL 22
#define UART_RX 3
#define UART_TX 1

void setup() {
  Serial.begin(115200);
  Wire.begin(I2C_SDA, I2C_SCL);

  ads_left.begin();
  ads_right.begin();

  // BLE initialization here
  BLEDevice::init("Rowing_Sensor");
  // ... rest of BLE setup
}

void loop() {
  // Read left foot sensors (ADS1115 @ 0x48)
  int16_t left_heel = ads_left.readADC_SingleEnded(0);
  int16_t left_ball = ads_left.readADC_SingleEnded(1);
  int16_t left_toe = ads_left.readADC_SingleEnded(2);

  // Read right foot sensors (ADS1115 @ 0x49)
  int16_t right_heel = ads_right.readADC_SingleEnded(0);
  int16_t right_ball = ads_right.readADC_SingleEnded(1);
  int16_t right_toe = ads_right.readADC_SingleEnded(2);

  // Send via BLE at 50Hz (20ms interval)
  delay(20);
}
```

---

## Helpful Resources

### Component Datasheets
- **ESP32-WROOM-32:** https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32_datasheet_en.pdf
- **ADS1115:** https://www.ti.com/lit/ds/symlink/ads1115.pdf
- **CP2102N:** https://www.silabs.com/documents/public/data-sheets/cp2102n-a01-datasheet.pdf
- **AMS1117-3.3:** https://www.advanced-monolithic.com/pdf/noch/ams1117.pdf

### Development Tools
- **KiCad:** https://www.kicad.org/
- **JLCPCB:** https://www.jlcpcb.com/
- **LCSC:** https://www.lcsc.com/
- **Arduino IDE:** https://www.arduino.cc/en/software
- **ESP32 Arduino Core:** https://github.com/espressif/arduino-esp32

### Reference Examples
- **I2C Scanner:** https://github.com/espressif/arduino-esp32/blob/master/libraries/Wire/examples/i2c_scanner/i2c_scanner.ino
- **ADS1115 Library:** https://github.com/adafruit/Adafruit_ADS1X15
- **BLE Examples:** https://github.com/espressif/arduino-esp32/tree/master/libraries/BLE

---

## Contact & Support Info

**Design Document Version:** 1.0
**Last Updated:** March 2026
**For:** Rowing/Balance Board Rehabilitation Sensor PCB v1.0

**Document Includes:**
1. PCB_DESIGN.md - Complete 50-page design document
2. NETLIST.txt - Detailed electrical connections
3. BOM.csv - Component list with part numbers
4. MANUFACTURING_ASSEMBLY.md - Step-by-step assembly guide
5. rowing-sensor.kicad_sch - KiCad schematic template
6. QUICK_REFERENCE.md - This quick reference

All files ready for manufacturing with JLCPCB or PCBWay.

---
