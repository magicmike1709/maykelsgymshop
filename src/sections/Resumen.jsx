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

function variacion(actualStr, anteriorStr) {
  const actual = Number(actualStr || 0)
  const anterior = Number(anteriorStr || 0)
  if (anterior === 0) return actual === 0 ? 0 : null
  return ((actual - anterior) / Math.abs(anterior)) * 100
}

function Flecha({ pct }) {
  if (pct === null) return <span className="text-muted">—</span>
  const subiendo = pct >= 0
  return (
    <span className={'font-semibold ' + (subiendo ? 'text-green-strong' : 'text-red')}>
      {subiendo ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%
    </span>
  )
}

function ComparativaFila({ label, actual, anterior, prefijo = '' }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-2.5 text-sm">
      <span className="font-semibold">{label}</span>
      <div className="flex items-center gap-2 tabular-nums">
        <span className="text-muted">{prefijo}{n(anterior)}</span>
        <span className="text-muted">→</span>
        <span className="font-semibold">{prefijo}{n(actual)}</span>
        <Flecha pct={variacion(actual, anterior)} />
      </div>
    </div>
  )
}

function Comparar() {
  const [tipo, setTipo] = useState('semana')
  const [comp, setComp] = useState(null)
  const [margenes, setMargenes] = useState(null)
  const [proyeccion, setProyeccion] = useState(null)

  useEffect(() => {
    supabase.rpc('panel_comparativo', { p_tipo: tipo }).then(({ data }) => setComp(data))
  }, [tipo])

  useEffect(() => {
    const { desde, hasta } = rango('mes', MES_ACTUAL, ANIO_ACTUAL)
    supabase.rpc('panel_margen_categorias', { p_desde: desde, p_hasta: hasta }).then(({ data }) => setMargenes(data))
    supabase.rpc('panel_proyeccion_mes').then(({ data }) => setProyeccion(data))
  }, [])

  return (
    <div className="space-y-6 pb-4">
      <div className="flex gap-1.5">
        {[{ id: 'semana', label: 'Semana vs semana' }, { id: 'mes', label: 'Mes vs mes' }].map((t) => (
          <button key={t.id} onClick={() => setTipo(t.id)}
            className={'flex-1 py-2 rounded-full text-xs font-semibold border ' +
              (tipo === t.id ? 'bg-green text-white border-green' : 'border-line text-muted')}>
            {t.label}
          </button>
        ))}
      </div>

      {!comp ? <p className="text-sm text-muted">Cargando…</p> : (
        <section>
          <h2 className="font-display text-xs font-semibold uppercase tracking-wide mb-2 text-green-strong">
            {comp.actual.desde} → {comp.actual.hasta} vs. período anterior
          </h2>
          <div className="space-y-1.5">
            <ComparativaFila label="Neto CUP" actual={comp.actual.cup.neto} anterior={comp.anterior.cup.neto} />
            <ComparativaFila label="Neto USD" actual={comp.actual.usd.neto} anterior={comp.anterior.usd.neto} prefijo="$" />
            <ComparativaFila label="Matrículas" actual={comp.actual.cup.matriculas} anterior={comp.anterior.cup.matriculas} />
            <ComparativaFila label="Ventas nevera" actual={comp.actual.cup.nevera_ventas} anterior={comp.anterior.cup.nevera_ventas} />
            <ComparativaFila label="Ventas vitrina" actual={comp.actual.usd.vitrina_ventas} anterior={comp.anterior.usd.vitrina_ventas} prefijo="$" />
          </div>
        </section>
      )}

      {proyeccion && (
        <section>
          <h2 className="font-display text-xs font-semibold uppercase tracking-wide mb-2 text-yellow">
            Proyección de cierre de mes (día {proyeccion.dias_transcurridos} de {proyeccion.dias_mes})
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Neto CUP hoy" value={n(proyeccion.neto_cup_actual)} />
            <Tile label="Proyectado CUP" value={n(proyeccion.neto_cup_proyectado)} tono="text-green-strong" />
            <Tile label="Neto USD hoy" value={'$' + n(proyeccion.neto_usd_actual)} />
            <Tile label="Proyectado USD" value={'$' + n(proyeccion.neto_usd_proyectado)} tono="text-blue" />
          </div>
        </section>
      )}

      {margenes && (
        <section>
          <h2 className="font-display text-xs font-semibold uppercase tracking-wide mb-2 text-green-strong">
            Margen por categoría · este mes
          </h2>
          {margenes.length === 0 && <p className="text-sm text-muted">Sin ventas por categoría este mes.</p>}
          <div className="space-y-1.5">
            {margenes.map((m, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-2.5 text-sm">
                <span className="font-semibold">{m.categoria} <span className="text-muted font-normal">({m.moneda})</span></span>
                <span className="tabular-nums">
                  <span className={m.moneda === 'USD' ? 'text-blue' : 'text-green-strong'}>
                    {m.moneda === 'USD' ? '$' : ''}{n(m.ganancia)}
                  </span>
                  <span className="text-muted"> · {m.margen_pct}%</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export default function Resumen() {
  const [vista, setVista] = useState('resumen') // resumen | comparar
  const [periodo, setPeriodo] = useState('mes')
  const [mes, setMes] = useState(MES_ACTUAL)
  const [anio, setAnio] = useState(ANIO_ACTUAL)
  const [r, setR] = useState(null)
  const [inv, setInv] = useState(null)
  const [error, setError] = useState('')
  const [alerta, setAlerta] = useState(null)

  useEffect(() => {
    const { desde, hasta } = rango(periodo, mes, anio)
    Promise.all([
      supabase.rpc('panel_resumen', { p_desde: desde, p_hasta: hasta }),
      supabase.rpc('inventario_resumen'),
      supabase.rpc('descuadres_alerta')
    ]).then(([res, invRes, alertaRes]) => {
      if (res.error) setError('Tu usuario no ve la contabilidad completa.')
      else setR(res.data)
      setInv(invRes.data)
      setAlerta(alertaRes.data)
    })
  }, [periodo, mes, anio])

  const tabsVista = (
    <div className="flex gap-1.5">
      <button onClick={() => setVista('resumen')}
        className={'flex-1 py-2 rounded-full text-xs font-semibold border ' + (vista === 'resumen' ? 'bg-green text-white border-green' : 'border-line text-muted')}>
        Resumen
      </button>
      <button onClick={() => setVista('comparar')}
        className={'flex-1 py-2 rounded-full text-xs font-semibold border ' + (vista === 'comparar' ? 'bg-green text-white border-green' : 'border-line text-muted')}>
        Comparar
      </button>
    </div>
  )

  if (vista === 'comparar') {
    return (
      <div className="space-y-6 pb-4">
        {tabsVista}
        <Comparar />
      </div>
    )
  }

  if (error) return <div className="space-y-6 pb-4">{tabsVista}<p className="text-sm text-muted">{error}</p></div>
  if (!r) return <div className="space-y-6 pb-4">{tabsVista}<p className="text-sm text-muted">Cargando…</p></div>

  function compartir() {
    const url = 'https://wa.me/?text=' + encodeURIComponent(textoWhatsapp(periodo, r, mes, anio))
    window.open(url, '_blank')
  }

  const anios = Array.from({ length: 5 }, (_, i) => String(hoyRef.getFullYear() - i))

  return (
    <div className="space-y-6 pb-4">
      {tabsVista}
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

      {alerta && (alerta.con_descuadre > 0 || alerta.sin_conteo > 0) && (
        <div className="rounded-xl border border-red bg-red-soft px-4 py-2.5 text-sm text-red font-semibold">
          {alerta.con_descuadre > 0 && <>⚠️ {alerta.con_descuadre} descuadre{alerta.con_descuadre === 1 ? '' : 's'} de caja en {alerta.dias} días</>}
          {alerta.con_descuadre > 0 && alerta.sin_conteo > 0 && ' · '}
          {alerta.sin_conteo > 0 && <>{alerta.sin_conteo} cierre{alerta.sin_conteo === 1 ? '' : 's'} sin contar</>}
        </div>
      )}

      {r.dia_cerrado_hoy && <p className="text-sm text-green-strong font-semibold">Hoy ya está cerrado.</p>}
      <p className="text-xs text-muted">CUP y USD nunca se mezclan.</p>
    </div>
  )
}
