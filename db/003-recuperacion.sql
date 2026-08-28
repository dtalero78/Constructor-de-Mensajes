-- Recuperación de contraseña.
-- Se guarda el HASH del token, no el token: si alguien lee la tabla, no
-- puede usarlo para entrar en ninguna cuenta.
CREATE TABLE IF NOT EXISTS recuperaciones (
  id          bigserial   PRIMARY KEY,
  usuario_id  bigint      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash  text        NOT NULL,
  expira_en   timestamptz NOT NULL,
  usado_en    timestamptz,
  creado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recuperaciones_token ON recuperaciones (token_hash);
CREATE INDEX IF NOT EXISTS recuperaciones_usuario ON recuperaciones (usuario_id, creado_en DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON recuperaciones TO speakers_app;
GRANT USAGE, SELECT ON SEQUENCE recuperaciones_id_seq TO speakers_app;
