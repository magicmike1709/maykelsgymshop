---
name: nueva-migracion
description: Crea y aplica una migración SQL nueva de Supabase para Maykelsgym con las comprobaciones de seguridad del proyecto (RLS, permisos, roles).
disable-model-invocation: true
argument-hint: "<qué debe hacer la migración>"
---

# Nueva migración de Supabase

Tarea: $ARGUMENTS

## 1. Preparar
- Lista `supabase/migrations/` y toma el siguiente número libre (4 dígitos). Nombre: `NNNN_descripcion_corta.sql`.
- Mira el esquema actual con `list_tables` y lee la migración más reciente relacionada para copiar su estilo (comentarios en español, `security definer set search_path = public`).
- Proyecto: `dzyupwadmryxywanydqf` (maykelsgymshop-nuevo). **Es la base real**: antes de modificar datos, haz un `select` que muestre qué filas se tocarían.

## 2. Reglas obligatorias
- La app nunca lee tablas directamente: todo acceso nuevo es una función `public.*` con `security definer` y comprobación de permisos al inicio (`app.tiene_permiso('...')`, `app.es_admin()` o equivalente).
- Tablas nuevas: `enable row level security` y **sin privilegios** para `anon` ni `authenticated` (`revoke all`).
- Funciones nuevas: `revoke execute ... from public, anon` y `grant execute ... to authenticated`.
- Las listas exigen usuario activo. Los roles son admin, operador_plus, operador, lectura y mensajero; decide y escribe qué rol puede qué.
- Migración idempotente cuando se pueda (`create or replace`, `if not exists`).

## 3. Aplicar y verificar
1. Escribe el archivo en el repo y aplícalo con `apply_migration` (mismo contenido).
2. Simula cada rol dentro de la base (`set local role` / claims con `execute_sql`) y comprueba que lo permitido funciona y lo no permitido falla. Anónimo debe fallar siempre.
3. Corre `get_advisors` de seguridad y corrige lo que aparezca por esta migración.
4. Si cambia una función que usa la app, actualiza el `supabase.rpc` en `src/` y corre `npm run build`.

## 4. Entregar
Resume en español: qué cambia, qué rol puede qué, qué comprobaciones pasaron. No crees PR salvo que se pida.
