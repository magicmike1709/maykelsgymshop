import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Resumen from '../sections/Resumen'
import Matriculas from '../sections/Matriculas'
import Nevera from '../sections/Nevera'
import Vitrina from '../sections/Vitrina'
import Gastos from '../sections/Gastos'

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'matriculas', label: 'Matrículas' },
  { id: 'nevera', label: 'Nevera' },
  { id: 'vitrina', label: 'Vitrina' },
  { id: 'gastos', label: 'Gastos' }
]

export default function Panel() {
  const [perfil, setPerfil] = useState(null)
  const [tab, setTab] = useState('resumen')

  useEffect(() => {
    supabase.rpc('mi_perfil').then(({ data }) => setPerfil(data))
  }, [])

  return (
    <div className="min-h-screen pb-20">
      <header className="border-b-[3px] border-green px-5 pt-6 pb-4">
        <div className="text-xs font-bold tracking-widest uppercase text-green-strong flex items-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow" />
          {perfil?.rol_nombre || '…'}
        </div>
        <div className="flex items-center justify-between">
          <h1 className="font-display font-bold uppercase text-2xl tracking-tight">
            {TABS.find((t) => t.id === tab)?.label}
          </h1>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs font-semibold text-muted border border-line rounded-full px-3 py-1.5"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="px-5 pt-5 max-w-md mx-auto">
        {!perfil && <p className="text-sm text-muted">Cargando…</p>}
        {perfil && tab === 'resumen' && <Resumen />}
        {perfil && tab === 'matriculas' && <Matriculas perfil={perfil} />}
        {perfil && tab === 'nevera' && <Nevera perfil={perfil} />}
        {perfil && tab === 'vitrina' && <Vitrina perfil={perfil} />}
        {perfil && tab === 'gastos' && <Gastos perfil={perfil} />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-surface border-t border-line flex">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              'flex-1 py-3 text-[11px] font-semibold uppercase tracking-wide ' +
              (tab === t.id ? 'text-green border-t-2 border-green -mt-px' : 'text-muted')
            }
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
