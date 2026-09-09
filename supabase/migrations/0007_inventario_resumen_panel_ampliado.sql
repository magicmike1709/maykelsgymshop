create function public.inventario_resumen()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'articulos', coalesce(sum(stock), 0),
    'productos', count(*),
    'valor', coalesce(sum(stock * precio), 0),
    'invertido', coalesce(sum(stock * costo), 0)
  )
  from public.productos
  where activo and app.tiene_permiso('inventario.ver');
$$;

revoke execute on function public.inventario_resumen() from anon;

create or replace function public.panel_resumen(p_desde date default date_trunc('month', current_date)::date, p_hasta date default current_date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_matriculas jsonb; v_nevera jsonb; v_vitrina jsonb; v_gastos jsonb;
begin
  if not app.tiene_permiso('contabilidad.ver') then raise exception 'MG403: sin permiso'; end if;
  v_matriculas := public.matriculas_panel(p_desde, p_hasta);
  v_nevera := public.refrigerios_panel(p_desde, p_hasta);
  v_vitrina := public.vitrina_panel(p_desde, p_hasta);
  v_gastos := public.gastos_panel(p_desde, p_hasta);

  return jsonb_build_object(
    'cup', jsonb_build_object(
      'matriculas', v_matriculas->'total',
      'matriculas_pagos', v_matriculas->'pagos',
      'nevera_ventas', v_nevera->'total',
      'nevera_ventas_count', v_nevera->'ventas',
      'nevera_costo', v_nevera->'costo',
      'nevera_ganancia', v_nevera->'ganancia',
      'gastos', v_gastos->'cup',
      'compras', v_gastos->'compras_cup',
      'neto', (v_matriculas->>'total')::numeric + (v_nevera->>'ganancia')::numeric - (v_gastos->>'cup')::numeric
    ),
    'usd', jsonb_build_object(
      'vitrina_ventas', v_vitrina->'total',
      'vitrina_ventas_count', v_vitrina->'ventas',
      'vitrina_costo', v_vitrina->'costo',
      'vitrina_ganancia', v_vitrina->'ganancia',
      'gastos', v_gastos->'usd',
      'neto', (v_vitrina->>'ganancia')::numeric - (v_gastos->>'usd')::numeric
    ),
    'fiados_pendientes', v_vitrina->'fiados_pendientes',
    'comisiones_pendientes', (select coalesce(sum(comision_gestor),0) from public.ventas where comision_pagada_en is null and estado='confirmada'),
    'mensajeria_pendiente', (select coalesce(sum(monto_a_rendir),0) from public.ventas where es_mensajeria and mensajeria_rendida_en is null and estado='confirmada'),
    'socios_pendientes', (select coalesce(sum(ganancia_socio_linea),0) from public.venta_lineas where socio_pagado_en is null),
    'dia_cerrado_hoy', app.dia_cerrado(current_date)
  );
end;
$$;
