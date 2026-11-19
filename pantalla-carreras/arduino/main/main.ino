#include <Servo.h>



/* =========================================================================
   SISTEMA DE CARRERAS CON ARDUINO
   Flujo:
   1. Espera comando "START" o "START:<num_autos>" desde la aplicación.
   2. Activa la secuencia del semáforo (LEDs 1 a 4 con sonido).
   3. Al finalizar el semáforo, levanta las barreras (Servos a 90°).
   4. Espera a que las barreras se levanten e inicia el cronómetro.
   5. Lee los sensores ultrasónicos con filtro anti-ruido (doble verificación).
   6. Al detectar el paso de cada auto, envía inmediatamente su tiempo exacto.
   7. Al finalizar los autos activos (o por tiempo límite), baja las barreras (0°).
   8. Queda en espera para la siguiente carrera (Proceso Cíclico).
   ========================================================================= */

// Pines del Semáforo
#define LED1 2
#define LED2 3
#define LED3 4
#define LED4 5

// Pin del buzzer / parlante piezoeléctrico
#define pinSpeaker 6

// Servomotores de las barreras (Pines 7 y 8)
Servo servo1;
Servo servo2;
const int SERVO_PIN_1 = 7;
const int SERVO_PIN_2 = 8;

const int BARRIER_DOWN = 90;   // Barrera baja (autos detenidos)
const int BARRIER_UP   = 0;  // Barrera levantada (autos liberados)
const int BARRIER_DOWN2 = 0;
const int BARRIER_UP2 = 90;

// Velocidad de bajada de las barreras (ms por grado). Más alto = más lento
const int BARRIER_STEP_DELAY_MS = 100;

// Estado actual de las barreras (para no hacer movimientos innecesarios)
bool barriersUp = false;

// Sensores ultrasónicos HC-SR04 (5 pistas disponibles)
const int NUM_LANES = 5;
const int pinEcho[NUM_LANES] = {A0, A2, A4, A6, A8};
const int pinTrig[NUM_LANES] = {A1, A3, A5, A7, A9};

// Distancia de detección en centímetros (rango válido para un auto: 3cm a 25cm)
const int MIN_DIST_CM = 3;
const int MAX_DIST_CM = 7;

// Tiempo de gracia inicial tras levantar barreras (en ms) para ignorar el movimiento
// físico del brazo del servo, vibraciones iniciales y picos de corriente
const unsigned long BLIND_TIME_MS = 600;

// Tiempo máximo de carrera en milisegundos (15 segundos) antes de corte automático
const unsigned long MAX_RACE_TIME_MS = 15000;

// Variables de estado de carrera
bool raceActive = false;
int activeLanes = 2; // Cantidad de autos en la carrera actual (por defecto 2 o según START:N)

unsigned long startTime = 0;
unsigned long endTime[NUM_LANES] = {0, 0, 0, 0, 0};
bool carFinished[NUM_LANES] = {false, false, false, false, false};
int carsFinishedCount = 0;

void setup() {
  // Configuración de pines de LEDs
  pinMode(LED1, OUTPUT);
  pinMode(LED2, OUTPUT);
  pinMode(LED3, OUTPUT);
  pinMode(LED4, OUTPUT);
  initializeLights();

  // Buzzer: arrancar siempre en silencio
  pinMode(pinSpeaker, OUTPUT);
  noTone(pinSpeaker);

  // Configuración de pines ultrasónicos
  for (int i = 0; i < NUM_LANES; i++) {
    pinMode(pinTrig[i], OUTPUT);
    digitalWrite(pinTrig[i], LOW);
    pinMode(pinEcho[i], INPUT);
  }

  // Configuración de Servomotores
  servo1.attach(SERVO_PIN_1);
  servo2.attach(SERVO_PIN_2);
  // Posición inicial directa (sin barrido ni movimientos previos)
  servo1.write(BARRIER_DOWN);
  servo2.write(BARRIER_DOWN2);
  barriersUp = false;

  // Configuración de comunicación Serial
  Serial.begin(9600);
  
  // Tono de bienvenida / inicio del sistema
  tone(pinSpeaker, 1500, 300);
  delay(300);
  noTone(pinSpeaker);

  Serial.println("STATUS:READY");
}

void loop() {
  // Escuchar comandos desde el Backend / Puerto Serial
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();

    if (command.startsWith("START")) {
      // Opcional: el comando puede ser "START" o "START:2", "START:4", etc.
      int lanesToRace = 2; // Valor base si no se especifica
      int sepIndex = command.indexOf(':');
      if (sepIndex != -1) {
        int parsed = command.substring(sepIndex + 1).toInt();
        if (parsed >= 1 && parsed <= NUM_LANES) {
          lanesToRace = parsed;
        }
      }
      runRaceCycle(lanesToRace);

    } else if (command == "STOP" || command == "RESET") {
      stopRace();
    }
  }
}

// Apaga todas las luces del semáforo
void initializeLights() {
  digitalWrite(LED1, LOW);
  digitalWrite(LED2, LOW);
  digitalWrite(LED3, LOW);
  digitalWrite(LED4, LOW);
}

// Baja las barreras (solo si están levantadas, para evitar movimientos innecesarios)
void lowerBarriers() {
  if (!barriersUp) return;

  for (int i = 0; i <= 90; i++) {
    servo1.write(i);        // 0 -> 90
    servo2.write(90 - i);   // 90 -> 0
    delay(BARRIER_STEP_DELAY_MS);
  }
  barriersUp = false;
}

// Levanta las barreras
void raiseBarriers() {
  servo1.write(BARRIER_UP);
  servo2.write(BARRIER_UP2);
  barriersUp = true;
}

// Secuencia del semáforo con tono y retardo
void trafficLightSequence() {
  Serial.println("STATUS:SEMAFORO");

  int t = random(1000, 2000);

  // Luz 1
  digitalWrite(LED1, HIGH);
  tone(pinSpeaker, 1000, 200);
  delay(t);

  // Luz 2
  digitalWrite(LED2, HIGH);
  tone(pinSpeaker, 1000, 200);
  delay(t);

  // Luz 3
  digitalWrite(LED3, HIGH);
  tone(pinSpeaker, 1000, 200);
  delay(t);

  // Luz 4
  digitalWrite(LED4, HIGH);
  tone(pinSpeaker, 1000, 200);
  delay(t);

  // Tono largo de partida
  tone(pinSpeaker, 1500, 600);
  delay(600);
  noTone(pinSpeaker);

  // Apagar luces
  initializeLights();
}

// Ejecución completa de un ciclo de carrera
void runRaceCycle(int lanes) {
  activeLanes = lanes;
  raceActive = true;
  carsFinishedCount = 0;

  // Reiniciar registros de tiempos
  for (int i = 0; i < NUM_LANES; i++) {
    endTime[i] = 0;
    carFinished[i] = false;
  }

  // 1. Ejecutar semáforo (las barreras permanecen quietas, ya están abajo)
  trafficLightSequence();

  // 2. Levantar barreras recién cuando termina el semáforo
  raiseBarriers();
  // Esperar 400ms a que los brazos de los servos completen su giro a 90°
  // para que no pasen por delante del haz ultrasónico
  delay(400);

  // Iniciar cronómetro e informar largada
  startTime = millis();
  Serial.println("STATUS:GO");

  // 4. Bucle de monitoreo de sensores durante la carrera
  while (raceActive) {
    // Verificar si el usuario solicita cancelar por Serial
    if (Serial.available() > 0) {
      String cmd = Serial.readStringUntil('\n');
      cmd.trim();
      if (cmd == "STOP" || cmd == "RESET") {
        stopRace();
        return;
      }
    }

    unsigned long currentElapsed = millis() - startTime;

    // Solo evaluar llegada si ya pasó el tiempo de gracia inicial
    // (ningún auto llega a la meta en menos de 0.6 segundos)
    if (currentElapsed >= BLIND_TIME_MS) {
      // Escanear únicamente los carriles activos en esta carrera
      for (int i = 0; i < activeLanes; i++) {
        if (!carFinished[i]) {
          int dist1 = measureDistanceCm(i);

          // Si detecta un obstáculo en el rango del carril
          if (dist1 >= MIN_DIST_CM && dist1 <= MAX_DIST_CM) {
            // Doble verificación: esperar 12ms y volver a medir
            // Esto elimina 100% falsos positivos por rebote acústico o picos de ruido
            delay(12);
            int dist2 = measureDistanceCm(i);

            if (dist2 >= MIN_DIST_CM && dist2 <= MAX_DIST_CM) {
              unsigned long arrivalTime = millis();
              endTime[i] = arrivalTime;
              carFinished[i] = true;
              carsFinishedCount++;

              unsigned long totalTimeMs = arrivalTime - startTime;
              float seconds = totalTimeMs / 1000.0;

              // Sonido de detección de meta (suena para todos los autos, incluido el último)
              tone(pinSpeaker, 2000, 150);
              delay(150);
              noTone(pinSpeaker);

              // Enviar inmediatamente el tiempo exacto
              Serial.print("Auto ");
              Serial.print(i + 1);
              Serial.print(": ");
              Serial.print(seconds, 3);
              Serial.println(" s");
            }
          }
          // Pequeña pausa entre pistas para que el sonido no interfiera en la pista contigua
          delay(10);
        }
      }
    }

    // Condición de finalización:
    // a) Llegaron todos los competidores activos
    // b) Se superó el tiempo máximo de carrera (timeout de 15s)
    if (carsFinishedCount >= activeLanes || currentElapsed >= MAX_RACE_TIME_MS) {
      raceActive = false;
    }
  }

  // 5. Fin de la carrera: bajar barreras y enviar resumen
  finishRace();
}

// Medición de distancia por sensor ultrasónico
int measureDistanceCm(int laneIndex) {
  int trig = pinTrig[laneIndex];
  int echo = pinEcho[laneIndex];

  // Pulso de disparo limpio
  digitalWrite(trig, LOW);
  delayMicroseconds(4);
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);

  // Timeout de 30000 microsegundos (~5 metros)
  long duration = pulseIn(echo, HIGH, 30000);
  if (duration <= 0) {
    return -1;
  }
  return duration * 0.034 / 2;
}

// Finaliza la carrera: pitido final, muestra tiempos y baja las barreras
void finishRace() {
  raceActive = false;

  // 1. Si llegaron todos, esperar 1 segundo después del beep del último auto
  //    y recién ahí sonar el pitido final (tone() con duración no bloquea)
  if (carsFinishedCount >= activeLanes) {
    delay(1000);
  }
  tone(pinSpeaker, 800, 1500);

  // 2. Mostrar los tiempos finales enseguida
  Serial.println("STATUS:FINISHED");
  for (int i = 0; i < activeLanes; i++) {
    Serial.print("Total Auto ");
    Serial.print(i + 1);
    Serial.print(": ");
    if (carFinished[i]) {
      float sec = (endTime[i] - startTime) / 1000.0;
      Serial.print(sec, 3);
      Serial.println(" s");
    } else {
      Serial.println("DNF (No finalizo)");
    }
  }

  // 3. Bajar barreras (mientras todavía suena el pitido)
  lowerBarriers();
  delay(400);
  noTone(pinSpeaker);

  // Sistema listo nuevamente para la próxima carrera (Proceso cíclico)
  Serial.println("STATUS:READY");
}

// Detiene de inmediato la carrera (cancelación manual)
void stopRace() {
  raceActive = false;
  initializeLights();
  lowerBarriers();
  tone(pinSpeaker, 500, 300);
  delay(300);
  noTone(pinSpeaker);
  Serial.println("STATUS:STOPPED");
  Serial.println("STATUS:READY");
}
