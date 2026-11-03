-- ============================================================
-- Datos reales en Matrículas y un importador que no mezcla gente.
--
-- Al revisar la base completa de octubre aparecieron tres fallos
-- que hacían que el dinero del panel no coincidiera con los pagos:
--
-- 1. El renglón de dinero del día (matriculas, lote 'individual')
--    solo se recalculaba desde las funciones de cobro. Cuando se
--    unían dos fichas repetidas (clientes_fusionar) se borraba la
--    visita repetida, pero el dinero del día seguía contándola: el
--    12, 13 y 14 de octubre sumaban un pago de 8.500 CUP que ya no
--    existía (25.500 CUP de más). Ahora un trigger sobre
--    cliente_visitas mantiene ese renglón al día pase lo que pase:
--    cobrar, importar, editar, unir fichas o borrar.
--
-- 2. cliente_visita_registrar (el importador de CSV) emparejaba
--    solo por teléfono y además le ponía a la ficha el nombre que
--    traía el CSV. Dos personas que comparten teléfono terminaban
--    en una sola ficha, con el nombre de la última y un solo pago
--    por día (así se perdió el pago de Leidis Ramirez del 19/10 y
--    su ficha pasó a llamarse Kevin Rios). Y sin teléfono creaba
--    siempre una ficha nueva, lo que generaba los repetidos. Ahora:
--      - por teléfono solo si el nombre es de la misma persona;
--      - si no, busca por nombre;
--      - nunca cambia el nombre de una ficha existente;
--      - volver a subir un pago no pisa su monto (antes un CSV sin
--        monto les ponía el precio completo a las rebajas);
--      - devuelve si el pago era nuevo o ya estaba, para que el
--        importador diga la verdad en vez de "N registros sumados".
--
-- 3. exportar_datos sumaba todas las filas de matriculas, así que
--    los días con total tecleado a mano y además detalle por
--    cliente (todo agosto y el 28/2) salían al doble en la
--    exportación. El panel ya lo hacía bien (matriculas_panel);
--    ahora la exportación usa la misma regla.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Nombres: forma normalizada y "¿es la misma persona?"
-- ------------------------------------------------------------
create or replace function app.nombre_clave(p text)
returns text
language sql immutable set search_path = public as $$
  select trim(regexp_replace(regexp_replace(
    lower(translate(coalesce(p, ''), 'áéíóúüÁÉÍÓÚÜñÑ', 'aeiouuaeiouunn')),
    '[^a-z ]', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- Misma persona si coinciden las dos primeras palabras del nombre
-- (o la primera, si uno de los dos tiene una sola). "Claudia Perez -"
-- y "Claudia Perez" sí; "Leidis Ramirez" y "Kevin Rios" no; "Jose
-- Perez" y "Jose Garcia" (padre e hijo con el mismo teléfono) no.
create or replace function app.misma_persona(a text, b text)
returns boolean
language sql immutable set search_path = public as $$
  with p as (
    select string_to_array(app.nombre_clave(a), ' ') x,
           string_to_array(app.nombre_clave(b), ' ') y
  )
  select case
    when app.nombre_clave(a) = '' or app.nombre_clave(b) = '' then false
    else x[1:least(2, cardinality(x), cardinality(y))]
       = y[1:least(2, cardinality(x), cardinality(y))]
  end
  from p;
$$;

-- ------------------------------------------------------------
-- 2. El dinero del día siempre igual a los pagos del día
-- ------------------------------------------------------------
create or replace function app.recalcular_matriculas_individual(p_fechas date[])
returns integer
language plpgsql security definer set search_path = public as $$
declare v_cambios integer; v_borrados integer;
begin
  insert into public.matriculas (fecha, monto, pagos, lote)
  select v.fecha, sum(v.monto), count(*), 'individual'
  from public.cliente_visitas v
  where v.fecha = any(p_fechas) and v.monto is not null
  group by v.fecha
  on conflict (fecha) where lote = 'individual'
  do update set monto = excluded.monto, pagos = excluded.pagos
  -- sin cambios no se toca la fila, para no llenar Actividad de ruido
  where public.matriculas.monto is distinct from excluded.monto
     or public.matriculas.pagos is distinct from excluded.pagos;
  get diagnostics v_cambios = row_count;

  -- un día que se quedó sin pagos con monto deja de tener renglón
  -- (si tenía un total tecleado a mano, vuelve a mandar ese)
  delete from public.matriculas m
  where m.lote = 'individual' and m.fecha = any(p_fechas)
    and not exists (select 1 from public.cliente_visitas v where v.fecha = m.fecha and v.monto is not null);
  get diagnostics v_borrados = row_count;

  return v_cambios + v_borrados;
end;
$$;

revoke execute on function app.recalcular_matriculas_individual(date[]) from public, anon, authenticated;

create or replace function app.tg_visitas_dinero_del_dia()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_fechas date[];
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct fecha) into v_fechas from nuevas;
  elsif tg_op = 'UPDATE' then
    select array_agg(distinct fecha) into v_fechas
    from (select fecha from nuevas union select fecha from viejas) f;
  else
    select array_agg(distinct fecha) into v_fechas from viejas;
  end if;

  if v_fechas is not null then
    perform app.recalcular_matriculas_individual(v_fechas);
  end if;
  return null;
end;
$$;

drop trigger if exists tg_visitas_dinero_ins on public.cliente_visitas;
drop trigger if exists tg_visitas_dinero_upd on public.cliente_visitas;
drop trigger if exists tg_visitas_dinero_del on public.cliente_visitas;

create trigger tg_visitas_dinero_ins after insert on public.cliente_visitas
  referencing new table as nuevas
  for each statement execute function app.tg_visitas_dinero_del_dia();
create trigger tg_visitas_dinero_upd after update on public.cliente_visitas
  referencing old table as viejas new table as nuevas
  for each statement execute function app.tg_visitas_dinero_del_dia();
create trigger tg_visitas_dinero_del after delete on public.cliente_visitas
  referencing old table as viejas
  for each statement execute function app.tg_visitas_dinero_del_dia();

-- ------------------------------------------------------------
-- 3. Importador: sin mezclar personas, sin pisar nombres
-- ------------------------------------------------------------
create or replace function public.cliente_visita_registrar(
  p_nombre text, p_fecha date, p_telefono text default null,
  p_sexo text default null, p_entrenador text default null, p_monto numeric default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tel text := nullif(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), '');
  v_nombre text := nullif(trim(p_nombre), '');
  v_cliente_id uuid;
  v_dueno_id uuid;
  v_dueno_nombre text;
  v_tel_de_otro text;
  v_cliente_nuevo boolean := false;
  v_visita_nueva boolean;
begin
  if not app.tiene_permiso('matriculas.registrar') then raise exception 'MG403: sin permiso'; end if;
  if v_nombre is null then raise exception 'MG422: falta el nombre'; end if;
  if p_fecha is null then raise exception 'MG422: falta la fecha'; end if;

  -- Por teléfono, pero solo si la ficha es de la misma persona.
  if v_tel is not null then
    select id, nombre into v_dueno_id, v_dueno_nombre from public.clientes_gym where telefono = v_tel;
    if v_dueno_id is not null then
      if app.misma_persona(v_dueno_nombre, v_nombre) then
        v_cliente_id := v_dueno_id;
      else
        v_tel_de_otro := v_dueno_nombre;
      end if;
    end if;
  end if;

  -- Por nombre. Con un teléfono nuevo solo sirve una ficha sin
  -- teléfono (otra con un número distinto es otra persona).
  if v_cliente_id is null then
    select c.id into v_cliente_id
    from public.clientes_gym c
    where app.nombre_clave(c.nombre) = app.nombre_clave(v_nombre)
      and (v_tel is null or v_tel_de_otro is not null or c.telefono is null)
    order by (c.telefono is null) desc,
             (select max(v.fecha) from public.cliente_visitas v where v.cliente_id = c.id) desc nulls last
    limit 1;
  end if;

  if v_cliente_id is null then
    insert into public.clientes_gym (nombre, telefono, sexo, entrenador)
    values (v_nombre,
            case when v_tel_de_otro is null then v_tel end,
            nullif(trim(p_sexo), ''),
            nullif(trim(p_entrenador), ''))
    returning id into v_cliente_id;
    v_cliente_nuevo := true;
  else
    update public.clientes_gym set
      telefono   = coalesce(telefono, case when v_tel_de_otro is null then v_tel end),
      sexo       = coalesce(sexo, nullif(trim(p_sexo), '')),
      entrenador = coalesce(nullif(trim(p_entrenador), ''), entrenador),
      actualizado_en = now()
    where id = v_cliente_id;
  end if;

  -- Si el pago ya estaba, solo se rellena el monto si estaba vacío:
  -- volver a subir un CSV no tiene que pisar rebajas ni casos
  -- sociales con el precio completo (cambiar un monto adrede se hace
  -- desde Cobrar).
  insert into public.cliente_visitas (cliente_id, fecha, monto)
  values (v_cliente_id, p_fecha, p_monto)
  on conflict (cliente_id, fecha) do update set monto = coalesce(public.cliente_visitas.monto, excluded.monto)
  returning (xmax = 0) into v_visita_nueva;

  -- el dinero del día lo pone al día el trigger de cliente_visitas
  return jsonb_build_object(
    'ok', true,
    'cliente_id', v_cliente_id,
    'visita_nueva', v_visita_nueva,
    'cliente_nuevo', v_cliente_nuevo,
    'telefono_de_otro', v_tel_de_otro
  );
end;
$$;

-- ------------------------------------------------------------
-- 4. Cobrar y completar montos: el dinero lo lleva el trigger
-- ------------------------------------------------------------
create or replace function public.cobrar_matricula(
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

  v_monto := coalesce(p_monto, app.config_num('precio_matricula', 8500));
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

  return jsonb_build_object('ok', true, 'nombre', v_nombre, 'monto', v_monto, 'ya_habia_pagado_ese_dia', v_ya_existia);
end;
$$;

create or replace function public.visitas_completar_monto(p_mes text, p_monto numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_desde date := to_date(p_mes || '-01', 'YYYY-MM-DD');
  v_hasta date := (to_date(p_mes || '-01', 'YYYY-MM-DD') + interval '1 month')::date;
  v_n integer;
begin
  if not app.tiene_permiso('matriculas.registrar') then raise exception 'MG403: sin permiso'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto tiene que ser mayor que cero'; end if;

  update public.cliente_visitas set monto = p_monto
  where fecha >= v_desde and fecha < v_hasta and monto is null;
  get diagnostics v_n = row_count;

  -- Como antes: todos los días del mes con pagos pasan a contar por
  -- el detalle por cliente, no solo los que tenían montos vacíos.
  perform app.recalcular_matriculas_individual(array(
    select distinct fecha from public.cliente_visitas where fecha >= v_desde and fecha < v_hasta
  ));

  return jsonb_build_object('ok', true, 'actualizadas', v_n);
end;
$$;

-- ------------------------------------------------------------
-- 5. Exportar sin doble conteo (misma regla que matriculas_panel)
-- ------------------------------------------------------------
create or replace function public.exportar_datos(p_desde date, p_hasta date)
returns table(fecha date, linea text, moneda text, total numeric, costo numeric, ganancia numeric, detalle text)
language sql stable security definer set search_path = public as $$
  select d.fecha, 'Matrículas', 'CUP', d.monto, null::numeric, d.monto, null
  from (
    select m.fecha,
      case when bool_or(m.lote = 'individual')
           then sum(m.monto) filter (where m.lote = 'individual')
           else sum(m.monto) end as monto
    from public.matriculas m
    where m.fecha between p_desde and p_hasta and app.tiene_permiso('contabilidad.ver')
    group by m.fecha
  ) d
  union all
  select r.fecha, 'Nevera', 'CUP', r.total, r.costo_total, r.ganancia, r.nota
  from public.refrigerio_ventas r where r.fecha between p_desde and p_hasta and app.tiene_permiso('contabilidad.ver')
  union all
  select v.fecha::date, 'Vitrina', 'USD', v.total, v.costo_total, v.ganancia, v.cliente
  from public.ventas v where v.fecha::date between p_desde and p_hasta and v.estado = 'confirmada' and app.tiene_permiso('contabilidad.ver')
  union all
  select g.fecha, 'Gasto', g.moneda, -g.importe, null::numeric, -g.importe, g.concepto
  from public.gastos g where g.fecha between p_desde and p_hasta and app.tiene_permiso('contabilidad.ver')
  order by 1;
$$;

-- ------------------------------------------------------------
-- 6. Limpieza: la función del trigger de alta de usuarios no tiene
--    que poder llamarse desde la API.
-- ------------------------------------------------------------
revoke execute on function public.crear_usuario_desde_auth() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 7. Corrección de datos: rehacer desde los pagos reales cada
--    renglón de dinero que ya era por cliente. Arregla el 12, 13 y
--    14 de octubre (-8.500 CUP cada uno). No crea renglones nuevos,
--    así que los días que solo tienen total tecleado a mano (marzo,
--    31/7) quedan como están.
-- ------------------------------------------------------------
select app.recalcular_matriculas_individual(array(
  select fecha from public.matriculas where lote = 'individual'
));
