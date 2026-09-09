import { useEffect, useState, Suspense, lazy } from 'react'
import { supabase } from '../supabaseClient'

// Cada pestaña se carga solo cuando se abre, para que la primera
// pantalla (Resumen) pese lo menos posible con conexión mala.
const Resumen = lazy(() => import('../sections/Resumen'))
const Matriculas = lazy(() => import('../sections/Matriculas'))
const Nevera = lazy(() => import('../sections/Nevera'))
const Vitrina = lazy(() => import('../sections/Vitrina'))
const Inventario = lazy(() => import('../sections/Inventario'))
const Gastos = lazy(() => import('../sections/Gastos'))
const Equipo = lazy(() => import('../sections/Equipo'))
const Cierre = lazy(() => import('../sections/Cierre'))
const Avisos = lazy(() => import('../sections/Avisos'))
const Actividad = lazy(() => import('../sections/Actividad'))
const Fondos = lazy(() => import('../sections/Fondos'))

function Cargando() {
  return <p className="text-sm text-muted">Cargando…</p>
}

const TABS_BASE = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'matriculas', label: 'Matrículas' },
  { id: 'nevera', label: 'Nevera' },
  { id: 'vitrina', label: 'Vitrina' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'gastos', label: 'Gastos' },
  { id: 'avisos', label: 'Avisos' }
]

const TABS_ADMIN = [
  { id: 'equipo', label: 'Equipo' },
  { id: 'cierre', label: 'Cierre' },
  { id: 'fondos', label: 'Fondos del equipo' },
  { id: 'actividad', label: 'Actividad' }
]

export default function Panel() {
  const [perfil, setPerfil] = useState(null)
  const [tab, setTab] = useState('resumen')
  const [menuAbierto, setMenuAbierto] = useState(false)

  useEffect(() => {
    supabase.rpc('mi_perfil').then(({ data }) => setPerfil(data))
  }, [])

  const tabs = perfil?.rol === 'admin' ? [...TABS_BASE, ...TABS_ADMIN] : TABS_BASE

  function elegir(id) {
    setTab(id)
    setMenuAbierto(false)
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md border-b border-line px-5 pt-6 pb-4">
        <div className="text-xs font-bold tracking-widest uppercase text-green-strong flex items-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow" />
          {perfil?.rol_nombre || '…'}
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir menú"
            className="w-9 h-9 -ml-1.5 flex flex-col items-center justify-center gap-[5px] rounded-lg active:bg-sunken"
          >
            <span className="w-5 h-0.5 bg-ink rounded-full" />
            <span className="w-5 h-0.5 bg-ink rounded-full" />
            <span className="w-5 h-0.5 bg-ink rounded-full" />
          </button>
          <h1 className="font-display font-bold uppercase text-2xl tracking-tight">
            {tabs.find((t) => t.id === tab)?.label || 'Panel'}
          </h1>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs font-semibold text-muted border border-line rounded-full px-3 py-1.5"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="px-5 pt-5 pb-10 max-w-md mx-auto">
        {!perfil && <Cargando />}
        {perfil && (
          <Suspense fallback={<Cargando />}>
            {tab === 'resumen' && <Resumen />}
            {tab === 'matriculas' && <Matriculas perfil={perfil} />}
            {tab === 'nevera' && <Nevera perfil={perfil} />}
            {tab === 'vitrina' && <Vitrina />}
            {tab === 'inventario' && <Inventario perfil={perfil} />}
            {tab === 'gastos' && <Gastos perfil={perfil} />}
            {tab === 'avisos' && <Avisos perfil={perfil} />}
            {tab === 'equipo' && perfil.rol === 'admin' && <Equipo />}
            {tab === 'cierre' && perfil.rol === 'admin' && <Cierre />}
            {tab === 'fondos' && perfil.rol === 'admin' && <Fondos />}
            {tab === 'actividad' && perfil.rol === 'admin' && <Actividad />}
          </Suspense>
        )}
      </main>

      <div className={'fixed inset-0 z-50 transition-opacity duration-300 ease-ios ' + (menuAbierto ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => setMenuAbierto(false)} />
        <nav className={
          'absolute inset-y-0 left-0 w-72 max-w-[80vw] bg-surface shadow-lg flex flex-col rounded-r-3xl overflow-hidden transition-transform duration-300 ease-ios ' +
          (menuAbierto ? 'translate-x-0' : '-translate-x-full')
        }>
          <div className="px-5 pt-6 pb-4">
            <div className="text-xs font-bold tracking-widest uppercase text-green-strong flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow" />
              Maykelsgym Shop
            </div>
            <div className="text-sm text-muted">{perfil?.rol_nombre}</div>
          </div>
          <div className="flex-1 overflow-y-auto py-2 px-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => elegir(t.id)}
                className={
                  'w-full text-left px-4 py-3 my-0.5 rounded-xl text-sm font-semibold ' +
                  (tab === t.id ? 'text-white bg-green' : 'text-ink active:bg-sunken')
                }
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="mx-2 mb-2 px-4 py-3 text-left text-sm font-semibold text-red rounded-xl active:bg-red-soft"
          >
            Salir
          </button>
        </nav>
      </div>
    </div>
  )
}
