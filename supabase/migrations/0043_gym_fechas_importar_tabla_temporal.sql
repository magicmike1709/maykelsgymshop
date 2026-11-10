-- ============================================================
-- Arreglo de 0042: gym_fechas_importar usaba una tabla temporal que fallaba
-- si se llamaba dos veces dentro de la misma transacción. En el panel cada
-- llamada es su propia transacción, así que no afectaba, pero así es más robusto.
-- ============================================================

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

  create temp table if not exists _imp (nombre text, tel text, fecha date, sexo text, ent text) on commit drop;
  truncate _imp;

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

revoke execute on function public.gym_fechas_importar(jsonb, boolean) from public, anon;
grant execute on function public.gym_fechas_importar(jsonb, boolean) to authenticated, service_role;
