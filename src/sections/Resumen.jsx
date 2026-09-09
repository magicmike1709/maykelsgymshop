import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function n(v) {
  return Number(v || 0).toLocaleString('es-CU')
}

export default function Resumen() {
  const [r, setR] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.rpc('panel_resumen').then(({ data, error }) => {
      if (error) setError('Tu usuario no ve la contabilidad completa.')
      else setR(data)
    })
  }, [])

  if (error) return <p className="text-sm text-muted">{error}</p>
  if (!r) return <p className="text-sm text-muted">Cargando…</p>

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-green-soft p-4 shadow-sm">
        <h2 className="font-display text-xs font-semibold uppercase tracking-wide text-green-strong mb-3">
          Gym + Nevera · CUP
        </h2>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-muted">Matrículas</span>
          <span className="text-right font-semibold tabular-nums">{n(r.cup.matriculas)}</span>
          <span className="text-muted">Ganancia nevera</span>
          <span className="text-right font-semibold tabular-nums">{n(r.cup.nevera_ganancia)}</span>
          <span className="text-muted">Gastos</span>
          <span className="text-right font-semibold tabular-nums text-red">−{n(r.cup.gastos)}</span>
          <span className="text-ink font-bold pt-2 border-t border-line mt-1">Neto CUP</span>
          <span className="text-right font-bold tabular-nums pt-2 border-t border-line mt-1">{n(r.cup.neto)}</span>
        </div>
        {Number(r.cup.compras) > 0 && (
          <p className="text-xs text-muted mt-2">
            + {n(r.cup.compras)} CUP puestos en mercancía (no resta de la ganancia, ya está en el costo de lo vendido)
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-blue-soft p-4 shadow-sm">
        <h2 className="font-display text-xs font-semibold uppercase tracking-wide text-blue mb-3">
          Vitrina · USD
        </h2>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-muted">Ventas</span>
          <span className="text-right font-semibold tabular-nums">{n(r.usd.vitrina_ventas)}</span>
          <span className="text-muted">Ganancia</span>
          <span className="text-right font-semibold tabular-nums">{n(r.usd.vitrina_ganancia)}</span>
          <span className="text-muted">Gastos</span>
          <span className="text-right font-semibold tabular-nums text-red">−{n(r.usd.gastos)}</span>
          <span className="text-ink font-bold pt-2 border-t border-line mt-1">Neto USD</span>
          <span className="text-right font-bold tabular-nums pt-2 border-t border-line mt-1">{n(r.usd.neto)}</span>
        </div>
      </section>

      <div className="space-y-1.5">
        {r.fiados_pendientes > 0 && (
          <p className="text-sm text-yellow font-semibold">
            {r.fiados_pendientes} fiado{r.fiados_pendientes === 1 ? '' : 's'} pendiente{r.fiados_pendientes === 1 ? '' : 's'} de cobrar — ver en Vitrina.
          </p>
        )}
        {Number(r.comisiones_pendientes) > 0 && (
          <p className="text-sm text-yellow font-semibold">
            ${n(r.comisiones_pendientes)} en comisiones sin pagar — ver en Equipo.
          </p>
        )}
        {Number(r.mensajeria_pendiente) > 0 && (
          <p className="text-sm text-yellow font-semibold">
            ${n(r.mensajeria_pendiente)} que los mensajeros aún no han rendido — ver en Equipo.
          </p>
        )}
        {Number(r.socios_pendientes) > 0 && (
          <p className="text-sm text-yellow font-semibold">
            ${n(r.socios_pendientes)} por liquidar a socios — ver en Equipo.
          </p>
        )}
        {r.dia_cerrado_hoy && (
          <p className="text-sm text-green-strong font-semibold">Hoy ya está cerrado.</p>
        )}
      </div>

      <p className="text-xs text-muted">Mes en curso · CUP y USD nunca se mezclan.</p>
    </div>
  )
}
