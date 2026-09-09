-- ============================================================
-- Permisos nuevos
-- ============================================================
insert into public.permisos (codigo, grupo, descripcion, orden) values
  ('gastos.registrar', 'Finanzas', 'Registrar un gasto', 8);

insert into public.rol_permisos (rol, permiso) values
  ('admin', 'gastos.registrar'),
  ('operador_plus', 'gastos.registrar');

-- ============================================================
-- Nevera / refrigerios (CUP) — ventas sin inventario
-- ============================================================
create table public.refrigerios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text,
  precio numeric not null check (precio >= 0),
  costo numeric not null check (costo >= 0),
  activo boolean not null default true,
  orden smallint not null default 0,
  creado_en timestamptz not null default now()
);

create table public.refrigerio_ventas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  total numeric not null,
  costo_total numeric not null,
  ganancia numeric not null,
  nota text,
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);

create table public.refrigerio_venta_lineas (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.refrigerio_ventas(id) on delete cascade,
  refrigerio_id uuid references public.refrigerios(id),
  nombre text not null,
  cantidad numeric not null check (cantidad > 0),
  precio numeric not null,
  costo numeric not null,
  importe numeric not null
);

create index ix_refrigerio_ventas_fecha on public.refrigerio_ventas(fecha);
alter table public.refrigerios enable row level security;
alter table public.refrigerio_ventas enable row level security;
alter table public.refrigerio_venta_lineas enable row level security;

create function public.refrigerios_lista()
returns setof public.refrigerios
language sql stable security definer set search_path = public as $$
  select * from public.refrigerios where activo order by orden, nombre;
$$;

create function public.refrigerio_guardar(p_id uuid, p_nombre text, p_precio numeric, p_costo numeric, p_categoria text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('inventario.editar') then raise exception 'MG403: sin permiso'; end if;
  if p_costo > p_precio then raise exception 'MG422: el costo no puede ser mayor que el precio'; end if;
  if p_id is null then
    insert into public.refrigerios (nombre, categoria, precio, costo) values (p_nombre, p_categoria, p_precio, p_costo) returning id into v_id;
  else
    update public.refrigerios set nombre = p_nombre, categoria = p_categoria, precio = p_precio, costo = p_costo where id = p_id returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create function public.refrigerio_venta_guardar(p_lineas jsonb, p_fecha date default current_date, p_nota text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_venta_id uuid; v_total numeric := 0; v_costo numeric := 0; v_linea jsonb;
begin
  if not app.tiene_permiso('ventas.crear') then raise exception 'MG403: sin permiso'; end if;

  insert into public.refrigerio_ventas (fecha, total, costo_total, ganancia, nota, usuario_id)
  values (p_fecha, 0, 0, 0, p_nota, app.usuario_actual())
  returning id into v_venta_id;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    insert into public.refrigerio_venta_lineas (venta_id, refrigerio_id, nombre, cantidad, precio, costo, importe)
    select v_venta_id, r.id, r.nombre, (v_linea->>'cantidad')::numeric, r.precio, r.costo,
           r.precio * (v_linea->>'cantidad')::numeric
    from public.refrigerios r where r.id = (v_linea->>'refrigerio_id')::uuid;

    v_total := v_total + (select precio * (v_linea->>'cantidad')::numeric from public.refrigerios where id = (v_linea->>'refrigerio_id')::uuid);
    v_costo := v_costo + (select costo * (v_linea->>'cantidad')::numeric from public.refrigerios where id = (v_linea->>'refrigerio_id')::uuid);
  end loop;

  update public.refrigerio_ventas set total = v_total, costo_total = v_costo, ganancia = v_total - v_costo where id = v_venta_id;
  return jsonb_build_object('ok', true, 'id', v_venta_id, 'total', v_total);
end;
$$;

create function public.refrigerios_panel(p_desde date default date_trunc('month', current_date)::date, p_hasta date default current_date)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', coalesce(sum(total), 0),
    'costo', coalesce(sum(costo_total), 0),
    'ganancia', coalesce(sum(ganancia), 0),
    'ventas', count(*)
  )
  from public.refrigerio_ventas
  where fecha between p_desde and p_hasta and app.tiene_permiso('inventario.ver');
$$;

-- ============================================================
-- Vitrina (USD) — productos con stock simple + ventas + fiados
-- ============================================================
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  orden smallint not null default 0
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nombre text not null,
  categoria_id uuid references public.categorias(id),
  precio numeric not null check (precio >= 0),
  costo numeric not null check (costo >= 0),
  stock numeric not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table public.ventas (
  id uuid primary key default gen_random_uuid(),
  codigo text,
  fecha timestamptz not null default now(),
  cliente text,
  telefono text,
  total numeric not null default 0,
  costo_total numeric not null default 0,
  ganancia numeric not null default 0,
  es_fiado boolean not null default false,
  fiado_cobrado_en timestamptz,
  estado text not null default 'confirmada',
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);

create table public.venta_lineas (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas(id) on delete cascade,
  producto_id uuid references public.productos(id),
  producto_nombre text not null,
  cantidad numeric not null check (cantidad > 0),
  precio_unit numeric not null,
  costo_unit numeric not null,
  importe numeric not null
);

create index ix_ventas_fecha on public.ventas(fecha);
alter table public.categorias enable row level security;
alter table public.productos enable row level security;
alter table public.ventas enable row level security;
alter table public.venta_lineas enable row level security;

create function public.productos_lista()
returns setof public.productos
language sql stable security definer set search_path = public as $$
  select * from public.productos where activo order by nombre;
$$;

create function public.producto_guardar(p_id uuid, p_nombre text, p_precio numeric, p_costo numeric, p_stock numeric default 0, p_codigo text default null, p_categoria_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('inventario.editar') then raise exception 'MG403: sin permiso'; end if;
  if p_id is null then
    insert into public.productos (codigo, nombre, categoria_id, precio, costo, stock)
    values (p_codigo, p_nombre, p_categoria_id, p_precio, p_costo, p_stock)
    returning id into v_id;
  else
    update public.productos set nombre = p_nombre, precio = p_precio, costo = p_costo, stock = p_stock
    where id = p_id returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create function public.venta_crear(p_lineas jsonb, p_cliente text default null, p_telefono text default null, p_es_fiado boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_venta_id uuid; v_total numeric := 0; v_costo numeric := 0; v_linea jsonb; v_stock numeric;
begin
  if not app.tiene_permiso('ventas.crear') then raise exception 'MG403: sin permiso'; end if;

  insert into public.ventas (cliente, telefono, es_fiado, usuario_id, estado)
  values (p_cliente, p_telefono, p_es_fiado, app.usuario_actual(), 'confirmada')
  returning id into v_venta_id;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    select stock into v_stock from public.productos where id = (v_linea->>'producto_id')::uuid for update;
    if v_stock is null or v_stock < (v_linea->>'cantidad')::numeric then
      raise exception 'MG422: sin existencia suficiente';
    end if;

    insert into public.venta_lineas (venta_id, producto_id, producto_nombre, cantidad, precio_unit, costo_unit, importe)
    select v_venta_id, p.id, p.nombre, (v_linea->>'cantidad')::numeric, p.precio, p.costo, p.precio * (v_linea->>'cantidad')::numeric
    from public.productos p where p.id = (v_linea->>'producto_id')::uuid;

    update public.productos set stock = stock - (v_linea->>'cantidad')::numeric where id = (v_linea->>'producto_id')::uuid;

    v_total := v_total + (select precio * (v_linea->>'cantidad')::numeric from public.productos where id = (v_linea->>'producto_id')::uuid);
    v_costo := v_costo + (select costo * (v_linea->>'cantidad')::numeric from public.productos where id = (v_linea->>'producto_id')::uuid);
  end loop;

  update public.ventas set total = v_total, costo_total = v_costo, ganancia = v_total - v_costo where id = v_venta_id;
  return jsonb_build_object('ok', true, 'id', v_venta_id, 'total', v_total);
end;
$$;

create function public.fiados_lista()
returns table(id uuid, fecha timestamptz, cliente text, telefono text, total numeric)
language sql stable security definer set search_path = public as $$
  select id, fecha, cliente, telefono, total from public.ventas
  where es_fiado and fiado_cobrado_en is null and app.tiene_permiso('ventas.crear')
  order by fecha;
$$;

create function public.fiado_cobrar(p_venta_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.tiene_permiso('ventas.crear') then raise exception 'MG403: sin permiso'; end if;
  update public.ventas set fiado_cobrado_en = now() where id = p_venta_id and es_fiado;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.vitrina_panel(p_desde date default date_trunc('month', current_date)::date, p_hasta date default current_date)
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
  where fecha::date between p_desde and p_hasta and estado = 'confirmada' and app.tiene_permiso('inventario.ver');
$$;

-- ============================================================
-- Gastos (CUP y USD, cada uno en su moneda)
-- ============================================================
create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  moneda text not null check (moneda in ('CUP', 'USD')),
  importe numeric not null check (importe >= 0),
  categoria text,
  concepto text not null,
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);

create index ix_gastos_fecha on public.gastos(fecha);
alter table public.gastos enable row level security;

create function public.gasto_guardar(p_concepto text, p_importe numeric, p_moneda text, p_categoria text default null, p_fecha date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('gastos.registrar') then raise exception 'MG403: sin permiso'; end if;
  insert into public.gastos (fecha, moneda, importe, categoria, concepto, usuario_id)
  values (p_fecha, p_moneda, p_importe, p_categoria, p_concepto, app.usuario_actual())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create function public.gastos_lista(p_desde date default date_trunc('month', current_date)::date, p_hasta date default current_date)
returns setof public.gastos
language sql stable security definer set search_path = public as $$
  select * from public.gastos where fecha between p_desde and p_hasta and app.tiene_permiso('gastos.registrar') order by fecha desc;
$$;

create function public.gastos_panel(p_desde date default date_trunc('month', current_date)::date, p_hasta date default current_date)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'cup', coalesce(sum(importe) filter (where moneda = 'CUP'), 0),
    'usd', coalesce(sum(importe) filter (where moneda = 'USD'), 0)
  )
  from public.gastos where fecha between p_desde and p_hasta and app.tiene_permiso('contabilidad.ver');
$$;

-- ============================================================
-- Resumen general (CUP y USD siempre separados)
-- ============================================================
create function public.panel_resumen(p_desde date default date_trunc('month', current_date)::date, p_hasta date default current_date)
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
      'neto', (v_matriculas->>'total')::numeric + (v_nevera->>'ganancia')::numeric - (v_gastos->>'cup')::numeric
    ),
    'usd', jsonb_build_object(
      'vitrina_ventas', v_vitrina->'total',
      'vitrina_ganancia', v_vitrina->'ganancia',
      'gastos', v_gastos->'usd',
      'neto', (v_vitrina->>'ganancia')::numeric - (v_gastos->>'usd')::numeric
    ),
    'fiados_pendientes', v_vitrina->'fiados_pendientes'
  );
end;
$$;

-- ============================================================
-- Permisos de ejecución (nadie sin sesión, nunca)
-- ============================================================
revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.crear_usuario_desde_auth() from anon, authenticated;
revoke execute on function public.mi_perfil() from anon;
revoke execute on function public.matricula_dia_guardar(date, integer, numeric, boolean) from anon;
revoke execute on function public.refrigerio_guardar(uuid, text, numeric, numeric, text) from anon;
revoke execute on function public.refrigerio_venta_guardar(jsonb, date, text) from anon;
revoke execute on function public.producto_guardar(uuid, text, numeric, numeric, numeric, text, uuid) from anon;
revoke execute on function public.venta_crear(jsonb, text, text, boolean) from anon;
revoke execute on function public.fiado_cobrar(uuid) from anon;
revoke execute on function public.gasto_guardar(text, numeric, text, text, date) from anon;
revoke execute on function public.gastos_lista(date, date) from anon;
revoke execute on function public.panel_resumen(date, date) from anon;
revoke execute on function public.fiados_lista() from anon;
revoke execute on function public.productos_lista() from anon;
revoke execute on function public.refrigerios_lista() from anon;
revoke execute on function public.gastos_panel(date, date) from anon;
revoke execute on function public.refrigerios_panel(date, date) from anon;
revoke execute on function public.vitrina_panel(date, date) from anon;
