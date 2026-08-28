#!/bin/bash
# PreToolUse (matcher: "Bash") — bloquea cualquier comando con SQL de escritura.
# Copiar a <repo>/.claude/scripts/validar-solo-lectura.sh y chmod +x.
# Contrato: JSON por stdin; exit 2 = llamada BLOQUEADA; exit 0 = permitida.

INPUT=$(cat)

if command -v jq >/dev/null 2>&1; then
  COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')
else
  COMMAND=$(printf '%s' "$INPUT" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p')
fi

[ -z "$COMMAND" ] && exit 0

# SQL de escritura / DDL
if printf '%s' "$COMMAND" | grep -qiE '\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|COPY)\b'; then
  echo "BLOQUEADO: este agente es de SOLO LECTURA. Solo se permiten SELECT/EXPLAIN." >&2
  exit 2
fi

# Escapes de psql que escriben, y scripts de migración
if printf '%s' "$COMMAND" | grep -qiE '\\copy|psql[^|]*-f |npm run (migrate|db:push)|prisma (migrate|db push)'; then
  echo "BLOQUEADO: ejecutar migraciones o archivos SQL no está permitido para este agente." >&2
  exit 2
fi

exit 0
