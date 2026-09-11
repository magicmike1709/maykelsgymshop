import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Avisos({ perfil }) {
  const [avisos, setAvisos] = useState([])
  const [nuevo, setNuevo] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')

  const puedeCrear = perfil?.rol === 'admin' || perfil?.rol === 'operador_plus'

  async function cargar() {
    const { data } = await supabase.rpc('avisos_lista')
    setAvisos(data || [])
  }

  useEffect(() => { cargar() }, [])

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (!titulo) return
    const { error: err } = await supabase.rpc('aviso_guardar', { p_titulo: titulo, p_mensaje: mensaje || null })
    if (err) return setError('No se pudo guardar: ' + err.message)
    setTitulo(''); setMensaje(''); setNuevo(false); cargar()
  }

  async function resolver(id) {
    setError('')
    const { error: err } = await supabase.rpc('aviso_resolver', { p_id: id })
    if (err) return setError('No se pudo resolver: ' + err.message)
    cargar()
  }

  async function confirmar(id) {
    setError('')
    const { error: err } = await supabase.rpc('aviso_confirmar', { p_id: id })
    if (err) return setError('No se pudo confirmar: ' + err.message)
    cargar()
  }

  return (
    <div className="space-y-5 pb-4">
      {error && <p className="text-sm text-red rounded-xl border border-red/30 bg-surface px-4 py-2.5">{error}</p>}

      {puedeCrear && (
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          {!nuevo ? (
            <button onClick={() => setNuevo(true)} className="text-sm font-semibold text-green-strong">+ Nuevo aviso</button>
          ) : (
            <form onSubmit={guardar} className="space-y-2">
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título (ej. Revisar vencimiento de X)"
                className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green" required />
              <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Detalle (opcional)" rows={2}
                className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green resize-none" />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 rounded-xl bg-green text-white text-sm font-semibold py-2.5">Guardar</button>
                <button type="button" onClick={() => setNuevo(false)} className="text-sm text-muted px-3">Cancelar</button>
              </div>
            </form>
          )}
        </section>
      )}

      <div className="space-y-2">
        {avisos.map((a) => {
          const yoConfirme = (a.confirmaciones || []).some((c) => c.usuario_id === perfil?.id)
          return (
            <div key={a.id} className="rounded-xl border border-line bg-yellow-soft px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{a.titulo}</div>
                  {a.mensaje && <div className="text-xs text-muted mt-0.5">{a.mensaje}</div>}
                </div>
                <button onClick={() => resolver(a.id)} className="text-xs font-semibold text-white bg-green rounded-full px-3 py-1.5 flex-shrink-0">
                  Resuelto
                </button>
              </div>
              <div className="mt-2 pt-2 border-t border-line/60 flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {(a.confirmaciones || []).map((c) => (
                    <span key={c.usuario_id} className="text-[11px] font-semibold bg-green-soft text-green-strong rounded-full px-2 py-0.5">✓ {c.nombre}</span>
                  ))}
                  {(a.confirmaciones || []).length === 0 && <span className="text-[11px] text-muted">Nadie lo ha visto todavía</span>}
                </div>
                {!yoConfirme && (
                  <button onClick={() => confirmar(a.id)} className="text-xs font-semibold text-yellow border border-yellow rounded-full px-3 py-1 flex-shrink-0">
                    Ya lo vi
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {avisos.length === 0 && <p className="text-sm text-muted">Sin avisos pendientes.</p>}
      </div>
    </div>
  )
}
