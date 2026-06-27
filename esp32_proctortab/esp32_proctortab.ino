#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

// ================= WIFI =================
#define WIFI_SSID "esp32"
#define WIFI_PASS "12345678"

// ================= FIREBASE =================
#define API_KEY "AIzaSyBO5bOxwb4uxkrd2Xeul6OL6k1K-PxucMI"
#define DATABASE_URL "https://shifting-tab-detector-default-rtdb.firebaseio.com/"

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

#define FIREBASE_PATH "/alerts/student1/event"

// ================= PINS =================
#define BUZZER      23

#define WHITE_LED   12   // Mapped to Pin 12 on breadboard
#define YELLOW_LED  15   // Mapped to Pin 15 on breadboard
#define RED_LED1    18   // Mapped to Pin 18 on breadboard
#define RED_LED2    22   // Mapped to Pin 22 on breadboard
#define RED_LED3    25   // Mapped to Pin 25 on breadboard
#define RED_LED4    26   // Mapped to Pin 26 on breadboard (Updated from 28 for compatibility)

// ================= CLEAR =================
void clearAll() {
  digitalWrite(WHITE_LED, LOW);
  digitalWrite(YELLOW_LED, LOW);
  digitalWrite(RED_LED1, LOW);
  digitalWrite(RED_LED2, LOW);
  digitalWrite(RED_LED3, LOW);
  digitalWrite(RED_LED4, LOW);

  noTone(BUZZER);
}

// ================= SOUND =================
void beep(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER, HIGH);
    delay(250);

    digitalWrite(BUZZER, LOW);
    delay(150);
  }
}

// ================= ALERT CORE =================
void alert(int ledPin, int beepCount) {
  clearAll();
  digitalWrite(ledPin, HIGH);
  beep(beepCount);
  delay(1000); // slight hold
  clearAll();
}

// ================= ALERTS =================
void ts1Alert() { alert(WHITE_LED, 1); }      // White LED (Pin 12)
void ts2Alert() { alert(YELLOW_LED, 2); }     // Yellow LED (Pin 15)
void ts3Alert() { alert(RED_LED1, 3); }       // Red LED 1 (Pin 18)

void screenshotAlert() { alert(RED_LED2, 1); } // Red LED 2 (Pin 22)
void mouseAlert() { alert(RED_LED3, 1); }      // Red LED 3 (Pin 25)
void fullscreenAlert() { alert(RED_LED4, 1); } // Red LED 4 (Pin 26)

// ================= SETUP =================
void setup() {
  Serial.begin(115200);

  pinMode(BUZZER, OUTPUT);
  pinMode(WHITE_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);
  pinMode(RED_LED1, OUTPUT);
  pinMode(RED_LED2, OUTPUT);
  pinMode(RED_LED3, OUTPUT);
  pinMode(RED_LED4, OUTPUT);

  clearAll();

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected!");

  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;

  auth.user.email = "anggebenesano@gmail.com";
  auth.user.password = "angelie#2004";

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  Serial.println("Firebase Ready");
}

// ================= LOOP =================
void loop() {
  if (Firebase.RTDB.getString(&fbdo, FIREBASE_PATH)) {
    String event = fbdo.stringData();
    event.trim();

    // If a new event is written to Firebase, process it
    if (event != "") {
      Serial.println("EVENT: " + event);

      if (event == "tab_switch_1") ts1Alert();
      else if (event == "tab_switch_2") ts2Alert();
      else if (event == "tab_switch_3") ts3Alert();
      else if (event == "screen_shot") screenshotAlert();
      else if (
        event == "mouse_sensitivity" ||
        event == "mouse_move" ||
        event == "mouse_leave" ||
        event == "mouse_left" ||
        event == "mouse_right" ||
        event == "mouse_top" ||
        event == "mouse_bottom"
      ) mouseAlert();
      else if (event == "full_screen_exit") fullscreenAlert();

      // Clear the event path immediately in RTDB so it is ready for the next incoming event
      Firebase.RTDB.setString(&fbdo, FIREBASE_PATH, "");
    }
  }
  delay(50);
}
