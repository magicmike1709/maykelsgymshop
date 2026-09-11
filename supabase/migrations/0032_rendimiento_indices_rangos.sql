-- Auditoría de rendimiento con datos reales de volumen (815 clientes,
-- ~1250 visitas y creciendo). Dos problemas se repetían:
--
-- 1) Varias funciones filtraban con to_char(fecha, 'YYYY-MM') = p_mes.
--    Aplicar una función sobre la columna vuelve la comparación no
--    "sargable" — Postgres no puede usar el índice de fecha y termina
--    leyendo la tabla completa cada vez, justo en las pantallas que
--    más se usan (Directorio por mes, Estadísticas, Recordar,
--    Resumen). Se cambia a comparar por rango de fechas real.
-- 2) Faltaban índices en las columnas de FK que se usan en los JOIN
--    más frecuentes (cliente_visitas.cliente_id, venta_lineas.venta_id).
create index ix_cliente_visitas_cliente_id on public.cliente_visitas(cliente_id);
create index ix_venta_lineas_venta_id on public.venta_lineas(venta_id);
create index ix_venta_lineas_socio_pendiente on public.venta_lineas(socio_id) where socio_pagado_en is null;

create or replace function public.clientes_por_mes(p_mes text)
returns table(id uuid, nombre text, telefono text, sexo text, entrenador text, fecha date)
language sql stable security definer set search_path = public as $$
  select c.id, c.nombre, c.telefono, c.sexo, c.entrenador, v.fecha
  from public.cliente_visitas v
  join public.clientes_gym c on c.id = v.cliente_id
  where v.fecha >= (p_mes || '-01')::date and v.fecha < (p_mes || '-01')::date + interval '1 month'
    and app.tiene_permiso('matriculas.ver')
  order by v.fecha, c.nombre;
$$;

create or replace function public.clientes_no_renovaron(p_mes text default to_char(current_date, 'YYYY-MM'))
returns table(id uuid, nombre text, telefono text, entrenador text, mes_anterior text, fecha_pago date)
language plpgsql stable security definer set search_path = public as $$
declare v_mes_anterior text;
begin
  if not app.tiene_permiso('matriculas.ver') then raise exception 'MG403: sin permiso'; end if;

  select mes into v_mes_anterior from public.clientes_meses_disponibles()
  where mes < p_mes order by mes desc limit 1;

  if v_mes_anterior is null then return; end if;

  return query
    select c.id, c.nombre, c.telefono, c.entrenador, v_mes_anterior, max(cv.fecha)
    from public.clientes_gym c
    join public.cliente_visitas cv on cv.cliente_id = c.id
      and cv.fecha >= (v_mes_anterior || '-01')::date and cv.fecha < (v_mes_anterior || '-01')::date + interval '1 month'
    where not exists (
      select 1 from public.cliente_visitas cv2
      where cv2.cliente_id = c.id
        and cv2.fecha >= (p_mes || '-01')::date and cv2.fecha < (p_mes || '-01')::date + interval '1 month'
    )
    group by c.id, c.nombre, c.telefono, c.entrenador
    order by max(cv.fecha);
end;
$$;

-- clientes_todos traía los 815 clientes completos cada vez que se
-- tocaba "Todos" en el Directorio, sin límite — pesado en datos
-- móviles. Se agrega un límite (con orden por última visita, más
-- útil que alfabético para ver quién anda activo).
drop function if exists public.clientes_todos();

create or replace function public.clientes_todos(p_limite integer default 300)
returns table(id uuid, nombre text, telefono text, sexo text, entrenador text, visitas bigint, ultima_visita date)
language sql stable security definer set search_path = public as $$
  select c.id, c.nombre, c.telefono, c.sexo, c.entrenador, count(v.id), max(v.fecha)
  from public.clientes_gym c
  left join public.cliente_visitas v on v.cliente_id = c.id
  where app.tiene_permiso('matriculas.ver')
  group by c.id, c.nombre, c.telefono, c.sexo, c.entrenador
  order by max(v.fecha) desc nulls last
  limit p_limite;
$$;

-- clientes_estadisticas_mes: mismo cambio de rango de fecha, más un
-- bug de datos aparte que se encontró de paso: los clientes cargados
-- desde el CSV histórico traen sexo = 'H'/'M' (una letra), pero esta
-- función solo reconocía 'Hombre'/'Mujer' completo — así que todos
-- esos clientes se contaban como "sin dato" en vez de por su sexo real.
create or replace function public.clientes_estadisticas_mes(p_mes text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_por_entrenador jsonb;
  v_nuevos integer;
  v_recurrentes integer;
  v_sexo jsonb;
  v_desde date := (p_mes || '-01')::date;
  v_hasta date := (p_mes || '-01')::date + interval '1 month';
begin
  if not app.tiene_permiso('matriculas.ver') then raise exception 'MG403: sin permiso'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('entrenador', coalesce(t.entrenador, 'Sin entrenador'), 'clientes', t.clientes, 'dinero', t.dinero) order by t.dinero desc), '[]'::jsonb)
  into v_por_entrenador
  from (
    select c.entrenador, count(distinct c.id) as clientes, coalesce(sum(v.monto), 0) as dinero
    from public.cliente_visitas v
    join public.clientes_gym c on c.id = v.cliente_id
    where v.fecha >= v_desde and v.fecha < v_hasta
    group by c.entrenador
  ) t;

  select count(*) filter (where primera.primer_mes = p_mes),
         count(*) filter (where primera.primer_mes <> p_mes)
  into v_nuevos, v_recurrentes
  from (
    select c.id, to_char(min(v2.fecha), 'YYYY-MM') as primer_mes
    from public.clientes_gym c
    join public.cliente_visitas v2 on v2.cliente_id = c.id
    where c.id in (
      select v3.cliente_id from public.cliente_visitas v3
      where v3.fecha >= v_desde and v3.fecha < v_hasta
    )
    group by c.id
  ) primera;

  select jsonb_build_object(
    'hombres', count(*) filter (where sexo in ('Hombre', 'H')),
    'mujeres', count(*) filter (where sexo in ('Mujer', 'M')),
    'sin_dato', count(*) filter (where sexo is null or sexo not in ('Hombre', 'Mujer', 'H', 'M'))
  ) into v_sexo
  from (
    select distinct c.id, c.sexo from public.clientes_gym c
    join public.cliente_visitas v on v.cliente_id = c.id
    where v.fecha >= v_desde and v.fecha < v_hasta
  ) distintos;

  return jsonb_build_object('por_entrenador', v_por_entrenador, 'nuevos', coalesce(v_nuevos, 0), 'recurrentes', coalesce(v_recurrentes, 0), 'sexo', v_sexo);
end;
$$;

-- vitrina_panel comparaba fecha::date between ..., un cast que
-- también inutiliza el índice de fecha (timestamptz). Se cambia a
-- rango real sobre el timestamp.
create or replace function public.vitrina_panel(p_desde date default date_trunc('month', current_date)::date, p_hasta date default current_date)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', coalesce(sum(total), 0),
    'costo', coalesce(sum(costo_total), 0),
    'ganancia', coalesce(sum(ganancia), 0),
    'ventas', count(*),
    'fiados_pendientes', (select count(*) from public.ventas where es_fiado and fiado_cobrado_en is null)
  )
  from public.ventas
  where fecha >= p_desde and fecha < (p_hasta + 1) and estado = 'confirmada' and app.tiene_permiso('inventario.ver');
$$;

revoke execute on function public.clientes_todos(integer) from anon;
grant execute on function public.clientes_todos(integer) to authenticated, service_role;
