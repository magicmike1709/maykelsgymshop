-- ============================================================
-- Fecha de la última entrada de mercancía en la lista de Inventario
--
-- Sirve para el "Mensaje para el grupo": las novedades son los
-- productos a los que les llegó mercancía hace pocos días.
-- ============================================================

drop function if exists public.productos_inventario(boolean);
create function public.productos_inventario(p_incluir_quitados boolean default false)
returns table(
  id uuid, codigo text, nombre text, categoria_id uuid, categoria text,
  precio numeric, costo numeric, stock numeric, stock_minimo numeric,
  foto_url text, dias_garantia integer,
  socio_id uuid, pct_ganancia_socio numeric, pct_inversion_socio numeric,
  activo boolean, vendidos_30d numeric, ultima_venta date,
  ultimo_proveedor text, ultimo_costo numeric, sugerido numeric,
  descripcion text,
  ultima_entrada date
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
    p.descripcion,
    (select max(ei2.fecha) from public.entradas_inventario ei2 where ei2.producto_id = p.id)
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

revoke execute on function public.productos_inventario(boolean) from public, anon;
grant execute on function public.productos_inventario(boolean) to authenticated, service_role;
