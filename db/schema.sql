-- ============================================================
-- Speakers Living Room — esquema en Postgres
-- Cluster: bslpostgres (DigitalOcean, nyc3) · base: speakers
--
-- Un usuario guarda VARIOS mensajes, y cada mensaje tiene sus
-- partes: los 8 pilares, una fila por pilar.
-- ============================================================

-- Los 8 pilares, en el orden en que se construye la prédica.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pilar') THEN
    CREATE TYPE pilar AS ENUM (
      'titulo', 'introduccion', 'costura', 'problematica',
      'conector', 'desarrollo', 'conclusion', 'ministracion'
    );
  END IF;
END $$;

-- Marca actualizado_en en cada UPDATE.
CREATE OR REPLACE FUNCTION tocar_actualizado() RETURNS trigger AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- usuarios: hoy no hay autenticación, el identificador es el
-- nombre que la persona escribe al entrar (currentUser).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id             bigserial PRIMARY KEY,
  usuario        text        NOT NULL UNIQUE,
  nombre         text,
  creado_en      timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- mensajes: una prédica. El briefing es lo que arma el agente
-- entrevistador (idea central, audiencia, transformación...).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mensajes (
  id             bigserial   PRIMARY KEY,
  usuario_id     bigint      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo         text        NOT NULL DEFAULT '',
  briefing       jsonb,
  estado         text        NOT NULL DEFAULT 'en_curso'
                             CHECK (estado IN ('en_curso', 'listo', 'archivado')),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mensajes_usuario_fecha
  ON mensajes (usuario_id, actualizado_en DESC);

DROP TRIGGER IF EXISTS mensajes_tocar ON mensajes;
CREATE TRIGGER mensajes_tocar BEFORE UPDATE ON mensajes
  FOR EACH ROW EXECUTE FUNCTION tocar_actualizado();

-- ------------------------------------------------------------
-- secciones: las partes que conforman el mensaje.
-- UNIQUE(mensaje_id, pilar) permite el upsert por pilar y hace
-- imposible duplicar una sección dentro del mismo mensaje.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS secciones (
  id             bigserial   PRIMARY KEY,
  mensaje_id     bigint      NOT NULL REFERENCES mensajes(id) ON DELETE CASCADE,
  pilar          pilar       NOT NULL,
  contenido      text        NOT NULL DEFAULT '',
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mensaje_id, pilar)
);

CREATE INDEX IF NOT EXISTS secciones_mensaje ON secciones (mensaje_id);

DROP TRIGGER IF EXISTS secciones_tocar ON secciones;
CREATE TRIGGER secciones_tocar BEFORE UPDATE ON secciones
  FOR EACH ROW EXECUTE FUNCTION tocar_actualizado();

-- ------------------------------------------------------------
-- Permisos del usuario de la aplicación.
-- ------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO speakers_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO speakers_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO speakers_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO speakers_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO speakers_app;
