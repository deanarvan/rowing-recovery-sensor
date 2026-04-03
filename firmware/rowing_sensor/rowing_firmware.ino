#include <Wire.h>
#include <Adafruit_ADS1X15.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// Instantiate the two ADCs using their physical I2C addresses
Adafruit_ADS1115 adsLeft;
Adafruit_ADS1115 adsRight;

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// Custom UUIDs for our Web App to scan for
#define SERVICE_UUID        "4fafc201-1fb5-459e-8bcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// Unpadded 12-byte payload to send over Bluetooth efficiently
struct __attribute__((packed)) SensorData {
  uint16_t left_heel;
  uint16_t left_ball;
  uint16_t left_toe;
  uint16_t right_heel;
  uint16_t right_ball;
  uint16_t right_toe;
};

SensorData sensorData;

// Handle connect and disconnect events
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("Web App Connected!");
    };
    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("Web App Disconnected");
    }
};

void setup() {
  Serial.begin(115200);

  // ESP32-S3 I2C pins (determined by PCB trace routing)
  Wire.begin(8, 9);  // SDA = GPIO8, SCL = GPIO9

  // 1. Initialize ADS1115 (Left ADS is ADDR to GND -> 0x48)
  if (!adsLeft.begin(0x48, &Wire)) {
    Serial.println("Failed to initialize Left ADS1115 (0x48). Check wiring.");
  }
  // Initialize ADS1115 (Right ADS is ADDR to 3.3V -> 0x49)
  if (!adsRight.begin(0x49, &Wire)) {
    Serial.println("Failed to initialize Right ADS1115 (0x49). Check wiring.");
  }

  // 2. Setup BLE
  BLEDevice::init("Rowing_Sensors");

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // Create the BLE Service
  BLEService *pService = pServer->createService(SERVICE_UUID);

  // Create a BLE Characteristic capable of "Notifying" the Web App
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_NOTIFY 
                    );

  // Create a BLE Descriptor required for Notify
  pCharacteristic->addDescriptor(new BLE2902());

  // Start the service
  pService->start();

  // Start broadcasting the BLE signal so the Web App can see it
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(false);
  pAdvertising->setMinPreferred(0x0);  
  BLEDevice::startAdvertising();
  
  Serial.println("ESP32 Rowing Node Ready. Waiting for Web App to pair...");
}

void loop() {
    // If paired with the browser, read ADCs and send data!
    if (deviceConnected) {
        // Read Left Foot
        sensorData.left_heel = adsLeft.readADC_SingleEnded(0);
        sensorData.left_ball = adsLeft.readADC_SingleEnded(1);
        sensorData.left_toe = adsLeft.readADC_SingleEnded(2);

        // Read Right Foot
        // NOTE: PCB defect — 0x49 A0 and A1 are shorted (same trace).
        // Reading A1 returns duplicate of A0. Use A0 for heel, zero ball, A2 for toe.
        sensorData.right_heel = adsRight.readADC_SingleEnded(0);
        sensorData.right_ball = 0;  // DISABLED — shorted to A0 on PCB (Kashif batch)
        sensorData.right_toe = adsRight.readADC_SingleEnded(2);

        // Push 12 bytes over Bluetooth
        pCharacteristic->setValue((uint8_t*)&sensorData, sizeof(sensorData));
        pCharacteristic->notify();
        
        // 50Hz sample rate. Bluetooth stack needs slight delay. 
        delay(20); 
    }
    
    // Handling disconnects so you can pair again
    if (!deviceConnected && oldDeviceConnected) {
        delay(500); // give the bluetooth stack the chance to get things ready
        pServer->startAdvertising(); // restart advertising
        Serial.println("Client disconnected. Restarting BLE advertising...");
        oldDeviceConnected = deviceConnected;
    }
    
    if (deviceConnected && !oldDeviceConnected) {
        oldDeviceConnected = deviceConnected;
    }
}
