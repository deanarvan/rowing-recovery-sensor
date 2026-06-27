/*
 * BFS Board Bring-Up Firmware — Rowing / Balance-Board Rehab Sensor PCB v2
 * -----------------------------------------------------------------------
 * Target: ESP32-S3-WROOM-1-N16R2  (custom "BFS" PCB, freelancer build)
 *
 * Hardware confirmed on the physical board via the I2C pin-finder (2026-05):
 *     I2C:  SDA = GPIO11, SCL = GPIO12
 *     ADS1115 @ 0x48   — 4 force channels A0..A3 (MCP6044 inverting front-end)
 *     BNO055  @ 0x28   — 9-DOF IMU, on-board 32.768 kHz crystal
 *
 * Channel map (per PCB_V2_REDESIGN_BRIEF, connectors J2..J5):
 *     A0 = Left Heel     A1 = Left Toe
 *     A2 = Right Heel    A3 = Right Toe
 *
 * FRONT-END POLARITY: FlexiForce drives an MCP6044 *inverting* amp, so Vout
 * RISES with applied force (~0 V no-load -> ~3 V full scale). Higher counts =
 * more force. This is the OPPOSITE of the old FSR voltage-divider prototype
 * (balance_board.ino), so do not reuse its inversion. With nothing plugged
 * into a channel, that channel just sits at its no-load baseline.
 *
 * OUTPUTS (both at once):
 *   - Serial @115200 : human-readable diagnostic (5 Hz) for bench bring-up
 *   - BLE "Rowing_Sensors" : 50 Hz notify, web-app-compatible payload —
 *       bytes 0..11  = 6x uint16 LE force (heel/ball/toe per foot; ball=0)
 *       bytes 12..17 = 3x int16 LE IMU Euler, centi-degrees (pitch/roll/yaw)
 *     The current web app reads only bytes 0..11 and ignores the IMU tail,
 *     so it keeps working; a future update can read orientation.
 *
 * BUILD (USB CDC on boot so Serial rides the S3 native USB — no UART bridge):
 *   arduino-cli compile/upload \
 *     -b esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,FlashSize=16M \
 *     -p /dev/cu.usbmodem1101
 * READ SERIAL: tap RST1, then read /dev/cu.usbmodem* with RTS held low
 * (do NOT pulse reset from the host — that knocks the app over).
 */

#include <Wire.h>
#include <Adafruit_ADS1X15.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BNO055.h>
#include <utility/imumaths.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ─── Confirmed pin map / addresses ───────────────────────────────────────────
#define I2C_SDA   11
#define I2C_SCL   12
#define ADS_ADDR  0x48
#define BNO_ADDR  0x28

// ─── Channel indices (J2..J5) ────────────────────────────────────────────────
enum { LEFT_HEEL = 0, LEFT_TOE = 1, RIGHT_HEEL = 2, RIGHT_TOE = 3 };
static const char* CH_LABEL[4] = { "L-Heel", "L-Toe ", "R-Heel", "R-Toe " };

// ─── BLE identity (must match web/src/hooks/useForceData.js) ──────────────────
#define BLE_NAME            "Rowing_Sensors"
#define SERVICE_UUID        "4fafc201-1fb5-459e-8bcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

struct __attribute__((packed)) Payload {
  uint16_t left_heel;   // byte 0   (ADS A0)
  uint16_t left_ball;   // byte 2   always 0 — no ball sensor on this board
  uint16_t left_toe;    // byte 4   (ADS A1)
  uint16_t right_heel;  // byte 6   (ADS A2)
  uint16_t right_ball;  // byte 8   always 0
  uint16_t right_toe;   // byte 10  (ADS A3)
  int16_t  pitch_cd;    // byte 12  IMU pitch, centi-degrees
  int16_t  roll_cd;     // byte 14  IMU roll,  centi-degrees
  int16_t  yaw_cd;      // byte 16  IMU yaw/heading, centi-degrees
  uint8_t  cal;         // byte 18  BNO055 calibration: (sys<<6)|(gyro<<4)|(accel<<2)|mag, 0..3 each
};

// ─── Globals ──────────────────────────────────────────────────────────────────
Adafruit_ADS1115 ads;
Adafruit_BNO055  bno(55, BNO_ADDR, &Wire);

bool adsOK = false, bnoOK = false;

int16_t  gRaw[4]   = {0, 0, 0, 0};      // latest raw ADS counts (signed)
int16_t  gBase[4]  = {0, 0, 0, 0};      // per-channel no-load baseline (captured at boot)
float    gEuler[3] = {0, 0, 0};          // pitch, roll, yaw (deg)
uint8_t  gCal[4]   = {0, 0, 0, 0};       // sys, gyro, accel, mag (0..3)

BLEServer*         pServer = nullptr;
BLECharacteristic* pChar   = nullptr;
bool connected = false, wasConnected = false;

class SrvCB : public BLEServerCallbacks {
  void onConnect(BLEServer*)    override { connected = true;  Serial.println("[BLE] web app connected"); }
  void onDisconnect(BLEServer*) override { connected = false; Serial.println("[BLE] web app disconnected"); }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
static inline uint16_t clampU16(int v) { if (v < 0) return 0; if (v > 65535) return 65535; return (uint16_t)v; }

static void sampleSensors() {
  if (adsOK) {
    gRaw[LEFT_HEEL]  = ads.readADC_SingleEnded(0);
    gRaw[LEFT_TOE]   = ads.readADC_SingleEnded(1);
    gRaw[RIGHT_HEEL] = ads.readADC_SingleEnded(2);
    gRaw[RIGHT_TOE]  = ads.readADC_SingleEnded(3);
  }
  if (bnoOK) {
    imu::Vector<3> e = bno.getVector(Adafruit_BNO055::VECTOR_EULER);
    gEuler[0] = e.z();   // pitch
    gEuler[1] = e.y();   // roll
    gEuler[2] = e.x();   // yaw / heading
    bno.getCalibration(&gCal[0], &gCal[1], &gCal[2], &gCal[3]);
  }
}

static Payload buildPayload() {
  Payload p = {};
  p.left_heel  = clampU16(gRaw[LEFT_HEEL]  - gBase[LEFT_HEEL]);
  p.left_toe   = clampU16(gRaw[LEFT_TOE]   - gBase[LEFT_TOE]);
  p.right_heel = clampU16(gRaw[RIGHT_HEEL] - gBase[RIGHT_HEEL]);
  p.right_toe  = clampU16(gRaw[RIGHT_TOE]  - gBase[RIGHT_TOE]);
  // ball fields intentionally 0; force = raw - no-load baseline (rest -> 0)
  p.pitch_cd = (int16_t)(gEuler[0] * 100.0f);
  p.roll_cd  = (int16_t)(gEuler[1] * 100.0f);
  p.yaw_cd   = (int16_t)(gEuler[2] * 100.0f);
  p.cal      = (uint8_t)((gCal[0] << 6) | (gCal[1] << 4) | (gCal[2] << 2) | gCal[3]); // sys,gyro,accel,mag
  return p;
}

static void printDiag() {
  Serial.println("--------------------------------------------------------------");
  for (int i = 0; i < 4; i++) {
    int force = gRaw[i] - gBase[i]; if (force < 0) force = 0;
    Serial.printf("  %s  raw=%6d  base=%5d  force=%6d%s\n",
                  CH_LABEL[i], gRaw[i], gBase[i], force, adsOK ? "" : "  [ADS not found]");
  }
  if (bnoOK) {
    Serial.printf("  IMU   pitch=%7.2f  roll=%7.2f  yaw=%7.2f   cal[S%d G%d A%d M%d]\n",
                  gEuler[0], gEuler[1], gEuler[2], gCal[0], gCal[1], gCal[2], gCal[3]);
  } else {
    Serial.println("  IMU   [BNO055 not found @0x28]");
  }
  Serial.printf("  BLE   %s\n", connected ? "connected — streaming 50 Hz" : "advertising as \"" BLE_NAME "\"");
}

// ─── No-load baseline ─────────────────────────────────────────────────────────
// Average each channel's resting (unloaded) ADC value so the BLE stream sends
// force-above-baseline: ~0 at rest, rising with applied force. The MCP6044 front
// end rests at Vref (~4500 counts), so without this the web app sees a giant
// constant offset. Re-capture by resetting the board while UNLOADED (tap RST1).
static void captureBaseline() {
  const int N = 64;
  long acc[4] = {0, 0, 0, 0};
  for (int s = 0; s < N; s++) {
    acc[0] += ads.readADC_SingleEnded(0);
    acc[1] += ads.readADC_SingleEnded(1);
    acc[2] += ads.readADC_SingleEnded(2);
    acc[3] += ads.readADC_SingleEnded(3);
    delay(4);
  }
  for (int i = 0; i < 4; i++) gBase[i] = (int16_t)(acc[i] / N);
  Serial.printf("[BASELINE] %s=%d  %s=%d  %s=%d  %s=%d\n",
                CH_LABEL[0], gBase[0], CH_LABEL[1], gBase[1],
                CH_LABEL[2], gBase[2], CH_LABEL[3], gBase[3]);
}

// ─── Setup ────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  uint32_t t0 = millis();
  while (!Serial && millis() - t0 < 2000) delay(10);

  Serial.println("\n==== BFS Board Bring-Up Firmware ====");
  Serial.printf("I2C SDA=GPIO%d SCL=GPIO%d | ADS1115@0x%02X | BNO055@0x%02X\n",
                I2C_SDA, I2C_SCL, ADS_ADDR, BNO_ADDR);

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(400000);

  // ADS1115 — single-supply, op-amp output 0..~3 V
  adsOK = ads.begin(ADS_ADDR, &Wire);
  if (adsOK) {
    ads.setGain(GAIN_ONE);                 // +/-4.096 V FS — covers the 0..3.3 V swing
    ads.setDataRate(RATE_ADS1115_250SPS);
    Serial.println("[ADS1115] OK @0x48  (gain +/-4.096V, 250 SPS)");
  } else {
    Serial.println("[ADS1115] NOT FOUND @0x48");
  }

  if (adsOK) {
    Serial.println("[BASELINE] capturing no-load baseline -- keep the board UNLOADED...");
    captureBaseline();
  }

  // BNO055 — full sensor fusion, on-board crystal
  bnoOK = bno.begin(OPERATION_MODE_NDOF);
  if (bnoOK) {
    delay(50);
    bno.setExtCrystalUse(true);
    Serial.println("[BNO055] OK @0x28  (NDOF fusion, external crystal)");
  } else {
    Serial.println("[BNO055] NOT FOUND @0x28");
  }

  // BLE
  BLEDevice::init(BLE_NAME);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new SrvCB());
  BLEService* svc = pServer->createService(SERVICE_UUID);
  pChar = svc->createCharacteristic(
            CHARACTERISTIC_UUID,
            BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  pChar->addDescriptor(new BLE2902());
  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  // Explicit packets so discovery is bulletproof:
  //  - MAIN advertisement carries the NAME (Chrome filters by namePrefix 'Rowing_S')
  //  - SCAN RESPONSE carries the 128-bit service UUID (won't fit beside the name)
  BLEAdvertisementData advData;
  advData.setFlags(0x06);
  advData.setName(BLE_NAME);
  adv->setAdvertisementData(advData);
  BLEAdvertisementData scanResp;
  scanResp.setCompleteServices(BLEUUID(SERVICE_UUID));
  adv->setScanResponseData(scanResp);
  BLEDevice::startAdvertising();
  Serial.println("[BLE] advertising as \"" BLE_NAME "\"");

  Serial.println("\nStreaming. (no FlexiForce plugged in -> force channels sit at baseline)\n");
}

// ─── Loop ─────────────────────────────────────────────────────────────────────
static uint32_t lastBle = 0, lastSerial = 0;

void loop() {
  uint32_t now = millis();

  // 50 Hz sample + BLE notify
  if (now - lastBle >= 20) {
    lastBle = now;
    sampleSensors();
    if (connected && pChar) {
      Payload p = buildPayload();
      pChar->setValue((uint8_t*)&p, sizeof(p));
      pChar->notify();
    }
  }

  // 5 Hz serial diagnostic
  if (now - lastSerial >= 200) {
    lastSerial = now;
    printDiag();
  }

  // BLE reconnect handling
  if (!connected && wasConnected) { delay(300); pServer->startAdvertising(); wasConnected = false; }
  if (connected && !wasConnected) { wasConnected = true; }
}
