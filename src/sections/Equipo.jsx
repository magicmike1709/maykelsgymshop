import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const ROLES = [
  { codigo: 'operador_plus', nombre: 'Segundo admin' },
  { codigo: 'operador', nombre: 'Gestor' },
  { codigo: 'mensajero', nombre: 'Mensajero' },
  { codigo: 'lectura', nombre: 'Solo lectura' }
]

function Bloque({ titulo, tono = 'text-green-strong', children }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <h2 className={'font-display text-sm font-semibold uppercase tracking-wide mb-3 ' + tono}>{titulo}</h2>
      {children}
    </section>
  )
}

export default function Equipo() {
  const [gestores, setGestores] = useState([])
  const [mensajeros, setMensajeros] = useState([])
  const [socios, setSocios] = useState([])
  const [comisionesPend, setComisionesPend] = useState([])
  const [mensajeriaPend, setMensajeriaPend] = useState([])
  const [sociosPend, setSociosPend] = useState([])
  const [usuarios, setUsuarios] = useState([])

  const [gNombre, setGNombre] = useState('')
  const [gPct, setGPct] = useState('')
  const [mNombre, setMNombre] = useState('')
  const [sNombre, setSNombre] = useState('')

  const [uEmail, setUEmail] = useState('')
  const [uPassword, setUPassword] = useState('')
  const [uNombre, setUNombre] = useState('')
  const [uRol, setURol] = useState('operador')
  const [uMensaje, setUMensaje] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [pagando, setPagando] = useState(null)

  async function cargar() {
    const [g, m, s, cp, mp, sp, us] = await Promise.all([
      supabase.rpc('gestores_lista'),
      supabase.rpc('mensajeros_lista'),
      supabase.rpc('socios_lista'),
      supabase.rpc('comisiones_pendientes'),
      supabase.rpc('mensajeros_pendientes'),
      supabase.rpc('socios_pendientes'),
      supabase.rpc('usuarios_lista')
    ])
    setGestores(g.data || [])
    setMensajeros(m.data || [])
    setSocios(s.data || [])
    setComisionesPend(cp.data || [])
    setMensajeriaPend(mp.data || [])
    setSociosPend(sp.data || [])
    setUsuarios(us.data || [])
  }

  useEffect(() => {
    cargar()
  }, [])

  async function agregarGestor(e) {
    e.preventDefault()
    setMensaje('')
    if (!gNombre) return
    const { error } = await supabase.rpc('gestor_guardar', { p_id: null, p_nombre: gNombre, p_pct_comision: Number(gPct || 0) / 100 })
    if (error) return setMensaje('No se pudo agregar: ' + error.message)
    setGNombre(''); setGPct(''); cargar()
  }
  async function agregarMensajero(e) {
    e.preventDefault()
    setMensaje('')
    if (!mNombre) return
    const { error } = await supabase.rpc('mensajero_guardar', { p_id: null, p_nombre: mNombre })
    if (error) return setMensaje('No se pudo agregar: ' + error.message)
    setMNombre(''); cargar()
  }
  async function agregarSocio(e) {
    e.preventDefault()
    setMensaje('')
    if (!sNombre) return
    const { error } = await supabase.rpc('socio_guardar', { p_id: null, p_nombre: sNombre })
    if (error) return setMensaje('No se pudo agregar: ' + error.message)
    setSNombre(''); cargar()
  }
  async function pagarComision(id) {
    const clave = 'comision:' + id
    if (pagando) return
    setMensaje(''); setPagando(clave)
    const { error } = await supabase.rpc('comision_pagar', { p_gestor_id: id })
    setPagando(null)
    if (error) return setMensaje('No se pudo pagar: ' + error.message)
    cargar()
  }
  async function rendirMensajero(id) {
    const clave = 'mensajero:' + id
    if (pagando) return
    setMensaje(''); setPagando(clave)
    const { error } = await supabase.rpc('mensajero_rendir', { p_mensajero_id: id })
    setPagando(null)
    if (error) return setMensaje('No se pudo marcar: ' + error.message)
    cargar()
  }
  async function pagarSocio(id) {
    const clave = 'socio:' + id
    if (pagando) return
    setMensaje(''); setPagando(clave)
    const { error } = await supabase.rpc('socio_pagar', { p_socio_id: id })
    setPagando(null)
    if (error) return setMensaje('No se pudo pagar: ' + error.message)
    cargar()
  }

  async function crearUsuario(e) {
    e.preventDefault()
    setUMensaje('')
    if (!uEmail || !uPassword || !uNombre) return
    const { error } = await supabase.rpc('usuario_crear', {
      p_email: uEmail, p_password: uPassword, p_nombre: uNombre, p_rol: uRol
    })
    if (error) return setUMensaje('No se pudo crear: ' + error.message)
    setUEmail(''); setUPassword(''); setUNombre('')
    setUMensaje('Usuario creado — ya puede entrar con ese correo y contraseña.')
    cargar()
  }

  return (
    <div className="space-y-5 pb-4">
      {mensaje && <p className="text-sm text-red rounded-xl border border-red/30 bg-surface px-4 py-2.5">{mensaje}</p>}

      {comisionesPend.length > 0 && (
        <Bloque titulo="Comisiones pendientes" tono="text-yellow">
          <div className="space-y-2">
            {comisionesPend.map((c) => (
              <div key={c.gestor_id} className="flex items-center justify-between text-sm">
                <span>{c.gestor_nombre} · {c.ventas} venta{c.ventas === 1 ? '' : 's'}</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold tabular-nums">${Number(c.total).toLocaleString('en-US')}</span>
                  <button onClick={() => pagarComision(c.gestor_id)} disabled={!!pagando}
                    className="text-xs font-semibold text-white bg-green rounded-full px-3 py-1.5 disabled:opacity-50">
                    {pagando === 'comision:' + c.gestor_id ? 'Pagando…' : 'Pagar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Bloque>
      )}

      {mensajeriaPend.length > 0 && (
        <Bloque titulo="Mensajeros con dinero pendiente" tono="text-yellow">
          <div className="space-y-2">
            {mensajeriaPend.map((m) => (
              <div key={m.mensajero_id} className="flex items-center justify-between text-sm">
                <span>{m.mensajero_nombre} · {m.ventas} entrega{m.ventas === 1 ? '' : 's'}</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold tabular-nums">${Number(m.total).toLocaleString('en-US')}</span>
                  <button onClick={() => rendirMensajero(m.mensajero_id)} disabled={!!pagando}
                    className="text-xs font-semibold text-white bg-green rounded-full px-3 py-1.5 disabled:opacity-50">
                    {pagando === 'mensajero:' + m.mensajero_id ? 'Marcando…' : 'Ya rindió'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Bloque>
      )}

      {sociosPend.length > 0 && (
        <Bloque titulo="Socios por liquidar" tono="text-yellow">
          <div className="space-y-2">
            {sociosPend.map((s) => (
              <div key={s.socio_id} className="flex items-center justify-between text-sm">
                <span>{s.socio_nombre}</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold tabular-nums">${Number(s.total).toLocaleString('en-US')}</span>
                  <button onClick={() => pagarSocio(s.socio_id)} disabled={!!pagando}
                    className="text-xs font-semibold text-white bg-green rounded-full px-3 py-1.5 disabled:opacity-50">
                    {pagando === 'socio:' + s.socio_id ? 'Pagando…' : 'Pagar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Bloque>
      )}

      <Bloque titulo="Gestores">
        <div className="space-y-1 mb-3">
          {gestores.map((g) => (
            <div key={g.id} className="text-sm flex justify-between"><span>{g.nombre}</span><span className="text-muted">{(g.pct_comision * 100).toFixed(0)}% comisión</span></div>
          ))}
          {gestores.length === 0 && <p className="text-sm text-muted">Sin gestores todavía.</p>}
        </div>
        <form onSubmit={agregarGestor} className="flex gap-2">
          <input value={gNombre} onChange={(e) => setGNombre(e.target.value)} placeholder="Nombre"
            className="flex-1 rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-green" />
          <input value={gPct} onChange={(e) => setGPct(e.target.value)} type="number" min="0" max="100" placeholder="% com."
            className="w-20 rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-green" />
          <button type="submit" className="rounded-xl bg-green text-white text-sm font-semibold px-3">+</button>
        </form>
      </Bloque>

      <Bloque titulo="Mensajeros">
        <div className="space-y-1 mb-3">
          {mensajeros.map((m) => <div key={m.id} className="text-sm">{m.nombre}</div>)}
          {mensajeros.length === 0 && <p className="text-sm text-muted">Sin mensajeros todavía.</p>}
        </div>
        <form onSubmit={agregarMensajero} className="flex gap-2">
          <input value={mNombre} onChange={(e) => setMNombre(e.target.value)} placeholder="Nombre"
            className="flex-1 rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-green" />
          <button type="submit" className="rounded-xl bg-green text-white text-sm font-semibold px-3">+</button>
        </form>
      </Bloque>

      <Bloque titulo="Socios">
        <div className="space-y-1 mb-3">
          {socios.map((s) => <div key={s.id} className="text-sm">{s.nombre}</div>)}
          {socios.length === 0 && <p className="text-sm text-muted">Sin socios todavía.</p>}
        </div>
        <form onSubmit={agregarSocio} className="flex gap-2">
          <input value={sNombre} onChange={(e) => setSNombre(e.target.value)} placeholder="Nombre"
            className="flex-1 rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-green" />
          <button type="submit" className="rounded-xl bg-green text-white text-sm font-semibold px-3">+</button>
        </form>
        <p className="text-xs text-muted mt-2">Para darle % de ganancia a un socio en un producto, edítalo desde Vitrina.</p>
      </Bloque>

      <Bloque titulo="Usuarios">
        <div className="space-y-1 mb-3">
          {usuarios.map((u) => (
            <div key={u.id} className="text-sm flex justify-between">
              <span>{u.nombre} <span className="text-muted">· {u.correo}</span></span>
              <span className="text-muted">{u.rol_nombre}</span>
            </div>
          ))}
        </div>
        <form onSubmit={crearUsuario} className="space-y-2">
          <input value={uNombre} onChange={(e) => setUNombre(e.target.value)} placeholder="Nombre"
            className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-green" required />
          <input value={uEmail} onChange={(e) => setUEmail(e.target.value)} type="email" placeholder="Correo"
            className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-green" required />
          <input value={uPassword} onChange={(e) => setUPassword(e.target.value)} type="text" placeholder="Contraseña"
            className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-green" required />
          <select value={uRol} onChange={(e) => setURol(e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-green bg-surface">
            {ROLES.map((r) => <option key={r.codigo} value={r.codigo}>{r.nombre}</option>)}
          </select>
          <button type="submit" className="w-full rounded-xl bg-green text-white text-sm font-semibold py-2.5">Crear usuario</button>
          {uMensaje && <p className="text-sm text-muted">{uMensaje}</p>}
        </form>
      </Bloque>
    </div>
  )
}
