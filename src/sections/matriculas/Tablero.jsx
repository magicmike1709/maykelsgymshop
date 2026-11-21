import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { fechaDiaMes } from '../../lib/fecha'
import { n } from '../../lib/formato'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function mesCorto(mes) {
  return MESES[Number(mes.split('-')[1]) - 1]
}

function pct(parte, total) {
  if (!total) return null
  return Math.round((parte / total) * 100)
}

// Cambio contra el mismo tramo del mes anterior: "+12%" en verde, "−8%" en rojo.
function Cambio({ ahora, antes }) {
  if (!antes) return <span className="text-[11px] text-muted">sin dato anterior</span>
  const d = Math.round(((ahora - antes) / antes) * 100)
  const tono = d > 0 ? 'text-green-strong' : d < 0 ? 'text-red' : 'text-muted'
  return <span className={'text-[11px] font-semibold tabular-nums ' + tono}>{d > 0 ? '+' : d < 0 ? '−' : ''}{Math.abs(d)}%</span>
}

function Tarjeta({ titulo, children }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h3 className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-2">{titulo}</h3>
      {children}
    </section>
  )
}

export default function Tablero({ onIr }) {
  const [t, setT] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.rpc('clientes_tablero').then(({ data, error: err }) => {
      if (err) setError('No se pudo cargar el tablero: ' + err.message)
      else setT(data)
    })
  }, [])

  if (error) return <p className="text-sm text-red">{error}</p>
  if (!t) return <p className="text-sm text-muted">Cargando…</p>

  const e = t.estado
  const m = t.mes
  const porRecuperarCup = e.por_recuperar * Number(t.precio || 0)

  // Renovación: último mes cerrado (el penúltimo de la lista) y el mes en curso.
  const meses = t.meses || []
  const enCurso = meses[meses.length - 1]
  const cerrado = meses.length > 1 ? meses[meses.length - 2] : null
  const maxPagaron = Math.max(1, ...meses.map((x) => x.pagaron))

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Clientes con la matrícula al día</div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold tabular-nums text-green-strong">{n(e.activos)}</span>
          <span className="text-xs text-muted">de {n(e.total)} en la base</span>
        </div>
        <p className="text-xs text-muted mt-1">
          A <b className="text-ink">{n(e.vencen_7)}</b> se les vence en los próximos 7 días.
        </p>
      </section>

      <section className="rounded-2xl border border-yellow bg-yellow-soft p-4">
        <div className="text-[11px] uppercase tracking-wide text-yellow-ink font-semibold mb-1">Dinero por recuperar</div>
        <div className="text-3xl font-bold tabular-nums">{n(porRecuperarCup)} <span className="text-sm font-normal text-muted">CUP al mes</span></div>
        <p className="text-xs text-muted mt-1">
          {n(e.por_recuperar)} clientes se vencieron en los últimos 45 días y no han vuelto
          ({n(e.por_recuperar_con_tel)} con teléfono), a {n(t.precio)} CUP cada uno.
        </p>
        {onIr && (
          <button onClick={() => onIr('recepcion')}
            className="mt-3 w-full rounded-xl bg-green text-white text-sm font-semibold py-2.5">
            Ver la lista y escribirles
          </button>
        )}
      </section>

      <Tarjeta titulo={`Este mes (hasta hoy) contra el mes pasado hasta el ${fechaDiaMes(m.ant_hasta)}`}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-bold tabular-nums">{n(m.cup)}</div>
            <div className="text-[11px] text-muted">CUP cobrados</div>
            <Cambio ahora={Number(m.cup)} antes={Number(m.ant_cup)} />
          </div>
          <div>
            <div className="text-lg font-bold tabular-nums">{n(m.pagaron)}</div>
            <div className="text-[11px] text-muted">pagaron</div>
            <Cambio ahora={m.pagaron} antes={m.ant_pagaron} />
          </div>
          <div>
            <div className="text-lg font-bold tabular-nums">{n(m.nuevos)}</div>
            <div className="text-[11px] text-muted">nuevos</div>
            <Cambio ahora={m.nuevos} antes={m.ant_nuevos} />
          </div>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Renovación (de los que pagaron un mes, cuántos pagaron el siguiente)">
        {cerrado && cerrado.base_anterior > 0 && (
          <div className="flex items-baseline justify-between text-sm">
            <span>{mesCorto(cerrado.mes)} (mes cerrado)</span>
            <span className="tabular-nums">
              <b className="text-lg">{pct(cerrado.renovaron, cerrado.base_anterior)}%</b>
              <span className="text-xs text-muted"> · {cerrado.renovaron} de {cerrado.base_anterior}</span>
            </span>
          </div>
        )}
        {enCurso && enCurso.base_anterior > 0 && (
          <div className="flex items-baseline justify-between text-sm mt-1">
            <span>{mesCorto(enCurso.mes)} (en curso)</span>
            <span className="tabular-nums">
              <b className="text-lg">{pct(enCurso.renovaron, enCurso.base_anterior)}%</b>
              <span className="text-xs text-muted"> · {enCurso.renovaron} de {enCurso.base_anterior}</span>
            </span>
          </div>
        )}
        {cerrado && cerrado.base_anterior > 0 && (
          <p className="text-xs text-muted mt-2">
            En {mesCorto(cerrado.mes)} no volvieron {cerrado.base_anterior - cerrado.renovaron} clientes del mes anterior.
          </p>
        )}
      </Tarjeta>

      <Tarjeta titulo="Últimos 6 meses · clientes que pagaron">
        <div className="space-y-1.5">
          {meses.map((x) => (
            <div key={x.mes} className="flex items-center gap-2 text-xs">
              <span className="w-7 text-muted">{mesCorto(x.mes)}</span>
              <div className="flex-1 h-4 bg-sunken rounded">
                <div className="h-4 bg-green rounded" style={{ width: Math.max(2, (x.pagaron / maxPagaron) * 100) + '%' }} />
              </div>
              <span className="w-8 text-right font-semibold tabular-nums">{x.pagaron}</span>
              <span className="w-20 text-right text-muted tabular-nums">{n(x.cup)}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-2">A la derecha, CUP cobrados. Un mes casi vacío suele ser un mes que no se cargó a la app.</p>
      </Tarjeta>

      <Tarjeta titulo="Entrenadores">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 text-sm items-baseline">
          <span className="text-[11px] text-muted">Entrenador</span>
          <span className="text-[11px] text-muted text-right">Al día</span>
          <span className="text-[11px] text-muted text-right">Vencidos</span>
          <span className="text-[11px] text-muted text-right">CUP 30 días</span>
          {t.entrenadores.map((x) => (
            <FilaEntrenador key={x.entrenador} x={x} />
          ))}
        </div>
        <p className="text-[11px] text-muted mt-2">Vencidos: se les venció en los últimos 45 días y no han pagado. Entre paréntesis, qué parte de sus clientes sigue al día.</p>
      </Tarjeta>

      <Tarjeta titulo="Seguimiento de recepción (últimos 30 días)">
        {t.avisos.avisados === 0 ? (
          <p className="text-sm text-muted">Todavía no se ha marcado a nadie como avisado. Cuando recepción use la lista de “Recepción”, aquí verás a cuántos se les escribió y cuántos volvieron a pagar.</p>
        ) : (
          <p className="text-sm">
            Se le escribió a <b>{n(t.avisos.avisados)}</b> clientes y <b className="text-green-strong">{n(t.avisos.volvieron)}</b> volvieron a pagar
            {pct(t.avisos.volvieron, t.avisos.avisados) !== null && <> ({pct(t.avisos.volvieron, t.avisos.avisados)}%)</>}.
            <span className="block text-xs text-muted mt-1">Último aviso: {fechaDiaMes(t.avisos.ultimo)}</span>
          </p>
        )}
      </Tarjeta>

      <Tarjeta titulo="El resto de la base">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-bold tabular-nums">{n(e.dormidos)}</div>
            <div className="text-[11px] text-muted">dormidos (46 a 180 días vencidos)</div>
          </div>
          <div>
            <div className="text-lg font-bold tabular-nums">{n(e.perdidos)}</div>
            <div className="text-[11px] text-muted">más de 180 días</div>
          </div>
          <div>
            <div className="text-lg font-bold tabular-nums">{n(e.sin_telefono)}</div>
            <div className="text-[11px] text-muted">sin teléfono</div>
          </div>
        </div>
      </Tarjeta>
    </div>
  )
}

function FilaEntrenador({ x }) {
  const al = pct(x.activos, x.activos + x.vencidos)
  return (
    <>
      <span className="font-semibold truncate">{x.entrenador}</span>
      <span className="text-right tabular-nums">{x.activos} <span className="text-[11px] text-muted">({al}%)</span></span>
      <span className={'text-right tabular-nums ' + (x.vencidos > 0 ? 'text-red' : 'text-muted')}>{x.vencidos}</span>
      <span className="text-right tabular-nums text-muted">{n(x.cup_30)}</span>
    </>
  )
}
