-- Almacenes (Gym = principal, Casa = secundario) y entradas de mercancía
-- con costo promedio. Reemplaza el modelo de "un producto = un stock"
-- por stock por almacén, sin llegar a lotes con costo individual
-- (decisión: costo promedio por producto, no por lote).

create table public.almacenes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  es_principal boolean not null default false,
  activo boolean not null default true,
  orden smallint not null default 0
);
alter table public.almacenes enable row level security;

insert into public.almacenes (nombre, es_principal, orden) values ('Gym', true, 1), ('Casa', false, 2);

create table public.producto_almacen_stock (
  producto_id uuid not null references public.productos(id) on delete cascade,
  almacen_id uuid not null references public.almacenes(id) on delete cascade,
  cantidad numeric not null default 0,
  primary key (producto_id, almacen_id)
);
alter table public.producto_almacen_stock enable row level security;

insert into public.producto_almacen_stock (producto_id, almacen_id, cantidad)
select p.id, (select id from public.almacenes where es_principal), p.stock
from public.productos p where p.stock > 0;

create table public.entradas_inventario (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id),
  almacen_id uuid not null references public.almacenes(id),
  cantidad numeric not null check (cantidad > 0),
  costo_unitario numeric not null check (costo_unitario >= 0),
  proveedor text,
  fecha date not null default current_date,
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);
alter table public.entradas_inventario enable row level security;

create function public.almacenes_lista() returns setof public.almacenes
language sql stable security definer set search_path = public as $$
  select * from public.almacenes where activo order by orden;
$$;

create function public.producto_stock_por_almacen(p_producto_id uuid)
returns table(almacen_id uuid, almacen_nombre text, cantidad numeric)
language sql stable security definer set search_path = public as $$
  select a.id, a.nombre, coalesce(pas.cantidad, 0)
  from public.almacenes a
  left join public.producto_almacen_stock pas on pas.almacen_id = a.id and pas.producto_id = p_producto_id
  where a.activo and app.tiene_permiso('inventario.ver')
  order by a.orden;
$$;

create function public.productos_por_almacen(p_almacen_id uuid)
returns table(id uuid, codigo text, nombre text, precio numeric, costo numeric, stock numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.codigo, p.nombre, p.precio, p.costo, coalesce(s.cantidad, 0)
  from public.productos p
  left join public.producto_almacen_stock s on s.producto_id = p.id and s.almacen_id = p_almacen_id
  where p.activo and app.tiene_permiso('inventario.ver')
  order by p.nombre;
$$;

create function public.entrada_registrar(p_producto_id uuid, p_almacen_id uuid, p_cantidad numeric, p_costo_unitario numeric, p_proveedor text default null, p_fecha date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_stock_actual numeric; v_costo_actual numeric; v_nuevo_costo numeric;
begin
  if not app.tiene_permiso('inventario.editar') then raise exception 'MG403: sin permiso'; end if;

  select stock, costo into v_stock_actual, v_costo_actual from public.productos where id = p_producto_id for update;
  if v_stock_actual is null then raise exception 'MG404: producto no existe'; end if;

  v_nuevo_costo := case when (v_stock_actual + p_cantidad) > 0
    then (v_stock_actual * v_costo_actual + p_cantidad * p_costo_unitario) / (v_stock_actual + p_cantidad)
    else p_costo_unitario end;

  insert into public.entradas_inventario (producto_id, almacen_id, cantidad, costo_unitario, proveedor, fecha, usuario_id)
  values (p_producto_id, p_almacen_id, p_cantidad, p_costo_unitario, p_proveedor, p_fecha, app.usuario_actual());

  insert into public.producto_almacen_stock (producto_id, almacen_id, cantidad)
  values (p_producto_id, p_almacen_id, p_cantidad)
  on conflict (producto_id, almacen_id) do update set cantidad = producto_almacen_stock.cantidad + excluded.cantidad;

  update public.productos set stock = stock + p_cantidad, costo = round(v_nuevo_costo, 4) where id = p_producto_id;

  return jsonb_build_object('ok', true, 'costo_nuevo', round(v_nuevo_costo, 4));
end;
$$;

create function public.entradas_lista(p_desde date default (current_date - interval '30 days')::date, p_hasta date default current_date)
returns table(id uuid, fecha date, producto_nombre text, almacen_nombre text, cantidad numeric, costo_unitario numeric, proveedor text)
language sql stable security definer set search_path = public as $$
  select e.id, e.fecha, p.nombre, a.nombre, e.cantidad, e.costo_unitario, e.proveedor
  from public.entradas_inventario e
  join public.productos p on p.id = e.producto_id
  join public.almacenes a on a.id = e.almacen_id
  where e.fecha between p_desde and p_hasta and app.tiene_permiso('inventario.ver')
  order by e.creado_en desc;
$$;

-- venta_crear v3: vende de un almacén específico (Gym por defecto)
drop function if exists public.venta_crear(jsonb, text, text, boolean, uuid, boolean, uuid);

create or replace function public.venta_crear(
  p_lineas jsonb,
  p_cliente text default null,
  p_telefono text default null,
  p_es_fiado boolean default false,
  p_gestor_id uuid default null,
  p_es_mensajeria boolean default false,
  p_mensajero_id uuid default null,
  p_almacen_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_venta_id uuid; v_total numeric := 0; v_costo numeric := 0; v_linea jsonb;
  v_pct_comision numeric := 0; v_producto record; v_importe numeric; v_ganancia_socio numeric;
  v_almacen_id uuid; v_stock_almacen numeric;
begin
  if not app.tiene_permiso('ventas.crear') then raise exception 'MG403: sin permiso'; end if;
  if app.dia_cerrado(current_date) then raise exception 'MG423: el día ya está cerrado, reábrelo para editar'; end if;

  v_almacen_id := coalesce(p_almacen_id, (select id from public.almacenes where es_principal limit 1));

  if p_gestor_id is not null then
    select pct_comision into v_pct_comision from public.gestores where id = p_gestor_id;
  end if;

  insert into public.ventas (cliente, telefono, es_fiado, usuario_id, estado, gestor_id, es_mensajeria, mensajero_id)
  values (p_cliente, p_telefono, p_es_fiado, app.usuario_actual(), 'confirmada', p_gestor_id, p_es_mensajeria, p_mensajero_id)
  returning id into v_venta_id;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    select * into v_producto from public.productos where id = (v_linea->>'producto_id')::uuid for update;

    select cantidad into v_stock_almacen from public.producto_almacen_stock
      where producto_id = v_producto.id and almacen_id = v_almacen_id for update;

    if coalesce(v_stock_almacen, 0) < (v_linea->>'cantidad')::numeric then
      raise exception 'MG422: sin existencia suficiente en ese almacén';
    end if;

    v_importe := v_producto.precio * (v_linea->>'cantidad')::numeric;
    v_ganancia_socio := (v_producto.precio - v_producto.costo) * (v_linea->>'cantidad')::numeric * v_producto.pct_ganancia_socio;

    insert into public.venta_lineas (venta_id, producto_id, producto_nombre, cantidad, precio_unit, costo_unit, importe, socio_id, ganancia_socio_linea)
    values (v_venta_id, v_producto.id, v_producto.nombre, (v_linea->>'cantidad')::numeric, v_producto.precio, v_producto.costo, v_importe, v_producto.socio_id, v_ganancia_socio);

    update public.producto_almacen_stock set cantidad = cantidad - (v_linea->>'cantidad')::numeric
      where producto_id = v_producto.id and almacen_id = v_almacen_id;
    update public.productos set stock = stock - (v_linea->>'cantidad')::numeric where id = v_producto.id;

    v_total := v_total + v_importe;
    v_costo := v_costo + v_producto.costo * (v_linea->>'cantidad')::numeric;
  end loop;

  update public.ventas set
    total = v_total, costo_total = v_costo, ganancia = v_total - v_costo,
    comision_gestor = v_total * v_pct_comision,
    monto_a_rendir = case when p_es_mensajeria then v_total else 0 end
  where id = v_venta_id;

  return jsonb_build_object('ok', true, 'id', v_venta_id, 'total', v_total);
end;
$$;

-- producto_guardar v3: crear siembra stock inicial en el almacén principal;
-- editar ya no toca el stock (eso pasa por entrada_registrar de ahora en adelante)
create or replace function public.producto_guardar(
  p_id uuid, p_nombre text, p_precio numeric, p_costo numeric, p_stock numeric default 0,
  p_codigo text default null, p_categoria_id uuid default null,
  p_socio_id uuid default null, p_pct_ganancia_socio numeric default 0
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_principal uuid;
begin
  if not app.tiene_permiso('inventario.editar') then raise exception 'MG403: sin permiso'; end if;
  if p_id is null then
    insert into public.productos (codigo, nombre, categoria_id, precio, costo, stock, socio_id, pct_ganancia_socio)
    values (p_codigo, p_nombre, p_categoria_id, p_precio, p_costo, p_stock, p_socio_id, p_pct_ganancia_socio)
    returning id into v_id;

    if p_stock > 0 then
      select id into v_principal from public.almacenes where es_principal limit 1;
      insert into public.producto_almacen_stock (producto_id, almacen_id, cantidad) values (v_id, v_principal, p_stock);
    end if;
  else
    update public.productos set nombre = p_nombre, precio = p_precio, costo = p_costo,
      socio_id = p_socio_id, pct_ganancia_socio = p_pct_ganancia_socio
    where id = p_id returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.almacenes_lista() from anon;
revoke execute on function public.producto_stock_por_almacen(uuid) from anon;
revoke execute on function public.productos_por_almacen(uuid) from anon;
revoke execute on function public.entrada_registrar(uuid, uuid, numeric, numeric, text, date) from anon;
revoke execute on function public.entradas_lista(date, date) from anon;
revoke execute on function public.venta_crear(jsonb, text, text, boolean, uuid, boolean, uuid, uuid) from anon;
revoke execute on function public.producto_guardar(uuid, text, numeric, numeric, numeric, text, uuid, uuid, numeric) from anon;
