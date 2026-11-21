import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fechaDiaMesAnio } from '../lib/fecha'
import { telefonoWa } from '../lib/negocio'

// Pantalla de recepción: ver cómo está la matrícula de un cliente y a quién
// toca escribirle hoy. No cobra ni muestra dinero: el cobro va aparte.

function textoDias(dias) {
  if (dias === null || dias === undefined) return 'Nunca ha pagado'
  if (dias < 0) return `Vencido hace ${-dias} día${dias === -1 ? '' : 's'}`
  if (dias === 0) return 'Se le vence hoy'
  if (dias <= 5) return `Le quedan ${dias} día${dias === 1 ? '' : 's'}`
  return `Al día · ${dias} días`
}

function tonoDias(dias) {
  if (dias === null || dias === undefined) return 'text-muted'
  if (dias < 0) return 'text-red'
  if (dias <= 5) return 'text-yellow-ink'
  return 'text-green-strong'
}

function mensajePara(c) {
  const nombre = (c.nombre || '').trim().split(' ')[0]
  if (c.dias < 0) {
    return `Hola ${nombre}! 👋 Somos Maykel's Gym. Vimos que se te venció la matrícula y te extrañamos por aquí. ¿Te esperamos esta semana? 💪`
  }
  if (c.dias === 0) {
    return `Hola ${nombre}! 👋 Somos Maykel's Gym. Hoy se te vence la matrícula. Cuando vengas puedes renovarla en recepción. 💪`
  }
  return `Hola ${nombre}! 👋 Somos Maykel's Gym. Tu matrícula se vence en ${c.dias} día${c.dias === 1 ? '' : 's'}. Puedes renovarla en recepción cuando vengas. 💪`
}

const GRUPOS = [
  { id: 'hoy', titulo: 'Se les vence hoy', tono: 'text-yellow-ink', es: (c) => c.dias === 0 },
  { id: 'pronto', titulo: 'Se les vence en estos días', tono: 'text-green-strong', es: (c) => c.dias > 0 },
  { id: 'reciente', titulo: 'Vencidos hace 1 a 15 días', tono: 'text-red', es: (c) => c.dias < 0 && c.dias >= -15 },
  { id: 'viejo', titulo: 'Vencidos hace más de 15 días', tono: 'text-red', es: (c) => c.dias < -15 }
]

export default function Recepcion() {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [vista, setVista] = useState('pendientes') // pendientes | avisados
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState(null)
  const [abiertos, setAbiertos] = useState({ hoy: true, pronto: true, reciente: true, viejo: false })

  async function cargar() {
    const { data, error: err } = await supabase.rpc('clientes_por_avisar')
    if (err) return setError('No se pudo cargar la lista: ' + err.message)
    setLista(data || [])
  }

  useEffect(() => { cargar() }, [])

  useEffect(() => {
    const q = busqueda.trim()
    if (q.length < 2) { setResultados(null); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('recepcion_buscar', { p_busqueda: q })
      setResultados(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [busqueda])

  async function marcar(c, avisado) {
    setError('')
    // Se refleja al momento y se confirma con la base.
    setLista((l) => (l || []).map((x) => (x.id === c.id ? { ...x, avisado_el: avisado ? 'hoy' : null, avisado_por: null } : x)))
    const { error: err } = await supabase.rpc('cliente_aviso_marcar', { p_cliente_id: c.id, p_avisado: avisado })
    if (err) setError('No se pudo guardar: ' + err.message)
    cargar()
  }

  if (error && lista === null) return <p className="text-sm text-red">{error}</p>

  const pendientes = (lista || []).filter((c) => !c.avisado_el)
  const avisados = (lista || []).filter((c) => c.avisado_el)
  const mostrados = vista === 'pendientes' ? pendientes : avisados

  return (
    <div className="space-y-4 pb-6">
      <div>
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cliente por nombre o teléfono…"
          className="w-full rounded-xl border border-line px-4 py-3 text-base outline-none focus:border-green" />
        {resultados !== null && (
          <div className="mt-2 space-y-1.5">
            {resultados.length === 0 && <p className="text-sm text-muted">No aparece nadie con ese nombre o teléfono.</p>}
            {resultados.map((c) => (
              <div key={c.id} className="rounded-xl border border-line bg-surface px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{c.nombre}</div>
                  <div className="text-xs text-muted truncate">
                    {c.telefono || 'sin teléfono'}{c.entrenador ? ` · ${c.entrenador}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={'text-xs font-semibold ' + tonoDias(c.dias)}>{textoDias(c.dias)}</div>
                  {c.ultimo_pago && <div className="text-[11px] text-muted">último pago: {fechaDiaMesAnio(c.ultimo_pago)}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red rounded-xl border border-red/30 bg-surface px-4 py-2.5">{error}</p>}

      <div className="flex gap-1.5">
        <button onClick={() => setVista('pendientes')}
          className={'flex-1 py-2 rounded-full text-xs font-semibold border ' + (vista === 'pendientes' ? 'bg-green text-white border-green' : 'border-line text-muted')}>
          Por escribirles · {lista ? pendientes.length : '…'}
        </button>
        <button onClick={() => setVista('avisados')}
          className={'flex-1 py-2 rounded-full text-xs font-semibold border ' + (vista === 'avisados' ? 'bg-green text-white border-green' : 'border-line text-muted')}>
          Ya avisados · {lista ? avisados.length : '…'}
        </button>
      </div>

      {lista === null && <p className="text-sm text-muted">Cargando…</p>}
      {lista !== null && mostrados.length === 0 && (
        <p className="text-sm text-muted">
          {vista === 'pendientes' ? 'No queda nadie por avisar. 🎉' : 'Todavía no se ha marcado a nadie como avisado.'}
        </p>
      )}

      {GRUPOS.map((g) => {
        const delGrupo = mostrados.filter(g.es)
        if (delGrupo.length === 0) return null
        const abierto = abiertos[g.id]
        return (
          <div key={g.id} className="space-y-1.5">
            <button onClick={() => setAbiertos((a) => ({ ...a, [g.id]: !a[g.id] }))}
              className="w-full flex items-center justify-between py-1">
              <h3 className={'font-display text-xs font-semibold uppercase tracking-wide ' + g.tono}>
                {g.titulo} · {delGrupo.length}
              </h3>
              <span className="text-xs text-muted">{abierto ? 'Ocultar' : 'Ver'}</span>
            </button>
            {abierto && delGrupo.map((c) => {
              const wa = telefonoWa(c.telefono)
              return (
                <div key={c.id} className="rounded-xl border border-line bg-surface px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{c.nombre}</div>
                      <div className="text-xs text-muted truncate">
                        <span className={tonoDias(c.dias)}>{textoDias(c.dias)}</span>
                        {' · '}{c.telefono || 'sin teléfono'}{c.entrenador ? ` · ${c.entrenador}` : ''}
                      </div>
                      {c.avisado_el && (
                        <div className="text-[11px] text-muted mt-0.5">
                          Avisado {c.avisado_el === 'hoy' ? 'hoy' : 'el ' + fechaDiaMesAnio(c.avisado_el)}{c.avisado_por ? ` por ${c.avisado_por}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2.5">
                    {wa && (
                      <a href={'https://wa.me/' + wa + '?text=' + encodeURIComponent(mensajePara(c))} target="_blank" rel="noreferrer"
                        onClick={() => { if (!c.avisado_el) marcar(c, true) }}
                        className="flex-1 text-center text-sm font-semibold text-white bg-green rounded-xl py-2.5">
                        {c.avisado_el ? 'Escribirle otra vez' : 'Escribir por WhatsApp'}
                      </a>
                    )}
                    <button onClick={() => marcar(c, !c.avisado_el)}
                      className={'text-sm font-semibold border border-line rounded-xl py-2.5 px-3 text-muted ' + (wa ? '' : 'flex-1')}>
                      {c.avisado_el ? 'Deshacer' : wa ? 'Ya le avisé' : 'Ya le avisé (sin teléfono)'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
