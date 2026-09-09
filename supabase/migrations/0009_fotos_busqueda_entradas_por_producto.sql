alter table public.productos add column foto_url text;

-- 21 fotos reales importadas del catálogo web que ya existía
-- (img2.elyerromenu.com/images/maykelsgymshop/...), tomadas del
-- proyecto de la app anterior (columna productos.foto_url).
update public.productos p set foto_url = v.foto_url
from (values
  ('P-0002','https://img2.elyerromenu.com/images/maykelsgymshop/whey-body-fortress/img.webp'),
  ('P-0003','https://img2.elyerromenu.com/images/maykelsgymshop/100-gold-standard-whey/img.webp'),
  ('P-0004','https://img2.elyerromenu.com/images/maykelsgymshop/dymatize-100-whey-protein/img.webp'),
  ('P-0005','https://img2.elyerromenu.com/images/maykelsgymshop/six-star-whey-protein-8/img.webp'),
  ('P-0007','https://img2.elyerromenu.com/images/maykelsgymshop/jocko-protein-power/img.webp'),
  ('P-0008','https://img2.elyerromenu.com/images/maykelsgymshop/creatina-six-star/img.webp'),
  ('P-0009','https://img2.elyerromenu.com/images/maykelsgymshop/creatina-bucket-up/img.webp'),
  ('P-0010','https://img2.elyerromenu.com/images/maykelsgymshop/muscletech-celltech-creactor-unflavored-240g/img.webp'),
  ('P-0011','https://img2.elyerromenu.com/images/maykelsgymshop/jocko-fuel-monohidrato-de-creatina/img.webp'),
  ('P-0012','https://img2.elyerromenu.com/images/maykelsgymshop/creatina-animal/img.webp'),
  ('P-0014','https://img2.elyerromenu.com/images/maykelsgymshop/creatina-cor-perfomance/img.webp'),
  ('P-0015','https://img2.elyerromenu.com/images/maykelsgymshop/creatina-platinum-muscletech/img.webp'),
  ('P-0016','https://img2.elyerromenu.com/images/maykelsgymshop/on-creatina-monohidratada/img.webp'),
  ('P-0017','https://img2.elyerromenu.com/images/maykelsgymshop/creatina-dymatize-w/img.webp'),
  ('P-0018','https://img2.elyerromenu.com/images/maykelsgymshop/c4-original/img.webp'),
  ('P-0019','https://img2.elyerromenu.com/images/maykelsgymshop/total-war-preworkout/img.webp'),
  ('P-0020','https://img2.elyerromenu.com/images/maykelsgymshop/gold-standard-pre-workout/img.webp'),
  ('P-0021','https://img2.elyerromenu.com/images/maykelsgymshop/muscletech-vapor-x5-pre-workout/img.webp'),
  ('P-0022','https://img2.elyerromenu.com/images/maykelsgymshop/amino-energy-on/img.webp'),
  ('P-0023','https://img2.elyerromenu.com/images/maykelsgymshop/xtend-bcaa/img.webp'),
  ('P-0024','https://img2.elyerromenu.com/images/maykelsgymshop/bucked-up-bcaa/img.webp'),
  ('P-0025','https://img2.elyerromenu.com/images/maykelsgymshop/cellucor-bcaa-sport/img.webp')
) as v(codigo, foto_url)
where p.codigo = v.codigo;

drop function if exists public.producto_guardar(uuid, text, numeric, numeric, numeric, text, uuid, uuid, numeric);

create function public.producto_guardar(
  p_id uuid, p_nombre text, p_precio numeric, p_costo numeric, p_stock numeric default 0,
  p_codigo text default null, p_categoria_id uuid default null,
  p_socio_id uuid default null, p_pct_ganancia_socio numeric default 0,
  p_foto_url text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_principal uuid;
begin
  if not app.tiene_permiso('inventario.editar') then raise exception 'MG403: sin permiso'; end if;
  if p_id is null then
    insert into public.productos (codigo, nombre, categoria_id, precio, costo, stock, socio_id, pct_ganancia_socio, foto_url)
    values (p_codigo, p_nombre, p_categoria_id, p_precio, p_costo, p_stock, p_socio_id, p_pct_ganancia_socio, p_foto_url)
    returning id into v_id;

    if p_stock > 0 then
      select id into v_principal from public.almacenes where es_principal limit 1;
      insert into public.producto_almacen_stock (producto_id, almacen_id, cantidad) values (v_id, v_principal, p_stock);
    end if;
  else
    update public.productos set nombre = p_nombre, precio = p_precio, costo = p_costo,
      socio_id = p_socio_id, pct_ganancia_socio = p_pct_ganancia_socio, foto_url = p_foto_url
    where id = p_id returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

drop function if exists public.productos_lista();
create function public.productos_lista()
returns table(id uuid, codigo text, nombre text, categoria_id uuid, precio numeric, costo numeric, stock numeric, foto_url text, activo boolean)
language sql stable security definer set search_path = public as $$
  select id, codigo, nombre, categoria_id, precio, costo, stock, foto_url, activo
  from public.productos where activo order by nombre;
$$;

drop function if exists public.productos_por_almacen(uuid);
create function public.productos_por_almacen(p_almacen_id uuid)
returns table(id uuid, codigo text, nombre text, precio numeric, costo numeric, stock numeric, foto_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.codigo, p.nombre, p.precio, p.costo, coalesce(s.cantidad, 0), p.foto_url
  from public.productos p
  left join public.producto_almacen_stock s on s.producto_id = p.id and s.almacen_id = p_almacen_id
  where p.activo and app.tiene_permiso('inventario.ver')
  order by p.nombre;
$$;

-- entradas_lista ahora se puede filtrar por producto (equivalente
-- simple a los "lotes" de la app anterior: historial de compras
-- de un producto, sin costeo por lote individual)
drop function if exists public.entradas_lista(date, date);
create function public.entradas_lista(p_desde date default (current_date - interval '30 days')::date, p_hasta date default current_date, p_producto_id uuid default null)
returns table(id uuid, fecha date, producto_id uuid, producto_nombre text, almacen_nombre text, cantidad numeric, costo_unitario numeric, proveedor text)
language sql stable security definer set search_path = public as $$
  select e.id, e.fecha, e.producto_id, p.nombre, a.nombre, e.cantidad, e.costo_unitario, e.proveedor
  from public.entradas_inventario e
  join public.productos p on p.id = e.producto_id
  join public.almacenes a on a.id = e.almacen_id
  where e.fecha between p_desde and p_hasta
    and (p_producto_id is null or e.producto_id = p_producto_id)
    and app.tiene_permiso('inventario.ver')
  order by e.creado_en desc;
$$;

revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.producto_guardar(uuid, text, numeric, numeric, numeric, text, uuid, uuid, numeric, text) from anon;
revoke execute on function public.productos_lista() from anon;
revoke execute on function public.productos_por_almacen(uuid) from anon;
revoke execute on function public.entradas_lista(date, date, uuid) from anon;
