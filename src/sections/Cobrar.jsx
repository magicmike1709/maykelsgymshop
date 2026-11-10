import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fechaLocal, fechaDiaMesAnio } from '../lib/fecha'
import { n } from '../lib/formato'
import { num, usdTxt, mensajeError, esConflicto, nuevoOpId, chipEstado, textoVence } from '../lib/gym'

// Cobro de matrículas del gym (recepción y dueño).
// - Precio en USD con tasa de cobro; se paga en efectivo CUP, transferencia y/o efectivo USD.
// - La fecha de cobro la pone quien cobra; la fecha oficial (vencimiento) la fija el dueño.

const campo = 'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-green'
const etiqueta = 'block text-xs font-semibold text-muted mb-1'

function Aviso({ tipo = 'error', children }) {
  const clases = tipo === 'error'
    ? 'text-red border-red/30'
    : tipo === 'ok'
      ? 'text-green-strong border-green bg-green-soft font-semibold'
      : 'text-yellow-ink border-yellow bg-yellow-soft'
  return <p className={'text-sm rounded-xl border px-4 py-2.5 ' + clases}>{children}</p>
}

export default function Cobrar({ perfil }) {
  const esAdmin = perfil?.rol === 'admin'
  const puedeCobrar = esAdmin || perfil?.rol === 'cobrador'

  const [cfg, setCfg] = useState(null)
  const [hoy, setHoy] = useState(null)
  const [mes, setMes] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [abierto, setAbierto] = useState(null)
  const [vencen, setVencen] = useState([])
  const [mensaje, setMensaje] = useState('')
  const [exito, setExito] = useState('')
  const [nuevoAbierto, setNuevoAbierto] = useState(false)

  const cargarBase = useCallback(async () => {
    const [c, h] = await Promise.all([
      supabase.rpc('gym_config'),
      supabase.rpc('gym_resumen_dia', { p_dia: null })
    ])
    if (c.error) setMensaje(mensajeError(c.error)); else setCfg(c.data)
    if (!h.error) setHoy(h.data)
    const { data: v } = await supabase.rpc('gym_vencimientos', { p_dias_aviso: 5, p_max_vencido: 20 })
    setVencen(v || [])
    if (esAdmin) {
      const d = fechaLocal()
      const { data: m } = await supabase.rpc('gym_resumen_periodo', { p_desde: `${d.slice(0, 7)}-01`, p_hasta: d })
      setMes(m)
    }
  }, [esAdmin])

  useEffect(() => { if (puedeCobrar) cargarBase() }, [puedeCobrar, cargarBase])

  const buscar = useCallback(async (texto) => {
    const { data, error } = await supabase.rpc('gym_clientes_buscar', { p_busqueda: texto, p_limite: 25 })
    if (error) { setMensaje(mensajeError(error)); return }
    setResultados(data || [])
  }, [])

  useEffect(() => {
    const t = busqueda.trim()
    if (t.length < 2) { setResultados([]); setBuscando(false); return }
    setBuscando(true)
    const id = setTimeout(async () => { await buscar(t); setBuscando(false) }, 250)
    return () => { clearTimeout(id); setBuscando(false) }
  }, [busqueda, buscar])

  async function despuesDeCobrar(texto) {
    setAbierto(null)
    setNuevoAbierto(false)
    setExito(texto)
    setMensaje('')
    await Promise.all([cargarBase(), busqueda.trim().length >= 2 ? buscar(busqueda.trim()) : Promise.resolve()])
  }

  if (!puedeCobrar) {
    return <p className="text-sm text-muted">Tu usuario ({perfil?.rol_nombre}) no tiene permiso para cobrar matrículas.</p>
  }

  const seleccionado = resultados.find((r) => r.id === abierto) || null
  const sinTasa = cfg && !cfg.tasa

  return (
    <div className="space-y-4 pb-4">
      <Encabezado cfg={cfg} hoy={hoy} mes={mes} esAdmin={esAdmin} />

      {sinTasa && (
        <Aviso tipo="aviso">
          Falta la tasa de cobro del dólar. {esAdmin
            ? 'Ponla abajo, en “Precio y tasa”, para sugerir el monto y cobrar en dólares.'
            : 'Avisa al dueño. Mientras tanto se puede cobrar en pesos escribiendo el monto.'}
        </Aviso>
      )}
      {exito && <Aviso tipo="ok">{exito}</Aviso>}
      {mensaje && <Aviso>{mensaje}</Aviso>}

      <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start">
        <div className={'space-y-3 ' + (seleccionado || nuevoAbierto ? 'hidden md:block' : '')}>
          <div>
            <input
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setExito(''); setMensaje('') }}
              placeholder="Buscar cliente por nombre o teléfono…"
              aria-label="Buscar cliente"
              className={campo + ' py-3'}
            />
            {busqueda.trim().length > 0 && busqueda.trim().length < 2 && (
              <p className="text-xs text-muted mt-1.5">Escribe al menos 2 letras.</p>
            )}
            {buscando && <p className="text-xs text-muted mt-1.5">Buscando…</p>}
            {!buscando && busqueda.trim().length >= 2 && resultados.length === 0 && (
              <p className="text-sm text-muted mt-2">
                No aparece nadie con eso. Si viene por primera vez, usa “Cliente nuevo”.
              </p>
            )}
          </div>

          {resultados.length > 0 && (
            <ul className="space-y-2">
              {resultados.map((c) => (
                <li key={c.id}>
                  <FilaCliente c={c} activo={abierto === c.id}
                    onAbrir={() => { setAbierto(c.id); setNuevoAbierto(false); setExito(''); setMensaje('') }} />
                </li>
              ))}
            </ul>
          )}

          {busqueda.trim().length < 2 && vencen.length > 0 && (
            <Vencimientos lista={vencen} onElegir={(nombre) => setBusqueda(nombre)} />
          )}

          <button onClick={() => { setNuevoAbierto(true); setAbierto(null); setExito(''); setMensaje('') }}
            className="text-sm font-semibold text-green-strong underline">
            + Cliente nuevo (primera vez)
          </button>
        </div>

        <div className={seleccionado || nuevoAbierto ? '' : 'hidden md:block'}>
          {seleccionado && (
            <Ficha key={seleccionado.id} c={seleccionado} cfg={cfg} esAdmin={esAdmin}
              onCerrar={() => setAbierto(null)}
              onCobrado={despuesDeCobrar}
              onCambio={async () => { await cargarBase(); await buscar(busqueda.trim()) }}
              onError={setMensaje} />
          )}
          {nuevoAbierto && (
            <ClienteNuevo cfg={cfg} onCerrar={() => setNuevoAbierto(false)} onCobrado={despuesDeCobrar} onError={setMensaje} />
          )}
          {!seleccionado && !nuevoAbierto && (
            <div className="hidden md:block rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
              Elige un cliente de la lista para cobrarle.
            </div>
          )}
        </div>
      </div>

      <ResumenDia hoy={hoy} esAdmin={esAdmin} onCambio={cargarBase} onError={setMensaje} />
      {esAdmin && <ConfigGym cfg={cfg} onGuardado={cargarBase} onError={setMensaje} />}
    </div>
  )
}

function Encabezado({ cfg, hoy, mes, esAdmin }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1">Cobrado hoy</div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="text-3xl font-bold tabular-nums text-green-strong">
          {hoy ? n(hoy.total_cup) : '—'} <span className="text-sm font-normal text-muted">CUP</span>
        </div>
        {hoy && Number(hoy.total_usd) > 0 && (
          <div className="text-sm text-muted tabular-nums">≈ {usdTxt(hoy.total_usd)} USD</div>
        )}
      </div>
      <div className="text-xs text-muted mt-1">
        {hoy?.cobros ?? 0} cobro{hoy?.cobros === 1 ? '' : 's'}
        {cfg?.tasa ? ` · matrícula ${usdTxt(cfg.precio_usd)} USD × ${n(cfg.tasa)} = ${n(cfg.precio_cup_sugerido)} CUP` : ''}
      </div>
      {esAdmin && mes && (
        <div className="text-xs text-muted mt-2 pt-2 border-t border-line tabular-nums">
          Este mes: {n(mes.total_cup)} CUP{Number(mes.total_usd) > 0 ? ` ≈ ${usdTxt(mes.total_usd)} USD` : ''} · {mes.cobros} cobros
          {Number(mes.cobros) > Number(mes.cobros_con_tasa) ? ` (${Number(mes.cobros) - Number(mes.cobros_con_tasa)} sin tasa, no entran en USD)` : ''}
        </div>
      )}
    </div>
  )
}

function FilaCliente({ c, activo, onAbrir }) {
  const chip = chipEstado(c)
  return (
    <button onClick={onAbrir}
      className={'w-full text-left rounded-xl border bg-surface px-4 py-3 ' + (activo ? 'border-green' : 'border-line')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold break-words">{c.nombre}</div>
          <div className="text-xs text-muted">
            {c.telefono || 'sin teléfono'}{c.entrenador ? ` · ${c.entrenador}` : ''}
          </div>
        </div>
        {c.cobro_hoy && <span className="shrink-0 rounded-full bg-green-soft text-green-strong text-[11px] font-semibold px-2.5 py-1">Cobrado hoy</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={'inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ' + chip.clase}>{chip.texto}</span>
        <span className="text-xs text-muted">
          {c.base ? `${c.oficial_origen === 'cobro' ? 'Cobro' : 'Fecha'} ${fechaDiaMesAnio(c.base)}` : ''}
          {c.oficial_origen === 'cobro' ? ' · provisional' : ''}
        </span>
      </div>
    </button>
  )
}

function Vencimientos({ lista, onElegir }) {
  const proximos = lista.filter((v) => v.estado !== 'vencido').slice(0, 8)
  const vencidos = lista.filter((v) => v.estado === 'vencido').slice(0, 6)
  const fila = (v) => {
    const t = textoVence(v.dias, v.estado)
    return (
      <li key={v.id}>
        <button onClick={() => onElegir(v.nombre)} className="w-full text-left flex items-center justify-between gap-3 py-2 border-b border-line last:border-0">
          <span className="min-w-0">
            <span className="block text-sm font-semibold truncate">{v.nombre}</span>
            <span className="block text-xs text-muted">{v.entrenador || 'sin entrenador'}{v.provisional ? ' · provisional' : ''}</span>
          </span>
          <span className={'shrink-0 text-xs font-semibold ' + t.clase}>{t.texto}</span>
        </button>
      </li>
    )
  }
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3 space-y-3">
      {proximos.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-1">Se les vence pronto ({proximos.length})</div>
          <ul>{proximos.map(fila)}</ul>
        </div>
      )}
      {vencidos.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-1">Vencidos hace poco ({vencidos.length})</div>
          <ul>{vencidos.map(fila)}</ul>
        </div>
      )}
    </div>
  )
}

// Montos del cobro: efectivo CUP, transferencia CUP y efectivo USD. El efectivo en CUP se
// ajusta solo a lo que falta para el precio, salvo que se escriba a mano.
function useMontos(cfg) {
  const sugerido = cfg?.precio_cup_sugerido ?? null
  const tasa = cfg?.tasa ?? null
  const [ef, setEf] = useState(sugerido != null ? String(sugerido) : '')
  const [tr, setTr] = useState('')
  const [us, setUs] = useState('')
  const [efManual, setEfManual] = useState(false)

  const total = num(ef) + num(tr) + Math.round(num(us) * (tasa || 0))
  const totalUsd = tasa ? total / tasa : null

  function reponerEfectivo(trNuevo, usNuevo) {
    if (efManual || sugerido == null) return
    const resto = sugerido - num(trNuevo) - Math.round(num(usNuevo) * (tasa || 0))
    setEf(String(Math.max(0, resto)))
  }
  const cambiarTr = (v) => { setTr(v); reponerEfectivo(v, us) }
  const cambiarUs = (v) => { setUs(v); reponerEfectivo(tr, v) }
  const cambiarEf = (v) => { setEf(v); setEfManual(true) }
  function todoEn(campoDestino) {
    setEfManual(false)
    const base = sugerido != null ? sugerido : 0
    setEf(campoDestino === 'ef' ? String(base) : '0')
    setTr(campoDestino === 'tr' ? String(base) : '')
    setUs('')
  }
  return { ef, tr, us, total, totalUsd, sugerido, tasa, cambiarEf, cambiarTr, cambiarUs, todoEn }
}

function CamposCobro({ m, cfg }) {
  const dif = m.sugerido != null ? m.total - m.sugerido : null
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={etiqueta} htmlFor="c-ef">Efectivo CUP</label>
          <input id="c-ef" type="number" inputMode="decimal" min="0" value={m.ef} onChange={(e) => m.cambiarEf(e.target.value)} className={campo} />
        </div>
        <div>
          <label className={etiqueta} htmlFor="c-tr">Transferencia</label>
          <input id="c-tr" type="number" inputMode="decimal" min="0" value={m.tr} onChange={(e) => m.cambiarTr(e.target.value)} className={campo} placeholder="0" />
        </div>
        <div>
          <label className={etiqueta} htmlFor="c-us">Efectivo USD</label>
          <input id="c-us" type="number" inputMode="decimal" min="0" value={m.us} onChange={(e) => m.cambiarUs(e.target.value)} className={campo} placeholder="0" disabled={!cfg?.tasa} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => m.todoEn('ef')} className="text-xs font-semibold rounded-full border border-line px-3 py-1.5">Todo en efectivo</button>
        <button type="button" onClick={() => m.todoEn('tr')} className="text-xs font-semibold rounded-full border border-line px-3 py-1.5">Todo por transferencia</button>
      </div>
      <div className="rounded-xl bg-sunken px-3 py-2.5 text-sm tabular-nums">
        <span className="font-semibold">Total {n(m.total)} CUP</span>
        {m.totalUsd != null && <span className="text-muted"> ≈ {usdTxt(Math.round(m.totalUsd * 100) / 100)} USD</span>}
        {dif != null && dif !== 0 && (
          <span className="block text-xs text-yellow-ink mt-0.5">
            {dif < 0 ? `Faltan ${n(-dif)} CUP` : `Sobran ${n(dif)} CUP`} para el precio normal ({n(m.sugerido)}).
          </span>
        )}
        {dif === 0 && <span className="block text-xs text-green-strong mt-0.5">Cuadra con el precio normal.</span>}
      </div>
    </div>
  )
}

function Ficha({ c, cfg, esAdmin, onCerrar, onCobrado, onCambio, onError }) {
  const m = useMontos(cfg)
  const [caso, setCaso] = useState(false)
  const [entrenador, setEntrenador] = useState(c.entrenador || '')
  const [fecha, setFecha] = useState(fechaLocal())
  const [paso, setPaso] = useState('form') // form | confirmar | enviando
  const [opId] = useState(nuevoOpId)
  const [editando, setEditando] = useState(false)
  const chip = chipEstado(c)
  const entrenadores = cfg?.entrenadores || []

  const faltaMonto = m.total <= 0 && !caso

  async function cobrar() {
    setPaso('enviando')
    const { data, error } = await supabase.rpc('gym_cobrar', {
      p_cliente_id: c.id,
      p_fecha: esAdmin ? fecha : null,
      p_efectivo_cup: num(m.ef),
      p_transferencia_cup: num(m.tr),
      p_efectivo_usd: num(m.us),
      p_caso_social: caso,
      p_entrenador: entrenador || null,
      p_op_id: opId,
      p_cobrado_en: null
    })
    if (error) { onError(mensajeError(error)); setPaso('form'); return }
    const usdTxtEq = data.usd_equivalente != null ? ` ≈ ${usdTxt(data.usd_equivalente)} USD` : ''
    const aviso = data.repetido ? ' (ya estaba registrado, no se duplicó)' : ''
    onCobrado(`✓ Cobrado ${n(data.monto)} CUP${usdTxtEq} a ${data.nombre}${aviso}. Vence el ${fechaDiaMesAnio(data.vence)}.`)
  }

  return (
    <div className="rounded-2xl border border-green bg-surface p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-lg font-bold uppercase leading-tight break-words">{c.nombre}</div>
          <div className="text-xs text-muted">{c.telefono || 'sin teléfono'}{c.entrenador ? ` · ${c.entrenador}` : ''}</div>
        </div>
        <button onClick={onCerrar} className="shrink-0 text-sm font-semibold text-muted border border-line rounded-full px-3 py-1.5">Cerrar</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={'inline-block rounded-full px-2.5 py-1 text-xs font-semibold ' + chip.clase}>{chip.texto}</span>
        <span className="text-xs text-muted tabular-nums">
          {c.base ? `Fecha ${c.oficial_origen === 'cobro' ? 'del último cobro' : 'oficial'}: ${fechaDiaMesAnio(c.base)}` : 'Nunca ha pagado'}
          {c.oficial_origen === 'cobro' ? ' (provisional, falta MobiDB)' : ''}
        </span>
      </div>

      {c.notas && <p className="text-sm rounded-xl bg-yellow-soft text-yellow-ink px-3 py-2">Nota: {c.notas}</p>}

      {c.cobro_hoy ? (
        <Aviso tipo="aviso">Este cliente ya tiene un cobro hoy. Si fue un error, el dueño puede anularlo desde “Cobros de hoy”.</Aviso>
      ) : paso === 'confirmar' ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-line px-4 py-3 text-sm space-y-1 tabular-nums">
            <div className="font-semibold text-base">Cobrar {n(m.total)} CUP{caso ? ' (caso social)' : ''}</div>
            {num(m.ef) > 0 && <div>Efectivo: {n(num(m.ef))} CUP</div>}
            {num(m.tr) > 0 && <div>Transferencia: {n(num(m.tr))} CUP</div>}
            {num(m.us) > 0 && <div>Efectivo en dólares: {usdTxt(num(m.us))} USD (a {n(m.tasa)} = {n(Math.round(num(m.us) * m.tasa))} CUP)</div>}
            {m.totalUsd != null && <div className="text-muted">Total ≈ {usdTxt(Math.round(m.totalUsd * 100) / 100)} USD</div>}
            <div className="text-muted">Fecha: {esAdmin && fecha !== fechaLocal() ? fechaDiaMesAnio(fecha) : 'hoy'} · Entrenador: {entrenador || 'sin entrenador'}</div>
          </div>
          <p className="text-xs text-muted">Al confirmar queda registrado. Solo el dueño puede anularlo.</p>
          <div className="flex gap-2">
            <button onClick={cobrar} className="flex-1 rounded-xl bg-green text-white font-semibold py-3">Confirmar cobro</button>
            <button onClick={() => setPaso('form')} className="px-4 text-sm text-muted">Volver</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <CamposCobro m={m} cfg={cfg} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={caso} onChange={(e) => setCaso(e.target.checked)} className="w-5 h-5" />
            Caso social (puede pagar 0)
          </label>
          <div className={esAdmin ? 'grid grid-cols-2 gap-2' : ''}>
            <div>
              <label className={etiqueta} htmlFor="c-ent">Entrenador</label>
              <select id="c-ent" value={entrenador} onChange={(e) => setEntrenador(e.target.value)} className={campo}>
                <option value="">Sin entrenador</option>
                {entrenadores.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            {esAdmin && (
              <div>
                <label className={etiqueta} htmlFor="c-fecha">Fecha del cobro</label>
                <input id="c-fecha" type="date" max={fechaLocal()} value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
              </div>
            )}
          </div>
          <button onClick={() => setPaso('confirmar')} disabled={faltaMonto || paso === 'enviando'}
            className="w-full rounded-xl bg-green text-white font-semibold py-3 disabled:opacity-50">
            {faltaMonto ? 'Escribe lo que pagó' : `Revisar cobro de ${n(m.total)} CUP`}
          </button>
        </div>
      )}

      {esAdmin && <FechaOficial c={c} cfg={cfg} onCambio={onCambio} onError={onError} />}

      <button onClick={() => setEditando((v) => !v)} className="text-xs font-semibold text-muted underline">
        {editando ? 'Cerrar edición de datos' : 'Corregir nombre, teléfono, notas…'}
      </button>
      {editando && <EditarCliente c={c} entrenadores={entrenadores} onGuardado={async () => { setEditando(false); await onCambio() }} onError={onError} />}
    </div>
  )
}

function FechaOficial({ c, cfg, onCambio, onError }) {
  const [abierto, setAbierto] = useState(false)
  const [fecha, setFecha] = useState(c.base || fechaLocal())
  const [nota, setNota] = useState('')
  const [hist, setHist] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const ciclo = cfg?.ciclo_dias || 30

  async function abrir() {
    setAbierto(true)
    const { data } = await supabase.rpc('gym_fecha_oficial_historial', { p_cliente_id: c.id })
    setHist(data || [])
  }
  async function guardar() {
    setGuardando(true)
    const { error } = await supabase.rpc('gym_fecha_oficial_fijar', { p_cliente_id: c.id, p_fecha: fecha, p_nota: nota || null })
    setGuardando(false)
    if (error) return onError(mensajeError(error))
    setAbierto(false)
    await onCambio()
  }

  if (!abierto) {
    return (
      <button onClick={abrir} className="text-xs font-semibold text-green-strong underline">
        Fecha oficial (vencimiento): {c.base ? fechaDiaMesAnio(c.base) : 'sin fecha'} · editar
      </button>
    )
  }
  const vence = fecha ? new Date(new Date(fecha + 'T00:00:00').getTime() + ciclo * 86400000) : null
  return (
    <div className="rounded-xl border border-line p-3 space-y-2.5">
      <div className="text-sm font-semibold">Fecha oficial del cliente</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={etiqueta} htmlFor="fo-fecha">Fecha oficial</label>
          <input id="fo-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
        </div>
        <div>
          <label className={etiqueta} htmlFor="fo-nota">Nota (opcional)</label>
          <input id="fo-nota" value={nota} onChange={(e) => setNota(e.target.value)} className={campo} placeholder="Ej: pagó adelantado" />
        </div>
      </div>
      {vence && <p className="text-xs text-muted">Con {ciclo} días vence el {fechaDiaMesAnio(fechaLocal(vence))}. Una fecha puesta a mano no la pisa el CSV de MobiDB.</p>}
      <div className="flex gap-2">
        <button onClick={guardar} disabled={guardando || !fecha} className="flex-1 rounded-xl bg-green text-white text-sm font-semibold py-2.5 disabled:opacity-60">
          {guardando ? 'Guardando…' : 'Guardar fecha'}
        </button>
        <button onClick={() => setAbierto(false)} className="text-sm text-muted px-3">Cancelar</button>
      </div>
      {hist && hist.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer font-semibold">Historial de cambios ({hist.length})</summary>
          <ul className="mt-1 space-y-1">
            {hist.map((h, i) => (
              <li key={i}>
                {fechaDiaMesAnio(h.creado_en.slice(0, 10))}: {h.fecha_anterior ? fechaDiaMesAnio(h.fecha_anterior) : '—'} → {h.fecha_nueva ? fechaDiaMesAnio(h.fecha_nueva) : '—'} ({h.origen}{h.usuario ? `, ${h.usuario}` : ''}){h.nota ? ` · ${h.nota}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function EditarCliente({ c, entrenadores, onGuardado, onError }) {
  const [nombre, setNombre] = useState(c.nombre)
  const [telefono, setTelefono] = useState(c.telefono || '')
  const [entrenador, setEntrenador] = useState(c.entrenador || '')
  const [sexo, setSexo] = useState(c.sexo || '')
  const [nacimiento, setNacimiento] = useState(c.nacimiento || '')
  const [notas, setNotas] = useState(c.notas || '')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    const { error } = await supabase.rpc('gym_cliente_editar', {
      p_id: c.id, p_nombre: nombre, p_telefono: telefono || null, p_sexo: sexo || null,
      p_entrenador: entrenador || null, p_nacimiento: nacimiento || null, p_notas: notas || null
    })
    setGuardando(false)
    if (error) return onError(mensajeError(error))
    onGuardado()
  }
  const telLimpio = telefono.replace(/\D/g, '')
  return (
    <div className="rounded-xl border border-line p-3 space-y-2.5">
      <div>
        <label className={etiqueta} htmlFor="ed-nombre">Nombre</label>
        <input id="ed-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
      </div>
      <div>
        <label className={etiqueta} htmlFor="ed-tel">Teléfono</label>
        <input id="ed-tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="numeric" className={campo} />
        {telLimpio.length > 0 && telLimpio.length !== 8 && (
          <p className="text-xs text-yellow-ink mt-1">Un móvil cubano tiene 8 dígitos. Revisa que esté completo.</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={etiqueta} htmlFor="ed-sexo">Sexo</label>
          <select id="ed-sexo" value={sexo} onChange={(e) => setSexo(e.target.value)} className={campo}>
            <option value="">—</option><option value="Hombre">Hombre</option><option value="Mujer">Mujer</option>
          </select>
        </div>
        <div>
          <label className={etiqueta} htmlFor="ed-ent">Entrenador</label>
          <select id="ed-ent" value={entrenador} onChange={(e) => setEntrenador(e.target.value)} className={campo}>
            <option value="">Sin entrenador</option>
            {entrenadores.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={etiqueta} htmlFor="ed-nac">Cumpleaños</label>
        <input id="ed-nac" type="date" value={nacimiento} onChange={(e) => setNacimiento(e.target.value)} className={campo} />
      </div>
      <div>
        <label className={etiqueta} htmlFor="ed-notas">Notas (lesiones, alergias, recordatorios)</label>
        <textarea id="ed-notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={1000} className={campo} />
      </div>
      <button onClick={guardar} disabled={guardando} className="w-full rounded-xl bg-green text-white text-sm font-semibold py-2.5 disabled:opacity-60">
        {guardando ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </div>
  )
}

function ClienteNuevo({ cfg, onCerrar, onCobrado, onError }) {
  const m = useMontos(cfg)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [sexo, setSexo] = useState('')
  const [entrenador, setEntrenador] = useState('')
  const [nacimiento, setNacimiento] = useState('')
  const [caso, setCaso] = useState(false)
  const [opId] = useState(nuevoOpId)
  const [guardando, setGuardando] = useState(false)
  const [repetido, setRepetido] = useState('')
  const entrenadores = cfg?.entrenadores || []
  const telLimpio = telefono.replace(/\D/g, '')

  async function guardar(forzar = false) {
    if (guardando) return
    if (!nombre.trim()) return onError('Escribe el nombre del cliente.')
    if (m.total <= 0 && !caso) return onError('Escribe lo que pagó (o marca caso social).')
    setGuardando(true)
    const { data, error } = await supabase.rpc('gym_cliente_nuevo_cobrar', {
      p_nombre: nombre.trim(), p_telefono: telLimpio || null, p_sexo: sexo || null, p_entrenador: entrenador || null,
      p_nacimiento: nacimiento || null, p_efectivo_cup: num(m.ef), p_transferencia_cup: num(m.tr),
      p_efectivo_usd: num(m.us), p_caso_social: caso, p_forzar: forzar, p_op_id: opId
    })
    setGuardando(false)
    if (error) {
      if (esConflicto(error) && !forzar && /ya existe/.test(error.message)) { setRepetido(mensajeError(error)); return }
      return onError(mensajeError(error))
    }
    onCobrado(`✓ ${nombre.trim()} quedó registrado y cobrado (${n(data.monto)} CUP).${data.telefono_de_otro ? ' Ojo: su teléfono ya era de otra persona, se guardó sin teléfono.' : ''}`)
  }

  return (
    <div className="rounded-2xl border border-green bg-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="font-display text-lg font-bold uppercase">Cliente nuevo</div>
        <button onClick={onCerrar} className="text-sm font-semibold text-muted border border-line rounded-full px-3 py-1.5">Cerrar</button>
      </div>
      <div>
        <label className={etiqueta} htmlFor="nn-nombre">Nombre y apellidos</label>
        <input id="nn-nombre" value={nombre} onChange={(e) => { setNombre(e.target.value); setRepetido('') }} className={campo} />
      </div>
      <div>
        <label className={etiqueta} htmlFor="nn-tel">Teléfono (8 dígitos)</label>
        <input id="nn-tel" value={telefono} onChange={(e) => { setTelefono(e.target.value); setRepetido('') }} inputMode="numeric" className={campo} />
        {telLimpio.length > 0 && telLimpio.length !== 8 && (
          <p className="text-xs text-yellow-ink mt-1">Un móvil cubano tiene 8 dígitos. Si falta alguno, no le llegarán los avisos.</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={etiqueta} htmlFor="nn-sexo">Sexo</label>
          <select id="nn-sexo" value={sexo} onChange={(e) => setSexo(e.target.value)} className={campo}>
            <option value="">—</option><option value="Hombre">Hombre</option><option value="Mujer">Mujer</option>
          </select>
        </div>
        <div>
          <label className={etiqueta} htmlFor="nn-ent">Entrenador</label>
          <select id="nn-ent" value={entrenador} onChange={(e) => setEntrenador(e.target.value)} className={campo}>
            <option value="">Sin entrenador</option>
            {entrenadores.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={etiqueta} htmlFor="nn-nac">Cumpleaños (opcional)</label>
        <input id="nn-nac" type="date" value={nacimiento} onChange={(e) => setNacimiento(e.target.value)} className={campo} />
      </div>
      <CamposCobro m={m} cfg={cfg} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={caso} onChange={(e) => setCaso(e.target.checked)} className="w-5 h-5" />
        Caso social (puede pagar 0)
      </label>
      {repetido && (
        <div className="rounded-xl border border-yellow bg-yellow-soft px-3 py-2.5 text-sm text-yellow-ink space-y-2">
          <p>{repetido}</p>
          <button onClick={() => guardar(true)} className="text-xs font-semibold underline">Es otra persona, crear de todas formas</button>
        </div>
      )}
      <button onClick={() => guardar(false)} disabled={guardando}
        className="w-full rounded-xl bg-green text-white font-semibold py-3 disabled:opacity-60">
        {guardando ? 'Guardando…' : `Registrar y cobrar ${n(m.total)} CUP`}
      </button>
    </div>
  )
}

function ResumenDia({ hoy, esAdmin, onCambio, onError }) {
  const [anulando, setAnulando] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [cup, setCup] = useState('')
  const [usd, setUsd] = useState('')
  const [conteo, setConteo] = useState(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (hoy?.conteo) { setCup(String(hoy.conteo.cup)); setUsd(String(hoy.conteo.usd)) }
  }, [hoy?.conteo?.cup, hoy?.conteo?.usd])

  async function anular() {
    if (!motivo.trim()) return onError('Escribe el motivo de la anulación.')
    setEnviando(true)
    const { error } = await supabase.rpc('gym_cobro_anular', { p_visita_id: anulando.id, p_motivo: motivo.trim() })
    setEnviando(false)
    if (error) return onError(mensajeError(error))
    setAnulando(null); setMotivo('')
    await onCambio()
  }
  async function contar() {
    setEnviando(true)
    const { data, error } = await supabase.rpc('gym_caja_contar', { p_dia: fechaLocal(), p_contado_cup: num(cup), p_contado_usd: num(usd) })
    setEnviando(false)
    if (error) return onError(mensajeError(error))
    setConteo(data)
    await onCambio()
  }
  if (!hoy) return null
  const lista = hoy.lista || []
  const dif = (v, moneda) => v === 0 ? 'cuadra' : v < 0 ? `faltan ${moneda === 'usd' ? usdTxt(-v) : n(-v)}` : `sobran ${moneda === 'usd' ? usdTxt(v) : n(v)}`

  return (
    <details className="rounded-2xl border border-line bg-surface">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
        Cobros de hoy ({hoy.cobros}){hoy.anulados > 0 ? ` · ${hoy.anulados} anulado${hoy.anulados === 1 ? '' : 's'}` : ''}
      </summary>
      <div className="px-4 pb-4 space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-sunken py-2"><div className="text-[11px] text-muted">Efectivo CUP</div><div className="font-semibold tabular-nums">{n(hoy.efectivo_cup)}</div></div>
          <div className="rounded-xl bg-sunken py-2"><div className="text-[11px] text-muted">Efectivo USD</div><div className="font-semibold tabular-nums">{usdTxt(hoy.efectivo_usd)}</div></div>
          <div className="rounded-xl bg-sunken py-2"><div className="text-[11px] text-muted">Transferencia</div><div className="font-semibold tabular-nums">{n(hoy.transferencia_cup)}</div></div>
        </div>

        {lista.length === 0 && <p className="text-sm text-muted">Todavía no hay cobros hoy.</p>}
        <ul className="divide-y divide-line">
          {lista.map((p) => (
            <li key={p.id} className="py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold break-words">{p.nombre}</div>
                <div className="text-xs text-muted tabular-nums">
                  {new Date(p.hora).toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' })}
                  {' · '}{Number(p.efectivo_cup) > 0 ? `efect. ${n(p.efectivo_cup)}` : ''}
                  {Number(p.transferencia_cup) > 0 ? ` transf. ${n(p.transferencia_cup)}` : ''}
                  {Number(p.efectivo_usd) > 0 ? ` + ${usdTxt(p.efectivo_usd)} USD` : ''}
                  {p.caso_social ? ' · caso social' : ''}{p.fuera_de_precio ? ' · fuera de precio' : ''}
                  {p.cobrador ? ` · ${p.cobrador}` : ''}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold tabular-nums">{n(p.monto)}</div>
                {esAdmin && <button onClick={() => { setAnulando(p); setMotivo('') }} className="text-xs font-semibold text-red underline">Anular</button>}
              </div>
            </li>
          ))}
        </ul>

        {anulando && (
          <div className="rounded-xl border border-red/30 p-3 space-y-2">
            <p className="text-sm">Anular el cobro de <b>{anulando.nombre}</b> ({n(anulando.monto)} CUP). Queda guardado como anulado, con tu nombre y el motivo.</p>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (ej. cobro duplicado)" aria-label="Motivo de la anulación" className={campo} />
            <div className="flex gap-2">
              <button onClick={anular} disabled={enviando} className="flex-1 rounded-xl bg-red text-white text-sm font-semibold py-2.5 disabled:opacity-60">Anular cobro</button>
              <button onClick={() => setAnulando(null)} className="text-sm text-muted px-3">Cancelar</button>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-line p-3 space-y-2.5">
          <div className="text-sm font-semibold">Contar la caja del gym</div>
          <p className="text-xs text-muted">Cuenta el efectivo que hay y compáralo con lo cobrado: {n(hoy.efectivo_cup)} CUP y {usdTxt(hoy.efectivo_usd)} USD.</p>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={etiqueta} htmlFor="cj-cup">Contado en CUP</label><input id="cj-cup" type="number" inputMode="decimal" value={cup} onChange={(e) => setCup(e.target.value)} className={campo} /></div>
            <div><label className={etiqueta} htmlFor="cj-usd">Contado en USD</label><input id="cj-usd" type="number" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} className={campo} /></div>
          </div>
          <button onClick={contar} disabled={enviando || cup === '' || usd === ''} className="w-full rounded-xl bg-green text-white text-sm font-semibold py-2.5 disabled:opacity-60">Guardar conteo</button>
          {conteo && (
            <p className="text-sm tabular-nums">
              Pesos: <b>{dif(conteo.diferencia_cup, 'cup')}</b> · Dólares: <b>{dif(conteo.diferencia_usd, 'usd')}</b>
            </p>
          )}
        </div>
      </div>
    </details>
  )
}

function ConfigGym({ cfg, onGuardado, onError }) {
  const [abierto, setAbierto] = useState(false)
  const [tasa, setTasa] = useState('')
  const [mercado, setMercado] = useState('')
  const [desde, setDesde] = useState(fechaLocal())
  const [precio, setPrecio] = useState('')
  const [ciclo, setCiclo] = useState('')
  const [corte, setCorte] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [okMsg, setOkMsg] = useState('')
  const [pregunta, setPregunta] = useState(null) // { tipo: 'cambio' | 'borrar', d? }

  useEffect(() => {
    if (!cfg) return
    setPrecio(String(cfg.precio_usd ?? ''))
    setCiclo(String(cfg.ciclo_dias ?? ''))
    setCorte(cfg.cobros_desde || '')
  }, [cfg])

  async function fijarTasa(confirmado = false) {
    if (num(tasa) <= 0) return onError('Escribe la tasa: cuántos CUP vale un dólar.')
    if (!confirmado && cfg?.tasa && Math.abs(num(tasa) - cfg.tasa) / cfg.tasa > 0.25) {
      setPregunta({ tipo: 'cambio' })
      return
    }
    setPregunta(null)
    setGuardando(true)
    const { error } = await supabase.rpc('gym_tasa_fijar', { p_desde: desde, p_tasa: num(tasa), p_tasa_mercado: mercado ? num(mercado) : null })
    setGuardando(false)
    if (error) return onError(mensajeError(error))
    setTasa(''); setMercado(''); setOkMsg('Tasa guardada.')
    await onGuardado()
  }
  async function borrarTasa(d) {
    setPregunta(null)
    const { error } = await supabase.rpc('gym_tasa_borrar', { p_desde: d })
    if (error) return onError(mensajeError(error))
    await onGuardado()
  }
  async function guardarResto() {
    setGuardando(true)
    const { error } = await supabase.rpc('gym_config_fijar', {
      p_precio_usd: num(precio) > 0 ? num(precio) : null,
      p_ciclo_dias: num(ciclo) > 0 ? Math.round(num(ciclo)) : null,
      p_cobros_desde: corte || null
    })
    setGuardando(false)
    if (error) return onError(mensajeError(error))
    setOkMsg('Configuración guardada.')
    await onGuardado()
  }

  if (!abierto) {
    return <button onClick={() => setAbierto(true)} className="text-xs font-semibold text-muted underline">Precio y tasa del dólar, días del ciclo, fecha de corte</button>
  }
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div className="text-sm font-semibold">Precio y tasa de cobro</div>
        <button onClick={() => setAbierto(false)} className="text-xs text-muted">Cerrar</button>
      </div>
      {okMsg && <p className="text-xs text-green-strong font-semibold">{okMsg}</p>}

      <div className="space-y-2.5">
        <div className="text-xs text-muted">
          Tasa vigente: <b>{cfg?.tasa ? `${n(cfg.tasa)} CUP por USD (desde el ${fechaDiaMesAnio(cfg.tasa_desde)})` : 'sin tasa'}</b>
          {cfg?.tasa_mercado ? ` · mercado ${n(cfg.tasa_mercado)}` : ''}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div><label className={etiqueta} htmlFor="t-tasa">Nueva tasa</label><input id="t-tasa" type="number" inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value)} className={campo} placeholder="900" /></div>
          <div><label className={etiqueta} htmlFor="t-desde">Vale desde</label><input id="t-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={campo} /></div>
          <div><label className={etiqueta} htmlFor="t-merc">Mercado (opc.)</label><input id="t-merc" type="number" inputMode="decimal" value={mercado} onChange={(e) => setMercado(e.target.value)} className={campo} placeholder="930" /></div>
        </div>
        {pregunta?.tipo === 'cambio' && (
          <div className="rounded-xl border border-yellow bg-yellow-soft px-3 py-2.5 text-sm text-yellow-ink space-y-2">
            <p>La tasa cambia de {n(cfg.tasa)} a {n(num(tasa))}, más de un 25 %. ¿Es correcto?</p>
            <div className="flex gap-3">
              <button onClick={() => fijarTasa(true)} className="text-xs font-semibold underline">Sí, guardarla</button>
              <button onClick={() => setPregunta(null)} className="text-xs underline">Revisar</button>
            </div>
          </div>
        )}
        <button onClick={() => fijarTasa(false)} disabled={guardando} className="w-full rounded-xl bg-green text-white text-sm font-semibold py-2.5 disabled:opacity-60">Guardar tasa</button>
        {(cfg?.tasas || []).length > 0 && (
          <ul className="text-xs text-muted space-y-1">
            {cfg.tasas.map((t) => (
              <li key={t.desde} className="flex justify-between gap-2 tabular-nums">
                <span>{fechaDiaMesAnio(t.desde)}: {n(t.tasa)}{t.tasa_mercado ? ` (mercado ${n(t.tasa_mercado)})` : ''}</span>
                {pregunta?.tipo === 'borrar' && pregunta.d === t.desde
                  ? <span><button onClick={() => borrarTasa(t.desde)} className="underline text-red">confirmar borrado</button> · <button onClick={() => setPregunta(null)} className="underline">no</button></span>
                  : <button onClick={() => setPregunta({ tipo: 'borrar', d: t.desde })} className="underline">borrar</button>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2.5 pt-3 border-t border-line">
        <div className="grid grid-cols-2 gap-2">
          <div><label className={etiqueta} htmlFor="g-precio">Precio (USD)</label><input id="g-precio" type="number" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} className={campo} /></div>
          <div><label className={etiqueta} htmlFor="g-ciclo">Dura (días)</label><input id="g-ciclo" type="number" inputMode="numeric" value={ciclo} onChange={(e) => setCiclo(e.target.value)} className={campo} /></div>
        </div>
        <div>
          <label className={etiqueta} htmlFor="g-corte">Fecha de corte (primer día que se cobra desde el panel)</label>
          <input id="g-corte" type="date" value={corte} onChange={(e) => setCorte(e.target.value)} className={campo} />
          <p className="text-xs text-muted mt-1">Desde esa fecha, el importador viejo de Matrículas no crea pagos, para que el dinero no se cuente doble.</p>
        </div>
        <button onClick={guardarResto} disabled={guardando} className="w-full rounded-xl border border-green text-green-strong text-sm font-semibold py-2.5 disabled:opacity-60">Guardar precio, ciclo y corte</button>
      </div>
    </div>
  )
}
