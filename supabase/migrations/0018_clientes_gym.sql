-- ============================================================
-- Base de clientes del gym: directorio buscable con historial de
-- meses en que pagó cada uno. Es solo un directorio/histórico —
-- NO maneja vencimientos ni avisos de renovación (eso se decidió
-- que no, queda fuera de esta app).
-- ============================================================
create table public.clientes_gym (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  sexo text,
  entrenador text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index ux_clientes_gym_telefono on public.clientes_gym(telefono) where telefono is not null and telefono <> '';
create index ix_clientes_gym_nombre on public.clientes_gym using gin (nombre gin_trgm_ops);
alter table public.clientes_gym enable row level security;

create table public.cliente_visitas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes_gym(id) on delete cascade,
  fecha date not null,
  creado_en timestamptz not null default now(),
  unique (cliente_id, fecha)
);
create index ix_cliente_visitas_fecha on public.cliente_visitas(fecha);
alter table public.cliente_visitas enable row level security;

create extension if not exists pg_trgm;

-- Buscador: por nombre (parecido) o teléfono (exacto/parcial).
create function public.clientes_buscar(p_busqueda text default null, p_limite integer default 50)
returns table(id uuid, nombre text, telefono text, sexo text, entrenador text, visitas bigint, ultima_visita date)
language sql stable security definer set search_path = public as $$
  select c.id, c.nombre, c.telefono, c.sexo, c.entrenador,
    count(v.id), max(v.fecha)
  from public.clientes_gym c
  left join public.cliente_visitas v on v.cliente_id = c.id
  where app.tiene_permiso('matriculas.ver')
    and (p_busqueda is null or p_busqueda = '' or c.nombre ilike '%' || p_busqueda || '%' or c.telefono ilike '%' || p_busqueda || '%')
  group by c.id, c.nombre, c.telefono, c.sexo, c.entrenador
  order by max(v.fecha) desc nulls last
  limit p_limite;
$$;

create function public.cliente_detalle(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not app.tiene_permiso('matriculas.ver') then null else
    jsonb_build_object(
      'cliente', to_jsonb(c.*),
      'visitas', (select coalesce(jsonb_agg(v.fecha order by v.fecha desc), '[]'::jsonb) from public.cliente_visitas v where v.cliente_id = c.id)
    )
  end
  from public.clientes_gym c where c.id = p_id;
$$;

-- Meses con datos de clientes (para el selector de histórico).
create function public.clientes_meses_disponibles()
returns table(mes text, clientes bigint)
language sql stable security definer set search_path = public as $$
  select to_char(fecha, 'YYYY-MM'), count(distinct cliente_id)
  from public.cliente_visitas
  where app.tiene_permiso('matriculas.ver')
  group by 1
  order by 1 desc;
$$;

create function public.clientes_por_mes(p_mes text)
returns table(id uuid, nombre text, telefono text, sexo text, entrenador text, fecha date)
language sql stable security definer set search_path = public as $$
  select c.id, c.nombre, c.telefono, c.sexo, c.entrenador, v.fecha
  from public.cliente_visitas v
  join public.clientes_gym c on c.id = v.cliente_id
  where to_char(v.fecha, 'YYYY-MM') = p_mes and app.tiene_permiso('matriculas.ver')
  order by v.fecha, c.nombre;
$$;

revoke execute on function public.clientes_buscar(text, integer) from public;
grant execute on function public.clientes_buscar(text, integer) to authenticated, service_role;
revoke execute on function public.clientes_buscar(text, integer) from anon;

revoke execute on function public.cliente_detalle(uuid) from public;
grant execute on function public.cliente_detalle(uuid) to authenticated, service_role;
revoke execute on function public.cliente_detalle(uuid) from anon;

revoke execute on function public.clientes_meses_disponibles() from public;
grant execute on function public.clientes_meses_disponibles() to authenticated, service_role;
revoke execute on function public.clientes_meses_disponibles() from anon;

revoke execute on function public.clientes_por_mes(text) from public;
grant execute on function public.clientes_por_mes(text) to authenticated, service_role;
revoke execute on function public.clientes_por_mes(text) from anon;
