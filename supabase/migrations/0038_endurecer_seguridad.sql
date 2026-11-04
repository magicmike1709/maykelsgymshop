-- ============================================================
-- Endurecer la seguridad (auditoría del 4 nov 2026)
--
-- A. Las cuentas nuevas nacen INACTIVAS: aunque alguien se registre
--    con la clave pública, no ve nada hasta que un admin la active.
--    (usuario_crear, que usa el admin, las deja activas.)
-- B. Las listas que no comprobaban permisos ahora exigen un usuario
--    activo (y productos_lista, además, permiso de inventario o ventas
--    porque expone costos).
-- C. anon y authenticated ya no tienen privilegios directos sobre las
--    tablas: la app solo entra por funciones. RLS seguía bloqueando,
--    pero así no depende de una sola barrera.
-- D. El bucket de fotos solo admite imágenes de hasta 2 MB.
-- ============================================================

-- ------------------------------------------------------------
-- Helper: ¿hay un usuario con sesión que además esté activo?
-- ------------------------------------------------------------
create or replace function app.es_usuario_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = app.usuario_actual() and u.activo
  );
$$;
revoke execute on function app.es_usuario_activo() from public, anon;

-- ------------------------------------------------------------
-- A. Cuentas nuevas inactivas hasta que un admin las active
-- ------------------------------------------------------------
create or replace function public.crear_usuario_desde_auth() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuarios (id, nombre, rol, activo)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', new.email), 'lectura', false)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- El admin crea usuarios con esta función: esos sí nacen activos.
create or replace function public.usuario_crear(p_email text, p_password text, p_nombre text, p_rol text)
returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('usuarios.administrar') then raise exception 'MG403: sin permiso'; end if;
  if p_rol not in ('admin','operador_plus','operador','mensajero','lectura') then
    raise exception 'MG422: rol inválido';
  end if;
  if exists (select 1 from auth.users where email = p_email) then
    raise exception 'MG422: ya existe un usuario con ese correo';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), now(), now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('nombre', p_nombre)
  ) returning id into v_id;

  update public.usuarios set rol = p_rol, nombre = p_nombre, activo = true where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ------------------------------------------------------------
-- B. Listas que ahora exigen usuario activo
-- ------------------------------------------------------------
create or replace function public.almacenes_lista() returns setof public.almacenes
language sql stable security definer set search_path = public as $$
  select * from public.almacenes where activo and app.es_usuario_activo() order by orden;
$$;

create or replace function public.avisos_lista()
returns table(id uuid, titulo text, mensaje text, activo boolean, usuario_id uuid, creado_en timestamptz, confirmaciones jsonb)
language sql stable security definer set search_path = public as $$
  select a.id, a.titulo, a.mensaje, a.activo, a.usuario_id, a.creado_en,
    coalesce((
      select jsonb_agg(jsonb_build_object('usuario_id', ac.usuario_id, 'nombre', u.nombre, 'confirmado_en', ac.confirmado_en) order by ac.confirmado_en)
      from public.aviso_confirmaciones ac join public.usuarios u on u.id = ac.usuario_id
      where ac.aviso_id = a.id
    ), '[]'::jsonb) as confirmaciones
  from public.avisos a
  where a.activo and app.es_usuario_activo()
  order by a.creado_en desc;
$$;

create or replace function public.gasto_categorias_lista() returns setof public.gasto_categorias
language sql stable security definer set search_path = public as $$
  select * from public.gasto_categorias where activo and app.es_usuario_activo() order by orden;
$$;

create or replace function public.gestores_lista() returns setof public.gestores
language sql stable security definer set search_path = public as $$
  select * from public.gestores where activo and app.es_usuario_activo() order by nombre;
$$;

create or replace function public.mensajeros_lista() returns setof public.mensajeros
language sql stable security definer set search_path = public as $$
  select * from public.mensajeros where activo and app.es_usuario_activo() order by nombre;
$$;

create or replace function public.refrigerios_lista() returns setof public.refrigerios
language sql stable security definer set search_path = public as $$
  select * from public.refrigerios where activo and app.es_usuario_activo() order by orden, nombre;
$$;

create or replace function public.socios_lista() returns setof public.socios
language sql stable security definer set search_path = public as $$
  select * from public.socios where activo and app.es_usuario_activo() order by nombre;
$$;

-- Expone costos: solo quien puede ver inventario o vender.
create or replace function public.productos_lista()
returns table(id uuid, codigo text, nombre text, categoria_id uuid, precio numeric, costo numeric, stock numeric, foto_url text, activo boolean)
language sql stable security definer set search_path = public as $$
  select id, codigo, nombre, categoria_id, precio, costo, stock, foto_url, activo
  from public.productos
  where activo and (app.tiene_permiso('inventario.ver') or app.tiene_permiso('ventas.crear'))
  order by nombre;
$$;

-- ------------------------------------------------------------
-- C. Sin privilegios directos de tabla para anon ni authenticated
--    (service_role y el dueño de las funciones no cambian)
-- ------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

do $$
begin
  alter default privileges for role supabase_admin in schema public revoke all on tables from anon, authenticated;
  alter default privileges for role supabase_admin in schema public revoke all on sequences from anon, authenticated;
exception when others then
  raise notice 'No se pudieron cambiar los privilegios por defecto de supabase_admin: %', sqlerrm;
end $$;

-- ------------------------------------------------------------
-- D. Bucket de fotos: solo imágenes, máximo 2 MB
-- ------------------------------------------------------------
update storage.buckets
set file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'productos';

-- ------------------------------------------------------------
-- Permisos de ejecución de lo que se redefinió (sin acceso anónimo)
-- ------------------------------------------------------------
revoke execute on function public.almacenes_lista() from public, anon;
revoke execute on function public.avisos_lista() from public, anon;
revoke execute on function public.gasto_categorias_lista() from public, anon;
revoke execute on function public.gestores_lista() from public, anon;
revoke execute on function public.mensajeros_lista() from public, anon;
revoke execute on function public.refrigerios_lista() from public, anon;
revoke execute on function public.socios_lista() from public, anon;
revoke execute on function public.productos_lista() from public, anon;
revoke execute on function public.usuario_crear(text, text, text, text) from public, anon;
revoke execute on function public.crear_usuario_desde_auth() from public, anon, authenticated;
grant execute on function public.almacenes_lista() to authenticated, service_role;
grant execute on function public.avisos_lista() to authenticated, service_role;
grant execute on function public.gasto_categorias_lista() to authenticated, service_role;
grant execute on function public.gestores_lista() to authenticated, service_role;
grant execute on function public.mensajeros_lista() to authenticated, service_role;
grant execute on function public.refrigerios_lista() to authenticated, service_role;
grant execute on function public.socios_lista() to authenticated, service_role;
grant execute on function public.productos_lista() to authenticated, service_role;
grant execute on function public.usuario_crear(text, text, text, text) to authenticated, service_role;
