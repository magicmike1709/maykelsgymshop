-- ============================================================
-- 1) Plata dormida: productos con stock que no se venden hace tiempo
-- ============================================================
create function public.plata_dormida()
returns table(producto_id uuid, nombre text, foto_url text, stock numeric, costo numeric, invertido numeric, ultima_venta date, dias_sin_vender integer)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.foto_url, p.stock, p.costo, round(p.stock * p.costo, 2) as invertido,
    uv.ultima as ultima_venta,
    (current_date - coalesce(uv.ultima, p.creado_en::date))::int as dias_sin_vender
  from public.productos p
  left join (
    select vl.producto_id, max(v.fecha::date) as ultima
    from public.venta_lineas vl join public.ventas v on v.id = vl.venta_id
    where v.estado = 'confirmada'
    group by vl.producto_id
  ) uv on uv.producto_id = p.id
  where p.activo and p.stock > 0 and app.tiene_permiso('inventario.ver')
  order by 8 desc;
$$;

-- ============================================================
-- 2) Catálogo público para compartir por WhatsApp (sin login)
-- ============================================================
create function public.catalogo_publico()
returns table(nombre text, precio numeric, foto_url text, categoria text)
language sql stable security definer set search_path = public as $$
  select p.nombre, p.precio, p.foto_url, c.nombre as categoria
  from public.productos p left join public.categorias c on c.id = p.categoria_id
  where p.activo and p.stock > 0
  order by c.nombre nulls last, p.nombre;
$$;

grant execute on function public.catalogo_publico() to anon;

-- ============================================================
-- 3) Actividad: registro inmutable de qué cambió y quién
-- ============================================================
create table public.actividad (
  id bigint generated always as identity primary key,
  usuario_id uuid references public.usuarios(id),
  tabla text not null,
  accion text not null,
  registro_id text,
  datos jsonb,
  creado_en timestamptz not null default now()
);
alter table public.actividad enable row level security;

create function app.registrar_actividad() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.actividad (usuario_id, tabla, accion, registro_id, datos)
  values (
    app.usuario_actual(),
    TG_TABLE_NAME,
    TG_OP,
    (case when TG_OP = 'DELETE' then old.id else new.id end)::text,
    case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
  );
  return null;
end;
$$;

create trigger tg_actividad_ventas after insert or update on public.ventas for each row execute function app.registrar_actividad();
create trigger tg_actividad_matriculas after insert or update on public.matriculas for each row execute function app.registrar_actividad();
create trigger tg_actividad_gastos after insert on public.gastos for each row execute function app.registrar_actividad();
create trigger tg_actividad_entradas after insert on public.entradas_inventario for each row execute function app.registrar_actividad();
create trigger tg_actividad_cierres after insert or update on public.cierres for each row execute function app.registrar_actividad();

create function app.actividad_inmutable() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'MG403: la actividad no se puede modificar ni borrar';
end;
$$;
create trigger tg_actividad_bloquear before update or delete on public.actividad for each row execute function app.actividad_inmutable();

create function public.actividad_lista(p_limite integer default 50)
returns setof public.actividad
language sql stable security definer set search_path = public as $$
  select * from public.actividad where app.tiene_permiso('contabilidad.ver') order by creado_en desc limit p_limite;
$$;

-- ============================================================
-- 4) Avisos: recordatorios simples dentro de la app
-- ============================================================
create table public.avisos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  mensaje text,
  activo boolean not null default true,
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);
alter table public.avisos enable row level security;

create function public.avisos_lista() returns setof public.avisos
language sql stable security definer set search_path = public as $$
  select * from public.avisos where activo order by creado_en desc;
$$;

create function public.aviso_guardar(p_titulo text, p_mensaje text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('usuarios.administrar') then raise exception 'MG403: sin permiso'; end if;
  insert into public.avisos (titulo, mensaje, usuario_id) values (p_titulo, p_mensaje, app.usuario_actual()) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create function public.aviso_resolver(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not app.tiene_permiso('usuarios.administrar') then raise exception 'MG403: sin permiso'; end if;
  update public.avisos set activo = false where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================
-- Permisos de ejecución: nada de esto (salvo el catálogo público)
-- pasa sin haber iniciado sesión.
-- ============================================================
revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.catalogo_publico() to anon;
