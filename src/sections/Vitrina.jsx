import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Vitrina({ perfil }) {
  const [almacenes, setAlmacenes] = useState([])
  const [almacenId, setAlmacenId] = useState('')
  const [productos, setProductos] = useState([])
  const [carrito, setCarrito] = useState({})
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

  const [nuevo, setNuevo] = useState(false)
  const [nNombre, setNNombre] = useState('')
  const [nPrecio, setNPrecio] = useState('')
  const [nCosto, setNCosto] = useState('')
  const [nStock, setNStock] = useState('')

  const [entradaAbierta, setEntradaAbierta] = useState(false)
  const [eProductoId, setEProductoId] = useState('')
  const [eAlmacenId, setEAlmacenId] = useState('')
  const [eCantidad, setECantidad] = useState('')
  const [eCosto, setECosto] = useState('')
  const [eProveedor, setEProveedor] = useState('')
  const [eMensaje, setEMensaje] = useState('')
  const [todosProductos, setTodosProductos] = useState([])
  const [entradas, setEntradas] = useState([])

  const puedeEditar = perfil?.rol === 'admin' || perfil?.rol === 'operador_plus'

  async function cargarAlmacenesYCatalogos() {
    const { data: a } = await supabase.rpc('almacenes_lista')
    setAlmacenes(a || [])
    const principal = (a || []).find((x) => x.es_principal) || (a || [])[0]
    if (principal) { setAlmacenId(principal.id); setEAlmacenId(principal.id) }
    const { data: todos } = await supabase.rpc('productos_lista')
    setTodosProductos(todos || [])
    const { data: g } = await supabase.rpc('gestores_lista')
    setGestores(g || [])
    const { data: m } = await supabase.rpc('mensajeros_lista')
    setMensajeros(m || [])
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
    const { data: e } = await supabase.rpc('entradas_lista')
    setEntradas(e || [])
  }

  useEffect(() => { cargarAlmacenesYCatalogos(); cargarResto() }, [])
  useEffect(() => { cargarProductosDelAlmacen(almacenId) }, [almacenId])

  function tocar(p) {
    const enCarrito = carrito[p.id] || 0
    if (enCarrito >= p.stock) return
    setCarrito((c) => ({ ...c, [p.id]: enCarrito + 1 }))
  }
  function quitar(id) {
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
    const lineas = Object.entries(carrito).map(([producto_id, cantidad]) => ({ producto_id, cantidad }))
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

  async function guardarProducto(e) {
    e.preventDefault()
    if (!nNombre || !nPrecio || !nCosto) return
    const { error } = await supabase.rpc('producto_guardar', {
      p_id: null, p_nombre: nNombre, p_precio: Number(nPrecio), p_costo: Number(nCosto), p_stock: Number(nStock || 0)
    })
    if (!error) {
      setNNombre(''); setNPrecio(''); setNCosto(''); setNStock(''); setNuevo(false)
      cargarAlmacenesYCatalogos(); cargarProductosDelAlmacen(almacenId)
    }
  }

  async function registrarEntrada(e) {
    e.preventDefault()
    setEMensaje('')
    if (!eProductoId || !eAlmacenId || !eCantidad || !eCosto) return
    const { data, error } = await supabase.rpc('entrada_registrar', {
      p_producto_id: eProductoId, p_almacen_id: eAlmacenId,
      p_cantidad: Number(eCantidad), p_costo_unitario: Number(eCosto),
      p_proveedor: eProveedor || null
    })
    if (error) return setEMensaje('No se pudo guardar: ' + error.message)
    setEMensaje('Entrada guardada. Costo promedio ahora: $' + Number(data.costo_nuevo).toFixed(2))
    setECantidad(''); setECosto(''); setEProveedor('')
    cargarAlmacenesYCatalogos(); cargarProductosDelAlmacen(almacenId); cargarResto()
  }

  return (
    <div className="space-y-5 pb-4">
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
        {productos.length === 0 && <p className="text-sm text-muted">No hay stock en este almacén todavía.</p>}
        <div className="grid grid-cols-2 gap-2">
          {productos.map((p) => (
            <button key={p.id} onClick={() => tocar(p)} disabled={p.stock <= 0}
              className="text-left rounded-xl border border-line bg-surface px-3 py-3 shadow-sm active:bg-blue-soft disabled:opacity-40">
              <div className="text-sm font-semibold">{p.nombre}</div>
              <div className="text-xs text-muted tabular-nums">${Number(p.precio).toLocaleString('en-US')} · stock {p.stock}</div>
              {carrito[p.id] > 0 && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs font-bold text-blue">×{carrito[p.id]}</span>
                  <button onClick={(e) => { e.stopPropagation(); quitar(p.id) }} className="text-xs text-red">quitar</button>
                </div>
              )}
            </button>
          ))}
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

          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-lg font-bold tabular-nums">${totalCarrito.toLocaleString('en-US')}</span>
          </div>
          <button onClick={cobrar} disabled={guardando}
            className="w-full rounded-xl bg-blue text-white font-semibold py-3 disabled:opacity-60">
            {guardando ? 'Guardando…' : esFiado ? 'Anotar fiado' : 'Cobrar'}
          </button>
        </div>
      )}
      {mensaje && <p className="text-sm text-muted">{mensaje}</p>}

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

      {puedeEditar && (
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-blue mb-3">Entró mercancía</h2>
          {!entradaAbierta ? (
            <button onClick={() => setEntradaAbierta(true)} className="text-sm font-semibold text-blue">+ Registrar entrada</button>
          ) : (
            <form onSubmit={registrarEntrada} className="space-y-2">
              <select value={eProductoId} onChange={(e) => setEProductoId(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-blue bg-surface" required>
                <option value="">Elige producto</option>
                {todosProductos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              {almacenes.length > 1 && (
                <select value={eAlmacenId} onChange={(e) => setEAlmacenId(e.target.value)}
                  className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-blue bg-surface">
                  {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input value={eCantidad} onChange={(e) => setECantidad(e.target.value)} type="number" min="0" step="1" placeholder="Cantidad"
                  className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-blue" required />
                <input value={eCosto} onChange={(e) => setECosto(e.target.value)} type="number" min="0" step="0.01" placeholder="Costo unitario"
                  className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-blue" required />
              </div>
              <input value={eProveedor} onChange={(e) => setEProveedor(e.target.value)} placeholder="Proveedor (opcional)"
                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-blue" />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 rounded-xl bg-blue text-white text-sm font-semibold py-2.5">Guardar entrada</button>
                <button type="button" onClick={() => setEntradaAbierta(false)} className="text-sm text-muted px-3">Cancelar</button>
              </div>
              {eMensaje && <p className="text-xs text-muted">{eMensaje}</p>}
            </form>
          )}

          {entradas.length > 0 && (
            <div className="mt-3 pt-3 border-t border-line space-y-1.5">
              <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Últimas entradas</p>
              {entradas.slice(0, 5).map((e) => (
                <div key={e.id} className="text-xs flex justify-between text-muted">
                  <span>{e.producto_nombre} · {e.almacen_nombre} · {e.fecha}</span>
                  <span className="tabular-nums">+{e.cantidad} a ${Number(e.costo_unitario).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {puedeEditar && (
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          {!nuevo ? (
            <button onClick={() => setNuevo(true)} className="text-sm font-semibold text-blue">+ Producto nuevo</button>
          ) : (
            <form onSubmit={guardarProducto} className="space-y-2">
              <input value={nNombre} onChange={(e) => setNNombre(e.target.value)} placeholder="Nombre"
                className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-blue" required />
              <div className="grid grid-cols-3 gap-2">
                <input value={nPrecio} onChange={(e) => setNPrecio(e.target.value)} type="number" min="0" placeholder="Precio"
                  className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-blue" required />
                <input value={nCosto} onChange={(e) => setNCosto(e.target.value)} type="number" min="0" placeholder="Costo"
                  className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-blue" required />
                <input value={nStock} onChange={(e) => setNStock(e.target.value)} type="number" min="0" placeholder="Stock inicial"
                  className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-blue" />
              </div>
              <p className="text-xs text-muted">El stock inicial entra al almacén principal (Gym). Para sumar más después, usa "Registrar entrada".</p>
              <div className="flex gap-2">
                <button type="submit" className="flex-1 rounded-xl bg-blue text-white font-semibold py-2.5 text-sm">Guardar</button>
                <button type="button" onClick={() => setNuevo(false)} className="text-sm text-muted px-3">Cancelar</button>
              </div>
            </form>
          )}
        </section>
      )}
    </div>
  )
}
