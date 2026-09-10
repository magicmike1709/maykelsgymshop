-- ============================================================
-- Alerta de descuadre de caja + historial de precios de productos
-- ============================================================

-- Resumen de descuadres de caja de los últimos p_dias: cuántos
-- cierres tienen conteo registrado con diferencia distinta de
-- cero, cuánto suman (a favor o en contra), y cuántos cierres
-- todavía no tienen conteo de caja registrado.
create function public.descuadres_alerta(p_dias integer default 30)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'con_descuadre', count(*) filter (where caja_contada is not null and descuadre is distinct from 0),
    'total_descuadre', coalesce(sum(descuadre) filter (where caja_contada is not null), 0),
    'peor_descuadre', coalesce(min(descuadre) filter (where caja_contada is not null and descuadre < 0), 0),
    'sin_conteo', count(*) filter (where caja_contada is null),
    'dias', p_dias
  )
  from public.cierres
  where dia >= current_date - p_dias and app.tiene_permiso('contabilidad.ver');
$$;

revoke execute on function public.descuadres_alerta(integer) from anon;

-- ============================================================
-- Historial de precios: cada vez que cambia precio o costo de un
-- producto, queda guardado el valor anterior y el nuevo.
-- ============================================================
create table public.producto_precio_historial (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  precio_anterior numeric,
  precio_nuevo numeric not null,
  costo_anterior numeric,
  costo_nuevo numeric not null,
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);
create index ix_producto_precio_historial_producto on public.producto_precio_historial(producto_id, creado_en desc);
alter table public.producto_precio_historial enable row level security;

create function app.producto_precio_historial_registrar()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.producto_precio_historial (producto_id, precio_anterior, precio_nuevo, costo_anterior, costo_nuevo, usuario_id)
    values (new.id, null, new.precio, null, new.costo, app.usuario_actual());
  elsif tg_op = 'UPDATE' and (new.precio is distinct from old.precio or new.costo is distinct from old.costo) then
    insert into public.producto_precio_historial (producto_id, precio_anterior, precio_nuevo, costo_anterior, costo_nuevo, usuario_id)
    values (new.id, old.precio, new.precio, old.costo, new.costo, app.usuario_actual());
  end if;
  return new;
end;
$$;

create trigger tg_producto_precio_historial
after insert or update on public.productos
for each row execute function app.producto_precio_historial_registrar();

create function public.producto_precio_historial(p_producto_id uuid)
returns setof public.producto_precio_historial
language sql stable security definer set search_path = public as $$
  select * from public.producto_precio_historial
  where producto_id = p_producto_id and app.tiene_permiso('inventario.ver')
  order by creado_en desc;
$$;

revoke execute on function public.producto_precio_historial(uuid) from anon;
