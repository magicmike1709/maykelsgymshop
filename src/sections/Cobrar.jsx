import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fechaLocal } from '../lib/fecha'

function n(v) {
  return Number(v || 0).toLocaleString('es-CU')
}

function fechaCorta(f) {
  if (!f) return null
  const [y, m, d] = f.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

// Días desde el último pago → en qué estado está el cliente.
function estadoCliente(ultima, ciclo) {
  if (!ultima) return { texto: 'Nunca ha pagado', tono: 'text-muted' }
  const dias = Math.floor((new Date(fechaLocal()) - new Date(ultima)) / 86400000)
  const restantes = ciclo - dias
  if (restantes < 0) return { texto: `Vencido hace ${-restantes} día${-restantes === 1 ? '' : 's'}`, tono: 'text-red' }
  if (restantes === 0) return { texto: 'Se le vence hoy', tono: 'text-yellow' }
  if (restantes <= 5) return { texto: `Le quedan ${restantes} día${restantes === 1 ? '' : 's'}`, tono: 'text-yellow' }
  return { texto: `Al día · ${restantes} días`, tono: 'text-green-strong' }
}

export default function Cobrar({ perfil }) {
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [abierto, setAbierto] = useState(null)
  const [entrenadores, setEntrenadores] = useState([])
  const [precio, setPrecio] = useState('5000')
  const [ciclo, setCiclo] = useState(30)
  const [hoyPanel, setHoyPanel] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [exito, setExito] = useState('')
  const [nuevoAbierto, setNuevoAbierto] = useState(false)

  const puedeCobrar = perfil?.rol === 'admin'

  async function cargarBase() {
    const { data: cfg } = await supabase.rpc('config_lista')
    const mapa = Object.fromEntries((cfg || []).map((c) => [c.clave, c.valor]))
    if (mapa.precio_matricula) setPrecio(mapa.precio_matricula)
    if (mapa.ciclo_dias) setCiclo(Number(mapa.ciclo_dias))
    const { data: e } = await supabase.rpc('entrenadores_lista')
    setEntrenadores(e || [])
    const { data: p } = await supabase.rpc('matriculas_panel', { p_desde: fechaLocal(), p_hasta: fechaLocal() })
    setHoyPanel(p)
  }

  useEffect(() => {
    cargarBase()
  }, [])

  useEffect(() => {
    if (busqueda.trim().length < 2) { setResultados([]); return }
    setBuscando(true)
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('clientes_buscar', { p_busqueda: busqueda.trim(), p_limite: 20 })
      setResultados(data || [])
      setBuscando(false)
    }, 250)
    return () => { clearTimeout(t); setBuscando(false) }
  }, [busqueda])

  async function refrescarBusqueda() {
    if (busqueda.trim().length < 2) return
    const { data } = await supabase.rpc('clientes_buscar', { p_busqueda: busqueda.trim(), p_limite: 20 })
    setResultados(data || [])
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Cobrado hoy</div>
        <div className="text-3xl font-bold tabular-nums text-green-strong">
          {hoyPanel ? n(hoyPanel.total) : '—'} <span className="text-sm font-normal text-muted">CUP</span>
        </div>
        <div className="text-xs text-muted">{hoyPanel?.pagos ?? 0} pago{hoyPanel?.pagos === 1 ? '' : 's'} · matrícula {n(precio)} CUP</div>
      </div>

      {!puedeCobrar && (
        <p className="text-sm text-muted">Tu usuario ({perfil?.rol_nombre}) no tiene permiso para cobrar matrículas.</p>
      )}

      {puedeCobrar && (
        <>
          {exito && (
            <p className="text-sm font-semibold text-green-strong rounded-xl border border-green bg-green-soft px-4 py-2.5">{exito}</p>
          )}
          {mensaje && (
            <p className="text-sm text-red rounded-xl border border-red/30 bg-surface px-4 py-2.5">{mensaje}</p>
          )}

          <div>
            <input value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setExito('') }}
              placeholder="Buscar cliente por nombre o teléfono…"
              className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-green" />
            {busqueda.trim().length > 0 && busqueda.trim().length < 2 && (
              <p className="text-xs text-muted mt-1.5">Escribe al menos 2 letras.</p>
            )}
            {buscando && <p className="text-xs text-muted mt-1.5">Buscando…</p>}
            {!buscando && busqueda.trim().length >= 2 && resultados.length === 0 && (
              <p className="text-sm text-muted mt-2">
                No aparece nadie con ese nombre. Si es alguien que viene por primera vez, usa “Cliente nuevo”.
              </p>
            )}
          </div>

          <div className="space-y-2">
            {resultados.map((c) => (
              <FilaCobro key={c.id} c={c} ciclo={ciclo} precio={precio} entrenadores={entrenadores}
                abierto={abierto === c.id}
                onAbrir={() => { setAbierto(abierto === c.id ? null : c.id); setMensaje(''); setExito('') }}
                onError={setMensaje}
                onCobrado={async (texto) => {
                  setAbierto(null)
                  setExito(texto)
                  await Promise.all([cargarBase(), refrescarBusqueda()])
                }} />
            ))}
          </div>

          <div>
            <button onClick={() => { setNuevoAbierto((v) => !v); setMensaje(''); setExito('') }}
              className="text-sm font-semibold text-green-strong underline">
              {nuevoAbierto ? '– Cancelar' : '+ Cliente nuevo (primera vez)'}
            </button>
            {nuevoAbierto && (
              <ClienteNuevo precio={precio} entrenadores={entrenadores} onError={setMensaje}
                onCreado={async (texto) => {
                  setNuevoAbierto(false)
                  setExito(texto)
                  await cargarBase()
                }} />
            )}
          </div>

          <ConfigPrecio precio={precio} ciclo={ciclo} onGuardado={cargarBase} onError={setMensaje} />
        </>
      )}
    </div>
  )
}

function FilaCobro({ c, ciclo, precio, entrenadores, abierto, onAbrir, onCobrado, onError }) {
  const [monto, setMonto] = useState(precio)
  const [fecha, setFecha] = useState(fechaLocal())
  const [entrenador, setEntrenador] = useState(c.entrenador || '')
  const [cobrando, setCobrando] = useState(false)

  useEffect(() => { setMonto(precio) }, [precio])

  const estado = estadoCliente(c.ultima_visita, ciclo)

  async function cobrar() {
    if (cobrando) return
    setCobrando(true)
    const { data, error } = await supabase.rpc('cobrar_matricula', {
      p_cliente_id: c.id,
      p_monto: Number(monto),
      p_fecha: fecha,
      p_entrenador: entrenador || null
    })
    setCobrando(false)
    if (error) return onError('No se pudo cobrar: ' + error.message)
    const aviso = data?.ya_habia_pagado_ese_dia ? ' (ya tenía un pago ese día, se actualizó el monto)' : ''
    onCobrado(`✓ Cobrado ${n(data?.monto)} CUP a ${data?.nombre}${aviso}`)
  }

  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden">
      <button onClick={onAbrir} className="w-full text-left px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{c.nombre}</div>
          <div className="text-xs text-muted truncate">
            {c.telefono || 'sin teléfono'}{c.entrenador ? ` · ${c.entrenador}` : ''}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={'text-[11px] font-semibold ' + estado.tono}>{estado.texto}</div>
          {c.ultima_visita && <div className="text-[11px] text-muted">último: {fechaCorta(c.ultima_visita)}</div>}
        </div>
      </button>

      {abierto && (
        <div className="px-4 pb-4 pt-1 border-t border-line space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Monto (CUP)</label>
              <input type="number" min="0" value={monto} onChange={(e) => setMonto(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2.5 text-base outline-none focus:border-green" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-green" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Entrenador</label>
            <select value={entrenador} onChange={(e) => setEntrenador(e.target.value)}
              className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-green bg-surface">
              <option value="">Sin entrenador</option>
              {entrenadores.map((e) => <option key={e.entrenador} value={e.entrenador}>{e.entrenador}</option>)}
            </select>
          </div>

          <button onClick={cobrar} disabled={cobrando}
            className="w-full rounded-xl bg-green text-white font-semibold py-3 disabled:opacity-60">
            {cobrando ? 'Cobrando…' : `Cobrar ${n(monto)} CUP`}
          </button>
        </div>
      )}
    </div>
  )
}

function ClienteNuevo({ precio, entrenadores, onCreado, onError }) {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [sexo, setSexo] = useState('')
  const [entrenador, setEntrenador] = useState('')
  const [monto, setMonto] = useState(precio)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { setMonto(precio) }, [precio])

  const telLimpio = telefono.replace(/\D/g, '')
  const telAvisa = telLimpio.length > 0 && telLimpio.length !== 8

  async function guardar() {
    if (guardando) return
    if (!nombre.trim()) return onError('Ponle el nombre al cliente.')
    setGuardando(true)
    const { error } = await supabase.rpc('cliente_visita_registrar', {
      p_nombre: nombre.trim(),
      p_fecha: fechaLocal(),
      p_telefono: telLimpio || null,
      p_sexo: sexo || null,
      p_entrenador: entrenador || null,
      p_monto: Number(monto)
    })
    setGuardando(false)
    if (error) return onError('No se pudo guardar: ' + error.message)
    onCreado(`✓ ${nombre.trim()} quedó registrado y cobrado (${n(monto)} CUP)`)
    setNombre(''); setTelefono(''); setSexo(''); setEntrenador('')
  }

  return (
    <div className="mt-3 rounded-2xl border border-green bg-green-soft/40 p-4 space-y-2.5">
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellidos"
        className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-green" />
      <div>
        <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="numeric" placeholder="Teléfono (8 dígitos)"
          className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-green" />
        {telAvisa && (
          <p className="text-xs text-yellow mt-1">Un móvil cubano tiene 8 dígitos — revisa que esté completo o no le van a llegar los avisos.</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select value={sexo} onChange={(e) => setSexo(e.target.value)}
          className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-green bg-surface">
          <option value="">Sexo</option>
          <option value="Hombre">Hombre</option>
          <option value="Mujer">Mujer</option>
        </select>
        <select value={entrenador} onChange={(e) => setEntrenador(e.target.value)}
          className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-green bg-surface">
          <option value="">Sin entrenador</option>
          {entrenadores.map((e) => <option key={e.entrenador} value={e.entrenador}>{e.entrenador}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-muted mb-1">Monto de la matrícula (CUP)</label>
        <input type="number" min="0" value={monto} onChange={(e) => setMonto(e.target.value)}
          className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-green" />
      </div>
      <button onClick={guardar} disabled={guardando}
        className="w-full rounded-xl bg-green text-white font-semibold py-3 disabled:opacity-60">
        {guardando ? 'Guardando…' : 'Registrar y cobrar'}
      </button>
    </div>
  )
}

function ConfigPrecio({ precio, ciclo, onGuardado, onError }) {
  const [abierto, setAbierto] = useState(false)
  const [p, setP] = useState(precio)
  const [c, setC] = useState(String(ciclo))
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { setP(precio); setC(String(ciclo)) }, [precio, ciclo])

  async function guardar() {
    setGuardando(true)
    const r1 = await supabase.rpc('config_fijar', { p_clave: 'precio_matricula', p_valor: String(Number(p)) })
    const r2 = await supabase.rpc('config_fijar', { p_clave: 'ciclo_dias', p_valor: String(Number(c)) })
    setGuardando(false)
    if (r1.error || r2.error) return onError('No se pudo guardar: ' + (r1.error || r2.error).message)
    setAbierto(false)
    onGuardado()
  }

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="text-xs font-semibold text-muted underline">
        Precio de la matrícula y días del ciclo
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold text-muted mb-1">Precio (CUP)</label>
          <input type="number" min="0" value={p} onChange={(e) => setP(e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-base outline-none focus:border-green" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted mb-1">Dura (días)</label>
          <input type="number" min="1" max="90" value={c} onChange={(e) => setC(e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-base outline-none focus:border-green" />
        </div>
      </div>
      <p className="text-xs text-muted">Con esto la app calcula a quién se le vence la matrícula y cuánto cobrar por defecto.</p>
      <div className="flex gap-2">
        <button onClick={guardar} disabled={guardando}
          className="flex-1 rounded-xl bg-green text-white text-sm font-semibold py-2.5 disabled:opacity-60">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button onClick={() => setAbierto(false)} className="text-sm text-muted px-3">Cancelar</button>
      </div>
    </div>
  )
}
