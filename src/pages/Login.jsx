import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [modo, setModo] = useState('entrar') // 'entrar' | 'recuperar'
  const [recuperado, setRecuperado] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError('Usuario o contraseña incorrectos.')
  }

  async function recuperar(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    })
    setLoading(false)
    if (error) return setError('No se pudo enviar el correo: ' + error.message)
    setRecuperado(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm rounded-3xl bg-surface shadow-lg border border-line px-6 py-8">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-green-strong mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow" />
            Maykelsgym Shop
          </div>
          <h1 className="font-display font-bold uppercase text-3xl tracking-tight">
            {modo === 'entrar' ? 'Entrar' : 'Recuperar acceso'}
          </h1>
        </div>

        {modo === 'entrar' && (
          <form onSubmit={entrar}>
            <label className="block text-xs font-semibold text-muted mb-1">Correo</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-green"
              placeholder="tu@correo.com" />

            <label className="block text-xs font-semibold text-muted mb-1">Contraseña</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full mb-2 rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-green"
              placeholder="••••••••" />

            {error && <p className="text-red text-sm mb-2">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full mt-4 rounded-xl bg-green text-white font-semibold py-3 disabled:opacity-60">
              {loading ? 'Entrando…' : 'Entrar'}
            </button>

            <button type="button" onClick={() => { setModo('recuperar'); setError('') }}
              className="w-full mt-3 text-xs text-muted underline text-center">
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        )}

        {modo === 'recuperar' && !recuperado && (
          <form onSubmit={recuperar}>
            <p className="text-sm text-muted mb-4">Te mandamos un enlace a tu correo para poner una contraseña nueva.</p>
            <label className="block text-xs font-semibold text-muted mb-1">Correo</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full mb-2 rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-green"
              placeholder="tu@correo.com" />
            {error && <p className="text-red text-sm mb-2">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full mt-4 rounded-xl bg-green text-white font-semibold py-3 disabled:opacity-60">
              {loading ? 'Enviando…' : 'Mandar enlace'}
            </button>
            <button type="button" onClick={() => setModo('entrar')} className="w-full mt-3 text-xs text-muted underline text-center">
              Volver a entrar
            </button>
          </form>
        )}

        {modo === 'recuperar' && recuperado && (
          <div className="text-center">
            <p className="text-sm text-ink mb-4">Listo. Revisa tu correo y toca el enlace para poner tu contraseña nueva.</p>
            <button type="button" onClick={() => { setModo('entrar'); setRecuperado(false) }} className="text-xs text-muted underline">
              Volver a entrar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
