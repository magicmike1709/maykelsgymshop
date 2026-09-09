-- Permite desactivar (quitar) un producto de Nevera sin perder su historial
-- de ventas. Igual que en la app anterior: "Borrar un producto lo pone
-- activo = false; sus ventas se conservan."
create function public.refrigerio_baja(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.tiene_permiso('inventario.editar') then raise exception 'MG403: sin permiso'; end if;
  update public.refrigerios set activo = false where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.refrigerio_baja(uuid) from public;
grant execute on function public.refrigerio_baja(uuid) to authenticated, service_role;
revoke execute on function public.refrigerio_baja(uuid) from anon;
