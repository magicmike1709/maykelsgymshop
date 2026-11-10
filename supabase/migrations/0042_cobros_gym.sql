-- ============================================================
-- Cobros del gym desde el panel
--
--  1. Precio de la matrícula en USD y tasa de cobro con "vigente desde".
--  2. Cada cobro se desglosa en efectivo CUP, transferencia CUP y
--     efectivo USD, con caso social, quién cobró y la tasa usada.
--  3. Dos fechas por cliente: la fecha de cobro (la pone quien cobra)
--     y la fecha oficial (la del dueño, que viene de MobiDB o se edita
--     en el panel). El vencimiento cuenta desde la oficial.
--  4. Importador de MobiDB que SOLO actualiza fechas oficiales (no crea
--     pagos ni mueve dinero) con la regla de 5 días.
--  5. Rol "Cobrador" (recepción) con permisos propios.
--  6. Anular cobros (solo dueño), caja del gym por moneda y conteo.
--
-- Todo es aditivo: no se borra ni se reescribe ningún pago existente.
-- Los pagos viejos (sin desglose) se leen como "todo efectivo CUP".
-- ============================================================

-- ------------------------------------------------------------
-- 0. Utilidades
-- ------------------------------------------------------------
create or replace function app.hoy_cuba()
returns date language sql stable as $$
  select (now() at time zone 'America/Havana')::date;
$$;

-- ------------------------------------------------------------
-- 1. Permisos y rol Cobrador
-- ------------------------------------------------------------
insert into public.permisos (codigo, grupo, descripcion, orden) values
  ('gym.cobrar', 'Gym', 'Cobrar matrículas, registrar clientes y consultar la lista del gym', 10),
  ('gym.anular', 'Gym', 'Anular cobros del gym y ver días anteriores', 11),
  ('gym.configurar', 'Gym', 'Fijar precio en USD, tasa de cobro y fechas oficiales', 12)
on conflict (codigo) do nothing;

insert into public.roles (codigo, nombre, descripcion, orden) values
  ('cobrador', 'Cobrador', 'Recepción: cobra matrículas y registra clientes del gym', 6)
on conflict (codigo) do nothing;

insert into public.rol_permisos (rol, permiso) values
  ('admin', 'gym.cobrar'), ('admin', 'gym.anular'), ('admin', 'gym.configurar'),
  ('cobrador', 'gym.cobrar')
on conflict do nothing;

-- El admin puede crear usuarios con el rol nuevo.
create or replace function public.usuario_crear(p_email text, p_password text, p_nombre text, p_rol text)
returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('usuarios.administrar') then raise exception 'MG403: sin permiso'; end if;
  if p_rol not in ('admin','operador_plus','operador','mensajero','lectura','cobrador') then
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
-- 2. Columnas nuevas
-- ------------------------------------------------------------
alter table public.cliente_visitas
  add column efectivo_cup numeric check (efectivo_cup >= 0),
  add column transferencia_cup numeric check (transferencia_cup >= 0),
  add column efectivo_usd numeric check (efectivo_usd >= 0),
  add column tasa numeric check (tasa > 0),
  add column precio_usd numeric check (precio_usd >= 0),
  add column caso_social boolean not null default false,
  add column entrenador_cobro text,
  add column cobrado_por uuid references public.usuarios(id),
  add column cobrado_en timestamptz,
  add column op_id uuid;
create unique index ux_cliente_visitas_op on public.cliente_visitas(op_id) where op_id is not null;

alter table public.clientes_gym
  add column nacimiento date,
  add column notas text check (notas is null or char_length(notas) <= 1000),
  add column fecha_oficial date,
  add column fecha_oficial_origen text check (fecha_oficial_origen in ('mobidb', 'cobro', 'manual')),
  add column fecha_oficial_en timestamptz;

-- ------------------------------------------------------------
-- 3. Tablas nuevas
-- ------------------------------------------------------------
create table public.tasas_cobro (
  desde date primary key,
  tasa numeric not null check (tasa >= 10 and tasa <= 100000),
  tasa_mercado numeric check (tasa_mercado >= 10 and tasa_mercado <= 100000),
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);
alter table public.tasas_cobro enable row level security;

create table public.fechas_oficiales_hist (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.clientes_gym(id) on delete cascade,
  fecha_anterior date,
  origen_anterior text,
  fecha_nueva date,
  origen text not null,
  nota text,
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);
create index ix_fechas_oficiales_hist_cliente on public.fechas_oficiales_hist(cliente_id, creado_en desc);
alter table public.fechas_oficiales_hist enable row level security;

-- Un cobro anulado sale de cliente_visitas (así todo lo que ya existe,
-- vencimientos, estadísticas y dinero del día, deja de contarlo solo) y
-- queda aquí, completo, con quién lo anuló y por qué.
create table public.cobros_anulados (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null,
  cliente_id uuid not null,
  fecha date not null,
  monto numeric,
  datos jsonb not null,
  motivo text not null check (btrim(motivo) <> ''),
  anulado_por uuid references public.usuarios(id),
  anulado_en timestamptz not null default now()
);
alter table public.cobros_anulados enable row level security;

create table public.gym_caja_conteos (
  dia date primary key,
  contado_cup numeric not null check (contado_cup >= 0),
  contado_usd numeric not null check (contado_usd >= 0),
  usuario_id uuid references public.usuarios(id),
  actualizado_en timestamptz not null default now()
);
alter table public.gym_caja_conteos enable row level security;

revoke all on table public.tasas_cobro, public.fechas_oficiales_hist, public.cobros_anulados, public.gym_caja_conteos from anon, authenticated;

-- tasas_cobro no tiene columna id (su clave es la fecha), así que lleva su propio registro.
create or replace function app.registrar_actividad_tasa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.actividad (usuario_id, tabla, accion, registro_id, datos)
  values (app.usuario_actual(), 'tasas_cobro', TG_OP,
          (case when TG_OP = 'DELETE' then old.desde else new.desde end)::text,
          case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end);
  return null;
end;
$$;

create trigger tg_actividad_tasas after insert or update or delete on public.tasas_cobro
  for each row execute function app.registrar_actividad_tasa();
create trigger tg_actividad_anulados after insert on public.cobros_anulados
  for each row execute function app.registrar_actividad();
-- Solo los cobros hechos desde el panel (no las importaciones antiguas) dejan rastro en Actividad.
create trigger tg_actividad_visitas after insert on public.cliente_visitas
  for each row when (new.cobrado_por is not null) execute function app.registrar_actividad();

-- ------------------------------------------------------------
-- 4. Configuración
-- ------------------------------------------------------------
insert into public.configuracion (clave, valor) values
  ('precio_matricula_usd', '10'),
  ('gym_cobros_desde', '')
on conflict (clave) do nothing;

create or replace function app.tasa_vigente(p_fecha date)
returns numeric language sql stable security definer set search_path = public as $$
  select tasa from public.tasas_cobro where desde <= p_fecha order by desde desc limit 1;
$$;

create or replace function app.precio_usd()
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(nullif((select valor from public.configuracion where clave = 'precio_matricula_usd'), '')::numeric, 10);
$$;

create or replace function public.gym_config()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_hoy date := app.hoy_cuba(); v_t record;
begin
  if not app.tiene_permiso('gym.cobrar') then raise exception 'MG403: sin permiso'; end if;
  select * into v_t from public.tasas_cobro where desde <= v_hoy order by desde desc limit 1;
  return jsonb_build_object(
    'hoy', v_hoy,
    'precio_usd', app.precio_usd(),
    'tasa', v_t.tasa,
    'tasa_desde', v_t.desde,
    'tasa_mercado', v_t.tasa_mercado,
    'precio_cup_sugerido', case when v_t.tasa is null then null else round(app.precio_usd() * v_t.tasa) end,
    'precio_cup_antiguo', app.config_num('precio_matricula', 5000),
    'ciclo_dias', app.config_num('ciclo_dias', 30)::int,
    'cobros_desde', nullif((select valor from public.configuracion where clave = 'gym_cobros_desde'), ''),
    'entrenadores', coalesce((
      select jsonb_agg(e.entrenador order by e.n desc)
      from (select entrenador, count(*) n from public.clientes_gym where coalesce(entrenador, '') <> '' group by entrenador) e
    ), '[]'::jsonb),
    'tasas', case when app.tiene_permiso('gym.configurar') then coalesce((
      select jsonb_agg(jsonb_build_object('desde', t.desde, 'tasa', t.tasa, 'tasa_mercado', t.tasa_mercado) order by t.desde desc)
      from (select * from public.tasas_cobro order by desde desc limit 12) t
    ), '[]'::jsonb) else null end
  );
end;
$$;

create or replace function public.gym_config_fijar(p_precio_usd numeric default null, p_ciclo_dias integer default null, p_cobros_desde date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.tiene_permiso('gym.configurar') then raise exception 'MG403: sin permiso'; end if;
  if p_precio_usd is not null then
    if p_precio_usd <= 0 or p_precio_usd > 1000 then raise exception 'MG422: el precio en USD debe estar entre 0 y 1000'; end if;
    insert into public.configuracion (clave, valor) values ('precio_matricula_usd', p_precio_usd::text)
    on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
  end if;
  if p_ciclo_dias is not null then
    if p_ciclo_dias < 1 or p_ciclo_dias > 90 then raise exception 'MG422: el ciclo debe ser de 1 a 90 días'; end if;
    insert into public.configuracion (clave, valor) values ('ciclo_dias', p_ciclo_dias::text)
    on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
  end if;
  if p_cobros_desde is not null then
    insert into public.configuracion (clave, valor) values ('gym_cobros_desde', p_cobros_desde::text)
    on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.gym_tasa_fijar(p_desde date, p_tasa numeric, p_tasa_mercado numeric default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_hoy date := app.hoy_cuba();
begin
  if not app.tiene_permiso('gym.configurar') then raise exception 'MG403: sin permiso'; end if;
  if p_desde is null then raise exception 'MG422: falta la fecha desde la que vale la tasa'; end if;
  if p_desde < v_hoy - 30 then raise exception 'MG422: la tasa no puede empezar hace más de 30 días'; end if;
  if p_desde > v_hoy + 30 then raise exception 'MG422: la tasa no puede empezar dentro de más de 30 días'; end if;
  if p_tasa is null or p_tasa < 10 or p_tasa > 100000 then raise exception 'MG422: tasa fuera de rango (10 a 100.000 CUP por USD)'; end if;
  insert into public.tasas_cobro (desde, tasa, tasa_mercado, usuario_id)
  values (p_desde, p_tasa, p_tasa_mercado, app.usuario_actual())
  on conflict (desde) do update set tasa = excluded.tasa, tasa_mercado = excluded.tasa_mercado, usuario_id = excluded.usuario_id, creado_en = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.gym_tasa_borrar(p_desde date)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.tiene_permiso('gym.configurar') then raise exception 'MG403: sin permiso'; end if;
  delete from public.tasas_cobro where desde = p_desde;
  return jsonb_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- 5. Fecha oficial
-- ------------------------------------------------------------
create or replace function app.fecha_oficial_poner(p_cliente uuid, p_fecha date, p_origen text, p_nota text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_f date; v_o text;
begin
  select fecha_oficial, fecha_oficial_origen into v_f, v_o from public.clientes_gym where id = p_cliente;
  if v_f is not distinct from p_fecha and v_o is not distinct from p_origen then return; end if;
  update public.clientes_gym
     set fecha_oficial = p_fecha, fecha_oficial_origen = p_origen, fecha_oficial_en = now(), actualizado_en = now()
   where id = p_cliente;
  insert into public.fechas_oficiales_hist (cliente_id, fecha_anterior, origen_anterior, fecha_nueva, origen, nota, usuario_id)
  values (p_cliente, v_f, v_o, p_fecha, p_origen, p_nota, app.usuario_actual());
end;
$$;

-- Fecha base para contar el vencimiento: la oficial y, si no hay, el último pago.
create or replace function app.fecha_base_cliente(p_cliente uuid)
returns date language sql stable security definer set search_path = public as $$
  select coalesce(c.fecha_oficial, (select max(v.fecha) from public.cliente_visitas v where v.cliente_id = c.id))
  from public.clientes_gym c where c.id = p_cliente;
$$;

create or replace function public.gym_fecha_oficial_fijar(p_cliente_id uuid, p_fecha date, p_nota text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.tiene_permiso('gym.configurar') then raise exception 'MG403: sin permiso'; end if;
  if not exists (select 1 from public.clientes_gym where id = p_cliente_id) then raise exception 'MG404: cliente no encontrado'; end if;
  if p_fecha is null then raise exception 'MG422: falta la fecha'; end if;
  if p_fecha < date '2024-01-01' or p_fecha > app.hoy_cuba() + 60 then raise exception 'MG422: fecha oficial fuera de rango'; end if;
  perform app.fecha_oficial_poner(p_cliente_id, p_fecha, 'manual', p_nota);
  return jsonb_build_object('ok', true, 'fecha_oficial', p_fecha,
    'vence', p_fecha + app.config_num('ciclo_dias', 30)::int);
end;
$$;

create or replace function public.gym_fecha_oficial_historial(p_cliente_id uuid)
returns table(creado_en timestamptz, fecha_anterior date, fecha_nueva date, origen text, nota text, usuario text)
language sql stable security definer set search_path = public as $$
  select h.creado_en, h.fecha_anterior, h.fecha_nueva, h.origen, h.nota, u.nombre
  from public.fechas_oficiales_hist h left join public.usuarios u on u.id = h.usuario_id
  where h.cliente_id = p_cliente_id and app.tiene_permiso('gym.configurar')
  order by h.creado_en desc limit 30;
$$;

-- ------------------------------------------------------------
-- 6. Buscar clientes y vencimientos (para quien cobra)
-- ------------------------------------------------------------
create or replace function app.estado_vencimiento(p_dias integer, p_ciclo integer)
returns text language sql immutable as $$
  select case
    when p_dias is null then 'sin_pagos'
    when p_dias > p_ciclo + 15 then 'inactivo'
    when p_dias > p_ciclo then 'vencido'
    when p_ciclo - p_dias <= 5 then 'por_vencer'
    else 'al_dia' end;
$$;

create or replace function public.gym_clientes_buscar(p_busqueda text, p_limite integer default 25)
returns table(
  id uuid, nombre text, telefono text, sexo text, entrenador text, nacimiento date, notas text,
  fecha_oficial date, oficial_origen text, ultimo_cobro date, ultimo_monto numeric,
  base date, vence date, dias integer, restante integer, estado text, cobro_hoy boolean, total_pagos bigint
)
language sql stable security definer set search_path = public as $$
  with q as (
    select app.nombre_clave(p_busqueda) k, regexp_replace(coalesce(p_busqueda, ''), '\D', '', 'g') d
  ), cfg as (
    select app.config_num('ciclo_dias', 30)::int ciclo, app.hoy_cuba() hoy
  ), cand as (
    select c.*,
      (select max(v.fecha) from public.cliente_visitas v where v.cliente_id = c.id) ult
    from public.clientes_gym c, q
    where app.tiene_permiso('gym.cobrar')
      and length(btrim(coalesce(p_busqueda, ''))) >= 2
      and (
        (q.k <> '' and not exists (
           select 1 from unnest(string_to_array(q.k, ' ')) w
           where w <> '' and app.nombre_clave(c.nombre) not like '%' || w || '%'))
        or (length(q.d) >= 3 and c.telefono like '%' || q.d || '%')
      )
  )
  select b.id, b.nombre, b.telefono, b.sexo, b.entrenador, b.nacimiento, b.notas,
    b.fecha_oficial, b.fecha_oficial_origen, b.ult,
    (select v.monto from public.cliente_visitas v where v.cliente_id = b.id and v.fecha = b.ult limit 1),
    coalesce(b.fecha_oficial, b.ult),
    (coalesce(b.fecha_oficial, b.ult) + cfg.ciclo),
    (cfg.hoy - coalesce(b.fecha_oficial, b.ult))::int,
    (cfg.ciclo - (cfg.hoy - coalesce(b.fecha_oficial, b.ult)))::int,
    app.estado_vencimiento((cfg.hoy - coalesce(b.fecha_oficial, b.ult))::int, cfg.ciclo),
    exists (select 1 from public.cliente_visitas v where v.cliente_id = b.id and v.fecha = cfg.hoy and v.monto is not null),
    (select count(*) from public.cliente_visitas v where v.cliente_id = b.id)
  from cand b, cfg
  order by (app.nombre_clave(b.nombre) like (select k from q) || '%') desc, b.nombre
  limit least(greatest(coalesce(p_limite, 25), 1), 60);
$$;

create or replace function app.vencimientos_calc(p_dias_aviso integer, p_max_vencido integer)
returns table(id uuid, nombre text, telefono text, entrenador text, ultimo_pago date, vence date, dias integer,
              estado text, provisional boolean)
language sql stable security definer set search_path = public as $$
  with cfg as (select app.config_num('ciclo_dias', 30)::int ciclo, app.hoy_cuba() hoy)
  select c.id, c.nombre, c.telefono, c.entrenador,
    coalesce(c.fecha_oficial, u.ult) as base,
    (coalesce(c.fecha_oficial, u.ult) + cfg.ciclo) as vence,
    ((coalesce(c.fecha_oficial, u.ult) + cfg.ciclo) - cfg.hoy)::int as dias,
    case
      when (coalesce(c.fecha_oficial, u.ult) + cfg.ciclo) < cfg.hoy then 'vencido'
      when (coalesce(c.fecha_oficial, u.ult) + cfg.ciclo) = cfg.hoy then 'vence_hoy'
      else 'por_vencer' end,
    coalesce(c.fecha_oficial_origen = 'cobro', false)
  from public.clientes_gym c
  left join lateral (select max(v.fecha) ult from public.cliente_visitas v where v.cliente_id = c.id) u on true
  cross join cfg
  where coalesce(c.fecha_oficial, u.ult) is not null
    and (coalesce(c.fecha_oficial, u.ult) + cfg.ciclo) <= cfg.hoy + p_dias_aviso
    and (coalesce(c.fecha_oficial, u.ult) + cfg.ciclo) >= cfg.hoy - p_max_vencido
  order by (coalesce(c.fecha_oficial, u.ult) + cfg.ciclo);
$$;

-- Misma forma de siempre para el panel de Matrículas, pero contando desde la fecha oficial.
create or replace function public.clientes_vencimientos(p_dias_aviso integer default 7, p_max_dias_vencido integer default 45)
returns table(id uuid, nombre text, telefono text, entrenador text, ultimo_pago date, vence date, dias integer, estado text)
language sql stable security definer set search_path = public as $$
  select v.id, v.nombre, v.telefono, v.entrenador, v.ultimo_pago, v.vence, v.dias, v.estado
  from app.vencimientos_calc(p_dias_aviso, p_max_dias_vencido) v
  where app.tiene_permiso('matriculas.ver');
$$;

create or replace function public.gym_vencimientos(p_dias_aviso integer default 5, p_max_vencido integer default 45)
returns table(id uuid, nombre text, telefono text, entrenador text, base date, vence date, dias integer, estado text, provisional boolean)
language sql stable security definer set search_path = public as $$
  select * from app.vencimientos_calc(least(greatest(p_dias_aviso, 0), 30), least(greatest(p_max_vencido, 0), 400))
  where app.tiene_permiso('gym.cobrar');
$$;

-- ------------------------------------------------------------
-- 7. Cobrar
-- ------------------------------------------------------------
create or replace function public.gym_cobrar(
  p_cliente_id uuid,
  p_fecha date default null,
  p_efectivo_cup numeric default 0,
  p_transferencia_cup numeric default 0,
  p_efectivo_usd numeric default 0,
  p_caso_social boolean default false,
  p_entrenador text default null,
  p_op_id uuid default null,
  p_cobrado_en timestamptz default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hoy date := app.hoy_cuba();
  v_fecha date := coalesce(p_fecha, app.hoy_cuba());
  v_ef numeric := coalesce(p_efectivo_cup, 0);
  v_tr numeric := coalesce(p_transferencia_cup, 0);
  v_us numeric := coalesce(p_efectivo_usd, 0);
  v_tasa numeric;
  v_precio numeric := app.precio_usd();
  v_total numeric;
  v_sug numeric;
  v_nombre text;
  v_ent text := nullif(btrim(coalesce(p_entrenador, '')), '');
  v_prev record;
  v_id uuid;
  v_base date;
  v_oficial date;
  v_hay boolean;
begin
  if not app.tiene_permiso('gym.cobrar') then raise exception 'MG403: sin permiso'; end if;

  -- Reenviar el mismo cobro (por ejemplo tras cortarse la señal) no lo duplica.
  if p_op_id is not null then
    select * into v_prev from public.cliente_visitas where op_id = p_op_id;
    if found then
      return jsonb_build_object('ok', true, 'repetido', true, 'id', v_prev.id, 'monto', v_prev.monto);
    end if;
  end if;

  if v_ef < 0 or v_tr < 0 or v_us < 0 then raise exception 'MG422: los montos no pueden ser negativos'; end if;
  if v_fecha > v_hoy then raise exception 'MG422: la fecha del cobro no puede ser futura'; end if;
  if v_fecha < v_hoy - 3 and not app.tiene_permiso('gym.anular') then
    raise exception 'MG422: solo se puede cobrar con fecha de hoy o de los últimos 3 días';
  end if;
  if v_fecha < v_hoy - 400 then raise exception 'MG422: fecha demasiado antigua'; end if;
  if app.dia_cerrado(v_fecha) then raise exception 'MG423: el día % ya está cerrado, el dueño tiene que reabrirlo', to_char(v_fecha, 'DD/MM/YYYY'); end if;

  select nombre into v_nombre from public.clientes_gym where id = p_cliente_id;
  if v_nombre is null then raise exception 'MG404: cliente no encontrado'; end if;

  v_tasa := app.tasa_vigente(v_fecha);
  if v_us > 0 and v_tasa is null then
    raise exception 'MG422: no hay tasa de cobro vigente. El dueño debe fijarla antes de cobrar en dólares';
  end if;

  v_total := v_ef + v_tr + round(v_us * coalesce(v_tasa, 0));
  if v_total = 0 and not coalesce(p_caso_social, false) then
    raise exception 'MG422: escribe lo que pagó (o marca caso social si no pagó)';
  end if;

  if v_tasa is not null then
    v_sug := round(v_precio * v_tasa);
    if v_sug > 0 and v_total > v_sug * 10 then
      raise exception 'MG422: % CUP es más de 10 veces el precio normal (% CUP). Revisa los ceros', v_total, v_sug;
    end if;
  end if;

  select * into v_prev from public.cliente_visitas where cliente_id = p_cliente_id and fecha = v_fecha;
  v_hay := found;
  if v_hay and v_prev.monto is not null then
    raise exception 'MG409: % ya tiene un cobro registrado el %. Si hubo un error, el dueño puede anularlo', v_nombre, to_char(v_fecha, 'DD/MM/YYYY');
  end if;

  v_base := app.fecha_base_cliente(p_cliente_id);

  begin
    if v_hay then
      update public.cliente_visitas set
        monto = v_total, efectivo_cup = v_ef, transferencia_cup = v_tr, efectivo_usd = v_us,
        tasa = v_tasa, precio_usd = v_precio, caso_social = coalesce(p_caso_social, false),
        entrenador_cobro = v_ent, cobrado_por = app.usuario_actual(), cobrado_en = coalesce(p_cobrado_en, now()), op_id = p_op_id
      where id = v_prev.id returning id into v_id;
    else
      insert into public.cliente_visitas (
        cliente_id, fecha, monto, efectivo_cup, transferencia_cup, efectivo_usd, tasa, precio_usd,
        caso_social, entrenador_cobro, cobrado_por, cobrado_en, op_id)
      values (
        p_cliente_id, v_fecha, v_total, v_ef, v_tr, v_us, v_tasa, v_precio,
        coalesce(p_caso_social, false), v_ent, app.usuario_actual(), coalesce(p_cobrado_en, now()), p_op_id)
      returning id into v_id;
    end if;
  exception when unique_violation then
    raise exception 'MG409: % ya tiene un cobro registrado el %', v_nombre, to_char(v_fecha, 'DD/MM/YYYY');
  end;

  if v_ent is not null then
    update public.clientes_gym set entrenador = v_ent, actualizado_en = now() where id = p_cliente_id;
  end if;

  -- Fecha oficial provisional: el cobro la adelanta hasta que llegue la de MobiDB.
  if v_base is null or v_fecha > v_base then
    perform app.fecha_oficial_poner(p_cliente_id, v_fecha, 'cobro', 'cobro del ' || to_char(v_fecha, 'DD/MM/YYYY'));
  end if;
  select fecha_oficial into v_oficial from public.clientes_gym where id = p_cliente_id;

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'nombre', v_nombre, 'monto', v_total,
    'usd_equivalente', case when v_tasa is null then null else round(v_total / v_tasa, 2) end,
    'tasa', v_tasa, 'fecha', v_fecha, 'fecha_oficial', v_oficial,
    'vence', v_oficial + app.config_num('ciclo_dias', 30)::int,
    'fuera_de_precio', (v_sug is not null and v_total <> v_sug and not coalesce(p_caso_social, false)));
end;
$$;

-- Crear cliente (con aviso si ya existe uno parecido) y, si se quiere, cobrarle en la misma operación.
create or replace function public.gym_cliente_crear(
  p_nombre text, p_telefono text default null, p_sexo text default null, p_entrenador text default null,
  p_nacimiento date default null, p_notas text default null, p_forzar boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_nombre text := nullif(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), '');
  v_tel text := nullif(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), '');
  v_otro record; v_id uuid; v_tel_libre boolean := true;
begin
  if not app.tiene_permiso('gym.cobrar') then raise exception 'MG403: sin permiso'; end if;
  if v_nombre is null then raise exception 'MG422: escribe el nombre del cliente'; end if;
  if v_tel is not null and (length(v_tel) < 7 or length(v_tel) > 12) then
    raise exception 'MG422: el teléfono debe tener entre 7 y 12 dígitos (o déjalo vacío)';
  end if;
  if p_nacimiento is not null and (p_nacimiento > app.hoy_cuba() or p_nacimiento < date '1920-01-01') then
    raise exception 'MG422: fecha de nacimiento inválida';
  end if;

  if not coalesce(p_forzar, false) then
    select id, nombre, telefono into v_otro from public.clientes_gym
     where (v_tel is not null and telefono = v_tel) or app.nombre_clave(nombre) = app.nombre_clave(v_nombre)
     order by (telefono = v_tel) desc nulls last limit 1;
    if found then
      raise exception 'MG409: ya existe "%"%. Si es la misma persona, búscala y cóbrale ahí', v_otro.nombre,
        case when v_otro.telefono is not null then ' (' || v_otro.telefono || ')' else '' end;
    end if;
  end if;

  -- si el teléfono ya es de otra persona (forzado) la ficha nueva se crea sin teléfono
  if v_tel is not null and exists (select 1 from public.clientes_gym where telefono = v_tel) then v_tel_libre := false; end if;

  insert into public.clientes_gym (nombre, telefono, sexo, entrenador, nacimiento, notas)
  values (v_nombre, case when v_tel_libre then v_tel end, nullif(btrim(coalesce(p_sexo, '')), ''),
          nullif(btrim(coalesce(p_entrenador, '')), ''), p_nacimiento, nullif(btrim(coalesce(p_notas, '')), ''))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'telefono_de_otro', not v_tel_libre);
end;
$$;

create or replace function public.gym_cliente_nuevo_cobrar(
  p_nombre text, p_telefono text, p_sexo text, p_entrenador text, p_nacimiento date,
  p_efectivo_cup numeric, p_transferencia_cup numeric, p_efectivo_usd numeric, p_caso_social boolean,
  p_forzar boolean default false, p_op_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_c jsonb; v_p jsonb;
begin
  v_c := public.gym_cliente_crear(p_nombre, p_telefono, p_sexo, p_entrenador, p_nacimiento, null, p_forzar);
  v_p := public.gym_cobrar((v_c->>'id')::uuid, null, p_efectivo_cup, p_transferencia_cup, p_efectivo_usd,
                           p_caso_social, p_entrenador, p_op_id, null);
  return v_p || jsonb_build_object('cliente_id', v_c->'id', 'telefono_de_otro', v_c->'telefono_de_otro');
end;
$$;

create or replace function public.gym_cliente_editar(
  p_id uuid, p_nombre text, p_telefono text default null, p_sexo text default null, p_entrenador text default null,
  p_nacimiento date default null, p_notas text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tel text := nullif(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), ''); v_otro text;
begin
  if not app.tiene_permiso('gym.cobrar') then raise exception 'MG403: sin permiso'; end if;
  if coalesce(btrim(p_nombre), '') = '' then raise exception 'MG422: el nombre no puede quedar vacío'; end if;
  if not exists (select 1 from public.clientes_gym where id = p_id) then raise exception 'MG404: cliente no encontrado'; end if;
  if v_tel is not null and (length(v_tel) < 7 or length(v_tel) > 12) then
    raise exception 'MG422: el teléfono debe tener entre 7 y 12 dígitos (o déjalo vacío)';
  end if;
  if v_tel is not null then
    select nombre into v_otro from public.clientes_gym where telefono = v_tel and id <> p_id;
    if v_otro is not null then raise exception 'MG409: ese teléfono ya es de %. Si son la misma persona, avisa al dueño para unir las fichas', v_otro; end if;
  end if;
  if p_nacimiento is not null and (p_nacimiento > app.hoy_cuba() or p_nacimiento < date '1920-01-01') then
    raise exception 'MG422: fecha de nacimiento inválida';
  end if;
  update public.clientes_gym set
    nombre = btrim(p_nombre), telefono = v_tel, sexo = nullif(btrim(coalesce(p_sexo, '')), ''),
    entrenador = nullif(btrim(coalesce(p_entrenador, '')), ''), nacimiento = p_nacimiento,
    notas = nullif(btrim(coalesce(p_notas, '')), ''), actualizado_en = now()
  where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- 8. Anular un cobro (solo dueño)
-- ------------------------------------------------------------
create or replace function public.gym_cobro_anular(p_visita_id uuid, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v record; v_h record; v_hay boolean;
begin
  if not app.tiene_permiso('gym.anular') then raise exception 'MG403: sin permiso'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'MG422: escribe el motivo de la anulación'; end if;
  select * into v from public.cliente_visitas where id = p_visita_id;
  if not found then raise exception 'MG404: ese cobro no existe (¿ya estaba anulado?)'; end if;
  if app.dia_cerrado(v.fecha) then raise exception 'MG423: el día % ya está cerrado, reábrelo para anular', to_char(v.fecha, 'DD/MM/YYYY'); end if;

  insert into public.cobros_anulados (visita_id, cliente_id, fecha, monto, datos, motivo, anulado_por)
  values (v.id, v.cliente_id, v.fecha, v.monto, to_jsonb(v), btrim(p_motivo), app.usuario_actual());

  delete from public.cliente_visitas where id = v.id;   -- el trigger rehace el dinero del día

  -- Si ese cobro había movido la fecha oficial, vuelve a como estaba.
  select * into v_h from public.fechas_oficiales_hist
   where cliente_id = v.cliente_id and origen = 'cobro' and fecha_nueva = v.fecha
   order by creado_en desc limit 1;
  v_hay := found;
  if v_hay and (select fecha_oficial_origen from public.clientes_gym where id = v.cliente_id) = 'cobro'
     and (select fecha_oficial from public.clientes_gym where id = v.cliente_id) = v.fecha then
    if v_h.fecha_anterior is not null then
      perform app.fecha_oficial_poner(v.cliente_id, v_h.fecha_anterior, coalesce(v_h.origen_anterior, 'mobidb'), 'cobro anulado: ' || btrim(p_motivo));
    else
      update public.clientes_gym set fecha_oficial = null, fecha_oficial_origen = null, fecha_oficial_en = now() where id = v.cliente_id;
      insert into public.fechas_oficiales_hist (cliente_id, fecha_anterior, origen_anterior, fecha_nueva, origen, nota, usuario_id)
      values (v.cliente_id, v.fecha, 'cobro', null, 'manual', 'cobro anulado: ' || btrim(p_motivo), app.usuario_actual());
    end if;
  end if;

  return jsonb_build_object('ok', true, 'monto', v.monto);
end;
$$;

-- ------------------------------------------------------------
-- 9. Caja del gym por moneda, resumen y conteo
-- ------------------------------------------------------------
-- Efectivo CUP de un día: lo que debería haber en la gaveta en pesos.
create or replace function app.gym_efectivo_cup_dia(p_dia date)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(
    case when v.efectivo_cup is null and v.transferencia_cup is null and v.efectivo_usd is null
         then v.monto else coalesce(v.efectivo_cup, 0) end), 0)
  from public.cliente_visitas v where v.fecha = p_dia and v.monto is not null;
$$;

create or replace function public.gym_resumen_dia(p_dia date default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_dia date := coalesce(p_dia, app.hoy_cuba());
  v_r jsonb;
begin
  if not app.tiene_permiso('gym.cobrar') then raise exception 'MG403: sin permiso'; end if;
  if v_dia <> app.hoy_cuba() and not app.tiene_permiso('gym.anular') then
    raise exception 'MG403: solo el dueño ve días anteriores';
  end if;

  select jsonb_build_object(
    'dia', v_dia,
    'cobros', count(*) filter (where v.monto is not null),
    'efectivo_cup', coalesce(sum(case when v.efectivo_cup is null and v.transferencia_cup is null and v.efectivo_usd is null then v.monto else coalesce(v.efectivo_cup, 0) end), 0),
    'transferencia_cup', coalesce(sum(coalesce(v.transferencia_cup, 0)), 0),
    'efectivo_usd', coalesce(sum(coalesce(v.efectivo_usd, 0)), 0),
    'total_cup', coalesce(sum(v.monto), 0),
    'total_usd', coalesce(round(sum(v.monto / v.tasa) filter (where v.tasa is not null), 2), 0),
    'sin_tasa', count(*) filter (where v.monto is not null and v.tasa is null),
    'casos_sociales', count(*) filter (where v.caso_social)
  ) into v_r
  from public.cliente_visitas v where v.fecha = v_dia;

  return v_r || jsonb_build_object(
    'anulados', (select count(*) from public.cobros_anulados a where a.fecha = v_dia),
    'monto_anulado', (select coalesce(sum(a.monto), 0) from public.cobros_anulados a where a.fecha = v_dia),
    'conteo', (select jsonb_build_object('cup', k.contado_cup, 'usd', k.contado_usd) from public.gym_caja_conteos k where k.dia = v_dia),
    'lista', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'hora', coalesce(v.cobrado_en, v.creado_en), 'cliente_id', c.id, 'nombre', c.nombre, 'monto', v.monto,
        'efectivo_cup', case when v.efectivo_cup is null and v.transferencia_cup is null and v.efectivo_usd is null then v.monto else coalesce(v.efectivo_cup, 0) end,
        'transferencia_cup', coalesce(v.transferencia_cup, 0), 'efectivo_usd', coalesce(v.efectivo_usd, 0),
        'tasa', v.tasa, 'caso_social', v.caso_social, 'cobrador', u.nombre,
        'fuera_de_precio', (v.tasa is not null and v.precio_usd is not null and not v.caso_social and v.monto <> round(v.precio_usd * v.tasa)))
        order by coalesce(v.cobrado_en, v.creado_en) desc)
      from public.cliente_visitas v
      join public.clientes_gym c on c.id = v.cliente_id
      left join public.usuarios u on u.id = v.cobrado_por
      where v.fecha = v_dia and v.monto is not null
    ), '[]'::jsonb));
end;
$$;

create or replace function public.gym_caja_contar(p_dia date, p_contado_cup numeric, p_contado_usd numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_dia date := coalesce(p_dia, app.hoy_cuba()); v_esp_cup numeric; v_esp_usd numeric;
begin
  if not app.tiene_permiso('gym.cobrar') then raise exception 'MG403: sin permiso'; end if;
  if v_dia <> app.hoy_cuba() and not app.tiene_permiso('gym.anular') then raise exception 'MG403: solo el dueño cuenta días anteriores'; end if;
  if coalesce(p_contado_cup, -1) < 0 or coalesce(p_contado_usd, -1) < 0 then raise exception 'MG422: escribe lo contado en pesos y en dólares (0 si no hay)'; end if;
  insert into public.gym_caja_conteos (dia, contado_cup, contado_usd, usuario_id)
  values (v_dia, p_contado_cup, p_contado_usd, app.usuario_actual())
  on conflict (dia) do update set contado_cup = excluded.contado_cup, contado_usd = excluded.contado_usd,
    usuario_id = excluded.usuario_id, actualizado_en = now();
  select app.gym_efectivo_cup_dia(v_dia) into v_esp_cup;
  select coalesce(sum(efectivo_usd), 0) into v_esp_usd from public.cliente_visitas where fecha = v_dia and monto is not null;
  return jsonb_build_object('ok', true, 'esperado_cup', v_esp_cup, 'esperado_usd', v_esp_usd,
    'diferencia_cup', p_contado_cup - v_esp_cup, 'diferencia_usd', p_contado_usd - v_esp_usd);
end;
$$;

-- Resumen por periodo en CUP y en USD (para ver el crecimiento real aunque el peso se deprecie).
create or replace function public.gym_resumen_periodo(p_desde date, p_hasta date)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not app.tiene_permiso('gym.anular') then null else jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'cobros', count(*) filter (where v.monto is not null),
    'total_cup', coalesce(sum(v.monto), 0),
    'total_usd', coalesce(round(sum(v.monto / v.tasa) filter (where v.tasa is not null), 2), 0),
    'cobros_con_tasa', count(*) filter (where v.monto is not null and v.tasa is not null),
    'efectivo_cup', coalesce(sum(case when v.efectivo_cup is null and v.transferencia_cup is null and v.efectivo_usd is null then v.monto else coalesce(v.efectivo_cup, 0) end), 0),
    'transferencia_cup', coalesce(sum(coalesce(v.transferencia_cup, 0)), 0),
    'efectivo_usd', coalesce(sum(coalesce(v.efectivo_usd, 0)), 0),
    'casos_sociales', count(*) filter (where v.caso_social),
    'anulados', (select count(*) from public.cobros_anulados a where a.fecha between p_desde and p_hasta)
  ) end
  from public.cliente_visitas v where v.fecha between p_desde and p_hasta;
$$;

-- El cierre general cuenta en la gaveta solo el efectivo en pesos del gym
-- (las transferencias y los dólares tienen su propio conteo en el cuadre del gym).
create or replace function app.caja_esperada_dia(p_dia date)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare v_mat jsonb; v_nev jsonb; v_gas jsonb; v_gym numeric;
begin
  v_nev := public.refrigerios_panel(p_dia, p_dia);
  v_gas := public.gastos_panel(p_dia, p_dia);
  if exists (select 1 from public.cliente_visitas where fecha = p_dia and monto is not null) then
    v_gym := app.gym_efectivo_cup_dia(p_dia);
  else
    v_mat := public.matriculas_panel(p_dia, p_dia);
    v_gym := coalesce((v_mat->>'total')::numeric, 0);
  end if;
  return coalesce(v_gym, 0) + coalesce((v_nev->>'total')::numeric, 0) - coalesce((v_gas->>'cup')::numeric, 0);
end;
$$;

-- ------------------------------------------------------------
-- 10. Importar fechas oficiales desde MobiDB (solo fechas, nunca dinero)
--     Regla de los 5 días, comparando la fecha del CSV (O) con la fecha
--     oficial provisional que dejó el último cobro (H):
--       |O - H| <= 5            -> se queda la del CSV
--       CSV más viejo (> 5 d)   -> se queda la del cobro (el CSV está atrasado)
--       CSV más nuevo (> 5 d)   -> se queda la del CSV y se marca para revisar
--       fecha editada a mano    -> no se pisa; se reporta
-- ------------------------------------------------------------
create or replace function app.gym_buscar_cliente_importacion(p_nombre text, p_tel text)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid; v_dueno_id uuid; v_dueno_nombre text; v_tel_de_otro boolean := false;
begin
  if p_tel is not null then
    select id, nombre into v_dueno_id, v_dueno_nombre from public.clientes_gym where telefono = p_tel;
    if v_dueno_id is not null then
      if app.misma_persona(v_dueno_nombre, p_nombre) then return v_dueno_id; end if;
      v_tel_de_otro := true;
    end if;
  end if;
  select c.id into v_id from public.clientes_gym c
   where app.nombre_clave(c.nombre) = app.nombre_clave(p_nombre)
     and (p_tel is null or v_tel_de_otro or c.telefono is null or c.telefono = p_tel)
   order by (c.telefono is null) desc,
            (select max(v.fecha) from public.cliente_visitas v where v.cliente_id = c.id) desc nulls last
   limit 1;
  return v_id;
end;
$$;

create or replace function public.gym_fechas_importar(p_filas jsonb, p_aplicar boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_cid uuid; v_c record; v_base date; v_o date;
  v_d integer;
  v_corte date := nullif((select valor from public.configuracion where clave = 'gym_cobros_desde'), '')::date;
  v_invalidas integer := 0;
  v_conf jsonb := '[]'; v_host jsonb := '[]'; v_nueva jsonb := '[]'; v_sincobro jsonb := '[]';
  v_manual jsonb := '[]'; v_nuevos jsonb := '[]'; v_igual integer := 0; v_cambiadas integer := 0;
  v_sinact jsonb := '[]';
  v_item jsonb;
  v_vistos uuid[] := '{}';
begin
  if not app.tiene_permiso('gym.configurar') then raise exception 'MG403: sin permiso'; end if;
  if jsonb_typeof(p_filas) <> 'array' then raise exception 'MG422: el archivo no tiene filas'; end if;
  if jsonb_array_length(p_filas) > 5000 then raise exception 'MG422: demasiadas filas (máximo 5.000)'; end if;

  create temp table _imp (nombre text, tel text, fecha date, sexo text, ent text) on commit drop;

  for r in
    select nullif(regexp_replace(btrim(coalesce(x->>'nombre', '')), '\s+', ' ', 'g'), '') nombre,
           nullif(regexp_replace(coalesce(x->>'telefono', ''), '\D', '', 'g'), '') tel,
           case when (x->>'fecha') ~ '^\d{4}-\d{2}-\d{2}$' then (x->>'fecha')::date end fecha,
           nullif(btrim(coalesce(x->>'sexo', '')), '') sexo,
           nullif(btrim(coalesce(x->>'entrenador', '')), '') ent
    from jsonb_array_elements(p_filas) x
  loop
    if r.nombre is null or r.fecha is null or r.fecha < date '2023-01-01' or r.fecha > app.hoy_cuba() + 60 then
      v_invalidas := v_invalidas + 1;
    else
      insert into _imp values (r.nombre, r.tel, r.fecha, r.sexo, r.ent);
    end if;
  end loop;

  -- misma persona repetida en el archivo: se queda la fecha más nueva
  delete from _imp a using _imp b
   where app.nombre_clave(a.nombre) = app.nombre_clave(b.nombre) and coalesce(a.tel, '') = coalesce(b.tel, '')
     and (a.fecha < b.fecha or (a.fecha = b.fecha and a.ctid < b.ctid));

  for r in select * from _imp loop
    v_cid := app.gym_buscar_cliente_importacion(r.nombre, r.tel);
    v_o := r.fecha;

    if v_cid is null then
      v_nuevos := v_nuevos || jsonb_build_object('nombre', r.nombre, 'csv', v_o);
      if p_aplicar then
        insert into public.clientes_gym (nombre, telefono, sexo, entrenador)
        values (r.nombre,
                case when r.tel is not null and not exists (select 1 from public.clientes_gym where telefono = r.tel) then r.tel end,
                case r.sexo when 'H' then 'Hombre' when 'M' then 'Mujer' else r.sexo end, r.ent)
        returning id into v_cid;
        perform app.fecha_oficial_poner(v_cid, v_o, 'mobidb', 'importación MobiDB (cliente nuevo)');
        v_vistos := v_vistos || v_cid;
      end if;
      continue;
    end if;

    v_vistos := v_vistos || v_cid;
    select * into v_c from public.clientes_gym where id = v_cid;
    v_base := coalesce(v_c.fecha_oficial, (select max(v.fecha) from public.cliente_visitas v where v.cliente_id = v_cid));
    v_item := jsonb_build_object('id', v_cid, 'nombre', v_c.nombre, 'actual', v_base, 'csv', v_o);

    if v_base is not distinct from v_o then
      v_igual := v_igual + 1;
      if p_aplicar and v_c.fecha_oficial_origen = 'cobro' then
        perform app.fecha_oficial_poner(v_cid, v_o, 'mobidb', 'confirmada por MobiDB');
      end if;
    elsif v_c.fecha_oficial_origen = 'manual' then
      v_manual := v_manual || v_item;
    elsif v_c.fecha_oficial_origen = 'cobro' then
      v_d := v_o - v_base;
      if abs(v_d) <= 5 then
        v_conf := v_conf || (v_item || jsonb_build_object('dias', v_d));
        if p_aplicar then perform app.fecha_oficial_poner(v_cid, v_o, 'mobidb', 'MobiDB dentro de 5 días del cobro'); end if;
      elsif v_d < -5 then
        v_host := v_host || (v_item || jsonb_build_object('dias', v_d));      -- se queda la del cobro
      else
        v_nueva := v_nueva || (v_item || jsonb_build_object('dias', v_d));
        if p_aplicar then perform app.fecha_oficial_poner(v_cid, v_o, 'mobidb', 'MobiDB más nueva que el cobro (revisar)'); end if;
      end if;
    else
      -- sin cobros de la hostess de por medio: manda MobiDB
      v_cambiadas := v_cambiadas + 1;
      if v_corte is not null and v_o >= v_corte and (v_base is null or v_o > v_base) then
        v_sincobro := v_sincobro || v_item;
      end if;
      if p_aplicar then perform app.fecha_oficial_poner(v_cid, v_o, 'mobidb', 'importación MobiDB'); end if;
    end if;

    if p_aplicar then
      update public.clientes_gym set
        telefono = coalesce(telefono, case when public.gym_tel_libre(r.tel) then r.tel end),
        sexo = coalesce(sexo, case r.sexo when 'H' then 'Hombre' when 'M' then 'Mujer' else r.sexo end),
        entrenador = coalesce(r.ent, entrenador), actualizado_en = now()
      where id = v_cid and (sexo is null or r.ent is distinct from entrenador or telefono is null);
    end if;
  end loop;

  -- Cobros provisionales que MobiDB todavía no trae (hay que actualizarlos en MobiDB)
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'cobro', c.fecha_oficial) order by c.fecha_oficial), '[]')
    into v_sinact
  from public.clientes_gym c
  where c.fecha_oficial_origen = 'cobro' and not (c.id = any(v_vistos));

  return jsonb_build_object(
    'aplicado', coalesce(p_aplicar, false),
    'filas', (select count(*) from _imp), 'invalidas', v_invalidas,
    'resumen', jsonb_build_object(
      'sin_cambio', v_igual, 'cambiadas_por_mobidb', v_cambiadas,
      'confirmadas_dentro_de_5_dias', jsonb_array_length(v_conf),
      'se_uso_fecha_del_cobro', jsonb_array_length(v_host),
      'mobidb_mas_nueva', jsonb_array_length(v_nueva),
      'sin_cobro_registrado', jsonb_array_length(v_sincobro),
      'editadas_a_mano', jsonb_array_length(v_manual),
      'clientes_nuevos', jsonb_array_length(v_nuevos),
      'cobros_sin_actualizar_en_mobidb', jsonb_array_length(v_sinact)),
    'confirmadas', v_conf, 'fecha_del_cobro', v_host, 'mobidb_mas_nueva', v_nueva,
    'sin_cobro', v_sincobro, 'editadas_a_mano', v_manual, 'nuevos', v_nuevos, 'sin_actualizar', v_sinact);
end;
$$;

-- (pequeño apoyo: ¿ese teléfono todavía no es de nadie?)
create or replace function public.gym_tel_libre(p_tel text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_tel is not null and not exists (select 1 from public.clientes_gym where telefono = p_tel);
$$;

-- ------------------------------------------------------------
-- 11. Ficha de cliente para el dueño (con las dos fechas)
-- ------------------------------------------------------------
create or replace function public.cliente_detalle(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not app.tiene_permiso('matriculas.ver') then null else
    jsonb_build_object(
      'cliente', to_jsonb(c.*),
      'visitas', (select coalesce(jsonb_agg(v.fecha order by v.fecha desc), '[]'::jsonb)
                  from public.cliente_visitas v where v.cliente_id = c.id),
      'pagos', (select coalesce(jsonb_agg(jsonb_build_object(
                  'fecha', v.fecha, 'monto', v.monto, 'efectivo_cup', v.efectivo_cup,
                  'transferencia_cup', v.transferencia_cup, 'efectivo_usd', v.efectivo_usd,
                  'tasa', v.tasa, 'caso_social', v.caso_social) order by v.fecha desc), '[]'::jsonb)
                from public.cliente_visitas v where v.cliente_id = c.id),
      'total_pagado', (select coalesce(sum(v.monto), 0) from public.cliente_visitas v where v.cliente_id = c.id),
      'veces', (select count(*) from public.cliente_visitas v where v.cliente_id = c.id),
      'primera_visita', (select min(v.fecha) from public.cliente_visitas v where v.cliente_id = c.id),
      'ultima_visita', (select max(v.fecha) from public.cliente_visitas v where v.cliente_id = c.id),
      'fecha_oficial', c.fecha_oficial,
      'fecha_oficial_origen', c.fecha_oficial_origen,
      'vence', coalesce(c.fecha_oficial, (select max(v.fecha) from public.cliente_visitas v where v.cliente_id = c.id))
                 + app.config_num('ciclo_dias', 30)::int
    )
  end
  from public.clientes_gym c where c.id = p_id;
$$;

-- ------------------------------------------------------------
-- 12. Permisos de ejecución (la app solo entra por funciones, sin acceso anónimo)
-- ------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and (p.proname like 'gym\_%' or p.proname in ('clientes_vencimientos', 'cliente_detalle', 'usuario_crear'))
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;
