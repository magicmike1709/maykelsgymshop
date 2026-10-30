import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fechaLocal as fmtDate } from '../lib/fecha'

function n(v) {
  return Number(v || 0).toLocaleString('es-CU')
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
    `🏋️ Maykel's Gym — ${etiqueta}`, // taste-skill-ignore: es el texto del mensaje de WhatsApp, no la pantalla
    `Matrículas: ${n(r.cup.matriculas)} CUP (${r.cup.matriculas_pagos} pagos)`,
    `Nevera: vendido ${n(r.cup.nevera_ventas)} · ganancia ${n(r.cup.nevera_ganancia)} CUP`,
    `Neto CUP: ${n(r.cup.neto)}`,
    `Vitrina: vendido $${n(r.usd.vitrina_ventas)} · ganancia $${n(r.usd.vitrina_ganancia)}`,
    `Neto USD: $${n(r.usd.neto)}`,
    `Pendientes: ${r.fiados_pendientes} fiados · $${n(r.comisiones_pendientes)} comisiones · $${n(r.mensajeria_pendiente)} mensajería`
  ]
  return lineas.join('\n')
}

// Un selector de una sola fila: el elegido se ve blanco sobre la pista gris.
function Segmentos({ opciones, valor, onCambiar }) {
  return (
    <div className="flex gap-1 rounded-full bg-sunken p-1">
      {opciones.map((o) => (
        <button key={o.id} onClick={() => onCambiar(o.id)}
          className={'flex-1 min-h-[36px] rounded-full text-sm font-semibold ' +
            (valor === o.id ? 'bg-surface text-ink border border-line' : 'text-muted border border-transparent')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Una cifra con su etiqueta encima, para las franjas divididas.
function Cifra({ label, value, sub, tono = 'text-ink' }) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={'text-xl font-semibold tabular-nums leading-tight mt-0.5 ' + tono}>{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  )
}

// Varias cifras en una sola tarjeta, separadas por líneas finas.
function Franja({ titulo, children }) {
  return (
    <section>
      {titulo && <h2 className="text-sm font-semibold mb-2">{titulo}</h2>}
      <div className="grid grid-cols-2 rounded-2xl border border-line bg-surface divide-line [&>*]:border-line [&>*:nth-child(odd)]:border-r [&>*:nth-child(n+3)]:border-t">
        {children}
      </div>
    </section>
  )
}

// Una fila de cuenta: concepto a la izquierda, cifra a la derecha.
function Fila({ label, sub, value, tono = 'text-ink', fuerte = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className={'text-sm ' + (fuerte ? 'font-semibold' : '')}>{label}</div>
        {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
      </div>
      <div className={'text-sm tabular-nums whitespace-nowrap ' + (fuerte ? 'font-semibold ' : '') + tono}>{value}</div>
    </div>
  )
}

// La caja de una moneda: el neto arriba, grande, y debajo la cuenta que lo da.
function Caja({ titulo, neto, unidad, tono, children }) {
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <div className="px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-muted">{titulo}</h2>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className={'text-[32px] leading-none font-bold tabular-nums ' + tono}>{neto}</span>
          <span className="text-sm text-muted">{unidad}</span>
        </div>
      </div>
      <div className="border-t border-line divide-y divide-line">{children}</div>
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
  if (pct === null) return <span className="text-muted w-14 text-right">nuevo</span>
  if (Math.round(pct) === 0) return <span className="text-muted w-14 text-right">igual</span>
  const subiendo = pct > 0
  return (
    <span className={'font-semibold w-14 text-right ' + (subiendo ? 'text-green-strong' : 'text-red')}>
      {subiendo ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%
    </span>
  )
}

function ComparativaFila({ label, actual, anterior, prefijo = '' }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
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

function Tendencia() {
  const [meses, setMeses] = useState(null)

  useEffect(() => {
    supabase.rpc('panel_tendencia_meses', { p_meses: 6 }).then(({ data }) => setMeses(data))
  }, [])

  if (!meses || meses.length === 0) return null

  const maxCup = Math.max(1, ...meses.map((m) => Math.abs(Number(m.neto_cup))))
  const maxUsd = Math.max(1, ...meses.map((m) => Math.abs(Number(m.neto_usd))))

  return (
    <section>
      <h2 className="text-sm font-semibold mb-2">Neto de los últimos {meses.length} meses</h2>
      <div className="rounded-2xl border border-line bg-surface divide-y divide-line">
        {meses.map((m) => (
          <div key={m.mes} className="px-4 py-3">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="font-semibold">{m.mes}</span>
              <span className="tabular-nums">
                <span className="text-green-strong">{n(m.neto_cup)} CUP</span>
                <span className="text-muted"> · </span>
                <span className="text-blue">${n(m.neto_usd)}</span>
              </span>
            </div>
            <div className="flex gap-1 h-1.5">
              <div className="flex-1 rounded-full bg-sunken overflow-hidden">
                <div className="h-full bg-green rounded-full" style={{ width: Math.max(4, Math.abs(Number(m.neto_cup)) / maxCup * 100) + '%' }} />
              </div>
              <div className="flex-1 rounded-full bg-sunken overflow-hidden">
                <div className="h-full bg-blue rounded-full" style={{ width: Math.max(4, Math.abs(Number(m.neto_usd)) / maxUsd * 100) + '%' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Exportar() {
  const [desde, setDesde] = useState(`${MES_ACTUAL}-01`)
  const [hasta, setHasta] = useState(fmtDate(new Date()))
  const [exportando, setExportando] = useState(false)

  async function exportar() {
    setExportando(true)
    const { data, error } = await supabase.rpc('exportar_datos', { p_desde: desde, p_hasta: hasta })
    setExportando(false)
    if (error || !data) return
    const filas = [['Fecha', 'Línea', 'Moneda', 'Total', 'Costo', 'Ganancia', 'Detalle']]
    for (const f of data) {
      filas.push([f.fecha, f.linea, f.moneda, f.total, f.costo ?? '', f.ganancia, (f.detalle || '').replace(/[\r\n,]/g, ' ')])
    }
    const csv = filas.map((fila) => fila.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `maykelsgym_${desde}_a_${hasta}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 space-y-3">
      <h2 className="text-sm font-semibold">Exportar datos</h2>
      <p className="text-sm text-muted">Descarga un respaldo en Excel/CSV de matrículas, nevera, vitrina y gastos del rango elegido — para guardar aparte de la app.</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted mb-1">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-green" />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-green" />
        </div>
      </div>
      <button onClick={exportar} disabled={exportando}
        className="w-full min-h-[44px] rounded-full border border-line bg-surface text-ink font-semibold text-sm disabled:opacity-60">
        {exportando ? 'Generando…' : 'Descargar CSV'}
      </button>
    </section>
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
      <Segmentos
        opciones={[{ id: 'semana', label: 'Semana vs semana' }, { id: 'mes', label: 'Mes vs mes' }]}
        valor={tipo} onCambiar={setTipo} />

      {!comp ? <p className="text-sm text-muted">Cargando…</p> : (
        <section>
          <h2 className="text-sm font-semibold mb-2">
            {comp.actual.desde} → {comp.actual.hasta} <span className="font-normal text-muted">contra el período anterior</span>
          </h2>
          <div className="rounded-2xl border border-line bg-surface divide-y divide-line">
            <ComparativaFila label="Neto CUP" actual={comp.actual.cup.neto} anterior={comp.anterior.cup.neto} />
            <ComparativaFila label="Neto USD" actual={comp.actual.usd.neto} anterior={comp.anterior.usd.neto} prefijo="$" />
            <ComparativaFila label="Matrículas" actual={comp.actual.cup.matriculas} anterior={comp.anterior.cup.matriculas} />
            <ComparativaFila label="Ventas nevera" actual={comp.actual.cup.nevera_ventas} anterior={comp.anterior.cup.nevera_ventas} />
            <ComparativaFila label="Ventas vitrina" actual={comp.actual.usd.vitrina_ventas} anterior={comp.anterior.usd.vitrina_ventas} prefijo="$" />
          </div>
        </section>
      )}

      {proyeccion && (
        <Franja titulo={`Cierre de mes proyectado · día ${proyeccion.dias_transcurridos} de ${proyeccion.dias_mes}`}>
          <Cifra label="Neto CUP hasta hoy" value={n(proyeccion.neto_cup_actual)} />
          <Cifra label="Proyectado CUP" value={n(proyeccion.neto_cup_proyectado)} tono="text-green-strong" />
          <Cifra label="Neto USD hasta hoy" value={'$' + n(proyeccion.neto_usd_actual)} />
          <Cifra label="Proyectado USD" value={'$' + n(proyeccion.neto_usd_proyectado)} tono="text-blue" />
        </Franja>
      )}

      {margenes && (
        <section>
          <h2 className="text-sm font-semibold mb-2">Margen por categoría · este mes</h2>
          {margenes.length === 0 ? (
            <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">Sin ventas por categoría este mes.</p>
          ) : (
            <div className="rounded-2xl border border-line bg-surface divide-y divide-line">
              {margenes.map((m, i) => (
                <Fila key={i}
                  label={<>{m.categoria} <span className="text-muted">({m.moneda})</span></>}
                  value={<>
                    <span className={m.moneda === 'USD' ? 'text-blue' : 'text-green-strong'}>{m.moneda === 'USD' ? '$' : ''}{n(m.ganancia)}</span>
                    <span className="text-muted"> · {m.margen_pct}%</span>
                  </>} />
              ))}
            </div>
          )}
        </section>
      )}

      <Tendencia />
      <Exportar />
    </div>
  )
}

function plural(cant, uno, varios) {
  return `${cant} ${cant === 1 ? uno : varios}`
}

// Lo de hoy (alertas, ayer y el mes proyectado) no depende del período elegido.
function usePanelHoy() {
  const [hoy, setHoy] = useState(null)
  useEffect(() => {
    supabase.rpc('panel_hoy').then(({ data }) => setHoy(data))
  }, [])
  return hoy
}

// Lo que hay que revisar hoy: va primero en la pantalla.
function Alertas({ hoy }) {
  if (!hoy) return null

  const a = hoy.alertas
  const alertas = [
    a.descuadres > 0 && { grave: true, texto: `${plural(a.descuadres, 'descuadre', 'descuadres')} de caja en 30 días` },
    a.sin_conteo > 0 && { texto: `${plural(a.sin_conteo, 'cierre', 'cierres')} sin contar caja` },
    a.clientes_sin_renovar > 0 && { texto: `${plural(a.clientes_sin_renovar, 'cliente', 'clientes')} sin renovar este mes` },
    a.avisos_activos > 0 && { texto: `${plural(a.avisos_activos, 'aviso activo', 'avisos activos')} (stock bajo, etc.)` }
  ].filter(Boolean)

  return (
    <div>
      {alertas.length > 0 ? (
        <section aria-label="Para revisar hoy" className="rounded-2xl overflow-hidden border border-line divide-y divide-line">
          {alertas.map((al) => (
            <p key={al.texto} className={'flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold ' +
              (al.grave ? 'bg-red-soft text-red' : 'bg-yellow-soft text-yellow-ink')}>
              <span aria-hidden="true" className={'w-2 h-2 rounded-full flex-shrink-0 ' + (al.grave ? 'bg-red' : 'bg-yellow')} />
              {al.texto}
            </p>
          ))}
        </section>
      ) : (
        <p className="rounded-2xl bg-green-soft px-4 py-2.5 text-sm font-semibold text-green-strong">Sin alertas activas.</p>
      )}
    </div>
  )
}

function AyerYMes({ hoy }) {
  if (!hoy) return null
  return (
    <Franja titulo="Ayer y hacia dónde va el mes">
        <Cifra label="Ayer · CUP" value={n(hoy.ayer.cup.neto)} tono="text-green-strong" />
        <Cifra label="Ayer · USD" value={'$' + n(hoy.ayer.usd.neto)} tono="text-blue" />
        <Cifra label="Mes proyectado · CUP" value={n(hoy.proyeccion.neto_cup_proyectado)} />
        <Cifra label="Mes proyectado · USD" value={'$' + n(hoy.proyeccion.neto_usd_proyectado)} />
    </Franja>
  )
}

const VISTAS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'comparar', label: 'Comparar' }
]

export default function Resumen() {
  const [vista, setVista] = useState('resumen') // resumen | comparar
  const [periodo, setPeriodo] = useState('mes')
  const [mes, setMes] = useState(MES_ACTUAL)
  const [anio, setAnio] = useState(ANIO_ACTUAL)
  const [r, setR] = useState(null)
  const [inv, setInv] = useState(null)
  const [error, setError] = useState('')
  const hoy = usePanelHoy()

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

  const tabsVista = <Segmentos opciones={VISTAS} valor={vista} onCambiar={setVista} />

  if (vista === 'comparar') {
    return (
      <div className="space-y-6 pb-4">
        <Alertas hoy={hoy} />
        {tabsVista}
        <AyerYMes hoy={hoy} />
        <Comparar />
      </div>
    )
  }

  if (error) return <div className="space-y-6 pb-4"><Alertas hoy={hoy} />{tabsVista}<p className="text-sm text-muted">{error}</p></div>
  if (!r) return <div className="space-y-6 pb-4"><Alertas hoy={hoy} />{tabsVista}<p className="text-sm text-muted">Cargando…</p></div>

  function compartir() {
    const url = 'https://wa.me/?text=' + encodeURIComponent(textoWhatsapp(periodo, r, mes, anio))
    window.open(url, '_blank')
  }

  const anios = Array.from({ length: 5 }, (_, i) => String(hoyRef.getFullYear() - i))
  const debe = (v) => (Number(v) > 0 ? 'text-red' : 'text-ink')

  return (
    <div className="space-y-6 pb-4">
      <Alertas hoy={hoy} />
      {tabsVista}

      <div className="space-y-2">
        <Segmentos opciones={PERIODOS} valor={periodo} onCambiar={setPeriodo} />
        {periodo === 'mes' && (
          <input type="month" value={mes} max={MES_ACTUAL} onChange={(e) => setMes(e.target.value)}
            aria-label="Mes"
            className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-green" />
        )}
        {periodo === 'anio' && (
          <select value={anio} onChange={(e) => setAnio(e.target.value)}
            aria-label="Año"
            className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green bg-surface">
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>

      <div className="space-y-3">

        <Caja titulo="Neto en pesos" neto={n(r.cup.neto)} unidad="CUP" tono="text-green-strong">
          <Fila label="Matrículas" sub={plural(Number(r.cup.matriculas_pagos), 'pago', 'pagos')} value={'+' + n(r.cup.matriculas)} />
          <Fila label="Ganancia de la nevera" sub={`${n(r.cup.nevera_ventas)} vendido en ${plural(Number(r.cup.nevera_ventas_count), 'venta', 'ventas')}`} value={'+' + n(r.cup.nevera_ganancia)} />
          <Fila label="Gastos" value={'−' + n(r.cup.gastos)} tono="text-red" />
          <Fila label="En mercancía" sub="Compras para vender: no es pérdida, no se resta" value={n(r.cup.compras)} tono="text-muted" />
        </Caja>

        <Caja titulo="Neto en dólares" neto={'$' + n(r.usd.neto)} unidad="USD" tono="text-blue">
          <Fila label="Ganancia de la vitrina" sub={`$${n(r.usd.vitrina_ventas)} vendido en ${plural(Number(r.usd.vitrina_ventas_count), 'venta', 'ventas')} · costo $${n(r.usd.vitrina_costo)}`} value={'+$' + n(r.usd.vitrina_ganancia)} />
          <Fila label="Gastos" value={'−$' + n(r.usd.gastos)} tono="text-red" />
        </Caja>

        <button onClick={compartir}
          className="w-full min-h-[44px] rounded-full bg-green text-white font-semibold text-sm">
          Compartir resumen por WhatsApp
        </button>
        {r.dia_cerrado_hoy && <p className="text-sm text-green-strong font-semibold">Hoy ya está cerrado.</p>}
      </div>

      <AyerYMes hoy={hoy} />

      <section>
        <h2 className="text-sm font-semibold">Pendientes por cobrar</h2>
        <p className="text-sm text-muted mt-0.5 mb-2">Dinero que todavía no es tuyo: te lo deben. No está sumado en los netos.</p>
        <div className="rounded-2xl border border-line bg-surface divide-y divide-line">
          <Fila label="Fiados" value={r.fiados_pendientes} tono={debe(r.fiados_pendientes)} />
          <Fila label="Comisiones" value={'$' + n(r.comisiones_pendientes)} tono={debe(r.comisiones_pendientes)} />
          <Fila label="Mensajería" value={'$' + n(r.mensajeria_pendiente)} tono={debe(r.mensajeria_pendiente)} />
          <Fila label="Socios" value={'$' + n(r.socios_pendientes)} tono={debe(r.socios_pendientes)} />
        </div>
      </section>

      {inv && (
        <Franja titulo="Inventario">
          <Cifra label="Productos" value={inv.productos} />
          <Cifra label="Artículos" value={n(inv.articulos)} />
          <Cifra label="Invertido" value={'$' + n(inv.invertido)} />
          <Cifra label="Valor a precio de venta" value={'$' + n(inv.valor)} tono="text-blue" />
        </Franja>
      )}
    </div>
  )
}
