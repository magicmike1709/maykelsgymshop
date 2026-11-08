-- ============================================================
-- Descripción de productos
--
-- Cada producto puede llevar una descripción (qué es, formato,
-- cómo se usa). Se muestra en el catálogo público y se edita en
-- Inventario. Se guarda con una función propia para no cambiar
-- la firma de producto_guardar (la usa el importador de CSV).
-- ============================================================

alter table public.productos add column if not exists descripcion text;
alter table public.productos drop constraint if exists productos_descripcion_largo;
alter table public.productos add constraint productos_descripcion_largo
  check (descripcion is null or char_length(descripcion) <= 2000);

-- Guardar la descripción (mismo permiso que editar productos)
create or replace function public.producto_descripcion_guardar(p_id uuid, p_descripcion text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('inventario.editar') then raise exception 'MG403: sin permiso'; end if;
  update public.productos set descripcion = nullif(btrim(coalesce(p_descripcion, '')), '')
  where id = p_id returning id into v_id;
  if v_id is null then raise exception 'MG404: producto no existe'; end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Lista de Inventario: ahora también devuelve la descripción
drop function if exists public.productos_inventario(boolean);
create function public.productos_inventario(p_incluir_quitados boolean default false)
returns table(
  id uuid, codigo text, nombre text, categoria_id uuid, categoria text,
  precio numeric, costo numeric, stock numeric, stock_minimo numeric,
  foto_url text, dias_garantia integer,
  socio_id uuid, pct_ganancia_socio numeric, pct_inversion_socio numeric,
  activo boolean, vendidos_30d numeric, ultima_venta date,
  ultimo_proveedor text, ultimo_costo numeric, sugerido numeric,
  descripcion text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.codigo, p.nombre, p.categoria_id, c.nombre,
    p.precio, p.costo, p.stock, p.stock_minimo,
    p.foto_url, p.dias_garantia,
    p.socio_id, p.pct_ganancia_socio, p.pct_inversion_socio,
    p.activo, coalesce(v.vendidos_30d, 0), v.ultima_venta,
    e.proveedor, e.costo_unitario,
    -- Sugerido: cubrir ~3 semanas de ventas, con piso del doble del mínimo
    greatest(0, ceil(greatest(p.stock_minimo * 2, coalesce(v.vendidos_30d, 0) / 30.0 * 21)) - p.stock),
    p.descripcion
  from public.productos p
  left join public.categorias c on c.id = p.categoria_id
  left join (
    select vl.producto_id,
      sum(vl.cantidad) filter (where ve.fecha >= now() - interval '30 days') as vendidos_30d,
      max(ve.fecha::date) as ultima_venta
    from public.venta_lineas vl
    join public.ventas ve on ve.id = vl.venta_id
    where ve.estado = 'confirmada' and vl.producto_id is not null
    group by vl.producto_id
  ) v on v.producto_id = p.id
  left join lateral (
    select ei.proveedor, ei.costo_unitario
    from public.entradas_inventario ei
    where ei.producto_id = p.id
    order by ei.creado_en desc limit 1
  ) e on true
  where app.tiene_permiso('inventario.ver')
    and (p.activo or (p_incluir_quitados and app.es_admin()))
  order by p.nombre;
$$;

-- Catálogo público: ahora incluye la descripción
drop function if exists public.catalogo_publico();
create function public.catalogo_publico()
returns table(nombre text, precio numeric, foto_url text, categoria text, descripcion text)
language sql stable security definer set search_path = public as $$
  select p.nombre, p.precio, p.foto_url, c.nombre as categoria, p.descripcion
  from public.productos p left join public.categorias c on c.id = p.categoria_id
  where p.activo and p.stock > 0
  order by c.nombre nulls last, p.nombre;
$$;

-- Permisos de ejecución
revoke execute on function public.producto_descripcion_guardar(uuid, text) from public, anon;
revoke execute on function public.productos_inventario(boolean) from public, anon;
revoke execute on function public.catalogo_publico() from public;
grant execute on function public.producto_descripcion_guardar(uuid, text) to authenticated, service_role;
grant execute on function public.productos_inventario(boolean) to authenticated, service_role;
grant execute on function public.catalogo_publico() to anon, authenticated, service_role;
