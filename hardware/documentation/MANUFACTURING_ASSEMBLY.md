# Manufacturing & Assembly Guide
## Rowing/Balance Board Rehabilitation Sensor PCB

---

## Section 1: Pre-Manufacturing Preparation

### Design Files Required for Manufacturing

Before ordering your PCB, ensure you have all required Gerber files exported from KiCad:

**Essential Gerber Files:**
```
rowing-sensor-F.Cu          (Top copper layer)
rowing-sensor-B.Cu          (Bottom copper layer)
rowing-sensor-F.Mask        (Top solder mask)
rowing-sensor-B.Mask        (Bottom solder mask)
rowing-sensor-F.SilkS       (Top silkscreen)
rowing-sensor-B.SilkS       (Bottom silkscreen)
rowing-sensor-Edge.Cuts     (Board outline/dimensions)
rowing-sensor.drl           (Drill file for PTH and vias)
```

**Export Settings for KiCad:**

1. Go to: File → Plot
2. Select Plot Format: **Gerber**
3. **Gerber Options:**
   - Plot pad and via holes
   - Plot footprint references: YES
   - Plot footprint values: NO
   - Subtract soldermask from silkscreen: YES
4. **Included Layers:**
   - Front copper (F.Cu)
   - Back copper (B.Cu)
   - Front silkscreen (F.SilkS)
   - Back silkscreen (B.SilkS)
   - Front mask (F.Mask)
   - Back mask (B.Mask)
   - Edge cuts (Edge.Cuts)
5. Click "Plot All"
6. Then go to: File → Fabrication Outputs → Drill File
   - Format: Excellon
   - Mirror Y-axis: NO
   - Generate map file: YES

**Create ZIP file containing all Gerber files:**
- Create folder: `rowing-sensor_gerbers`
- Copy all .gbr files
- Copy .drl file
- ZIP entire folder
- File should be < 5MB

### Pre-Manufacturing Checklist

- [ ] All Gerber files generated and verified
- [ ] Design rule check (DRC) passed with no errors
- [ ] Board dimensions verified: 50mm × 70mm
- [ ] No isolated copper (floating traces)
- [ ] All signal integrity requirements met
- [ ] Via size and spacing correct (0.3mm dia minimum)
- [ ] Trace width/spacing correct per manufacturer specs
- [ ] Copper thickness adequate (1oz standard)
- [ ] Layer stackup verified (2-layer)
- [ ] 3D preview reviewed in KiCad
- [ ] Fab notes added to silkscreen or design notes
- [ ] BOM checked and parts available
- [ ] Quote obtained from manufacturer
- [ ] Budget approved and order ready to submit

---

## Section 2: Manufacturing via JLCPCB

### Step-by-Step JLCPCB Ordering Process

#### Step 1: Prepare Files
1. Create a folder named `rowing-sensor_gerbers`
2. Place all Gerber files (.gbr extension) in folder
3. Place drill file (.drl) in folder
4. ZIP the folder: `rowing-sensor_gerbers.zip`
5. File size should be under 5MB

#### Step 2: Navigate to JLCPCB Website
1. Go to: https://www.jlcpcb.com/
2. Click "Quote Now" or "Order Now"

#### Step 3: Upload Gerber File
1. Click "Add Gerber File"
2. Select your ZIP file
3. JLCPCB automatically detects board dimensions and layer count
4. Wait for processing (typically < 1 minute)

#### Step 4: Select Board Options

**PCB Specifications:**
- Dimension: 50 × 70 mm ✓ (auto-detected)
- Quantity: Start with 5 boards (minimum for good pricing)
- Layers: 2 layers ✓
- Material: FR-4 TG130-140
- Thickness: 1.6mm (standard)
- Min Track/Spacing: 0.2mm / 0.15mm
- Min Via: 0.3mm
- Copper Weight: 1 oz (standard)
- Surface Finish: **HASL (lead-free)** or ENIG for better solderability
- Silkscreen: White
- Gold fingers: No
- Castellated holes: No
- Flying probe test: No

**Cost Estimate:**
- 5 boards (2-layer, 50×70mm): $2-5 total
- Rush shipping (24-hour): +$10 (optional)
- Standard shipping (7-15 days): FREE
- DHL Shipping: ~$15-20

#### Step 5: Review & Place Order
1. Review all settings one more time
2. Verify board preview matches your design
3. Accept terms and conditions
4. Place order with credit card/PayPal
5. Save order number for tracking

#### Step 6: Manufacturing Timeline
- **After order:** JLCPCB confirms file processing
- **Day 1-2:** PCB fabrication
- **Day 2-3:** Quality inspection
- **Day 3+:** Shipping (varies by method)

---

## Section 3: Component Sourcing

### Option A: JLCPCB Full PCBA Service

If you want JLCPCB to assemble the PCB (easier for beginners):

#### Uploading BOM for Assembly

1. Prepare BOM in CSV format (included as BOM.csv)
2. Prepare CPL (component placement) file
3. Return to JLCPCB and click "Add Assembly"
4. Select assembly service:
   - **Standard Assembly:** All SMD components
   - **Surcharge:** 50% of board cost for first 5 units
5. Upload files:
   - BOM.csv
   - rowing-sensor.cpl (coordinate placement file)

#### BOM Format Requirements
```csv
Designator,Quantity,Footprint,LCSC Part Number,Value
U1,1,SOT-223,C6186,AMS1117-3.3
U2,1,QFN-28,C7520,CP2102N
... etc
```

#### CPL (Coordinate Placement File) Format
```csv
Designator,Mid X (mm),Mid Y (mm),Rotation (degrees),Layer
U1,10.5,20.3,0,top
U2,15.2,18.9,90,top
... etc
```

**Cost Estimate for Full Assembly:**
- PCB (5 units): $2-5
- Assembly surcharge: ~$5-10
- Components from LCSC: ~$75-100
- **Total per board with assembly: $20-40**

### Option B: Manual Assembly (Recommended for Prototype)

**Advantages:**
- Full control over component selection
- Can substitute parts if needed
- Better for learning and debugging
- More cost-effective for 1-2 units

#### Component Sourcing Strategy

1. **Primary Supplier:** LCSC (lcsc.com)
   - Owned by JLCPCB
   - Same warehouse, faster delivery
   - All parts in BOM available with LCSC part numbers
   - Competitive pricing

2. **Backup Suppliers:**
   - Digi-Key (digikey.com) - worldwide, fast shipping
   - Mouser (mouser.com) - extensive inventory
   - Amazon (for common components only)

#### Ordering from LCSC

1. Go to: https://www.lcsc.com/
2. For each component, search by LCSC part number
3. Add to cart
4. Total estimated cost: $12-18 per board (components only)
5. Shipping: 10-20 days to most countries
6. Free shipping over $50 USD

#### Ordering from Digi-Key (US/International)

1. Go to: https://www.digikey.com/
2. Search by part number or description
3. Components may be more expensive than LCSC
4. Domestic US shipping: 2-5 days
5. International: 5-14 days

### Stock Level Verification

Before ordering, verify component availability:

**Critical components to check:**
- ESP32-WROOM-32 (often backordered): ~2 week lead time
- CP2102N: Usually available
- ADS1115: Usually available
- Passive components: No issues

**Alternative parts if unavailable:**
- ESP32-WROOM-32 → ESP32-WROOM-32E (higher temp version, pin compatible)
- CP2102N → CH340C (same functionality, may need different footprint)
- ADS1115 → ADS1015 (lower resolution, pin compatible)

---

## Section 4: Hand Assembly Instructions

### Required Tools & Materials

**Soldering Equipment:**
- Soldering iron (60W recommended) or hot air rework station
- Solder paste (lead-free Sn/Ag/Cu alloy, leaded 63/37 acceptable)
- Flux pen (water-soluble paste flux recommended)
- Tweezers (fine-tipped, preferably ESD safe)
- Solder wick or desoldering pump (for corrections)
- Helping hands (PCB holder/third hand tool)

**Cleaning & Inspection:**
- Isopropyl alcohol (IPA) 99% purity
- Cotton swabs or soft brush
- Magnifying glass or jeweler's loupe (10x magnification)
- Lint-free wipes

**Testing & Verification:**
- Digital multimeter (basic features sufficient)
- USB-to-UART adapter (for UART testing, optional)
- Power supply (5V, 1A capable)
- Micro-USB cable

**Safety Equipment:**
- ESD wrist strap
- Safety glasses
- Soldering fume extractor or open window
- Wet sponge or brass wool for iron cleaning

### Pre-Assembly Setup

1. **Workspace Preparation:**
   - Clean work surface with IPA
   - Anti-static mat recommended
   - Good lighting (desk lamp + overhead light)
   - Temperature: 20-25°C for optimal soldering
   - Humidity: 40-60% (avoid dry conditions)

2. **Component Preparation:**
   - Lay out all components on clean surface
   - Organize by reference designator
   - Verify against BOM
   - Check for visible damage
   - Store IC chips in anti-static bag until needed

3. **PCB Preparation:**
   - Clean board with IPA and lint-free wipe
   - Dry completely with compressed air if available
   - Inspect for manufacturing defects
   - Verify no solder bridges from manufacturing

4. **Soldering Iron Calibration:**
   - Preheat iron to 350-380°C (iron tip should glow slightly)
   - Test on scrap solder - should melt quickly
   - Wipe on damp sponge or brass wool before each joint

### Detailed Assembly Steps

#### Phase 1: Apply Solder Paste

**Option A: Using Solder Paste & Reflow**

1. Print or create a solder paste stencil (optional but recommended)
2. Place stencil over PCB, align with fiducial marks if available
3. Apply solder paste with squeegee:
   - At 45° angle
   - Single stroke across board
   - Even pressure (don't press hard)
4. Remove stencil carefully
5. Verify paste coverage:
   - Each pad should have paste
   - Paste should not bridge pads
   - Paste height: 0.1-0.15mm

**Option B: Manual Paste Application**

1. Use solder paste with syringe applicator
2. Apply small dot to each pad:
   - Volume: match pad size (typically 0.1-0.3mm)
   - Too much → bridges; Too little → cold solder
3. Use flux pen to spread paste if needed

#### Phase 2: Reflow Soldering Process

**If using reflow oven (preferred):**

1. Set oven profile:
   - Preheat: 100-150°C for 2-3 min
   - Thermal soak: 150-200°C for 1-2 min
   - Reflow peak: 240-260°C for 10-30 seconds
   - Cool: Natural cooling to <100°C

2. Place assembled board in oven
3. Monitor temperature curve
4. Remove board when cool enough to touch (~60°C)

**If using hot air station (manual method):**

1. Set air flow to medium (~15-20% power)
2. Set temperature to 350°C
3. Hover over each component area:
   - Keep distance: 2-3cm
   - Duration: 5-10 seconds per chip
   - Watch for solder to become shiny (liquid)
   - Move away when solder wets pads
4. Allow board to cool naturally

**If using soldering iron (time-consuming but works):**

1. For each component:
   - Heat both pads simultaneously (iron tip touching both)
   - Apply solder to joint (not iron)
   - Remove iron once solder flows
   - Duration: 2-3 seconds per joint
2. Start with passive components (resistors, capacitors)
3. Then ICs and modules

#### Phase 3: Component Placement Sequence

**For Reflow Method (paste + components):**

1. **Passives First:**
   - R1-R15 (resistors) - smallest, first to place
   - C1-C11 (capacitors) - slightly larger
   - Verify orientation (resistors/caps have no polarity)

2. **ICs (Medium complexity):**
   - U4, U5 (ADS1115 MSOP-10) - 10 pins, easier
   - U2 (CP2102N QFN-28) - 28 pins, requires care
   - U1 (AMS1117 SOT-223) - 3 pins, simple

3. **Large Modules (Last):**
   - U3 (ESP32-WROOM-32) - 38 pins, most critical
   - Place carefully, ensure good contact

4. **Connectors & Discrete:**
   - J1 (USB-C) - must be aligned perfectly
   - J2-J8 (JST connectors) - straightforward
   - LED1 (check polarity: long leg = anode = 3V3)
   - SW1, SW2 (buttons) - no polarity

#### Phase 4: Verification (Post-Reflow)

1. **Visual Inspection:**
   - Examine each solder joint with magnification
   - Look for:
     - Shiny appearance (good) vs dull (cold solder)
     - No bridges between pads
     - All pads have solder coverage
     - No missing components

2. **Repair Cold Solder Joints:**
   - Add a small amount of flux
   - Reflow with iron at 350°C
   - Touch iron to joint for 1-2 seconds
   - Add tiny amount of solder if needed

3. **Remove Bridges:**
   - Use desoldering wick:
     - Place wick on bridge
     - Heat with iron (2-3 seconds)
     - Remove wick + solder
   - Or use solder pump to suck up excess solder

### Hand Soldering Details (If No Reflow Oven)

#### Soldering Resistors (R1-R15)

1. Place resistor on PCB (no polarity)
2. Bend legs slightly to hold in place
3. Heat both pads with iron tip:
   - Tip should contact both pads simultaneously
   - Temperature: 350-380°C
   - Duration: 2-3 seconds
4. Apply solder to joint (not iron):
   - Just a small amount needed
   - Solder should flow between pad and leg
5. Remove iron and let cool

**Correct joint:** Shiny, cone-shaped, smooth
**Wrong joints:**
- Cold solder: Dull, grainy appearance
- Too much solder: Large blob, risk of bridges
- Insufficient heat: Solder doesn't flow

#### Soldering Capacitors (C1-C11)

1. Place capacitor on PCB (verify polarity if electrolytic)
   - For electrolytic: longer leg = positive, stripe = negative
   - For ceramic/film: no polarity concerns
2. Bend legs slightly to hold in place
3. Solder both ends with iron (same as resistors)
4. Verify solder coverage on both pads

#### Soldering ICs (U1, U2, U4, U5)

**For SOT-223 (U1 - AMS1117):**
1. Place IC on PCB (verify orientation - lettering should be readable)
2. Start with one pin:
   - Heat pad + IC pin with iron
   - Apply tiny solder ball
   - Let cool
3. Then solder remaining 2 pins normally
4. Verify no bridges between pins

**For MSOP-10 (U4, U5 - ADS1115):**
1. Place IC on PCB (use magnification to verify alignment)
2. Solder one corner pin first to hold in place
3. Solder remaining pins one by one:
   - Heat pad + IC pin for 1-2 seconds
   - Apply solder to joint
   - Move to next pin
4. Check for bridges between pins (common with MSOP packages)
5. Use desoldering wick to remove any bridges

**For QFN-28 (U2 - CP2102N):**
1. This is trickiest - use extra care
2. Place IC with alignment verification
3. Solder one corner pin to hold
4. Solder all visible perimeter pins
5. Check alignment before soldering center pins
6. Use flux to help solder flow between pads
7. Inspect thoroughly for bridges

#### Soldering ESP32 Module (U3)

1. This is the most critical component
2. Verify antenna area clearance
3. Align module carefully with pads
4. Solder corner pins first (6 corner pads):
   - Pin 1, 38, 15, 22 (approximate corners)
5. Solder remaining pins methodically
6. Use magnification to verify alignment as you go
7. Final check: all pins soldered, no bridges

#### Soldering Connectors (J1-J8)

**USB-C Connector (J1):**
1. Most critical connector for power and programming
2. Alignment is crucial - use multiple passes if needed
3. Solder GND tabs first (pins 1, 9)
4. Then solder data pins (D+, D-)
5. Finally VBUS (power pin 5)
6. Verify with multimeter:
   - VBUS to GND: should show short when powered
   - D+ to D-: should be open (not shorted)

**JST-PH Connectors (J2-J8):**
1. Standard 2-pin connector
2. Simple to solder (only 2 pins each)
3. Verify orientation: pin 1 should align with marking

#### Soldering LEDs & Buttons

**Red LED (LED1):**
1. Polarity is critical:
   - Long leg (anode) → connects to 3V3 (through R7)
   - Short leg (cathode) → connects to GND
2. After soldering, test with 3.3V (should glow dimly)

**Buttons (SW1, SW2):**
1. No polarity - can be soldered either way
2. Verify they press smoothly
3. Test with multimeter after soldering:
   - Should show low resistance when pressed
   - Should show high resistance when released

---

## Section 5: Quality Control & Testing

### Electrical Testing (Before Power-On)

#### Continuity Testing

With power OFF, use digital multimeter in continuity mode:

**Test 1: Check for shorts**
```
Connection                    Expected Result
5V_USB to GND                High impedance (beep = BAD)
3V3 to GND                   High impedance (beep = BAD)
SDA to GND                   ~4.7kΩ (pull-up resistor)
SCL to GND                   ~4.7kΩ (pull-up resistor)
```

**Test 2: Verify power traces**
```
Connection                    Expected Result
USB connector pin 5 to U1     Should show ~0Ω (direct trace)
U1 output (pin 2) to 3V3      Should show ~0Ω
3V3 to U3 VCC pins            Should show ~0Ω
GND connections               All should be ~0Ω (solid ground plane)
```

#### Visual Inspection Checklist

After assembly, examine board carefully:

- [ ] All solder joints are shiny and smooth (not dull)
- [ ] No visible bridges between pads
- [ ] No cold solder joints (grainy appearance)
- [ ] All components are flush against board
- [ ] No lifted component legs
- [ ] USB connector is properly aligned
- [ ] Buttons move freely
- [ ] LED is in correct orientation
- [ ] No flux residue on board (or residue is clean)
- [ ] PCB has no physical damage

### Initial Power-On Testing

**WARNING: Use external 5V power supply, NOT computer USB initially**

#### Power-On Sequence

1. **Prepare power supply:**
   - Set to 5V output
   - Current limit to 500mA (protects against shorts)
   - Keep ready to disable if anything goes wrong

2. **First power attempt (very brief):**
   - Connect power supply negative (black) to PCB GND
   - Connect power supply positive (red) to PCB 5V_USB
   - Look for LED1 illumination
   - Check for unusual warmth or smoke
   - Duration: 2-3 seconds maximum

3. **If all OK, continue to full power:**
   - Keep powered for 30 seconds
   - Check U1 (AMS1117) for warmth (should be slightly warm, not hot)
   - If getting hot: disconnect power, check for shorts
   - Measure voltage:
     - 5V_USB: should read 5.0V ±0.5V
     - 3V3: should read 3.3V ±0.1V

4. **If any problems:**
   - Disconnect immediately
   - Use multimeter to check for shorts
   - Visually inspect solder joints
   - Look for solder bridges or lifted components
   - Repair issues before retry

#### Detailed Voltage Measurements

Once power is verified stable:

**Test point measurements with 5V external power applied:**

| Test Point | Expected Voltage | Tolerance | Notes |
|-----------|------------------|-----------|-------|
| 5V_USB rail | 5.0V | ±0.5V | USB input rail |
| 3V3 rail | 3.3V | ±0.1V | Main logic power |
| U1 GND pin | 0.0V | ±0.05V | Reference |
| U3 GND pins | 0.0V | ±0.05V | Reference |
| GPIO0 pin | 3.3V | ±0.2V | Should read high (pulled up) |
| EN pin | 3.3V | ±0.2V | Should read high (pulled up) |
| I2C SDA | 3.3V | ±0.2V | Should read high (pulled up) |
| I2C SCL | 3.3V | ±0.2V | Should read high (pulled up) |

### I2C Bus Communication Test

#### Required: I2C Scanner Firmware

Once powered successfully:

1. **Connect USB:**
   - Connect USB-C cable from PCB to computer
   - CP2102N should be recognized as USB serial device
   - Windows: May need driver (see below)
   - Mac/Linux: Usually automatic

2. **Windows Driver Installation (if needed):**
   - Download from: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
   - Install CP210x Universal Windows Driver
   - Restart computer
   - Device should appear as "COM" port

3. **Flash I2C Scanner Firmware:**
   - Use Arduino IDE or ESP-IDF
   - Code available at: https://github.com/espressif/arduino-esp32/blob/master/libraries/Wire/examples/i2c_scanner/i2c_scanner.ino
   - Flash with BOOT + RESET button sequence:
     1. Hold BOOT button (SW1)
     2. Press RESET button (SW2)
     3. Release RESET button
     4. Release BOOT button
     5. ESP32 should now be in bootloader mode
   - Select COM port and flash

4. **Run I2C Scanner:**
   - Open serial monitor (115200 baud)
   - ESP32 will scan I2C bus and report addresses
   - Expected output:
     ```
     i2c scanner
     Scanning...
     I2C device found at address 0x48 (ADS1115 #1)
     I2C device found at address 0x49 (ADS1115 #2)
     Done
     ```

#### Troubleshooting I2C Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| No I2C devices found | SDA/SCL lines shorted | Check for solder bridges on I2C lines |
| No I2C devices found | Pull-ups missing | Verify R10, R11 are 4.7kΩ and connected |
| Partial scan result | One ADS chip not responding | Check ADDR pin connections (R4 to GND, R5 to 3V3) |
| I2C bus is stuck low | Component pin shorted | Carefully inspect ADS ICs for cold solder |
| Serial monitor shows garbage | Wrong baud rate | Verify 115200 baud rate |
| No serial port visible | CP2102N not recognized | Install CP210x drivers, check USB cable |

### Analog Input Testing

#### Test without FSR sensors

1. **Power the board with USB**
2. **Create test sketch** to read ADS1115 values:
   ```cpp
   #include <Wire.h>
   #include <Adafruit_ADS1X15.h>

   Adafruit_ADS1115 ads1(0x48);
   Adafruit_ADS1115 ads2(0x49);

   void setup() {
     Serial.begin(115200);
     ads1.begin();
     ads2.begin();
   }

   void loop() {
     int16_t adc0 = ads1.readADC_SingleEnded(0);
     int16_t adc1 = ads1.readADC_SingleEnded(1);
     int16_t adc2 = ads1.readADC_SingleEnded(2);
     int16_t adc3 = ads2.readADC_SingleEnded(0);
     int16_t adc4 = ads2.readADC_SingleEnded(1);
     int16_t adc5 = ads2.readADC_SingleEnded(2);

     Serial.print("LH:");Serial.print(adc0);Serial.print(" LB:");Serial.print(adc1);
     Serial.print(" LT:");Serial.print(adc2);Serial.print(" RH:");Serial.print(adc3);
     Serial.print(" RB:");Serial.print(adc4);Serial.print(" RT:");Serial.println(adc5);
     delay(50);  // 50ms = 20Hz sampling
   }
   ```

3. **Test each channel:**
   - With nothing connected: should read ~0
   - Jumper pin 2 of connector to 3V3: should read maximum (~32767)
   - Jumper pin 2 of connector to GND: should read 0
   - Cycle through all 6 channels (J2-J7)

### System-Level Testing

#### Memory & Performance

1. **ESP32 Startup Test:**
   - Power board via USB
   - Serial monitor should show startup messages:
     ```
     ets Jun  8 2016 00:22:57

     rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_BOOT)
     ...
     Ready!
     ```

2. **Free Memory Check:**
   - Add to firmware:
     ```cpp
     Serial.print("Free heap: ");
     Serial.println(ESP.getFreeHeap());
     ```
   - Should show > 100KB free heap
   - Should remain stable (not decreasing)

3. **I2C Communication Reliability:**
   - Run continuous I2C reads for 1 hour
   - Should see no errors or timeouts
   - All sensor values should be responsive

#### BLE Communication Test

1. **Flash BLE advertising firmware**
2. **Scan with phone BLE app:**
   - Download "nRF Connect" or "BLE Scanner" app
   - Should see device advertising
   - RSSI should be reasonable (-50 to -70 dBm typical)

3. **Connect and test:**
   - Connect to device
   - Should see services and characteristics
   - Verify data streaming

---

## Section 6: Troubleshooting Guide

### Common Assembly Problems & Solutions

#### Problem: Solder bridges between pads

**Symptoms:** I2C devices not responding, power issues

**Cause:** Excess solder, poor solder paste application

**Solutions:**
1. Inspect with magnification
2. Use desoldering wick:
   - Wet wick in flux
   - Place on bridge
   - Heat with iron (2 seconds)
   - Remove wick with solder
3. If bridge is between IC pins:
   - Add flux to bridge
   - Use fine iron tip
   - Carefully melt solder and let flow away
4. Re-test with multimeter

#### Problem: Cold solder joint (dull appearance)

**Symptoms:** Intermittent connections, random I2C errors

**Cause:** Insufficient heat or not enough solder

**Solutions:**
1. Apply more flux to joint
2. Reheat with clean iron
3. Add small amount of solder
4. Let cool completely
5. Re-test

#### Problem: USB connector not recognized by computer

**Symptoms:** No COM port appears, USB shows "Unknown Device"

**Cause:**
- D+ or D- line not properly soldered
- CP2102N not powered
- Solder bridge on USB lines

**Solutions:**
1. Check continuity:
   - USB pin 5 → U2 REGIN (should be 0Ω)
   - USB pin 3 (D-) → 22Ω resistor → U2 pin 4
   - USB pin 7 (D+) → 22Ω resistor → U2 pin 3
2. Measure U2 VCC: should read 3.3V
3. Check for bridges between D+/D- and power
4. Reinstall CP2102N driver on computer
5. Try different USB cable

#### Problem: I2C devices not responding (0x48 and 0x49 not found)

**Symptoms:** I2C scanner runs but finds no devices

**Cause:**
- SDA/SCL shorted together
- Pull-up resistors missing
- ADS ICs not powered
- ADDR pins not properly connected

**Solutions:**
1. Check power:
   - U4 VCC should read 3.3V
   - U5 VCC should read 3.3V
2. Check I2C pull-ups:
   - Measure SDA when idle: should read 3.3V
   - Measure SCL when idle: should read 3.3V
   - If reading 0V: pull-ups may be shorted
3. Check ADDR pins:
   - U4 ADDR: should measure 0V (connected to GND)
   - U5 ADDR: should measure 3.3V (connected to 3V3)
4. Check solder on U4/U5:
   - Inspect SDA/SCL pins for cold solder
   - Reflow if necessary
5. Check for bridges on I2C lines

#### Problem: Random crashes or resets

**Symptoms:** ESP32 resets unexpectedly, behavior is inconsistent

**Cause:**
- Power supply inadequate
- Bad solder joint
- Decoupling capacitors missing
- Firmware bug

**Solutions:**
1. Check power supply:
   - Verify 5V input is stable (multimeter or oscilloscope)
   - Verify 3V3 output doesn't sag (should stay 3.2-3.4V)
   - Try different USB cable
   - Try powered USB hub instead of computer
2. Check decoupling caps:
   - Verify C5 (100nF) soldered near U3
   - Verify C6, C7 soldered near U4, U5
3. Check solder joints:
   - Visually inspect ESP32 module
   - Check all VCC/GND connections
   - Reflow if cold solder suspected
4. Check firmware:
   - Add watchdog timer
   - Add debug logging
   - Simplify code for testing

#### Problem: LED doesn't light up

**Symptoms:** No power indication LED visible

**Cause:**
- LED polarity reversed
- R7 (current limiting resistor) wrong value
- Cold solder on LED pads
- 3V3 rail not powered

**Solutions:**
1. Check 3V3 voltage: should read 3.3V
2. Check LED polarity:
   - Remove and inspect
   - Positive leg (long) should connect toward 3V3
   - Negative leg (short) should connect toward GND
3. Check R7: should be 1kΩ (not open circuit)
4. Reflow LED solder joints
5. Replace LED if still no luck

---

## Section 7: Post-Successful Assembly Checklist

Once board is working:

- [ ] Power LED illuminates
- [ ] USB recognized by computer (COM port visible)
- [ ] I2C devices detected (0x48 and 0x49)
- [ ] UART communication works (serial monitor at 115200 baud)
- [ ] All 6 ADC channels reading valid values
- [ ] Buttons (BOOT, RESET) function correctly
- [ ] BLE advertising works (visible on phone)
- [ ] Firmware flashes successfully via USB
- [ ] No unexplained resets or crashes
- [ ] Temperature stable (no hot spots)
- [ ] Board meets 50×70mm size requirement
- [ ] All connectors have proper pinout labels
- [ ] Documentation updated with lessons learned
- [ ] Enclosure/mounting solution designed
- [ ] Production-ready for next iterations

---

## Document Version

**Version:** 1.0
**Date:** March 2026
**For:** Rowing/Balance Board Rehabilitation Sensor PCB
**Manufacturing:** JLCPCB / PCBWay compatible

---
