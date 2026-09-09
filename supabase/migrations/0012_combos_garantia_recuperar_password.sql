-- ============================================================
-- Garantía: cuántos días de garantía trae un producto
-- ============================================================
alter table public.productos add column dias_garantia integer not null default 0 check (dias_garantia >= 0);
alter table public.venta_lineas add column garantia_vence date;

-- ============================================================
-- Combos: varios productos vendidos juntos a precio de paquete
-- ============================================================
create table public.combos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  precio numeric not null check (precio >= 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table public.combos enable row level security;

create table public.combo_lineas (
  combo_id uuid not null references public.combos(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  cantidad numeric not null check (cantidad > 0),
  primary key (combo_id, producto_id)
);
alter table public.combo_lineas enable row level security;

alter table public.venta_lineas alter column producto_id drop not null;
alter table public.venta_lineas add column combo_id uuid references public.combos(id);

create function public.combos_lista()
returns table(id uuid, nombre text, precio numeric, costo numeric, componentes jsonb)
language sql stable security definer set search_path = public as $$
  select c.id, c.nombre, c.precio,
    coalesce(sum(p.costo * cl.cantidad), 0),
    coalesce(jsonb_agg(jsonb_build_object('nombre', p.nombre, 'cantidad', cl.cantidad)) filter (where p.id is not null), '[]'::jsonb)
  from public.combos c
  left join public.combo_lineas cl on cl.combo_id = c.id
  left join public.productos p on p.id = cl.producto_id
  where c.activo and app.tiene_permiso('inventario.ver')
  group by c.id, c.nombre, c.precio
  order by c.nombre;
$$;

create function public.combo_guardar(p_nombre text, p_precio numeric, p_lineas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_linea jsonb;
begin
  if not app.tiene_permiso('inventario.editar') then raise exception 'MG403: sin permiso'; end if;
  insert into public.combos (nombre, precio) values (p_nombre, p_precio) returning id into v_id;
  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    insert into public.combo_lineas (combo_id, producto_id, cantidad)
    values (v_id, (v_linea->>'producto_id')::uuid, (v_linea->>'cantidad')::numeric);
  end loop;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- venta_crear v4: admite combos (lineas con combo_id en vez de producto_id),
-- y guarda la fecha de vencimiento de garantía por línea de producto.
drop function if exists public.venta_crear(jsonb, text, text, boolean, uuid, boolean, uuid, uuid);

create function public.venta_crear(
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
  v_almacen_id uuid; v_stock_almacen numeric; v_cantidad numeric;
  v_combo record; v_combo_costo numeric; v_comp record;
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
    v_cantidad := (v_linea->>'cantidad')::numeric;

    if v_linea ? 'combo_id' then
      select * into v_combo from public.combos where id = (v_linea->>'combo_id')::uuid;
      v_combo_costo := 0;

      for v_comp in select cl.producto_id, cl.cantidad, p.costo, p.nombre from public.combo_lineas cl join public.productos p on p.id = cl.producto_id where cl.combo_id = v_combo.id loop
        select cantidad into v_stock_almacen from public.producto_almacen_stock
          where producto_id = v_comp.producto_id and almacen_id = v_almacen_id for update;
        if coalesce(v_stock_almacen, 0) < v_comp.cantidad * v_cantidad then
          raise exception 'MG422: sin existencia suficiente de % para el combo', v_comp.nombre;
        end if;
        update public.producto_almacen_stock set cantidad = cantidad - (v_comp.cantidad * v_cantidad)
          where producto_id = v_comp.producto_id and almacen_id = v_almacen_id;
        update public.productos set stock = stock - (v_comp.cantidad * v_cantidad) where id = v_comp.producto_id;
        v_combo_costo := v_combo_costo + v_comp.costo * v_comp.cantidad;
      end loop;

      v_importe := v_combo.precio * v_cantidad;
      insert into public.venta_lineas (venta_id, combo_id, producto_nombre, cantidad, precio_unit, costo_unit, importe)
      values (v_venta_id, v_combo.id, v_combo.nombre, v_cantidad, v_combo.precio, v_combo_costo, v_importe);

      v_total := v_total + v_importe;
      v_costo := v_costo + v_combo_costo * v_cantidad;
    else
      select * into v_producto from public.productos where id = (v_linea->>'producto_id')::uuid for update;

      select cantidad into v_stock_almacen from public.producto_almacen_stock
        where producto_id = v_producto.id and almacen_id = v_almacen_id for update;

      if coalesce(v_stock_almacen, 0) < v_cantidad then
        raise exception 'MG422: sin existencia suficiente en ese almacén';
      end if;

      v_importe := v_producto.precio * v_cantidad;
      v_ganancia_socio := (v_producto.precio - v_producto.costo) * v_cantidad * v_producto.pct_ganancia_socio;

      insert into public.venta_lineas (venta_id, producto_id, producto_nombre, cantidad, precio_unit, costo_unit, importe, socio_id, ganancia_socio_linea, garantia_vence)
      values (v_venta_id, v_producto.id, v_producto.nombre, v_cantidad, v_producto.precio, v_producto.costo, v_importe, v_producto.socio_id, v_ganancia_socio,
        case when v_producto.dias_garantia > 0 then current_date + v_producto.dias_garantia else null end);

      update public.producto_almacen_stock set cantidad = cantidad - v_cantidad
        where producto_id = v_producto.id and almacen_id = v_almacen_id;
      update public.productos set stock = stock - v_cantidad where id = v_producto.id;

      v_total := v_total + v_importe;
      v_costo := v_costo + v_producto.costo * v_cantidad;
    end if;
  end loop;

  update public.ventas set
    total = v_total, costo_total = v_costo, ganancia = v_total - v_costo,
    comision_gestor = v_total * v_pct_comision,
    monto_a_rendir = case when p_es_mensajeria then v_total else 0 end
  where id = v_venta_id;

  return jsonb_build_object('ok', true, 'id', v_venta_id, 'total', v_total);
end;
$$;

-- producto_guardar v4: admite días de garantía
drop function if exists public.producto_guardar(uuid, text, numeric, numeric, numeric, text, uuid, uuid, numeric, text);

create function public.producto_guardar(
  p_id uuid, p_nombre text, p_precio numeric, p_costo numeric, p_stock numeric default 0,
  p_codigo text default null, p_categoria_id uuid default null,
  p_socio_id uuid default null, p_pct_ganancia_socio numeric default 0,
  p_foto_url text default null, p_dias_garantia integer default 0
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_principal uuid;
begin
  if not app.tiene_permiso('inventario.editar') then raise exception 'MG403: sin permiso'; end if;
  if p_id is null then
    insert into public.productos (codigo, nombre, categoria_id, precio, costo, stock, socio_id, pct_ganancia_socio, foto_url, dias_garantia)
    values (p_codigo, p_nombre, p_categoria_id, p_precio, p_costo, p_stock, p_socio_id, p_pct_ganancia_socio, p_foto_url, p_dias_garantia)
    returning id into v_id;

    if p_stock > 0 then
      select id into v_principal from public.almacenes where es_principal limit 1;
      insert into public.producto_almacen_stock (producto_id, almacen_id, cantidad) values (v_id, v_principal, p_stock);
    end if;
  else
    update public.productos set nombre = p_nombre, precio = p_precio, costo = p_costo,
      socio_id = p_socio_id, pct_ganancia_socio = p_pct_ganancia_socio, foto_url = p_foto_url, dias_garantia = p_dias_garantia
    where id = p_id returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ============================================================
-- Permisos de ejecución
-- ============================================================
revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.catalogo_publico() to anon;

-- Postgres/Supabase concede EXECUTE a anon por defecto en cada función
-- nueva (default privileges). Cerrar eso de raíz para que no haya que
-- acordarse de revocarlo en cada migración futura.
alter default privileges in schema public revoke execute on functions from anon;

revoke execute on function public.actividad_lista(integer) from anon;
revoke execute on function public.combo_guardar(text, numeric, jsonb) from anon;
revoke execute on function public.combos_lista() from anon;
revoke execute on function public.producto_guardar(uuid, text, numeric, numeric, numeric, text, uuid, uuid, numeric, text, integer) from anon;
revoke execute on function public.venta_crear(jsonb, text, text, boolean, uuid, boolean, uuid, uuid) from anon;
