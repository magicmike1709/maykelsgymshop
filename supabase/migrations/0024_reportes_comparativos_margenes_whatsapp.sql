-- ============================================================
-- Reportes comparativos (semana vs semana, mes vs mes), margen
-- por categoría y proyección de cierre de mes — más lista de
-- clientes que pagaron el mes pasado y no han pagado este mes,
-- para el recordatorio por WhatsApp.
-- ============================================================

-- Comparativa de un período contra el período inmediato anterior
-- de igual duración. p_tipo: 'semana' (últimos 7 días vs los 7
-- anteriores) o 'mes' (mes actual hasta hoy vs el mismo tramo del
-- mes anterior, para que la comparación sea justa).
create function public.panel_comparativo(p_tipo text default 'semana')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_hoy date := current_date;
  v_actual_desde date; v_actual_hasta date;
  v_anterior_desde date; v_anterior_hasta date;
  v_actual jsonb; v_anterior jsonb;
begin
  if not app.tiene_permiso('contabilidad.ver') then raise exception 'MG403: sin permiso'; end if;

  if p_tipo = 'mes' then
    v_actual_desde := date_trunc('month', v_hoy)::date;
    v_actual_hasta := v_hoy;
    v_anterior_desde := (date_trunc('month', v_hoy) - interval '1 month')::date;
    v_anterior_hasta := least(
      (date_trunc('month', v_hoy) - interval '1 month' + (v_hoy - v_actual_desde) * interval '1 day')::date,
      (date_trunc('month', v_hoy) - interval '1 day')::date
    );
  else
    p_tipo := 'semana';
    v_actual_desde := v_hoy - 6;
    v_actual_hasta := v_hoy;
    v_anterior_desde := v_hoy - 13;
    v_anterior_hasta := v_hoy - 7;
  end if;

  v_actual := public.panel_resumen(v_actual_desde, v_actual_hasta);
  v_anterior := public.panel_resumen(v_anterior_desde, v_anterior_hasta);

  return jsonb_build_object(
    'tipo', p_tipo,
    'actual', v_actual || jsonb_build_object('desde', v_actual_desde, 'hasta', v_actual_hasta),
    'anterior', v_anterior || jsonb_build_object('desde', v_anterior_desde, 'hasta', v_anterior_hasta)
  );
end;
$$;

revoke execute on function public.panel_comparativo(text) from anon;

-- Margen por categoría, uniendo nevera (CUP) y vitrina (USD) en
-- una sola lista para comparar qué categorías dejan más ganancia.
create function public.panel_margen_categorias(p_desde date default date_trunc('month', current_date)::date, p_hasta date default current_date)
returns jsonb
language sql stable security definer set search_path = public as $$
  with nevera as (
    select coalesce(r.categoria, 'Sin categoría') as categoria, 'CUP' as moneda,
      sum(l.importe) as vendido, sum(l.costo * l.cantidad) as costo
    from public.refrigerio_venta_lineas l
    join public.refrigerio_ventas v on v.id = l.venta_id
    left join public.refrigerios r on r.id = l.refrigerio_id
    where v.fecha between p_desde and p_hasta and app.tiene_permiso('inventario.ver')
    group by 1
  ),
  vitrina as (
    select coalesce(c.nombre, 'Sin categoría') as categoria, 'USD' as moneda,
      sum(l.importe) as vendido, sum(l.costo_unit * l.cantidad) as costo
    from public.venta_lineas l
    join public.ventas v on v.id = l.venta_id
    left join public.productos p on p.id = l.producto_id
    left join public.categorias c on c.id = p.categoria_id
    where v.fecha::date between p_desde and p_hasta and v.estado = 'confirmada' and app.tiene_permiso('inventario.ver')
    group by 1
  ),
  todas as (select * from nevera union all select * from vitrina)
  select coalesce(jsonb_agg(jsonb_build_object(
    'categoria', categoria,
    'moneda', moneda,
    'vendido', vendido,
    'costo', costo,
    'ganancia', vendido - costo,
    'margen_pct', case when vendido > 0 then round((vendido - costo) / vendido * 100, 1) else 0 end
  ) order by (vendido - costo) desc), '[]'::jsonb)
  from todas;
$$;

revoke execute on function public.panel_margen_categorias(date, date) from anon;

-- Proyección simple de cierre de mes: toma lo acumulado en lo que
-- va del mes y lo escala al ritmo diario promedio sobre el total
-- de días del mes.
create function public.panel_proyeccion_mes()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_hoy date := current_date;
  v_desde date := date_trunc('month', v_hoy)::date;
  v_dias_transcurridos int := v_hoy - v_desde + 1;
  v_dias_mes int := extract(day from (date_trunc('month', v_hoy) + interval '1 month - 1 day'));
  v_actual jsonb;
begin
  if not app.tiene_permiso('contabilidad.ver') then raise exception 'MG403: sin permiso'; end if;
  v_actual := public.panel_resumen(v_desde, v_hoy);

  return jsonb_build_object(
    'dias_transcurridos', v_dias_transcurridos,
    'dias_mes', v_dias_mes,
    'neto_cup_actual', v_actual->'cup'->'neto',
    'neto_usd_actual', v_actual->'usd'->'neto',
    'neto_cup_proyectado', round((v_actual->'cup'->>'neto')::numeric / v_dias_transcurridos * v_dias_mes, 2),
    'neto_usd_proyectado', round((v_actual->'usd'->>'neto')::numeric / v_dias_transcurridos * v_dias_mes, 2)
  );
end;
$$;

revoke execute on function public.panel_proyeccion_mes() from anon;

-- Clientes que pagaron el mes anterior con datos y todavía no
-- pagan en p_mes (por defecto el mes actual) — para avisarles por
-- WhatsApp antes de que se pierdan. No es un "vencimiento": es
-- solo comparar el directorio de un mes contra el otro.
create function public.clientes_no_renovaron(p_mes text default to_char(current_date, 'YYYY-MM'))
returns table(id uuid, nombre text, telefono text, entrenador text, mes_anterior text)
language plpgsql stable security definer set search_path = public as $$
declare v_mes_anterior text;
begin
  if not app.tiene_permiso('matriculas.ver') then raise exception 'MG403: sin permiso'; end if;

  select mes into v_mes_anterior from public.clientes_meses_disponibles()
  where mes < p_mes order by mes desc limit 1;

  if v_mes_anterior is null then return; end if;

  return query
    select c.id, c.nombre, c.telefono, c.entrenador, v_mes_anterior
    from public.clientes_gym c
    join public.cliente_visitas cv on cv.cliente_id = c.id and to_char(cv.fecha, 'YYYY-MM') = v_mes_anterior
    where not exists (
      select 1 from public.cliente_visitas cv2
      where cv2.cliente_id = c.id and to_char(cv2.fecha, 'YYYY-MM') = p_mes
    )
    group by c.id, c.nombre, c.telefono, c.entrenador
    order by c.nombre;
end;
$$;

revoke execute on function public.clientes_no_renovaron(text) from anon;
