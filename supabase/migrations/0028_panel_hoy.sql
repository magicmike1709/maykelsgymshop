-- ============================================================
-- Panel "Hoy": resumen de una sola pasada para no tener que
-- entrar a 3-4 pestañas a armar el panorama — neto de ayer,
-- proyección del mes, y las alertas activas juntas.
-- ============================================================
create function public.panel_hoy()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ayer date := current_date - 1;
  v_ayer_r jsonb;
  v_proyeccion jsonb;
  v_descuadres jsonb;
  v_sin_renovar int;
  v_avisos int;
begin
  if not app.tiene_permiso('contabilidad.ver') then raise exception 'MG403: sin permiso'; end if;

  v_ayer_r := public.panel_resumen(v_ayer, v_ayer);
  v_proyeccion := public.panel_proyeccion_mes();
  v_descuadres := public.descuadres_alerta(30);
  select count(*) into v_sin_renovar from public.clientes_no_renovaron();
  select count(*) into v_avisos from public.avisos where activo;

  return jsonb_build_object(
    'ayer', jsonb_build_object('fecha', v_ayer, 'cup', v_ayer_r->'cup', 'usd', v_ayer_r->'usd'),
    'proyeccion', v_proyeccion,
    'alertas', jsonb_build_object(
      'descuadres', v_descuadres->'con_descuadre',
      'sin_conteo', v_descuadres->'sin_conteo',
      'clientes_sin_renovar', v_sin_renovar,
      'avisos_activos', v_avisos
    )
  );
end;
$$;

revoke execute on function public.panel_hoy() from anon;
