import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { msgError, subirFotoProducto } from './util'

const campo = 'w-full rounded-xl border border-line px-4 py-2.5 text-sm outline-none focus:border-blue'

// Alta rápida (nombre, precio, costo) y edición completa en el mismo formulario.
// modo: 'nuevo' | 'editar' | 'duplicar'
export default function FormProducto({ modo, inicial, categorias, socios, onGuardado, onCancelar, onCategoriaNueva }) {
  const editar = modo === 'editar'
  const [nombre, setNombre] = useState(inicial ? (modo === 'duplicar' ? inicial.nombre + ' (copia)' : inicial.nombre) : '')
  const [precio, setPrecio] = useState(inicial ? String(inicial.precio) : '')
  const [costo, setCosto] = useState(inicial ? String(inicial.costo) : '')
  const [stock, setStock] = useState('')
  const [foto, setFoto] = useState(inicial?.foto_url || '')
  const [garantia, setGarantia] = useState(inicial?.dias_garantia ? String(inicial.dias_garantia) : '')
  const [stockMinimo, setStockMinimo] = useState(inicial ? String(inicial.stock_minimo) : '3')
  const [categoriaId, setCategoriaId] = useState(inicial?.categoria_id || '')
  const [categoriaNueva, setCategoriaNueva] = useState('')
  const [socioId, setSocioId] = useState(inicial?.socio_id || '')
  const [pctGanancia, setPctGanancia] = useState(inicial?.socio_id ? String(Math.round(Number(inicial.pct_ganancia_socio) * 100)) : '')
  const [pctInversion, setPctInversion] = useState(inicial?.socio_id ? String(Math.round(Number(inicial.pct_inversion_socio) * 100)) : '100')
  const [mas, setMas] = useState(editar || modo === 'duplicar')
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function elegirFoto(e) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setSubiendo(true); setError('')
    try {
      setFoto(await subirFotoProducto(archivo))
    } catch (err) {
      setError('No se pudo subir la foto: ' + msgError(err))
    }
    setSubiendo(false)
    e.target.value = ''
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (!nombre.trim()) return setError('Falta el nombre.')
    setGuardando(true)
    let catId = categoriaId === '__nueva' ? null : categoriaId || null
    if (categoriaId === '__nueva' && categoriaNueva.trim()) {
      const { data, error: errCat } = await supabase.rpc('categoria_crear', { p_nombre: categoriaNueva })
      if (errCat) { setGuardando(false); return setError(msgError(errCat)) }
      catId = data.id
      onCategoriaNueva?.()
    }
    const { error: errGuardar } = await supabase.rpc('producto_guardar', {
      p_id: editar ? inicial.id : null,
      p_nombre: nombre, p_precio: Number(precio || 0), p_costo: Number(costo || 0),
      p_stock: editar ? 0 : Number(stock || 0),
      p_codigo: editar ? inicial.codigo : null,
      p_categoria_id: catId,
      p_foto_url: foto || null, p_dias_garantia: Number(garantia || 0),
      p_stock_minimo: Number(stockMinimo || 3),
      p_socio_id: socioId || null,
      p_pct_ganancia_socio: socioId ? Number(pctGanancia || 0) / 100 : 0,
      p_pct_inversion_socio: socioId ? Number(pctInversion || 100) / 100 : 1
    })
    setGuardando(false)
    if (errGuardar) return setError(msgError(errGuardar))
    onGuardado()
  }

  return (
    <form onSubmit={guardar} className="space-y-2">
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" className={campo} required autoFocus />
      <div className={`grid gap-2 ${editar ? 'grid-cols-2' : 'grid-cols-3'}`}>
        <label className="block text-[11px] text-muted">Precio venta
          <input value={precio} onChange={(e) => setPrecio(e.target.value)} type="number" inputMode="decimal" min="0" step="0.01" placeholder="Precio" className={campo + ' mt-1'} required />
        </label>
        <label className="block text-[11px] text-muted">Costo
          <input value={costo} onChange={(e) => setCosto(e.target.value)} type="number" inputMode="decimal" min="0" step="0.01" placeholder="Costo" className={campo + ' mt-1'} required />
        </label>
        {!editar && (
          <label className="block text-[11px] text-muted">Stock inicial
            <input value={stock} onChange={(e) => setStock(e.target.value)} type="number" inputMode="numeric" min="0" step="1" placeholder="Stock" className={campo + ' mt-1'} />
          </label>
        )}
      </div>
      {editar && <p className="text-[11px] text-muted">Para cambiar el stock usa “Ajustar stock” o “Entró mercancía”, así queda registrado.</p>}

      <button type="button" onClick={() => setMas((v) => !v)} className="text-xs font-semibold text-blue">
        {mas ? '− Menos opciones' : '+ Más opciones (foto, categoría, garantía, socio)'}
      </button>

      {mas && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-3">
            {foto
              ? <img src={foto} alt="" className="w-14 h-14 rounded-lg object-cover border border-line flex-shrink-0" />
              : <div className="w-14 h-14 rounded-lg bg-sunken flex-shrink-0" />}
            <div className="flex-1 space-y-1.5">
              <label className="block rounded-xl border border-line px-3 py-2 text-sm text-center font-semibold text-blue cursor-pointer active:bg-blue-soft">
                {subiendo ? 'Subiendo…' : foto ? 'Cambiar foto' : 'Tomar o elegir foto'}
                <input type="file" accept="image/*" onChange={elegirFoto} disabled={subiendo} className="hidden" />
              </label>
              {foto && <button type="button" onClick={() => setFoto('')} className="text-xs text-red">quitar foto</button>}
            </div>
          </div>
          <input value={foto} onChange={(e) => setFoto(e.target.value)} placeholder="…o pega el enlace de una foto" className={campo} />

          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={campo + ' bg-surface'}>
            <option value="">Sin categoría</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            <option value="__nueva">+ Nueva categoría…</option>
          </select>
          {categoriaId === '__nueva' && (
            <input value={categoriaNueva} onChange={(e) => setCategoriaNueva(e.target.value)} placeholder="Nombre de la categoría" className={campo} />
          )}

          <div className="grid grid-cols-2 gap-2">
            <input value={garantia} onChange={(e) => setGarantia(e.target.value)} type="number" min="0" placeholder="Días de garantía" className={campo} />
            <input value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} type="number" min="0" placeholder="Stock mínimo" className={campo} />
          </div>
          <p className="text-[11px] text-muted">Cuando el stock llegue al mínimo se crea un aviso solo.</p>

          <select value={socioId} onChange={(e) => setSocioId(e.target.value)} className={campo + ' bg-surface'}>
            <option value="">Sin socio (100% tuyo)</option>
            {socios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          {socioId && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-muted mb-1">% que invirtió el socio</label>
                <input value={pctInversion} onChange={(e) => setPctInversion(e.target.value)} type="number" min="0" max="100" className={campo} />
              </div>
              <div>
                <label className="block text-[11px] text-muted mb-1">% de ganancia del socio</label>
                <input value={pctGanancia} onChange={(e) => setPctGanancia(e.target.value)} type="number" min="0" max="100" className={campo} />
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={guardando || subiendo} className="flex-1 rounded-xl bg-blue text-white font-semibold py-2.5 text-sm disabled:opacity-60">
          {guardando ? 'Guardando…' : editar ? 'Guardar cambios' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancelar} className="text-sm text-muted px-3">Cancelar</button>
      </div>
    </form>
  )
}
