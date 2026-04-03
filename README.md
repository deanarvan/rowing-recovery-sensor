# Rowing Recovery Sensor

A bilateral force-sensing platform for physical therapy rehabilitation monitoring. Built for tracking lower-extremity recovery metrics — limb symmetry index (LSI), bilateral weight distribution, and force production — during exercises like bilateral stance, heel raises, and squats.

## System Architecture

```
ESP32-S3  →  2× ADS1115 (16-bit ADC)  →  6× FSR-402 sensors  →  BLE  →  Web App
              I2C (GPIO8/9)              (3 per foot: heel,       50 Hz    React/Vite
                                          ball, toe)                       localhost:5174
```

## Repository Structure

```
firmware/           ESP32 Arduino firmware
  rowing_sensor/    Main 6-axis force sensor firmware
  balance_board/    4-load-cell balance board variant
  diagnostics/      I2C scanner and pin finder tools

hardware/           PCB design and build documentation
  kicad/            KiCad schematic, layout, BOM, netlist
  documentation/    Assembly guides, pin reference, design notes

web/                React/Vite web application
  src/components/   UI components (force curves, balance viz, diagnostics)
  src/hooks/        BLE communication, data processing, stroke analysis
  src/utils/        Biomechanics algorithms, session export, calibration

tools/              Python analysis and data logging
  achilles_recovery_analysis.py   Longitudinal PT recovery analysis
  compare_subjects.py             Bilateral comparison report generator
  balance_logger.py               Serial data logger

docs/research/      Biomechanics and rehabilitation reference literature
```

## Quick Start

### Firmware
1. Open `firmware/rowing_sensor/rowing_firmware.ino` in Arduino IDE
2. Select board: ESP32-S3 Dev Module
3. Install library: Adafruit ADS1X15
4. Flash to ESP32-S3

### Web App
```bash
cd web
npm install
npm run dev
# Opens at http://localhost:5174
```

Connect to the sensor via Web Bluetooth (device name: `Rowing_Sensors`).

### Hardware
See `hardware/documentation/START_HERE.txt` for build instructions.

## Key Metrics

| Metric | Description | Clinical Threshold |
|--------|-------------|-------------------|
| LSI | Limb Symmetry Index (injured/uninvolved × 100) | >90% return to sport |
| BSI | Balance Symmetry Index (bilateral weight asymmetry) | <10% general activity |
| Peak Force | BW-normalized peak plantarflexion force | >1.5× BW running readiness |

## Hardware Versions

- **Breadboard prototype**: ESP32-S3 + breadboard + 6× FSR-402 + 2× ADS1115
- **PCB v1**: Custom PCB with same sensor array, improved signal integrity
- **Balance Board**: 4× load cell variant for standing balance assessment

## License

Private — not for redistribution.
