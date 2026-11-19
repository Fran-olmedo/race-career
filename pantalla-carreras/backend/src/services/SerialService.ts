import type { Response } from 'express';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

export class SerialService {
    private static readonly clients = new Set<Response>();
    private static initialized = false;
    private static readonly defaultPort = 'COM5';
    private static serialPort: SerialPort | null = null;

    static async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        const path = process.env.SERIAL_PORT ?? this.defaultPort;

        console.log(`Inicializando puerto serial en ${path}`);

        try {
            const port = new SerialPort({
                path,
                baudRate: 9600,
                autoOpen: true,
            });

            this.serialPort = port;
            const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

            port.on('open', () => {
                console.log(`Arduino conectado correctamente en ${path}`);
                this.broadcast('STATUS:ARDUINO_CONNECTED');
            });

            port.on('error', (error) => {
                console.error(`Error en el puerto serial ${path}:`, error.message);
            });

            port.on('close', () => {
                console.log(`Puerto serial ${path} cerrado`);
                this.broadcast('STATUS:ARDUINO_DISCONNECTED');
            });

            parser.on('data', (line: string) => {
                const message = line.trim();
                if (message) {
                    const detection = /^Auto (\d+):/.exec(message);
                    if (detection) {
                        console.log(`[Sensor ${detection[1]}] Detección de llegada: ${message}`);
                    } else {
                        console.log(`[Arduino] ${message}`);
                    }
                    this.broadcast(message);
                }
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(`No se pudo abrir el puerto serial ${path}: ${msg}`);
        }
    }

    static sendCommand(command: string): boolean {
        if (this.serialPort && this.serialPort.isOpen) {
            this.serialPort.write(`${command}\n`, (err) => {
                if (err) {
                    console.error(`Error enviando comando '${command}' al Arduino:`, err.message);
                } else {
                    console.log(`Comando enviado al Arduino: '${command}'`);
                }
            });
            return true;
        } else {
            console.warn(`No se pudo enviar comando '${command}': puerto serial no está abierto.`);
            return false;
        }
    }

    static addClient(client: Response): void {
        this.clients.add(client);
    }

    static removeClient(client: Response): void {
        this.clients.delete(client);
    }

    static broadcast(message: string): void {
        const event = `data: ${JSON.stringify({ message })}\n\n`;
        for (const client of this.clients) {
            client.write(event);
        }
    }
}
