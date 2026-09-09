-- Registrar (o actualizar) un pago/visita de cliente desde la app
-- directamente — usado por el importador de CSV en Clientes.
-- Empareja por teléfono si existe; si no, crea el cliente.
create function public.cliente_visita_registrar(
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

  return jsonb_build_object('ok', true, 'cliente_id', v_cliente_id);
end;
$$;

revoke execute on function public.cliente_visita_registrar(text, date, text, text, text, numeric) from public;
grant execute on function public.cliente_visita_registrar(text, date, text, text, text, numeric) to authenticated, service_role;
revoke execute on function public.cliente_visita_registrar(text, date, text, text, text, numeric) from anon;
