import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function n(v) {
  return Number(v || 0).toLocaleString('es-CU')
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10)
}

function rango(periodo) {
  const hoy = new Date()
  const hastaHoy = fmtDate(hoy)
  if (periodo === 'hoy') return { desde: hastaHoy, hasta: hastaHoy }
  if (periodo === 'ayer') {
    const ayer = new Date(hoy)
    ayer.setDate(ayer.getDate() - 1)
    return { desde: fmtDate(ayer), hasta: fmtDate(ayer) }
  }
  if (periodo === 'semana') {
    const hace7 = new Date(hoy)
    hace7.setDate(hace7.getDate() - 6)
    return { desde: fmtDate(hace7), hasta: hastaHoy }
  }
  // mes
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  return { desde: fmtDate(inicioMes), hasta: hastaHoy }
}

const PERIODOS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'ayer', label: 'Ayer' },
  { id: 'semana', label: '7 días' },
  { id: 'mes', label: 'Mes' }
]

function Tile({ label, value, sub, tono = 'text-ink' }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5 shadow-sm">
      <div className="text-[10px] uppercase tracking-wide text-muted font-semibold mb-0.5 leading-tight">{label}</div>
      <div className={'text-lg font-bold tabular-nums leading-tight ' + tono}>{value}</div>
      {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
    </div>
  )
}

function Grupo({ titulo, tono, children }) {
  return (
    <section>
      <h2 className={'font-display text-xs font-semibold uppercase tracking-wide mb-2 ' + tono}>{titulo}</h2>
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </section>
  )
}

export default function Resumen() {
  const [periodo, setPeriodo] = useState('mes')
  const [r, setR] = useState(null)
  const [inv, setInv] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const { desde, hasta } = rango(periodo)
    Promise.all([
      supabase.rpc('panel_resumen', { p_desde: desde, p_hasta: hasta }),
      supabase.rpc('inventario_resumen')
    ]).then(([res, invRes]) => {
      if (res.error) setError('Tu usuario no ve la contabilidad completa.')
      else setR(res.data)
      setInv(invRes.data)
    })
  }, [periodo])

  if (error) return <p className="text-sm text-muted">{error}</p>
  if (!r) return <p className="text-sm text-muted">Cargando…</p>

  return (
    <div className="space-y-6 pb-4">
      <div className="flex gap-1.5">
        {PERIODOS.map((p) => (
          <button key={p.id} onClick={() => setPeriodo(p.id)}
            className={'flex-1 py-2 rounded-full text-xs font-semibold border ' +
              (periodo === p.id ? 'bg-green text-white border-green' : 'border-line text-muted')}>
            {p.label}
          </button>
        ))}
      </div>

      <Grupo titulo="Matrículas del gym · CUP" tono="text-green-strong">
        <Tile label="Cobrado" value={n(r.cup.matriculas)} sub="CUP" />
        <Tile label="Pagos" value={r.cup.matriculas_pagos} />
      </Grupo>

      <Grupo titulo="Nevera · CUP" tono="text-green-strong">
        <Tile label="Ventas" value={r.cup.nevera_ventas_count} />
        <Tile label="Vendido" value={n(r.cup.nevera_ventas)} />
        <Tile label="Ganancia" value={n(r.cup.nevera_ganancia)} tono="text-green-strong" />
      </Grupo>

      <Grupo titulo="Resultado CUP" tono="text-green-strong">
        <Tile label="Gastos" value={n(r.cup.gastos)} tono="text-red" />
        <Tile label="Neto CUP" value={n(r.cup.neto)} tono="text-green-strong" />
        <Tile label="En mercancía" value={n(r.cup.compras)} sub="no resta" />
      </Grupo>

      <Grupo titulo="Vitrina · USD" tono="text-blue">
        <Tile label="Ventas" value={r.usd.vitrina_ventas_count} />
        <Tile label="Vendido" value={'$' + n(r.usd.vitrina_ventas)} />
        <Tile label="Ganancia" value={'$' + n(r.usd.vitrina_ganancia)} tono="text-blue" />
      </Grupo>

      <Grupo titulo="Resultado USD" tono="text-blue">
        <Tile label="Costo" value={'$' + n(r.usd.vitrina_costo)} />
        <Tile label="Gastos" value={'$' + n(r.usd.gastos)} tono="text-red" />
        <Tile label="Neto USD" value={'$' + n(r.usd.neto)} tono="text-blue" />
      </Grupo>

      {inv && (
        <Grupo titulo="Inventario" tono="text-green-strong">
          <Tile label="Productos" value={inv.productos} />
          <Tile label="Artículos" value={n(inv.articulos)} />
          <Tile label="Invertido" value={'$' + n(inv.invertido)} />
          <Tile label="Valor" value={'$' + n(inv.valor)} tono="text-blue" sub="a precio de venta" />
        </Grupo>
      )}

      <Grupo titulo="Pendientes" tono="text-yellow">
        <Tile label="Fiados" value={r.fiados_pendientes} tono={r.fiados_pendientes > 0 ? 'text-red' : 'text-ink'} />
        <Tile label="Comisiones" value={'$' + n(r.comisiones_pendientes)} tono={Number(r.comisiones_pendientes) > 0 ? 'text-red' : 'text-ink'} />
        <Tile label="Mensajería" value={'$' + n(r.mensajeria_pendiente)} tono={Number(r.mensajeria_pendiente) > 0 ? 'text-red' : 'text-ink'} />
        <Tile label="Socios" value={'$' + n(r.socios_pendientes)} tono={Number(r.socios_pendientes) > 0 ? 'text-red' : 'text-ink'} />
      </Grupo>

      {r.dia_cerrado_hoy && <p className="text-sm text-green-strong font-semibold">Hoy ya está cerrado.</p>}
      <p className="text-xs text-muted">CUP y USD nunca se mezclan.</p>
    </div>
  )
}
