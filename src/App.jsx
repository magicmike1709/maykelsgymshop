import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './pages/Login'
import Panel from './pages/Panel'
import Catalogo from './pages/Catalogo'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = cargando
  const esCatalogo = window.location.pathname.replace(/\/+$/, '') === '/catalogo'

  useEffect(() => {
    if (esCatalogo) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => sub.subscription.unsubscribe()
  }, [esCatalogo])

  if (esCatalogo) return <Catalogo />

  if (session === undefined) {
    return (
      <div className="min-h-screen grid place-items-center text-muted text-sm">
        Cargando…
      </div>
    )
  }

  return session ? <Panel /> : <Login />
}
