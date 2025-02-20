const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error al conectar con SQLite:', err.message);
    } else {
        console.log('✅ Conectado a la base de datos SQLite');
    }
});

// Crear la tabla si no existe
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS mensajes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario TEXT NOT NULL,
            fecha_mensaje TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            titulo TEXT,
            introduccion TEXT,
            costura TEXT,
            problematica TEXT,
            conector TEXT,
            desarrollo TEXT,
            conclusion TEXT,
            ministracion TEXT
        )
    `);
});

module.exports = db;
