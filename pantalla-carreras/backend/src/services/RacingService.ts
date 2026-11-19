import db from '../db/database.js';

export interface CompetitorData {
    firstName: string;
    lastName: string;
    lane: number;
    color: string;
}

export class RacingService {
    static async startRace(competitors: CompetitorData[]): Promise<number> {
        return new Promise((resolve, reject) => {
            const startTime = new Date().toISOString();
            
            db.serialize(() => {
                db.run(`INSERT INTO racing (start_time) VALUES (?)`, [startTime], function (err) {
                    if (err) {
                        return reject(err);
                    }
                    const racingId = this.lastID;
                    const stmt = db.prepare(`INSERT INTO competitors (racing_id, first_name, last_name, lane, color) VALUES (?, ?, ?, ?, ?)`);
                    
                    competitors.forEach(comp => {
                        stmt.run([racingId, comp.firstName, comp.lastName, comp.lane, comp.color]);
                    });
                    
                    stmt.finalize((err) => {
                        if (err) {
                            return reject(err);
                        }
                        resolve(racingId);
                    });
                });
            });
        });
    }
}
