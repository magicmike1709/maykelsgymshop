-- ============================================================
-- Historial de Vitrina (USD): mismo patrón que el historial de
-- Nevera (0015) — por día y por producto — para verlo por
-- día/semana/mes/año igual que la nevera.
-- ============================================================
create function public.vitrina_historial_dias(p_desde date default (current_date - interval '30 days')::date, p_hasta date default current_date)
returns table(fecha date, total numeric, costo numeric, ganancia numeric, ventas bigint)
language sql stable security definer set search_path = public as $$
  select fecha::date, sum(total), sum(costo_total), sum(ganancia), count(*)
  from public.ventas
  where fecha::date between p_desde and p_hasta and estado = 'confirmada' and app.tiene_permiso('inventario.ver')
  group by fecha::date
  order by fecha::date desc;
$$;

create function public.vitrina_top_productos(p_desde date default (current_date - interval '30 days')::date, p_hasta date default current_date, p_limite integer default 10)
returns table(nombre text, cantidad numeric, importe numeric, ganancia numeric)
language sql stable security definer set search_path = public as $$
  select vl.producto_nombre, sum(vl.cantidad), sum(vl.importe), sum(vl.importe - vl.costo_unit * vl.cantidad)
  from public.venta_lineas vl
  join public.ventas v on v.id = vl.venta_id
  where v.fecha::date between p_desde and p_hasta and v.estado = 'confirmada' and app.tiene_permiso('inventario.ver')
  group by vl.producto_nombre
  order by sum(vl.importe) desc
  limit p_limite;
$$;

revoke execute on function public.vitrina_historial_dias(date, date) from public;
grant execute on function public.vitrina_historial_dias(date, date) to authenticated, service_role;
revoke execute on function public.vitrina_historial_dias(date, date) from anon;

revoke execute on function public.vitrina_top_productos(date, date, integer) from public;
grant execute on function public.vitrina_top_productos(date, date, integer) to authenticated, service_role;
revoke execute on function public.vitrina_top_productos(date, date, integer) from anon;
