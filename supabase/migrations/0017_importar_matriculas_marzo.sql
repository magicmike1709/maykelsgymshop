-- Historial real de matrículas de marzo 2026 (+ 28/2), importado desde
-- Base_de_Datos.csv (288 filas después de quitar 1 duplicado exacto:
-- Cristian Garces Benito, 30/3, mismo teléfono, contado como 1 pago).
-- La columna "Personal" del CSV es solo informativa, no cambia el precio.
-- Precio de marzo: 5,000 CUP fijo (igual que agosto).
insert into public.matriculas (fecha, monto, pagos, lote) values
  ('2026-02-28', 15000, 3, 'manual'),
  ('2026-03-02', 55000, 11, 'manual'),
  ('2026-03-03', 20000, 4, 'manual'),
  ('2026-03-05', 75000, 15, 'manual'),
  ('2026-03-06', 45000, 9, 'manual'),
  ('2026-03-07', 20000, 4, 'manual'),
  ('2026-03-08', 20000, 4, 'manual'),
  ('2026-03-09', 120000, 24, 'manual'),
  ('2026-03-10', 100000, 20, 'manual'),
  ('2026-03-11', 50000, 10, 'manual'),
  ('2026-03-12', 35000, 7, 'manual'),
  ('2026-03-13', 25000, 5, 'manual'),
  ('2026-03-14', 15000, 3, 'manual'),
  ('2026-03-15', 5000, 1, 'manual'),
  ('2026-03-16', 155000, 31, 'manual'),
  ('2026-03-17', 65000, 13, 'manual'),
  ('2026-03-18', 20000, 4, 'manual'),
  ('2026-03-19', 60000, 12, 'manual'),
  ('2026-03-20', 55000, 11, 'manual'),
  ('2026-03-21', 15000, 3, 'manual'),
  ('2026-03-23', 165000, 33, 'manual'),
  ('2026-03-24', 55000, 11, 'manual'),
  ('2026-03-25', 45000, 9, 'manual'),
  ('2026-03-26', 45000, 9, 'manual'),
  ('2026-03-27', 5000, 1, 'manual'),
  ('2026-03-28', 5000, 1, 'manual'),
  ('2026-03-30', 150000, 30, 'manual');
