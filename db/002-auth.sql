-- ============================================================
-- Autenticación de verdad: hasta ahora el "usuario" era un nombre
-- que el navegador mandaba en cada petición, así que cualquiera
-- podía leer los mensajes de cualquiera.
-- ============================================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email         text;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS clave_hash    text;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_sub    text;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto          text;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso timestamptz;

-- Un email o una cuenta de Google identifican a una sola persona.
-- Parciales: los 13 usuarios heredados no tienen ni lo uno ni lo otro.
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_unico
  ON usuarios (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_google_unico
  ON usuarios (google_sub) WHERE google_sub IS NOT NULL;

-- Quien no tenga email ni google_sub es un usuario heredado: puede
-- seguir teniendo mensajes, pero nadie puede entrar como él.
