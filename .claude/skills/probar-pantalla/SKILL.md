---
name: probar-pantalla
description: Prueba una pantalla del panel de Maykelsgym con Playwright simulando las llamadas a Supabase con datos reales, y saca capturas.
disable-model-invocation: true
argument-hint: "<pantalla a probar, ej. Inventario>"
---

# Probar una pantalla con Playwright

Pantalla: $ARGUMENTS (archivo en `src/sections/` o `src/pages/`).

Playwright y Chromium ya están instalados: `require('playwright')` funciona; no ejecutes `playwright install`.

## Pasos
1. `npm install` si falta `node_modules`; arranca `npm run dev` en segundo plano y anota el puerto real de la salida.
2. Escribe el script de prueba **fuera del repo** (carpeta temporal de la sesión), no dentro del proyecto.
3. La app solo habla con Supabase por `supabase.rpc`. Intercepta con `page.route('**/rest/v1/rpc/*', ...)` y responde por nombre de función. Para tener datos creíbles, consulta antes con `execute_sql`/MCP de Supabase un puñado de filas reales (sin datos personales de clientes en capturas que se compartan) y úsalas como respuesta. Intercepta también `auth/v1` para simular una sesión con el rol que quieras probar.
4. Usa un `viewport` de celular (por ejemplo 390×844): el dueño usa la app desde el teléfono.

## Trampas conocidas
- El menú es un **cajón**: ábrelo con el botón “Abrir menú” antes de elegir la pantalla.
- **Resumen** exige respuestas muy detalladas. Si pruebas otra pantalla, sustituye Resumen por un componente vacío (por ejemplo con `page.route` sobre el módulo o un alias temporal) en vez de simular todo.

## Qué comprobar
- Que la pantalla carga con datos, vacía y con error de red.
- Los permisos por rol: lo que `lectura` no debe ver o hacer no aparece o falla con mensaje claro.
- Sin errores en consola ni violaciones de CSP (la CSP está en `netlify.toml`).
- Capturas con `deviceScaleFactor: 2`; revísalas antes de reportar.

Termina con un resumen en español: qué se probó, qué falló, qué quedó sin probar.
