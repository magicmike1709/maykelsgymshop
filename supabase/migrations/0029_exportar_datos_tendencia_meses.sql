-- ============================================================
-- Exportar datos (respaldo propio, fuera de Supabase) y tendencia
-- de los últimos N meses para ver si el negocio mejora con el
-- tiempo, no solo mes contra el anterior.
-- ============================================================

-- Una fila por día y por línea de negocio, para poder armar un
-- CSV/Excel desde el navegador sin depender de nada más.
create function public.exportar_datos(p_desde date, p_hasta date)
returns table(fecha date, linea text, moneda text, total numeric, costo numeric, ganancia numeric, detalle text)
language sql stable security definer set search_path = public as $$
  select fecha, 'Matrículas', 'CUP', monto, null::numeric, monto, null
  from public.matriculas where fecha between p_desde and p_hasta and app.tiene_permiso('contabilidad.ver')
  union all
  select fecha, 'Nevera', 'CUP', total, costo_total, ganancia, nota
  from public.refrigerio_ventas where fecha between p_desde and p_hasta and app.tiene_permiso('contabilidad.ver')
  union all
  select fecha::date, 'Vitrina', 'USD', total, costo_total, ganancia, cliente
  from public.ventas where fecha::date between p_desde and p_hasta and estado = 'confirmada' and app.tiene_permiso('contabilidad.ver')
  union all
  select fecha, 'Gasto', moneda, -importe, null::numeric, -importe, concepto
  from public.gastos where fecha between p_desde and p_hasta and app.tiene_permiso('contabilidad.ver')
  order by 1;
$$;

revoke execute on function public.exportar_datos(date, date) from anon;

-- Neto CUP/USD por mes de los últimos p_meses, para ver la
-- tendencia del negocio de un vistazo (no solo mes vs. anterior).
create function public.panel_tendencia_meses(p_meses integer default 6)
returns table(mes text, neto_cup numeric, neto_usd numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_i int; v_desde date; v_hasta date; v_mes text; v_r jsonb;
begin
  if not app.tiene_permiso('contabilidad.ver') then raise exception 'MG403: sin permiso'; end if;
  for v_i in reverse (p_meses - 1)..0 loop
    v_desde := (date_trunc('month', current_date) - (v_i || ' months')::interval)::date;
    v_hasta := least((v_desde + interval '1 month - 1 day')::date, current_date);
    v_mes := to_char(v_desde, 'YYYY-MM');
    v_r := public.panel_resumen(v_desde, v_hasta);
    mes := v_mes;
    neto_cup := (v_r->'cup'->>'neto')::numeric;
    neto_usd := (v_r->'usd'->>'neto')::numeric;
    return next;
  end loop;
end;
$$;

revoke execute on function public.panel_tendencia_meses(integer) from anon;
