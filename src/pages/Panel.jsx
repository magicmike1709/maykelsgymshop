import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Resumen from '../sections/Resumen'
import Matriculas from '../sections/Matriculas'
import Nevera from '../sections/Nevera'
import Vitrina from '../sections/Vitrina'
import Inventario from '../sections/Inventario'
import Gastos from '../sections/Gastos'
import Equipo from '../sections/Equipo'
import Cierre from '../sections/Cierre'
import Avisos from '../sections/Avisos'
import Actividad from '../sections/Actividad'
import Fondos from '../sections/Fondos'

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
      <header className="border-b-[3px] border-green px-5 pt-6 pb-4">
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
        {!perfil && <p className="text-sm text-muted">Cargando…</p>}
        {perfil && tab === 'resumen' && <Resumen />}
        {perfil && tab === 'matriculas' && <Matriculas perfil={perfil} />}
        {perfil && tab === 'nevera' && <Nevera perfil={perfil} />}
        {perfil && tab === 'vitrina' && <Vitrina />}
        {perfil && tab === 'inventario' && <Inventario perfil={perfil} />}
        {perfil && tab === 'gastos' && <Gastos perfil={perfil} />}
        {perfil && tab === 'avisos' && <Avisos perfil={perfil} />}
        {perfil && tab === 'equipo' && perfil.rol === 'admin' && <Equipo />}
        {perfil && tab === 'cierre' && perfil.rol === 'admin' && <Cierre />}
        {perfil && tab === 'fondos' && perfil.rol === 'admin' && <Fondos />}
        {perfil && tab === 'actividad' && perfil.rol === 'admin' && <Actividad />}
      </main>

      {menuAbierto && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuAbierto(false)} />
          <nav className="absolute inset-y-0 left-0 w-72 max-w-[80vw] bg-surface shadow-lg flex flex-col">
            <div className="border-b-[3px] border-green px-5 pt-6 pb-4">
              <div className="text-xs font-bold tracking-widest uppercase text-green-strong flex items-center gap-2 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow" />
                Maykelsgym Shop
              </div>
              <div className="text-sm text-muted">{perfil?.rol_nombre}</div>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => elegir(t.id)}
                  className={
                    'w-full text-left px-5 py-3 text-sm font-semibold ' +
                    (tab === t.id ? 'text-green-strong bg-green-soft border-r-[3px] border-green' : 'text-ink')
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="px-5 py-4 text-left text-sm font-semibold text-red border-t border-line"
            >
              Salir
            </button>
          </nav>
        </div>
      )}
    </div>
  )
}
