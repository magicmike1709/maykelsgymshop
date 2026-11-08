#!/usr/bin/env bash
# Stop: si hay cambios en la app, corre "vite build". Si falla, Claude debe arreglarlo.
entrada=$(cat)
# Evita bucles: si ya se reintentó una vez, deja terminar.
[ "$(echo "$entrada" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
# Solo si cambió código de la app o su configuración
git status --porcelain -- src index.html vite.config.js tailwind.config.js postcss.config.js package.json 2>/dev/null | grep -q . || exit 0
# Sin dependencias instaladas no se puede compilar: no estorbar
[ -d node_modules ] || { echo "Aviso: node_modules no existe; no se comprobó el build (npm install)." >&2; exit 0; }

salida=$(npm run build 2>&1)
if [ $? -ne 0 ]; then
  echo "El build de Vite falló. Corrígelo antes de terminar:" >&2
  echo "$salida" | tail -25 >&2
  exit 2
fi
exit 0
