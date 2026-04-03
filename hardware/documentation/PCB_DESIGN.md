# Rowing/Balance Board Rehabilitation Sensor PCB Design Document

**Project:** Rowing Balance Board Rehabilitation Sensor
**Date:** March 2026
**Target Board Size:** 50mm × 70mm (approximately credit card size)
**Manufacturing:** JLCPCB / PCBWay compatible

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Design Specifications](#design-specifications)
3. [Schematic Design](#schematic-design)
4. [Component-by-Component Wiring Guide](#component-by-component-wiring-guide)
5. [Bill of Materials (BOM)](#bill-of-materials-bom)
6. [PCB Layout Recommendations](#pcb-layout-recommendations)
7. [Manufacturing Notes](#manufacturing-notes)
8. [Assembly Instructions](#assembly-instructions)
9. [Testing Checklist](#testing-checklist)

---

## System Overview

This PCB consolidates a working breadboard prototype of a rehabilitation sensor system that monitors pressure distribution across a rowing/balance board using six Force Sensing Resistors (FSRs). The system uses Bluetooth Low Energy (BLE) to transmit sensor data at 50 Hz sampling rate.

### Key Features

- **Microcontroller:** ESP32-WROOM-32 (raw module, not dev board)
- **Analog Input:** 2× ADS1115 16-bit ADCs for 6 FSR sensors
- **Wireless:** BLE via ESP32
- **Programming:** USB-C with integrated CP2102N USB-to-UART bridge
- **Power:** 5V USB input → 3.3V LDO regulator
- **Future:** Battery connector for standalone operation
- **Sampling Rate:** 50 Hz per channel

### Block Diagram

```
┌─────────────┐
│  USB-C 5V   │
└──────┬──────┘
       │
       ├─ CP2102N UART Bridge
       │  (TX → ESP32 GPIO1, RX ← ESP32 GPIO3)
       │
       ├─ 3.3V LDO (AMS1117)
       │
       ├─ ESP32-WROOM-32
       │  ├─ I2C (SDA=GPIO21, SCL=GPIO22)
       │  ├─ GPIO0 (BOOT button for programming)
       │  ├─ EN (Reset button)
       │  └─ GND
       │
       ├─ ADS1115 @ 0x48 (Left Foot)
       │  ├─ A0 → Left Heel FSR
       │  ├─ A1 → Left Ball FSR
       │  ├─ A2 → Left Toe FSR
       │  └─ I2C bus
       │
       └─ ADS1115 @ 0x49 (Right Foot)
          ├─ A0 → Right Heel FSR
          ├─ A1 → Right Ball FSR
          ├─ A2 → Right Toe FSR
          └─ I2C bus
```

---

## Design Specifications

### Electrical Specifications

| Parameter | Value | Notes |
|-----------|-------|-------|
| Input Voltage | 5V USB | Via USB-C connector |
| Regulated Voltage | 3.3V | AMS1117-3.3 LDO, 1A capability |
| I2C Bus Voltage | 3.3V | Pull-up to 3.3V |
| I2C Clock Speed | 400 kHz | Standard fast mode |
| ADC Resolution | 16-bit | ADS1115 |
| ADC Sampling Rate | 50 Hz | Per channel |
| Maximum Current (3.3V) | ~500mA | ESP32 + ADS chips + peripherals |

### Physical Specifications

| Parameter | Value |
|-----------|-------|
| PCB Size | 50mm × 70mm |
| Layer Count | 2 layers |
| Via Size | 0.3mm diameter (standard) |
| Trace Width | ≥0.25mm (signal), ≥0.5mm (power) |
| Copper Finish | HASL or Lead-free HASL |
| Soldermask | Green or red (any color) |
| Silkscreen | White |

### Temperature & Environment

- Operating Temperature: 0°C to 50°C
- Storage Temperature: -20°C to 85°C
- Humidity: Non-condensing
- Coating: Optional conformal coating for durability

---

## Schematic Design

### Netlist Format (Detailed Connections)

#### Power Distribution Network

```
Power Rails:
- 5V_USB (from USB-C VCC)
- 3V3 (from AMS1117 LDO output)
- GND (all grounds tied together)

Decoupling Capacitors:
- C1: 100nF (0603) from 5V_USB to GND (near USB connector)
- C2: 10µF (1206) from 5V_USB to GND (bulk, near USB connector)
- C3: 100nF (0603) from 3V3 to GND (near LDO output, close to LDO pin)
- C4: 100nF (0603) from 3V3 to GND (near ESP32)
- C5: 100nF (0603) from 3V3 to GND (near ADS1115 #1)
- C6: 100nF (0603) from 3V3 to GND (near ADS1115 #2)
- C7: 10µF (1206) bulk capacitor, 3V3 to GND
```

#### USB Power Input & UART Bridge

```
USB-C Connector (USB_CONN):
- Pin 1: GND → GND plane
- Pin 2: CC1 (not used)
- Pin 3: D- → CP2102N D-
- Pin 4: SBU1 (not used)
- Pin 5: VBUS → 5V_USB (with 100nF+10µF caps nearby)
- Pin 6: SBU2 (not used)
- Pin 7: D+ → CP2102N D+
- Pin 8: CC2 (not used)
- Pin 9: GND → GND plane

CP2102N USB-to-UART Bridge (U2):
- VCC (pin 1) → 3.3V (via 100nF capacitor)
- GND (pin 2) → GND plane
- D+ (pin 3) → USB-C D+ (via 22Ω series resistor)
- D- (pin 4) → USB-C D- (via 22Ω series resistor)
- TXD (pin 5) → ESP32 GPIO3 (RXD input)
- RXD (pin 6) → ESP32 GPIO1 (TXD output)
- RST (pin 7) → 3.3V (via 100nF to GND, with manual reset to GND for programming)
- CTS (pin 8) → 3.3V (via pull-up resistor)
- RTS (pin 9) → GND or no-connect
- REGIN (pin 10) → 5V_USB (with series 100nF cap)
- Integrated pull-up resistors on D+/D- (no additional pull-ups needed)
```

#### Voltage Regulation

```
AMS1117-3.3 LDO Regulator (U1):
- IN (pin 3) → 5V_USB (with upstream filtering caps)
- OUT (pin 2) → 3V3 rail (to all 3.3V consumers)
- GND (pin 1) → GND plane
- Capacitors:
  - 10µF (1206) from IN to GND (input bulk cap)
  - 100nF (0603) from IN to GND (input filter)
  - 10µF (1206) from OUT to GND (output bulk cap)
  - 100nF (0603) from OUT to GND (output filter, very close to pin)
```

#### ESP32-WROOM-32 Module (U3)

```
Pin Assignments (standard ESP32 module pinout):

Power:
- VCC (pins 1, 2) → 3V3 rail (with 100nF cap to GND)
- GND (pins 15, 16, 17, 18, 19, 34) → GND plane

I2C Bus:
- GPIO21 (SDA) → I2C_SDA (with 4.7kΩ pull-up to 3.3V)
- GPIO22 (SCL) → I2C_SCL (with 4.7kΩ pull-up to 3.3V)

UART (for programming via CP2102N):
- GPIO1 (TXD) → CP2102N RXD via 1kΩ series resistor
- GPIO3 (RXD) → CP2102N TXD via 1kΩ series resistor

Programming Control:
- GPIO0 (BOOT) → BOOT button to GND, with 10kΩ pull-up to 3.3V
- EN (Reset) → RESET button to GND, with 10kΩ pull-up to 3.3V

Unused Pins:
- All other GPIO pins left unconnected or tied via 100kΩ pull-up/down as needed
- TX/RX should not be used simultaneously with GPIO1/GPIO3
```

#### I2C Pull-Up Resistors

```
I2C_SDA Line:
- 4.7kΩ resistor from SDA to 3V3 (R9)
- Connected to: ESP32 GPIO21 + ADS1115 #1 SDA + ADS1115 #2 SDA

I2C_SCL Line:
- 4.7kΩ resistor from SCL to 3V3 (R10)
- Connected to: ESP32 GPIO22 + ADS1115 #1 SCL + ADS1115 #2 SCL
```

#### ADS1115 ADC #1 (Left Foot) @ I2C Address 0x48 (U4)

```
Pin Assignments (MSOP-10 package):

Power:
- VDD (pin 1) → 3V3 rail
- GND (pin 5) → GND plane
- DECAP (pin 10) → 100nF cap to GND

I2C Bus:
- SDA (pin 6) → I2C_SDA (shared with ESP32 and ADS1115 #2)
- SCL (pin 7) → I2C_SCL (shared with ESP32 and ADS1115 #2)

Address Configuration:
- ADDR (pin 8) → GND (sets I2C address to 0x48)

Analog Inputs (0-3V3 range):
- A0 (pin 2) → Left Heel FSR voltage divider output (via connector J2)
- A1 (pin 3) → Left Ball FSR voltage divider output (via connector J3)
- A2 (pin 4) → Left Toe FSR voltage divider output (via connector J4)
- A3 (pin 9) → GND (unused, tie to GND)

Reference Voltage:
- REFIN (pin 9) → GND (internal reference used)
```

#### ADS1115 ADC #2 (Right Foot) @ I2C Address 0x49 (U5)

```
Pin Assignments (MSOP-10 package):

Power:
- VDD (pin 1) → 3V3 rail
- GND (pin 5) → GND plane
- DECAP (pin 10) → 100nF cap to GND

I2C Bus:
- SDA (pin 6) → I2C_SDA (shared with ESP32 and ADS1115 #1)
- SCL (pin 7) → I2C_SCL (shared with ESP32 and ADS1115 #1)

Address Configuration:
- ADDR (pin 8) → 3V3 (sets I2C address to 0x49)

Analog Inputs (0-3V3 range):
- A0 (pin 2) → Right Heel FSR voltage divider output (via connector J5)
- A1 (pin 3) → Right Ball FSR voltage divider output (via connector J6)
- A2 (pin 4) → Right Toe FSR voltage divider output (via connector J7)
- A3 (pin 9) → GND (unused, tie to GND)

Reference Voltage:
- REFIN (pin 9) → GND (internal reference used)
```

#### Voltage Dividers for FSR Sensors

```
For each of 6 FSR inputs (Left Heel, Left Ball, Left Toe, Right Heel, Right Ball, Right Toe):

Voltage Divider Circuit:
- 3V3 → 10kΩ reference resistor (R_ref) → ADC input → FSR → GND

Component Details:
- Reference resistor: 10kΩ (0603 or 0805) at each divider
- FSR sensors: Externally connected via JST-PH 2-pin connectors
- One FSR pin → GND, other FSR pin → ADC input (between reference resistor and FSR)
- Capacitor (optional, for noise filtering): 100nF from ADC input to GND

Voltage Divider Schematic (per channel):
         3V3
          │
        R_ref (10kΩ)
          │
  ─────────┬────── ADC_input (to ADS1115 channel)
           │
         FSR (from JST connector)
           │
          GND

Resistor Assignments:
- R1: Left Heel voltage divider (10kΩ, 0603)
- R2: Left Ball voltage divider (10kΩ, 0603)
- R3: Left Toe voltage divider (10kΩ, 0603)
- R4: Right Heel voltage divider (10kΩ, 0603)
- R5: Right Ball voltage divider (10kΩ, 0603)
- R6: Right Toe voltage divider (10kΩ, 0603)
```

#### FSR Sensor Connectors (JST-PH 2-pin)

```
J2: Left Heel FSR
- Pin 1 → GND
- Pin 2 → ADS1115 #1 A0 (via R1 voltage divider)

J3: Left Ball FSR
- Pin 1 → GND
- Pin 2 → ADS1115 #1 A1 (via R2 voltage divider)

J4: Left Toe FSR
- Pin 1 → GND
- Pin 2 → ADS1115 #1 A2 (via R3 voltage divider)

J5: Right Heel FSR
- Pin 1 → GND
- Pin 2 → ADS1115 #2 A0 (via R4 voltage divider)

J6: Right Ball FSR
- Pin 1 → GND
- Pin 2 → ADS1115 #2 A1 (via R5 voltage divider)

J7: Right Toe FSR
- Pin 1 → GND
- Pin 2 → ADS1115 #2 A2 (via R6 voltage divider)
```

#### Power Indicator LED

```
Power LED (LED1):
- Configuration: Red LED with 1kΩ current-limiting resistor
- Anode (+) → 3V3 via 1kΩ resistor (R11)
- Cathode (-) → GND
- Purpose: Visual indicator that 3.3V rail is powered
- Current: ~3mA at 3V3 with 1kΩ resistor
```

#### Programming Buttons

```
BOOT Button (SW1):
- Function: Puts ESP32 into bootloader mode for UART programming
- Connection: GPIO0 to GND
- Pull-up: 10kΩ resistor from GPIO0 to 3V3
- Sequence: Hold BOOT, then press RESET, release RESET, release BOOT
- Footprint: 6×6mm SMD tactile switch (standard)

RESET Button (SW2):
- Function: Resets the ESP32 and restarts the application
- Connection: EN pin to GND
- Pull-up: 10kΩ resistor from EN to 3V3
- Hold time: Brief press for normal reset
- Footprint: 6×6mm SMD tactile switch (standard)
```

#### Battery Connector (Optional Future Use)

```
Battery Connector (J8) - JST-PH 2-pin:
- Pin 1: GND (black wire convention)
- Pin 2: VBAT (red wire convention, max 4.2V for LiPo)
- NOT POPULATED in initial design
- When populated: Add diode and charging circuit (future iteration)
- Current design uses USB power only
```

#### Test Points (Optional but Recommended)

```
TP1: 5V_USB (for power verification)
TP2: 3V3 (for power verification)
TP3: GND (reference)
TP4: I2C_SDA (for debugging)
TP5: I2C_SCL (for debugging)
```

---

## Component-by-Component Wiring Guide

### U1: AMS1117-3.3 Voltage Regulator

**Part:** AMS1117-3.3 SOT-223 package

| Pin | Name | Connection | Notes |
|-----|------|-----------|-------|
| 1 | GND | Ground plane | Thermal pad should be soldered |
| 2 | VOUT | 3V3 rail | Via 100nF + 10µF output caps |
| 3 | VIN | 5V_USB input | Via 100nF + 10µF input caps |
| 4 | ADJ | Not used | Leave floating for fixed 3.3V output |

**Capacitor Requirements:**
- Input: 100nF (0603) + 10µF (1206) in parallel
- Output: 100nF (0603) + 10µF (1206) in parallel
- Place output 100nF cap as close as possible to pin 2

### U2: CP2102N USB-to-UART Bridge

**Part:** CP2102N QFN-28 package

| Pin | Name | Connection | Purpose |
|-----|------|-----------|---------|
| 1 | VCC | 3V3 via 100nF cap | IC power supply |
| 2 | GND | Ground plane | IC ground |
| 3 | D+ | USB connector pin 7 via 22Ω | USB D+ signal line |
| 4 | D- | USB connector pin 3 via 22Ω | USB D- signal line |
| 5 | TXD | ESP32 GPIO3 via 1kΩ | UART TX to ESP32 RX |
| 6 | RXD | ESP32 GPIO1 via 1kΩ | UART RX from ESP32 TX |
| 7 | RST | 3V3 via 100nF to GND | Reset control (high = normal op) |
| 8 | CTS | 3V3 pull-up via 10kΩ | Clear-to-Send (can tie to VCC) |
| 9 | RTS | GND or no-connect | Request-to-Send |
| 10 | REGIN | 5V_USB via 100nF to GND | Integrated regulator input |
| Remaining pins | Substrate/Thermal | GND plane | Ground connection |

**Key Notes:**
- CP2102N includes integrated voltage regulator, no external reg needed for this chip
- USB pull-up resistors are integrated (do not add external)
- Series resistors on D+/D- are 22Ω (standard for USB)
- TXD/RXD can use 1kΩ or direct connection (1kΩ recommended for EMI)

### U3: ESP32-WROOM-32 Module

**Part:** ESP32-WROOM-32 with antenna, 38-pin module

| Pin | Name | Connection | Purpose |
|-----|------|-----------|---------|
| 1 | GND | Ground plane | Ground |
| 2-3 | VCC/3V3 | 3V3 rail via 100nF cap | Power supply (1A capable regulator on module) |
| 4 | EN | Reset button → GND via SW2, pull-up 10kΩ to 3V3 | Reset/enable pin |
| 5 | GPIO34 | Unused or pull-down | Not used in this design |
| 6 | GPIO35 | Unused or pull-down | Not used in this design |
| 7 | GPIO32 | Unused or pull-down | Not used in this design |
| 8 | GPIO33 | Unused or pull-down | Not used in this design |
| 9 | GPIO25 | Unused or pull-down | Not used in this design |
| 10 | GPIO26 | Unused or pull-down | Not used in this design |
| 11 | GPIO27 | Unused or pull-down | Not used in this design |
| 12 | GPIO14 | Unused or pull-down | Not used in this design |
| 13 | GPIO12 | Unused or pull-down | Not used in this design |
| 14 | GPIO13 | Unused or pull-down | Not used in this design |
| 15 | GND | Ground plane | Ground |
| 16 | GPIO9 | No-connect (SPICS) | Used internally for flash |
| 17 | GPIO10 | No-connect (SPIWP) | Used internally for flash |
| 18 | GPIO11 | No-connect (SPID) | Used internally for flash |
| 19 | GPIO6 | No-connect (SPICLK) | Used internally for flash |
| 20 | GPIO7 | No-connect (SPIQ) | Used internally for flash |
| 21 | GPIO8 | No-connect (SPICS1) | Used internally for flash |
| 22 | GND | Ground plane | Ground |
| 23 | GPIO5 | Unused or pull-down | Not used in this design |
| 24 | GPIO17 | Unused | Strapped low in module |
| 25 | GPIO16 | Unused or pull-down | Not used in this design |
| 26 | GPIO4 | Unused or pull-down | Not used in this design |
| 27 | GPIO0 | BOOT button → GND via SW1, pull-up 10kΩ to 3V3 | Boot pin for programming |
| 28 | GPIO2 | Unused or pull-down | Can be used for future features |
| 29 | GPIO15 | Unused or pull-down | Strapped externally or internally |
| 30 | GPIO13 | Duplicate? | Check pinout carefully |
| 31 | GPIO12 | See pin 13 | |
| 32 | GND | Ground plane | Ground |
| 33 | GPIO21 | I2C_SDA, pull-up 4.7kΩ | SDA for I2C bus |
| 34 | GPIO22 | I2C_SCL, pull-up 4.7kΩ | SCL for I2C bus |
| 35 | GPIO19 | Unused or pull-down | Not used |
| 36 | GPIO23 | Unused or pull-down | Not used |
| 37 | GPIO18 | Unused or pull-down | Not used |
| 38 | GND | Ground plane | Ground |

**Critical Connections:**
- All GND pins must be soldered to ground plane
- VCC pins need 100nF cap directly to GND
- GPIO0 must be pulled high via 10kΩ for normal operation (release for bootloader)
- EN pin must be pulled high via 10kΩ for normal operation
- Antenna area should be kept clear of traces

### U4: ADS1115 ADC #1 (Left Foot)

**Part:** ADS1115 MSOP-10 package, 16-bit I2C ADC

| Pin | Name | Connection | Purpose |
|-----|------|-----------|---------|
| 1 | VDD | 3V3 | Power supply |
| 2 | A0 | Left Heel FSR input (via R1 divider) | Analog input 0 |
| 3 | A1 | Left Ball FSR input (via R2 divider) | Analog input 1 |
| 4 | A2 | Left Toe FSR input (via R3 divider) | Analog input 2 |
| 5 | GND | Ground plane | Ground |
| 6 | SDA | I2C_SDA (shared with ESP32, ADS1115 #2) | I2C data line |
| 7 | SCL | I2C_SCL (shared with ESP32, ADS1115 #2) | I2C clock line |
| 8 | ADDR | GND | Address pin (sets I2C addr to 0x48 when low) |
| 9 | A3 | GND | Unused analog input |
| 10 | DECAP | 100nF cap to GND | Decoupling capacitor connection |

**Address Configuration:**
- ADDR tied to GND → I2C address = 0x48

### U5: ADS1115 ADC #2 (Right Foot)

**Part:** ADS1115 MSOP-10 package, 16-bit I2C ADC

| Pin | Name | Connection | Purpose |
|-----|------|-----------|---------|
| 1 | VDD | 3V3 | Power supply |
| 2 | A0 | Right Heel FSR input (via R4 divider) | Analog input 0 |
| 3 | A1 | Right Ball FSR input (via R5 divider) | Analog input 1 |
| 4 | A2 | Right Toe FSR input (via R6 divider) | Analog input 2 |
| 5 | GND | Ground plane | Ground |
| 6 | SDA | I2C_SDA (shared with ESP32, ADS1115 #1) | I2C data line |
| 7 | SCL | I2C_SCL (shared with ESP32, ADS1115 #1) | I2C clock line |
| 8 | ADDR | 3V3 | Address pin (sets I2C addr to 0x49 when high) |
| 9 | A3 | GND | Unused analog input |
| 10 | DECAP | 100nF cap to GND | Decoupling capacitor connection |

**Address Configuration:**
- ADDR tied to 3V3 → I2C address = 0x49

### Resistors Summary

| Ref | Value | Package | Purpose |
|-----|-------|---------|---------|
| R1 | 10kΩ | 0603 | Left Heel FSR voltage divider |
| R2 | 10kΩ | 0603 | Left Ball FSR voltage divider |
| R3 | 10kΩ | 0603 | Left Toe FSR voltage divider |
| R4 | 10kΩ | 0603 | Right Heel FSR voltage divider |
| R5 | 10kΩ | 0603 | Right Ball FSR voltage divider |
| R6 | 10kΩ | 0603 | Right Toe FSR voltage divider |
| R7 | 1kΩ | 0603 | LED1 current limiting (red LED ~3mA) |
| R8 | 1kΩ | 0603 | GPIO1/TXD series resistor (CP2102N) |
| R9 | 1kΩ | 0603 | GPIO3/RXD series resistor (CP2102N) |
| R10 | 4.7kΩ | 0603 | I2C_SDA pull-up |
| R11 | 4.7kΩ | 0603 | I2C_SCL pull-up |
| R12 | 10kΩ | 0603 | GPIO0 pull-up (BOOT button) |
| R13 | 10kΩ | 0603 | EN pull-up (RESET button) |

### Capacitors Summary

| Ref | Value | Package | Purpose |
|-----|-------|---------|---------|
| C1 | 100nF | 0603 | USB 5V input filter |
| C2 | 10µF | 1206 | USB 5V input bulk |
| C3 | 100nF | 0603 | LDO output filter |
| C4 | 10µF | 1206 | LDO output bulk |
| C5 | 100nF | 0603 | ESP32 decoupling |
| C6 | 100nF | 0603 | ADS1115 #1 decoupling |
| C7 | 100nF | 0603 | ADS1115 #2 decoupling |
| C8 | 100nF | 0603 | CP2102N VCC filter |
| C9 | 100nF | 0603 | CP2102N REGIN filter |
| C10 | 100nF | 0603 | BOOT button debounce (optional) |
| C11 | 100nF | 0603 | RESET button debounce (optional) |

### LED

| Ref | Type | Color | Package | Purpose |
|-----|------|-------|---------|---------|
| LED1 | Standard LED | Red | 0603 SMD | Power indicator (3.3V online) |

### Switches

| Ref | Type | Footprint | Purpose |
|-----|------|-----------|---------|
| SW1 | 6×6mm SMD tactile | 6×6mm | BOOT button (GPIO0 to GND) |
| SW2 | 6×6mm SMD tactile | 6×6mm | RESET button (EN to GND) |

### Connectors

| Ref | Type | Pins | Purpose | Notes |
|-----|------|------|---------|-------|
| J1 | USB-C | 24-pin SMD | USB power & programming | Mid-mount USB-C recommended |
| J2 | JST-PH | 2-pin | Left Heel FSR | GND & sensor input |
| J3 | JST-PH | 2-pin | Left Ball FSR | GND & sensor input |
| J4 | JST-PH | 2-pin | Left Toe FSR | GND & sensor input |
| J5 | JST-PH | 2-pin | Right Heel FSR | GND & sensor input |
| J6 | JST-PH | 2-pin | Right Ball FSR | GND & sensor input |
| J7 | JST-PH | 2-pin | Right Toe FSR | GND & sensor input |
| J8 | JST-PH | 2-pin | Battery (future) | Not populated initially |

---

## Bill of Materials (BOM)

### Complete BOM with Part Numbers

**Total Estimated Cost:** ~$25-35 per board (in low quantities from JLCPCB/LCSC)

#### ICs & Modules

| Part # | Reference | Description | Qty | Package | LCSC P/N | JLCPCB P/N | Est. Price |
|--------|-----------|-------------|-----|---------|----------|-----------|-----------|
| 1 | U1 | AMS1117-3.3 Voltage Regulator | 1 | SOT-223 | C6186 | C6186 | $0.10 |
| 2 | U2 | CP2102N USB-to-UART Bridge | 1 | QFN-28 | C7520 | C7520 | $0.80 |
| 3 | U3 | ESP32-WROOM-32 Module | 1 | 38-pin module | C529143 | C529143 | $8.50 |
| 4 | U4 | ADS1115 16-bit ADC | 1 | MSOP-10 | C21992 | C21992 | $1.20 |
| 5 | U5 | ADS1115 16-bit ADC | 1 | MSOP-10 | C21992 | C21992 | $1.20 |

#### Resistors (0603 package)

| Part # | Reference | Value | Qty | Package | LCSC P/N | Est. Price |
|--------|-----------|-------|-----|---------|----------|-----------|
| 6-11 | R1-R6 | 10kΩ ±5% | 6 | 0603 | C14663 | $0.01 |
| 12 | R7 | 1kΩ ±5% | 1 | 0603 | C14663 | $0.01 |
| 13 | R8 | 1kΩ ±5% | 1 | 0603 | C14663 | $0.01 |
| 14 | R9 | 1kΩ ±5% | 1 | 0603 | C14663 | $0.01 |
| 15 | R10 | 4.7kΩ ±5% | 1 | 0603 | C14631 | $0.01 |
| 16 | R11 | 4.7kΩ ±5% | 1 | 0603 | C14631 | $0.01 |
| 17 | R12 | 10kΩ ±5% | 1 | 0603 | C14663 | $0.01 |
| 18 | R13 | 10kΩ ±5% | 1 | 0603 | C14663 | $0.01 |

#### Capacitors

| Part # | Reference | Value | Qty | Package | LCSC P/N | Est. Price |
|--------|-----------|-------|-----|---------|----------|-----------|
| 19-28 | C1, C3, C5-C9, C10-C11 | 100nF ±10% X7R | 10 | 0603 | C14663 | $0.01 |
| 29-31 | C2, C4, C7 | 10µF ±20% | 3 | 1206 | C13585 | $0.05 |

#### LEDs & Switches

| Part # | Reference | Description | Qty | Package | LCSC P/N | Est. Price |
|--------|-----------|-------------|-----|---------|----------|-----------|
| 32 | LED1 | Red LED 0603 | 1 | 0603 | C2286 | $0.05 |
| 33 | SW1 | 6×6mm SMD Tactile Button | 1 | 6×6×7mm | C318884 | $0.10 |
| 34 | SW2 | 6×6mm SMD Tactile Button | 1 | 6×6×7mm | C318884 | $0.10 |

#### Connectors

| Part # | Reference | Description | Qty | Package | LCSC P/N | Est. Price |
|--------|-----------|-------------|-----|---------|----------|-----------|
| 35 | J1 | USB-C Connector 24-pin | 1 | Mid-mount SMD | C165948 | $0.35 |
| 36 | J2-J7 | JST-PH 2-pin Connector (SMD) | 6 | 2.0mm pitch | C157436 | $0.10 |
| 37 | J8 | JST-PH 2-pin Connector (SMD) | 1 | 2.0mm pitch | C157436 | $0.10 |

#### Miscellaneous

| Item | Qty | Notes | Est. Price |
|------|-----|-------|-----------|
| PCB (2 layer, 50×70mm) | 1 | JLCPCB standard options | $2-5 |
| Solder paste (lead-free) | 1 | For reflow or hand soldering | Included |
| M.2 Gold fingers (optional) | 0 | Not needed for this design | N/A |

#### Assembly Hardware

| Item | Qty | Notes |
|------|-----|-------|
| Standoff screws (M2) | 4 | Optional for case mounting |
| Aluminum spacers | 4 | Optional for thermal management |

### Design for Manufacturability Notes

1. **LCSC/JLCPCB Compatibility:**
   - All parts selected are available from LCSC for low MOQ
   - Standard packages: SMD 0603, 0805, 1206, QFN-28, MSOP-10, SOT-223
   - JLCPCB can offer 3D/2D assembly with 50% surcharge if parts are in basic library

2. **Part Sourcing Strategy:**
   - Order PCB from JLCPCB or PCBWay (can do PCBA if parts in stock)
   - Alternative: Order bare board + solder all components manually
   - Manual assembly recommended for prototyping (reflow oven or hot air station required)

3. **Alternative Parts (if LCSC out of stock):**
   - AMS1117-3.3 → SGM1117-3.3 (pin compatible, similar price)
   - CP2102N → CH340C (same functionality, pin compatible)
   - ADS1115 → ADS1015 (if lower resolution acceptable)
   - Standard 0603/0805 resistors/capacitors are commodity items

---

## PCB Layout Recommendations

### Layer Stack-up (2 layers)

**Layer 1 (Top):** Signals + components
**Layer 2 (Bottom):** Ground plane with signal routing

### Component Placement Strategy

```
Board dimensions: 50mm × 70mm
Mounting orientation: USB-C connector at one end

Recommended placement (top-down view):

┌──────────────────────────────────────────┐
│  USB-C (J1)  [mounted vertically]        │
│  at board edge, mid-mount connector      │
│                                          │
│  BOOT (SW1)   RESET (SW2)   [right]      │
│  buttons on side edge, easy access       │
│                                          │
│  ┌─ LDO (U1)        LED1 (red)           │
│  │                                      │
│  │  ESP32 (U3) [center, large]          │
│  │                                      │
│  ├─ ADS1115 #1 (U4)  ADS1115 #2 (U5)    │
│  │  (left foot)      (right foot)       │
│  │                                      │
│  └─ CP2102N (U2)   [near USB]           │
│                                          │
│  FSR connectors (J2-J7) on left/bottom   │
│  Battery connector (J8) on right edge    │
│                                          │
└──────────────────────────────────────────┘
```

### Detailed Placement Guidelines

#### Power Distribution (U1 - AMS1117)
- Place near USB connector (top-left area)
- Input capacitors (C1, C2) between USB and U1
- Output capacitors (C3, C4) between U1 and main board area
- Keep ground connection via thermal vias to ground plane

#### USB Interface (J1 - USB-C Connector)
- Mounted at top edge, mid-mount style (flush with board edge)
- CP2102N (U2) placed immediately adjacent to USB
- D+/D- traces kept short (~10mm) and controlled impedance preferred
- Series resistors (22Ω) placed between connector and CP2102N

#### Microcontroller (U3 - ESP32-WROOM-32)
- Centered on board (best for antenna performance)
- Keep antenna area clear on right side (at least 10mm clearance)
- Decoupling cap (C5) placed within 5mm of VCC pad
- All GND pins soldered to ground plane via thermal vias

#### ADC Chips (U4, U5 - ADS1115)
- U4 (0x48, left foot) placed on left side
- U5 (0x49, right foot) placed on right side
- Each with 100nF decap very close (~3mm)
- I2C pull-ups (R10, R11) placed between I2C lines and VCC

#### I2C Bus Routing
- SDA (GPIO21) and SCL (GPIO22) routed as tightly paired traces
- Parallel routing, minimum crosstalk
- Termination: 4.7kΩ pull-ups only (at source near ESP32)
- Trace width: 0.25mm minimum, preferably 0.35mm
- Via spacing: use multiple vias (2-3 per net) for low inductance

#### FSR Connectors (J2-J7)
- Placed along left edge of board for easy external sensor connection
- Order: J2 (Heel), J3 (Ball), J4 (Toe) for left foot (top to bottom)
- Order: J5 (Heel), J6 (Ball), J7 (Toe) for right foot (top to bottom)
- Voltage divider resistors (R1-R6) placed immediately adjacent to connectors
- All sensor grounds go through via to bottom ground plane

#### Programming Buttons (SW1, SW2)
- Placed on top edge, right side, for thumb access
- SW1 (BOOT) slightly forward, SW2 (RESET) slightly back
- Debounce capacitors (C10, C11) adjacent to buttons if included

#### LED Indicator (LED1)
- Placed on right side, visible when looking at board top
- 1kΩ resistor (R7) between LED anode and 3V3

#### Battery Connector (J8, unpopulated)
- Placed on right edge, lower area
- Footprint reserved but component not initially populated
- Can be added in future design iteration

### Routing Priorities

**Critical paths (low impedance):**
1. 5V_USB → U1 input → ground: use 0.5mm traces
2. U1 output → 3V3 rail: use 0.5mm traces with multiple vias
3. 3V3 → all power pins: use 0.4mm traces
4. GND connections: use 0.5mm traces or pour ground

**High-speed signals (controlled impedance preferred):**
1. USB D+/D- : 90Ω differential, 22Ω series resistors
2. I2C SDA/SCL : 4.7kΩ pull-ups, short traces
3. UART TX/RX : 1kΩ series resistors, separate from other signals

**Standard signals:**
1. All other GPIO: 0.25mm minimum
2. FSR inputs: 0.35mm, shield with ground if noisy

### Ground Plane Strategy

- **Bottom layer:** Solid ground plane with strategic vias
- **Stitching vias:** Place vias around entire board perimeter every 5mm
- **Power vias:** 2-3 vias per power connection to minimize inductance
- **Return paths:** Keep return currents in local ground plane areas
- **Thermal vias:** Use 6-12 vias for U1 (LDO) and U3 (ESP32) thermal pads

### Copper Trace Guidelines

| Signal Type | Width | Spacing | Via Size | Notes |
|-------------|-------|---------|----------|-------|
| Power (5V) | 0.5mm | 0.25mm | 0.3mm | Use multiple vias, pour if possible |
| Power (3.3V) | 0.4mm | 0.25mm | 0.3mm | Separate from signal paths |
| Ground | 0.5mm+ | 0.25mm | 0.3mm | Solid plane preferred, stitching vias |
| Signal | 0.25mm | 0.2mm | 0.3mm | Routed on top layer primarily |
| I2C | 0.35mm | 0.3mm | 0.3mm | Matched length preferred |
| USB D+/D- | 0.2mm | 0.2mm | 0.3mm | 90Ω differential impedance |

### Thermal Management

- AMS1117 (U1): Minimal heating in this application, no heatsink required
- CP2102N (U2): USB bridge, low power dissipation
- ESP32 (U3): Moderate RF heating, ensure clearance from nearby components
- ADS1115 (U4/U5): Low power consumption, no thermal concerns

### Design Rule Checks (DRC) Parameters

For JLCPCB/PCBWay:
- Minimum trace width: 0.2mm (5mil)
- Minimum clearance: 0.15mm (6mil)
- Minimum annular ring: 0.127mm (5mil)
- Via size: 0.3mm min, 0.5mm preferred
- Via pad size: 0.6mm
- Copper to edge: 0.3mm minimum

---

## Manufacturing Notes

### Ordering Instructions for JLCPCB

1. **Gerber File Preparation**
   - Export from KiCad as standard Gerber files:
     - `<project>-F.Cu` (Top copper)
     - `<project>-B.Cu` (Bottom copper)
     - `<project>-F.SilkS` (Top silkscreen)
     - `<project>-B.SilkS` (Bottom silkscreen)
     - `<project>-F.Mask` (Top solder mask)
     - `<project>-B.Mask` (Bottom solder mask)
     - `<project>-Edge.Cuts` (Board outline)
   - Drill file: `<project>.drl` or `<project>-PTH.drl`

2. **PCB Specifications**
   - Dimension: 50mm × 70mm
   - Layers: 2
   - Copper weight: 1oz
   - Surface treatment: HASL (lead-free) or ENIG (more expensive, better for soldering)
   - Solder mask: Green (standard) or black/red for visibility
   - Silkscreen: White, both sides recommended
   - Via hole size: 0.3mm
   - Min trace/space: 0.2mm/0.15mm

3. **Upload to JLCPCB:**
   - Go to jlcpcb.com → "Quote Now"
   - Upload Gerber ZIP file
   - Select options:
     - PCB Qty: 5 (minimum for good pricing)
     - Layers: 2
     - Size: 50×70mm
     - Material: FR-4 (standard)
     - Copper: 1oz
     - Surface finish: HASL
   - Cost estimate: ~$2-5 per board

### PCBA (Solder + Components) Assembly

**Option A: JLCPCB Assembly Service**
1. Upload BOM (Excel or CSV format)
2. Upload CPL (component placement file)
3. Select parts from LCSC stock
4. JLCPCB surcharge: 50% on first 5 boards
5. Expected cost: ~$40-60 per fully assembled board (5 qty)

**BOM Format for JLCPCB Assembly:**
```csv
Designator,Footprint,LCSC Part Number,Quantity
U1,SOT-223,C6186,1
U2,QFN-28,C7520,1
U3,38-pin module,C529143,1
... (rest of components)
```

**Option B: Manual Assembly (Recommended for Prototype)**
1. Order bare PCB from JLCPCB
2. Order components from LCSC or Digi-Key
3. Use hot air station or reflow oven for soldering
4. Estimated time: 2-4 hours per board
5. Cost: ~$20-30 per board (components only)

### Component Soldering Order (Hand Assembly)

1. **Surface Preparation**
   - Clean PCB with isopropyl alcohol
   - Apply solder paste (lead-free recommended) to all pads
   - Use stencil for accurate paste application

2. **Reflow Soldering Steps**
   - **Stage 1 (100-150°C):** Preheat 2-3 minutes
   - **Stage 2 (150-200°C):** Thermal soak 1-2 minutes
   - **Stage 3 (240-260°C):** Reflow 10-30 seconds, watch solder wetting
   - **Stage 4 (cooling):** Cool naturally to <100°C

3. **Manual Soldering (if no reflow oven)**
   - Assemble passive components first (resistors, capacitors)
   - Then ICs (U1, U2, U4, U5)
   - Then larger modules (U3 - ESP32)
   - Finally connectors (J1-J8)
   - Use 0.5mm lead-free solder, flux pen
   - Iron temperature: 350-380°C

4. **Component Mounting Sequence**
   - Bare board layout
   - Surface preparation (clean if needed)
   - Solder paste application
   - Component placement using pick-and-place or tweezers:
     1. U1 (AMS1117) - voltage regulator first for power
     2. C1, C2 (bulk caps for U1)
     3. U2 (CP2102N) - USB interface
     4. C8, C9 (bulk caps for U2)
     5. J1 (USB-C connector)
     6. U3 (ESP32-WROOM-32) - main processor
     7. C5 (decap near ESP32)
     8. U4, U5 (ADS1115 chips)
     9. C6, C7 (decaps near ADCs)
     10. R1-R13 (all resistors)
     11. C3, C4, C10, C11 (remaining capacitors)
     12. R7, LED1 (LED circuit)
     13. SW1, SW2 (buttons)
     14. J2-J8 (connectors)
   - Reflow oven or hand solder as appropriate
   - Cool completely before testing

### Inspection & Quality Assurance

1. **Visual Inspection:**
   - Check all solder joints for cold solder (dull appearance)
   - Verify no solder bridges between pads
   - Ensure all components are flush against board
   - Check LED polarity (long leg to 3V3)

2. **Electrical Testing (Ohm Testing):**
   - 5V_USB to GND: should read high resistance (>100kΩ) when unpowered
   - 3V3 to GND: should read high when unpowered
   - Each I2C line to GND: should read pull-up resistance (~4.7kΩ each)
   - Button pads should be open when button not pressed

3. **Power-On Testing:**
   - Power with 5V via USB (external power supply recommended)
   - Verify power LED (LED1) illuminates
   - Measure 3V3 rail voltage (should be 3.3V ±0.1V)
   - Measure 5V_USB voltage (should be 5V ±0.3V)

4. **I2C Bus Testing:**
   - Use I2C scanner tool to detect both ADS1115 chips
   - Should detect 0x48 and 0x49 addresses
   - Test with multimeter: SDA/SCL should be high (~3.3V) when idle

5. **UART Testing:**
   - Connect via USB to computer
   - Use serial monitor (baud rate 115200)
   - Should detect CP2102N as USB device (may need driver on Windows)
   - Send AT command to verify communication

### Reliability Considerations

1. **Thermal:**
   - Operating range: 0-50°C (designed for fitness environment)
   - PCB will generate <1W heat total
   - No active cooling required

2. **Moisture:**
   - Use moisture barrier (silica gel pack) in enclosure
   - Optional: conformal coating for high-humidity environments
   - Sealing: enclosure should be IP54 minimum for water resistance

3. **ESD Protection:**
   - Handle PCB by edges only during assembly
   - Use ESD wrist strap if available
   - USB connector has integrated ESD protection (CP2102N)

4. **Durability:**
   - Gold fingers: Not required for this design
   - Connector reliability: JST-PH rated for 20+ mating cycles
   - Button lifespan: 10,000+ clicks (standard tactile switches)

---

## Assembly Instructions

### Required Tools

- Soldering iron (60W recommended) or hot air station
- Lead-free solder (SnAgCu alloy)
- Flux pen or solder paste
- Tweezers (fine-tipped)
- Multimeter for testing
- IPA (isopropyl alcohol) for cleaning
- Small screwdriver for connectors
- Helping hands or PCB holder

### Pre-Assembly Checklist

- [ ] PCB received and inspected for damage
- [ ] All components sorted and verified against BOM
- [ ] Soldering station setup and temperature calibrated
- [ ] Workspace clean and static-protected
- [ ] Reference schematic printed or displayed

### Step-by-Step Assembly

**Phase 1: Power Supply (U1, C1-C4)**

1. Place U1 (AMS1117) at SOT-223 position
   - Pin 1 (GND) to ground plane pad
   - Pin 2 (VOUT) to 3V3 pad
   - Pin 3 (VIN) to 5V input pad
2. Solder U1 with minimum thermal paste, avoid pin shorts
3. Place C1 (100nF) near USB input
4. Place C2 (10µF) near USB input
5. Solder C1 and C2 between 5V_USB and GND
6. Place C3 (100nF) and C4 (10µF) on 3V3 output side of U1
7. Verify with multimeter: should read ~5V on input, ~3.3V on output

**Phase 2: USB Interface (J1, U2, C8-C9, resistors)**

1. Place USB-C connector J1 at board edge
   - Solder VBUS (pin 5) to 5V_USB
   - Solder GND (pins 1, 9) to ground plane
   - Solder D+/D- (pins 3, 7) carefully to avoid shorts
2. Place CP2102N (U2) near USB connector
3. Route D+ from USB-C through 22Ω resistor to CP2102N pin 3
4. Route D- from USB-C through 22Ω resistor to CP2102N pin 4
5. Solder all power and ground pins of U2
6. Place C8 (100nF) between U2 VCC and GND
7. Place C9 (100nF) between U2 REGIN and GND
8. Route TXD (U2 pin 5) through 1kΩ resistor to ESP32
9. Route RXD (U2 pin 6) through 1kΩ resistor to ESP32

**Phase 3: Microcontroller (U3 - ESP32)**

1. Place ESP32-WROOM-32 module at center of board
   - Ensure antenna area is clear (right side)
   - All GND pins to ground plane
2. Solder power pins (VCC pins 1, 2) to 3V3 with 100nF cap nearby
3. Solder all GND pins with thermal vias
4. Connect EN (reset) pin through 10kΩ pull-up to 3V3
5. Connect GPIO0 (boot) pin through 10kΩ pull-up to 3V3
6. Connect GPIO21 (SDA) with 4.7kΩ pull-up to 3V3
7. Connect GPIO22 (SCL) with 4.7kΩ pull-up to 3V3
8. Connect remaining pins as per schematic or leave unconnected

**Phase 4: ADC Chips (U4, U5, C6-C7)**

1. Place U4 (ADS1115, address 0x48) on left side
   - VDD to 3V3
   - GND to ground plane
   - ADDR pin to GND (pull low)
   - C6 (100nF) decap to GND
2. Connect SDA and SCL from U4 to I2C bus (shared with ESP32 and U5)
3. Place U5 (ADS1115, address 0x49) on right side
   - VDD to 3V3
   - GND to ground plane
   - ADDR pin to 3V3 (pull high)
   - C7 (100nF) decap to GND
4. Connect SDA and SCL from U5 to I2C bus (same as U4 and ESP32)
5. Verify with multimeter: I2C pull-ups should read ~4.7kΩ when powered

**Phase 5: FSR Sensor Inputs (R1-R6, J2-J7)**

1. For each FSR sensor (Left Heel, Left Ball, Left Toe, Right Heel, Right Ball, Right Toe):
   - Place 10kΩ resistor (R1-R6) in voltage divider position
   - Place JST-PH 2-pin connector (J2-J7) in corresponding position
   - Connect one connector pin to GND
   - Connect other connector pin to ADS input through 10kΩ resistor
2. Order of connectors from top to bottom:
   - J2 (Left Heel) → ADS1115 #1 A0
   - J3 (Left Ball) → ADS1115 #1 A1
   - J4 (Left Toe) → ADS1115 #1 A2
   - J5 (Right Heel) → ADS1115 #2 A0
   - J6 (Right Ball) → ADS1115 #2 A1
   - J7 (Right Toe) → ADS1115 #2 A2

**Phase 6: Indicators & Controls (LED1, R7, SW1, SW2)**

1. Place LED1 (red LED) in designated position
   - Longer leg (anode) to 3V3 side
   - Shorter leg (cathode) to GND side
2. Place R7 (1kΩ) in series with LED1 anode
3. Place SW1 (BOOT button) on top edge
   - One pad to GPIO0
   - Other pad to GND
4. Place SW2 (RESET button) on top edge
   - One pad to EN pin
   - Other pad to GND
5. Verify button functionality with multimeter (should show resistance change when pressed)

**Phase 7: Future Expansion (J8 - Battery)**

1. Place J8 (JST-PH 2-pin) connector on right edge
2. Do NOT populate initially for first prototype
3. Reserve footprint for future battery addition
4. When adding battery:
   - Add protection diode (1N4007) for reverse polarity
   - Add charging circuit (TP4056 or similar)
   - Modify power routing

### Post-Assembly Verification

1. **Visual Inspection:**
   - Check all solder joints with magnification
   - Verify no cold solder or bridges
   - Ensure all components mounted flush

2. **Resistance Testing (Power Off):**
   ```
   Measurement Point         Expected Value
   5V_USB to GND            > 100kΩ (no shorts)
   3V3 to GND               > 100kΩ (no shorts)
   SDA to GND               ~4.7kΩ (pull-up resistor)
   SCL to GND               ~4.7kΩ (pull-up resistor)
   GPIO0 to GND             ~10kΩ (pull-up resistor)
   EN to GND                ~10kΩ (pull-up resistor)
   ```

3. **Power-On Testing:**
   - Connect 5V power via USB or bench supply
   - Verify LED1 illuminates (indicates 3.3V is working)
   - Measure voltages:
     - 5V_USB: should read 5V ±0.5V
     - 3V3: should read 3.3V ±0.1V
   - Check for unusual warmth (indicates short)
   - Disconnect if any anomalies detected

4. **I2C Communication Test:**
   - Connect USB to computer
   - Open serial monitor (115200 baud)
   - Run I2C scanner firmware on ESP32
   - Should detect devices at addresses 0x48 and 0x49
   - If not detected: check SDA/SCL voltages (should be 3.3V)

5. **UART Communication Test:**
   - Flash test firmware to ESP32 via USB
   - Open serial monitor
   - Should see boot messages and sensor readings
   - Verify all 6 FSR channels responding

---

## Testing Checklist

### Pre-Manufacture

- [ ] Schematic reviewed by second person
- [ ] All connections verified in netlist
- [ ] BOM checked against availability
- [ ] PCB layout DRC passed
- [ ] Gerber files generated and verified
- [ ] Design rule compliance checked (trace width, clearance, via size)
- [ ] 3D preview reviewed (no obvious collisions)

### Post-Manufacture (Before Powering On)

- [ ] Visually inspect PCB for manufacturing defects
- [ ] Check solder joints with magnification (no cold solder)
- [ ] Verify polarity of electrolytic capacitors
- [ ] Verify polarity of LED1 (long leg to 3V3)
- [ ] Verify no solder bridges between traces
- [ ] Continuity test: 5V_USB to GND should show high resistance

### Initial Power-Up

- [ ] USB cable connected to external 5V power (not computer initially)
- [ ] Power LED (LED1) illuminates
- [ ] No excessive heat after 10 seconds
- [ ] Measure 3V3 rail voltage (should be 3.3V)
- [ ] No smoke or burning smell

### I2C Bus Communication

- [ ] Connect USB to computer
- [ ] Install CP2102N drivers (Windows only, usually auto on Mac/Linux)
- [ ] Open serial monitor (115200 baud, 8N1)
- [ ] See startup messages from ESP32
- [ ] I2C scanner detects 0x48 (ADS1115 #1)
- [ ] I2C scanner detects 0x49 (ADS1115 #2)
- [ ] No I2C bus errors in debug output

### Analog Input Testing

- [ ] Disconnect all FSR sensors
- [ ] With nothing connected, verify all channels read 0
- [ ] Apply 3.3V to one FSR input (shorting pin 2 of connector to 3V3)
- [ ] Verify that channel reads max value (~32767)
- [ ] Repeat for all 6 channels

### FSR Sensor Integration

- [ ] Assemble FSR sensor cables with JST connectors
- [ ] Connect Left Heel FSR to J2
- [ ] Connect Left Ball FSR to J3
- [ ] Connect Left Toe FSR to J4
- [ ] Connect Right Heel FSR to J5
- [ ] Connect Right Ball FSR to J6
- [ ] Connect Right Toe FSR to J7
- [ ] Apply pressure to each FSR
- [ ] Verify resistance changes in firmware output
- [ ] Check that pressure produces corresponding ADC value change

### BLE Connectivity

- [ ] Connect USB and power on
- [ ] Open BLE scanner app on smartphone
- [ ] Should detect device (name from firmware)
- [ ] Connect from phone
- [ ] Verify sensor data stream at 50Hz
- [ ] Check signal strength (RSSI)

### Environmental Testing

- [ ] Temperature range: Store at 0°C overnight, test still works
- [ ] Temperature range: Store at 50°C for 1 hour, test still works
- [ ] Humidity: Store in sealed bag with moisture, no condensation damage
- [ ] Drop test: PCB survives 1m drop onto carpet (if in protective case)
- [ ] Button reliability: Press each button 100 times, verify consistent response

### Final Validation

- [ ] Firmware uploaded successfully via USB
- [ ] All 6 FSR channels reading valid data
- [ ] BLE connection stable for 1 hour
- [ ] No memory leaks (free heap stays constant)
- [ ] Battery connector readiness (footprint confirmed)
- [ ] Documentation reviewed and complete

---

## Firmware Integration Notes

### I2C Configuration (Arduino/ESP-IDF)

```c
// I2C pins
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22
#define I2C_FREQUENCY 400000  // 400kHz

// ADS1115 I2C addresses
#define ADS1115_LEFT_ADDR 0x48    // A0=Left Heel, A1=Left Ball, A2=Left Toe
#define ADS1115_RIGHT_ADDR 0x49   // A0=Right Heel, A1=Right Ball, A2=Right Toe

// ADC channel mapping
// Left foot (ADS1115 @ 0x48)
#define LEFT_HEEL_CHANNEL 0
#define LEFT_BALL_CHANNEL 1
#define LEFT_TOE_CHANNEL 2

// Right foot (ADS1115 @ 0x49)
#define RIGHT_HEEL_CHANNEL 0
#define RIGHT_BALL_CHANNEL 1
#define RIGHT_TOE_CHANNEL 2
```

### UART Configuration (CP2102N)

```c
// Serial port for programming/debugging
// CP2102N provides /dev/ttyUSB0 (Linux) or COM* (Windows)
#define UART_BAUD_RATE 115200
#define UART_TXD_PIN 1    // GPIO1 (U0TXD)
#define UART_RXD_PIN 3    // GPIO3 (U0RXD)
```

### Programming Mode

To enter bootloader:
1. Hold BOOT button (GPIO0 to GND)
2. Press RESET button (EN to GND)
3. Release RESET button
4. Release BOOT button
5. Upload firmware via USB

### Power Sequencing

1. 5V_USB applied → AMS1117 enables
2. 3.3V_out stabilizes (~100ms)
3. ESP32 pulls CS low automatically
4. ADS1115 chips initialize via I2C pull-ups

---

## Future Design Considerations

### V2.0 Enhancements

1. **Battery Support:**
   - Add TP4056 USB charging IC
   - Add protection diode and load balancing circuit
   - Investigate 3.7V LiPo option for lower power
   - Power routing switch (USB vs Battery)

2. **Wireless Improvements:**
   - Add optional WiFi (needs external antenna)
   - Investigate mesh networking for multiple nodes
   - Power optimization for BLE (connection interval tuning)

3. **Sensor Expansion:**
   - Add IMU/accelerometer for tilt detection
   - Add temperature sensor
   - Expand to 8 channels with additional ADS chips

4. **Mechanical:**
   - Design PCB mount points for enclosure
   - Add strain relief for connectors
   - Consider flex PCB for curved applications

5. **Certification:**
   - CE marking for European market
   - FCC certification for wireless equipment
   - Medical device classification assessment

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-07 | Engineering Team | Initial comprehensive design document |

---

## References & Resources

### Datasheets

- **ESP32-WROOM-32:** https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32_datasheet_en.pdf
- **ADS1115:** https://www.ti.com/lit/ds/symlink/ads1115.pdf
- **CP2102N:** https://www.silabs.com/documents/public/data-sheets/cp2102n-a01-datasheet.pdf
- **AMS1117-3.3:** https://www.advanced-monolithic.com/pdf/noch/ams1117.pdf

### Tools & Software

- **KiCad:** https://www.kicad.org/ (free, open-source PCB design)
- **JLCPCB:** https://jlcpcb.com/ (PCB manufacturing & PCBA)
- **PCBWay:** https://www.pcbway.com/ (alternative PCB manufacturer)
- **LCSC:** https://www.lcsc.com/ (component distributor, owned by JLCPCB)
- **I2C Scanner:** https://github.com/espressif/arduino-esp32/blob/master/libraries/Wire/examples/i2c_scanner/i2c_scanner.ino

### Application Notes

- **ESP32 I2C Guide:** https://randomnerdtutorials.com/esp32-i2c-communication-arduino-ide/
- **ADS1115 with Arduino:** https://learn.adafruit.com/adafruit-4-channel-adc-breakouts
- **CP2102N Linux Driver:** https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers

---

## Contact & Support

For manufacturing questions or technical clarifications:
- Review this document thoroughly before ordering
- Check JLCPCB forum for design reviews
- Verify with manufacturer if any custom requirements are needed
- Test thoroughly before large-scale production

---

**End of PCB Design Document**
