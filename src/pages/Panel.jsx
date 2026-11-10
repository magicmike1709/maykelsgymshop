import { useEffect, useState, Suspense, lazy } from 'react'
import { supabase } from '../supabaseClient'

// Cada pestaña se carga solo cuando se abre, para que la primera
// pantalla (Resumen) pese lo menos posible con conexión mala.
const Resumen = lazy(() => import('../sections/Resumen'))
const Cobrar = lazy(() => import('../sections/Cobrar'))
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
const Proveedores = lazy(() => import('../sections/Proveedores'))
const FechasMobiDB = lazy(() => import('../sections/FechasMobiDB'))

function Cargando() {
  return <p className="text-sm text-muted">Cargando…</p>
}

const TABS_BASE = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'cobrar', label: 'Cobrar matrícula' },
  { id: 'matriculas', label: 'Matrículas' },
  { id: 'nevera', label: 'Nevera' },
  { id: 'vitrina', label: 'Vitrina' },
  { id: 'inventario', label: 'Inventario' },
  { id: 'gastos', label: 'Gastos' },
  { id: 'avisos', label: 'Avisos' }
]

// La recepción (rol cobrador) solo ve el cobro y los avisos.
const TABS_COBRADOR = [
  { id: 'cobrar', label: 'Cobrar matrícula' },
  { id: 'avisos', label: 'Avisos' }
]

const TABS_ADMIN = [
  { id: 'fechas', label: 'Importar MobiDB' },
  { id: 'proveedores', label: 'Proveedores' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'cierre', label: 'Cierre' },
  { id: 'fondos', label: 'Fondos del equipo' },
  { id: 'actividad', label: 'Actividad' }
]

// Agrupa las mismas pestañas de arriba solo para el menú, así el
// dueño no ve 11 renglones sueltos sino unos pocos bloques.
const GRUPOS_MENU = [
  { titulo: 'Negocio', ids: ['resumen'] },
  { titulo: 'Clientes', ids: ['cobrar', 'matriculas', 'fechas', 'avisos'] },
  { titulo: 'Ventas', ids: ['nevera', 'vitrina', 'inventario'] },
  { titulo: 'Finanzas', ids: ['gastos', 'proveedores'] },
  { titulo: 'Administración', ids: ['equipo', 'cierre', 'fondos', 'actividad'] }
]

export default function Panel() {
  const [perfil, setPerfil] = useState(null)
  const [tab, setTab] = useState('resumen')
  const [menuAbierto, setMenuAbierto] = useState(false)

  useEffect(() => {
    supabase.rpc('mi_perfil').then(({ data }) => setPerfil(data))
  }, [])

  const tabs = perfil?.rol === 'admin'
    ? [...TABS_BASE, ...TABS_ADMIN]
    : perfil?.rol === 'cobrador' ? TABS_COBRADOR : TABS_BASE
  const tabsPorId = Object.fromEntries(tabs.map((t) => [t.id, t]))
  // Si la pestaña elegida no existe para este rol (la recepción no tiene Resumen), se abre la primera.
  const tabActual = tabsPorId[tab] ? tab : tabs[0].id
  const grupos = GRUPOS_MENU
    .map((g) => ({ titulo: g.titulo, items: g.ids.map((id) => tabsPorId[id]).filter(Boolean) }))
    .filter((g) => g.items.length > 0)

  function elegir(id) {
    setTab(id)
    setMenuAbierto(false)
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-bg border-b border-line px-5 pt-[max(env(safe-area-inset-top),12px)] pb-3">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir menú"
            className="w-11 h-11 -ml-2.5 flex flex-col items-center justify-center gap-[5px] rounded-full active:bg-sunken"
          >
            <span className="w-5 h-0.5 bg-ink rounded-full" />
            <span className="w-5 h-0.5 bg-ink rounded-full" />
            <span className="w-5 h-0.5 bg-ink rounded-full" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <img src="/icon.svg" alt="" className="w-4 h-4" />
              <span className="truncate">Maykelsgym Shop · {perfil?.rol_nombre || '…'}</span>
            </div>
            <h1 className="font-display font-bold uppercase text-2xl leading-tight tracking-tight truncate">
              {tabsPorId[tabActual]?.label || 'Panel'}
            </h1>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="min-h-[36px] text-sm font-semibold text-muted border border-line rounded-full px-3.5"
          >
            Salir
          </button>
        </div>
      </header>

      <main className={'px-5 pt-5 pb-10 mx-auto ' + (tabActual === 'cobrar' ? 'max-w-md md:max-w-4xl' : 'max-w-md')}>
        {!perfil && <Cargando />}
        {perfil && perfil.activo === false && (
          <div className="rounded-2xl border border-line bg-surface p-5 space-y-2">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-yellow-ink">Cuenta pendiente de activación</h2>
            <p className="text-sm text-muted">
              Tu cuenta ya existe, pero todavía no tiene acceso al panel. Pídele al administrador que la active y vuelve a entrar.
            </p>
          </div>
        )}
        {perfil && perfil.activo !== false && (
          <Suspense fallback={<Cargando />}>
            {tabActual === 'resumen' && <Resumen />}
            {tabActual === 'cobrar' && <Cobrar perfil={perfil} />}
            {tabActual === 'matriculas' && <Matriculas perfil={perfil} />}
            {tabActual === 'nevera' && <Nevera perfil={perfil} />}
            {tabActual === 'vitrina' && <Vitrina />}
            {tabActual === 'inventario' && <Inventario perfil={perfil} />}
            {tabActual === 'gastos' && <Gastos perfil={perfil} />}
            {tabActual === 'avisos' && <Avisos perfil={perfil} />}
            {tabActual === 'fechas' && perfil.rol === 'admin' && <FechasMobiDB perfil={perfil} />}
            {tabActual === 'proveedores' && perfil.rol === 'admin' && <Proveedores />}
            {tabActual === 'equipo' && perfil.rol === 'admin' && <Equipo />}
            {tabActual === 'cierre' && perfil.rol === 'admin' && <Cierre />}
            {tabActual === 'fondos' && perfil.rol === 'admin' && <Fondos />}
            {tabActual === 'actividad' && perfil.rol === 'admin' && <Actividad />}
          </Suspense>
        )}
      </main>

      <div className={'fixed inset-0 z-50 transition-opacity duration-300 ease-ios ' + (menuAbierto ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}>
        <div className="absolute inset-0 bg-black/40" onClick={() => setMenuAbierto(false)} />
        <nav className={
          'absolute inset-y-0 left-0 w-72 max-w-[80vw] bg-surface shadow-lg flex flex-col rounded-r-3xl overflow-hidden transition-transform duration-300 ease-ios ' +
          (menuAbierto ? 'translate-x-0' : '-translate-x-full')
        }>
          <div className="px-5 pt-6 pb-4 flex items-center gap-3">
            <img src="/icon.svg" alt="" className="w-9 h-9" />
            <div>
              <div className="font-display font-bold uppercase text-lg leading-tight">Maykelsgym Shop</div>
              <div className="text-sm text-muted">{perfil?.rol_nombre}</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-2 px-2">
            {grupos.map((g) => (
              <div key={g.titulo} className="mb-2">
                <div className="px-4 pt-2 pb-1 text-xs font-semibold text-muted">{g.titulo}</div>
                {g.items.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => elegir(t.id)}
                    aria-current={tabActual === t.id ? 'page' : undefined}
                    className={
                      'w-full text-left px-4 py-3 my-0.5 rounded-xl text-sm ' +
                      (tabActual === t.id ? 'font-semibold text-ink bg-sunken' : 'text-ink active:bg-sunken')
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
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
