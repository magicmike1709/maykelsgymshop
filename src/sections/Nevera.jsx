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
  if (periodo === 'semana') {
    const hace7 = new Date(hoy)
    hace7.setDate(hace7.getDate() - 6)
    return { desde: fmtDate(hace7), hasta: hastaHoy }
  }
  if (periodo === 'anio') {
    const esAnioActual = Number(anio) === hoy.getFullYear()
    return { desde: `${anio}-01-01`, hasta: esAnioActual ? hastaHoy : `${anio}-12-31` }
  }
  // mes: viene como "YYYY-MM"
  const [y, m] = mes.split('-').map(Number)
  const esMesActual = y === hoy.getFullYear() && m - 1 === hoy.getMonth()
  return { desde: `${mes}-01`, hasta: esMesActual ? hastaHoy : `${mes}-${String(ultimoDiaMes(y, m - 1)).padStart(2, '0')}` }
}

const hoyRefNevera = new Date()
const MES_ACTUAL_NEVERA = `${hoyRefNevera.getFullYear()}-${String(hoyRefNevera.getMonth() + 1).padStart(2, '0')}`
const ANIO_ACTUAL_NEVERA = String(hoyRefNevera.getFullYear())

export default function Nevera({ perfil }) {
  const [productos, setProductos] = useState([])
  const [carrito, setCarrito] = useState({}) // id -> cantidad
  const [resumen, setResumen] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [modo, setModo] = useState('historial') // cobrar | gestionar | historial
  const [editId, setEditId] = useState(null) // null = form cerrado, 'nuevo' = crear, id = editar ese
  const [fNombre, setFNombre] = useState('')
  const [fPrecio, setFPrecio] = useState('')
  const [fCosto, setFCosto] = useState('')

  const [periodoHist, setPeriodoHist] = useState('mes')
  const [mesHist, setMesHist] = useState(MES_ACTUAL_NEVERA)
  const [anioHist, setAnioHist] = useState(ANIO_ACTUAL_NEVERA)
  const [dias, setDias] = useState([])
  const [topProductos, setTopProductos] = useState([])

  const puedeEditar = perfil?.rol === 'admin' || perfil?.rol === 'operador_plus'
  const gestionando = modo === 'gestionar'

  async function cargar() {
    const { data: lista } = await supabase.rpc('refrigerios_lista')
    setProductos(lista || [])
    const { data: r } = await supabase.rpc('refrigerios_panel')
    setResumen(r)
  }

  useEffect(() => {
    cargar()
  }, [])

  useEffect(() => {
    if (modo !== 'historial') return
    const { desde, hasta } = rango(periodoHist, mesHist, anioHist)
    supabase.rpc('refrigerios_historial_dias', { p_desde: desde, p_hasta: hasta }).then(({ data }) => setDias(data || []))
    supabase.rpc('refrigerios_top_productos', { p_desde: desde, p_hasta: hasta }).then(({ data }) => setTopProductos(data || []))
  }, [modo, periodoHist, mesHist, anioHist])

  function tocar(id) {
    setCarrito((c) => ({ ...c, [id]: (c[id] || 0) + 1 }))
  }
  function quitarDelCarrito(id) {
    setCarrito((c) => {
      const n = { ...c }
      if (n[id] > 1) n[id] -= 1
      else delete n[id]
      return n
    })
  }

  const totalCarrito = Object.entries(carrito).reduce((sum, [id, cant]) => {
    const p = productos.find((x) => x.id === id)
    return sum + (p ? p.precio * cant : 0)
  }, 0)

  async function cobrar() {
    setMensaje('')
    setGuardando(true)
    const lineas = Object.entries(carrito).map(([refrigerio_id, cantidad]) => ({ refrigerio_id, cantidad }))
    const { error } = await supabase.rpc('refrigerio_venta_guardar', { p_lineas: lineas })
    setGuardando(false)
    if (error) return setMensaje('No se pudo cobrar: ' + error.message)
    setCarrito({})
    setMensaje('Venta registrada.')
    cargar()
  }

  function abrirNuevo() {
    setEditId('nuevo')
    setFNombre(''); setFPrecio(''); setFCosto('')
  }
  function abrirEditar(p) {
    setEditId(p.id)
    setFNombre(p.nombre); setFPrecio(String(p.precio)); setFCosto(String(p.costo))
  }
  function cerrarForm() {
    setEditId(null)
  }

  async function guardarProducto(e) {
    e.preventDefault()
    if (!fNombre || !fPrecio || !fCosto) return
    const p_id = editId === 'nuevo' ? null : editId
    const { error } = await supabase.rpc('refrigerio_guardar', {
      p_id, p_nombre: fNombre, p_precio: Number(fPrecio), p_costo: Number(fCosto)
    })
    if (!error) {
      cerrarForm()
      cargar()
    }
  }

  async function quitarProducto(p) {
    if (!confirm(`¿Quitar "${p.nombre}" de Nevera? Ya no se podrá vender, pero sus ventas anteriores se conservan.`)) return
    const { error } = await supabase.rpc('refrigerio_baja', { p_id: p.id })
    if (!error) cargar()
  }

  return (
    <div className="space-y-5 pb-28">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Vendido</div>
          <div className="text-2xl font-bold tabular-nums">{resumen ? Number(resumen.total).toLocaleString('es-CU') : '—'}</div>
          <div className="text-xs text-muted">CUP este mes</div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Ganancia</div>
          <div className="text-2xl font-bold tabular-nums text-green-strong">{resumen ? Number(resumen.ganancia).toLocaleString('es-CU') : '—'}</div>
          <div className="text-xs text-muted">este mes</div>
        </div>
      </div>

      <div className="flex gap-1.5">
        <button onClick={() => setModo('historial')}
          className={'flex-1 py-2 rounded-full text-xs font-semibold border ' + (modo === 'historial' ? 'bg-green text-white border-green' : 'border-line text-muted')}>
          Historial
        </button>
        <button onClick={() => setModo('cobrar')}
          className={'flex-1 py-2 rounded-full text-xs font-semibold border ' + (modo === 'cobrar' ? 'bg-green text-white border-green' : 'border-line text-muted')}>
          Fuera del gym
        </button>
        {puedeEditar && (
          <button onClick={() => setModo('gestionar')}
            className={'flex-1 py-2 rounded-full text-xs font-semibold border ' + (modo === 'gestionar' ? 'bg-green text-white border-green' : 'border-line text-muted')}>
            Gestionar
          </button>
        )}
      </div>

      {modo === 'historial' && (
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
            <input type="month" value={mesHist} max={MES_ACTUAL_NEVERA} onChange={(e) => setMesHist(e.target.value)}
              className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-green" />
          )}
          {periodoHist === 'anio' && (
            <select value={anioHist} onChange={(e) => setAnioHist(e.target.value)}
              className="w-full rounded-xl border border-line px-4 py-2 text-sm outline-none focus:border-green bg-surface">
              {Array.from({ length: 5 }, (_, i) => String(hoyRefNevera.getFullYear() - i)).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}

          <div>
            <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-green-strong mb-2">Por día</h3>
            {dias.length === 0 && <p className="text-sm text-muted">Sin ventas en este periodo.</p>}
            <div className="space-y-1.5">
              {dias.map((d) => (
                <div key={d.fecha} className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                  <span className="font-semibold">{d.fecha}</span>
                  <span className="tabular-nums text-muted">{n(d.total)} CUP <span className="text-green-strong font-semibold">· +{n(d.ganancia)}</span></span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-green-strong mb-2">Top productos</h3>
            {topProductos.length === 0 && <p className="text-sm text-muted">Sin ventas en este periodo.</p>}
            <div className="space-y-1.5">
              {topProductos.map((t) => (
                <div key={t.nombre} className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                  <span className="font-semibold">{t.nombre}</span>
                  <span className="tabular-nums text-muted">×{n(t.cantidad)} · {n(t.importe)} CUP</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {modo !== 'historial' && (
      <section>
        {modo === 'cobrar' && (
          <p className="text-xs text-muted mb-3">Para ventas que haces tú o un gestor fuera del gym. Lo que se vende dentro del gym se carga por foto/PDF del IPV en Historial.</p>
        )}
        {productos.length === 0 && <p className="text-sm text-muted">Todavía no hay productos de nevera. Agrega el primero abajo.</p>}

        {!gestionando ? (
          <div className="grid grid-cols-2 gap-2">
            {productos.map((p) => (
              <button key={p.id} onClick={() => tocar(p.id)}
                className="text-left rounded-xl border border-line bg-surface px-3 py-3 shadow-sm active:bg-green-soft">
                <div className="text-sm font-semibold">{p.nombre}</div>
                <div className="text-xs text-muted tabular-nums">{Number(p.precio).toLocaleString('es-CU')} CUP</div>
                {carrito[p.id] > 0 && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs font-bold text-green-strong">×{carrito[p.id]}</span>
                    <button onClick={(e) => { e.stopPropagation(); quitarDelCarrito(p.id) }} className="text-xs text-red">quitar</button>
                  </div>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {productos.map((p) => (
              <div key={p.id}>
                {editId === p.id ? (
                  <form onSubmit={guardarProducto} className="rounded-xl border border-green bg-green-soft p-3 space-y-2">
                    <input value={fNombre} onChange={(e) => setFNombre(e.target.value)} placeholder="Nombre"
                      className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green bg-surface" required />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={fPrecio} onChange={(e) => setFPrecio(e.target.value)} type="number" min="0" placeholder="Precio"
                        className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green bg-surface" required />
                      <input value={fCosto} onChange={(e) => setFCosto(e.target.value)} type="number" min="0" placeholder="Costo"
                        className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green bg-surface" required />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" className="flex-1 rounded-xl bg-green text-white font-semibold py-2.5 text-sm">Guardar</button>
                      <button type="button" onClick={cerrarForm} className="text-sm text-muted px-3">Cancelar</button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2.5 shadow-sm">
                    <div>
                      <div className="text-sm font-semibold">{p.nombre}</div>
                      <div className="text-xs text-muted tabular-nums">
                        Precio {Number(p.precio).toLocaleString('es-CU')} · Costo {Number(p.costo).toLocaleString('es-CU')} CUP
                      </div>
                    </div>
                    <div className="flex gap-3 shrink-0 pl-2">
                      <button onClick={() => abrirEditar(p)} className="text-xs font-semibold text-blue">Editar</button>
                      <button onClick={() => quitarProducto(p)} className="text-xs font-semibold text-red">Quitar</button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {editId === 'nuevo' ? (
              <form onSubmit={guardarProducto} className="rounded-xl border border-green bg-green-soft p-3 space-y-2">
                <input value={fNombre} onChange={(e) => setFNombre(e.target.value)} placeholder="Nombre (ej. Energizante)"
                  className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green bg-surface" required />
                <div className="grid grid-cols-2 gap-2">
                  <input value={fPrecio} onChange={(e) => setFPrecio(e.target.value)} type="number" min="0" placeholder="Precio"
                    className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green bg-surface" required />
                  <input value={fCosto} onChange={(e) => setFCosto(e.target.value)} type="number" min="0" placeholder="Costo"
                    className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green bg-surface" required />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 rounded-xl bg-green text-white font-semibold py-2.5 text-sm">Guardar</button>
                  <button type="button" onClick={cerrarForm} className="text-sm text-muted px-3">Cancelar</button>
                </div>
              </form>
            ) : (
              <button onClick={abrirNuevo} className="w-full text-center rounded-xl border border-dashed border-line py-3 text-sm font-semibold text-green-strong">
                + Agregar producto
              </button>
            )}
          </div>
        )}
      </section>
      )}

      {mensaje && <p className="text-sm text-muted">{mensaje}</p>}

      {modo === 'cobrar' && totalCarrito > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-40 rounded-2xl border border-line bg-yellow-soft p-4 shadow-lg max-w-md mx-auto left-0 right-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-lg font-bold tabular-nums">{totalCarrito.toLocaleString('es-CU')} CUP</span>
          </div>
          <button onClick={cobrar} disabled={guardando}
            className="w-full rounded-xl bg-green text-white font-semibold py-3 disabled:opacity-60">
            {guardando ? 'Cobrando…' : 'Cobrar'}
          </button>
        </div>
      )}
    </div>
  )
}
