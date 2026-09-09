import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function n(v) {
  return Number(v || 0).toLocaleString('es-CU')
}

export default function Fondos() {
  const [balance, setBalance] = useState(null)
  const [lista, setLista] = useState([])
  const [tipo, setTipo] = useState('aporte')
  const [moneda, setMoneda] = useState('CUP')
  const [importe, setImporte] = useState('')
  const [concepto, setConcepto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  async function cargar() {
    const { data: b } = await supabase.rpc('fondos_balance')
    setBalance(b)
    const { data: l } = await supabase.rpc('fondos_lista')
    setLista(l || [])
  }

  useEffect(() => {
    cargar()
  }, [])

  async function registrar(e) {
    e.preventDefault()
    if (!importe || !concepto) return
    setGuardando(true)
    setMensaje('')
    const { error } = await supabase.rpc('fondo_registrar', {
      p_tipo: tipo, p_moneda: moneda, p_importe: Number(importe), p_concepto: concepto
    })
    setGuardando(false)
    if (error) return setMensaje('No se pudo guardar: ' + error.message)
    setImporte(''); setConcepto('')
    cargar()
  }

  return (
    <div className="space-y-5 pb-4">
      <p className="text-xs text-muted">
        Dinero que se aparta en conjunto (ahorro, reinversión). No toca la ganancia del día a día ni las ventas.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Fondo CUP</div>
          <div className="text-2xl font-bold tabular-nums text-green-strong">{balance ? n(balance.cup) : '—'}</div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Fondo USD</div>
          <div className="text-2xl font-bold tabular-nums text-blue">{balance ? '$' + n(balance.usd) : '—'}</div>
        </div>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-green-strong mb-3">Registrar movimiento</h2>
        <form onSubmit={registrar} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}
              className="rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green bg-surface">
              <option value="aporte">Aporte (entra)</option>
              <option value="retiro">Retiro (sale)</option>
            </select>
            <select value={moneda} onChange={(e) => setMoneda(e.target.value)}
              className="rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green bg-surface">
              <option value="CUP">CUP</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <input value={importe} onChange={(e) => setImporte(e.target.value)} type="number" min="0" placeholder="Importe" required
            className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green" />
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Concepto (ej. ahorro del mes)" required
            className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green" />
          <button type="submit" disabled={guardando} className="w-full rounded-xl bg-green text-white font-semibold py-3 disabled:opacity-60">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
        {mensaje && <p className="text-sm text-red mt-2">{mensaje}</p>}
      </section>

      <section>
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-green-strong mb-2">Movimientos</h2>
        {lista.length === 0 && <p className="text-sm text-muted">Todavía no hay movimientos.</p>}
        <div className="space-y-2">
          {lista.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-2.5">
              <div>
                <div className="text-sm font-semibold">{m.concepto}</div>
                <div className="text-xs text-muted">{m.fecha}</div>
              </div>
              <span className={'text-sm font-bold tabular-nums ' + (m.tipo === 'aporte' ? 'text-green-strong' : 'text-red')}>
                {m.tipo === 'aporte' ? '+' : '−'}{n(m.importe)} {m.moneda}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
