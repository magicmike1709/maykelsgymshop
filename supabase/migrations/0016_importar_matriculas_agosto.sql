-- Historial real de matrículas de agosto 2026, importado desde
-- Base_clientes_agosto_2026.csv (231 filas después de quitar 1 duplicado
-- exacto: Brayan Duarte, 4/8, mismo teléfono, contado como 1 pago).
-- Precio de agosto: 5,000 CUP fijo (subió a 6,700 CUP desde octubre).
insert into public.matriculas (fecha, monto, pagos, lote) values
  ('2026-07-31', 5000, 1, 'manual'),
  ('2026-08-01', 5000, 1, 'manual'),
  ('2026-08-02', 10000, 2, 'manual'),
  ('2026-08-03', 35000, 7, 'manual'),
  ('2026-08-04', 25000, 5, 'manual'),
  ('2026-08-05', 30000, 6, 'manual'),
  ('2026-08-06', 75000, 15, 'manual'),
  ('2026-08-07', 65000, 13, 'manual'),
  ('2026-08-09', 5000, 1, 'manual'),
  ('2026-08-10', 120000, 24, 'manual'),
  ('2026-08-11', 60000, 12, 'manual'),
  ('2026-08-12', 25000, 5, 'manual'),
  ('2026-08-13', 85000, 17, 'manual'),
  ('2026-08-16', 10000, 2, 'manual'),
  ('2026-08-17', 165000, 33, 'manual'),
  ('2026-08-18', 100000, 20, 'manual'),
  ('2026-08-19', 15000, 3, 'manual'),
  ('2026-08-20', 55000, 11, 'manual'),
  ('2026-08-21', 5000, 1, 'manual'),
  ('2026-08-22', 30000, 6, 'manual'),
  ('2026-08-23', 20000, 4, 'manual'),
  ('2026-08-24', 45000, 9, 'manual'),
  ('2026-08-25', 105000, 21, 'manual'),
  ('2026-08-26', 15000, 3, 'manual'),
  ('2026-08-27', 25000, 5, 'manual'),
  ('2026-08-28', 20000, 4, 'manual');
