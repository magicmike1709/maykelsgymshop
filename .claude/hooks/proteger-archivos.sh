#!/usr/bin/env bash
# PreToolUse (Edit|Write|MultiEdit): bloquea archivos con secretos y el lockfile.
# Salida 2 = bloquear y devolver el mensaje a Claude.
ruta=$(jq -r '.tool_input.file_path // empty')
nombre=$(basename "$ruta")
case "$nombre" in
  .env|.env.*)
    if [ "$nombre" != ".env.example" ]; then
      echo "Bloqueado: $nombre puede tener secretos. Las claves van en Netlify/Vercel/Supabase, no en el repo." >&2
      exit 2
    fi ;;
  package-lock.json)
    echo "Bloqueado: package-lock.json se actualiza con npm install, no a mano." >&2
    exit 2 ;;
esac
exit 0
