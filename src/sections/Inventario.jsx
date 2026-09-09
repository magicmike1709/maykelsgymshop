import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Inventario({ perfil }) {
  const [resumen, setResumen] = useState(null)
  const [almacenes, setAlmacenes] = useState([])
  const [productos, setProductos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState(null) // producto_id expandido
  const [stockPorAlmacen, setStockPorAlmacen] = useState({})
  const [entradasPorProducto, setEntradasPorProducto] = useState({})

  const [nuevo, setNuevo] = useState(false)
  const [nNombre, setNNombre] = useState('')
  const [nPrecio, setNPrecio] = useState('')
  const [nCosto, setNCosto] = useState('')
  const [nStock, setNStock] = useState('')
  const [nFoto, setNFoto] = useState('')

  const [entradaAbierta, setEntradaAbierta] = useState(false)
  const [eBusqueda, setEBusqueda] = useState('')
  const [eProductoId, setEProductoId] = useState('')
  const [eAlmacenId, setEAlmacenId] = useState('')
  const [eCantidad, setECantidad] = useState('')
  const [eCosto, setECosto] = useState('')
  const [eProveedor, setEProveedor] = useState('')
  const [eMensaje, setEMensaje] = useState('')

  const [dormida, setDormida] = useState(null)
  const [dormidaAbierta, setDormidaAbierta] = useState(false)

  const puedeEditar = perfil?.rol === 'admin' || perfil?.rol === 'operador_plus'
  const enlaceCatalogo = window.location.origin + '/catalogo'

  async function cargarDormida() {
    if (dormida) { setDormidaAbierta((v) => !v); return }
    const { data } = await supabase.rpc('plata_dormida')
    setDormida(data || [])
    setDormidaAbierta(true)
  }

  async function cargar() {
    const [inv, alm, prod] = await Promise.all([
      supabase.rpc('inventario_resumen'),
      supabase.rpc('almacenes_lista'),
      supabase.rpc('productos_lista')
    ])
    setResumen(inv.data)
    setAlmacenes(alm.data || [])
    setProductos(prod.data || [])
    if ((alm.data || []).length > 0 && !eAlmacenId) {
      const principal = alm.data.find((a) => a.es_principal) || alm.data[0]
      setEAlmacenId(principal.id)
    }
  }

  useEffect(() => { cargar() }, [])

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return productos
    return productos.filter((p) => p.nombre.toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q))
  }, [productos, busqueda])

  const productosParaEntrada = useMemo(() => {
    const q = eBusqueda.trim().toLowerCase()
    if (!q) return productos.slice(0, 8)
    return productos.filter((p) => p.nombre.toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q)).slice(0, 8)
  }, [productos, eBusqueda])

  async function toggleProducto(producto) {
    if (abierto === producto.id) { setAbierto(null); return }
    setAbierto(producto.id)
    if (!stockPorAlmacen[producto.id]) {
      const { data } = await supabase.rpc('producto_stock_por_almacen', { p_producto_id: producto.id })
      setStockPorAlmacen((s) => ({ ...s, [producto.id]: data || [] }))
    }
    if (!entradasPorProducto[producto.id]) {
      const { data } = await supabase.rpc('entradas_lista', { p_producto_id: producto.id })
      setEntradasPorProducto((s) => ({ ...s, [producto.id]: data || [] }))
    }
  }

  async function guardarProducto(e) {
    e.preventDefault()
    if (!nNombre || !nPrecio || !nCosto) return
    const { error } = await supabase.rpc('producto_guardar', {
      p_id: null, p_nombre: nNombre, p_precio: Number(nPrecio), p_costo: Number(nCosto),
      p_stock: Number(nStock || 0), p_foto_url: nFoto || null
    })
    if (!error) {
      setNNombre(''); setNPrecio(''); setNCosto(''); setNStock(''); setNFoto(''); setNuevo(false)
      cargar()
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
    setECantidad(''); setECosto(''); setEProveedor(''); setEProductoId(''); setEBusqueda('')
    setStockPorAlmacen({}); setEntradasPorProducto({})
    cargar()
  }

  const productoElegido = productos.find((p) => p.id === eProductoId)

  return (
    <div className="space-y-5 pb-4">
      {resumen && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Productos</div>
            <div className="text-2xl font-bold tabular-nums">{resumen.productos}</div>
            <div className="text-xs text-muted">{Number(resumen.articulos).toLocaleString('es-CU')} artículos</div>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Invertido</div>
            <div className="text-2xl font-bold tabular-nums text-blue">${Number(resumen.invertido).toLocaleString('en-US')}</div>
            <div className="text-xs text-muted">valor: ${Number(resumen.valor).toLocaleString('en-US')}</div>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-green-strong">Catálogo para WhatsApp</h2>
            <p className="text-xs text-muted mt-0.5">Comparte este enlace — se ve sin necesidad de entrar a la app.</p>
          </div>
        </div>
        <div className="mt-2 rounded-lg bg-sunken px-3 py-2 text-xs font-mono break-all text-muted">{enlaceCatalogo}</div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <button onClick={cargarDormida} className="w-full flex items-center justify-between text-left">
          <div>
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-yellow">Plata dormida</h2>
            <p className="text-xs text-muted mt-0.5">Productos con mucho tiempo sin venderse</p>
          </div>
          <span className="text-xs text-muted">{dormidaAbierta ? '−' : '+'}</span>
        </button>
        {dormidaAbierta && dormida && (
          <div className="mt-3 pt-3 border-t border-line space-y-2">
            {dormida.slice(0, 15).map((d) => (
              <div key={d.producto_id} className="flex items-center gap-2.5">
                {d.foto_url
                  ? <img src={d.foto_url} alt="" className="w-8 h-8 rounded-lg object-cover border border-line flex-shrink-0" />
                  : <div className="w-8 h-8 rounded-lg bg-sunken flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{d.nombre}</div>
                  <div className="text-[11px] text-muted">{d.dias_sin_vender} días sin venderse · {d.stock} en stock</div>
                </div>
                <span className="text-xs font-bold tabular-nums text-blue">${Number(d.invertido).toFixed(0)}</span>
              </div>
            ))}
            {dormida.length === 0 && <p className="text-xs text-muted">Todo se está vendiendo bien.</p>}
          </div>
        )}
      </section>

      {puedeEditar && (
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-blue mb-3">Entró mercancía</h2>
          {!entradaAbierta ? (
            <button onClick={() => setEntradaAbierta(true)} className="text-sm font-semibold text-blue">+ Registrar entrada</button>
          ) : (
            <form onSubmit={registrarEntrada} className="space-y-2">
              {!productoElegido ? (
                <div>
                  <input value={eBusqueda} onChange={(e) => setEBusqueda(e.target.value)} placeholder="Buscar producto…"
                    className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-blue" />
                  <div className="mt-1.5 max-h-48 overflow-y-auto rounded-xl border border-line divide-y divide-line">
                    {productosParaEntrada.map((p) => (
                      <button type="button" key={p.id} onClick={() => setEProductoId(p.id)}
                        className="w-full text-left px-3 py-2 text-sm active:bg-blue-soft">
                        {p.nombre}
                      </button>
                    ))}
                    {productosParaEntrada.length === 0 && <p className="px-3 py-2 text-sm text-muted">Sin resultados.</p>}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm">
                  <span className="font-semibold">{productoElegido.nombre}</span>
                  <button type="button" onClick={() => { setEProductoId(''); setEBusqueda('') }} className="text-xs text-red">cambiar</button>
                </div>
              )}

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
                <button type="button" onClick={() => { setEntradaAbierta(false); setEProductoId(''); setEBusqueda('') }} className="text-sm text-muted px-3">Cancelar</button>
              </div>
              {eMensaje && <p className="text-xs text-muted">{eMensaje}</p>}
            </form>
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
              <input value={nFoto} onChange={(e) => setNFoto(e.target.value)} placeholder="Enlace de la foto (opcional)"
                className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-blue" />
              <p className="text-xs text-muted">El stock inicial entra al almacén principal (Gym).</p>
              <div className="flex gap-2">
                <button type="submit" className="flex-1 rounded-xl bg-blue text-white font-semibold py-2.5 text-sm">Guardar</button>
                <button type="button" onClick={() => setNuevo(false)} className="text-sm text-muted px-3">Cancelar</button>
              </div>
            </form>
          )}
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-green-strong">Productos</h2>
          <span className="text-xs text-muted">{productosFiltrados.length}</span>
        </div>
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o código…"
          className="w-full mb-2 rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green" />
        <div className="space-y-2">
          {productosFiltrados.map((p) => (
            <div key={p.id} className="rounded-xl border border-line bg-surface overflow-hidden">
              <button onClick={() => toggleProducto(p)} className="w-full flex items-center gap-3 px-3 py-3 text-left">
                {p.foto_url
                  ? <img src={p.foto_url} alt="" className="w-11 h-11 rounded-lg object-cover border border-line flex-shrink-0" />
                  : <div className="w-11 h-11 rounded-lg bg-sunken flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{p.nombre}</div>
                  <div className="text-xs text-muted tabular-nums">${Number(p.precio).toLocaleString('en-US')} · costo ${Number(p.costo).toFixed(2)}</div>
                </div>
                <span className="text-sm font-bold tabular-nums">{p.stock}</span>
              </button>
              {abierto === p.id && (
                <div className="px-3 pb-3 pt-1 border-t border-line space-y-3">
                  {stockPorAlmacen[p.id] && (
                    <div className="flex gap-4">
                      {stockPorAlmacen[p.id].map((s) => (
                        <span key={s.almacen_id} className="text-xs text-muted">{s.almacen_nombre}: <b className="text-ink">{s.cantidad}</b></span>
                      ))}
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Entradas de este producto</p>
                    {entradasPorProducto[p.id]?.length > 0 ? (
                      <div className="space-y-1">
                        {entradasPorProducto[p.id].map((e) => (
                          <div key={e.id} className="text-xs flex justify-between text-muted">
                            <span>{e.fecha} · {e.almacen_nombre}{e.proveedor ? ' · ' + e.proveedor : ''}</span>
                            <span className="tabular-nums">+{e.cantidad} a ${Number(e.costo_unitario).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted">Sin entradas registradas todavía.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {productosFiltrados.length === 0 && <p className="text-sm text-muted">Sin resultados.</p>}
        </div>
      </section>
    </div>
  )
}
