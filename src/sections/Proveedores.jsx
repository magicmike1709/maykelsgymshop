import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fechaLocal } from '../lib/fecha'
import { dinero, msgError } from './inventario/util'

const campo = 'w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-blue'
const MOVS_VISIBLES = 8

function Tarjeta({ c, abierto, onAbrir, onCambio }) {
  const [movs, setMovs] = useState([])
  const [verTodo, setVerTodo] = useState(false)
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [fecha, setFecha] = useState(fechaLocal(new Date()))
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  async function cargarMovs() {
    const { data } = await supabase.rpc('proveedor_detalle', { p_proveedor: c.proveedor })
    setMovs(data || [])
  }

  useEffect(() => {
    if (abierto) cargarMovs()
  }, [abierto, c.proveedor, c.pagado, c.recibido])

  async function pagar(e) {
    e.preventDefault()
    setMensaje('')
    const valor = Number(monto)
    if (!valor || valor <= 0) return setMensaje('Escribe cuánto le entregaste.')
    setGuardando(true)
    const { error } = await supabase.rpc('proveedor_pago_registrar', {
      p_proveedor: c.proveedor, p_monto: valor, p_fecha: fecha || null, p_nota: nota || null
    })
    setGuardando(false)
    if (error) return setMensaje(msgError(error))
    setMonto(''); setNota('')
    onCambio()
  }

  async function borrar(m) {
    if (!window.confirm(`¿Borrar el pago de ${dinero(m.importe, 2)} del ${m.fecha}? Volverá a contar como deuda.`)) return
    const { error } = await supabase.rpc('proveedor_pago_borrar', { p_id: m.id })
    if (error) return setMensaje(msgError(error))
    onCambio()
  }

  const debe = Number(c.debe)
  const color = debe > 0 ? 'text-red' : debe < 0 ? 'text-blue' : 'text-green-strong'
  const etiqueta = debe > 0 ? 'Le debes' : debe < 0 ? 'A tu favor' : 'Al día'
  const visibles = verTodo ? movs : movs.slice(0, MOVS_VISIBLES)

  return (
    <div className="rounded-2xl border border-line bg-surface overflow-hidden">
      <button onClick={onAbrir} aria-expanded={abierto} className="w-full text-left p-4 active:bg-sunken">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display font-semibold uppercase tracking-wide truncate">{c.proveedor}</div>
            <div className="text-xs text-muted mt-0.5">
              Recibido {dinero(c.recibido, 2)} · Pagado {dinero(c.pagado, 2)}
            </div>
            <div className="text-xs text-muted">{Number(c.unidades).toLocaleString('en-US')} unidades</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{etiqueta}</div>
            <div className={'text-2xl font-bold tabular-nums ' + color}>{dinero(Math.abs(debe), 2)}</div>
          </div>
        </div>
      </button>

      {abierto && (
        <div className="border-t border-line p-4 space-y-4">
          <form onSubmit={pagar} className="space-y-2">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-blue">Registrar pago entregado</h3>
            <div className="grid grid-cols-2 gap-2">
              <input value={monto} onChange={(e) => setMonto(e.target.value)} type="number" min="0" step="0.01" inputMode="decimal"
                placeholder="Monto USD" className={campo} />
              <input value={fecha} onChange={(e) => setFecha(e.target.value)} type="date" max={fechaLocal(new Date())} className={campo} />
            </div>
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (qué cubre este pago)" className={campo} />
            <button type="submit" disabled={guardando}
              className="w-full rounded-xl bg-blue text-white font-semibold py-3 disabled:opacity-60">
              {guardando ? 'Guardando…' : 'Guardar pago'}
            </button>
            {mensaje && <p className="text-sm text-red">{mensaje}</p>}
          </form>

          <div>
            <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-blue mb-2">Movimientos</h3>
            {movs.length === 0 && <p className="text-sm text-muted">Sin movimientos.</p>}
            <div className="space-y-1.5">
              {visibles.map((m) => (
                <div key={m.tipo + m.id}
                  className={'flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ' +
                    (m.tipo === 'pago' ? 'border-green bg-green-soft' : 'border-line bg-surface')}>
                  <div className="min-w-0">
                    <div className="font-semibold break-words">
                      {m.tipo === 'pago' ? 'Pago' : m.concepto}
                      {m.tipo === 'entrada' && <span className="text-muted font-normal"> ×{Number(m.cantidad).toLocaleString('en-US')}</span>}
                    </div>
                    <div className="text-xs text-muted break-words">
                      {m.fecha}{m.tipo === 'pago' && m.concepto && m.concepto !== 'Pago' ? ' · ' + m.concepto : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={'tabular-nums font-bold ' + (m.tipo === 'pago' ? 'text-green-strong' : 'text-ink')}>
                      {m.tipo === 'pago' ? '−' : '+'}{dinero(m.importe, 2)}
                    </span>
                    {m.tipo === 'pago' && (
                      <button onClick={() => borrar(m)} aria-label="Borrar pago" className="text-xs text-red px-1">borrar</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {movs.length > MOVS_VISIBLES && (
              <button onClick={() => setVerTodo((v) => !v)} className="mt-2 text-xs font-semibold text-blue">
                {verTodo ? 'Ver menos' : `Ver todos (${movs.length})`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Proveedores() {
  const [cuentas, setCuentas] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const [error, setError] = useState('')

  async function cargar() {
    const { data, error: err } = await supabase.rpc('proveedores_cuenta')
    if (err) return setError(msgError(err))
    setError('')
    setCuentas(data || [])
    if (abierto === null && (data || []).length === 1) setAbierto(data[0].proveedor)
  }

  useEffect(() => { cargar() }, [])

  const totalDebes = (cuentas || []).reduce((s, c) => s + Math.max(0, Number(c.debe)), 0)

  return (
    <div className="space-y-5 pb-4">
      <p className="text-xs text-muted">
        Lo que le debes a cada proveedor: la mercancía que registras en Inventario (“Entró mercancía”, con el nombre del proveedor) menos lo que ya le entregaste.
      </p>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Debes en total</div>
        <div className={'text-3xl font-bold tabular-nums ' + (totalDebes > 0 ? 'text-red' : 'text-green-strong')}>
          {cuentas ? dinero(totalDebes, 2) : '—'}
        </div>
      </div>

      {error && <p className="text-sm text-red">{error}</p>}
      {cuentas && cuentas.length === 0 && !error && (
        <p className="text-sm text-muted">Todavía no hay mercancía registrada con nombre de proveedor.</p>
      )}

      <div className="space-y-3">
        {(cuentas || []).map((c) => (
          <Tarjeta key={c.proveedor} c={c}
            abierto={abierto === c.proveedor}
            onAbrir={() => setAbierto(abierto === c.proveedor ? null : c.proveedor)}
            onCambio={cargar} />
        ))}
      </div>
    </div>
  )
}
