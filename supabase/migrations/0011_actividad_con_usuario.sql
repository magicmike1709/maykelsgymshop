drop function if exists public.actividad_lista(integer);

create function public.actividad_lista(p_limite integer default 50)
returns table(id bigint, usuario_id uuid, usuario_nombre text, tabla text, accion text, registro_id text, datos jsonb, creado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.usuario_id, u.nombre, a.tabla, a.accion, a.registro_id, a.datos, a.creado_en
  from public.actividad a left join public.usuarios u on u.id = a.usuario_id
  where app.tiene_permiso('contabilidad.ver')
  order by a.creado_en desc limit p_limite;
$$;

revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.catalogo_publico() to anon;
