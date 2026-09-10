-- ============================================================
-- Distingue una venta cargada día por día ('dia') de un cuadre
-- mensual consolidado importado del reporte del POS
-- ('cuadre_mensual'). Cuando llega el cuadre de un mes, se borran
-- las entradas de ese mes (de cualquier origen) y se reemplazan
-- por una sola fila con el total oficial del mes — así nunca se
-- cuenta dos veces un día que ya se había cargado suelto.
-- ============================================================
alter table public.refrigerio_ventas add column origen text not null default 'dia' check (origen in ('dia', 'cuadre_mensual'));
alter table public.ventas add column origen text not null default 'dia' check (origen in ('dia', 'cuadre_mensual'));
