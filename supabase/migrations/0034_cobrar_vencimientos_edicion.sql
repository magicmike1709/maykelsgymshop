-- ============================================================
-- Cobrar a un cliente desde la app, vencimientos reales,
-- edición/fusión de fichas y cierre de dos huecos encontrados
-- en la auditoría (doble conteo latente y permiso débil).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Configuración simple (precio de matrícula, ciclo en días)
--    Hasta ahora el precio no vivía en ningún lado: el dueño
--    tecleaba el total del día a mano cada vez.
-- ------------------------------------------------------------
create table public.configuracion (
  clave text primary key,
  valor text not null,
  actualizado_en timestamptz not null default now()
);
alter table public.configuracion enable row level security;

insert into public.configuracion (clave, valor) values
  ('precio_matricula', '5000'),
  ('ciclo_dias', '30');

create function public.config_lista()
returns setof public.configuracion
language sql stable security definer set search_path = public as $$
  select * from public.configuracion where app.tiene_permiso('matriculas.ver') order by clave;
$$;

create function public.config_fijar(p_clave text, p_valor text)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.tiene_permiso('matriculas.registrar') then raise exception 'MG403: sin permiso'; end if;
  insert into public.configuracion (clave, valor) values (p_clave, p_valor)
  on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
  return jsonb_build_object('ok', true);
end;
$$;

create function app.config_num(p_clave text, p_default numeric)
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select valor::numeric from public.configuracion where clave = p_clave), p_default);
$$;

-- ------------------------------------------------------------
-- 2. Agujero de permisos: cliente_visita_registrar CREA clientes
--    y pagos (y mueve dinero a la tabla matriculas), pero solo
--    exigía 'matriculas.ver', que el rol "lectura" tiene. Un
--    usuario de solo lectura podía inyectar pagos importando un
--    CSV. Pasa a exigir 'matriculas.registrar'.
-- ------------------------------------------------------------
create or replace function public.cliente_visita_registrar(
  p_nombre text, p_fecha date, p_telefono text default null,
  p_sexo text default null, p_entrenador text default null, p_monto numeric default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_cliente_id uuid;
begin
  if not app.tiene_permiso('matriculas.registrar') then raise exception 'MG403: sin permiso'; end if;

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

-- ------------------------------------------------------------
-- 3. Cobrar la matrícula de UN cliente ya existente.
--    Esto es lo que faltaba para no depender de la app aparte
--    de la hostess ni de importar CSV.
-- ------------------------------------------------------------
create function public.cobrar_matricula(
  p_cliente_id uuid,
  p_monto numeric default null,
  p_fecha date default current_date,
  p_entrenador text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_monto numeric; v_ya_existia boolean; v_nombre text;
begin
  if not app.tiene_permiso('matriculas.registrar') then raise exception 'MG403: sin permiso'; end if;
  if app.dia_cerrado(p_fecha) then raise exception 'MG423: el día ya está cerrado, reábrelo para editar'; end if;

  select nombre into v_nombre from public.clientes_gym where id = p_cliente_id;
  if v_nombre is null then raise exception 'MG404: cliente no encontrado'; end if;

  v_monto := coalesce(p_monto, app.config_num('precio_matricula', 5000));
  if v_monto < 0 then raise exception 'MG422: el monto no puede ser negativo'; end if;

  select exists (
    select 1 from public.cliente_visitas where cliente_id = p_cliente_id and fecha = p_fecha
  ) into v_ya_existia;

  insert into public.cliente_visitas (cliente_id, fecha, monto)
  values (p_cliente_id, p_fecha, v_monto)
  on conflict (cliente_id, fecha) do update set monto = excluded.monto;

  if p_entrenador is not null and p_entrenador <> '' then
    update public.clientes_gym set entrenador = p_entrenador, actualizado_en = now() where id = p_cliente_id;
  end if;

  -- Mantener al día el renglón de dinero del día (lote 'individual'),
  -- recalculado desde cero para que sea seguro repetir el cobro.
  insert into public.matriculas (fecha, monto, pagos, lote)
  select p_fecha, coalesce(sum(v.monto), 0), count(*), 'individual'
  from public.cliente_visitas v where v.fecha = p_fecha and v.monto is not null
  on conflict (fecha) where lote = 'individual'
  do update set monto = excluded.monto, pagos = excluded.pagos;

  return jsonb_build_object('ok', true, 'nombre', v_nombre, 'monto', v_monto, 'ya_habia_pagado_ese_dia', v_ya_existia);
end;
$$;

-- ------------------------------------------------------------
-- 4. Doble conteo: matriculas_panel sumaba TODAS las filas del
--    día. Si un día tiene el total tecleado a mano ('manual') y
--    además el detalle por cliente ('individual'), el dueño veía
--    el doble. Ahora, por día, si hay detalle por cliente ese
--    manda y el total tecleado de ese día se ignora.
-- ------------------------------------------------------------
create or replace function public.matriculas_panel(
  p_desde date default date_trunc('month', current_date)::date,
  p_hasta date default current_date
)
returns jsonb
language sql stable security definer set search_path = public as $$
  with por_dia as (
    select fecha,
      case when bool_or(lote = 'individual')
           then coalesce(sum(monto) filter (where lote = 'individual'), 0)
           else coalesce(sum(monto), 0) end as monto,
      case when bool_or(lote = 'individual')
           then coalesce(sum(pagos) filter (where lote = 'individual'), 0)
           else coalesce(sum(pagos), 0) end as pagos
    from public.matriculas
    where fecha between p_desde and p_hasta and app.tiene_permiso('matriculas.ver')
    group by fecha
  )
  select jsonb_build_object(
    'total', coalesce(sum(monto), 0),
    'pagos', coalesce(sum(pagos), 0),
    'desde', p_desde,
    'hasta', p_hasta
  )
  from por_dia;
$$;

-- ------------------------------------------------------------
-- 5. Editar una ficha de cliente. Hasta ahora no se podía
--    corregir un nombre mal escrito ni un teléfono equivocado
--    desde la app — y hay ~70 teléfonos que no sirven para SMS.
-- ------------------------------------------------------------
create function public.cliente_editar(
  p_id uuid, p_nombre text, p_telefono text default null,
  p_sexo text default null, p_entrenador text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tel text; v_otro text;
begin
  if not app.tiene_permiso('matriculas.registrar') then raise exception 'MG403: sin permiso'; end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'MG422: el nombre no puede quedar vacío'; end if;
  if not exists (select 1 from public.clientes_gym where id = p_id) then raise exception 'MG404: cliente no encontrado'; end if;

  v_tel := nullif(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), '');

  if v_tel is not null then
    select nombre into v_otro from public.clientes_gym where telefono = v_tel and id <> p_id;
    if v_otro is not null then
      raise exception 'MG409: ese teléfono ya es de %. Si son la misma persona, une las dos fichas.', v_otro;
    end if;
  end if;

  update public.clientes_gym set
    nombre = trim(p_nombre),
    telefono = v_tel,
    sexo = nullif(p_sexo, ''),
    entrenador = nullif(p_entrenador, ''),
    actualizado_en = now()
  where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- 6. Unir dos fichas de la misma persona. Los pagos del
--    duplicado pasan a la ficha principal; si ambos tienen un
--    pago el mismo día (el caso típico de una importación
--    repetida) se conserva uno solo, quedándose con el que
--    tiene monto para no perder dinero del registro.
-- ------------------------------------------------------------
create function public.clientes_fusionar(p_principal uuid, p_duplicado uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_movidas int := 0; v_descartadas int := 0;
  v_tel text; v_sexo text; v_ent text;
begin
  if not app.tiene_permiso('matriculas.registrar') then raise exception 'MG403: sin permiso'; end if;
  if p_principal = p_duplicado then raise exception 'MG422: son la misma ficha'; end if;
  if not exists (select 1 from public.clientes_gym where id = p_principal) then raise exception 'MG404: ficha principal no encontrada'; end if;
  select telefono, sexo, entrenador into v_tel, v_sexo, v_ent from public.clientes_gym where id = p_duplicado;
  if not found then raise exception 'MG404: ficha duplicada no encontrada'; end if;

  -- Si para una misma fecha el duplicado tiene monto y el principal no, conservar el monto.
  update public.cliente_visitas p set monto = d.monto
  from public.cliente_visitas d
  where p.cliente_id = p_principal and d.cliente_id = p_duplicado
    and p.fecha = d.fecha and p.monto is null and d.monto is not null;

  delete from public.cliente_visitas d
  where d.cliente_id = p_duplicado
    and exists (select 1 from public.cliente_visitas p where p.cliente_id = p_principal and p.fecha = d.fecha);
  get diagnostics v_descartadas = row_count;

  update public.cliente_visitas set cliente_id = p_principal where cliente_id = p_duplicado;
  get diagnostics v_movidas = row_count;

  -- Borrar el duplicado ANTES de completar datos en el principal,
  -- si no el índice único de teléfono se queja de tenerlo dos veces.
  delete from public.clientes_gym where id = p_duplicado;

  update public.clientes_gym set
    telefono = coalesce(telefono, v_tel),
    sexo = coalesce(sexo, v_sexo),
    entrenador = coalesce(entrenador, v_ent),
    actualizado_en = now()
  where id = p_principal;

  return jsonb_build_object('ok', true, 'visitas_movidas', v_movidas, 'visitas_repetidas_descartadas', v_descartadas);
end;
$$;

-- ------------------------------------------------------------
-- 7. Ficha del cliente con su historial de dinero. Antes solo
--    devolvía fechas sueltas, aunque el monto ya estaba guardado.
--    Se mantiene 'visitas' como arreglo de fechas para no romper
--    la pantalla actual, y se agregan los totales.
-- ------------------------------------------------------------
create or replace function public.cliente_detalle(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not app.tiene_permiso('matriculas.ver') then null else
    jsonb_build_object(
      'cliente', to_jsonb(c.*),
      'visitas', (select coalesce(jsonb_agg(v.fecha order by v.fecha desc), '[]'::jsonb)
                  from public.cliente_visitas v where v.cliente_id = c.id),
      'pagos', (select coalesce(jsonb_agg(jsonb_build_object('fecha', v.fecha, 'monto', v.monto) order by v.fecha desc), '[]'::jsonb)
                from public.cliente_visitas v where v.cliente_id = c.id),
      'total_pagado', (select coalesce(sum(v.monto), 0) from public.cliente_visitas v where v.cliente_id = c.id),
      'veces', (select count(*) from public.cliente_visitas v where v.cliente_id = c.id),
      'primera_visita', (select min(v.fecha) from public.cliente_visitas v where v.cliente_id = c.id),
      'ultima_visita', (select max(v.fecha) from public.cliente_visitas v where v.cliente_id = c.id),
      'vence', (select max(v.fecha) + app.config_num('ciclo_dias', 30)::int
                from public.cliente_visitas v where v.cliente_id = c.id)
    )
  end
  from public.clientes_gym c where c.id = p_id;
$$;

-- ------------------------------------------------------------
-- 8. Vencimientos reales: a quién se le venció y a quién se le
--    vence pronto, contando días desde su último pago. Antes
--    solo existía "Recordar", que compara mes contra mes y por
--    eso solo sirve cuando el mes ya terminó.
-- ------------------------------------------------------------
create function public.clientes_vencimientos(
  p_dias_aviso integer default 7,
  p_max_dias_vencido integer default 45
)
returns table(id uuid, nombre text, telefono text, entrenador text,
  ultimo_pago date, vence date, dias integer, estado text)
language sql stable security definer set search_path = public as $$
  with ciclo as (select app.config_num('ciclo_dias', 30)::int d),
  ult as (
    select cliente_id, max(fecha) ultimo
    from public.cliente_visitas group by cliente_id
  )
  select c.id, c.nombre, c.telefono, c.entrenador,
    u.ultimo,
    (u.ultimo + ciclo.d)::date,
    ((u.ultimo + ciclo.d) - current_date)::int,
    case
      when (u.ultimo + ciclo.d) < current_date then 'vencido'
      when (u.ultimo + ciclo.d) = current_date then 'vence_hoy'
      else 'por_vencer'
    end
  from public.clientes_gym c
  join ult u on u.cliente_id = c.id
  cross join ciclo
  where app.tiene_permiso('matriculas.ver')
    and (u.ultimo + ciclo.d) <= current_date + p_dias_aviso
    and (u.ultimo + ciclo.d) >= current_date - p_max_dias_vencido
  order by (u.ultimo + ciclo.d);
$$;

-- ------------------------------------------------------------
-- 9. Limpieza de datos: el sexo venía en dos formatos porque el
--    CSV histórico traía 'H'/'M' y la app guarda 'Hombre'/'Mujer'.
--    Cualquier filtro por sexo perdía a la mitad de la gente.
-- ------------------------------------------------------------
update public.clientes_gym set sexo = 'Hombre' where sexo = 'H';
update public.clientes_gym set sexo = 'Mujer' where sexo = 'M';

-- ------------------------------------------------------------
-- Permisos de ejecución
-- ------------------------------------------------------------
revoke execute on function public.config_lista() from anon;
revoke execute on function public.config_fijar(text, text) from anon;
revoke execute on function public.cobrar_matricula(uuid, numeric, date, text) from anon;
revoke execute on function public.cliente_editar(uuid, text, text, text, text) from anon;
revoke execute on function public.clientes_fusionar(uuid, uuid) from anon;
revoke execute on function public.clientes_vencimientos(integer, integer) from anon;

grant execute on function public.config_lista() to authenticated, service_role;
grant execute on function public.config_fijar(text, text) to authenticated, service_role;
grant execute on function public.cobrar_matricula(uuid, numeric, date, text) to authenticated, service_role;
grant execute on function public.cliente_editar(uuid, text, text, text, text) to authenticated, service_role;
grant execute on function public.clientes_fusionar(uuid, uuid) to authenticated, service_role;
grant execute on function public.clientes_vencimientos(integer, integer) to authenticated, service_role;

-- ------------------------------------------------------------
-- 10. Detectar fichas repetidas de la misma persona, para poder
--     unirlas desde la app en vez de que el historial de alguien
--     quede partido en dos.
-- ------------------------------------------------------------
create function public.clientes_duplicados()
returns table(clave text, id uuid, nombre text, telefono text, sexo text, entrenador text, visitas bigint, ultima date)
language sql stable security definer set search_path = public as $$
  with norm as (
    select c.id, c.nombre, c.telefono, c.sexo, c.entrenador,
      lower(regexp_replace(translate(c.nombre,'áéíóúÁÉÍÓÚñÑ','aeiouAEIOUnN'),'[^a-zA-Z ]','','g')) k
    from public.clientes_gym c
  ), dup as (select k from norm group by k having count(*) > 1)
  select n.k, n.id, n.nombre, n.telefono, n.sexo, n.entrenador,
    (select count(*) from public.cliente_visitas v where v.cliente_id = n.id),
    (select max(v.fecha) from public.cliente_visitas v where v.cliente_id = n.id)
  from norm n join dup d on d.k = n.k
  where app.tiene_permiso('matriculas.ver')
  order by n.k, (select max(v.fecha) from public.cliente_visitas v where v.cliente_id = n.id) desc nulls last;
$$;

-- Lista de entrenadores reales, para los selectores de la app.
create function public.entrenadores_lista()
returns table(entrenador text, clientes bigint)
language sql stable security definer set search_path = public as $$
  select entrenador, count(*)
  from public.clientes_gym
  where entrenador is not null and entrenador <> '' and app.tiene_permiso('matriculas.ver')
  group by entrenador
  order by count(*) desc;
$$;

revoke execute on function public.clientes_duplicados() from anon;
revoke execute on function public.entrenadores_lista() from anon;
grant execute on function public.clientes_duplicados() to authenticated, service_role;
grant execute on function public.entrenadores_lista() to authenticated, service_role;

-- ------------------------------------------------------------
-- Nota: además de esta migración, en producción se unieron 6
-- fichas duplicadas que venían de la importación del CSV
-- histórico (Eduardo Martinez ×3, Katerin Palacio, Masiel
-- Mendoza, Pedro Carlos Hernandez y Yuri Ramos), usando la misma
-- lógica de clientes_fusionar. Quedaron 809 clientes y se
-- descartaron 2 registros que eran el mismo pago cargado dos
-- veces. No se hace aquí porque son ids concretos de esa base.
-- ------------------------------------------------------------
