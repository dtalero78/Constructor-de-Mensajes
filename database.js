// ============================================================
// Acceso a datos — Postgres (cluster bslpostgres, base "speakers").
//
// El esquema está normalizado (mensajes + secciones), pero hacia
// afuera este módulo devuelve la fila "plana" con los 8 pilares como
// columnas, que es la forma que esperan el SPA y crear.html.
// El esquema vive en db/schema.sql.
// ============================================================

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const PILARES = [
  'titulo', 'introduccion', 'costura', 'problematica',
  'conector', 'desarrollo', 'conclusion', 'ministracion'
];

if (!process.env.DATABASE_URL) {
  console.error('❌ Falta DATABASE_URL: la app no puede guardar nada.');
}

// TLS verificado contra la CA de DigitalOcean (db/do-ca.crt).
// El sslmode de la URL se quita a propósito: pg lo interpreta como verify-full
// y pisaría esta configuración.
const caPath = path.join(__dirname, 'db', 'do-ca.crt');
const ssl = fs.existsSync(caPath)
  ? { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true }
  : { rejectUnauthorized: false };

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').replace(/[?&]sslmode=[^&]*/, ''),
  ssl,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => console.error('❌ Error inesperado en el pool de Postgres:', err.message));

pool.query('SELECT 1')
  .then(() => console.log('✅ Conectado a Postgres (base speakers)'))
  .catch(err => console.error('❌ No se pudo conectar a Postgres:', err.message,
    '\n   ¿Está activa la VPN wg-bsl-vpn? El firewall del cluster solo deja pasar 174.138.59.209.'));

/** Convierte mensaje + secciones en la fila plana que consume el front. */
function aplanar(mensaje, secciones) {
  const fila = {
    id: mensaje.id,
    usuario: mensaje.usuario,
    fecha_mensaje: mensaje.actualizado_en,
    briefing: mensaje.briefing
  };
  PILARES.forEach(p => { fila[p] = ''; });
  for (const s of secciones) fila[s.pilar] = s.contenido || '';
  return fila;
}

async function obtenerOCrearUsuario(cliente, usuario) {
  const { rows } = await cliente.query(
    `INSERT INTO usuarios (usuario) VALUES ($1)
     ON CONFLICT (usuario) DO UPDATE SET usuario = EXCLUDED.usuario
     RETURNING id`,
    [usuario]
  );
  return rows[0].id;
}

/**
 * Guarda las secciones que vengan con contenido. Las que llegan vacías se dejan
 * como estaban: el front manda las 8 y solo llena la que se editó.
 *
 * A qué mensaje escribe:
 *   - datos.mensajeId → a ese, si es del usuario
 *   - datos.nuevo     → crea uno nuevo (así el usuario puede tener varios)
 *   - por defecto     → al último que tocó
 */
async function guardarMensaje(datos) {
  const { usuario, briefing, mensajeId: pedido, nuevo } = datos;
  if (!usuario) throw new Error('El usuario es obligatorio');

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const usuarioId = await obtenerOCrearUsuario(cliente, usuario);

    let mensajeId = null;
    if (pedido && !nuevo) {
      const { rows } = await cliente.query(
        `SELECT id FROM mensajes WHERE id = $1 AND usuario_id = $2`, [pedido, usuarioId]);
      if (!rows.length) throw new Error('Ese mensaje no existe o no es de este usuario');
      mensajeId = rows[0].id;
    } else if (!nuevo) {
      const { rows } = await cliente.query(
        `SELECT id FROM mensajes WHERE usuario_id = $1
         ORDER BY actualizado_en DESC LIMIT 1`, [usuarioId]);
      mensajeId = rows[0]?.id || null;
    }

    if (!mensajeId) {
      const { rows } = await cliente.query(
        `INSERT INTO mensajes (usuario_id) VALUES ($1) RETURNING id`, [usuarioId]);
      mensajeId = rows[0].id;
    }

    for (const pilar of PILARES) {
      const contenido = (datos[pilar] || '').trim();
      if (!contenido) continue;
      await cliente.query(
        `INSERT INTO secciones (mensaje_id, pilar, contenido) VALUES ($1, $2, $3)
         ON CONFLICT (mensaje_id, pilar)
         DO UPDATE SET contenido = EXCLUDED.contenido, actualizado_en = now()`,
        [mensajeId, pilar, contenido]
      );
      // El título se espeja en la cabecera para poder listar sin join.
      if (pilar === 'titulo') {
        await cliente.query(`UPDATE mensajes SET titulo = $1 WHERE id = $2`, [contenido, mensajeId]);
      }
    }

    if (briefing) {
      const valor = typeof briefing === 'string' ? briefing : JSON.stringify(briefing);
      await cliente.query(`UPDATE mensajes SET briefing = $1::jsonb WHERE id = $2`, [valor, mensajeId]);
    }

    // Si solo se guardó el briefing, el trigger no corrió: refrescamos la fecha.
    await cliente.query(`UPDATE mensajes SET actualizado_en = now() WHERE id = $1`, [mensajeId]);

    await cliente.query('COMMIT');
    return { id: mensajeId };
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

/** El mensaje en curso de un usuario, aplanado. null si no tiene. */
async function ultimoMensaje(usuario) {
  const { rows } = await pool.query(
    `SELECT m.id, m.briefing, m.actualizado_en, u.usuario
     FROM mensajes m JOIN usuarios u ON u.id = m.usuario_id
     WHERE u.usuario = $1
     ORDER BY m.actualizado_en DESC LIMIT 1`,
    [usuario]
  );
  if (!rows.length) return null;
  const { rows: secciones } = await pool.query(
    `SELECT pilar, contenido FROM secciones WHERE mensaje_id = $1`, [rows[0].id]
  );
  return aplanar(rows[0], secciones);
}

/** Un mensaje concreto, si es de ese usuario. */
async function obtenerMensaje(id, usuario) {
  const { rows } = await pool.query(
    `SELECT m.id, m.briefing, m.actualizado_en, u.usuario
     FROM mensajes m JOIN usuarios u ON u.id = m.usuario_id
     WHERE m.id = $1 AND u.usuario = $2`,
    [id, usuario]
  );
  if (!rows.length) return null;
  const { rows: secciones } = await pool.query(
    `SELECT pilar, contenido FROM secciones WHERE mensaje_id = $1`, [rows[0].id]
  );
  return aplanar(rows[0], secciones);
}

/**
 * Borra un mensaje, solo si es de ese usuario. Las secciones se van con
 * él por el ON DELETE CASCADE del esquema.
 * Devuelve false si no existe o si es de otra persona: quien pide no
 * llega a saber cuál de las dos cosas fue.
 */
async function borrarMensaje(id, usuario) {
  const { rowCount } = await pool.query(
    `DELETE FROM mensajes m
     USING usuarios u
     WHERE m.usuario_id = u.id AND m.id = $1 AND u.usuario = $2`,
    [id, usuario]
  );
  return rowCount > 0;
}

/** Todos los mensajes; si se pasa usuario, solo los suyos. */
async function todosLosMensajes(usuario = null) {
  const { rows } = await pool.query(
    usuario
      ? `SELECT m.id, m.briefing, m.actualizado_en, u.usuario
         FROM mensajes m JOIN usuarios u ON u.id = m.usuario_id
         WHERE u.usuario = $1 ORDER BY m.actualizado_en DESC`
      : `SELECT m.id, m.briefing, m.actualizado_en, u.usuario
         FROM mensajes m JOIN usuarios u ON u.id = m.usuario_id
         ORDER BY m.actualizado_en DESC`,
    usuario ? [usuario] : []
  );
  if (!rows.length) return [];
  const { rows: secciones } = await pool.query(
    `SELECT mensaje_id, pilar, contenido FROM secciones
     WHERE mensaje_id = ANY($1::bigint[])`,
    [rows.map(r => r.id)]
  );
  return rows.map(m => aplanar(m, secciones.filter(s => String(s.mensaje_id) === String(m.id))));
}

module.exports = { pool, PILARES, guardarMensaje, ultimoMensaje, obtenerMensaje, borrarMensaje, todosLosMensajes };
