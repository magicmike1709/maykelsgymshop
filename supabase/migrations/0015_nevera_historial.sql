-- ============================================================
-- Historial de Nevera: por día y por producto, para que Mike vea
-- lo importante de esta línea sin tener que sumar a mano cada foto
-- que carga del reporte de ventas.
-- ============================================================
create function public.refrigerios_historial_dias(p_desde date default (current_date - interval '30 days')::date, p_hasta date default current_date)
returns table(fecha date, total numeric, costo numeric, ganancia numeric, ventas bigint)
language sql stable security definer set search_path = public as $$
  select fecha, sum(total), sum(costo_total), sum(ganancia), count(*)
  from public.refrigerio_ventas
  where fecha between p_desde and p_hasta and app.tiene_permiso('inventario.ver')
  group by fecha
  order by fecha desc;
$$;

create function public.refrigerios_top_productos(p_desde date default (current_date - interval '30 days')::date, p_hasta date default current_date, p_limite integer default 10)
returns table(nombre text, cantidad numeric, importe numeric, ganancia numeric)
language sql stable security definer set search_path = public as $$
  select rl.nombre, sum(rl.cantidad), sum(rl.importe), sum(rl.importe - rl.costo * rl.cantidad)
  from public.refrigerio_venta_lineas rl
  join public.refrigerio_ventas rv on rv.id = rl.venta_id
  where rv.fecha between p_desde and p_hasta and app.tiene_permiso('inventario.ver')
  group by rl.nombre
  order by sum(rl.importe) desc
  limit p_limite;
$$;

revoke execute on function public.refrigerios_historial_dias(date, date) from public;
grant execute on function public.refrigerios_historial_dias(date, date) to authenticated, service_role;
revoke execute on function public.refrigerios_historial_dias(date, date) from anon;

revoke execute on function public.refrigerios_top_productos(date, date, integer) from public;
grant execute on function public.refrigerios_top_productos(date, date, integer) to authenticated, service_role;
revoke execute on function public.refrigerios_top_productos(date, date, integer) from anon;
