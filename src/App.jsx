import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Login from './pages/Login'
import Panel from './pages/Panel'
import Catalogo from './pages/Catalogo'
import NuevaContrasena from './pages/NuevaContrasena'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = cargando
  const [recuperando, setRecuperando] = useState(false)
  const esCatalogo = window.location.pathname.replace(/\/+$/, '') === '/catalogo'

  useEffect(() => {
    if (esCatalogo) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecuperando(true)
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

  if (recuperando) return <NuevaContrasena onListo={() => setRecuperando(false)} />

  return session ? <Panel /> : <Login />
}
