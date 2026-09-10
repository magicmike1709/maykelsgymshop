-- clientes_no_renovaron no traía la fecha en que pagó el cliente el
-- mes anterior, y en "Recordar" hace falta para saber cuándo tocaba
-- pagar y para poder agrupar a los clientes por rango de día del mes
-- (1-5, 6-10, 11-15, 16-20, 21-25, 26-32) y mandarles SMS masivo.
create or replace function public.clientes_no_renovaron(p_mes text default to_char(current_date, 'YYYY-MM'))
returns table(id uuid, nombre text, telefono text, entrenador text, mes_anterior text, fecha_pago date)
language plpgsql stable security definer set search_path = public as $$
declare v_mes_anterior text;
begin
  if not app.tiene_permiso('matriculas.ver') then raise exception 'MG403: sin permiso'; end if;

  select mes into v_mes_anterior from public.clientes_meses_disponibles()
  where mes < p_mes order by mes desc limit 1;

  if v_mes_anterior is null then return; end if;

  return query
    select c.id, c.nombre, c.telefono, c.entrenador, v_mes_anterior, max(cv.fecha)
    from public.clientes_gym c
    join public.cliente_visitas cv on cv.cliente_id = c.id and to_char(cv.fecha, 'YYYY-MM') = v_mes_anterior
    where not exists (
      select 1 from public.cliente_visitas cv2
      where cv2.cliente_id = c.id and to_char(cv2.fecha, 'YYYY-MM') = p_mes
    )
    group by c.id, c.nombre, c.telefono, c.entrenador
    order by max(cv.fecha);
end;
$$;
