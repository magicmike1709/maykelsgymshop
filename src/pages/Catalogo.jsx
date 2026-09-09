import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Catalogo() {
  const [productos, setProductos] = useState(null)

  useEffect(() => {
    supabase.rpc('catalogo_publico').then(({ data }) => setProductos(data || []))
  }, [])

  const porCategoria = (productos || []).reduce((acc, p) => {
    const cat = p.categoria || 'Otros'
    acc[cat] = acc[cat] || []
    acc[cat].push(p)
    return acc
  }, {})

  return (
    <div className="min-h-screen pb-10">
      <header className="border-b border-line bg-bg/85 backdrop-blur-md sticky top-0 z-20 px-5 pt-8 pb-5 text-center">
        <div className="text-xs font-bold tracking-widest uppercase text-green-strong flex items-center justify-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow" />
          Maykelsgym Shop
        </div>
        <h1 className="font-display font-bold uppercase text-3xl tracking-tight">Catálogo</h1>
        <p className="text-sm text-muted mt-1">Precios en USD · pregunta disponibilidad</p>
      </header>

      <main className="px-5 pt-5 max-w-md mx-auto space-y-6">
        {!productos && <p className="text-sm text-muted text-center">Cargando…</p>}
        {productos && productos.length === 0 && <p className="text-sm text-muted text-center">Sin productos disponibles ahora mismo.</p>}
        {Object.entries(porCategoria).map(([cat, items]) => (
          <section key={cat}>
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-green-strong mb-2">{cat}</h2>
            <div className="grid grid-cols-2 gap-3">
              {items.map((p, i) => (
                <div key={i} className="rounded-2xl border border-line bg-surface overflow-hidden shadow">
                  {p.foto_url
                    ? <img src={p.foto_url} alt={p.nombre} className="w-full h-28 object-cover" />
                    : <div className="w-full h-28 bg-sunken" />}
                  <div className="px-3 py-2.5">
                    <div className="text-sm font-semibold leading-tight">{p.nombre}</div>
                    <div className="text-sm font-bold tabular-nums text-green-strong mt-0.5">${Number(p.precio).toLocaleString('en-US')}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}
