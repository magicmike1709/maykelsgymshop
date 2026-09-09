import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

export default function Matriculas({ perfil }) {
  const [resumen, setResumen] = useState(null)
  const [fecha, setFecha] = useState(hoy())
  const [pagos, setPagos] = useState('')
  const [total, setTotal] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  async function cargar() {
    const { data } = await supabase.rpc('matriculas_panel')
    setResumen(data)
  }

  useEffect(() => {
    cargar()
  }, [])

  async function guardarResumen(e, reemplazar = false) {
    e?.preventDefault()
    setMensaje('')
    if (!pagos || !total) return
    setGuardando(true)
    const { data, error } = await supabase.rpc('matricula_dia_guardar', {
      p_fecha: fecha,
      p_pagos: Number(pagos),
      p_total: Number(total),
      p_reemplazar: reemplazar
    })
    setGuardando(false)
    if (error) return setMensaje('No se pudo guardar: ' + error.message)
    if (data?.ok === false && data?.motivo === 'detalle_existente') {
      setMensaje('Ese día ya tiene pagos cargados. ¿Reemplazar por este resumen?')
      return
    }
    setPagos('')
    setTotal('')
    setMensaje('Guardado.')
    cargar()
  }

  const puedeRegistrar = perfil?.rol === 'admin'
  const hayConflicto = mensaje.startsWith('Ese día')

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Cobrado</div>
          <div className="text-2xl font-bold tabular-nums">{resumen ? Number(resumen.total).toLocaleString('es-CU') : '—'}</div>
          <div className="text-xs text-muted">CUP este mes</div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Pagos</div>
          <div className="text-2xl font-bold tabular-nums">{resumen?.pagos ?? '—'}</div>
          <div className="text-xs text-muted">este mes</div>
        </div>
      </div>

      {puedeRegistrar && (
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-green-strong mb-1">Resumen del día</h2>
          <p className="text-xs text-muted mb-3">Cuántos pagaron y cuánto se cobró.</p>
          <form onSubmit={guardarResumen} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Fecha</label>
              <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-green" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Cuántos pagaron</label>
                <input type="number" min="1" step="1" required value={pagos} onChange={(e) => setPagos(e.target.value)}
                  className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-green" placeholder="47" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Total (CUP)</label>
                <input type="number" min="0" step="1" required value={total} onChange={(e) => setTotal(e.target.value)}
                  className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-green" placeholder="246800" />
              </div>
            </div>
            <button type="submit" disabled={guardando}
              className="w-full rounded-xl bg-green text-white font-semibold py-3 disabled:opacity-60">
              {guardando ? 'Guardando…' : 'Guardar resumen del día'}
            </button>
            {mensaje && (
              <div className="text-sm">
                <p className={hayConflicto ? 'text-yellow' : 'text-muted'}>{mensaje}</p>
                {hayConflicto && (
                  <button type="button" onClick={(e) => guardarResumen(e, true)}
                    className="mt-2 text-xs font-semibold text-red border border-red rounded-full px-3 py-1.5">
                    Sí, reemplazar
                  </button>
                )}
              </div>
            )}
          </form>
        </section>
      )}

      {!puedeRegistrar && perfil && (
        <p className="text-sm text-muted">Tu usuario ({perfil.rol_nombre}) no tiene permiso para registrar pagos de matrícula.</p>
      )}
    </div>
  )
}
