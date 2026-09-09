-- ============================================================
-- Gestores (comisión por venta) y Mensajeros (rinden dinero)
-- ============================================================
create table public.gestores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  pct_comision numeric not null default 0 check (pct_comision >= 0 and pct_comision <= 1),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table public.mensajeros (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

alter table public.ventas add column gestor_id uuid references public.gestores(id);
alter table public.ventas add column comision_gestor numeric not null default 0;
alter table public.ventas add column comision_pagada_en timestamptz;
alter table public.ventas add column es_mensajeria boolean not null default false;
alter table public.ventas add column mensajero_id uuid references public.mensajeros(id);
alter table public.ventas add column monto_a_rendir numeric not null default 0;
alter table public.ventas add column mensajeria_rendida_en timestamptz;

alter table public.gestores enable row level security;
alter table public.mensajeros enable row level security;

create function public.gestores_lista() returns setof public.gestores
language sql stable security definer set search_path = public as $$
  select * from public.gestores where activo order by nombre;
$$;

create function public.gestor_guardar(p_id uuid, p_nombre text, p_pct_comision numeric default 0, p_telefono text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('usuarios.administrar') then raise exception 'MG403: sin permiso'; end if;
  if p_id is null then
    insert into public.gestores (nombre, telefono, pct_comision) values (p_nombre, p_telefono, p_pct_comision) returning id into v_id;
  else
    update public.gestores set nombre = p_nombre, telefono = p_telefono, pct_comision = p_pct_comision where id = p_id returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

create function public.mensajeros_lista() returns setof public.mensajeros
language sql stable security definer set search_path = public as $$
  select * from public.mensajeros where activo order by nombre;
$$;

create function public.mensajero_guardar(p_id uuid, p_nombre text, p_telefono text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('usuarios.administrar') then raise exception 'MG403: sin permiso'; end if;
  if p_id is null then
    insert into public.mensajeros (nombre, telefono) values (p_nombre, p_telefono) returning id into v_id;
  else
    update public.mensajeros set nombre = p_nombre, telefono = p_telefono where id = p_id returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

create function public.comisiones_pendientes()
returns table(gestor_id uuid, gestor_nombre text, total numeric, ventas integer)
language sql stable security definer set search_path = public as $$
  select g.id, g.nombre, coalesce(sum(v.comision_gestor),0), count(*)::int
  from public.gestores g join public.ventas v on v.gestor_id = g.id
  where v.comision_pagada_en is null and v.estado = 'confirmada' and app.tiene_permiso('contabilidad.ver')
  group by g.id, g.nombre having count(*) > 0;
$$;

create function public.comision_pagar(p_gestor_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not app.tiene_permiso('contabilidad.ver') then raise exception 'MG403: sin permiso'; end if;
  update public.ventas set comision_pagada_en = now() where gestor_id = p_gestor_id and comision_pagada_en is null;
  return jsonb_build_object('ok', true);
end; $$;

create function public.mensajeros_pendientes()
returns table(mensajero_id uuid, mensajero_nombre text, total numeric, ventas integer)
language sql stable security definer set search_path = public as $$
  select m.id, m.nombre, coalesce(sum(v.monto_a_rendir),0), count(*)::int
  from public.mensajeros m join public.ventas v on v.mensajero_id = m.id
  where v.es_mensajeria and v.mensajeria_rendida_en is null and v.estado = 'confirmada' and app.tiene_permiso('contabilidad.ver')
  group by m.id, m.nombre having count(*) > 0;
$$;

create function public.mensajero_rendir(p_mensajero_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not app.tiene_permiso('contabilidad.ver') then raise exception 'MG403: sin permiso'; end if;
  update public.ventas set mensajeria_rendida_en = now() where mensajero_id = p_mensajero_id and mensajeria_rendida_en is null;
  return jsonb_build_object('ok', true);
end; $$;

-- ============================================================
-- Socios (% de ganancia en productos específicos) y propietarios simplificado
-- ============================================================
create table public.socios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table public.socios enable row level security;

alter table public.productos add column socio_id uuid references public.socios(id);
alter table public.productos add column pct_ganancia_socio numeric not null default 0 check (pct_ganancia_socio >= 0 and pct_ganancia_socio <= 1);

alter table public.venta_lineas add column ganancia_socio_linea numeric not null default 0;
alter table public.venta_lineas add column socio_id uuid references public.socios(id);
alter table public.venta_lineas add column socio_pagado_en timestamptz;

create function public.socios_lista() returns setof public.socios
language sql stable security definer set search_path = public as $$ select * from public.socios where activo order by nombre; $$;

create function public.socio_guardar(p_id uuid, p_nombre text, p_telefono text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('usuarios.administrar') then raise exception 'MG403: sin permiso'; end if;
  if p_id is null then insert into public.socios (nombre, telefono) values (p_nombre, p_telefono) returning id into v_id;
  else update public.socios set nombre=p_nombre, telefono=p_telefono where id=p_id returning id into v_id; end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

create function public.socios_pendientes()
returns table(socio_id uuid, socio_nombre text, total numeric)
language sql stable security definer set search_path = public as $$
  select s.id, s.nombre, coalesce(sum(vl.ganancia_socio_linea),0)
  from public.socios s join public.venta_lineas vl on vl.socio_id = s.id
  where vl.socio_pagado_en is null and app.tiene_permiso('contabilidad.ver')
  group by s.id, s.nombre having sum(vl.ganancia_socio_linea) > 0;
$$;

create function public.socio_pagar(p_socio_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not app.tiene_permiso('contabilidad.ver') then raise exception 'MG403: sin permiso'; end if;
  update public.venta_lineas set socio_pagado_en = now() where socio_id = p_socio_id and socio_pagado_en is null;
  return jsonb_build_object('ok', true);
end; $$;

-- ============================================================
-- Cierre de caja
-- ============================================================
create table public.cierres (
  id uuid primary key default gen_random_uuid(),
  dia date not null unique,
  estado text not null default 'cerrado',
  snapshot jsonb not null,
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  reabierto_en timestamptz
);
alter table public.cierres enable row level security;

create function app.dia_cerrado(p_fecha date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.cierres where dia = p_fecha and estado = 'cerrado');
$$;

create function public.cierre_crear(p_dia date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_snap jsonb; v_id uuid;
begin
  if not app.tiene_permiso('contabilidad.ver') then raise exception 'MG403: sin permiso'; end if;
  if app.dia_cerrado(p_dia) then return jsonb_build_object('ok', false, 'motivo', 'ya_cerrado'); end if;
  v_snap := public.panel_resumen(p_dia, p_dia);
  insert into public.cierres (dia, snapshot, usuario_id)
  values (p_dia, v_snap, app.usuario_actual())
  on conflict (dia) do update set estado='cerrado', snapshot=excluded.snapshot, usuario_id=excluded.usuario_id, creado_en=now(), reabierto_en=null
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'snapshot', v_snap);
end; $$;

create function public.cierre_reabrir(p_dia date)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not app.tiene_permiso('contabilidad.ver') then raise exception 'MG403: sin permiso'; end if;
  update public.cierres set estado = 'abierto', reabierto_en = now() where dia = p_dia;
  return jsonb_build_object('ok', true);
end; $$;

create function public.cierres_lista(p_desde date default (current_date - interval '30 days')::date, p_hasta date default current_date)
returns setof public.cierres
language sql stable security definer set search_path = public as $$
  select * from public.cierres where dia between p_desde and p_hasta and app.tiene_permiso('contabilidad.ver') order by dia desc;
$$;

-- ============================================================
-- venta_crear v2: gestor/comisión, mensajería/rendición, socio por línea, respeta cierre
-- (reemplaza la v1 de 4 parámetros — se borra al final de este archivo)
-- ============================================================
create or replace function public.venta_crear(
  p_lineas jsonb,
  p_cliente text default null,
  p_telefono text default null,
  p_es_fiado boolean default false,
  p_gestor_id uuid default null,
  p_es_mensajeria boolean default false,
  p_mensajero_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_venta_id uuid; v_total numeric := 0; v_costo numeric := 0; v_linea jsonb;
  v_stock numeric; v_pct_comision numeric := 0; v_producto record; v_importe numeric; v_ganancia_socio numeric;
begin
  if not app.tiene_permiso('ventas.crear') then raise exception 'MG403: sin permiso'; end if;
  if app.dia_cerrado(current_date) then raise exception 'MG423: el día ya está cerrado, reábrelo para editar'; end if;

  if p_gestor_id is not null then
    select pct_comision into v_pct_comision from public.gestores where id = p_gestor_id;
  end if;

  insert into public.ventas (cliente, telefono, es_fiado, usuario_id, estado, gestor_id, es_mensajeria, mensajero_id)
  values (p_cliente, p_telefono, p_es_fiado, app.usuario_actual(), 'confirmada', p_gestor_id, p_es_mensajeria, p_mensajero_id)
  returning id into v_venta_id;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    select * into v_producto from public.productos where id = (v_linea->>'producto_id')::uuid for update;
    if v_producto.stock is null or v_producto.stock < (v_linea->>'cantidad')::numeric then
      raise exception 'MG422: sin existencia suficiente';
    end if;

    v_importe := v_producto.precio * (v_linea->>'cantidad')::numeric;
    v_ganancia_socio := (v_producto.precio - v_producto.costo) * (v_linea->>'cantidad')::numeric * v_producto.pct_ganancia_socio;

    insert into public.venta_lineas (venta_id, producto_id, producto_nombre, cantidad, precio_unit, costo_unit, importe, socio_id, ganancia_socio_linea)
    values (v_venta_id, v_producto.id, v_producto.nombre, (v_linea->>'cantidad')::numeric, v_producto.precio, v_producto.costo, v_importe, v_producto.socio_id, v_ganancia_socio);

    update public.productos set stock = stock - (v_linea->>'cantidad')::numeric where id = v_producto.id;

    v_total := v_total + v_importe;
    v_costo := v_costo + v_producto.costo * (v_linea->>'cantidad')::numeric;
  end loop;

  update public.ventas set
    total = v_total, costo_total = v_costo, ganancia = v_total - v_costo,
    comision_gestor = v_total * v_pct_comision,
    monto_a_rendir = case when p_es_mensajeria then v_total else 0 end
  where id = v_venta_id;

  return jsonb_build_object('ok', true, 'id', v_venta_id, 'total', v_total);
end;
$$;

-- producto_guardar v2: admite socio y % de ganancia del socio
-- (reemplaza la v1 de 7 parámetros — se borra al final de este archivo)
create or replace function public.producto_guardar(
  p_id uuid, p_nombre text, p_precio numeric, p_costo numeric, p_stock numeric default 0,
  p_codigo text default null, p_categoria_id uuid default null,
  p_socio_id uuid default null, p_pct_ganancia_socio numeric default 0
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('inventario.editar') then raise exception 'MG403: sin permiso'; end if;
  if p_id is null then
    insert into public.productos (codigo, nombre, categoria_id, precio, costo, stock, socio_id, pct_ganancia_socio)
    values (p_codigo, p_nombre, p_categoria_id, p_precio, p_costo, p_stock, p_socio_id, p_pct_ganancia_socio)
    returning id into v_id;
  else
    update public.productos set nombre = p_nombre, precio = p_precio, costo = p_costo, stock = p_stock,
      socio_id = p_socio_id, pct_ganancia_socio = p_pct_ganancia_socio
    where id = p_id returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Los demás módulos también respetan el cierre del día
create or replace function public.matricula_dia_guardar(p_fecha date, p_pagos integer, p_total numeric, p_reemplazar boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('matriculas.registrar') then raise exception 'MG403: sin permiso'; end if;
  if app.dia_cerrado(p_fecha) then raise exception 'MG423: el día ya está cerrado, reábrelo para editar'; end if;

  if exists (select 1 from public.matriculas where fecha = p_fecha and lote is distinct from 'manual') then
    if not p_reemplazar then
      return jsonb_build_object('ok', false, 'motivo', 'detalle_existente');
    end if;
    delete from public.matriculas where fecha = p_fecha and lote is distinct from 'manual';
  end if;

  insert into public.matriculas (fecha, monto, pagos, lote, usuario_id)
  values (p_fecha, p_total, p_pagos, 'manual', app.usuario_actual())
  on conflict (fecha) where lote = 'manual'
  do update set monto = excluded.monto, pagos = excluded.pagos
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.refrigerio_venta_guardar(p_lineas jsonb, p_fecha date default current_date, p_nota text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_venta_id uuid; v_total numeric := 0; v_costo numeric := 0; v_linea jsonb;
begin
  if not app.tiene_permiso('ventas.crear') then raise exception 'MG403: sin permiso'; end if;
  if app.dia_cerrado(p_fecha) then raise exception 'MG423: el día ya está cerrado, reábrelo para editar'; end if;

  insert into public.refrigerio_ventas (fecha, total, costo_total, ganancia, nota, usuario_id)
  values (p_fecha, 0, 0, 0, p_nota, app.usuario_actual())
  returning id into v_venta_id;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    insert into public.refrigerio_venta_lineas (venta_id, refrigerio_id, nombre, cantidad, precio, costo, importe)
    select v_venta_id, r.id, r.nombre, (v_linea->>'cantidad')::numeric, r.precio, r.costo,
           r.precio * (v_linea->>'cantidad')::numeric
    from public.refrigerios r where r.id = (v_linea->>'refrigerio_id')::uuid;

    v_total := v_total + (select precio * (v_linea->>'cantidad')::numeric from public.refrigerios where id = (v_linea->>'refrigerio_id')::uuid);
    v_costo := v_costo + (select costo * (v_linea->>'cantidad')::numeric from public.refrigerios where id = (v_linea->>'refrigerio_id')::uuid);
  end loop;

  update public.refrigerio_ventas set total = v_total, costo_total = v_costo, ganancia = v_total - v_costo where id = v_venta_id;
  return jsonb_build_object('ok', true, 'id', v_venta_id, 'total', v_total);
end;
$$;

create or replace function public.gasto_guardar(p_concepto text, p_importe numeric, p_moneda text, p_categoria text default null, p_fecha date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('gastos.registrar') then raise exception 'MG403: sin permiso'; end if;
  if app.dia_cerrado(p_fecha) then raise exception 'MG423: el día ya está cerrado, reábrelo para editar'; end if;
  insert into public.gastos (fecha, moneda, importe, categoria, concepto, usuario_id)
  values (p_fecha, p_moneda, p_importe, p_categoria, p_concepto, app.usuario_actual())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ============================================================
-- Usuarios reales (novia, gestores) — el dueño los crea desde la app
-- ============================================================
create function public.usuario_crear(p_email text, p_password text, p_nombre text, p_rol text)
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

  update public.usuarios set rol = p_rol, nombre = p_nombre where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create function public.usuarios_lista()
returns table(id uuid, nombre text, rol text, rol_nombre text, activo boolean, correo text)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.nombre, u.rol, r.nombre, u.activo, au.email
  from public.usuarios u join public.roles r on r.codigo = u.rol join auth.users au on au.id = u.id
  where app.tiene_permiso('usuarios.administrar')
  order by u.creado_en;
$$;

create function public.usuario_activo_fijar(p_id uuid, p_activo boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not app.tiene_permiso('usuarios.administrar') then raise exception 'MG403: sin permiso'; end if;
  update public.usuarios set activo = p_activo where id = p_id;
  return jsonb_build_object('ok', true);
end; $$;

-- ============================================================
-- panel_resumen v2: suma comisiones/socios/mensajería pendientes al resumen
-- ============================================================
create or replace function public.panel_resumen(p_desde date default date_trunc('month', current_date)::date, p_hasta date default current_date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_matriculas jsonb; v_nevera jsonb; v_vitrina jsonb; v_gastos jsonb;
begin
  if not app.tiene_permiso('contabilidad.ver') then raise exception 'MG403: sin permiso'; end if;
  v_matriculas := public.matriculas_panel(p_desde, p_hasta);
  v_nevera := public.refrigerios_panel(p_desde, p_hasta);
  v_vitrina := public.vitrina_panel(p_desde, p_hasta);
  v_gastos := public.gastos_panel(p_desde, p_hasta);

  return jsonb_build_object(
    'cup', jsonb_build_object(
      'matriculas', v_matriculas->'total',
      'nevera_ventas', v_nevera->'total',
      'nevera_ganancia', v_nevera->'ganancia',
      'gastos', v_gastos->'cup',
      'neto', (v_matriculas->>'total')::numeric + (v_nevera->>'ganancia')::numeric - (v_gastos->>'cup')::numeric
    ),
    'usd', jsonb_build_object(
      'vitrina_ventas', v_vitrina->'total',
      'vitrina_ganancia', v_vitrina->'ganancia',
      'gastos', v_gastos->'usd',
      'neto', (v_vitrina->>'ganancia')::numeric - (v_gastos->>'usd')::numeric
    ),
    'fiados_pendientes', v_vitrina->'fiados_pendientes',
    'comisiones_pendientes', (select coalesce(sum(comision_gestor),0) from public.ventas where comision_pagada_en is null and estado='confirmada'),
    'mensajeria_pendiente', (select coalesce(sum(monto_a_rendir),0) from public.ventas where es_mensajeria and mensajeria_rendida_en is null and estado='confirmada'),
    'socios_pendientes', (select coalesce(sum(ganancia_socio_linea),0) from public.venta_lineas where socio_pagado_en is null),
    'dia_cerrado_hoy', app.dia_cerrado(current_date)
  );
end;
$$;

-- ============================================================
-- Limpieza: borrar las versiones viejas de las funciones que se
-- extendieron arriba. create or replace no las reemplaza cuando
-- cambia la lista de parámetros — crea una sobrecarga nueva y deja
-- la vieja viva, saltándose las reglas nuevas (cierre del día, etc).
-- ============================================================
drop function if exists public.venta_crear(jsonb, text, text, boolean);
drop function if exists public.producto_guardar(uuid, text, numeric, numeric, numeric, text, uuid);

-- ============================================================
-- Permisos de ejecución
-- ============================================================
revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.crear_usuario_desde_auth() from anon, authenticated;
revoke execute on function public.mi_perfil() from anon;
revoke execute on function public.matricula_dia_guardar(date, integer, numeric, boolean) from anon;
revoke execute on function public.refrigerio_guardar(uuid, text, numeric, numeric, text) from anon;
revoke execute on function public.refrigerio_venta_guardar(jsonb, date, text) from anon;
revoke execute on function public.producto_guardar(uuid, text, numeric, numeric, numeric, text, uuid, uuid, numeric) from anon;
revoke execute on function public.venta_crear(jsonb, text, text, boolean, uuid, boolean, uuid) from anon;
revoke execute on function public.fiado_cobrar(uuid) from anon;
revoke execute on function public.gasto_guardar(text, numeric, text, text, date) from anon;
revoke execute on function public.gastos_lista(date, date) from anon;
revoke execute on function public.panel_resumen(date, date) from anon;
revoke execute on function public.fiados_lista() from anon;
revoke execute on function public.productos_lista() from anon;
revoke execute on function public.refrigerios_lista() from anon;
revoke execute on function public.gastos_panel(date, date) from anon;
revoke execute on function public.refrigerios_panel(date, date) from anon;
revoke execute on function public.vitrina_panel(date, date) from anon;
revoke execute on function public.gestores_lista() from anon;
revoke execute on function public.gestor_guardar(uuid, text, numeric, text) from anon;
revoke execute on function public.mensajeros_lista() from anon;
revoke execute on function public.mensajero_guardar(uuid, text, text) from anon;
revoke execute on function public.comisiones_pendientes() from anon;
revoke execute on function public.comision_pagar(uuid) from anon;
revoke execute on function public.mensajeros_pendientes() from anon;
revoke execute on function public.mensajero_rendir(uuid) from anon;
revoke execute on function public.socios_lista() from anon;
revoke execute on function public.socio_guardar(uuid, text, text) from anon;
revoke execute on function public.socios_pendientes() from anon;
revoke execute on function public.socio_pagar(uuid) from anon;
revoke execute on function public.cierre_crear(date) from anon;
revoke execute on function public.cierre_reabrir(date) from anon;
revoke execute on function public.cierres_lista(date, date) from anon;
revoke execute on function public.usuario_crear(text, text, text, text) from anon, authenticated;
grant execute on function public.usuario_crear(text, text, text, text) to authenticated;
revoke execute on function public.usuarios_lista() from anon;
revoke execute on function public.usuario_activo_fijar(uuid, boolean) from anon;
