-- 0047 · Tablero de clientes para el dueño y lista de avisos para recepción.
--
-- Nota de numeración: 0042–0046 se aplicaron a la base desde otra sesión
-- (cobros del gym, publicaciones) y sus archivos no están en este repo.
--
-- Qué agrega:
--   · Permiso `clientes.avisar` (admin y cobrador): ver a quién se le vence la
--     matrícula y marcar que ya se le escribió. No da acceso al dinero.
--   · Tabla `cliente_avisos`: un renglón por cliente y día en que se le avisó.
--   · `recepcion_buscar`, `clientes_por_avisar`, `cliente_aviso_marcar`.
--   · `clientes_tablero` (solo admin): activos, renovación, nuevos, dinero por
--     recuperar, entrenadores y tendencia.

insert into public.permisos (codigo, grupo, descripcion, orden)
values ('clientes.avisar', 'Gym', 'Ver a quién se le vence la matrícula y marcar a quién ya se le avisó', 13)
on conflict (codigo) do nothing;

insert into public.rol_permisos (rol, permiso)
values ('admin', 'clientes.avisar'), ('cobrador', 'clientes.avisar')
on conflict do nothing;

create table if not exists public.cliente_avisos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_gym(id) on delete cascade,
  fecha date not null,
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  unique (cliente_id, fecha)
);
create index if not exists cliente_avisos_fecha_idx on public.cliente_avisos (fecha);
create index if not exists cliente_avisos_usuario_idx on public.cliente_avisos (usuario_id);

alter table public.cliente_avisos enable row level security;
revoke all on public.cliente_avisos from public, anon, authenticated;

create or replace function app.puede_avisar()
returns boolean
language sql stable security definer set search_path = public as $$
  select app.tiene_permiso('clientes.avisar');
$$;
revoke execute on function app.puede_avisar() from public, anon;

-- Buscar un cliente y ver cómo está su matrícula (sin montos).
create or replace function public.recepcion_buscar(p_busqueda text, p_limite integer default 20)
returns table (id uuid, nombre text, telefono text, entrenador text, ultimo_pago date, vence date, dias integer)
language sql stable security definer set search_path = public as $$
  with cfg as (select app.config_num('ciclo_dias', 30)::int ciclo, app.hoy_cuba() hoy)
  select c.id, c.nombre, c.telefono, c.entrenador, u.ult,
         coalesce(c.fecha_oficial, u.ult) + cfg.ciclo,
         ((coalesce(c.fecha_oficial, u.ult) + cfg.ciclo) - cfg.hoy)::int
  from public.clientes_gym c
  left join lateral (select max(v.fecha) ult from public.cliente_visitas v where v.cliente_id = c.id) u on true
  cross join cfg
  where app.puede_avisar()
    and length(btrim(coalesce(p_busqueda, ''))) >= 2
    and (c.nombre ilike '%' || btrim(p_busqueda) || '%' or c.telefono ilike '%' || btrim(p_busqueda) || '%')
  order by u.ult desc nulls last
  limit least(greatest(coalesce(p_limite, 20), 1), 50);
$$;

-- A quién se le vence o se le venció, y si ya se le avisó en este ciclo.
create or replace function public.clientes_por_avisar(p_dias_aviso integer default 5, p_max_vencido integer default 45)
returns table (id uuid, nombre text, telefono text, entrenador text, vence date, dias integer, estado text,
               avisado_el date, avisado_por text)
language sql stable security definer set search_path = public as $$
  select v.id, v.nombre, v.telefono, v.entrenador, v.vence, v.dias, v.estado, a.fecha, a.quien
  from app.vencimientos_calc(least(greatest(coalesce(p_dias_aviso, 5), 0), 30),
                             least(greatest(coalesce(p_max_vencido, 45), 0), 180)) v
  left join lateral (
    select x.fecha, u.nombre as quien
    from public.cliente_avisos x
    left join public.usuarios u on u.id = x.usuario_id
    -- Solo cuentan los avisos de este vencimiento (desde 10 días antes de vencer).
    where x.cliente_id = v.id and x.fecha >= v.vence - 10
    order by x.fecha desc limit 1
  ) a on true
  where app.puede_avisar()
  order by v.vence;
$$;

-- Marcar (o desmarcar) que hoy se le escribió a un cliente.
create or replace function public.cliente_aviso_marcar(p_cliente_id uuid, p_avisado boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_hoy date := app.hoy_cuba();
begin
  if not app.puede_avisar() then raise exception 'MG403: sin permiso'; end if;
  if not exists (select 1 from public.clientes_gym where id = p_cliente_id) then
    raise exception 'MG404: el cliente no existe';
  end if;
  if coalesce(p_avisado, true) then
    insert into public.cliente_avisos (cliente_id, fecha, usuario_id)
    values (p_cliente_id, v_hoy, app.usuario_actual())
    on conflict (cliente_id, fecha) do nothing;
  else
    -- Desmarcar quita el último aviso de los últimos 10 días (corrige un toque por error).
    delete from public.cliente_avisos
    where id = (select id from public.cliente_avisos
                where cliente_id = p_cliente_id and fecha >= v_hoy - 10
                order by fecha desc limit 1);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Tablero del dueño.
create or replace function public.clientes_tablero()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_hoy date := app.hoy_cuba();
  v_ciclo int := app.config_num('ciclo_dias', 30)::int;
  v_precio numeric := app.config_num('precio_matricula', 0);
  v_mes date := date_trunc('month', app.hoy_cuba())::date;
  v_ant date := (date_trunc('month', app.hoy_cuba()) - interval '1 month')::date;
  -- Mismo tramo del mes anterior, para comparar parejo (1 al día de hoy).
  v_ant_corte date;
  v_estado jsonb; v_mes_j jsonb; v_meses jsonb; v_entren jsonb; v_avisos jsonb;
begin
  if not app.es_admin() then raise exception 'MG403: solo el dueño ve el tablero'; end if;
  v_ant_corte := least(v_ant + (v_hoy - v_mes), v_mes - 1);

  with base as (
    select c.id, c.telefono,
           (coalesce(c.fecha_oficial, (select max(v.fecha) from public.cliente_visitas v where v.cliente_id = c.id)) + v_ciclo) as vence
    from public.clientes_gym c
  )
  select jsonb_build_object(
    'total', count(*),
    'activos', count(*) filter (where vence >= v_hoy),
    'vencen_7', count(*) filter (where vence between v_hoy and v_hoy + 7),
    'por_recuperar', count(*) filter (where vence < v_hoy and vence >= v_hoy - 45),
    'por_recuperar_con_tel', count(*) filter (where vence < v_hoy and vence >= v_hoy - 45 and coalesce(telefono, '') <> ''),
    'dormidos', count(*) filter (where vence < v_hoy - 45 and vence >= v_hoy - 180),
    'perdidos', count(*) filter (where vence < v_hoy - 180),
    'sin_telefono', count(*) filter (where coalesce(telefono, '') = '')
  ) into v_estado from base;

  with pagos as (
    select v.cliente_id, v.fecha, coalesce(v.monto, 0) monto,
           (select min(x.fecha) from public.cliente_visitas x where x.cliente_id = v.cliente_id) primera
    from public.cliente_visitas v where v.fecha >= v_ant
  )
  select jsonb_build_object(
    'pagaron', count(distinct cliente_id) filter (where fecha >= v_mes),
    'cup', coalesce(sum(monto) filter (where fecha >= v_mes), 0),
    'nuevos', count(distinct cliente_id) filter (where fecha >= v_mes and primera >= v_mes),
    'ant_pagaron', count(distinct cliente_id) filter (where fecha between v_ant and v_ant_corte),
    'ant_cup', coalesce(sum(monto) filter (where fecha between v_ant and v_ant_corte), 0),
    'ant_nuevos', count(distinct cliente_id) filter (where fecha between v_ant and v_ant_corte and primera >= v_ant),
    'ant_hasta', v_ant_corte
  ) into v_mes_j from pagos;

  -- Últimos 6 meses: cuántos pagaron, dinero, nuevos y cuántos del mes anterior repitieron.
  with pm as (
    select v.cliente_id, date_trunc('month', v.fecha)::date mes, sum(coalesce(v.monto, 0)) monto
    from public.cliente_visitas v
    where v.fecha >= (v_mes - interval '6 months')::date
    group by 1, 2
  ),
  prim as (
    select cliente_id, date_trunc('month', min(fecha))::date m0 from public.cliente_visitas group by 1
  ),
  m as (
    select pm.mes, count(*) pagaron, sum(pm.monto) cup,
           count(*) filter (where prim.m0 = pm.mes) nuevos,
           count(*) filter (where exists (select 1 from pm p2 where p2.cliente_id = pm.cliente_id
                                          and p2.mes = (pm.mes - interval '1 month')::date)) renovaron,
           (select count(*) from pm p3 where p3.mes = (pm.mes - interval '1 month')::date) base_anterior
    from pm join prim using (cliente_id)
    where pm.mes >= (v_mes - interval '5 months')::date
    group by pm.mes
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'mes', to_char(mes, 'YYYY-MM'), 'pagaron', pagaron, 'cup', cup, 'nuevos', nuevos,
    'renovaron', renovaron, 'base_anterior', base_anterior) order by mes), '[]'::jsonb)
  into v_meses from m;

  with base as (
    select c.id, coalesce(nullif(btrim(c.entrenador), ''), 'Sin entrenador') entrenador,
           (coalesce(c.fecha_oficial, (select max(v.fecha) from public.cliente_visitas v where v.cliente_id = c.id)) + v_ciclo) as vence,
           (select coalesce(sum(v.monto), 0) from public.cliente_visitas v where v.cliente_id = c.id and v.fecha > v_hoy - 30) cup_30
    from public.clientes_gym c
  ),
  e as (
    select entrenador,
           count(*) filter (where vence >= v_hoy) activos,
           count(*) filter (where vence < v_hoy and vence >= v_hoy - 45) vencidos,
           sum(cup_30) cup_30
    from base group by entrenador
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'entrenador', entrenador, 'activos', activos, 'vencidos', vencidos, 'cup_30', cup_30) order by activos desc), '[]'::jsonb)
  into v_entren from e where activos + vencidos > 0;

  select jsonb_build_object(
    'avisados', count(*),
    'volvieron', count(*) filter (where exists (
      select 1 from public.cliente_visitas v where v.cliente_id = a.cliente_id and v.fecha >= a.primera)),
    'ultimo', max(a.ultima)
  ) into v_avisos
  from (select cliente_id, min(fecha) primera, max(fecha) ultima
        from public.cliente_avisos where fecha > v_hoy - 30 group by cliente_id) a;

  return jsonb_build_object(
    'hoy', v_hoy, 'ciclo', v_ciclo, 'precio', v_precio,
    'estado', v_estado, 'mes', v_mes_j, 'meses', v_meses,
    'entrenadores', v_entren, 'avisos', v_avisos);
end;
$$;

revoke execute on function public.recepcion_buscar(text, integer) from public, anon;
revoke execute on function public.clientes_por_avisar(integer, integer) from public, anon;
revoke execute on function public.cliente_aviso_marcar(uuid, boolean) from public, anon;
revoke execute on function public.clientes_tablero() from public, anon;
grant execute on function public.recepcion_buscar(text, integer) to authenticated, service_role;
grant execute on function public.clientes_por_avisar(integer, integer) to authenticated, service_role;
grant execute on function public.cliente_aviso_marcar(uuid, boolean) to authenticated, service_role;
grant execute on function public.clientes_tablero() to authenticated, service_role;
