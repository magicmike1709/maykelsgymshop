import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function n(v) {
  return Number(v || 0).toLocaleString('es-CU')
}

function tonoDescuadre(d) {
  if (d === null || d === undefined) return 'text-muted'
  const abs = Math.abs(Number(d))
  if (abs === 0) return 'text-green-strong'
  if (abs < 1000) return 'text-yellow'
  return 'text-red'
}

export default function Cierre() {
  const [resumenHoy, setResumenHoy] = useState(null)
  const [historial, setHistorial] = useState([])
  const [mensaje, setMensaje] = useState('')
  const [cerrando, setCerrando] = useState(false)
  const [cajaContada, setCajaContada] = useState('')
  const [conteoAbierto, setConteoAbierto] = useState(null) // dia para el que se está contando
  const [alerta, setAlerta] = useState(null)

  async function cargar() {
    const { data: r } = await supabase.rpc('panel_resumen')
    setResumenHoy(r)
    const { data: h } = await supabase.rpc('cierres_lista')
    setHistorial(h || [])
    const { data: a } = await supabase.rpc('descuadres_alerta')
    setAlerta(a)
  }

  useEffect(() => {
    cargar()
  }, [])

  async function cerrarHoy() {
    setMensaje('')
    setCerrando(true)
    const p_caja_contada = cajaContada === '' ? null : Number(cajaContada)
    const { data, error } = await supabase.rpc('cierre_crear', { p_caja_contada })
    setCerrando(false)
    if (error) return setMensaje('No se pudo cerrar: ' + error.message)
    if (data?.ok === false) return setMensaje('Hoy ya está cerrado.')
    setMensaje('Día cerrado.')
    setCajaContada('')
    cargar()
  }

  async function reabrir(dia) {
    setMensaje('')
    const { error } = await supabase.rpc('cierre_reabrir', { p_dia: dia })
    if (error) return setMensaje('No se pudo reabrir: ' + error.message)
    cargar()
  }

  async function guardarConteo(dia, valor) {
    if (valor === '') return
    setMensaje('')
    const { error } = await supabase.rpc('cierre_registrar_conteo', { p_dia: dia, p_caja_contada: Number(valor) })
    if (error) return setMensaje('No se pudo guardar el conteo: ' + error.message)
    setConteoAbierto(null); cargar()
  }

  const hoyCerrado = resumenHoy?.dia_cerrado_hoy

  return (
    <div className="space-y-5 pb-4">
      {mensaje && <p className="text-sm text-red rounded-xl border border-red/30 bg-surface px-4 py-2.5">{mensaje}</p>}

      {alerta && (alerta.con_descuadre > 0 || alerta.sin_conteo > 0) && (
        <section className="rounded-2xl border border-red bg-red-soft p-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-red mb-1">Alerta de caja · últimos {alerta.dias} días</h2>
          {alerta.con_descuadre > 0 && (
            <p className="text-sm text-red font-semibold">
              {alerta.con_descuadre} cierre{alerta.con_descuadre === 1 ? '' : 's'} con descuadre · total {alerta.total_descuadre > 0 ? '+' : ''}{n(alerta.total_descuadre)} CUP
              {Number(alerta.peor_descuadre) < 0 && <> · peor caso {n(alerta.peor_descuadre)} CUP</>}
            </p>
          )}
          {alerta.sin_conteo > 0 && (
            <p className="text-sm text-yellow font-semibold mt-1">{alerta.sin_conteo} cierre{alerta.sin_conteo === 1 ? '' : 's'} sin conteo de caja registrado.</p>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-green-strong mb-1">Hoy</h2>
        {hoyCerrado && <p className="text-sm text-yellow font-semibold mb-2">Ya cerraste el día de hoy.</p>}
        {!hoyCerrado && (
          <>
            <p className="text-xs text-muted mb-3">
              Al cerrar, se guarda una foto de los números de hoy y ya no se puede editar nada de ese día
              (matrículas, ventas, gastos) hasta que lo reabras.
            </p>
            <label className="block text-xs font-semibold text-muted mb-1">Efectivo CUP contado en caja (opcional)</label>
            <input value={cajaContada} onChange={(e) => setCajaContada(e.target.value)} type="number" min="0"
              placeholder="Cuenta el efectivo y ponlo aquí"
              className="w-full mb-3 rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green" />
            <button onClick={cerrarHoy} disabled={cerrando}
              className="w-full rounded-xl bg-red text-white font-semibold py-3 disabled:opacity-60">
              {cerrando ? 'Cerrando…' : 'Cerrar el día de hoy'}
            </button>
          </>
        )}
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

              <div className="mt-2 text-xs">
                {c.caja_contada !== null && c.caja_contada !== undefined ? (
                  <span className={'font-semibold tabular-nums ' + tonoDescuadre(c.descuadre)}>
                    Caja: esperada {n(c.caja_esperada)} · contada {n(c.caja_contada)} · descuadre {Number(c.descuadre) > 0 ? '+' : ''}{n(c.descuadre)} CUP
                  </span>
                ) : conteoAbierto === c.dia ? (
                  <ConteoForm dia={c.dia} onGuardar={guardarConteo} onCancelar={() => setConteoAbierto(null)} />
                ) : (
                  <button onClick={() => setConteoAbierto(c.dia)} className="text-muted underline">Registrar conteo de caja</button>
                )}
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

function ConteoForm({ dia, onGuardar, onCancelar }) {
  const [valor, setValor] = useState('')
  return (
    <div className="flex items-center gap-2">
      <input value={valor} onChange={(e) => setValor(e.target.value)} type="number" min="0" placeholder="CUP contado"
        className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs outline-none focus:border-green" autoFocus />
      <button onClick={() => onGuardar(dia, valor)} className="text-xs font-semibold text-green-strong">Guardar</button>
      <button onClick={onCancelar} className="text-xs text-muted">Cancelar</button>
    </div>
  )
}
