import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function n(v) {
  return Number(v || 0).toLocaleString('es-CU')
}

export default function Gastos({ perfil }) {
  const [lista, setLista] = useState([])
  const [categorias, setCategorias] = useState([])
  const [fijos, setFijos] = useState([])
  const [panel, setPanel] = useState(null)

  const [concepto, setConcepto] = useState('')
  const [importe, setImporte] = useState('')
  const [moneda, setMoneda] = useState('CUP')
  const [categoriaId, setCategoriaId] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const [mostrarFijos, setMostrarFijos] = useState(false)
  const [fijoConcepto, setFijoConcepto] = useState('')
  const [fijoImporte, setFijoImporte] = useState('')
  const [fijoMoneda, setFijoMoneda] = useState('CUP')
  const [fijoCategoriaId, setFijoCategoriaId] = useState('')
  const [fijoDia, setFijoDia] = useState('1')
  const [guardandoFijo, setGuardandoFijo] = useState(false)

  const puedeRegistrar = perfil?.rol === 'admin' || perfil?.rol === 'operador_plus'

  async function cargar() {
    const { data } = await supabase.rpc('gastos_lista')
    setLista(data || [])
    const { data: c } = await supabase.rpc('gasto_categorias_lista')
    setCategorias(c || [])
    const { data: f } = await supabase.rpc('gastos_fijos_lista')
    setFijos(f || [])
    const { data: p } = await supabase.rpc('gastos_panel')
    setPanel(p)
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

  async function borrar(id) {
    if (!window.confirm('¿Borrar este gasto?')) return
    const { error } = await supabase.rpc('gasto_borrar', { p_id: id })
    if (error) return setMensaje('No se pudo borrar: ' + error.message)
    cargar()
  }

  async function cargarFijo(id) {
    const { error } = await supabase.rpc('gasto_fijo_cargar', { p_id: id })
    if (error) return setMensaje('No se pudo cargar: ' + error.message)
    cargar()
  }

  async function guardarFijo(e) {
    e.preventDefault()
    if (!fijoConcepto || !fijoImporte) return
    setGuardandoFijo(true)
    const { error } = await supabase.rpc('gasto_fijo_guardar', {
      p_id: null, p_concepto: fijoConcepto, p_importe: Number(fijoImporte), p_moneda: fijoMoneda,
      p_categoria_id: fijoCategoriaId || null, p_dia_mes: Number(fijoDia)
    })
    setGuardandoFijo(false)
    if (error) return setMensaje('No se pudo guardar el gasto fijo: ' + error.message)
    setFijoConcepto(''); setFijoImporte(''); setFijoCategoriaId(''); setFijoDia('1')
    cargar()
  }

  async function quitarFijo(id) {
    if (!window.confirm('¿Dejar de repetir este gasto cada mes? (no borra lo ya cargado)')) return
    const { error } = await supabase.rpc('gasto_fijo_desactivar', { p_id: id })
    if (error) return setMensaje('No se pudo quitar: ' + error.message)
    cargar()
  }

  const categoriaSeleccionada = categorias.find((c) => c.id === categoriaId)
  const pendientes = fijos.filter((f) => !f.ya_cargado_este_mes)
  const cargados = fijos.filter((f) => f.ya_cargado_este_mes)

  return (
    <div className="space-y-5 pb-4">
      {panel && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Gastos del mes</div>
            <div className="text-2xl font-bold tabular-nums text-red">{n(panel.cup)} <span className="text-sm font-normal">CUP</span></div>
            {Number(panel.usd) > 0 && <div className="text-sm text-muted tabular-nums">+ ${n(panel.usd)} USD</div>}
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Compra de mercancía</div>
            <div className="text-2xl font-bold tabular-nums">{n(panel.compras_cup)} <span className="text-sm font-normal">CUP</span></div>
            <div className="text-xs text-muted">no resta de la ganancia</div>
          </div>
        </div>
      )}

      {puedeRegistrar && fijos.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-green-strong mb-1">Gastos fijos de este mes</h2>
          <p className="text-xs text-muted mb-3">Toca uno para cargarlo con su monto de siempre. Puedes editar el importe después si cambió.</p>
          {pendientes.length === 0 && <p className="text-xs text-muted mb-2">Ya cargaste todos los gastos fijos de este mes. 🎉</p>}
          <div className="flex flex-wrap gap-2">
            {pendientes.map((f) => (
              <button key={f.id} onClick={() => cargarFijo(f.id)}
                className="text-xs font-semibold rounded-full border border-red text-red px-3 py-2">
                + {f.concepto} · {f.moneda === 'USD' ? '$' : ''}{n(f.importe)}{f.moneda === 'CUP' ? ' CUP' : ''}
              </button>
            ))}
            {cargados.map((f) => (
              <span key={f.id} className="text-xs font-semibold rounded-full bg-green-soft text-green-strong px-3 py-2">
                ✓ {f.concepto}
              </span>
            ))}
          </div>
        </section>
      )}

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

      {puedeRegistrar && (
        <section>
          <button onClick={() => setMostrarFijos((v) => !v)} className="text-xs font-semibold text-green-strong underline">
            {mostrarFijos ? '– Ocultar' : '+ Agregar un gasto fijo nuevo (se repite cada mes)'}
          </button>
          {mostrarFijos && (
            <div className="mt-3 rounded-2xl border border-line bg-surface p-4 shadow-sm space-y-2">
              <input value={fijoConcepto} onChange={(e) => setFijoConcepto(e.target.value)} placeholder="Concepto (ej. Renta del local, Nómina)"
                className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-green" />
              <div className="grid grid-cols-2 gap-2">
                <input value={fijoImporte} onChange={(e) => setFijoImporte(e.target.value)} type="number" min="0" placeholder="Importe de siempre"
                  className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-green" />
                <select value={fijoMoneda} onChange={(e) => setFijoMoneda(e.target.value)}
                  className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-green bg-surface">
                  <option value="CUP">CUP</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={fijoCategoriaId} onChange={(e) => setFijoCategoriaId(e.target.value)}
                  className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-green bg-surface">
                  <option value="">Sin categoría</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <select value={fijoDia} onChange={(e) => setFijoDia(e.target.value)}
                  className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-green bg-surface">
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Día {d} del mes</option>)}
                </select>
              </div>
              <button onClick={guardarFijo} disabled={guardandoFijo} className="w-full rounded-xl bg-green text-white font-semibold py-3 disabled:opacity-60">
                {guardandoFijo ? 'Guardando…' : 'Guardar gasto fijo'}
              </button>
            </div>
          )}
        </section>
      )}

      {puedeRegistrar && fijos.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Tus gastos fijos</h3>
          <div className="space-y-1.5">
            {fijos.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-2.5">
                <div className="text-xs">
                  <span className="font-semibold">{f.concepto}</span>
                  <span className="text-muted"> · día {f.dia_mes} · {f.moneda === 'USD' ? '$' : ''}{n(f.importe)}{f.moneda === 'CUP' ? ' CUP' : ''}</span>
                </div>
                <button onClick={() => quitarFijo(f.id)} className="text-[11px] text-muted underline">Quitar</button>
              </div>
            ))}
          </div>
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
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold tabular-nums">
                  {g.moneda === 'USD' ? '$' : ''}{n(g.importe)}{g.moneda === 'CUP' ? ' CUP' : ''}
                </span>
                {puedeRegistrar && (
                  <button onClick={() => borrar(g.id)} className="text-muted text-lg leading-none" aria-label="Borrar gasto">×</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
