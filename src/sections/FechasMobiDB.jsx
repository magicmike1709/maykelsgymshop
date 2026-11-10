import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { fechaDiaMesAnio } from '../lib/fecha'
import { leerCSVMobiDB } from '../lib/csvMobidb'
import { mensajeError } from '../lib/gym'

// Importa el CSV semanal de MobiDB. Solo toca las fechas oficiales de los clientes:
// nunca crea pagos ni mueve dinero. Primero se revisa (no cambia nada) y luego se aplica.

const SECCIONES = [
  { clave: 'mobidb_mas_nueva', titulo: 'Revisar: MobiDB trae una fecha más nueva que el cobro', ayuda: 'Se quedó la de MobiDB. Puede ser un pago que la recepción no anotó.', tono: 'amarillo', mostrar: 'csv' },
  { clave: 'sin_cobro', titulo: 'MobiDB trae fecha nueva y nadie cobró en el panel', ayuda: 'Puede ser dinero que no pasó por la recepción.', tono: 'amarillo', mostrar: 'csv' },
  { clave: 'editadas_a_mano', titulo: 'Fechas que tú pusiste a mano y MobiDB contradice', ayuda: 'No se cambiaron. Si MobiDB tiene razón, edita la fecha en la ficha del cliente.', tono: 'amarillo', mostrar: 'csv' },
  { clave: 'fecha_del_cobro', titulo: 'MobiDB sigue con una fecha vieja: se usó la del cobro', ayuda: 'Cobraron en el panel y todavía no lo actualizaste en MobiDB.', tono: 'neutro', mostrar: 'csv' },
  { clave: 'sin_actualizar', titulo: 'Cobraron y no aparecen en el CSV', ayuda: 'Actualízalos en MobiDB. Siguen con la fecha provisional del cobro.', tono: 'neutro', mostrar: 'cobro' },
  { clave: 'confirmadas', titulo: 'Confirmadas por MobiDB (dentro de 5 días del cobro)', ayuda: 'Todo normal: se queda la fecha de MobiDB.', tono: 'ok', mostrar: 'csv' },
  { clave: 'nuevos', titulo: 'Clientes nuevos', ayuda: 'No estaban en el panel. Se crean con su fecha de MobiDB, sin pagos.', tono: 'neutro', mostrar: 'csv' }
]

const tonos = {
  amarillo: 'border-yellow bg-yellow-soft',
  neutro: 'border-line bg-surface',
  ok: 'border-green bg-green-soft'
}

export default function FechasMobiDB({ perfil }) {
  const [leido, setLeido] = useState(null)
  const [informe, setInforme] = useState(null)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState('')
  const [aplicado, setAplicado] = useState(false)
  const [copiado, setCopiado] = useState('')

  if (perfil?.rol !== 'admin') return <p className="text-sm text-muted">Esta pantalla es solo para el dueño.</p>

  function elegirArchivo(e) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setError(''); setInforme(null); setAplicado(false)
    const lector = new FileReader()
    lector.onload = () => {
      const r = leerCSVMobiDB(String(lector.result))
      if (r.filas.length === 0) setError('No encontré filas válidas. El archivo debe tener las columnas Nombre, Fecha, Sexo, Entrenador y Phone.')
      else if (r.filas.length > 5000) setError('El archivo tiene más de 5.000 filas.')
      else setLeido({ ...r, nombreArchivo: archivo.name })
    }
    lector.readAsText(archivo, 'UTF-8')
  }

  async function ejecutar(aplicar) {
    setTrabajando(true)
    setError('')
    const { data, error: err } = await supabase.rpc('gym_fechas_importar', { p_filas: leido.filas, p_aplicar: aplicar })
    setTrabajando(false)
    if (err) return setError(mensajeError(err))
    setInforme(data)
    if (aplicar) setAplicado(true)
  }

  async function copiar(clave, lista) {
    const texto = lista.map((x) => x.nombre).join('\n')
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(clave)
    } catch {
      setError('No pude copiar. Selecciona los nombres de la lista y cópialos a mano.')
    }
  }

  const r = informe?.resumen

  return (
    <div className="space-y-4 pb-4">
      <div className="rounded-2xl border border-line bg-surface p-4 space-y-2">
        <div className="text-sm font-semibold">Importar fechas oficiales desde MobiDB</div>
        <p className="text-xs text-muted">
          Sube el CSV semanal. Solo se actualizan las fechas oficiales de los clientes: nunca se crean pagos ni se mueve dinero.
          Si el cliente pagó en el panel, la fecha de MobiDB se acepta cuando está a 5 días o menos del cobro.
        </p>
        <input type="file" accept=".csv,text/csv" onChange={elegirArchivo} aria-label="Archivo CSV de MobiDB" className="text-sm" />
        {leido && (
          <p className="text-sm">
            <b>{leido.nombreArchivo}</b>: {leido.filas.length} clientes{leido.descartadas ? `, ${leido.descartadas} filas sin nombre o fecha válida (se ignoran)` : ''}.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red rounded-xl border border-red/30 bg-surface px-4 py-2.5">{error}</p>}

      {leido && !aplicado && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => ejecutar(false)} disabled={trabajando}
            className="rounded-xl border border-green text-green-strong text-sm font-semibold px-4 py-2.5 disabled:opacity-60">
            {trabajando ? 'Revisando…' : informe ? 'Volver a revisar' : 'Revisar (no cambia nada)'}
          </button>
          {informe && (
            <button onClick={() => ejecutar(true)} disabled={trabajando}
              className="rounded-xl bg-green text-white text-sm font-semibold px-4 py-2.5 disabled:opacity-60">
              {trabajando ? 'Aplicando…' : 'Aplicar estos cambios'}
            </button>
          )}
        </div>
      )}

      {aplicado && <p className="text-sm font-semibold text-green-strong rounded-xl border border-green bg-green-soft px-4 py-2.5">✓ Fechas aplicadas. Lo que sigue es el resumen de lo que se hizo.</p>}

      {r && (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="text-sm font-semibold mb-2">{aplicado ? 'Resultado' : 'Vista previa'} · {informe.filas} filas{informe.invalidas ? ` · ${informe.invalidas} inválidas` : ''}</div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
            <Dato t="Sin cambio" v={r.sin_cambio} />
            <Dato t="Actualizadas por MobiDB" v={r.cambiadas_por_mobidb} />
            <Dato t="Confirmadas (≤ 5 días)" v={r.confirmadas_dentro_de_5_dias} />
            <Dato t="Se usó la fecha del cobro" v={r.se_uso_fecha_del_cobro} />
            <Dato t="MobiDB más nueva" v={r.mobidb_mas_nueva} />
            <Dato t="Sin cobro registrado" v={r.sin_cobro_registrado} />
            <Dato t="Editadas a mano" v={r.editadas_a_mano} />
            <Dato t="Clientes nuevos" v={r.clientes_nuevos} />
          </dl>
        </div>
      )}

      {informe && SECCIONES.map((s) => {
        const lista = informe[s.clave] || []
        if (lista.length === 0) return null
        return (
          <details key={s.clave} className={'rounded-2xl border ' + tonos[s.tono]} open={s.tono === 'amarillo'}>
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">{s.titulo} ({lista.length})</summary>
            <div className="px-4 pb-4 space-y-2">
              <p className="text-xs text-muted">{s.ayuda}</p>
              <ul className="text-sm divide-y divide-line">
                {lista.slice(0, 60).map((x, i) => (
                  <li key={(x.id || x.nombre) + i} className="py-1.5 flex justify-between gap-3">
                    <span className="min-w-0 break-words">{x.nombre}</span>
                    <span className="shrink-0 text-xs text-muted tabular-nums">
                      {s.mostrar === 'cobro'
                        ? `cobro ${fechaDiaMesAnio(x.cobro)}`
                        : `${x.actual ? fechaDiaMesAnio(x.actual) + ' → ' : ''}${fechaDiaMesAnio(x.csv)}${x.dias != null ? ` (${x.dias > 0 ? '+' : ''}${x.dias} d)` : ''}`}
                    </span>
                  </li>
                ))}
              </ul>
              {lista.length > 60 && <p className="text-xs text-muted">… y {lista.length - 60} más.</p>}
              {s.clave === 'sin_actualizar' && (
                <button onClick={() => copiar(s.clave, lista)} className="text-xs font-semibold text-green-strong underline">
                  {copiado === s.clave ? 'Copiado ✓' : 'Copiar los nombres'}
                </button>
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}

function Dato({ t, v }) {
  return (
    <>
      <dt className="text-muted">{t}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </>
  )
}
