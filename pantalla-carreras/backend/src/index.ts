import express from 'express';
import cors from 'cors';
import { RacingController } from './controllers/RacingController.js';
import { SerialService } from './services/SerialService.js';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Iniciar carrera
app.post('/api/race/start', (req, res) => {
    void RacingController.startRace(req, res);
});

// Detener carrera
app.post('/api/race/stop', (req, res) => {
    void RacingController.stopRace(req, res);
});

// Event Stream (SSE) para enviar datos en tiempo real al Frontend
app.get('/api/serial/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    SerialService.addClient(res);
    res.write(': connected\n\n');

    req.on('close', () => {
        SerialService.removeClient(res);
    });
});

// Inicializar comunicación serial y levantar servidor HTTP
SerialService.initialize()
    .finally(() => {
        app.listen(port, () => {
            console.log(`Backend de carreras ejecutándose en http://localhost:${port}`);
        });
    });
