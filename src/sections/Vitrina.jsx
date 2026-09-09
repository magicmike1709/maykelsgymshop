import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Vitrina({ perfil }) {
  const [productos, setProductos] = useState([])
  const [carrito, setCarrito] = useState({})
  const [resumen, setResumen] = useState(null)
  const [fiados, setFiados] = useState([])
  const [cliente, setCliente] = useState('')
  const [esFiado, setEsFiado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [nuevo, setNuevo] = useState(false)
  const [nNombre, setNNombre] = useState('')
  const [nPrecio, setNPrecio] = useState('')
  const [nCosto, setNCosto] = useState('')
  const [nStock, setNStock] = useState('')

  const puedeEditar = perfil?.rol === 'admin' || perfil?.rol === 'operador_plus'

  async function cargar() {
    const { data: lista } = await supabase.rpc('productos_lista')
    setProductos(lista || [])
    const { data: r } = await supabase.rpc('vitrina_panel')
    setResumen(r)
    const { data: f } = await supabase.rpc('fiados_lista')
    setFiados(f || [])
  }

  useEffect(() => {
    cargar()
  }, [])

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
      p_lineas: lineas, p_cliente: cliente || null, p_telefono: null, p_es_fiado: esFiado
    })
    setGuardando(false)
    if (error) return setMensaje('No se pudo cobrar: ' + error.message)
    setCarrito({}); setCliente(''); setEsFiado(false)
    setMensaje('Venta registrada.')
    cargar()
  }

  async function marcarPagado(id) {
    const { error } = await supabase.rpc('fiado_cobrar', { p_venta_id: id })
    if (!error) cargar()
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
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-blue mb-2">Vender</h2>
        {productos.length === 0 && <p className="text-sm text-muted">Todavía no hay productos en la vitrina. Agrega el primero abajo.</p>}
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
        <div className="rounded-2xl border border-line bg-blue-soft p-4 shadow-sm sticky bottom-20 space-y-2">
          <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Cliente (opcional)"
            className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-blue" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={esFiado} onChange={(e) => setEsFiado(e.target.checked)} />
            Es fiado (no ha pagado)
          </label>
          <div className="flex items-center justify-between">
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
          {!nuevo ? (
            <button onClick={() => setNuevo(true)} className="text-sm font-semibold text-blue">+ Agregar producto</button>
          ) : (
            <form onSubmit={guardarProducto} className="space-y-2">
              <input value={nNombre} onChange={(e) => setNNombre(e.target.value)} placeholder="Nombre"
                className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-blue" required />
              <div className="grid grid-cols-3 gap-2">
                <input value={nPrecio} onChange={(e) => setNPrecio(e.target.value)} type="number" min="0" placeholder="Precio"
                  className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-blue" required />
                <input value={nCosto} onChange={(e) => setNCosto(e.target.value)} type="number" min="0" placeholder="Costo"
                  className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-blue" required />
                <input value={nStock} onChange={(e) => setNStock(e.target.value)} type="number" min="0" placeholder="Stock"
                  className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-blue" />
              </div>
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
