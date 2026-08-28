// Pasa los mensajes del database.sqlite heredado a Postgres.
// Cada fila del SQLite es un mensaje: el esquema nuevo admite varios por
// usuario. Idempotente por (usuario, fecha del mensaje).
//   node db/migrar-desde-sqlite.js
require('dotenv').config();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { pool, PILARES } = require('../database');

const sqlite = new sqlite3.Database(path.join(__dirname, '..', 'database.sqlite'));

const leerTodo = () => new Promise((resolve, reject) =>
  sqlite.all('SELECT * FROM mensajes ORDER BY fecha_mensaje', [], (e, r) => e ? reject(e) : resolve(r)));

(async () => {
  const filas = await leerTodo();
  console.log(`📦 ${filas.length} filas en SQLite`);
  let creados = 0, saltados = 0;

  for (const fila of filas) {
    const usuario = (fila.usuario || '').trim();
    if (!usuario) { saltados++; continue; }

    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const { rows: u } = await cliente.query(
        `INSERT INTO usuarios (usuario) VALUES ($1)
         ON CONFLICT (usuario) DO UPDATE SET usuario = EXCLUDED.usuario RETURNING id`, [usuario]);
      const usuarioId = u[0].id;

      const fecha = fila.fecha_mensaje
        ? new Date(fila.fecha_mensaje.replace(' ', 'T') + 'Z')
        : new Date();

      const { rows: existentes } = await cliente.query(
        `SELECT 1 FROM mensajes WHERE usuario_id = $1 AND creado_en = $2 LIMIT 1`,
        [usuarioId, fecha]);
      if (existentes.length) { await cliente.query('ROLLBACK'); saltados++; continue; }

      const { rows: m } = await cliente.query(
        `INSERT INTO mensajes (usuario_id, titulo, briefing, creado_en, actualizado_en)
         VALUES ($1, $2, $3::jsonb, $4, $4) RETURNING id`,
        [usuarioId, (fila.titulo || '').trim(), fila.briefing || null, fecha]);

      for (const pilar of PILARES) {
        const contenido = (fila[pilar] || '').trim();
        if (!contenido) continue;
        await cliente.query(
          `INSERT INTO secciones (mensaje_id, pilar, contenido) VALUES ($1, $2, $3)`,
          [m[0].id, pilar, contenido]);
      }
      await cliente.query('COMMIT');
      creados++;
    } catch (e) {
      await cliente.query('ROLLBACK');
      console.error(`  ✗ ${usuario}:`, e.message);
    } finally {
      cliente.release();
    }
  }

  console.log(`✅ ${creados} mensajes migrados · ${saltados} saltados (sin usuario o ya migrados)`);
  await pool.end();
  sqlite.close();
})();
