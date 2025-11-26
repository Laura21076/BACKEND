// Código ESP32 para Casillero Inteligente
// ESP32 DevKit V1, LCD 16x2, Teclado matricial 4x4, Servo/Solenoide
// WiFi + Bluetooth Dual Mode con Firebase Integration

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <BluetoothSerial.h>

// ===== CONFIGURACIÓN WIFI =====
const char* ssid = "TU_WIFI_SSID";
const char* password = "TU_WIFI_PASSWORD";
const char* serverUrl = "http://localhost:4000/api/esp8266/verify";

// ===== CONFIGURACIÓN BLUETOOTH =====
BluetoothSerial SerialBT;

// ===== CONFIGURACIÓN LCD =====
LiquidCrystal_I2C lcd(0x27, 16, 2); // Dirección I2C del LCD

// ===== CONFIGURACIÓN TECLADO =====
const byte ROWS = 4;
const byte COLS = 4;
char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
byte rowPins[ROWS] = {19, 18, 5, 17};  // GPIO para filas ESP32
byte colPins[COLS] = {16, 4, 0, 2};    // GPIO para columnas ESP32
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// ===== CONFIGURACIÓN SERVO/SOLENOIDE =====
Servo lockServo;
const int SERVO_PIN = 13;      // GPIO para servo
const int LED_SUCCESS = 12;    // LED verde
const int LED_ERROR = 14;      // LED rojo
const int BUZZER_PIN = 27;     // Buzzer

// ===== IDENTIFICACIÓN DEL CASILLERO =====
const String LOCKER_ID = "CASILLERO_A1";  // ID único de este casillero
const String LOCKER_NAME = "Casillero Central";
const String LOCKER_LOCATION = "Tecnológico de Monterrey";

// ===== VARIABLES GLOBALES =====
String inputCode = "";
const int CODE_LENGTH = 4;
bool doorOpen = false;
unsigned long lastActivity = 0;
const unsigned long TIMEOUT_MS = 30000; // 30 segundos timeout

// ===== ESTRUCTURA PARA DATOS DE USUARIO =====
struct UserData {
  String name;
  String action; // "DONATE" or "RECEIVE"
  String articleTitle;
  bool isValid;
};

void setup() {
  Serial.begin(115200);
  
  // Configurar pines
  pinMode(LED_SUCCESS, OUTPUT);
  pinMode(LED_ERROR, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  
  // Configurar servo
  lockServo.attach(SERVO_PIN);
  lockServo.write(0); // Posición cerrado
  
  // Inicializar LCD
  lcd.init();
  lcd.backlight();
  displayWelcomeMessage();
  
  // Inicializar WiFi
  initWiFi();
  
  // Inicializar Bluetooth
  SerialBT.begin("CasilleroSmart_A1"); // Nombre Bluetooth visible
  Serial.println("Bluetooth iniciado - Dispositivo: CasilleroSmart_A1");
  
  // Test de componentes
  testComponents();
  
  Serial.println("Sistema iniciado correctamente");
  displayReadyMessage();
}
  // Inicializar pin del casillero
  pinMode(LOCK_PIN, OUTPUT);
  digitalWrite(LOCK_PIN, LOW);  // Casillero cerrado
  
  // Conectar a WiFi
  WiFi.begin(ssid, password);
  lcd.setCursor(0, 1);
  lcd.print("Conectando WiFi");
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi conectado");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi OK");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP());
    delay(2000);
  } else {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Error WiFi");
    delay(2000);
  }
  
  showWelcomeMessage();
}

void loop() {
  // Verificar timeout de inactividad
  if (millis() - lastActivity > TIMEOUT_MS && inputCode.length() > 0) {
    resetInput();
    displayReadyMessage();
  }
  
  // Verificar entrada del teclado
  char key = keypad.getKey();
  if (key) {
    lastActivity = millis();
    handleKeyPress(key);
  }
  
  // Verificar entrada por Bluetooth
  if (SerialBT.available()) {
    String btCommand = SerialBT.readString();
    btCommand.trim();
    handleBluetoothCommand(btCommand);
  }
  
  delay(50); // Pequeña pausa para estabilidad
}

// ===== FUNCIÓN PARA MANEJAR TECLAS =====
void handleKeyPress(char key) {
  Serial.print("Tecla presionada: ");
  Serial.println(key);
  
  if (key == '#') {
    // Procesar código ingresado
    if (inputCode.length() == CODE_LENGTH) {
      displayVerifyingMessage();
      verifyCode();
    } else {
      displayErrorMessage("Codigo incompleto", "Ingrese 4 digitos");
      playErrorSound();
      delay(2000);
      resetInput();
    }
  }
  else if (key == '*') {
    // Cancelar/borrar entrada actual
    resetInput();
    displayReadyMessage();
    playBeep();
  }
  else if (key >= '0' && key <= '9') {
    // Agregar dígito al código
    if (inputCode.length() < CODE_LENGTH) {
      inputCode += key;
      updateCodeDisplay();
      playBeep();
    } else {
      playErrorSound();
    }
  }
}

// ===== FUNCIÓN PARA MANEJAR COMANDOS BLUETOOTH =====
void handleBluetoothCommand(String command) {
  Serial.println("Comando BT recibido: " + command);
  
  if (command.startsWith("CODE:")) {
    String code = command.substring(5);
    if (code.length() == CODE_LENGTH) {
      inputCode = code;
      displayVerifyingMessage();
      verifyCode();
    }
  }
  else if (command == "STATUS") {
    SerialBT.println("LOCKER_ID:" + LOCKER_ID);
    SerialBT.println("STATUS:" + (doorOpen ? "OPEN" : "CLOSED"));
    SerialBT.println("LOCATION:" + LOCKER_LOCATION);
  }
  else if (command == "RESET") {
    resetInput();
    displayReadyMessage();
    SerialBT.println("RESET_OK");
  }
}

// ===== FUNCIÓN PRINCIPAL DE VERIFICACIÓN DE CÓDIGO =====
void verifyCode() {
  if (WiFi.status() != WL_CONNECTED) {
    displayErrorMessage("Sin conexion", "Verifique WiFi");
    playErrorSound();
    delay(2000);
    resetInput();
    return;
  }

  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");

  // Crear JSON con datos del casillero
  DynamicJsonDocument doc(1024);
  doc["accessCode"] = inputCode;
  doc["lockerId"] = LOCKER_ID;
  doc["location"] = LOCKER_LOCATION;

  String requestBody;
  serializeJson(doc, requestBody);

  Serial.println("Enviando solicitud: " + requestBody);

  int httpResponseCode = http.POST(requestBody);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Respuesta del servidor: " + response);

    DynamicJsonDocument responseDoc(1024);
    deserializeJson(responseDoc, response);

    if (httpResponseCode == 200) {
      // Código válido
      String userName = responseDoc["user"]["name"] | "Usuario";
      String action = responseDoc["action"] | "RECEIVE";
      String articleTitle = responseDoc["article"]["title"] | "Artículo";
      
      handleSuccessfulAccess(userName, action, articleTitle);
    } else {
      // Código inválido
      String errorMsg = responseDoc["error"] | "Codigo incorrecto";
      displayErrorMessage("Acceso denegado", errorMsg.substring(0, 16));
      playErrorSound();
      delay(3000);
    }
  } else {
    displayErrorMessage("Error conexion", "Servidor no resp.");
    playErrorSound();
    delay(2000);
  }

  http.end();
  resetInput();
}

// ===== MANEJAR ACCESO EXITOSO =====
void handleSuccessfulAccess(String userName, String action, String articleTitle) {
  // Mostrar mensaje personalizado
  displayPersonalizedMessage(userName, action, articleTitle);
  
  // Abrir casillero
  openLocker();
  
  // Efectos de éxito
  playSuccessSound();
  digitalWrite(LED_SUCCESS, HIGH);
  
  // Enviar notificación por Bluetooth
  SerialBT.println("ACCESS_GRANTED:" + userName + ":" + action);
  
  delay(5000); // Mantener mensaje por 5 segundos
  
  // Cerrar casillero automáticamente después de 30 segundos
  displayCountdown();
  
  closeLocker();
  digitalWrite(LED_SUCCESS, LOW);
  displayReadyMessage();
}
    SerialBT.println("RESET_OK");
  }
}
    } else if (key == '*') {
      // Cancelar entrada
      resetInput();
    } else {
      // Agregar dígito
      if (inputCode.length() < CODE_LENGTH) {
        inputCode += key;
        updateDisplay();
      }
    }
  }
  
  // Si la puerta está abierta, esperar a que se cierre
  if (doorOpen) {
    // Aquí podrías agregar un sensor de puerta para detectar el cierre
    // Por ahora, cerramos automáticamente después de 10 segundos
    delay(10000);
    closeDoor();
  }
}

void showWelcomeMessage() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Casillero " + LOCKER_ID);
  lcd.setCursor(0, 1);
  lcd.print("Ingresa codigo:");
  inputCode = "";
}

void updateDisplay() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Codigo:");
  lcd.setCursor(0, 1);
  
  // Mostrar asteriscos en lugar del código
  for (int i = 0; i < inputCode.length(); i++) {
    lcd.print("*");
  }
  
  // Mostrar guión para dígitos faltantes
  for (int i = inputCode.length(); i < CODE_LENGTH; i++) {
    lcd.print("-");
  }
}

void verifyCode() {
  lcd.clear();
  lcd.setCursor(0, 0);
// ===== MOSTRAR MENSAJE PERSONALIZADO =====
void displayPersonalizedMessage(String userName, String action, String articleTitle) {
  lcd.clear();
  
  if (action == "DONATE") {
    lcd.setCursor(0, 0);
    lcd.print("Hola " + userName.substring(0, 11));
    lcd.setCursor(0, 1);
    lcd.print("Gracias x donar!");
  } 
  else if (action == "RECEIVE") {
    lcd.setCursor(0, 0);
    lcd.print("Hola " + userName.substring(0, 11));
    lcd.setCursor(0, 1);
    lcd.print("Disfruta tu art!");
  }
  else {
    lcd.setCursor(0, 0);
    lcd.print("Bienvenido");
    lcd.setCursor(0, 1);
    lcd.print(userName.substring(0, 16));
  }
}

// ===== FUNCIONES DE DISPLAY =====
void displayWelcomeMessage() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("CasilleroSmart");
  lcd.setCursor(0, 1);
  lcd.print("Iniciando...");
}

void displayReadyMessage() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Ingrese codigo:");
  lcd.setCursor(0, 1);
  lcd.print("[ _ _ _ _ ] # OK");
  inputCode = "";
}

void updateCodeDisplay() {
  lcd.setCursor(2, 1);
  for (int i = 0; i < CODE_LENGTH; i++) {
    if (i < inputCode.length()) {
      lcd.print("*");
    } else {
      lcd.print("_");
    }
    if (i < CODE_LENGTH - 1) lcd.print(" ");
  }
}

void displayVerifyingMessage() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Verificando...");
  lcd.setCursor(0, 1);
  lcd.print("Espere por favor");
}

void displayErrorMessage(String line1, String line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);
  digitalWrite(LED_ERROR, HIGH);
  delay(200);
  digitalWrite(LED_ERROR, LOW);
}

void displayCountdown() {
  for (int i = 30; i > 0; i--) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Casillero abierto");
    lcd.setCursor(0, 1);
    lcd.print("Cierra en: " + String(i) + "s");
    delay(1000);
  }
}

// ===== FUNCIONES DE CONTROL FÍSICO =====
void openLocker() {
  lockServo.write(90); // Abrir servo a 90 grados
  doorOpen = true;
  Serial.println("Casillero abierto");
}

void closeLocker() {
  lockServo.write(0); // Cerrar servo a 0 grados
  doorOpen = false;
  Serial.println("Casillero cerrado");
}

// ===== FUNCIONES DE SONIDO =====
void playBeep() {
  tone(BUZZER_PIN, 1000, 100); // 1kHz por 100ms
}

void playSuccessSound() {
  tone(BUZZER_PIN, 1500, 200);
  delay(250);
  tone(BUZZER_PIN, 2000, 200);
  delay(250);
  tone(BUZZER_PIN, 2500, 200);
}

void playErrorSound() {
  tone(BUZZER_PIN, 500, 500); // Tono bajo por error
}

// ===== FUNCIONES AUXILIARES =====
void initWiFi() {
  WiFi.begin(ssid, password);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Conectando WiFi");
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    lcd.setCursor(attempts % 16, 1);
    lcd.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi conectado");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi conectado");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP());
    delay(2000);
  } else {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Error de WiFi");
    lcd.setCursor(0, 1);
    lcd.print("Modo offline");
    delay(2000);
  }
}

void testComponents() {
  // Test del servo
  Serial.println("Probando servo...");
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Test servo...");
  lockServo.write(45);
  delay(500);
  lockServo.write(0);
  
  // Test de LEDs
  Serial.println("Probando LEDs...");
  lcd.setCursor(0, 1);
  lcd.print("Test LEDs...");
  digitalWrite(LED_SUCCESS, HIGH);
  delay(500);
  digitalWrite(LED_SUCCESS, LOW);
  digitalWrite(LED_ERROR, HIGH);
  delay(500);
  digitalWrite(LED_ERROR, LOW);
  
  // Test del buzzer
  Serial.println("Probando buzzer...");
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Test buzzer...");
  playBeep();
  
  delay(1000);
}

void resetInput() {
  inputCode = "";
  lastActivity = millis();
}
  
  int httpCode = http.POST(jsonString);
  
  if (httpCode > 0) {
    String payload = http.getString();
    Serial.println("Respuesta: " + payload);
    
    StaticJsonDocument<300> responseDoc;
    DeserializationError error = deserializeJson(responseDoc, payload);
    
    if (!error) {
      bool valid = responseDoc["valid"];
      const char* message = responseDoc["message"];
      
      if (valid) {
        // Código válido - abrir casillero
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Acceso concedido");
        lcd.setCursor(0, 1);
        lcd.print(message);
        delay(2000);
        
        openDoor();
      } else {
        // Código inválido
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Codigo invalido");
        lcd.setCursor(0, 1);
        lcd.print("Intenta de nuevo");
        delay(2000);
        resetInput();
      }
    } else {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Error respuesta");
      delay(2000);
      resetInput();
    }
  } else {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Error servidor");
    lcd.setCursor(0, 1);
    lcd.print("Codigo: " + String(httpCode));
    delay(2000);
    resetInput();
  }
  
  http.end();
}

void openDoor() {
  digitalWrite(LOCK_PIN, HIGH);  // Activar solenoide/servo
  doorOpen = true;
  
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Casillero");
  lcd.setCursor(0, 1);
  lcd.print("ABIERTO");
  
  Serial.println("Casillero abierto");
}

void closeDoor() {
  digitalWrite(LOCK_PIN, LOW);  // Desactivar solenoide/servo
  doorOpen = false;
  
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Casillero");
  lcd.setCursor(0, 1);
  lcd.print("cerrado");
  delay(2000);
  
  Serial.println("Casillero cerrado");
  resetInput();
}

void resetInput() {
  inputCode = "";
  showWelcomeMessage();
}
