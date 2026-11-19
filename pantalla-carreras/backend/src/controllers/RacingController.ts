import type { Request, Response } from 'express';
import { RacingService } from '../services/RacingService.js';
import type { CompetitorData } from '../services/RacingService.js';
import { SerialService } from '../services/SerialService.js';

export class RacingController {
    static async startRace(req: Request, res: Response): Promise<void> {
        try {
            const competitors: CompetitorData[] = req.body.competitors;
            if (!competitors || !Array.isArray(competitors)) {
                res.status(400).json({ error: 'Invalid data format.' });
                return;
            }

            const racingId = await RacingService.startRace(competitors);

            // Enviar orden de inicio de carrera al Arduino con la cantidad de competidores
            const sent = SerialService.sendCommand(`START:${competitors.length}`);

            res.status(201).json({
                message: 'Race started',
                racingId,
                arduinoCommandSent: sent,
            });
        } catch (error) {
            console.error('Error starting race:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async stopRace(_req: Request, res: Response): Promise<void> {
        try {
            const sent = SerialService.sendCommand('STOP');
            res.status(200).json({
                message: 'Race stopped',
                arduinoCommandSent: sent,
            });
        } catch (error) {
            console.error('Error stopping race:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}
