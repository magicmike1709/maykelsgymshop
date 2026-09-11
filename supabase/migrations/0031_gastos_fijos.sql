-- Gastos fijos: plantillas de gastos que se repiten cada mes (renta,
-- nómina, luz, internet...). El dueño los da de alta una vez con su
-- monto e importe por defecto, y cada mes se pueden cargar con un
-- toque (o se generan solos con gastos_fijos_generar_mes, pensada
-- para correr desde un Routine el día 1 de cada mes) en vez de
-- escribirlos a mano otra vez.
create table public.gastos_fijos (
  id uuid primary key default gen_random_uuid(),
  concepto text not null,
  importe numeric not null check (importe >= 0),
  moneda text not null check (moneda in ('CUP', 'USD')),
  categoria_id uuid references public.gasto_categorias(id),
  dia_mes smallint not null default 1 check (dia_mes between 1 and 28),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table public.gastos_fijos enable row level security;

alter table public.gastos add column gasto_fijo_id uuid references public.gastos_fijos(id);

-- Un gasto fijo solo genera un gasto por mes (evita duplicar si se
-- toca el botón dos veces o si corre el generador automático y luego
-- alguien lo carga a mano).
create unique index ux_gastos_fijo_mes on public.gastos (gasto_fijo_id, (((extract(year from fecha)*100 + extract(month from fecha))::int)))
  where gasto_fijo_id is not null;

create function public.gastos_fijos_lista()
returns table(id uuid, concepto text, importe numeric, moneda text, categoria_id uuid, categoria text, dia_mes smallint,
  ya_cargado_este_mes boolean)
language sql stable security definer set search_path = public as $$
  select f.id, f.concepto, f.importe, f.moneda, f.categoria_id, gc.nombre, f.dia_mes,
    exists (
      select 1 from public.gastos g
      where g.gasto_fijo_id = f.id and to_char(g.fecha, 'YYYY-MM') = to_char(current_date, 'YYYY-MM')
    )
  from public.gastos_fijos f
  left join public.gasto_categorias gc on gc.id = f.categoria_id
  where f.activo and app.tiene_permiso('gastos.registrar')
  order by f.dia_mes, f.concepto;
$$;

create function public.gasto_fijo_guardar(p_id uuid, p_concepto text, p_importe numeric, p_moneda text,
  p_categoria_id uuid default null, p_dia_mes smallint default 1)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('gastos.registrar') then raise exception 'MG403: sin permiso'; end if;
  if p_id is null then
    insert into public.gastos_fijos (concepto, importe, moneda, categoria_id, dia_mes)
    values (p_concepto, p_importe, p_moneda, p_categoria_id, p_dia_mes)
    returning id into v_id;
  else
    update public.gastos_fijos set concepto = p_concepto, importe = p_importe, moneda = p_moneda,
      categoria_id = p_categoria_id, dia_mes = p_dia_mes
    where id = p_id returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create function public.gasto_fijo_desactivar(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.tiene_permiso('gastos.registrar') then raise exception 'MG403: sin permiso'; end if;
  update public.gastos_fijos set activo = false where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Carga UN gasto fijo como gasto real de hoy (botón de un toque).
create function public.gasto_fijo_cargar(p_id uuid, p_fecha date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_fijo record; v_id uuid;
begin
  if not app.tiene_permiso('gastos.registrar') then raise exception 'MG403: sin permiso'; end if;
  if app.dia_cerrado(p_fecha) then raise exception 'MG423: el día ya está cerrado, reábrelo para editar'; end if;
  select * into v_fijo from public.gastos_fijos where id = p_id and activo;
  if v_fijo is null then raise exception 'MG404: gasto fijo no encontrado'; end if;
  insert into public.gastos (fecha, moneda, importe, categoria_id, concepto, usuario_id, gasto_fijo_id)
  values (p_fecha, v_fijo.moneda, v_fijo.importe, v_fijo.categoria_id, v_fijo.concepto, app.usuario_actual(), p_id)
  on conflict (gasto_fijo_id, (((extract(year from fecha)*100 + extract(month from fecha))::int))) where gasto_fijo_id is not null do nothing
  returning id into v_id;
  return jsonb_build_object('ok', v_id is not null, 'id', v_id);
end;
$$;

-- Genera TODOS los gastos fijos activos que falten para un mes de
-- una vez — pensada para correr sola desde un Routine mensual, pero
-- también se puede llamar a mano.
create function public.gastos_fijos_generar_mes(p_mes text default to_char(current_date, 'YYYY-MM'))
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_fijo record; v_fecha date; v_creados int := 0;
begin
  if not app.tiene_permiso('gastos.registrar') then raise exception 'MG403: sin permiso'; end if;
  for v_fijo in select * from public.gastos_fijos where activo loop
    v_fecha := (p_mes || '-01')::date + (least(v_fijo.dia_mes, 28) - 1);
    insert into public.gastos (fecha, moneda, importe, categoria_id, concepto, usuario_id, gasto_fijo_id)
    values (v_fecha, v_fijo.moneda, v_fijo.importe, v_fijo.categoria_id, v_fijo.concepto, app.usuario_actual(), v_fijo.id)
    on conflict (gasto_fijo_id, (((extract(year from fecha)*100 + extract(month from fecha))::int))) where gasto_fijo_id is not null do nothing;
    if found then v_creados := v_creados + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'creados', v_creados);
end;
$$;

-- Borrar un gasto cargado por error.
create function public.gasto_borrar(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_fecha date;
begin
  if not app.tiene_permiso('gastos.registrar') then raise exception 'MG403: sin permiso'; end if;
  select fecha into v_fecha from public.gastos where id = p_id;
  if v_fecha is not null and app.dia_cerrado(v_fecha) then raise exception 'MG423: el día ya está cerrado, reábrelo para editar'; end if;
  delete from public.gastos where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.gastos_fijos_lista() from anon;
revoke execute on function public.gasto_fijo_guardar(uuid, text, numeric, text, uuid, smallint) from anon;
revoke execute on function public.gasto_fijo_desactivar(uuid) from anon;
revoke execute on function public.gasto_fijo_cargar(uuid, date) from anon;
revoke execute on function public.gastos_fijos_generar_mes(text) from anon;
revoke execute on function public.gasto_borrar(uuid) from anon;

grant execute on function public.gastos_fijos_lista() to authenticated, service_role;
grant execute on function public.gasto_fijo_guardar(uuid, text, numeric, text, uuid, smallint) to authenticated, service_role;
grant execute on function public.gasto_fijo_desactivar(uuid) to authenticated, service_role;
grant execute on function public.gasto_fijo_cargar(uuid, date) to authenticated, service_role;
grant execute on function public.gastos_fijos_generar_mes(text) to authenticated, service_role;
grant execute on function public.gasto_borrar(uuid) to authenticated, service_role;
