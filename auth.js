// ============================================================
// Autenticación: email + contraseña, y "Continuar con Google".
//
// Antes, el "usuario" era un nombre que el navegador mandaba en cada
// petición: cualquiera podía leer los mensajes de cualquiera cambiando
// una cadena. Ahora la identidad sale SIEMPRE de la cookie de sesión y
// el cliente ya no elige de quién son los datos.
// ============================================================

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { pool } = require('./database');

const COOKIE = 'sesion';
const DIAS = 30;

if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  Falta SESSION_SECRET: las sesiones no sobreviven a un reinicio.');
}
const SECRETO = process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const clienteGoogle = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const normalizarEmail = (email) => String(email || '').trim().toLowerCase();

/** Lo que viaja al front: nunca el hash ni el id de Google. */
const publico = (u) => ({
  id: u.id, usuario: u.usuario, nombre: u.nombre, email: u.email, foto: u.foto
});

function darCookie(res, usuario) {
  const token = jwt.sign({ id: usuario.id }, SECRETO, { expiresIn: `${DIAS}d` });
  res.cookie(COOKIE, token, {
    httpOnly: true,                                   // fuera del alcance de scripts
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',    // en local no hay https
    maxAge: DIAS * 24 * 60 * 60 * 1000
  });
}

async function usuarioDeLaCookie(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const { id } = jwt.verify(token, SECRETO);
    const { rows } = await pool.query(
      `SELECT id, usuario, nombre, email, foto FROM usuarios WHERE id = $1`, [id]);
    return rows[0] || null;
  } catch {
    return null;                                      // caducada o manipulada
  }
}

/** Middleware: corta el paso si no hay sesión. */
async function requiereSesion(req, res, next) {
  const usuario = await usuarioDeLaCookie(req);
  if (!usuario) return res.status(401).json({ error: 'Necesitas iniciar sesión' });
  req.usuario = usuario;
  next();
}

/** Deja req.usuario si lo hay, pero no corta. */
async function sesionOpcional(req, res, next) {
  req.usuario = await usuarioDeLaCookie(req);
  next();
}

/** Nombre visible único: de "Ana Ruiz" sale "ana", "ana-2", "ana-3"... */
async function nombreLibre(base) {
  const raiz = (base || 'speaker').trim().split(/\s+/)[0].toLowerCase()
    .replace(/[^a-z0-9áéíóúñ-]/gi, '') || 'speaker';
  for (let i = 0; i < 50; i++) {
    const intento = i ? `${raiz}-${i + 1}` : raiz;
    const { rows } = await pool.query(`SELECT 1 FROM usuarios WHERE usuario = $1`, [intento]);
    if (!rows.length) return intento;
  }
  return `${raiz}-${Date.now()}`;
}

function registrarRutas(app) {
  // ---------- Registro con email ----------
  app.post('/auth/registro', async (req, res) => {
    const email = normalizarEmail(req.body.email);
    const clave = String(req.body.clave || '');
    const nombre = String(req.body.nombre || '').trim();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Ese correo no parece válido' });
    }
    if (clave.length < 8) {
      return res.status(400).json({ error: 'La contraseña necesita al menos 8 caracteres' });
    }

    try {
      const { rows: existe } = await pool.query(
        `SELECT 1 FROM usuarios WHERE lower(email) = $1`, [email]);
      if (existe.length) {
        return res.status(409).json({ error: 'Ya hay una cuenta con ese correo. Inicia sesión.' });
      }

      const { rows } = await pool.query(
        `INSERT INTO usuarios (usuario, nombre, email, clave_hash, ultimo_acceso)
         VALUES ($1, $2, $3, $4, now())
         RETURNING id, usuario, nombre, email, foto`,
        [await nombreLibre(nombre || email.split('@')[0]), nombre || null, email,
         await bcrypt.hash(clave, 12)]
      );
      darCookie(res, rows[0]);
      return res.json({ success: true, usuario: publico(rows[0]) });
    } catch (error) {
      console.error('❌ Error al registrar:', error.message);
      return res.status(500).json({ error: 'No se pudo crear la cuenta' });
    }
  });

  // ---------- Entrar con email ----------
  app.post('/auth/entrar', async (req, res) => {
    const email = normalizarEmail(req.body.email);
    const clave = String(req.body.clave || '');

    try {
      const { rows } = await pool.query(
        `SELECT * FROM usuarios WHERE lower(email) = $1`, [email]);
      const u = rows[0];

      // Mismo mensaje exista o no la cuenta: no confirmamos qué correos hay.
      if (!u || !u.clave_hash || !(await bcrypt.compare(clave, u.clave_hash))) {
        return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
      }

      await pool.query(`UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1`, [u.id]);
      darCookie(res, u);
      return res.json({ success: true, usuario: publico(u) });
    } catch (error) {
      console.error('❌ Error al entrar:', error.message);
      return res.status(500).json({ error: 'No se pudo iniciar sesión' });
    }
  });

  // ---------- Entrar con Google ----------
  app.post('/auth/google', async (req, res) => {
    if (!clienteGoogle) {
      return res.status(503).json({ error: 'Falta configurar GOOGLE_CLIENT_ID en el servidor' });
    }
    try {
      // Verificamos el id_token contra Google: firma, caducidad y destinatario.
      const ticket = await clienteGoogle.verifyIdToken({
        idToken: String(req.body.credential || ''),
        audience: GOOGLE_CLIENT_ID
      });
      const datos = ticket.getPayload();
      if (!datos?.email_verified) {
        return res.status(401).json({ error: 'Google no confirmó ese correo' });
      }

      const email = normalizarEmail(datos.email);
      const { rows: encontrados } = await pool.query(
        `SELECT * FROM usuarios WHERE google_sub = $1 OR lower(email) = $2 LIMIT 1`,
        [datos.sub, email]
      );

      let u = encontrados[0];
      if (u) {
        // Cuenta creada antes con contraseña: se le enlaza el Google.
        const { rows } = await pool.query(
          `UPDATE usuarios SET google_sub = $1, foto = COALESCE($2, foto),
                  nombre = COALESCE(nombre, $3), email = COALESCE(email, $4),
                  ultimo_acceso = now()
           WHERE id = $5 RETURNING id, usuario, nombre, email, foto`,
          [datos.sub, datos.picture || null, datos.name || null, email, u.id]);
        u = rows[0];
      } else {
        const { rows } = await pool.query(
          `INSERT INTO usuarios (usuario, nombre, email, google_sub, foto, ultimo_acceso)
           VALUES ($1, $2, $3, $4, $5, now())
           RETURNING id, usuario, nombre, email, foto`,
          [await nombreLibre(datos.given_name || datos.name || email.split('@')[0]),
           datos.name || null, email, datos.sub, datos.picture || null]);
        u = rows[0];
      }

      darCookie(res, u);
      return res.json({ success: true, usuario: publico(u) });
    } catch (error) {
      console.error('❌ Error con Google:', error.message);
      return res.status(401).json({ error: 'No pude verificar tu cuenta de Google' });
    }
  });

  // ---------- Quién soy / salir ----------
  app.get('/auth/yo', sesionOpcional, (req, res) => {
    if (!req.usuario) return res.status(401).json({ error: 'Sin sesión' });
    res.json({ success: true, usuario: publico(req.usuario), googleActivo: Boolean(clienteGoogle) });
  });

  app.get('/auth/config', (req, res) => {
    res.json({ googleClientId: GOOGLE_CLIENT_ID || null });
  });

  app.post('/auth/salir', (req, res) => {
    res.clearCookie(COOKIE);
    res.json({ success: true });
  });
}

module.exports = { registrarRutas, requiereSesion, sesionOpcional };
