-- ============================================================
-- Monto individual por visita/pago de cliente (antes solo había
-- total del día en matriculas). Se backfillea el histórico ya
-- cargado con el precio plano que se usó al importar (5,000 CUP).
-- De aquí en adelante se carga el monto real que Mike mande.
-- ============================================================
alter table public.cliente_visitas add column monto numeric;
update public.cliente_visitas set monto = 5000 where monto is null;

create function public.clientes_todos()
returns table(id uuid, nombre text, telefono text, sexo text, entrenador text, visitas bigint, ultima_visita date)
language sql stable security definer set search_path = public as $$
  select c.id, c.nombre, c.telefono, c.sexo, c.entrenador, count(v.id), max(v.fecha)
  from public.clientes_gym c
  left join public.cliente_visitas v on v.cliente_id = c.id
  where app.tiene_permiso('matriculas.ver')
  group by c.id, c.nombre, c.telefono, c.sexo, c.entrenador
  order by c.nombre;
$$;

create function public.clientes_estadisticas_mes(p_mes text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_por_entrenador jsonb;
  v_nuevos integer;
  v_recurrentes integer;
  v_sexo jsonb;
begin
  if not app.tiene_permiso('matriculas.ver') then raise exception 'MG403: sin permiso'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('entrenador', coalesce(t.entrenador, 'Sin entrenador'), 'clientes', t.clientes, 'dinero', t.dinero) order by t.dinero desc), '[]'::jsonb)
  into v_por_entrenador
  from (
    select c.entrenador, count(distinct c.id) as clientes, coalesce(sum(v.monto), 0) as dinero
    from public.cliente_visitas v
    join public.clientes_gym c on c.id = v.cliente_id
    where to_char(v.fecha, 'YYYY-MM') = p_mes
    group by c.entrenador
  ) t;

  select count(*) filter (where primera.primer_mes = p_mes),
         count(*) filter (where primera.primer_mes <> p_mes)
  into v_nuevos, v_recurrentes
  from (
    select c.id, to_char(min(v2.fecha), 'YYYY-MM') as primer_mes
    from public.clientes_gym c
    join public.cliente_visitas v2 on v2.cliente_id = c.id
    where c.id in (select v3.cliente_id from public.cliente_visitas v3 where to_char(v3.fecha, 'YYYY-MM') = p_mes)
    group by c.id
  ) primera;

  select jsonb_build_object(
    'hombres', count(*) filter (where sexo = 'Hombre'),
    'mujeres', count(*) filter (where sexo = 'Mujer'),
    'sin_dato', count(*) filter (where sexo is null or sexo not in ('Hombre', 'Mujer'))
  ) into v_sexo
  from (
    select distinct c.id, c.sexo from public.clientes_gym c
    join public.cliente_visitas v on v.cliente_id = c.id
    where to_char(v.fecha, 'YYYY-MM') = p_mes
  ) distintos;

  return jsonb_build_object('por_entrenador', v_por_entrenador, 'nuevos', coalesce(v_nuevos, 0), 'recurrentes', coalesce(v_recurrentes, 0), 'sexo', v_sexo);
end;
$$;

revoke execute on function public.clientes_todos() from public;
grant execute on function public.clientes_todos() to authenticated, service_role;
revoke execute on function public.clientes_todos() from anon;

revoke execute on function public.clientes_estadisticas_mes(text) from public;
grant execute on function public.clientes_estadisticas_mes(text) to authenticated, service_role;
revoke execute on function public.clientes_estadisticas_mes(text) from anon;
