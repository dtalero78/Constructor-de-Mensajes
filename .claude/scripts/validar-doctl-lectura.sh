#!/bin/bash
# PreToolUse (matcher: "Bash") — despliegue-do diagnostica, no cambia infraestructura.
# Bloquea todo lo que muta la app de DigitalOcean, el firewall de la base o la rama
# que despliega sola (interfaz-nueva-postgres-agente).
# Contrato: JSON por stdin; exit 2 = BLOQUEADO; exit 0 = permitido.

INPUT=$(cat)

if command -v jq >/dev/null 2>&1; then
  COMANDO=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')
else
  COMANDO=$(printf '%s' "$INPUT" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p')
fi

[ -z "$COMANDO" ] && exit 0

# doctl que muta: apps, bases de datos, firewall, dominios, registry.
if printf '%s' "$COMANDO" | grep -qiE 'doctl[[:space:]]+[a-z-]+([[:space:]]+[a-z-]+)*[[:space:]]+(create|update|delete|restart|append|remove|rm|add|replace|propagate)\b'; then
  echo "BLOQUEADO: despliegue-do es de solo diagnóstico. No crea, actualiza ni borra recursos de DigitalOcean." >&2
  echo "Devuelve el comando exacto en tu resumen para que lo ejecute una persona." >&2
  exit 2
fi

# Empujar código = disparar un despliegue: la rama interfaz-nueva-postgres-agente despliega sola.
if printf '%s' "$COMANDO" | grep -qiE '\bgit[[:space:]]+(push|commit|merge|rebase|reset|checkout[[:space:]]+-b)\b'; then
  echo "BLOQUEADO: un push a interfaz-nueva-postgres-agente dispara un despliegue real. No es tuyo ese botón." >&2
  exit 2
fi

exit 0
