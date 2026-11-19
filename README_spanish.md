# 🏁 Sistema de Carreras con Arduino

Sistema de cronometraje para carreras de autos de juguete. Un **Arduino** controla el semáforo, las barreras de largada y los sensores de llegada, y se comunica por **puerto serial** con una aplicación web (backend + frontend en Node.js) que inicia las carreras y muestra los tiempos.

## ¿Cómo funciona?

1. Desde la aplicación se envía el comando `START` (o `START:<n>` con la cantidad de autos, de 1 a 5).
2. El Arduino ejecuta la **secuencia del semáforo**: 4 LEDs que se encienden de a uno, cada uno con un beep, separados por un intervalo aleatorio de 1 a 2 segundos. Al final suena un tono largo de partida.
3. Cuando termina el semáforo, las **barreras se levantan** (dos servos que giran en sentidos opuestos) y arranca el cronómetro. Hasta ese momento las barreras no se mueven.
4. Los **sensores ultrasónicos** HC-SR04 (uno por carril) detectan el paso de cada auto por la meta. Cada llegada suena con un beep corto y se envía su tiempo al instante.
5. La carrera termina cuando llegan todos los autos o a los **15 segundos** (timeout). Entonces suena el pitido final, se envían los tiempos totales (los autos que no llegaron figuran como `DNF`) y las barreras bajan lentamente.
6. El sistema queda listo para la siguiente carrera.

Se puede cancelar en cualquier momento con `STOP` o `RESET`.

## Hardware

| Componente | Cantidad | Uso |
|---|---|---|
| Arduino Mega (o placa con pines A0–A9 utilizables como digitales) | 1 | Controlador principal |
| Sensor ultrasónico HC-SR04 | 5 | Detección de llegada, uno por carril |
| Servomotor | 2 | Barreras de largada (montados enfrentados) |
| LEDs | 4 | Semáforo |
| Buzzer piezoeléctrico | 1 | Sonidos del semáforo y de llegada |

> El sketch usa los pines analógicos A6–A9 como entradas/salidas digitales, por lo que necesita una placa que los tenga, como el Arduino Mega.

### Conexiones

| Función | Pin(es) |
|---|---|
| LEDs del semáforo (1 a 4) | 2, 3, 4, 5 |
| Buzzer | 6 |
| Servo 1 / Servo 2 | 7 / 8 |
| Sensores, pin Echo (carriles 1 a 5) | A0, A2, A4, A6, A8 |
| Sensores, pin Trig (carriles 1 a 5) | A1, A3, A5, A7, A9 |

Los servos se alimentan preferentemente con una **fuente externa de 5 V** con GND en común con el Arduino, para evitar caídas de tensión.

## Protocolo serial

Comunicación a **9600 baudios**, un mensaje por línea.

**Comandos (aplicación → Arduino)**

| Comando | Descripción |
|---|---|
| `START` | Inicia una carrera con 2 autos (valor por defecto) |
| `START:<n>` | Inicia una carrera con `n` autos (1 a 5) |
| `STOP` / `RESET` | Cancela la carrera, apaga las luces y baja las barreras |

**Mensajes (Arduino → aplicación)**

| Mensaje | Significado |
|---|---|
| `STATUS:READY` | Sistema listo para una nueva carrera |
| `STATUS:SEMAFORO` | Comenzó la secuencia del semáforo |
| `STATUS:GO` | Barreras arriba y cronómetro en marcha |
| `Auto N: X.XXX s` | El auto `N` llegó a la meta con ese tiempo |
| `STATUS:FINISHED` | La carrera terminó |
| `Total Auto N: X.XXX s` | Tiempo final del auto `N` (o `DNF (No finalizo)` si no llegó) |
| `STATUS:STOPPED` | La carrera fue cancelada |

## Detalles de la detección

- **Rango de detección:** de 3 a 7 cm del sensor.
- **Doble verificación:** cada detección se confirma con una segunda medición 12 ms después, para descartar falsos positivos por rebotes o ruido.
- **Tiempo ciego inicial (600 ms):** se ignoran los sensores justo después de levantar las barreras, para no detectar el movimiento del brazo del servo.
- **Barreras:** los servos se espejan (`180 - ángulo`) porque están montados enfrentados.

## Estructura del proyecto

```
.
├── arduino/        # Sketch del Arduino (main.ino)
├── backend/        # Servidor Node.js que se comunica con el puerto serial
└── frontend/       # Interfaz web
```

> Ajustá los nombres de las carpetas a los de tu repositorio.

## Instalación y uso

### 1. Arduino

1. Abrí `main.ino` con el Arduino IDE.
2. Seleccioná la placa y el puerto (por ejemplo `COM6` en Windows).
3. Cargá el sketch. Al encender, el buzzer suena una vez y el Arduino envía `STATUS:READY`.

La única librería utilizada es [`Servo`](https://docs.arduino.cc/libraries/servo/), incluida con el Arduino IDE.

### 2. Backend

```bash
cd backend
npm install
npm run dev
```

### 3. Frontend

En otra terminal:

```bash
cd frontend
npm install
npm run dev
```

> El backend y el frontend son proyectos separados, por lo que cada uno se inicia desde su propia terminal.

## Solución de problemas

- **`Access denied` al abrir el puerto COM:** otro proceso ya lo está usando (el Monitor Serie del Arduino IDE, una instancia anterior del backend que quedó abierta, etc.). Cerralo antes de iniciar el backend.
- **Los servos se traban o el Arduino se reinicia:** usá una fuente externa de 5 V para los servos y unificá los GND.
- **Falsos positivos en los sensores:** ajustá `MIN_DIST_CM`, `MAX_DIST_CM` o `BLIND_TIME_MS` en el sketch.

## Configuración rápida (en `main.ino`)

| Constante | Descripción | Valor actual |
|---|---|---|
| `MAX_RACE_TIME_MS` | Tiempo máximo de carrera | 15000 ms |
| `BLIND_TIME_MS` | Tiempo ciego tras levantar las barreras | 600 ms |
| `MIN_DIST_CM` / `MAX_DIST_CM` | Rango de detección | 3 / 7 cm |
| `BARRIER_STEP_DELAY_MS` | Velocidad de bajada de las barreras (más alto = más lento) | 100 ms por grado |
| `NUM_LANES` | Cantidad máxima de carriles | 5 |
