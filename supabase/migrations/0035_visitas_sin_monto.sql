-- ============================================================
-- Pagos de clientes sin monto.
--
-- El CSV semanal de la hostess no trae columna de monto, así que
-- desde el 12 de septiembre todas las visitas importadas quedaron
-- con monto NULL y no sumaron nada a matrículas: en Resumen
-- septiembre salía casi vacío y octubre en cero.
--
-- Estas dos funciones dejan que el dueño vea, mes por mes, cuántos
-- pagos le faltan por monto y les ponga un precio de una vez. Solo
-- se tocan las visitas con monto vacío (las que ya tienen un precio
-- distinto — casos sociales, rebajas — se respetan), y se
-- reconstruye la fila 'individual' de matrículas de cada día
-- afectado, igual que hace cliente_visita_registrar.
-- ============================================================

create function public.visitas_sin_monto()
returns table(mes text, sin_monto bigint, con_monto bigint)
language sql stable security definer set search_path = public as $$
  select to_char(fecha, 'YYYY-MM'), count(*) filter (where monto is null), count(monto)
  from public.cliente_visitas
  where app.tiene_permiso('matriculas.registrar')
  group by 1
  having count(*) filter (where monto is null) > 0
  order by 1 desc;
$$;

create function public.visitas_completar_monto(p_mes text, p_monto numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_desde date := to_date(p_mes || '-01', 'YYYY-MM-DD');
  v_hasta date := (to_date(p_mes || '-01', 'YYYY-MM-DD') + interval '1 month')::date;
  v_n integer;
begin
  if not app.tiene_permiso('matriculas.registrar') then raise exception 'MG403: sin permiso'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto tiene que ser mayor que cero'; end if;

  update public.cliente_visitas set monto = p_monto
  where fecha >= v_desde and fecha < v_hasta and monto is null;
  get diagnostics v_n = row_count;

  insert into public.matriculas (fecha, monto, pagos, lote)
  select v.fecha, sum(v.monto), count(*), 'individual'
  from public.cliente_visitas v
  where v.fecha >= v_desde and v.fecha < v_hasta and v.monto is not null
  group by v.fecha
  on conflict (fecha) where lote = 'individual'
  do update set monto = excluded.monto, pagos = excluded.pagos;

  return jsonb_build_object('ok', true, 'actualizadas', v_n);
end;
$$;

revoke execute on function public.visitas_sin_monto() from public;
grant execute on function public.visitas_sin_monto() to authenticated, service_role;
revoke execute on function public.visitas_sin_monto() from anon;

revoke execute on function public.visitas_completar_monto(text, numeric) from public;
grant execute on function public.visitas_completar_monto(text, numeric) to authenticated, service_role;
revoke execute on function public.visitas_completar_monto(text, numeric) from anon;
