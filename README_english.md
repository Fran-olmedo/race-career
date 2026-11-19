# 🏁 Arduino Race Timing System

A timing system for toy car races. An **Arduino** controls the starting lights, the start barriers and the finish-line sensors, and talks over the **serial port** to a web application (Node.js backend + frontend) that starts the races and displays the times.

## How it works

1. The application sends the `START` command (or `START:<n>` with the number of cars, from 1 to 5).
2. The Arduino runs the **traffic light sequence**: 4 LEDs light up one at a time, each with a beep, separated by a random interval of 1 to 2 seconds. A long start tone sounds at the end.
3. When the light sequence finishes, the **barriers are raised** (two servos turning in opposite directions) and the timer starts. Until that moment the barriers do not move.
4. **HC-SR04 ultrasonic sensors** (one per lane) detect each car crossing the finish line. Every arrival plays a short beep and its time is sent immediately.
5. The race ends when all cars have finished or after **15 seconds** (timeout). Then the final beep sounds, the total times are sent (cars that did not finish are reported as `DNF`) and the barriers slowly lower.
6. The system is ready for the next race.

A race can be cancelled at any time with `STOP` or `RESET`.

## Hardware

| Component | Qty | Purpose |
|---|---|---|
| Arduino Mega (or a board with usable digital pins A0–A9) | 1 | Main controller |
| HC-SR04 ultrasonic sensor | 5 | Finish detection, one per lane |
| Servo motor | 2 | Start barriers (mounted facing each other) |
| LEDs | 4 | Traffic light |
| Piezo buzzer | 1 | Start and finish sounds |

> The sketch uses analog pins A6–A9 as digital inputs/outputs, so it needs a board that has them, such as the Arduino Mega.

### Wiring

| Function | Pin(s) |
|---|---|
| Traffic light LEDs (1 to 4) | 2, 3, 4, 5 |
| Buzzer | 6 |
| Servo 1 / Servo 2 | 7 / 8 |
| Sensors, Echo pin (lanes 1 to 5) | A0, A2, A4, A6, A8 |
| Sensors, Trig pin (lanes 1 to 5) | A1, A3, A5, A7, A9 |

Power the servos from an **external 5 V supply** with a common GND with the Arduino to avoid voltage drops.

## Serial protocol

Communication at **9600 baud**, one message per line.

**Commands (application → Arduino)**

| Command | Description |
|---|---|
| `START` | Starts a race with 2 cars (default) |
| `START:<n>` | Starts a race with `n` cars (1 to 5) |
| `STOP` / `RESET` | Cancels the race, turns off the lights and lowers the barriers |

**Messages (Arduino → application)**

| Message | Meaning |
|---|---|
| `STATUS:READY` | System ready for a new race |
| `STATUS:SEMAFORO` | The traffic light sequence has started |
| `STATUS:GO` | Barriers up and timer running |
| `Auto N: X.XXX s` | Car `N` crossed the finish line with that time |
| `STATUS:FINISHED` | The race has ended |
| `Total Auto N: X.XXX s` | Final time of car `N` (or `DNF (No finalizo)` if it did not finish) |
| `STATUS:STOPPED` | The race was cancelled |

> Message texts (`SEMAFORO`, `Auto`, `No finalizo`) are in Spanish, as defined in the sketch.

## Detection details

- **Detection range:** 3 to 7 cm from the sensor.
- **Double check:** every detection is confirmed with a second measurement 12 ms later to rule out false positives from echoes or noise.
- **Initial blind time (600 ms):** sensors are ignored right after the barriers are raised, so the servo arm movement is not detected.
- **Barriers:** the servos are mirrored (`180 - angle`) because they are mounted facing each other.

## Project structure

```
.
├── arduino/        # Arduino sketch (main.ino)
├── backend/        # Node.js server that talks to the serial port
└── frontend/       # Web interface
```

> Adjust the folder names to match your repository.

## Installation and usage

### 1. Arduino

1. Open `main.ino` in the Arduino IDE.
2. Select the board and the port (for example `COM6` on Windows).
3. Upload the sketch. On power-up the buzzer beeps once and the Arduino sends `STATUS:READY`.

The only library used is [`Servo`](https://docs.arduino.cc/libraries/servo/), included with the Arduino IDE.

### 2. Backend

```bash
cd backend
npm install
npm run dev
```

### 3. Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

> The backend and the frontend are separate projects, so each one is started from its own terminal.

## Troubleshooting

- **`Access denied` when opening the COM port:** another process is already using it (the Arduino IDE Serial Monitor, a previous backend instance left running, etc.). Close it before starting the backend.
- **Servos stall or the Arduino resets:** use an external 5 V supply for the servos and join the grounds.
- **False positives on the sensors:** tune `MIN_DIST_CM`, `MAX_DIST_CM` or `BLIND_TIME_MS` in the sketch.

## Quick configuration (in `main.ino`)

| Constant | Description | Current value |
|---|---|---|
| `MAX_RACE_TIME_MS` | Maximum race time | 15000 ms |
| `BLIND_TIME_MS` | Blind time after raising the barriers | 600 ms |
| `MIN_DIST_CM` / `MAX_DIST_CM` | Detection range | 3 / 7 cm |
| `BARRIER_STEP_DELAY_MS` | Barrier lowering speed (higher = slower) | 100 ms per degree |
| `NUM_LANES` | Maximum number of lanes | 5 |
