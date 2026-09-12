-- clientes_meses_disponibles ahora también dice cuántos de esos
-- clientes fueron NUEVOS ese mes (su primera visita registrada fue
-- justo ese mes) — para mostrarlo junto al selector de mes en el
-- Directorio ("septiembre 2026 · 65 clientes · 12 nuevos").
drop function if exists public.clientes_meses_disponibles();

create function public.clientes_meses_disponibles()
returns table(mes text, clientes bigint, nuevos bigint)
language sql stable security definer set search_path = public as $$
  with primer_mes as (
    select cliente_id, to_char(min(fecha), 'YYYY-MM') as mes
    from public.cliente_visitas
    group by cliente_id
  )
  select to_char(v.fecha, 'YYYY-MM'), count(distinct v.cliente_id),
    count(distinct v.cliente_id) filter (where pm.mes = to_char(v.fecha, 'YYYY-MM'))
  from public.cliente_visitas v
  join primer_mes pm on pm.cliente_id = v.cliente_id
  where app.tiene_permiso('matriculas.ver')
  group by 1
  order by 1 desc;
$$;
