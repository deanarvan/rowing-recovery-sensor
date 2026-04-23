# Rowing/Balance Board Rehabilitation Sensor — PCB Design Brief

**Project:** Rowing/Balance Board Rehabilitation Sensor
**Board Size:** 50mm × 70mm, 2-layer
**Manufacturing:** JLCPCB / PCBWay compatible (PCBA assembly service preferred)
**Deliverables:** KiCad schematic (.kicad_sch), PCB layout (.kicad_pcb), Gerbers, BOM with LCSC part numbers, pick-and-place file

---

## Project Overview

This PCB is the central electronics module for a bilateral force-sensing platform used in physical therapy rehabilitation monitoring. It reads four thin-film force sensors (Tekscan FlexiForce A301-100), measures board orientation via a 9-DOF IMU, and streams the combined data to a web application over Bluetooth Low Energy at 50 Hz.

The same hardware supports two operating modes, selected by sensor placement:
- **Rowing mode** — FlexiForce sensors placed in shoe insoles (heel + toe of each foot). The web app detects stroke phases and analyzes force curves.
- **Balance board mode** — FlexiForce sensors placed on a balance platform at heel + toe positions for each foot. The web app computes center of pressure (CoP), sway velocity, ellipse area, and drives interactive balance training games.

Both modes use the same 4 sensor channels and the same BLE data format. The user physically swaps sensor sets by plugging different cables into the 4 front-panel headers.

### Key Design Requirements

| Requirement | Value |
|---|---|
| Force sensor channels | 4 (2 per foot: heel + toe) |
| Force measurement range (per sensor) | 0 to ~2,000 N |
| Sensor type | Tekscan FlexiForce A301-100 thin-film |
| Orientation sensing | 9-DOF IMU (pitch, roll, yaw) |
| Sample rate | 50 Hz per channel |
| Wireless protocol | Bluetooth Low Energy (BLE 5.0) |
| Power input | 5V USB-C |
| Regulated rail | 3.3V (1A capable LDO) |
| Programming | USB serial via CP2102N bridge |
| Board outline | 50mm × 70mm, 2-layer |

---

## System Block Diagram

```
┌─────────────┐
│  USB-C 5V   │
└──────┬──────┘
       │
       ├─ CP2102N USB-to-UART Bridge (U2)
       │  (TX → ESP32 GPIO1, RX ← ESP32 GPIO3)
       │
       ├─ AMS1117-3.3 LDO (U1) ── 3.3V rail
       │
       ├─ ESP32-WROOM-32 (U3)
       │  ├─ I2C SDA = GPIO21, SCL = GPIO22
       │  ├─ GPIO0 (BOOT button)
       │  ├─ EN (RESET button)
       │  └─ BLE antenna (keep-out zone required)
       │
       ├─ MCP6004 Quad Op-Amp (U4) — analog conditioning
       │  ├─ Ch A → FlexiForce: Left Heel  → ADS1115 A0
       │  ├─ Ch B → FlexiForce: Left Toe   → ADS1115 A1
       │  ├─ Ch C → FlexiForce: Right Heel → ADS1115 A2
       │  └─ Ch D → FlexiForce: Right Toe  → ADS1115 A3
       │
       ├─ ADS1115 16-bit I2C ADC @ 0x48 (U5)
       │  ├─ A0-A3 ← Op-amp outputs
       │  ├─ ADDR → GND (sets address 0x48)
       │  └─ Shares I2C bus with IMU
       │
       └─ BNO055 9-DOF IMU @ 0x28 (U6, on-board LGA-28 IC with 32.768 kHz crystal)
          ├─ Outputs: Euler angles, quaternion, linear acceleration
          ├─ ADR → GND (sets address 0x28)
          └─ Shares I2C bus with ADC
```

---

## Analog Front-End Design

### FlexiForce A301 Conditioning Circuit (per channel, ×4)

The FlexiForce A301 is a 2-terminal resistive force sensor. Its resistance decreases as applied force increases. An **inverting op-amp circuit** converts this variable resistance to a proportional output voltage with good linearity across the full force range.

```
                       Rf (feedback resistor)
                    ┌──────────────────────────┐
                    │                          │
                    │      ┌──────────┐        │
 Vref ─── Rd ──────┤(-)   │  1/4 of  │  (out) ├───── ADS1115 input (A0-A3)
  │                │      │  MCP6004 │        │
  │   FlexiForce   │(+)   │          │        │
  │   ┌────────┐   │      └──────────┘        │
  └───┤ sensor ├───┘                           │
      └────────┘   │                           │
                   GND                         │
                                          Cf (optional)
                                         100pF
```

The op-amp output follows the relation **Vout = Vref × (Rf / Rsensor)**. As force increases, Rsensor decreases, and Vout increases linearly — from ~0V (no force) to ~3V (full range).

### Component Values (per channel)

| Component | Value | Tolerance | Package | Purpose |
|---|---|---|---|---|
| Rf (feedback resistor) | 10 kΩ | 1% | 0603 | Sets force range to ~0–2,000 N |
| Rd (drive resistor) | 10 kΩ | 1% | 0603 | Sets reference current |
| Cf (output filter cap) | 100 pF | 10% | 0603 | Optional low-pass filter |

**Force range tuning** — the Rf value selects the measurement range. 10 kΩ is recommended for this rehabilitation use case:

| Rf | Force Range | Use Case |
|---|---|---|
| 49.9 kΩ | 0 – 445 N | Light touch, seated exercises |
| **10 kΩ** (chosen) | **0 – 2,000 N** | **Standing, squats, heel raises** |
| 4.7 kΩ | 0 – 3,500 N | Heavy dynamic loading |
| 1 kΩ | 0 – 4,448 N | Impact / jump landing |

### Shared Vref Generation

A single voltage divider off the 3.3V rail generates the reference voltage used by all 4 op-amp channels.

```
3.3V ─── Rvd1 (47kΩ) ──┬── Vref (~0.58V) → to Rd on each channel
                         │
                    Rvd2 (10kΩ)
                         │
                        GND
                         │
                    Cvref (100nF to GND)
```

**Vref = 3.3V × 10kΩ / (47kΩ + 10kΩ) ≈ 0.58V**

This low reference voltage keeps the op-amp output within the ADS1115's 0–3.3V input range across the full force range.

### MCP6004 Quad Op-Amp (U4)

The MCP6004 is a quad rail-to-rail input/output op-amp in SOIC-14. A single chip handles all 4 sensor channels.

```
MCP6004 (SOIC-14)
┌──────────────────┐
│ 1  OUT_A    VDD 14│──── 3.3V
│ 2  IN-_A   OUT_D 13│──── → ADS1115 A3 (Right Toe)
│ 3  IN+_A   IN-_D 12│──── Rf_D + Rd_D
│ 4  VSS     IN+_D 11│──── GND (sensor reference)
│ 5  IN+_B   IN-_C 10│──── Rf_C + Rd_C
│ 6  IN-_B   IN+_C  9│──── GND (sensor reference)
│ 7  OUT_B   OUT_C   8│──── → ADS1115 A2 (Right Heel)
└──────────────────┘
```

Channel assignments:

| MCP6004 Channel | OUT / IN– / IN+ pins | Sensor | ADS1115 Input |
|---|---|---|---|
| A | 1 / 2 / 3 | Left Heel | A0 |
| B | 7 / 6 / 5 | Left Toe | A1 |
| C | 8 / 10 / 9 | Right Heel | A2 |
| D | 13 / 12 / 14 | Right Toe | A3 |

**Power:** VDD (pin 14) to 3.3V with 100nF + 10µF decoupling placed within 5mm of the pin. VSS (pin 4) to ground plane.

---

## Digital Section

### ADS1115 16-bit ADC (U5)

Single ADS1115 reads all 4 op-amp outputs over I2C.

| Pin | Name | Connection |
|---|---|---|
| 1 | VDD | 3.3V (with 100nF decoupling cap to GND) |
| 2 | A0 | MCP6004 Channel A output (Left Heel) |
| 3 | A1 | MCP6004 Channel B output (Left Toe) |
| 4 | A2 | MCP6004 Channel C output (Right Heel) |
| 5 | A3 | MCP6004 Channel D output (Right Toe) |
| 6 | GND | Ground plane |
| 7 | SDA | I2C SDA bus (GPIO21) |
| 8 | SCL | I2C SCL bus (GPIO22) |
| 9 | ADDR | GND (sets I2C address to 0x48) |
| 10 | ALERT | Leave unconnected |

### BNO055 9-DOF IMU (U6)

The BNO055 provides absolute orientation with onboard sensor fusion (Euler angles, quaternion, linear acceleration, gravity vector) — no host-side filtering required. The IC is placed **directly on the PCB** alongside its supporting crystal and decoupling components. JLCPCB's PCBA service handles the LGA-28 placement; no post-assembly work is required.

#### BNO055 IC Pinout (LGA-28)

| Pin | Name | Connection |
|---|---|---|
| 1 | VDDIO | 3.3V (with 100nF decoupling cap to GND) |
| 3 | GND | Ground plane |
| 4 | XIN32 | Crystal pin 1 (with 22pF load cap to GND) |
| 5 | XOUT32 | Crystal pin 2 (with 22pF load cap to GND) |
| 6 | BL_IND | 10 kΩ pull-up to 3.3V |
| 8 | PS1 | GND (standard I²C mode) |
| 9 | PS0 | GND (standard I²C mode) |
| 17 | COM3 (ADR) | GND (sets I²C address to 0x28) |
| 18 | COM2 (INT) | ESP32 GPIO4 (optional motion interrupt; leave floating if unused) |
| 19 | COM1 (SCL) | I²C SCL bus (GPIO22) |
| 20 | COM0 (SDA) | I²C SDA bus (GPIO21) |
| 23 | nRESET | Pull up to 3.3V via 10 kΩ; optional tie to ESP32 GPIO5 for hardware reset |
| 28 | VDD | 3.3V (with 100nF decoupling cap to GND) |

(All other pins: leave unconnected or tied to GND per datasheet recommendations.)

#### Supporting Components

| Ref | Value | Purpose |
|---|---|---|
| Y1 | 32.768 kHz quartz crystal, 12.5 pF load | External timing reference — required for accurate sensor fusion |
| Cxtal1, Cxtal2 | 22 pF NP0 | Crystal load capacitors (tie to GND, placed within 3mm of crystal) |
| Cbno_io | 100 nF | VDDIO decoupling (placed within 2mm of pin 1) |
| Cbno_d | 100 nF | VDD decoupling (placed within 2mm of pin 28) |
| Rbl | 10 kΩ | BL_IND pull-up to 3.3V |
| Rrst | 10 kΩ | nRESET pull-up to 3.3V |

Crystal routing: keep traces short and symmetric, surround with ground pour, do not route high-speed signals underneath.

### I2C Bus

Both devices share one I2C bus driven by the ESP32 on GPIO21 (SDA) and GPIO22 (SCL).

| Device | Address | Package |
|---|---|---|
| ADS1115 | 0x48 | MSOP-10 on-board |
| BNO055 | 0x28 | Off-board breakout via socket |

Bus pull-ups: 4.7 kΩ to 3.3V on both SDA and SCL. 400 kHz fast mode.

### IMU Axis Alignment

Orient the BNO055 IC on the PCB so that its internal axes align with the board's physical frame of reference:

- **IMU X+** → board length direction (anterior, toward the toe-end of the sensor layout)
- **IMU Y+** → board width direction (medial-lateral)
- **IMU Z+** → up (perpendicular to PCB surface)

With this alignment, pitch rotates around Y, roll rotates around X, yaw rotates around Z. Document the chosen orientation on the silkscreen with a small arrow so the operator can verify placement.

### ESP32-WROOM-32 (U3)

Standard ESP32-WROOM-32 module handles all logic and BLE wireless.

| Pin | Name | Connection |
|---|---|---|
| 1 | GND | Ground plane |
| 2 | VCC | 3.3V rail |
| 3 | RXD (GPIO3) | UART RX from CP2102N |
| 4 | EN | RESET button + 10 kΩ pull-up to 3.3V |
| 27 | GPIO0 | BOOT button + 10 kΩ pull-up to 3.3V |
| 21 | GPIO21 | I2C SDA (4.7 kΩ pull-up) |
| 22 | GPIO22 | I2C SCL (4.7 kΩ pull-up) |

**Antenna keep-out:** no copper (traces or ground plane) within 10mm of the ESP32 antenna end. The antenna should overhang the board edge or sit in a dedicated clear zone.

### CP2102N USB-to-UART Bridge (U2)

Standard USB programming interface.

| Pin | Name | Connection |
|---|---|---|
| 1 | VCC | 3.3V (with 100nF decoupling) |
| 3 | D+ | USB connector D+ (via 22Ω series resistor) |
| 4 | D- | USB connector D- (via 22Ω series resistor) |
| 5 | TXD | ESP32 GPIO1 (via 1 kΩ series resistor) |
| 6 | RXD | ESP32 GPIO3 (via 1 kΩ series resistor) |
| 10 | REGIN | 5V rail (with 100nF decoupling) |

### Power Supply

| Net | Voltage | Source | Notes |
|---|---|---|---|
| 5V_USB | 5.0V | USB-C connector | Max 500 mA per USB spec |
| 3V3 | 3.3V | AMS1117-3.3 LDO | 1A capacity; typical draw <200 mA |
| GND | 0V | Continuous ground plane | |

Decoupling: 100nF + 10µF on LDO input and output. 100nF per IC VDD pin placed within 5mm.

---

## Sensor Connectors

**4× 2-pin 2.54mm female through-hole headers (J2–J5)**

The FlexiForce A301 terminates in 2 male square pins at 0.1" pitch. These plug directly into standard 2-pin female headers on the PCB — no adapter cables, no soldering to the sensor, easy swap for replacement.

| Connector | Sensor | Op-Amp Channel | ADS1115 Input |
|---|---|---|---|
| J2 | Left Heel FlexiForce | MCP6004 Ch A | A0 |
| J3 | Left Toe FlexiForce | MCP6004 Ch B | A1 |
| J4 | Right Heel FlexiForce | MCP6004 Ch C | A2 |
| J5 | Right Toe FlexiForce | MCP6004 Ch D | A3 |

**Each connector:**
- Pin 1: Sensor signal → MCP6004 IN+ (non-inverting input)
- Pin 2: GND

**Part:** 2-pin 2.54mm female header, through-hole (LCSC C35165 or equivalent). Place J2–J5 along one board edge for clean cable routing.

---

## Bill of Materials

All on-board components. Off-board parts (BNO055 breakout, FlexiForce sensors) are listed in a separate section below.

| Designator | Value / Part | Description | Package | LCSC | Qty |
|---|---|---|---|---|---|
| U1 | AMS1117-3.3 | 3.3V LDO regulator | SOT-223 | C6186 | 1 |
| U2 | CP2102N | USB-to-UART bridge | QFN-28 | C7520 | 1 |
| U3 | ESP32-WROOM-32 | BLE/WiFi MCU module | 38-pin module | C529143 | 1 |
| U4 | MCP6004-I/ST | Quad rail-to-rail op-amp | SOIC-14 | C7378 | 1 |
| U5 | ADS1115 | 16-bit I²C ADC | MSOP-10 | C21992 | 1 |
| U6 | BNO055 | 9-DOF absolute orientation sensor with onboard fusion | LGA-28 (5.2×3.8mm) | C40521 | 1 |
| Y1 | 32.768 kHz crystal, 12.5 pF load | BNO055 external timing crystal | SMD 3.2×1.5mm | C32346 | 1 |
| Cxtal1 | 22 pF NP0 | Crystal load cap | 0402 | C1554 | 1 |
| Cxtal2 | 22 pF NP0 | Crystal load cap | 0402 | C1554 | 1 |
| Cbno_io | 100 nF | BNO055 VDDIO decoupling | 0402 | C1525 | 1 |
| Cbno_d | 100 nF | BNO055 VDD decoupling | 0402 | C1525 | 1 |
| Rbl | 10 kΩ | BNO055 BL_IND pull-up | 0402 | C25744 | 1 |
| Rrst | 10 kΩ | BNO055 nRESET pull-up | 0402 | C25744 | 1 |
| Rf1–Rf4 | 10 kΩ 1% | Op-amp feedback resistors | 0603 | C25804 | 4 |
| Rd1–Rd4 | 10 kΩ 1% | Op-amp drive resistors | 0603 | C25804 | 4 |
| Rvd1 | 47 kΩ 1% | Vref divider (top) | 0603 | C25819 | 1 |
| Rvd2 | 10 kΩ 1% | Vref divider (bottom) | 0603 | C25804 | 1 |
| R10 | 4.7 kΩ | I²C SDA pull-up | 0603 | C14631 | 1 |
| R11 | 4.7 kΩ | I²C SCL pull-up | 0603 | C14631 | 1 |
| R12 | 10 kΩ | GPIO0 (BOOT) pull-up | 0603 | C14663 | 1 |
| R13 | 10 kΩ | EN (RESET) pull-up | 0603 | C14663 | 1 |
| R14 | 22 Ω | USB D+ series resistor | 0603 | C25119 | 1 |
| R15 | 22 Ω | USB D- series resistor | 0603 | C25119 | 1 |
| R_LED | 1 kΩ | Power LED current limit | 0603 | C14663 | 1 |
| R_UART1 | 1 kΩ | CP2102 TX series | 0603 | C14663 | 1 |
| R_UART2 | 1 kΩ | CP2102 RX series | 0603 | C14663 | 1 |
| Cvref | 100 nF | Vref bypass cap | 0603 | C14663 | 1 |
| Cpa | 100 nF | MCP6004 VDD decoupling | 0603 | C14663 | 1 |
| Cpb | 10 µF | MCP6004 VDD bulk cap | 1206 | C13585 | 1 |
| Ca5 | 100 nF | ADS1115 VDD decoupling | 0603 | C14663 | 1 |
| C1 | 100 nF | CP2102N VCC decoupling | 0603 | C14663 | 1 |
| C2 | 10 µF | Input bulk cap (5V) | 1206 | C13585 | 1 |
| C3 | 100 nF | LDO output decoupling | 0603 | C14663 | 1 |
| C4 | 10 µF | LDO output bulk cap | 1206 | C13585 | 1 |
| C5 | 100 nF | ESP32 VCC decoupling | 0603 | C14663 | 1 |
| C10 | 100 nF | BOOT debounce (optional) | 0603 | C14663 | 1 |
| C11 | 100 nF | RESET debounce (optional) | 0603 | C14663 | 1 |
| LED1 | Red LED | Power indicator | 0603 | C2286 | 1 |
| SW1 | 6×6mm tactile button | BOOT | SMD 6×6mm | C318884 | 1 |
| SW2 | 6×6mm tactile button | RESET | SMD 6×6mm | C318884 | 1 |
| J1 | USB-C receptacle, 24-pin | USB connector (mid-mount) | USB-C SMD | C165948 | 1 |
| J2–J5 | 2-pin female header, 2.54mm | Sensor connectors | TH 2.54mm | C35165 | 4 |

Estimated per-board cost: ~$15 in components plus ~$2–5 PCB fabrication (JLCPCB 5-piece minimum).

### Off-Board Parts (Not on PCB)

| Part | Source | Purpose |
|---|---|---|
| Tekscan FlexiForce A301-100 (×4 or ×6 with spares) | DigiKey / Tekscan | Force sensors; plug into J2–J5 |

The IMU is now integrated directly on the PCB — no separate module to purchase or socket.

---

## PCB Layout Guidelines

### Analog Signal Routing (Critical)

1. **Keep MCP6004 output traces short** — route directly to ADS1115 inputs with minimal trace length (<10mm ideal).
2. **Star ground** — connect MCP6004 VSS, ADS1115 GND, and the Vref divider bottom to a single node on the ground plane near the analog section.
3. **Separate analog and digital zones** — ESP32 and CP2102N on one side of the board, MCP6004/ADS1115/BNO055 on the other. Join the two zones at a single point under the LDO.
4. **Vref trace** — route the Vref net from the divider to all 4 Rd resistors on the top layer, keep away from digital switching traces.
5. **Sensor connector placement** — J2–J5 along one edge for easy cable routing.

### Suggested Component Placement

```
50mm × 70mm Board (Top View)
┌────────────────────────────────────────┐
│  [USB-C]  [CP2102N]  [LED] [SW1][SW2] │  ← Digital section (top edge)
│                                        │
│         [ESP32-WROOM-32]               │  ← Center; keep antenna clear
│         (large module)                 │
│                                        │
│  [MCP6004]  [ADS1115]    [BNO055]     │  ← Analog + IMU section
│  [Rf1-4]    [Rd1-4]      [Y1 xtal]    │     IMU IC directly on board
│  [Rvd1/2]   [Cvref]                   │
│                                        │
│  [J2]  [J3]  [J4]  [J5]              │  ← Sensor connectors (bottom edge)
└────────────────────────────────────────┘
```

### Trace / Via Specifications

- Signal traces: 0.25mm minimum width
- Power traces: 0.5mm minimum width
- Via diameter: 0.3mm minimum drill, 0.6mm pad
- Ground plane: continuous on bottom layer
- 2-layer, 1oz copper

### ESP32 Antenna Keep-Out

No copper (traces or ground plane) within 10mm of the ESP32 antenna end. The module should be oriented so the antenna overhangs the board edge or has a dedicated clear zone.

### IMU Placement

Place the BNO055 IC (U6) and its 32.768 kHz crystal (Y1) together in a small quiet zone, away from the ESP32 module and high-speed digital traces. Surround the crystal with a local ground pour. Add a silkscreen arrow next to U6 indicating the chosen X-axis direction so firmware and the web app can interpret axes correctly. The 22 pF load caps (Cxtal1, Cxtal2) must be within 3 mm of the crystal pins.

---

## Calibration Procedure (Post-Assembly)

Run once per assembled board to establish per-channel force calibration:

1. Power the board with no load on any sensor — record the zero-offset ADC reading per channel.
2. Place a known weight (e.g., 20 kg plate) centered on each FlexiForce sensor — record the loaded ADC reading.
3. Compute per-channel scale factor: `scale = known_force_N / (loaded_reading − zero_reading)`.
4. Store scale factors in ESP32 non-volatile storage (NVS) or hardcode in firmware.

**Expected with Rf = 10 kΩ:** approximately 16 ADC counts per Newton, so the full 0–2000 N range maps to 0–32,000 counts (well within the ADS1115's 16-bit resolution).

---

## Testing Checklist

### Power-On
- [ ] LED1 illuminates
- [ ] 3.3V rail measures 3.28–3.35 V
- [ ] Current draw <100 mA with no BLE connection

### Vref Verification
- [ ] Measure Vref node: 0.55–0.60 V

### Op-Amp Verification (sensors disconnected)
- [ ] MCP6004 pin 14 (VDD): 3.3 V
- [ ] MCP6004 pin 4 (VSS): 0 V
- [ ] Op-amp outputs (pins 1, 7, 8, 13): ~0 V with no sensor current

### I²C / ADC Verification
- [ ] I²C scanner finds 0x48 (ADS1115) AND 0x28 (BNO055)
- [ ] All 4 ADC channels read near 0 with sensors disconnected
- [ ] Channels respond smoothly when a test voltage is applied

### IMU Verification
- [ ] I²C scanner finds BNO055 at address 0x28
- [ ] Crystal oscillates (firmware reports successful IMU init)
- [ ] Board flat on bench: pitch ≈ 0°, roll ≈ 0°
- [ ] Tilt board 45° forward: pitch reads ~45°
- [ ] Tilt board 45° sideways: roll reads ~45°
- [ ] Rotate board: yaw changes smoothly (absolute heading)
- [ ] No cross-coupling (pitch changes don't affect roll, etc.)

### Sensor Verification (with FlexiForce connected)
- [ ] Light finger press: small ADC reading (~100–500 counts)
- [ ] Full hand press: larger reading (~5,000–15,000 counts)
- [ ] Full standing bodyweight: ~13,000 counts for ~800 N — no saturation

### BLE Verification
- [ ] Device advertises as "Rowing_Sensors"
- [ ] Web app connects and displays live data for all 4 force channels and IMU
- [ ] 50 Hz data rate confirmed

### Clinical Verification
- [ ] Bilateral stance: Left % ≈ Right % (±5%)
- [ ] Single-leg stance: loaded side reads ~800 N (1× bodyweight)
- [ ] Heel raise: peak >1,200 N (>1.5× bodyweight) — no saturation
- [ ] Squat: peak >1,500 N (>1.8× bodyweight) — no saturation

---

## Reference Datasheets

| Component | Datasheet |
|---|---|
| FlexiForce A301 | https://www.tekscan.com/products-solutions/force-sensors/flexiforce-a301-sensor |
| FlexiForce Integration Guide | https://www.tekscan.com/resources/user-manual/flexiforce-sensors-integration-guide |
| MCP6004 | https://ww1.microchip.com/downloads/en/DeviceDoc/MCP6001-1R-1U-2-4-1MHz-Low-Power-Op-Amp-DS20001733L.pdf |
| ADS1115 | https://www.ti.com/lit/ds/symlink/ads1115.pdf |
| BNO055 | https://cdn-shop.adafruit.com/datasheets/BST_BNO055_DS000_12.pdf |
| Adafruit BNO055 breakout | https://www.adafruit.com/product/2472 |
| ESP32-WROOM-32 | https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32_datasheet_en.pdf |
| CP2102N | https://www.silabs.com/documents/public/data-sheets/cp2102n-a01-datasheet.pdf |
| AMS1117-3.3 | https://www.advanced-monolithic.com/pdf/noch/ams1117.pdf |

---

## Dual-Mode Operation Note

The same PCB supports both rowing and balance-board modes. The sensors themselves are swapped physically (different cable harnesses plugged into J2–J5). No firmware mode switching is required — the ESP32 always reports the same 4 force channels plus IMU data, and the web application interprets the data based on which tab the user has selected.

| Operating Mode | Sensor Placement | Web App View |
|---|---|---|
| Rowing | FlexiForce sensors inside shoe insoles (heel + toe per foot) | "Rowing" — stroke phase, force curves |
| Balance Board | FlexiForce sensors on balance-board surface (heel + toe zones per foot) | "Balance Board" — CoP, sway, training games |

The IMU remains active in both modes. In rowing mode, orientation data provides context for drive/recovery timing. In balance mode, it measures board tilt (if mounted on a wobble/rocker platform) or, when the PCB is extended to a chest strap via cable, trunk sway during postural assessment.

---

## Deliverables Expected

1. Schematic (.kicad_sch) with clearly labeled nets
2. PCB layout (.kicad_pcb) respecting the layout guidelines above
3. Manufacturing Gerbers (zip)
4. BOM in CSV format with LCSC part numbers matching the table above
5. Pick-and-place file for PCBA
6. 3D render / preview image of the assembled board
7. DRC and ERC reports (clean)

---

**Document Version:** 1.0 (April 2026)
**Prepared by:** Dean Arvan
**Contact:** deanarvan@gmail.com
