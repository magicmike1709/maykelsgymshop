-- Avisos de seguridad de Supabase: las dos funciones auxiliares nuevas fijan su search_path.
alter function app.hoy_cuba() set search_path = public;
alter function app.estado_vencimiento(integer, integer) set search_path = public;
