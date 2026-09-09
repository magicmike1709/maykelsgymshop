-- ============================================================
-- Cuadre de caja por turno/día (antirrobo)
-- Igual que la app anterior: lo que debería haber en caja (CUP)
-- contra lo que se contó físicamente, con el descuadre guardado.
-- ============================================================
alter table public.cierres add column caja_esperada numeric;
alter table public.cierres add column caja_contada numeric;
alter table public.cierres add column descuadre numeric;

create function app.caja_esperada_dia(p_dia date)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare v_mat jsonb; v_nev jsonb; v_gas jsonb;
begin
  v_mat := public.matriculas_panel(p_dia, p_dia);
  v_nev := public.refrigerios_panel(p_dia, p_dia);
  v_gas := public.gastos_panel(p_dia, p_dia);
  return coalesce((v_mat->>'total')::numeric, 0) + coalesce((v_nev->>'total')::numeric, 0) - coalesce((v_gas->>'cup')::numeric, 0);
end;
$$;

drop function if exists public.cierre_crear(date);

create function public.cierre_crear(p_dia date default current_date, p_caja_contada numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_snap jsonb; v_id uuid; v_esperada numeric;
begin
  if not app.tiene_permiso('contabilidad.ver') then raise exception 'MG403: sin permiso'; end if;
  if app.dia_cerrado(p_dia) then return jsonb_build_object('ok', false, 'motivo', 'ya_cerrado'); end if;
  v_snap := public.panel_resumen(p_dia, p_dia);
  v_esperada := app.caja_esperada_dia(p_dia);
  insert into public.cierres (dia, snapshot, usuario_id, caja_esperada, caja_contada, descuadre)
  values (p_dia, v_snap, app.usuario_actual(), v_esperada, p_caja_contada,
    case when p_caja_contada is not null then p_caja_contada - v_esperada else null end)
  on conflict (dia) do update set estado='cerrado', snapshot=excluded.snapshot, usuario_id=excluded.usuario_id,
    creado_en=now(), reabierto_en=null, caja_esperada=excluded.caja_esperada,
    caja_contada=excluded.caja_contada, descuadre=excluded.descuadre
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'snapshot', v_snap, 'caja_esperada', v_esperada, 'descuadre',
    case when p_caja_contada is not null then p_caja_contada - v_esperada else null end);
end; $$;

-- Registrar (o corregir) el conteo físico de caja de un día ya cerrado,
-- sin tener que reabrir el día.
create function public.cierre_registrar_conteo(p_dia date, p_caja_contada numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_esperada numeric;
begin
  if not app.tiene_permiso('contabilidad.ver') then raise exception 'MG403: sin permiso'; end if;
  select caja_esperada into v_esperada from public.cierres where dia = p_dia;
  if v_esperada is null then
    v_esperada := app.caja_esperada_dia(p_dia);
  end if;
  update public.cierres set caja_esperada = v_esperada, caja_contada = p_caja_contada, descuadre = p_caja_contada - v_esperada
  where dia = p_dia;
  if not found then raise exception 'MG404: ese día no tiene cierre'; end if;
  return jsonb_build_object('ok', true, 'caja_esperada', v_esperada, 'descuadre', p_caja_contada - v_esperada);
end; $$;

-- ============================================================
-- Fondos del equipo: libro aparte, no toca ventas ni ganancia diaria
-- ============================================================
create table public.fondo_movimientos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  tipo text not null check (tipo in ('aporte', 'retiro')),
  moneda text not null check (moneda in ('CUP', 'USD')),
  importe numeric not null check (importe > 0),
  concepto text not null,
  usuario_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);
alter table public.fondo_movimientos enable row level security;
create index ix_fondo_movimientos_fecha on public.fondo_movimientos(fecha);

create function public.fondo_registrar(p_tipo text, p_moneda text, p_importe numeric, p_concepto text, p_fecha date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('contabilidad.ver') then raise exception 'MG403: sin permiso'; end if;
  insert into public.fondo_movimientos (fecha, tipo, moneda, importe, concepto, usuario_id)
  values (p_fecha, p_tipo, p_moneda, p_importe, p_concepto, app.usuario_actual())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

create function public.fondos_lista(p_desde date default (current_date - interval '90 days')::date, p_hasta date default current_date)
returns setof public.fondo_movimientos
language sql stable security definer set search_path = public as $$
  select * from public.fondo_movimientos
  where fecha between p_desde and p_hasta and app.tiene_permiso('contabilidad.ver')
  order by fecha desc, creado_en desc;
$$;

create function public.fondos_balance()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'cup', coalesce(sum(importe) filter (where moneda = 'CUP' and tipo = 'aporte'), 0) - coalesce(sum(importe) filter (where moneda = 'CUP' and tipo = 'retiro'), 0),
    'usd', coalesce(sum(importe) filter (where moneda = 'USD' and tipo = 'aporte'), 0) - coalesce(sum(importe) filter (where moneda = 'USD' and tipo = 'retiro'), 0)
  )
  from public.fondo_movimientos where app.tiene_permiso('contabilidad.ver');
$$;

-- ============================================================
-- Permisos de ejecución
-- ============================================================
revoke execute on function public.cierre_crear(date, numeric) from public;
grant execute on function public.cierre_crear(date, numeric) to authenticated, service_role;
revoke execute on function public.cierre_crear(date, numeric) from anon;

revoke execute on function public.cierre_registrar_conteo(date, numeric) from public;
grant execute on function public.cierre_registrar_conteo(date, numeric) to authenticated, service_role;
revoke execute on function public.cierre_registrar_conteo(date, numeric) from anon;

revoke execute on function public.fondo_registrar(text, text, numeric, text, date) from public;
grant execute on function public.fondo_registrar(text, text, numeric, text, date) to authenticated, service_role;
revoke execute on function public.fondo_registrar(text, text, numeric, text, date) from anon;

revoke execute on function public.fondos_lista(date, date) from public;
grant execute on function public.fondos_lista(date, date) to authenticated, service_role;
revoke execute on function public.fondos_lista(date, date) from anon;

revoke execute on function public.fondos_balance() from public;
grant execute on function public.fondos_balance() to authenticated, service_role;
revoke execute on function public.fondos_balance() from anon;
