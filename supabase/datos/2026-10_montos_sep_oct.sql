-- Relleno de montos de septiembre y octubre 2026 (aplicado a mano en
-- producción el 30-10-2026; NO es una migración, no se reaplica).
--
-- El CSV de la hostess no traía monto. Según el dueño:
--   - Septiembre: los que renovaron pagaron 5,000 CUP; los nuevos
--     (primera visita en septiembre) pagaron 10 USD al cambio del día.
--   - Octubre: todos pagaron 10 USD al cambio del día.
-- Tasa del día: USD informal de elTOQUE, interpolada en línea recta
-- entre los puntos publicados (1-sep estimado por la depreciación
-- mensual de ~11 %). Solo se tocan visitas con monto vacío.
with anclas(fecha, cup) as (values
  ('2026-09-01'::date, 675), ('2026-09-12', 693), ('2026-09-29', 745),
  ('2026-09-30', 750), ('2026-10-02', 770), ('2026-10-16', 800),
  ('2026-10-22', 820), ('2026-10-23', 825), ('2026-10-27', 845),
  ('2026-10-28', 850), ('2026-10-29', 855), ('2026-10-31', 855)
), tramos as (
  select fecha, cup, lead(fecha) over (order by fecha) f2, lead(cup) over (order by fecha) c2 from anclas
), tasa as (
  select d::date fecha, round(t.cup + (t.c2 - t.cup) * (d::date - t.fecha)::numeric / (t.f2 - t.fecha)) cup
  from tramos t, generate_series(t.fecha, t.f2 - 1, interval '1 day') d
  where t.f2 is not null
), primera as (
  select cliente_id, min(fecha) f from public.cliente_visitas group by 1
), nuevo_monto as (
  select v.id,
    case when v.fecha < '2026-10-01' and p.f <> v.fecha then 5000
         else 10 * ta.cup end as monto
  from public.cliente_visitas v
  join primera p using (cliente_id)
  join tasa ta on ta.fecha = v.fecha
  where v.fecha >= '2026-09-01' and v.fecha < '2026-11-01' and v.monto is null
)
update public.cliente_visitas v set monto = n.monto from nuevo_monto n where n.id = v.id;

-- Reconstruir la fila 'individual' de matrículas de cada día.
insert into public.matriculas (fecha, monto, pagos, lote)
select v.fecha, sum(v.monto), count(*), 'individual'
from public.cliente_visitas v
where v.fecha >= '2026-09-01' and v.fecha < '2026-11-01' and v.monto is not null
group by v.fecha
on conflict (fecha) where lote = 'individual'
do update set monto = excluded.monto, pagos = excluded.pagos;
