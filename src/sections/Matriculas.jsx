import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fechaLocal as hoy } from '../lib/fecha'

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
        <ClientesGym perfil={perfil} />
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

function fechaLarga(f) {
  if (!f) return null
  const [y, m, d] = f.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

function FilaCliente({ c, abierto, onAbrir, detalle }) {
  const fechaPago = c.fecha || c.ultima_visita
  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden">
      <button onClick={() => onAbrir(c.id)} className="w-full text-left px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{c.nombre}</div>
          <div className="text-xs text-muted truncate">
            {c.telefono || 'sin teléfono'} · {c.sexo || '—'}{c.entrenador ? ` · ${c.entrenador}` : ''}
          </div>
        </div>
        {fechaPago && (
          <div className="shrink-0 text-right">
            <div className="text-[11px] font-semibold bg-green-soft text-green-strong rounded-full px-2.5 py-1 whitespace-nowrap">
              {fechaLarga(fechaPago)}
            </div>
          </div>
        )}
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

function normalizarFecha(f) {
  const partes = (f || '').trim().split('/')
  if (partes.length !== 3) return null
  const [d, m, y] = partes
  if (!d || !m || !y) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseCSVClientes(texto) {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lineas.length < 2) return []
  const header = lineas[0].replace(/^﻿/, '').split(',').map((h) => h.trim().toLowerCase())
  const col = (buscar) => header.findIndex((h) => buscar.some((b) => h.includes(b)))
  const idx = {
    nombre: col(['nombre']),
    fecha: header.indexOf('fecha'),
    sexo: header.indexOf('sexo'),
    entrenador: col(['entrenador']),
    telefono: col(['phone', 'telefono', 'teléfono']),
    monto: col(['monto', 'pago', 'importe'])
  }
  return lineas.slice(1).map((linea) => {
    const cols = linea.split(',')
    const nombre = (cols[idx.nombre] || '').trim()
    const fecha = normalizarFecha(cols[idx.fecha])
    if (!nombre || !fecha) return null
    return {
      nombre,
      fecha,
      sexo: idx.sexo >= 0 ? (cols[idx.sexo] || '').trim() || null : null,
      entrenador: idx.entrenador >= 0 ? (cols[idx.entrenador] || '').trim() || null : null,
      telefono: idx.telefono >= 0 ? (cols[idx.telefono] || '').trim() || null : null,
      monto: idx.monto >= 0 && cols[idx.monto]?.trim() ? Number(cols[idx.monto]) : null
    }
  }).filter(Boolean)
}

function ImportarCSV({ onListo }) {
  const [filas, setFilas] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [abierto, setAbierto] = useState(false)

  function elegirArchivo(e) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    const lector = new FileReader()
    lector.onload = () => setFilas(parseCSVClientes(String(lector.result)))
    lector.readAsText(archivo)
  }

  async function subir() {
    if (!filas || filas.length === 0) return
    setSubiendo(true)
    setProgreso(0)
    for (let i = 0; i < filas.length; i++) {
      const f = filas[i]
      await supabase.rpc('cliente_visita_registrar', {
        p_nombre: f.nombre, p_fecha: f.fecha, p_telefono: f.telefono, p_sexo: f.sexo, p_entrenador: f.entrenador, p_monto: f.monto
      })
      setProgreso(i + 1)
    }
    setSubiendo(false)
    setFilas(null)
    setAbierto(false)
    onListo()
  }

  if (!abierto) {
    return <button onClick={() => setAbierto(true)} className="text-xs font-semibold text-green-strong underline">+ Importar CSV</button>
  }

  return (
    <div className="rounded-xl border border-green bg-green-soft p-3 space-y-2">
      <p className="text-xs text-muted">Columnas esperadas: Nombre, Fecha (dd/m/aaaa), Sexo, Entrenador, Phone — y Monto si lo tienes.</p>
      <input type="file" accept=".csv" onChange={elegirArchivo}
        className="w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-green file:text-white file:px-3 file:py-1.5 file:text-xs" />
      {filas && !subiendo && (
        <p className="text-sm font-semibold">{filas.length} registros detectados.</p>
      )}
      {subiendo && <p className="text-sm text-muted">Cargando {progreso} de {filas.length}…</p>}
      <div className="flex gap-2">
        {filas && !subiendo && (
          <button onClick={subir} className="flex-1 rounded-xl bg-green text-white text-sm font-semibold py-2">Cargar {filas.length} registros</button>
        )}
        <button onClick={() => { setAbierto(false); setFilas(null) }} className="text-sm text-muted px-3">Cancelar</button>
      </div>
    </div>
  )
}

function ClientesGym({ perfil }) {
  const puedeImportar = perfil?.rol === 'admin' || perfil?.rol === 'operador_plus'
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
  const [refrescar, setRefrescar] = useState(0)

  const [sinRenovar, setSinRenovar] = useState(null)

  useEffect(() => {
    supabase.rpc('clientes_meses_disponibles').then(({ data }) => {
      setMeses(data || [])
      if (data && data.length > 0 && !mesElegido) setMesElegido(data[0].mes)
    })
  }, [refrescar])

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
  }, [sub, verTodos, mesElegido, refrescar])

  useEffect(() => {
    if (sub !== 'estadisticas' || !mesElegido) return
    supabase.rpc('clientes_estadisticas_mes', { p_mes: mesElegido }).then(({ data }) => setStats(data))
  }, [sub, mesElegido, refrescar])

  useEffect(() => {
    if (sub !== 'recordar') return
    supabase.rpc('clientes_no_renovaron').then(({ data }) => setSinRenovar(data || []))
  }, [sub, refrescar])

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
        {[{ id: 'directorio', label: 'Directorio' }, { id: 'buscar', label: 'Buscar' }, { id: 'estadisticas', label: 'Estadísticas' }, { id: 'recordar', label: 'Recordar' }].map((s) => (
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
          {puedeImportar && <ImportarCSV onListo={() => setRefrescar((r) => r + 1)} />}
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

      {sub === 'recordar' && <Recordar lista={sinRenovar} />}
    </div>
  )
}

function telefonoWa(telefono) {
  const digitos = (telefono || '').replace(/\D/g, '')
  if (!digitos) return null
  return digitos.startsWith('53') ? digitos : '53' + digitos
}

function fechaCorta(f) {
  if (!f) return 'sin fecha'
  const [, m, d] = f.split('-')
  return `${Number(d)}/${Number(m)}`
}

const RANGOS_DIA = [
  { id: '1-5', label: '1-5', desde: 1, hasta: 5 },
  { id: '6-10', label: '6-10', desde: 6, hasta: 10 },
  { id: '11-15', label: '11-15', desde: 11, hasta: 15 },
  { id: '16-20', label: '16-20', desde: 16, hasta: 20 },
  { id: '21-25', label: '21-25', desde: 21, hasta: 25 },
  { id: '26-32', label: '26-32', desde: 26, hasta: 32 }
]

function diaDelMes(fecha) {
  if (!fecha) return null
  return Number(fecha.split('-')[2])
}

function agruparPorRangoDia(lista) {
  const grupos = RANGOS_DIA.map((r) => ({ ...r, clientes: [] }))
  for (const c of lista) {
    const dia = diaDelMes(c.fecha_pago)
    const rango = grupos.find((r) => dia !== null && dia >= r.desde && dia <= r.hasta)
    if (rango) rango.clientes.push(c)
  }
  return grupos.filter((r) => r.clientes.length > 0)
}

function Recordar({ lista }) {
  const [seleccion, setSeleccion] = useState({})
  const [textoMasivo, setTextoMasivo] = useState('Hola! Somos Maykel\'s Gym. Vimos que todavía no has renovado tu matrícula de este mes. ¿Te esperamos esta semana? 💪')
  const [copiado, setCopiado] = useState(false)

  if (lista === null) return <p className="text-sm text-muted">Cargando…</p>
  if (lista.length === 0) {
    return <p className="text-sm text-muted">Nadie pendiente: todos los que pagaron el mes pasado ya pagaron este mes (o no hay datos del mes pasado).</p>
  }

  const grupos = agruparPorRangoDia(lista)

  function marcar(id, val) {
    setSeleccion((s) => ({ ...s, [id]: val }))
  }

  function marcarGrupo(clientes, val) {
    setSeleccion((s) => {
      const copia = { ...s }
      for (const c of clientes) copia[c.id] = val
      return copia
    })
  }

  const seleccionados = lista.filter((c) => seleccion[c.id])
  const telefonos = [...new Set(seleccionados.map((c) => (c.telefono || '').replace(/\D/g, '')).filter(Boolean))]

  function enviarMasivoSMS() {
    if (telefonos.length === 0) return
    window.location.href = 'sms:' + telefonos.join(',') + '?body=' + encodeURIComponent(textoMasivo)
  }

  async function copiarTelefonos() {
    if (telefonos.length === 0) return
    try {
      await navigator.clipboard.writeText(telefonos.join(','))
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      window.prompt('Copia los teléfonos:', telefonos.join(','))
    }
  }

  return (
    <div className="space-y-4 pb-20">
      <p className="text-xs text-muted">
        Pagaron en {mesLabel(lista[0].mes_anterior)} y todavía no pagan este mes. Agrupados por el día en que pagaron, para avisarles a tiempo.
      </p>

      {grupos.map((r) => {
        const todosMarcados = r.clientes.every((c) => seleccion[c.id])
        return (
          <div key={r.id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-green-strong">
                Día {r.label} · {r.clientes.length}
              </h3>
              <button onClick={() => marcarGrupo(r.clientes, !todosMarcados)}
                className="text-[11px] font-semibold text-green-strong underline">
                {todosMarcados ? 'Quitar todos' : 'Marcar todos'}
              </button>
            </div>
            <div className="space-y-1.5">
              {r.clientes.map((c) => {
                const wa = telefonoWa(c.telefono)
                const textoWa = `Hola ${c.nombre.split(' ')[0]}! 👋 Somos Maykel's Gym. Vimos que todavía no has renovado tu matrícula de este mes. ¿Te esperamos esta semana? 💪`
                return (
                  <label key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                    <input type="checkbox" checked={!!seleccion[c.id]} onChange={(e) => marcar(c.id, e.target.checked)}
                      className="h-4 w-4 accent-green shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{c.nombre}</div>
                      <div className="text-xs text-muted">
                        Pagó el {fechaCorta(c.fecha_pago)} · {c.telefono || 'sin teléfono'}{c.entrenador ? ` · ${c.entrenador}` : ''}
                      </div>
                    </div>
                    {wa ? (
                      <a href={'https://wa.me/' + wa + '?text=' + encodeURIComponent(textoWa)} target="_blank" rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-semibold text-green-strong border border-green rounded-full px-3 py-1.5 whitespace-nowrap">
                        WhatsApp
                      </a>
                    ) : null}
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="fixed bottom-16 left-0 right-0 px-4">
        <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-3 shadow-lg space-y-2">
          <textarea value={textoMasivo} onChange={(e) => setTextoMasivo(e.target.value)} rows={2}
            className="w-full rounded-xl border border-line px-3 py-2 text-xs outline-none focus:border-green" />
          <button onClick={copiarTelefonos} disabled={telefonos.length === 0}
            className="w-full rounded-xl bg-green text-white text-sm font-semibold py-2.5 disabled:opacity-50">
            {copiado ? '✓ Copiados — pégalos en "Para:"' : `Copiar ${telefonos.length} ${telefonos.length === 1 ? 'teléfono' : 'teléfonos'}`}
          </button>
          <button onClick={enviarMasivoSMS} disabled={telefonos.length === 0}
            className="w-full rounded-xl border border-green text-green-strong text-xs font-semibold py-2 disabled:opacity-50">
            Abrir SMS directo (puede traer solo 1 número)
          </button>
        </div>
      </div>
    </div>
  )
}
