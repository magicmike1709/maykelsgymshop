alter table public.matriculas add column pagos integer not null default 1 check (pagos >= 1);
alter table public.matriculas add column lote text;

create unique index ux_matriculas_manual_fecha on public.matriculas(fecha) where lote = 'manual';

drop function if exists public.matricula_guardar(numeric, text, text, date);

create function public.matricula_dia_guardar(p_fecha date, p_pagos integer, p_total numeric, p_reemplazar boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not app.tiene_permiso('matriculas.registrar') then
    raise exception 'MG403: sin permiso';
  end if;

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

create or replace function public.matriculas_panel(p_desde date default date_trunc('month', current_date)::date, p_hasta date default current_date)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', coalesce(sum(monto), 0),
    'pagos', coalesce(sum(pagos), 0),
    'desde', p_desde,
    'hasta', p_hasta
  )
  from public.matriculas
  where fecha between p_desde and p_hasta
    and app.tiene_permiso('matriculas.ver');
$$;

revoke execute on function public.matricula_dia_guardar(date, integer, numeric, boolean) from anon;
grant execute on function public.matricula_dia_guardar(date, integer, numeric, boolean) to authenticated;
