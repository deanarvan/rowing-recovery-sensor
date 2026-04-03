# Balance Board — 4-Sensor FSR Build Instructions

Quick breadboard prototype for bilateral balance assessment using an ESP32-S3-DevKitC-1 N16R8.

## What You Need

### Parts

| Item | Qty | Notes |
|------|-----|-------|
| Square FSR (Adafruit 1075) | 4 | Interlink 406. Do NOT use the round ones (Adafruit 166) — they max out at 10N, useless for body weight |
| 10kΩ resistors | 4 | 1/4W through-hole |
| ESP32-S3-DevKitC-1 N16R8 | 1 | Must be the S3 variant (16MB flash, 8MB PSRAM). The board has "ESP32-S3" printed on the module and GPIO numbers silk-screened on both pin headers |
| Breadboard | 1 | Full-size (830 tie points). The DevKitC is wide — it takes up almost the entire width. You need at least 1 free row on each side for jumper access |
| Jumper wires | ~12 | Male-to-male for breadboard connections |
| USB-C cable (data-capable) | 1 | For power and serial data. Some cheap cables are charge-only and won't work |
| A board to stand on | 1 | Plywood, cutting board, anything rigid and flat, roughly 45cm x 30cm |

### Optional But Helpful

- Double-sided tape or gaffer tape (to stick FSRs to the board)
- Rubber shelf liner sheet (put on top of the FSRs — prevents foot slip and distributes force more evenly across each sensor face)
- Sharpie (to mark foot positions)
- Multimeter (for verifying wiring before power-on)

## ESP32-S3-DevKitC-1 N16R8 Pinout Reference

The board has two rows of 20 pins each running along the long edges, with the USB-C connector at one end. Hold the board with the **USB-C connector pointing toward you** (bottom). The GPIO numbers are printed on the silkscreen next to each pin.

```
                     ┌─────────────────┐
                     │    ESP32-S3     │
                     │    N16R8        │
                     │   ┌───────┐    │
                     │   │antenna│    │
                     │   └───────┘    │
     LEFT HEADER     │               │     RIGHT HEADER
     ────────────    │               │     ────────────
     3V3  ●──────────┤               ├──────────● GND
     3V3  ●──────────┤               ├──────────● TX (GPIO43)
     RST  ●──────────┤               ├──────────● RX (GPIO44)
  ► GPIO4 ●──────────┤               ├──────────● GPIO1 ◄
    GPIO5 ●──────────┤               ├──────────● GPIO2 ◄
    GPIO6 ●──────────┤               ├──────────● GPIO42
    GPIO7 ●──────────┤               ├──────────● GPIO41
   GPIO15 ●──────────┤               ├──────────● GPIO40
   GPIO16 ●──────────┤               ├──────────● GPIO39
   GPIO17 ●──────────┤               ├──────────● GPIO38
   GPIO18 ●──────────┤               ├──────────● GPIO37
    GPIO8 ●──────────┤               ├──────────● GPIO36
   GPIO19 ●──────────┤               ├──────────● GPIO35
   GPIO20 ●──────────┤               ├──────────● GPIO0
    GPIO3 ●──────────┤               ├──────────● GPIO45
   GPIO46 ●──────────┤               ├──────────● GPIO48
    GPIO9 ●──────────┤               ├──────────● GPIO47
   GPIO10 ●──────────┤               ├──────────● GPIO21
   GPIO11 ●──────────┤               ├──────────● GPIO14
   GPIO12 ●──────────┤               ├──────────● GPIO13
                     │               │
                     │   ┌───────┐   │
                     │   │USB-C  │   │
                     └───┴───────┴───┘
                      (facing you)

  ► = pins we're using for ADC
```

**The 4 pins we need for FSR readings:**

| Pin | Location on board | GPIO | ADC Channel | Sensor |
|-----|-------------------|------|-------------|--------|
| Right header, 4th from top | Right side | GPIO 1 | ADC1_CH0 | FL (front-left, left ball) |
| Right header, 5th from top | Right side | GPIO 2 | ADC1_CH1 | FR (front-right, right ball) |
| Left header, 15th from top | Left side | GPIO 3 | ADC1_CH2 | RL (rear-left, left heel) |
| Left header, 4th from top | Left side | GPIO 4 | ADC1_CH3 | RR (rear-right, right heel) |

**Power pins we need:**

| Pin | Location on board | Purpose |
|-----|-------------------|---------|
| 3V3 | Left header, 1st from top | 3.3V power to breadboard + rail |
| GND | Right header, 1st from top | Ground to breadboard - rail |

All GPIO numbers are printed right on the board silkscreen, so just look for the number next to each pin.

## Sensor Placement

Stand on the board naturally with feet shoulder-width apart. Mark where your heels and balls of your feet land. Place the 4 square FSRs at these positions:

```
         FRONT (toes toward this edge)
    ┌──────────────────────────────┐
    │                              │
    │    ■ FL            FR ■      │
    │   (left ball)  (right ball)  │
    │                              │
    │                              │
    │                              │
    │    ■ RL            RR ■      │
    │   (left heel)  (right heel)  │
    │                              │
    └──────────────────────────────┘
         REAR (heels toward this edge)
```

- Left pair: ~12-15cm apart front-to-rear (ball to heel of your left foot)
- Right pair: same spacing, mirrored
- Left-right spacing: ~25-30cm center-to-center (roughly shoulder width)
- Stick the FSRs to the board with tape, sensing surface facing UP

The square FSRs are about 38mm x 38mm, so they cover a decent area under each contact point. Each FSR has two legs/tabs — they're interchangeable (no polarity).

## Wiring

Each FSR gets the same simple circuit — a voltage divider with a 10kΩ pull-up to 3.3V:

```
3.3V rail ──── 10kΩ resistor ────┬──── FSR ──── GND rail
                                 │
                             ADC pin
```

The junction between the resistor and the FSR goes to an ADC input pin. That's it per sensor. Four sensors = four identical copies of this circuit.

### Step-by-Step Breadboard Wiring

**Step 1: Seat the ESP32 on the breadboard.**

Push the DevKitC-1 into the breadboard so it straddles the center channel. The board is wide — on a standard breadboard you'll have 1-2 free tie points on each side. The USB-C connector should hang off one end of the breadboard for easy cable access.

**Step 2: Power rails.**

- Run a jumper wire from the **3V3 pin** (left header, top pin) to the breadboard **+ rail** (red).
- Run a jumper wire from the **GND pin** (right header, top pin) to the breadboard **- rail** (blue).
- If your breadboard has split rails, bridge both halves.

**Step 3: Wire FSR #1 (FL — front-left, left ball).**

- Insert a 10kΩ resistor from the **+ rail** (3.3V) to an empty row on the breadboard (let's call it row A).
- The FSR has two legs/tabs. Plug one leg into **row A** (same row as the resistor). Plug the other leg into the **- rail** (GND).
- Run a jumper wire from **row A** to the **GPIO 1 pin** on the ESP32 (right header, 4th pin from top).

**Step 4: Wire FSR #2 (FR — front-right, right ball).**

- Same thing: 10kΩ from + rail to a new row B.
- FSR from row B to - rail.
- Jumper from row B to **GPIO 2** (right header, 5th pin from top).

**Step 5: Wire FSR #3 (RL — rear-left, left heel).**

- 10kΩ from + rail to row C.
- FSR from row C to - rail.
- Jumper from row C to **GPIO 3** (left header, 15th pin from top — count down from 3V3).

**Step 6: Wire FSR #4 (RR — rear-right, right heel).**

- 10kΩ from + rail to row D.
- FSR from row D to - rail.
- Jumper from row D to **GPIO 4** (left header, 4th pin from top).

**Step 7: Double-check before plugging in USB.**

- No shorts between + and - rails (multimeter continuity mode between 3V3 and GND — should beep = BAD, should NOT beep = GOOD).
- Each FSR has one leg at the resistor junction and one leg at GND.
- Each jumper goes to the junction row, NOT directly to 3.3V or GND.
- Total connections: 2 power wires + 4 resistors + 4 FSRs + 4 ADC jumpers = 14 connections. That's it.

### Wiring Diagram (Breadboard View)

```
    + RAIL (3.3V) ─────────────────────────────────────────────
    │         │         │         │
   [10kΩ]   [10kΩ]   [10kΩ]   [10kΩ]
    │         │         │         │
    ├──FSR──  ├──FSR──  ├──FSR──  ├──FSR──
    │    │    │    │    │    │    │    │
    │    │    │    │    │    │    │    │
    │   GND   │   GND   │   GND   │   GND
    │         │         │         │
   GPIO1    GPIO2    GPIO3    GPIO4
   (FL)     (FR)     (RL)     (RR)

    - RAIL (GND) ──────────────────────────────────────────────
```

## Quick Test (No Firmware Needed)

Before even flashing firmware, verify the wiring with a multimeter:

1. Plug in the ESP32 via USB-C. The onboard power LED should light up.
2. Set multimeter to DC voltage.
3. Probe the junction point (the breadboard row where resistor meets FSR) relative to GND.
4. **With no pressure on the FSR:** should read close to **0V** (FSR resistance is very high, almost all voltage drops across the FSR, so the junction is pulled near ground).
5. **Press the FSR firmly with your thumb:** voltage should rise toward **2-3V** (FSR resistance drops, voltage divider shifts toward 3.3V).

If voltage goes UP when you press, wiring is correct. If it doesn't change or reads 3.3V constantly, the FSR isn't in the circuit (check connections). If it reads 0V always, the FSR legs might both be in the same rail.

## Flash Firmware

See `firmware/balance_board.ino`. Flash via Arduino IDE 2.x:

1. **Install ESP32 board package:** In Arduino IDE, go to File → Preferences → Additional Board Manager URLs, add: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`. Then Tools → Board Manager → search "esp32" → install "esp32 by Espressif Systems".
2. **Select board:** Tools → Board → ESP32S3 Dev Module.
3. **Board settings:**
   - USB CDC On Boot: **Enabled**
   - USB Mode: **Hardware CDC and JTAG**
   - Flash Size: **16MB**
   - PSRAM: **OPI PSRAM**
   - Partition Scheme: **Default 4MB with spiffs** (or any scheme that fits)
4. **Select port:** Tools → Port → select the COM port that appeared when you plugged in the board. On Mac it looks like `/dev/cu.usbmodemXXXX`, on Windows `COM3` or similar, on Linux `/dev/ttyACM0`.
5. **Upload.** If it fails, hold the **BOOT button** on the DevKitC while clicking Upload, then release BOOT after "Connecting..." appears.
6. **Open Serial Monitor** at **115200 baud**. You should see the startup banner and baseline capture.

## Using It

Stand on the board with one foot on the left pair of sensors, one foot on the right pair. The firmware outputs at 20 Hz:

- Raw force values for all 4 sensors (FL, FR, RL, RR)
- Left vs right weight distribution (percentage)
- Anterior-posterior shift per foot (-1.0 = all heel, +1.0 = all ball, 0.0 = even)
- ASCII balance bar showing real-time left/right weight shift

### Data Logging

To record a session to CSV for later analysis:

```
pip install pyserial
python firmware/balance_logger.py --log my_session.csv
```

### Achilles Rehab Use

Do single-leg stance tests: stand on the injured side only and watch the anterior-posterior shift (front vs rear sensor). Compare to the healthy side. A healthy stance shows smooth, small oscillations around center. An Achilles-compensating stance often shows the weight biased toward the ball (avoiding heel load) with larger A/P oscillations.
