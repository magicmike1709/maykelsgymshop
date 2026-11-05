-- ============================================================
-- Inventario para el uso diario
--
-- A. Editar y quitar productos viejos (baja suave, solo admin)
-- D. Lista inteligente: ventas de 30 días, última venta, último
--    proveedor y cantidad sugerida a comprar
-- B. Ajustes de stock (rotura, pérdida, regalo, conteo) con historial
-- C. Alta rápida: categorías, código automático, importar CSV y
--    fotos subidas desde el celular
-- ============================================================

-- ------------------------------------------------------------
-- Helper: ¿el usuario actual es admin activo?
-- ------------------------------------------------------------
create or replace function app.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = app.usuario_actual() and u.activo and u.rol = 'admin'
  );
$$;

-- ------------------------------------------------------------
-- A/D. Lista completa de productos para la pantalla de Inventario
-- ------------------------------------------------------------
create or replace function public.productos_inventario(p_incluir_quitados boolean default false)
returns table(
  id uuid, codigo text, nombre text, categoria_id uuid, categoria text,
  precio numeric, costo numeric, stock numeric, stock_minimo numeric,
  foto_url text, dias_garantia integer,
  socio_id uuid, pct_ganancia_socio numeric, pct_inversion_socio numeric,
  activo boolean, vendidos_30d numeric, ultima_venta date,
  ultimo_proveedor text, ultimo_costo numeric, sugerido numeric
)
language sql stable security definer set search_path = public as $$
  select p.id, p.codigo, p.nombre, p.categoria_id, c.nombre,
    p.precio, p.costo, p.stock, p.stock_minimo,
    p.foto_url, p.dias_garantia,
    p.socio_id, p.pct_ganancia_socio, p.pct_inversion_socio,
    p.activo, coalesce(v.vendidos_30d, 0), v.ultima_venta,
    e.proveedor, e.costo_unitario,
    -- Sugerido: cubrir ~3 semanas de ventas, con piso del doble del mínimo
    greatest(0, ceil(greatest(p.stock_minimo * 2, coalesce(v.vendidos_30d, 0) / 30.0 * 21)) - p.stock)
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

-- ------------------------------------------------------------
-- A. producto_guardar v6: editar también cambia la categoría, el
--    código se asigna solo (P-0001…) y no deja nombres repetidos
-- ------------------------------------------------------------
create or replace function public.producto_guardar(
  p_id uuid, p_nombre text, p_precio numeric, p_costo numeric, p_stock numeric default 0,
  p_codigo text default null, p_categoria_id uuid default null,
  p_socio_id uuid default null, p_pct_ganancia_socio numeric default 0,
  p_foto_url text default null, p_dias_garantia integer default 0,
  p_pct_inversion_socio numeric default 1, p_stock_minimo numeric default 3
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_principal uuid; v_codigo text; v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  if not app.tiene_permiso('inventario.editar') then raise exception 'MG403: sin permiso'; end if;
  if v_nombre = '' then raise exception 'MG400: el producto necesita un nombre'; end if;
  if exists (
    select 1 from public.productos
    where activo and lower(btrim(nombre)) = lower(v_nombre) and (p_id is null or id <> p_id)
  ) then
    raise exception 'MG409: ya existe un producto con ese nombre';
  end if;

  if p_id is null then
    v_codigo := nullif(btrim(coalesce(p_codigo, '')), '');
    if v_codigo is null then
      select 'P-' || lpad((coalesce(max(substring(codigo from 3)::int), 0) + 1)::text, 4, '0')
      into v_codigo from public.productos where codigo ~ '^P-[0-9]+$';
    end if;
    insert into public.productos (codigo, nombre, categoria_id, precio, costo, stock, socio_id, pct_ganancia_socio, foto_url, dias_garantia, pct_inversion_socio, stock_minimo)
    values (v_codigo, v_nombre, p_categoria_id, p_precio, p_costo, p_stock, p_socio_id, p_pct_ganancia_socio, p_foto_url, p_dias_garantia, p_pct_inversion_socio, p_stock_minimo)
    returning id into v_id;

    if p_stock > 0 then
      select id into v_principal from public.almacenes where es_principal limit 1;
      insert into public.producto_almacen_stock (producto_id, almacen_id, cantidad) values (v_id, v_principal, p_stock);
    end if;
  else
    update public.productos set nombre = v_nombre, categoria_id = p_categoria_id, precio = p_precio, costo = p_costo,
      socio_id = p_socio_id, pct_ganancia_socio = p_pct_ganancia_socio, foto_url = p_foto_url, dias_garantia = p_dias_garantia,
      pct_inversion_socio = p_pct_inversion_socio, stock_minimo = p_stock_minimo
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'MG404: producto no existe'; end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ------------------------------------------------------------
-- A. Quitar / reactivar productos (solo admin). Baja suave: el
--    historial de ventas se conserva y el producto se puede
--    reactivar. El stock que tenga queda guardado, pero deja de
--    contar en el inventario, la vitrina y el catálogo.
-- ------------------------------------------------------------
create or replace function public.producto_baja(p_id uuid, p_motivo text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prod record; v_combos jsonb;
begin
  if not app.es_admin() then raise exception 'MG403: solo el administrador puede quitar productos'; end if;
  select id, nombre, stock, costo, activo into v_prod from public.productos where id = p_id for update;
  if v_prod.id is null then raise exception 'MG404: producto no existe'; end if;
  if not v_prod.activo then return jsonb_build_object('ok', true, 'ya_estaba', true); end if;

  update public.productos set activo = false where id = p_id;

  -- Un combo con un producto quitado ya no se podría vender: se desactiva y se avisa.
  select coalesce(jsonb_agg(c.nombre), '[]'::jsonb) into v_combos
  from public.combos c
  where c.activo and exists (select 1 from public.combo_lineas cl where cl.combo_id = c.id and cl.producto_id = p_id);
  update public.combos c set activo = false
  where c.activo and exists (select 1 from public.combo_lineas cl where cl.combo_id = c.id and cl.producto_id = p_id);

  -- Los avisos de stock bajo de este producto ya no tienen sentido.
  update public.avisos set activo = false where activo and titulo = 'Stock bajo: ' || v_prod.nombre;

  insert into public.actividad (usuario_id, tabla, accion, registro_id, datos)
  values (app.usuario_actual(), 'productos', 'BAJA', p_id::text,
    jsonb_build_object('nombre', v_prod.nombre, 'stock', v_prod.stock, 'costo', v_prod.costo, 'motivo', p_motivo, 'combos_desactivados', v_combos));

  return jsonb_build_object('ok', true, 'stock_guardado', v_prod.stock, 'combos_desactivados', v_combos);
end;
$$;

create or replace function public.producto_reactivar(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prod record;
begin
  if not app.es_admin() then raise exception 'MG403: solo el administrador puede reactivar productos'; end if;
  select id, nombre, stock, activo into v_prod from public.productos where id = p_id for update;
  if v_prod.id is null then raise exception 'MG404: producto no existe'; end if;
  if exists (
    select 1 from public.productos
    where activo and id <> p_id and lower(btrim(nombre)) = lower(btrim(v_prod.nombre))
  ) then
    raise exception 'MG409: ya hay otro producto activo con ese nombre';
  end if;
  update public.productos set activo = true where id = p_id;

  insert into public.actividad (usuario_id, tabla, accion, registro_id, datos)
  values (app.usuario_actual(), 'productos', 'REACTIVAR', p_id::text,
    jsonb_build_object('nombre', v_prod.nombre, 'stock', v_prod.stock));
  return jsonb_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- B. Ajustes de stock con historial
-- ------------------------------------------------------------
create table if not exists public.ajustes_inventario (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id),
  almacen_id uuid not null references public.almacenes(id),
  cantidad_antes numeric not null,
  cantidad_despues numeric not null check (cantidad_despues >= 0),
  diferencia numeric not null,
  costo_unitario numeric not null default 0,
  motivo text not null check (motivo in ('rotura', 'perdida', 'regalo', 'conteo', 'otro')),
  nota text,
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);
create index if not exists ix_ajustes_inventario_producto on public.ajustes_inventario(producto_id, creado_en desc);
alter table public.ajustes_inventario enable row level security;

create or replace function public.stock_ajustar(
  p_producto_id uuid, p_almacen_id uuid, p_nueva_cantidad numeric, p_motivo text, p_nota text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_antes numeric; v_costo numeric; v_nombre text; v_dif numeric;
begin
  if not app.tiene_permiso('inventario.editar') then raise exception 'MG403: sin permiso'; end if;
  if p_nueva_cantidad is null or p_nueva_cantidad < 0 then raise exception 'MG400: la cantidad no puede ser negativa'; end if;

  select costo, nombre into v_costo, v_nombre from public.productos where id = p_producto_id for update;
  if v_nombre is null then raise exception 'MG404: producto no existe'; end if;

  select cantidad into v_antes from public.producto_almacen_stock
    where producto_id = p_producto_id and almacen_id = p_almacen_id for update;
  v_antes := coalesce(v_antes, 0);
  v_dif := p_nueva_cantidad - v_antes;
  if v_dif = 0 then return jsonb_build_object('ok', true, 'sin_cambios', true); end if;

  insert into public.producto_almacen_stock (producto_id, almacen_id, cantidad)
  values (p_producto_id, p_almacen_id, p_nueva_cantidad)
  on conflict (producto_id, almacen_id) do update set cantidad = excluded.cantidad;
  update public.productos set stock = stock + v_dif where id = p_producto_id;

  insert into public.ajustes_inventario (producto_id, almacen_id, cantidad_antes, cantidad_despues, diferencia, costo_unitario, motivo, nota, usuario_id)
  values (p_producto_id, p_almacen_id, v_antes, p_nueva_cantidad, v_dif, v_costo, p_motivo, nullif(btrim(coalesce(p_nota, '')), ''), app.usuario_actual());

  insert into public.actividad (usuario_id, tabla, accion, registro_id, datos)
  values (app.usuario_actual(), 'ajustes_inventario', 'INSERT', p_producto_id::text,
    jsonb_build_object('nombre', v_nombre, 'antes', v_antes, 'despues', p_nueva_cantidad, 'diferencia', v_dif, 'motivo', p_motivo));

  return jsonb_build_object('ok', true, 'diferencia', v_dif, 'valor', round(v_dif * v_costo, 2));
end;
$$;

create or replace function public.ajustes_lista(p_producto_id uuid default null, p_limite integer default 50)
returns table(
  id uuid, creado_en timestamptz, producto_id uuid, producto_nombre text, almacen_nombre text,
  cantidad_antes numeric, cantidad_despues numeric, diferencia numeric, valor numeric,
  motivo text, nota text, usuario_nombre text
)
language sql stable security definer set search_path = public as $$
  select a.id, a.creado_en, a.producto_id, p.nombre, al.nombre,
    a.cantidad_antes, a.cantidad_despues, a.diferencia, round(a.diferencia * a.costo_unitario, 2),
    a.motivo, a.nota, u.nombre
  from public.ajustes_inventario a
  join public.productos p on p.id = a.producto_id
  join public.almacenes al on al.id = a.almacen_id
  left join public.usuarios u on u.id = a.usuario_id
  where app.tiene_permiso('inventario.ver')
    and (p_producto_id is null or a.producto_id = p_producto_id)
  order by a.creado_en desc
  limit p_limite;
$$;

-- ------------------------------------------------------------
-- C. Categorías, importación masiva y fotos
-- ------------------------------------------------------------
create or replace function public.categorias_lista()
returns table(id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select c.id, c.nombre from public.categorias c
  where c.activo and app.tiene_permiso('inventario.ver')
  order by c.orden, c.nombre;
$$;

create or replace function public.categoria_crear(p_nombre text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  if not app.tiene_permiso('inventario.editar') then raise exception 'MG403: sin permiso'; end if;
  if v_nombre = '' then raise exception 'MG400: la categoría necesita un nombre'; end if;
  select id into v_id from public.categorias where activo and lower(btrim(nombre)) = lower(v_nombre);
  if v_id is null then
    insert into public.categorias (nombre) values (v_nombre) returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- p_filas: [{nombre, precio, costo, stock, categoria}]. Los nombres que ya
-- existen se saltan (no se pisan precios ni stock); devuelve qué pasó con cada fila.
create or replace function public.productos_importar(p_filas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_fila jsonb; v_nombre text; v_cat_id uuid; v_cat text;
  v_creados int := 0; v_omitidos jsonb := '[]'::jsonb; v_res jsonb;
begin
  if not app.tiene_permiso('inventario.editar') then raise exception 'MG403: sin permiso'; end if;
  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_nombre := btrim(coalesce(v_fila->>'nombre', ''));
    if v_nombre = '' then continue; end if;
    if exists (select 1 from public.productos where activo and lower(btrim(nombre)) = lower(v_nombre)) then
      v_omitidos := v_omitidos || to_jsonb(v_nombre);
      continue;
    end if;
    v_cat := btrim(coalesce(v_fila->>'categoria', ''));
    v_cat_id := null;
    if v_cat <> '' then
      v_cat_id := (public.categoria_crear(v_cat)->>'id')::uuid;
    end if;
    v_res := public.producto_guardar(
      null, v_nombre, coalesce(nullif(v_fila->>'precio', '')::numeric, 0), coalesce(nullif(v_fila->>'costo', '')::numeric, 0),
      coalesce(nullif(v_fila->>'stock', '')::numeric, 0), null, v_cat_id
    );
    v_creados := v_creados + 1;
  end loop;
  return jsonb_build_object('ok', true, 'creados', v_creados, 'omitidos', v_omitidos);
end;
$$;

-- Fotos de productos subidas desde el celular: bucket público de lectura
-- (el catálogo se ve sin entrar) y escritura solo con permiso de editar.
-- Las políticas de Storage corren como el usuario, que no tiene acceso al
-- esquema app, así que preguntan el permiso por esta función pública.
create or replace function public.puede_editar_inventario()
returns boolean
language sql stable security definer set search_path = public as $$
  select app.tiene_permiso('inventario.editar');
$$;
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

drop policy if exists "productos_fotos_leer" on storage.objects;
create policy "productos_fotos_leer" on storage.objects
  for select using (bucket_id = 'productos');

drop policy if exists "productos_fotos_subir" on storage.objects;
create policy "productos_fotos_subir" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'productos' and public.puede_editar_inventario());

drop policy if exists "productos_fotos_reemplazar" on storage.objects;
create policy "productos_fotos_reemplazar" on storage.objects
  for update to authenticated
  using (bucket_id = 'productos' and public.puede_editar_inventario());

-- ------------------------------------------------------------
-- Permisos de ejecución (las funciones nuevas no se abren a anon)
-- ------------------------------------------------------------
revoke execute on function app.es_admin() from public, anon;
revoke execute on function public.productos_inventario(boolean) from public, anon;
revoke execute on function public.producto_guardar(uuid, text, numeric, numeric, numeric, text, uuid, uuid, numeric, text, integer, numeric, numeric) from public, anon;
revoke execute on function public.producto_baja(uuid, text) from public, anon;
revoke execute on function public.producto_reactivar(uuid) from public, anon;
revoke execute on function public.stock_ajustar(uuid, uuid, numeric, text, text) from public, anon;
revoke execute on function public.ajustes_lista(uuid, integer) from public, anon;
revoke execute on function public.categorias_lista() from public, anon;
revoke execute on function public.categoria_crear(text) from public, anon;
revoke execute on function public.puede_editar_inventario() from public, anon;
revoke execute on function public.productos_importar(jsonb) from public, anon;

grant execute on function public.productos_inventario(boolean) to authenticated, service_role;
grant execute on function public.producto_guardar(uuid, text, numeric, numeric, numeric, text, uuid, uuid, numeric, text, integer, numeric, numeric) to authenticated, service_role;
grant execute on function public.producto_baja(uuid, text) to authenticated, service_role;
grant execute on function public.producto_reactivar(uuid) to authenticated, service_role;
grant execute on function public.stock_ajustar(uuid, uuid, numeric, text, text) to authenticated, service_role;
grant execute on function public.ajustes_lista(uuid, integer) to authenticated, service_role;
grant execute on function public.categorias_lista() to authenticated, service_role;
grant execute on function public.categoria_crear(text) to authenticated, service_role;
grant execute on function public.puede_editar_inventario() to authenticated, service_role;
grant execute on function public.productos_importar(jsonb) to authenticated, service_role;
