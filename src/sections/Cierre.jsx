import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function n(v) {
  return Number(v || 0).toLocaleString('es-CU')
}

export default function Cierre() {
  const [resumenHoy, setResumenHoy] = useState(null)
  const [historial, setHistorial] = useState([])
  const [mensaje, setMensaje] = useState('')
  const [cerrando, setCerrando] = useState(false)

  async function cargar() {
    const { data: r } = await supabase.rpc('panel_resumen')
    setResumenHoy(r)
    const { data: h } = await supabase.rpc('cierres_lista')
    setHistorial(h || [])
  }

  useEffect(() => {
    cargar()
  }, [])

  async function cerrarHoy() {
    setMensaje('')
    setCerrando(true)
    const { data, error } = await supabase.rpc('cierre_crear')
    setCerrando(false)
    if (error) return setMensaje('No se pudo cerrar: ' + error.message)
    if (data?.ok === false) return setMensaje('Hoy ya está cerrado.')
    setMensaje('Día cerrado.')
    cargar()
  }

  async function reabrir(dia) {
    await supabase.rpc('cierre_reabrir', { p_dia: dia })
    cargar()
  }

  const hoyCerrado = resumenHoy?.dia_cerrado_hoy

  return (
    <div className="space-y-5 pb-4">
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-green-strong mb-1">Hoy</h2>
        {hoyCerrado && <p className="text-sm text-yellow font-semibold mb-2">Ya cerraste el día de hoy.</p>}
        {!hoyCerrado && (
          <>
            <p className="text-xs text-muted mb-3">
              Al cerrar, se guarda una foto de los números de hoy y ya no se puede editar nada de ese día
              (matrículas, ventas, gastos) hasta que lo reabras.
            </p>
            <button onClick={cerrarHoy} disabled={cerrando}
              className="w-full rounded-xl bg-red text-white font-semibold py-3 disabled:opacity-60">
              {cerrando ? 'Cerrando…' : 'Cerrar el día de hoy'}
            </button>
          </>
        )}
        {mensaje && <p className="text-sm text-muted mt-2">{mensaje}</p>}
      </section>

      <section>
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-green-strong mb-2">Historial</h2>
        {historial.length === 0 && <p className="text-sm text-muted">Todavía no has cerrado ningún día.</p>}
        <div className="space-y-2">
          {historial.map((c) => (
            <div key={c.id} className="rounded-xl border border-line bg-surface px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold">{c.dia}</span>
                <span className={'text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ' + (c.estado === 'cerrado' ? 'bg-green-soft text-green-strong' : 'bg-yellow-soft text-yellow')}>
                  {c.estado}
                </span>
              </div>
              <div className="text-xs text-muted tabular-nums">
                CUP: {n(c.snapshot?.cup?.neto)} · USD: {n(c.snapshot?.usd?.neto)}
              </div>
              {c.estado === 'cerrado' && (
                <button onClick={() => reabrir(c.dia)} className="mt-2 text-xs font-semibold text-red border border-red rounded-full px-3 py-1">
                  Reabrir
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
