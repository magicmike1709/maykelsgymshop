import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

function n(v) {
  return Number(v || 0).toLocaleString('en-US')
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
  if (periodo === 'semana') {
    const hace7 = new Date(hoy)
    hace7.setDate(hace7.getDate() - 6)
    return { desde: fmtDate(hace7), hasta: hastaHoy }
  }
  if (periodo === 'anio') {
    const esAnioActual = Number(anio) === hoy.getFullYear()
    return { desde: `${anio}-01-01`, hasta: esAnioActual ? hastaHoy : `${anio}-12-31` }
  }
  const [y, m] = mes.split('-').map(Number)
  const esMesActual = y === hoy.getFullYear() && m - 1 === hoy.getMonth()
  return { desde: `${mes}-01`, hasta: esMesActual ? hastaHoy : `${mes}-${String(ultimoDiaMes(y, m - 1)).padStart(2, '0')}` }
}

const hoyRefVitrina = new Date()
const MES_ACTUAL_VITRINA = `${hoyRefVitrina.getFullYear()}-${String(hoyRefVitrina.getMonth() + 1).padStart(2, '0')}`
const ANIO_ACTUAL_VITRINA = String(hoyRefVitrina.getFullYear())

function Historial() {
  const [periodoHist, setPeriodoHist] = useState('mes')
  const [mesHist, setMesHist] = useState(MES_ACTUAL_VITRINA)
  const [anioHist, setAnioHist] = useState(ANIO_ACTUAL_VITRINA)
  const [dias, setDias] = useState([])
  const [topProductos, setTopProductos] = useState([])

  useEffect(() => {
    const { desde, hasta } = rango(periodoHist, mesHist, anioHist)
    supabase.rpc('vitrina_historial_dias', { p_desde: desde, p_hasta: hasta }).then(({ data }) => setDias(data || []))
    supabase.rpc('vitrina_top_productos', { p_desde: desde, p_hasta: hasta }).then(({ data }) => setTopProductos(data || []))
  }, [periodoHist, mesHist, anioHist])

  return (
    <section className="space-y-4">
      <div className="flex gap-1.5">
        {[{ id: 'hoy', label: 'Hoy' }, { id: 'semana', label: '7 días' }, { id: 'mes', label: 'Mes' }, { id: 'anio', label: 'Año' }].map((p) => (
          <button key={p.id} onClick={() => setPeriodoHist(p.id)}
            className={'flex-1 py-1.5 rounded-full text-xs font-semibold border ' + (periodoHist === p.id ? 'bg-yellow text-ink border-yellow' : 'border-line text-muted')}>
            {p.label}
          </button>
        ))}
      </div>

      {periodoHist === 'mes' && (
        <input type="month" value={mesHist} max={MES_ACTUAL_VITRINA} onChange={(e) => setMesHist(e.target.value)}
          className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-blue" />
      )}
      {periodoHist === 'anio' && (
        <select value={anioHist} onChange={(e) => setAnioHist(e.target.value)}
          className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-blue bg-surface">
          {Array.from({ length: 5 }, (_, i) => String(hoyRefVitrina.getFullYear() - i)).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      )}

      <div>
        <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-blue mb-2">Por día</h3>
        {dias.length === 0 && <p className="text-sm text-muted">Sin ventas en este periodo.</p>}
        <div className="space-y-1.5">
          {dias.map((d) => (
            <div key={d.fecha} className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2 text-sm">
              <span className="font-semibold">{d.fecha}</span>
              <span className="tabular-nums text-muted">${n(d.total)} <span className="text-blue font-semibold">· +${n(d.ganancia)}</span></span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-blue mb-2">Top productos</h3>
        {topProductos.length === 0 && <p className="text-sm text-muted">Sin ventas en este periodo.</p>}
        <div className="space-y-1.5">
          {topProductos.map((t) => (
            <div key={t.nombre} className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2 text-sm">
              <span className="font-semibold">{t.nombre}</span>
              <span className="tabular-nums text-muted">×{n(t.cantidad)} · ${n(t.importe)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function Vitrina() {
  const [modo, setModo] = useState('vender') // vender | historial
  const [almacenes, setAlmacenes] = useState([])
  const [almacenId, setAlmacenId] = useState('')
  const [productos, setProductos] = useState([])
  const [combos, setCombos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [carrito, setCarrito] = useState({}) // clave "producto:<id>" o "combo:<id>" -> cantidad
  const [resumen, setResumen] = useState(null)
  const [fiados, setFiados] = useState([])
  const [gestores, setGestores] = useState([])
  const [mensajeros, setMensajeros] = useState([])
  const [cliente, setCliente] = useState('')
  const [esFiado, setEsFiado] = useState(false)
  const [gestorId, setGestorId] = useState('')
  const [esMensajeria, setEsMensajeria] = useState(false)
  const [mensajeroId, setMensajeroId] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function cargarBase() {
    const { data: a } = await supabase.rpc('almacenes_lista')
    setAlmacenes(a || [])
    const principal = (a || []).find((x) => x.es_principal) || (a || [])[0]
    if (principal) setAlmacenId(principal.id)
    const { data: g } = await supabase.rpc('gestores_lista')
    setGestores(g || [])
    const { data: m } = await supabase.rpc('mensajeros_lista')
    setMensajeros(m || [])
    const { data: c } = await supabase.rpc('combos_lista')
    setCombos(c || [])
  }

  async function cargarProductosDelAlmacen(id) {
    if (!id) return
    const { data } = await supabase.rpc('productos_por_almacen', { p_almacen_id: id })
    setProductos(data || [])
  }

  async function cargarResto() {
    const { data: r } = await supabase.rpc('vitrina_panel')
    setResumen(r)
    const { data: f } = await supabase.rpc('fiados_lista')
    setFiados(f || [])
  }

  useEffect(() => { cargarBase(); cargarResto() }, [])
  useEffect(() => { cargarProductosDelAlmacen(almacenId) }, [almacenId])

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return productos
    return productos.filter((p) => p.nombre.toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q))
  }, [productos, busqueda])

  const combosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return combos
    return combos.filter((c) => c.nombre.toLowerCase().includes(q))
  }, [combos, busqueda])

  function tocarProducto(p) {
    const clave = 'producto:' + p.id
    const enCarrito = carrito[clave] || 0
    if (enCarrito >= p.stock) return
    setCarrito((c) => ({ ...c, [clave]: enCarrito + 1 }))
  }
  function tocarCombo(c) {
    const clave = 'combo:' + c.id
    setCarrito((car) => ({ ...car, [clave]: (car[clave] || 0) + 1 }))
  }
  function quitar(clave) {
    setCarrito((c) => {
      const n = { ...c }
      if (n[clave] > 1) n[clave] -= 1
      else delete n[clave]
      return n
    })
  }

  const totalCarrito = Object.entries(carrito).reduce((sum, [clave, cant]) => {
    const [tipo, id] = clave.split(':')
    const item = tipo === 'producto' ? productos.find((x) => x.id === id) : combos.find((x) => x.id === id)
    return sum + (item ? item.precio * cant : 0)
  }, 0)

  async function cobrar() {
    setMensaje('')
    setGuardando(true)
    const lineas = Object.entries(carrito).map(([clave, cantidad]) => {
      const [tipo, id] = clave.split(':')
      return tipo === 'producto' ? { producto_id: id, cantidad } : { combo_id: id, cantidad }
    })
    const { error } = await supabase.rpc('venta_crear', {
      p_lineas: lineas,
      p_cliente: cliente || null,
      p_telefono: null,
      p_es_fiado: esFiado,
      p_gestor_id: gestorId || null,
      p_es_mensajeria: esMensajeria,
      p_mensajero_id: esMensajeria ? (mensajeroId || null) : null,
      p_almacen_id: almacenId
    })
    setGuardando(false)
    if (error) return setMensaje('No se pudo cobrar: ' + error.message)
    setCarrito({}); setCliente(''); setEsFiado(false); setGestorId(''); setEsMensajeria(false); setMensajeroId('')
    setMensaje('Venta registrada.')
    cargarProductosDelAlmacen(almacenId); cargarResto()
  }

  async function marcarPagado(id) {
    const { error } = await supabase.rpc('fiado_cobrar', { p_venta_id: id })
    if (!error) cargarResto()
  }

  function compartirCatalogo() {
    const url = window.location.origin + '/catalogo'
    const texto = `🏋️ Catálogo Maykel's Gym Shop\nPrecios en USD, disponibilidad al momento.\n${url}`
    window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank')
  }

  return (
    <div className="space-y-5 pb-28">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Vendido</div>
          <div className="text-2xl font-bold tabular-nums">{resumen ? Number(resumen.total).toLocaleString('en-US') : '—'}</div>
          <div className="text-xs text-muted">USD este mes</div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Ganancia</div>
          <div className="text-2xl font-bold tabular-nums text-blue">{resumen ? Number(resumen.ganancia).toLocaleString('en-US') : '—'}</div>
          <div className="text-xs text-muted">este mes</div>
        </div>
      </div>

      <button onClick={compartirCatalogo}
        className="w-full rounded-xl border border-blue text-blue font-semibold py-2.5 text-sm">
        Compartir catálogo por WhatsApp
      </button>

      <div className="flex gap-1.5">
        <button onClick={() => setModo('historial')}
          className={'flex-1 py-2 rounded-full text-xs font-semibold border ' + (modo === 'historial' ? 'bg-blue text-white border-blue' : 'border-line text-muted')}>
          Historial
        </button>
        <button onClick={() => setModo('vender')}
          className={'flex-1 py-2 rounded-full text-xs font-semibold border ' + (modo === 'vender' ? 'bg-blue text-white border-blue' : 'border-line text-muted')}>
          Vender
        </button>
      </div>

      {modo === 'historial' && <Historial />}

      {modo === 'vender' && (
      <>
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-blue">Vender</h2>
          {almacenes.length > 1 && (
            <div className="flex gap-1">
              {almacenes.map((a) => (
                <button key={a.id} onClick={() => setAlmacenId(a.id)}
                  className={'text-xs font-semibold px-3 py-1 rounded-full border ' +
                    (almacenId === a.id ? 'bg-blue text-white border-blue' : 'border-line text-muted')}>
                  {a.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto…"
          className="w-full mb-2 rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-blue" />
        {combosFiltrados.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-2">
            {combosFiltrados.map((c) => {
              const clave = 'combo:' + c.id
              return (
                <button key={c.id} onClick={() => tocarCombo(c)}
                  className="text-left rounded-xl border-2 border-yellow bg-yellow-soft px-3 py-3 shadow-sm active:opacity-80">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-yellow mb-0.5">Combo</div>
                  <div className="text-sm font-semibold">{c.nombre}</div>
                  <div className="text-xs text-muted tabular-nums">${Number(c.precio).toLocaleString('en-US')}</div>
                  {carrito[clave] > 0 && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs font-bold text-blue">×{carrito[clave]}</span>
                      <button onClick={(e) => { e.stopPropagation(); quitar(clave) }} className="text-xs text-red">quitar</button>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
        {productos.length === 0 && <p className="text-sm text-muted">No hay stock en este almacén todavía — agrégalo desde Inventario.</p>}
        <div className="grid grid-cols-2 gap-2">
          {productosFiltrados.map((p) => {
            const clave = 'producto:' + p.id
            return (
              <button key={p.id} onClick={() => tocarProducto(p)} disabled={p.stock <= 0}
                className="text-left rounded-xl border border-line bg-surface px-3 py-3 shadow-sm active:bg-blue-soft disabled:opacity-40 flex gap-2.5 items-center">
                {p.foto_url
                  ? <img src={p.foto_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-line flex-shrink-0" />
                  : <div className="w-10 h-10 rounded-lg bg-sunken flex-shrink-0" />}
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{p.nombre}</div>
                  <div className="text-xs text-muted tabular-nums">${Number(p.precio).toLocaleString('en-US')} · stock {p.stock}</div>
                  {carrito[clave] > 0 && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs font-bold text-blue">×{carrito[clave]}</span>
                      <button onClick={(e) => { e.stopPropagation(); quitar(clave) }} className="text-xs text-red">quitar</button>
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {totalCarrito > 0 && (
        <div className="rounded-2xl border border-line bg-blue-soft p-4 shadow-sm space-y-2">
          <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Cliente (opcional)"
            className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-blue" />

          {gestores.length > 0 && (
            <select value={gestorId} onChange={(e) => setGestorId(e.target.value)}
              className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-blue bg-surface">
              <option value="">Sin gestor</option>
              {gestores.map((g) => <option key={g.id} value={g.id}>{g.nombre} (comisión {(g.pct_comision * 100).toFixed(0)}%)</option>)}
            </select>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={esFiado} onChange={(e) => setEsFiado(e.target.checked)} />
            Es fiado (no ha pagado)
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={esMensajeria} onChange={(e) => setEsMensajeria(e.target.checked)} />
            Es mensajería (lo entrega un mensajero)
          </label>
          {esMensajeria && mensajeros.length > 0 && (
            <select value={mensajeroId} onChange={(e) => setMensajeroId(e.target.value)}
              className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-blue bg-surface">
              <option value="">Elige mensajero</option>
              {mensajeros.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          )}
        </div>
      )}
      {mensaje && <p className="text-sm text-muted">{mensaje}</p>}

      {totalCarrito > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-40 rounded-2xl border border-line bg-blue-soft p-4 shadow-lg max-w-md mx-auto left-0 right-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-lg font-bold tabular-nums">${totalCarrito.toLocaleString('en-US')}</span>
          </div>
          <button onClick={cobrar} disabled={guardando}
            className="w-full rounded-xl bg-blue text-white font-semibold py-3 disabled:opacity-60">
            {guardando ? 'Guardando…' : esFiado ? 'Anotar fiado' : 'Cobrar'}
          </button>
        </div>
      )}

      {fiados.length > 0 && (
        <section>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-red mb-2">Fiados pendientes</h2>
          <div className="space-y-2">
            {fiados.map((f) => (
              <div key={f.id} className="rounded-xl border border-line bg-red-soft px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">{f.cliente || 'Sin nombre'}</div>
                  <div className="text-xs text-muted tabular-nums">${Number(f.total).toLocaleString('en-US')}</div>
                </div>
                <button onClick={() => marcarPagado(f.id)} className="text-xs font-semibold text-white bg-green rounded-full px-3 py-1.5">
                  Ya pagó
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      </>
      )}
    </div>
  )
}
