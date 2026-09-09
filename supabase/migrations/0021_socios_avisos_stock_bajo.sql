-- ============================================================
-- Socios: distinguir cuánto invirtió (pct_inversion_socio) de
-- cuánto gana (pct_ganancia_socio) — para casos de consignación
-- donde el socio no puso dinero pero sí se lleva parte de la
-- ganancia (pct_inversion_socio = 0, pct_ganancia_socio > 0).
-- ============================================================
alter table public.productos add column pct_inversion_socio numeric not null default 1 check (pct_inversion_socio between 0 and 1);

-- ============================================================
-- Alerta automática de stock bajo
-- ============================================================
alter table public.productos add column stock_minimo numeric not null default 3 check (stock_minimo >= 0);

create function app.avisar_stock_bajo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_producto record; v_titulo text;
begin
  select coalesce(sum(cantidad), 0) into v_total from public.producto_almacen_stock where producto_id = new.producto_id;
  select nombre, stock_minimo into v_producto from public.productos where id = new.producto_id and activo;
  if v_producto.nombre is null then return new; end if;

  v_titulo := 'Stock bajo: ' || v_producto.nombre;
  if v_total <= v_producto.stock_minimo then
    if not exists (select 1 from public.avisos where activo and titulo = v_titulo) then
      insert into public.avisos (titulo, mensaje, activo) values (v_titulo, 'Quedan ' || v_total || ' unidades.', true);
    end if;
  end if;
  return new;
end;
$$;

create trigger tg_avisar_stock_bajo after insert or update of cantidad on public.producto_almacen_stock
  for each row execute function app.avisar_stock_bajo();

-- ============================================================
-- Avisos: confirmación de lectura por persona
-- ============================================================
create table public.aviso_confirmaciones (
  aviso_id uuid not null references public.avisos(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id),
  confirmado_en timestamptz not null default now(),
  primary key (aviso_id, usuario_id)
);
alter table public.aviso_confirmaciones enable row level security;

create function public.aviso_confirmar(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  insert into public.aviso_confirmaciones (aviso_id, usuario_id)
  values (p_id, app.usuario_actual())
  on conflict (aviso_id, usuario_id) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

drop function if exists public.avisos_lista();
create function public.avisos_lista()
returns table(id uuid, titulo text, mensaje text, activo boolean, usuario_id uuid, creado_en timestamptz, confirmaciones jsonb)
language sql stable security definer set search_path = public as $$
  select a.id, a.titulo, a.mensaje, a.activo, a.usuario_id, a.creado_en,
    coalesce((
      select jsonb_agg(jsonb_build_object('usuario_id', ac.usuario_id, 'nombre', u.nombre, 'confirmado_en', ac.confirmado_en) order by ac.confirmado_en)
      from public.aviso_confirmaciones ac join public.usuarios u on u.id = ac.usuario_id
      where ac.aviso_id = a.id
    ), '[]'::jsonb) as confirmaciones
  from public.avisos a
  where a.activo
  order by a.creado_en desc;
$$;

-- ============================================================
-- producto_guardar v5: admite pct_inversion_socio y stock_minimo
-- ============================================================
drop function if exists public.producto_guardar(uuid, text, numeric, numeric, numeric, text, uuid, uuid, numeric, text, integer);

create function public.producto_guardar(
  p_id uuid, p_nombre text, p_precio numeric, p_costo numeric, p_stock numeric default 0,
  p_codigo text default null, p_categoria_id uuid default null,
  p_socio_id uuid default null, p_pct_ganancia_socio numeric default 0,
  p_foto_url text default null, p_dias_garantia integer default 0,
  p_pct_inversion_socio numeric default 1, p_stock_minimo numeric default 3
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_principal uuid;
begin
  if not app.tiene_permiso('inventario.editar') then raise exception 'MG403: sin permiso'; end if;
  if p_id is null then
    insert into public.productos (codigo, nombre, categoria_id, precio, costo, stock, socio_id, pct_ganancia_socio, foto_url, dias_garantia, pct_inversion_socio, stock_minimo)
    values (p_codigo, p_nombre, p_categoria_id, p_precio, p_costo, p_stock, p_socio_id, p_pct_ganancia_socio, p_foto_url, p_dias_garantia, p_pct_inversion_socio, p_stock_minimo)
    returning id into v_id;

    if p_stock > 0 then
      select id into v_principal from public.almacenes where es_principal limit 1;
      insert into public.producto_almacen_stock (producto_id, almacen_id, cantidad) values (v_id, v_principal, p_stock);
    end if;
  else
    update public.productos set nombre = p_nombre, precio = p_precio, costo = p_costo,
      socio_id = p_socio_id, pct_ganancia_socio = p_pct_ganancia_socio, foto_url = p_foto_url, dias_garantia = p_dias_garantia,
      pct_inversion_socio = p_pct_inversion_socio, stock_minimo = p_stock_minimo
    where id = p_id returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ============================================================
-- plata_dormida: mostrar cuánto de lo invertido es del dueño vs del socio
-- ============================================================
drop function if exists public.plata_dormida();
create function public.plata_dormida()
returns table(producto_id uuid, nombre text, foto_url text, stock numeric, costo numeric, invertido numeric, invertido_dueno numeric, ultima_venta date, dias_sin_vender integer)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.foto_url, p.stock, p.costo, round(p.stock * p.costo, 2) as invertido,
    round(p.stock * p.costo * (case when p.socio_id is null then 1 else 1 - p.pct_inversion_socio end), 2) as invertido_dueno,
    uv.ultima as ultima_venta,
    (current_date - coalesce(uv.ultima, p.creado_en::date))::int as dias_sin_vender
  from public.productos p
  left join (
    select vl.producto_id, max(v.fecha::date) as ultima
    from public.venta_lineas vl join public.ventas v on v.id = vl.venta_id
    where v.estado = 'confirmada'
    group by vl.producto_id
  ) uv on uv.producto_id = p.id
  where p.activo and p.stock > 0 and app.tiene_permiso('inventario.ver')
  order by 9 desc;
$$;

-- ============================================================
-- Permisos de ejecución
-- ============================================================
revoke execute on function public.aviso_confirmar(uuid) from public;
grant execute on function public.aviso_confirmar(uuid) to authenticated, service_role;
revoke execute on function public.aviso_confirmar(uuid) from anon;

revoke execute on function public.avisos_lista() from public;
grant execute on function public.avisos_lista() to authenticated, service_role;
revoke execute on function public.avisos_lista() from anon;

revoke execute on function public.producto_guardar(uuid, text, numeric, numeric, numeric, text, uuid, uuid, numeric, text, integer, numeric, numeric) from public;
grant execute on function public.producto_guardar(uuid, text, numeric, numeric, numeric, text, uuid, uuid, numeric, text, integer, numeric, numeric) to authenticated, service_role;
revoke execute on function public.producto_guardar(uuid, text, numeric, numeric, numeric, text, uuid, uuid, numeric, text, integer, numeric, numeric) from anon;

revoke execute on function public.plata_dormida() from public;
grant execute on function public.plata_dormida() to authenticated, service_role;
revoke execute on function public.plata_dormida() from anon;
