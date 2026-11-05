import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { msgError, parseCSVProductos } from './util'

export default function ImportarProductos({ onListo }) {
  const [abierto, setAbierto] = useState(false)
  const [leido, setLeido] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  function elegir(e) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setResultado(null); setError('')
    const lector = new FileReader()
    lector.onload = () => {
      const r = parseCSVProductos(String(lector.result))
      setLeido(r.filas)
      if (r.error) setError(r.error)
    }
    lector.readAsText(archivo)
    e.target.value = ''
  }

  async function importar() {
    setEnviando(true); setError('')
    const { data, error: err } = await supabase.rpc('productos_importar', { p_filas: leido })
    setEnviando(false)
    if (err) return setError(msgError(err))
    setResultado(data); setLeido(null)
    onListo()
  }

  if (!abierto) return <button onClick={() => setAbierto(true)} className="text-xs font-semibold text-blue underline">Importar varios desde CSV</button>

  return (
    <div className="space-y-2 rounded-xl bg-sunken p-3">
      <p className="text-xs text-muted">
        Archivo CSV con encabezados: <span className="font-mono">nombre, precio, costo, stock, categoria</span>. Solo “nombre” es obligatorio.
        Los productos que ya existen se saltan, no se pisan.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={elegir} className="text-xs" />
      {leido && leido.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs"><b>{leido.length}</b> productos listos:</p>
          <div className="max-h-32 overflow-y-auto text-[11px] text-muted space-y-0.5">
            {leido.slice(0, 8).map((f, i) => <div key={i}>{f.nombre} · ${f.precio} · costo ${f.costo} · {f.stock} u.{f.categoria ? ' · ' + f.categoria : ''}</div>)}
            {leido.length > 8 && <div>…y {leido.length - 8} más</div>}
          </div>
          <button onClick={importar} disabled={enviando} className="w-full rounded-xl bg-blue text-white text-sm font-semibold py-2 disabled:opacity-60">
            {enviando ? 'Importando…' : `Importar ${leido.length} productos`}
          </button>
        </div>
      )}
      {resultado && (
        <p className="text-xs">
          Se crearon <b>{resultado.creados}</b> productos.
          {resultado.omitidos?.length > 0 && <> Ya existían y se saltaron: {resultado.omitidos.join(', ')}.</>}
        </p>
      )}
      {error && <p className="text-xs text-red">{error}</p>}
      <button onClick={() => { setAbierto(false); setLeido(null); setResultado(null); setError('') }} className="text-xs text-muted">Cerrar</button>
    </div>
  )
}
