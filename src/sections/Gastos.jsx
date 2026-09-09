import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Gastos({ perfil }) {
  const [lista, setLista] = useState([])
  const [concepto, setConcepto] = useState('')
  const [importe, setImporte] = useState('')
  const [moneda, setMoneda] = useState('CUP')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const puedeRegistrar = perfil?.rol === 'admin' || perfil?.rol === 'operador_plus'

  async function cargar() {
    const { data } = await supabase.rpc('gastos_lista')
    setLista(data || [])
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
      p_concepto: concepto, p_importe: Number(importe), p_moneda: moneda
    })
    setGuardando(false)
    if (error) return setMensaje('No se pudo guardar: ' + error.message)
    setConcepto(''); setImporte('')
    cargar()
  }

  return (
    <div className="space-y-5 pb-4">
      {puedeRegistrar && (
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-red mb-3">Registrar gasto</h2>
          <form onSubmit={guardar} className="space-y-2">
            <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Concepto (ej. Compra de agua)"
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
                <div className="text-xs text-muted">{g.fecha}</div>
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
