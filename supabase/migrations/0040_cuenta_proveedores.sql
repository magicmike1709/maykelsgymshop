-- ============================================================
-- Cuenta con proveedores
--
-- Lo que se le debe a cada proveedor sale de las entradas de
-- inventario (cantidad × costo, con el nombre del proveedor) menos
-- los pagos que se le han entregado. Solo el administrador lo ve y
-- lo toca, porque es dinero.
-- ============================================================

create table if not exists public.proveedor_pagos (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null check (btrim(proveedor) <> ''),
  monto numeric(12,2) not null check (monto > 0),
  fecha date not null default current_date,
  nota text,
  usuario_id uuid,
  creado_en timestamptz not null default now()
);
create index if not exists proveedor_pagos_proveedor_idx on public.proveedor_pagos (lower(btrim(proveedor)));

-- Misma regla que el resto: la app no toca la tabla, solo las funciones.
alter table public.proveedor_pagos enable row level security;
revoke all on public.proveedor_pagos from public, anon, authenticated;

-- Resumen por proveedor: recibido, pagado y lo que se debe
create or replace function public.proveedores_cuenta()
returns table(
  proveedor text, unidades numeric, recibido numeric, pagado numeric, debe numeric,
  ultima_entrada date, ultimo_pago date
)
language sql stable security definer set search_path = public as $$
  with e as (
    select lower(btrim(proveedor)) as k, max(btrim(proveedor)) as nombre,
      sum(cantidad) as unidades, sum(cantidad * costo_unitario) as recibido, max(fecha) as ultima
    from public.entradas_inventario
    where nullif(btrim(coalesce(proveedor, '')), '') is not null
    group by 1
  ), p as (
    select lower(btrim(proveedor)) as k, max(btrim(proveedor)) as nombre,
      sum(monto) as pagado, max(fecha) as ultimo
    from public.proveedor_pagos
    group by 1
  )
  select coalesce(e.nombre, p.nombre), coalesce(e.unidades, 0), coalesce(e.recibido, 0),
    coalesce(p.pagado, 0), coalesce(e.recibido, 0) - coalesce(p.pagado, 0), e.ultima, p.ultimo
  from e full join p on p.k = e.k
  where app.es_admin()
  order by 5 desc, 1;
$$;

-- Movimientos de un proveedor: entradas de mercancía y pagos, lo más nuevo primero
create or replace function public.proveedor_detalle(p_proveedor text)
returns table(id uuid, tipo text, fecha date, concepto text, cantidad numeric, importe numeric)
language sql stable security definer set search_path = public as $$
  select x.id, x.tipo, x.fecha, x.concepto, x.cantidad, x.importe
  from (
    select e.id, 'entrada'::text as tipo, e.fecha, pr.nombre as concepto, e.cantidad,
      e.cantidad * e.costo_unitario as importe, e.creado_en
    from public.entradas_inventario e
    join public.productos pr on pr.id = e.producto_id
    where lower(btrim(coalesce(e.proveedor, ''))) = lower(btrim(p_proveedor))
    union all
    select g.id, 'pago'::text, g.fecha, coalesce(g.nota, 'Pago'), null::numeric, g.monto, g.creado_en
    from public.proveedor_pagos g
    where lower(btrim(g.proveedor)) = lower(btrim(p_proveedor))
  ) x
  where app.es_admin()
  order by x.fecha desc, x.creado_en desc;
$$;

-- Registrar un pago entregado al proveedor
create or replace function public.proveedor_pago_registrar(
  p_proveedor text, p_monto numeric, p_fecha date default current_date, p_nota text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.es_admin() then raise exception 'MG403: solo el administrador registra pagos a proveedores'; end if;
  if nullif(btrim(coalesce(p_proveedor, '')), '') is null then raise exception 'MG400: falta el proveedor'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'MG400: el monto debe ser mayor que cero'; end if;
  insert into public.proveedor_pagos (proveedor, monto, fecha, nota, usuario_id)
  values (btrim(p_proveedor), p_monto, coalesce(p_fecha, current_date), nullif(btrim(coalesce(p_nota, '')), ''), app.usuario_actual())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Borrar un pago puesto por error
create or replace function public.proveedor_pago_borrar(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.es_admin() then raise exception 'MG403: solo el administrador borra pagos a proveedores'; end if;
  delete from public.proveedor_pagos where id = p_id returning id into v_id;
  if v_id is null then raise exception 'MG404: el pago no existe'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Permisos de ejecución: nada para anónimos
revoke execute on function public.proveedores_cuenta() from public, anon;
revoke execute on function public.proveedor_detalle(text) from public, anon;
revoke execute on function public.proveedor_pago_registrar(text, numeric, date, text) from public, anon;
revoke execute on function public.proveedor_pago_borrar(uuid) from public, anon;
grant execute on function public.proveedores_cuenta() to authenticated, service_role;
grant execute on function public.proveedor_detalle(text) to authenticated, service_role;
grant execute on function public.proveedor_pago_registrar(text, numeric, date, text) to authenticated, service_role;
grant execute on function public.proveedor_pago_borrar(uuid) to authenticated, service_role;
