import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function n(v) {
  return Number(v || 0).toLocaleString('es-CU')
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10)
}

function ultimoDiaMes(anio, mes0) {
  return new Date(anio, mes0 + 1, 0).getDate()
}

function rango(periodo, mes, anio) {
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
  if (periodo === 'mes') {
    // mes viene como "YYYY-MM"
    const [y, m] = mes.split('-').map(Number)
    const desde = `${mes}-01`
    const esMesActual = y === hoy.getFullYear() && m - 1 === hoy.getMonth()
    const hasta = esMesActual ? hastaHoy : `${mes}-${String(ultimoDiaMes(y, m - 1)).padStart(2, '0')}`
    return { desde, hasta }
  }
  // año
  const esAnioActual = Number(anio) === hoy.getFullYear()
  return { desde: `${anio}-01-01`, hasta: esAnioActual ? hastaHoy : `${anio}-12-31` }
}

const PERIODOS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'ayer', label: 'Ayer' },
  { id: 'semana', label: '7 días' },
  { id: 'mes', label: 'Mes' },
  { id: 'anio', label: 'Año' }
]

function textoWhatsapp(periodo, r, mes, anio) {
  let etiqueta = PERIODOS.find((p) => p.id === periodo)?.label || periodo
  if (periodo === 'mes') etiqueta = mes
  if (periodo === 'anio') etiqueta = anio
  const lineas = [
    `🏋️ Maykel's Gym — ${etiqueta}`,
    `Matrículas: ${n(r.cup.matriculas)} CUP (${r.cup.matriculas_pagos} pagos)`,
    `Nevera: vendido ${n(r.cup.nevera_ventas)} · ganancia ${n(r.cup.nevera_ganancia)} CUP`,
    `Neto CUP: ${n(r.cup.neto)}`,
    `Vitrina: vendido $${n(r.usd.vitrina_ventas)} · ganancia $${n(r.usd.vitrina_ganancia)}`,
    `Neto USD: $${n(r.usd.neto)}`,
    `Pendientes: ${r.fiados_pendientes} fiados · $${n(r.comisiones_pendientes)} comisiones · $${n(r.mensajeria_pendiente)} mensajería`
  ]
  return lineas.join('\n')
}

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

const hoyRef = new Date()
const MES_ACTUAL = `${hoyRef.getFullYear()}-${String(hoyRef.getMonth() + 1).padStart(2, '0')}`
const ANIO_ACTUAL = String(hoyRef.getFullYear())

export default function Resumen() {
  const [periodo, setPeriodo] = useState('mes')
  const [mes, setMes] = useState(MES_ACTUAL)
  const [anio, setAnio] = useState(ANIO_ACTUAL)
  const [r, setR] = useState(null)
  const [inv, setInv] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const { desde, hasta } = rango(periodo, mes, anio)
    Promise.all([
      supabase.rpc('panel_resumen', { p_desde: desde, p_hasta: hasta }),
      supabase.rpc('inventario_resumen')
    ]).then(([res, invRes]) => {
      if (res.error) setError('Tu usuario no ve la contabilidad completa.')
      else setR(res.data)
      setInv(invRes.data)
    })
  }, [periodo, mes, anio])

  if (error) return <p className="text-sm text-muted">{error}</p>
  if (!r) return <p className="text-sm text-muted">Cargando…</p>

  function compartir() {
    const url = 'https://wa.me/?text=' + encodeURIComponent(textoWhatsapp(periodo, r, mes, anio))
    window.open(url, '_blank')
  }

  const anios = Array.from({ length: 5 }, (_, i) => String(hoyRef.getFullYear() - i))

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

      {periodo === 'mes' && (
        <input type="month" value={mes} max={MES_ACTUAL} onChange={(e) => setMes(e.target.value)}
          className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green" />
      )}
      {periodo === 'anio' && (
        <select value={anio} onChange={(e) => setAnio(e.target.value)}
          className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green bg-surface">
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      )}

      <button onClick={compartir}
        className="w-full rounded-xl border border-green text-green-strong font-semibold py-2.5 text-sm flex items-center justify-center gap-2">
        Compartir resumen por WhatsApp
      </button>

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
