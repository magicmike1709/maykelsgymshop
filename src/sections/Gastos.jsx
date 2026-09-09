import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Gastos({ perfil }) {
  const [lista, setLista] = useState([])
  const [categorias, setCategorias] = useState([])
  const [concepto, setConcepto] = useState('')
  const [importe, setImporte] = useState('')
  const [moneda, setMoneda] = useState('CUP')
  const [categoriaId, setCategoriaId] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const puedeRegistrar = perfil?.rol === 'admin' || perfil?.rol === 'operador_plus'

  async function cargar() {
    const { data } = await supabase.rpc('gastos_lista')
    setLista(data || [])
    const { data: c } = await supabase.rpc('gasto_categorias_lista')
    setCategorias(c || [])
  }

  useEffect(() => {
    cargar()
  }, [])

  async function guardar(e) {
    e.preventDefault()
    setMensaje('')
    if (!concepto || !importe) return
    setGuardando(true)
    const { error } = await supabase.rpc('gasto_guardar', {
      p_concepto: concepto, p_importe: Number(importe), p_moneda: moneda, p_categoria_id: categoriaId || null
    })
    setGuardando(false)
    if (error) return setMensaje('No se pudo guardar: ' + error.message)
    setConcepto(''); setImporte(''); setCategoriaId('')
    cargar()
  }

  const categoriaSeleccionada = categorias.find((c) => c.id === categoriaId)

  return (
    <div className="space-y-5 pb-4">
      {puedeRegistrar && (
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-red mb-3">Registrar gasto</h2>
          <form onSubmit={guardar} className="space-y-2">
            <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Concepto (ej. Factura de luz)"
              className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-red" required />
            <div className="grid grid-cols-2 gap-2">
              <input value={importe} onChange={(e) => setImporte(e.target.value)} type="number" min="0" placeholder="Importe"
                className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-red" required />
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)}
                className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-red bg-surface">
                <option value="CUP">CUP</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}
              className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-red bg-surface">
              <option value="">Sin categoría</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            {categoriaSeleccionada && !categoriaSeleccionada.en_ganancia && (
              <p className="text-xs text-yellow">
                Esta categoría no resta de la ganancia (ya se cuenta como costo de lo vendido) — se muestra aparte como compra de mercancía.
              </p>
            )}
            <button type="submit" disabled={guardando} className="w-full rounded-xl bg-red text-white font-semibold py-3 disabled:opacity-60">
              {guardando ? 'Guardando…' : 'Guardar gasto'}
            </button>
            {mensaje && <p className="text-sm text-muted">{mensaje}</p>}
          </form>
        </section>
      )}

      <section>
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-green-strong mb-2">Este mes</h2>
        {lista.length === 0 && <p className="text-sm text-muted">Sin gastos registrados todavía.</p>}
        <div className="space-y-2">
          {lista.map((g) => (
            <div key={g.id} className="rounded-xl border border-line bg-surface px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{g.concepto}</div>
                <div className="text-xs text-muted">{g.fecha}{g.categoria ? ' · ' + g.categoria : ''}{!g.en_ganancia ? ' · compra de mercancía' : ''}</div>
              </div>
              <span className="text-sm font-bold tabular-nums">
                {g.moneda === 'USD' ? '$' : ''}{Number(g.importe).toLocaleString('es-CU')}{g.moneda === 'CUP' ? ' CUP' : ''}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
