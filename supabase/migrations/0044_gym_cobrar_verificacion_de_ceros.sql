-- ============================================================
-- Arreglo de 0042: la verificación de "ceros de más" no funcionaba cuando el
-- día del cobro no tenía tasa vigente (un cobro de 900.000 CUP pasaba).
-- Ahora usa la tasa de ese día o, si no hay, la última conocida.
-- ============================================================

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
  v_ref numeric;
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

  -- Referencia para detectar ceros de más: la tasa del día o, si ese día no tiene, la última conocida.
  v_ref := coalesce(v_tasa, app.tasa_vigente(v_hoy), (select t.tasa from public.tasas_cobro t order by t.desde desc limit 1));
  if v_tasa is not null then v_sug := round(v_precio * v_tasa); end if;
  if v_ref is not null and round(v_precio * v_ref) > 0 and v_total > round(v_precio * v_ref) * 10 then
    raise exception 'MG422: % CUP es más de 10 veces el precio normal (% CUP). Revisa los ceros', v_total, round(v_precio * v_ref);
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

revoke execute on function public.gym_cobrar(uuid, date, numeric, numeric, numeric, boolean, text, uuid, timestamptz) from public, anon;
grant execute on function public.gym_cobrar(uuid, date, numeric, numeric, numeric, boolean, text, uuid, timestamptz) to authenticated, service_role;
