import { useMemo, useRef, useState } from 'react'
import { armarMensaje, categoriasDisponibles, disponibles, novedades } from '../../lib/mensajeGrupo'
import { precio } from '../../lib/formato'

const DIAS_NOVEDADES = [7, 14, 30]
const campo = 'rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-green bg-surface'

function Interruptor({ activo, onCambiar, children }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={activo} onChange={(e) => onCambiar(e.target.checked)} className="w-4 h-4 accent-green" />
      <span className="font-semibold">{children}</span>
    </label>
  )
}

/** Arma el texto para pegar en el grupo de WhatsApp: novedades, ofertas, existencias y el enlace. */
export default function MensajeGrupo({ productos, enlace }) {
  const [usarNovedades, setUsarNovedades] = useState(true)
  const [dias, setDias] = useState(14)
  const [ofertas, setOfertas] = useState([]) // [{nombre, precioNormal, precioOferta}]
  const [ofertaProducto, setOfertaProducto] = useState('')
  const [ofertaPrecio, setOfertaPrecio] = useState('')
  const [errorOferta, setErrorOferta] = useState('')
  const [usarExistencias, setUsarExistencias] = useState(true)
  const [categorias, setCategorias] = useState(null) // null = todas
  const [editado, setEditado] = useState(null) // texto que el dueño cambió a mano
  const [copiado, setCopiado] = useState(false)
  const areaRef = useRef(null)

  const lista = useMemo(() => disponibles(productos).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [productos])
  const todasCategorias = useMemo(() => categoriasDisponibles(productos), [productos])
  const cantNovedades = useMemo(() => novedades(productos, dias).length, [productos, dias])

  const generado = useMemo(
    () => armarMensaje({ productos, enlace, usarNovedades, diasNovedades: dias, ofertas, usarExistencias, categorias }),
    [productos, enlace, usarNovedades, dias, ofertas, usarExistencias, categorias]
  )
  const texto = editado ?? generado

  // Al cambiar una opción se vuelve a armar el texto (se pierde lo editado a mano).
  function opcion(setter) {
    return (valor) => { setter(valor); setEditado(null); setCopiado(false) }
  }

  function alternarCategoria(cat) {
    setEditado(null); setCopiado(false)
    if (cat === null) return setCategorias(null)
    setCategorias((actual) => {
      if (actual === null) return [cat] // desde "Todas", al tocar una se elige solo esa
      const nueva = actual.includes(cat) ? actual.filter((c) => c !== cat) : [...actual, cat]
      return nueva.length === 0 || nueva.length === todasCategorias.length ? null : nueva
    })
  }

  function agregarOferta() {
    setErrorOferta('')
    const p = lista.find((x) => x.nombre === ofertaProducto)
    const oferta = Number(ofertaPrecio)
    if (!p) return setErrorOferta('Elige el producto.')
    if (!(oferta > 0)) return setErrorOferta('Escribe el precio de oferta.')
    if (ofertas.some((o) => o.nombre === p.nombre)) return setErrorOferta('Ese producto ya está en las ofertas.')
    setOfertas((o) => [...o, { nombre: p.nombre, precioNormal: Number(p.precio), precioOferta: oferta }])
    setOfertaProducto(''); setOfertaPrecio(''); setEditado(null); setCopiado(false)
  }

  function quitarOferta(nombre) {
    setOfertas((o) => o.filter((x) => x.nombre !== nombre)); setEditado(null); setCopiado(false)
  }

  async function copiar() {
    let ok = false
    try {
      await navigator.clipboard.writeText(texto)
      ok = true
    } catch {
      // Respaldo para navegadores sin permiso de portapapeles
      try { areaRef.current?.select(); ok = document.execCommand('copy') } catch { ok = false }
    }
    setCopiado(ok)
    if (ok) setTimeout(() => setCopiado(false), 4000)
  }

  const clasePill = (activa) =>
    `flex-shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${activa ? 'border-green-strong bg-green-soft text-green-strong' : 'border-line bg-surface text-muted'}`
  const catActiva = (c) => (categorias === null ? true : categorias.includes(c))

  return (
    <div className="mt-3 pt-3 border-t border-line space-y-4">
      <div className="space-y-1.5">
        <Interruptor activo={usarNovedades} onCambiar={opcion(setUsarNovedades)}>🆕 Novedades</Interruptor>
        {usarNovedades && (
          <div className="pl-6 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted">Mercancía que llegó en los últimos</span>
            <select value={dias} onChange={(e) => opcion(setDias)(Number(e.target.value))} aria-label="Días de novedades"
              className="rounded-lg border border-line bg-surface px-2 py-1 text-xs">
              {DIAS_NOVEDADES.map((d) => <option key={d} value={d}>{d} días</option>)}
            </select>
            <span className="text-xs text-muted">({cantNovedades} {cantNovedades === 1 ? 'producto' : 'productos'})</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">🔥 Ofertas</div>
        <p className="text-[11px] text-muted -mt-1">Solo para este mensaje: no cambia los precios del inventario.</p>
        <div className="flex gap-2">
          <select value={ofertaProducto} onChange={(e) => setOfertaProducto(e.target.value)} aria-label="Producto en oferta" className={campo + ' flex-1 min-w-0 w-0'}>
            <option value="">Producto…</option>
            {lista.map((p) => <option key={p.nombre} value={p.nombre}>{p.nombre} (${precio(p.precio)})</option>)}
          </select>
          <input value={ofertaPrecio} onChange={(e) => setOfertaPrecio(e.target.value)} type="number" min="0" step="0.01" inputMode="decimal"
            placeholder="Oferta $" aria-label="Precio de oferta" className={campo + ' w-24 flex-shrink-0'} />
        </div>
        <button onClick={agregarOferta} className="w-full rounded-xl border border-green-strong text-green-strong text-sm font-semibold py-2">
          Agregar oferta
        </button>
        {errorOferta && <p className="text-xs text-red">{errorOferta}</p>}
        {ofertas.map((o) => (
          <div key={o.nombre} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-sunken px-3 py-1.5 text-xs">
            <span className="min-w-0 break-words">{o.nombre}: <s className="text-muted">${precio(o.precioNormal)}</s> <b>${precio(o.precioOferta)}</b></span>
            <button onClick={() => quitarOferta(o.nombre)} className="text-red flex-shrink-0" aria-label={`Quitar oferta de ${o.nombre}`}>quitar</button>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Interruptor activo={usarExistencias} onCambiar={opcion(setUsarExistencias)}>📦 Lo que hay en existencia</Interruptor>
        {usarExistencias && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button onClick={() => alternarCategoria(null)} className={clasePill(categorias === null)}>Todas</button>
            {todasCategorias.map((c) => (
              <button key={c} onClick={() => alternarCategoria(c)} className={clasePill(categorias !== null && catActiva(c))}>{c}</button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="texto-grupo" className="text-sm font-semibold">Mensaje listo</label>
          <span className="text-[11px] text-muted">{texto.length.toLocaleString('en-US')} caracteres</span>
        </div>
        <textarea id="texto-grupo" ref={areaRef} value={texto} onChange={(e) => { setEditado(e.target.value); setCopiado(false) }}
          rows={14} className={campo + ' w-full font-mono text-xs leading-relaxed'} />
        <p className="text-[11px] text-muted mt-1">Puedes corregirlo a mano. Si cambias las opciones de arriba, se vuelve a armar.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={copiar} className="rounded-xl bg-green text-white text-sm font-semibold py-2.5 active:opacity-80">
          {copiado ? '¡Copiado!' : 'Copiar mensaje'}
        </button>
        <a href={'https://wa.me/?text=' + encodeURIComponent(texto)} target="_blank" rel="noopener noreferrer"
          className="rounded-xl border border-green-strong text-green-strong text-sm font-semibold py-2.5 text-center active:opacity-80">
          Abrir en WhatsApp
        </a>
      </div>
      {copiado && <p className="text-xs text-green-strong font-semibold -mt-2">Listo: pégalo en el grupo.</p>}
    </div>
  )
}
