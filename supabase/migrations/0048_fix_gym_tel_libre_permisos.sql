-- 0048: gym_tel_libre requiere permiso gym.cobrar
-- Cualquier usuario autenticado podía llamar a esta función y descubrir
-- si un número de teléfono pertenece a un cliente del gym.
-- Se añade la comprobación de permiso; si no lo tiene retorna null.

create or replace function public.gym_tel_libre(p_tel text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.tiene_permiso('gym.cobrar') then
    raise exception 'permiso denegado' using errcode = 'insufficient_privilege';
  end if;
  return p_tel is not null and not exists (
    select 1 from public.clientes_gym where telefono = p_tel
  );
end;
$$;
