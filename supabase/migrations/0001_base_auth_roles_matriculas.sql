-- ============================================================
-- Base: roles, permisos, usuarios, y helpers de seguridad
-- ============================================================

create table public.roles (
  codigo text primary key,
  nombre text not null,
  descripcion text,
  orden smallint not null default 0
);

insert into public.roles (codigo, nombre, descripcion, orden) values
  ('admin', 'Dueño', 'Acceso total: contabilidad, socios, propietarios, cierres', 1),
  ('operador_plus', 'Segundo admin', 'Registra productos, inventario y precios, sin ver contabilidad completa', 2),
  ('operador', 'Gestor', 'Ve inventario real y registra ventas, gana comisión', 3),
  ('mensajero', 'Mensajero', 'Ve sus entregas y rinde el dinero cobrado', 4),
  ('lectura', 'Solo lectura', 'Consulta sin editar', 5);

create table public.permisos (
  codigo text primary key,
  grupo text not null,
  descripcion text not null,
  orden smallint not null default 0
);

insert into public.permisos (codigo, grupo, descripcion, orden) values
  ('matriculas.ver', 'Gym', 'Ver matrículas del gym', 1),
  ('matriculas.registrar', 'Gym', 'Registrar pagos de matrícula', 2),
  ('inventario.ver', 'Inventario', 'Ver inventario real', 3),
  ('inventario.editar', 'Inventario', 'Editar productos, inventario y precios', 4),
  ('ventas.crear', 'Ventas', 'Registrar una venta', 5),
  ('contabilidad.ver', 'Finanzas', 'Ver ganancia y contabilidad completa', 6),
  ('usuarios.administrar', 'Sistema', 'Crear y editar usuarios', 7);

create table public.rol_permisos (
  rol text not null references public.roles(codigo) on delete cascade,
  permiso text not null references public.permisos(codigo) on delete cascade,
  primary key (rol, permiso)
);

insert into public.rol_permisos (rol, permiso) values
  ('admin', 'matriculas.ver'), ('admin', 'matriculas.registrar'),
  ('admin', 'inventario.ver'), ('admin', 'inventario.editar'),
  ('admin', 'ventas.crear'), ('admin', 'contabilidad.ver'), ('admin', 'usuarios.administrar'),
  ('operador_plus', 'inventario.ver'), ('operador_plus', 'inventario.editar'), ('operador_plus', 'ventas.crear'),
  ('operador', 'inventario.ver'), ('operador', 'ventas.crear'),
  ('lectura', 'inventario.ver'), ('lectura', 'matriculas.ver');

create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol text not null references public.roles(codigo),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

alter table public.roles enable row level security;
alter table public.permisos enable row level security;
alter table public.rol_permisos enable row level security;
alter table public.usuarios enable row level security;
-- Sin políticas: nadie tiene permiso de tabla directo, todo entra por funciones security definer.

create schema if not exists app;

create function app.usuario_actual() returns uuid
language sql stable security definer set search_path = public, auth as $$
  select auth.uid();
$$;

create function app.tiene_permiso(p_permiso text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.usuarios u
    join public.rol_permisos rp on rp.rol = u.rol
    where u.id = app.usuario_actual() and u.activo and rp.permiso = p_permiso
  );
$$;

create function public.mi_perfil() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(u) || jsonb_build_object('rol_nombre', r.nombre) from public.usuarios u
  join public.roles r on r.codigo = u.rol
  where u.id = app.usuario_actual();
$$;

create function public.crear_usuario_desde_auth() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuarios (id, nombre, rol)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', new.email), 'lectura')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger tg_auth_usuario_nuevo
after insert on auth.users
for each row execute function public.crear_usuario_desde_auth();

-- ============================================================
-- Matrículas del gym (CUP)
-- ============================================================

create table public.matriculas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  monto numeric not null check (monto >= 0),
  nombre text,
  nota text,
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);

create index ix_matriculas_fecha on public.matriculas(fecha);
alter table public.matriculas enable row level security;

create function public.matricula_guardar(p_monto numeric, p_nombre text default null, p_nota text default null, p_fecha date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('matriculas.registrar') then
    raise exception 'MG403: sin permiso';
  end if;
  insert into public.matriculas (fecha, monto, nombre, nota, usuario_id)
  values (p_fecha, p_monto, p_nombre, p_nota, app.usuario_actual())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create function public.matriculas_panel(p_desde date default date_trunc('month', current_date)::date, p_hasta date default current_date)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', coalesce(sum(monto), 0),
    'pagos', count(*),
    'desde', p_desde,
    'hasta', p_hasta
  )
  from public.matriculas
  where fecha between p_desde and p_hasta
    and app.tiene_permiso('matriculas.ver');
$$;

revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.mi_perfil() to authenticated;

-- Nadie sin sesión puede llamar estas funciones (lección de seguridad de la app anterior)
revoke execute on function public.crear_usuario_desde_auth() from anon, authenticated;
revoke execute on function public.matricula_guardar(numeric, text, text, date) from anon;
revoke execute on function public.matriculas_panel(date, date) from anon;
revoke execute on function public.mi_perfil() from anon;
