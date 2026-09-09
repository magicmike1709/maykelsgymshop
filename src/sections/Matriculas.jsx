import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

function mesLabel(mes) {
  const [y, m] = mes.split('-').map(Number)
  const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${nombres[m - 1]} ${y}`
}

function n(v) {
  return Number(v || 0).toLocaleString('es-CU')
}

function agruparPorEntrenador(lista) {
  const grupos = {}
  for (const c of lista) {
    const clave = c.entrenador || 'Sin entrenador'
    if (!grupos[clave]) grupos[clave] = []
    grupos[clave].push(c)
  }
  return Object.entries(grupos).sort((a, b) => b[1].length - a[1].length)
}

export default function Matriculas({ perfil }) {
  const [modo, setModo] = useState('resumen') // resumen | clientes
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
      <div className="flex gap-1.5">
        <button onClick={() => setModo('resumen')}
          className={'flex-1 py-2 rounded-full text-xs font-semibold border ' + (modo === 'resumen' ? 'bg-green text-white border-green' : 'border-line text-muted')}>
          Resumen
        </button>
        <button onClick={() => setModo('clientes')}
          className={'flex-1 py-2 rounded-full text-xs font-semibold border ' + (modo === 'clientes' ? 'bg-green text-white border-green' : 'border-line text-muted')}>
          Clientes
        </button>
      </div>

      {modo === 'clientes' ? (
        <ClientesGym />
      ) : (
      <>
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
      </>
      )}
    </div>
  )
}

function FilaCliente({ c, abierto, onAbrir, detalle }) {
  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden">
      <button onClick={() => onAbrir(c.id)} className="w-full text-left px-4 py-3">
        <div className="text-sm font-semibold">{c.nombre}</div>
        <div className="text-xs text-muted">
          {c.telefono || 'sin teléfono'} · {c.sexo || '—'}{c.entrenador ? ` · ${c.entrenador}` : ''}
        </div>
      </button>
      {abierto === c.id && (
        <div className="px-4 pb-3 border-t border-line pt-2">
          {!detalle ? (
            <p className="text-xs text-muted">Cargando…</p>
          ) : (
            <>
              <p className="text-xs font-semibold text-muted mb-1">Meses en que pagó:</p>
              <div className="flex flex-wrap gap-1.5">
                {detalle.visitas.map((f) => (
                  <span key={f} className="text-[11px] font-semibold bg-green-soft text-green-strong rounded-full px-2 py-0.5">{f}</span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ClientesGym() {
  const [sub, setSub] = useState('directorio') // buscar | directorio | estadisticas
  const [abierto, setAbierto] = useState(null)
  const [detalle, setDetalle] = useState(null)

  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])

  const [meses, setMeses] = useState([])
  const [mesElegido, setMesElegido] = useState(null)
  const [verTodos, setVerTodos] = useState(false)
  const [directorio, setDirectorio] = useState([])

  const [stats, setStats] = useState(null)

  useEffect(() => {
    supabase.rpc('clientes_meses_disponibles').then(({ data }) => {
      setMeses(data || [])
      if (data && data.length > 0) setMesElegido(data[0].mes)
    })
  }, [])

  useEffect(() => {
    if (busqueda.trim() === '') { setResultados([]); return }
    const t = setTimeout(() => {
      supabase.rpc('clientes_buscar', { p_busqueda: busqueda.trim() }).then(({ data }) => setResultados(data || []))
    }, 250)
    return () => clearTimeout(t)
  }, [busqueda])

  useEffect(() => {
    if (sub !== 'directorio') return
    if (verTodos) {
      supabase.rpc('clientes_todos').then(({ data }) => setDirectorio(data || []))
    } else if (mesElegido) {
      supabase.rpc('clientes_por_mes', { p_mes: mesElegido }).then(({ data }) => setDirectorio(data || []))
    }
  }, [sub, verTodos, mesElegido])

  useEffect(() => {
    if (sub !== 'estadisticas' || !mesElegido) return
    supabase.rpc('clientes_estadisticas_mes', { p_mes: mesElegido }).then(({ data }) => setStats(data))
  }, [sub, mesElegido])

  async function abrir(id) {
    if (abierto === id) { setAbierto(null); return }
    setAbierto(id)
    const { data } = await supabase.rpc('cliente_detalle', { p_id: id })
    setDetalle(data)
  }

  const grupos = agruparPorEntrenador(directorio)

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {[{ id: 'directorio', label: 'Directorio' }, { id: 'buscar', label: 'Buscar' }, { id: 'estadisticas', label: 'Estadísticas' }].map((s) => (
          <button key={s.id} onClick={() => setSub(s.id)}
            className={'flex-1 py-1.5 rounded-full text-xs font-semibold border ' + (sub === s.id ? 'bg-yellow text-ink border-yellow' : 'border-line text-muted')}>
            {s.label}
          </button>
        ))}
      </div>

      {sub === 'buscar' && (
        <div className="space-y-2">
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o teléfono, entre todos los clientes…"
            className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-green" />
          {busqueda.trim() === '' && <p className="text-xs text-muted">Escribe para buscar entre todos los clientes, de cualquier mes.</p>}
          {busqueda.trim() !== '' && resultados.length === 0 && <p className="text-sm text-muted">Sin resultados.</p>}
          {resultados.map((c) => <FilaCliente key={c.id} c={c} abierto={abierto} onAbrir={abrir} detalle={detalle} />)}
        </div>
      )}

      {sub === 'directorio' && (
        <div className="space-y-3">
          <div className="flex gap-1.5">
            <button onClick={() => setVerTodos(false)}
              className={'flex-1 py-1.5 rounded-full text-xs font-semibold border ' + (!verTodos ? 'bg-green text-white border-green' : 'border-line text-muted')}>
              Por mes
            </button>
            <button onClick={() => setVerTodos(true)}
              className={'flex-1 py-1.5 rounded-full text-xs font-semibold border ' + (verTodos ? 'bg-green text-white border-green' : 'border-line text-muted')}>
              Todos
            </button>
          </div>
          {!verTodos && meses.length > 0 && (
            <select value={mesElegido || ''} onChange={(e) => setMesElegido(e.target.value)}
              className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green bg-surface">
              {meses.map((m) => (
                <option key={m.mes} value={m.mes}>{mesLabel(m.mes)} · {m.clientes} clientes</option>
              ))}
            </select>
          )}
          {meses.length === 0 && <p className="text-sm text-muted">Todavía no hay clientes cargados.</p>}
          <div className="space-y-3">
            {grupos.map(([entrenador, lista]) => (
              <div key={entrenador}>
                <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-green-strong mb-1.5">{entrenador} · {lista.length}</h3>
                <div className="space-y-1.5">
                  {lista.map((c) => <FilaCliente key={c.id + (c.fecha || '')} c={c} abierto={abierto} onAbrir={abrir} detalle={detalle} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sub === 'estadisticas' && (
        <div className="space-y-4">
          {meses.length > 0 && (
            <select value={mesElegido || ''} onChange={(e) => setMesElegido(e.target.value)}
              className="w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-green bg-surface">
              {meses.map((m) => (
                <option key={m.mes} value={m.mes}>{mesLabel(m.mes)}</option>
              ))}
            </select>
          )}
          {!stats ? (
            <p className="text-sm text-muted">Cargando…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
                  <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Nuevos</div>
                  <div className="text-2xl font-bold tabular-nums text-green-strong">{stats.nuevos}</div>
                </div>
                <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
                  <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Recurrentes</div>
                  <div className="text-2xl font-bold tabular-nums">{stats.recurrentes}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-2">Proporción</div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-semibold">{stats.sexo?.hombres ?? 0} hombres</span>
                  <span className="text-muted">·</span>
                  <span className="font-semibold">{stats.sexo?.mujeres ?? 0} mujeres</span>
                  {stats.sexo?.sin_dato > 0 && <><span className="text-muted">·</span><span className="text-muted">{stats.sexo.sin_dato} sin dato</span></>}
                </div>
              </div>

              <div>
                <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-green-strong mb-2">Por entrenador</h3>
                {(!stats.por_entrenador || stats.por_entrenador.length === 0) && <p className="text-sm text-muted">Sin datos este mes.</p>}
                <div className="space-y-1.5">
                  {stats.por_entrenador?.map((e) => (
                    <div key={e.entrenador} className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-2.5 text-sm">
                      <span className="font-semibold">{e.entrenador}</span>
                      <span className="tabular-nums text-muted">{e.clientes} clientes · <span className="text-green-strong font-semibold">{n(e.dinero)} CUP</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
