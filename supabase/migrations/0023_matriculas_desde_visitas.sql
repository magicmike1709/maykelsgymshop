-- cliente_visita_registrar solo guardaba el directorio (clientes_gym /
-- cliente_visitas), pero no sumaba al dinero de Matrículas (la tabla
-- public.matriculas que alimenta Resumen, Cierre, etc). Se arregla
-- para que, cuando venga con monto, también mantenga al día un
-- renglón de "matriculas" por día (lote = 'individual', separado del
-- resumen manual), recalculado desde cero cada vez a partir de
-- cliente_visitas — así es seguro repetir la carga sin duplicar.
create unique index ux_matriculas_individual_fecha on public.matriculas(fecha) where lote = 'individual';

create or replace function public.cliente_visita_registrar(
  p_nombre text, p_fecha date, p_telefono text default null,
  p_sexo text default null, p_entrenador text default null, p_monto numeric default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_cliente_id uuid;
begin
  if not app.tiene_permiso('matriculas.ver') then raise exception 'MG403: sin permiso'; end if;

  if p_telefono is not null and p_telefono <> '' then
    select id into v_cliente_id from public.clientes_gym where telefono = p_telefono;
  end if;

  if v_cliente_id is null then
    insert into public.clientes_gym (nombre, telefono, sexo, entrenador)
    values (p_nombre, nullif(p_telefono, ''), p_sexo, p_entrenador)
    returning id into v_cliente_id;
  else
    update public.clientes_gym set
      nombre = p_nombre,
      sexo = coalesce(p_sexo, sexo),
      entrenador = coalesce(p_entrenador, entrenador),
      actualizado_en = now()
    where id = v_cliente_id;
  end if;

  insert into public.cliente_visitas (cliente_id, fecha, monto)
  values (v_cliente_id, p_fecha, p_monto)
  on conflict (cliente_id, fecha) do update set monto = coalesce(excluded.monto, public.cliente_visitas.monto);

  if p_monto is not null then
    insert into public.matriculas (fecha, monto, pagos, lote)
    select p_fecha, coalesce(sum(v.monto), 0), count(*), 'individual'
    from public.cliente_visitas v where v.fecha = p_fecha and v.monto is not null
    on conflict (fecha) where lote = 'individual'
    do update set monto = excluded.monto, pagos = excluded.pagos;
  end if;

  return jsonb_build_object('ok', true, 'cliente_id', v_cliente_id);
end;
$$;
