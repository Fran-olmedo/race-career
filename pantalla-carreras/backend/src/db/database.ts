import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./racing.db', (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`
            CREATE TABLE IF NOT EXISTS racing (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                start_time DATETIME NOT NULL,
                end_time DATETIME
            )
        `);
        db.run(`
            CREATE TABLE IF NOT EXISTS competitors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                racing_id INTEGER NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                lane INTEGER NOT NULL,
                color TEXT NOT NULL,
                FOREIGN KEY (racing_id) REFERENCES racing (id)
            )
        `);
    }
});

export default db;
