import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { precio } from '../lib/formato'
import { NOMBRE_NEGOCIO, enlaceWhatsApp } from '../lib/negocio'

const MAX_POR_PRODUCTO = 99

// Para buscar sin importar mayúsculas ni tildes ("proteina" encuentra "Proteína").
const plano = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function mensajePedido(items, total) {
  const lineas = items.map((i) => `• ${i.cant} × ${i.nombre} — $${precio(i.precio * i.cant)}`)
  return [
    `Hola, ${NOMBRE_NEGOCIO} 👋 Quiero pedir:`,
    ...lineas,
    `Total: $${precio(total)}`,
    '',
    '¿Lo tienen disponible? ¿Hacen entrega o recojo?'
  ].join('\n')
}

function Tarjeta({ p, cant, onCambiar }) {
  const [verMas, setVerMas] = useState(false)
  const largo = (p.descripcion || '').length > 110
  return (
    <div className="rounded-2xl border border-line bg-surface overflow-hidden flex flex-col">
      {p.foto_url
        ? <img src={p.foto_url} alt={p.nombre} loading="lazy" className="w-full h-32 object-cover" />
        : <div className="w-full h-32 bg-sunken" />}
      <div className="px-3 py-2.5 flex-1 flex flex-col">
        <div className="text-sm font-semibold leading-tight">{p.nombre}</div>
        <div className="text-base font-bold tabular-nums text-green-strong mt-0.5">${precio(p.precio)}</div>
        {p.descripcion && (
          <>
            <p className={'text-xs text-muted mt-1 whitespace-pre-line ' + (verMas ? '' : 'line-clamp-3')}>{p.descripcion}</p>
            {largo && (
              <button onClick={() => setVerMas((v) => !v)} className="self-start text-xs font-semibold text-blue mt-1">
                {verMas ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </>
        )}
        <div className="mt-auto pt-2.5">
          {cant === 0 ? (
            <button onClick={() => onCambiar(1)}
              className="w-full rounded-xl bg-green text-white text-sm font-semibold py-2 active:opacity-80">
              Agregar
            </button>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-green bg-green-soft">
              <button onClick={() => onCambiar(cant - 1)} aria-label={`Quitar uno de ${p.nombre}`}
                className="w-10 h-9 text-lg font-bold text-green-strong active:opacity-60">−</button>
              <span className="text-sm font-bold tabular-nums">{cant}</span>
              <button onClick={() => onCambiar(cant + 1)} aria-label={`Agregar uno más de ${p.nombre}`} disabled={cant >= MAX_POR_PRODUCTO}
                className="w-10 h-9 text-lg font-bold text-green-strong active:opacity-60 disabled:opacity-30">+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Catalogo() {
  const [productos, setProductos] = useState(null)
  const [error, setError] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('Todo')
  const [carrito, setCarrito] = useState({}) // nombre -> cantidad

  useEffect(() => {
    supabase.rpc('catalogo_publico').then(({ data, error: err }) => {
      if (err) return setError(true)
      setProductos(data || [])
    })
  }, [])

  const categorias = useMemo(() => {
    const set = new Set((productos || []).map((p) => p.categoria || 'Otros'))
    return ['Todo', ...set]
  }, [productos])

  const visibles = useMemo(() => {
    const q = plano(busqueda.trim())
    return (productos || []).filter((p) => {
      if (categoria !== 'Todo' && (p.categoria || 'Otros') !== categoria) return false
      return !q || plano(p.nombre).includes(q) || plano(p.descripcion).includes(q)
    })
  }, [productos, busqueda, categoria])

  const porCategoria = visibles.reduce((acc, p) => {
    const cat = p.categoria || 'Otros'
    ;(acc[cat] = acc[cat] || []).push(p)
    return acc
  }, {})

  function cambiar(nombre, cant) {
    setCarrito((c) => {
      const nuevo = { ...c }
      if (cant <= 0) delete nuevo[nombre]
      else nuevo[nombre] = Math.min(cant, MAX_POR_PRODUCTO)
      return nuevo
    })
  }

  const items = (productos || [])
    .filter((p) => carrito[p.nombre] > 0)
    .map((p) => ({ nombre: p.nombre, precio: Number(p.precio), cant: carrito[p.nombre] }))
  const unidades = items.reduce((s, i) => s + i.cant, 0)
  const total = items.reduce((s, i) => s + i.precio * i.cant, 0)

  return (
    <div className={'min-h-screen ' + (items.length ? 'pb-32' : 'pb-10')}>
      <header className="px-5 pt-6 pb-3 text-center">
        <div className="max-w-md mx-auto">
          <div className="text-xs font-bold tracking-widest uppercase text-green-strong flex items-center justify-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow" />
            Maykelsgym Shop
          </div>
          <h1 className="font-display font-bold uppercase text-3xl tracking-tight">Catálogo</h1>
          <p className="text-sm text-muted mt-1">Precios en USD · arma tu pedido y envíalo por WhatsApp</p>
        </div>
      </header>

      <div className="sticky top-0 z-20 bg-bg border-b border-line px-5 py-2.5">
        <div className="max-w-md mx-auto">
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto…"
            aria-label="Buscar producto"
            className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-green" />
          {categorias.length > 2 && (
            <div className="flex gap-1.5 overflow-x-auto mt-2 pb-0.5 -mx-1 px-1">
              {categorias.map((c) => (
                <button key={c} onClick={() => setCategoria(c)}
                  className={'flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border ' +
                    (categoria === c ? 'bg-green text-white border-green' : 'border-line text-muted bg-surface')}>
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <main className="px-5 pt-5 max-w-md mx-auto space-y-6">
        {error && <p className="text-sm text-red text-center">No se pudo cargar el catálogo. Revisa tu conexión e intenta de nuevo.</p>}
        {!productos && !error && <p className="text-sm text-muted text-center">Cargando…</p>}
        {productos && productos.length === 0 && <p className="text-sm text-muted text-center">Sin productos disponibles ahora mismo.</p>}
        {productos && productos.length > 0 && visibles.length === 0 && (
          <p className="text-sm text-muted text-center">No encontramos “{busqueda}”. Prueba con otra palabra o escríbenos por WhatsApp.</p>
        )}
        {Object.entries(porCategoria).map(([cat, lista]) => (
          <section key={cat}>
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-green-strong mb-2">{cat}</h2>
            <div className="grid grid-cols-2 gap-3">
              {lista.map((p) => (
                <Tarjeta key={p.nombre} p={p} cant={carrito[p.nombre] || 0} onCambiar={(c) => cambiar(p.nombre, c)} />
              ))}
            </div>
          </section>
        ))}

        {productos && (
          <p className="text-center text-xs text-muted pt-2">
            ¿Dudas o no encuentras algo?{' '}
            <a href={enlaceWhatsApp(`Hola, ${NOMBRE_NEGOCIO} 👋 Tengo una consulta.`)} target="_blank" rel="noopener noreferrer"
              className="font-semibold text-green-strong underline">Escríbenos por WhatsApp</a>
          </p>
        )}
      </main>

      {items.length > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-30 max-w-md mx-auto rounded-2xl border border-line bg-surface p-3 shadow-lg">
          <div className="flex items-center justify-between px-1 mb-2 text-sm">
            <span className="text-muted">{unidades} {unidades === 1 ? 'producto' : 'productos'}</span>
            <span className="font-bold tabular-nums">Total ${precio(total)}</span>
          </div>
          <a href={enlaceWhatsApp(mensajePedido(items, total))} target="_blank" rel="noopener noreferrer"
            className="block w-full text-center rounded-xl bg-green text-white font-semibold py-3 active:opacity-80">
            Pedir por WhatsApp
          </a>
          <button onClick={() => setCarrito({})} className="block mx-auto mt-1.5 text-xs text-muted underline">Vaciar pedido</button>
        </div>
      )}
    </div>
  )
}
