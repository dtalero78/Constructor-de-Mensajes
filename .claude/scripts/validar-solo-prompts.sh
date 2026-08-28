#!/bin/bash
# PreToolUse (matcher: "Edit|Write") — el calibrador solo puede tocar prompts.json.
# El resto del repo (index.js, database.js, auth.js, public/*) queda fuera de su alcance:
# la calibración se cambia en el archivo de datos, no reescribiendo el servidor.
# Contrato: JSON por stdin; exit 2 = BLOQUEADO; exit 0 = permitido.

INPUT=$(cat)

if command -v jq >/dev/null 2>&1; then
  RUTA=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
else
  RUTA=$(printf '%s' "$INPUT" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
fi

[ -z "$RUTA" ] && exit 0

# Permitido: prompts.json del repo, y cualquier archivo del scratchpad (borradores).
case "$RUTA" in
  */prompts.json|prompts.json) exit 0 ;;
  /private/tmp/claude-*|/private/tmp/claude-*/*) exit 0 ;;
esac

echo "BLOQUEADO: calibrador-prompts solo escribe en prompts.json (intentó: $RUTA)." >&2
echo "Si el cambio necesita tocar index.js (tonoLivingRoom, relacionesImportantes, generarTexto)," >&2
echo "devuélvelo como propuesta en tu resumen: lo aplica el hilo principal." >&2
exit 2
