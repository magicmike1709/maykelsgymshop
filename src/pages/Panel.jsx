import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

export default function Panel({ session }) {
  const [perfil, setPerfil] = useState(null)
  const [resumen, setResumen] = useState(null)
  const [fecha, setFecha] = useState(hoy())
  const [pagos, setPagos] = useState('')
  const [total, setTotal] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  async function cargar() {
    const { data: p } = await supabase.rpc('mi_perfil')
    setPerfil(p)
    const { data: r } = await supabase.rpc('matriculas_panel')
    setResumen(r)
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
    if (error) {
      setMensaje('No se pudo guardar: ' + error.message)
      return
    }
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
    <div className="min-h-screen pb-16">
      <header className="border-b-[3px] border-green px-5 pt-6 pb-4">
        <div className="text-xs font-bold tracking-widest uppercase text-green-strong flex items-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow" />
          {perfil?.rol_nombre || '…'}
        </div>
        <div className="flex items-center justify-between">
          <h1 className="font-display font-bold uppercase text-2xl tracking-tight">
            Panel
          </h1>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs font-semibold text-muted border border-line rounded-full px-3 py-1.5"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="px-5 pt-5 max-w-md mx-auto space-y-5">
        <section>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-green-strong mb-2">
            Matrículas del gym · CUP
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Cobrado</div>
              <div className="text-2xl font-bold tabular-nums">
                {resumen ? Number(resumen.total).toLocaleString('es-CU') : '—'}
              </div>
              <div className="text-xs text-muted">CUP este mes</div>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Pagos</div>
              <div className="text-2xl font-bold tabular-nums">{resumen?.pagos ?? '—'}</div>
              <div className="text-xs text-muted">este mes</div>
            </div>
          </div>
        </section>

        {puedeRegistrar && (
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-green-strong mb-1">
              Resumen del día
            </h2>
            <p className="text-xs text-muted mb-3">
              Cuántos pagaron y cuánto se cobró — como en tu resumen diario de siempre.
            </p>
            <form onSubmit={guardarResumen} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Fecha</label>
                <input
                  type="date"
                  required
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-green"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">Cuántos pagaron</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={pagos}
                    onChange={(e) => setPagos(e.target.value)}
                    className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-green"
                    placeholder="47"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">Total (CUP)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                    className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-green"
                    placeholder="246800"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={guardando}
                className="w-full rounded-xl bg-green text-white font-semibold py-3 disabled:opacity-60"
              >
                {guardando ? 'Guardando…' : 'Guardar resumen del día'}
              </button>
              {mensaje && (
                <div className="text-sm">
                  <p className={hayConflicto ? 'text-yellow' : 'text-muted'}>{mensaje}</p>
                  {hayConflicto && (
                    <button
                      type="button"
                      onClick={(e) => guardarResumen(e, true)}
                      className="mt-2 text-xs font-semibold text-red border border-red rounded-full px-3 py-1.5"
                    >
                      Sí, reemplazar
                    </button>
                  )}
                </div>
              )}
            </form>
          </section>
        )}

        {!puedeRegistrar && perfil && (
          <p className="text-sm text-muted">
            Tu usuario ({perfil.rol_nombre}) todavía no tiene permiso para registrar pagos de matrícula.
          </p>
        )}
      </main>
    </div>
  )
}
