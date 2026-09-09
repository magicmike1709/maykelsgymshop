import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function NuevaContrasena({ onListo }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) return setError('Mínimo 6 caracteres.')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) return setError('No se pudo guardar: ' + error.message)
    onListo()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10">
      <form onSubmit={guardar} className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-green-strong mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow" />
            Maykelsgym Shop
          </div>
          <h1 className="font-display font-bold uppercase text-3xl tracking-tight">Nueva contraseña</h1>
        </div>

        <label className="block text-xs font-semibold text-muted mb-1">Contraseña nueva</label>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-2 rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-green"
          placeholder="••••••••" />
        {error && <p className="text-red text-sm mb-2">{error}</p>}
        <button type="submit" disabled={loading}
          className="w-full mt-4 rounded-xl bg-green text-white font-semibold py-3 disabled:opacity-60">
          {loading ? 'Guardando…' : 'Guardar y entrar'}
        </button>
      </form>
    </div>
  )
}
