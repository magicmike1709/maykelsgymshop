import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { dinero, msgError } from './util'

const MOTIVOS = [
  { id: 'conteo', texto: 'Conteo: escribo lo que hay', saca: false },
  { id: 'rotura', texto: 'Se rompió o venció', saca: true },
  { id: 'perdida', texto: 'Se perdió', saca: true },
  { id: 'regalo', texto: 'Regalo / muestra', saca: true },
  { id: 'otro', texto: 'Otro: escribo lo que hay', saca: false }
]
const campo = 'w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-blue'

export default function AjusteStock({ producto, almacenes, stockAlmacenes, onListo, onCancelar }) {
  const principal = almacenes.find((a) => a.es_principal) || almacenes[0]
  const [almacenId, setAlmacenId] = useState(principal?.id || '')
  const [motivo, setMotivo] = useState('conteo')
  const [valor, setValor] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const m = MOTIVOS.find((x) => x.id === motivo)
  const actual = Number((stockAlmacenes || []).find((s) => s.almacen_id === almacenId)?.cantidad ?? 0)
  const n = valor === '' ? null : Number(valor)
  const nueva = n === null ? null : m.saca ? actual - n : n
  const dif = nueva === null ? null : nueva - actual
  const invalida = nueva === null || nueva < 0

  async function guardar(e) {
    e.preventDefault()
    if (invalida) return setError(nueva < 0 ? 'No puedes sacar más de lo que hay.' : 'Escribe la cantidad.')
    setGuardando(true); setError('')
    const { error: err } = await supabase.rpc('stock_ajustar', {
      p_producto_id: producto.id, p_almacen_id: almacenId, p_nueva_cantidad: nueva, p_motivo: motivo, p_nota: nota || null
    })
    setGuardando(false)
    if (err) return setError(msgError(err))
    onListo()
  }

  return (
    <form onSubmit={guardar} className="space-y-2 rounded-xl bg-sunken p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Ajustar stock</p>
      <select value={motivo} onChange={(e) => { setMotivo(e.target.value); setValor('') }} className={campo + ' bg-surface'}>
        {MOTIVOS.map((x) => <option key={x.id} value={x.id}>{x.texto}</option>)}
      </select>
      {almacenes.length > 1 && (
        <select value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} className={campo + ' bg-surface'}>
          {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
      )}
      <input value={valor} onChange={(e) => setValor(e.target.value)} type="number" inputMode="numeric" min="0" step="1"
        placeholder={m.saca ? 'Cuántas unidades salen' : 'Cuántas hay realmente'} className={campo + ' bg-surface'} />
      <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" className={campo + ' bg-surface'} />
      <p className="text-xs text-muted tabular-nums">
        Ahora: <b className="text-ink">{actual}</b>
        {dif !== null && !invalida && (
          <> → quedarán <b className="text-ink">{nueva}</b> ({dif > 0 ? '+' : ''}{dif} · {dinero(dif * Number(producto.costo), 2)})</>
        )}
      </p>
      {error && <p className="text-xs text-red">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={guardando} className="flex-1 rounded-xl bg-blue text-white text-sm font-semibold py-2 disabled:opacity-60">
          {guardando ? 'Guardando…' : 'Guardar ajuste'}
        </button>
        <button type="button" onClick={onCancelar} className="text-sm text-muted px-3">Cancelar</button>
      </div>
    </form>
  )
}
