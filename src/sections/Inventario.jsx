import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Inventario({ perfil }) {
  const [resumen, setResumen] = useState(null)
  const [almacenes, setAlmacenes] = useState([])
  const [productos, setProductos] = useState([])
  const [stockPorAlmacen, setStockPorAlmacen] = useState({}) // producto_id -> [{almacen_nombre, cantidad}]
  const [entradas, setEntradas] = useState([])

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

  const puedeEditar = perfil?.rol === 'admin' || perfil?.rol === 'operador_plus'

  async function cargar() {
    const [inv, alm, prod, ent] = await Promise.all([
      supabase.rpc('inventario_resumen'),
      supabase.rpc('almacenes_lista'),
      supabase.rpc('productos_lista'),
      supabase.rpc('entradas_lista')
    ])
    setResumen(inv.data)
    setAlmacenes(alm.data || [])
    setProductos(prod.data || [])
    setEntradas(ent.data || [])
    if ((alm.data || []).length > 0 && !eAlmacenId) {
      const principal = alm.data.find((a) => a.es_principal) || alm.data[0]
      setEAlmacenId(principal.id)
    }
  }

  useEffect(() => { cargar() }, [])

  async function verStockPorAlmacen(productoId) {
    if (stockPorAlmacen[productoId]) {
      setStockPorAlmacen((s) => { const n = { ...s }; delete n[productoId]; return n })
      return
    }
    const { data } = await supabase.rpc('producto_stock_por_almacen', { p_producto_id: productoId })
    setStockPorAlmacen((s) => ({ ...s, [productoId]: data || [] }))
  }

  async function guardarProducto(e) {
    e.preventDefault()
    if (!nNombre || !nPrecio || !nCosto) return
    const { error } = await supabase.rpc('producto_guardar', {
      p_id: null, p_nombre: nNombre, p_precio: Number(nPrecio), p_costo: Number(nCosto), p_stock: Number(nStock || 0)
    })
    if (!error) {
      setNNombre(''); setNPrecio(''); setNCosto(''); setNStock(''); setNuevo(false)
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
    setECantidad(''); setECosto(''); setEProveedor('')
    cargar()
  }

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
                {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
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
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-green-strong mb-2">Productos</h2>
        <div className="space-y-2">
          {productos.map((p) => (
            <div key={p.id} className="rounded-xl border border-line bg-surface px-4 py-3">
              <button onClick={() => verStockPorAlmacen(p.id)} className="w-full flex items-center justify-between text-left">
                <div>
                  <div className="text-sm font-semibold">{p.nombre}</div>
                  <div className="text-xs text-muted tabular-nums">${Number(p.precio).toLocaleString('en-US')} · costo ${Number(p.costo).toFixed(2)}</div>
                </div>
                <span className="text-sm font-bold tabular-nums">{p.stock}</span>
              </button>
              {stockPorAlmacen[p.id] && (
                <div className="mt-2 pt-2 border-t border-line flex gap-4">
                  {stockPorAlmacen[p.id].map((s) => (
                    <span key={s.almacen_id} className="text-xs text-muted">{s.almacen_nombre}: <b className="text-ink">{s.cantidad}</b></span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {productos.length === 0 && <p className="text-sm text-muted">Sin productos todavía.</p>}
        </div>
      </section>
    </div>
  )
}
