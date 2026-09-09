-- Categorías de gasto con la bandera en_ganancia, portada de la app
-- anterior (app.gasto_gym_categorias): comprar mercancía para la
-- nevera o la vitrina NO debe restar de la ganancia — ya se descuenta
-- como costo de lo vendido. Sin esto se cuenta el mismo gasto dos veces.

create table public.gasto_categorias (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nombre text not null,
  en_ganancia boolean not null default true,
  activo boolean not null default true,
  orden smallint not null default 0
);
alter table public.gasto_categorias enable row level security;

insert into public.gasto_categorias (codigo, nombre, en_ganancia, orden) values
  ('electricidad_agua', 'Electricidad y agua', true, 10),
  ('mantenimiento', 'Mantenimiento y equipos', true, 20),
  ('mercancia_nevera', 'Compra de mercancía para la nevera', false, 30),
  ('mercancia_vitrina', 'Compra de mercancía para la vitrina', false, 40),
  ('otros', 'Otros', true, 90);

alter table public.gastos add column categoria_id uuid references public.gasto_categorias(id);

create function public.gasto_categorias_lista()
returns setof public.gasto_categorias
language sql stable security definer set search_path = public as $$
  select * from public.gasto_categorias where activo order by orden;
$$;

drop function if exists public.gasto_guardar(text, numeric, text, text, date);

create function public.gasto_guardar(p_concepto text, p_importe numeric, p_moneda text, p_categoria_id uuid default null, p_fecha date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('gastos.registrar') then raise exception 'MG403: sin permiso'; end if;
  if app.dia_cerrado(p_fecha) then raise exception 'MG423: el día ya está cerrado, reábrelo para editar'; end if;
  insert into public.gastos (fecha, moneda, importe, categoria_id, concepto, usuario_id)
  values (p_fecha, p_moneda, p_importe, p_categoria_id, p_concepto, app.usuario_actual())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

drop function if exists public.gastos_lista(date, date);

create function public.gastos_lista(p_desde date default date_trunc('month', current_date)::date, p_hasta date default current_date)
returns table(id uuid, fecha date, moneda text, importe numeric, concepto text, categoria text, en_ganancia boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.fecha, g.moneda, g.importe, g.concepto, gc.nombre, coalesce(gc.en_ganancia, true)
  from public.gastos g left join public.gasto_categorias gc on gc.id = g.categoria_id
  where g.fecha between p_desde and p_hasta and app.tiene_permiso('gastos.registrar')
  order by g.fecha desc;
$$;

create or replace function public.gastos_panel(p_desde date default date_trunc('month', current_date)::date, p_hasta date default current_date)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'cup', coalesce(sum(g.importe) filter (where g.moneda = 'CUP' and coalesce(gc.en_ganancia, true)), 0),
    'usd', coalesce(sum(g.importe) filter (where g.moneda = 'USD'), 0),
    'compras_cup', coalesce(sum(g.importe) filter (where g.moneda = 'CUP' and gc.en_ganancia = false), 0)
  )
  from public.gastos g left join public.gasto_categorias gc on gc.id = g.categoria_id
  where g.fecha between p_desde and p_hasta and app.tiene_permiso('contabilidad.ver');
$$;

create or replace function public.panel_resumen(p_desde date default date_trunc('month', current_date)::date, p_hasta date default current_date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_matriculas jsonb; v_nevera jsonb; v_vitrina jsonb; v_gastos jsonb;
begin
  if not app.tiene_permiso('contabilidad.ver') then raise exception 'MG403: sin permiso'; end if;
  v_matriculas := public.matriculas_panel(p_desde, p_hasta);
  v_nevera := public.refrigerios_panel(p_desde, p_hasta);
  v_vitrina := public.vitrina_panel(p_desde, p_hasta);
  v_gastos := public.gastos_panel(p_desde, p_hasta);

  return jsonb_build_object(
    'cup', jsonb_build_object(
      'matriculas', v_matriculas->'total',
      'nevera_ventas', v_nevera->'total',
      'nevera_ganancia', v_nevera->'ganancia',
      'gastos', v_gastos->'cup',
      'compras', v_gastos->'compras_cup',
      'neto', (v_matriculas->>'total')::numeric + (v_nevera->>'ganancia')::numeric - (v_gastos->>'cup')::numeric
    ),
    'usd', jsonb_build_object(
      'vitrina_ventas', v_vitrina->'total',
      'vitrina_ganancia', v_vitrina->'ganancia',
      'gastos', v_gastos->'usd',
      'neto', (v_vitrina->>'ganancia')::numeric - (v_gastos->>'usd')::numeric
    ),
    'fiados_pendientes', v_vitrina->'fiados_pendientes',
    'comisiones_pendientes', (select coalesce(sum(comision_gestor),0) from public.ventas where comision_pagada_en is null and estado='confirmada'),
    'mensajeria_pendiente', (select coalesce(sum(monto_a_rendir),0) from public.ventas where es_mensajeria and mensajeria_rendida_en is null and estado='confirmada'),
    'socios_pendientes', (select coalesce(sum(ganancia_socio_linea),0) from public.venta_lineas where socio_pagado_en is null),
    'dia_cerrado_hoy', app.dia_cerrado(current_date)
  );
end;
$$;

revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.gasto_categorias_lista() from anon;
revoke execute on function public.gasto_guardar(text, numeric, text, uuid, date) from anon;
revoke execute on function public.gastos_lista(date, date) from anon;
revoke execute on function public.gastos_panel(date, date) from anon;
revoke execute on function public.panel_resumen(date, date) from anon;
