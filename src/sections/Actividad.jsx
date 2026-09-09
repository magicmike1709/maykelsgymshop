import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const NOMBRES = {
  ventas: 'Venta',
  matriculas: 'Matrícula',
  gastos: 'Gasto',
  entradas_inventario: 'Entrada de mercancía',
  cierres: 'Cierre'
}

function resumenDato(tabla, datos) {
  if (!datos) return ''
  if (tabla === 'ventas') return `$${Number(datos.total || 0).toLocaleString('en-US')}${datos.cliente ? ' · ' + datos.cliente : ''}`
  if (tabla === 'matriculas') return `${Number(datos.monto || 0).toLocaleString('es-CU')} CUP`
  if (tabla === 'gastos') return `${datos.concepto} · ${Number(datos.importe || 0).toLocaleString()} ${datos.moneda}`
  if (tabla === 'entradas_inventario') return `+${datos.cantidad} a $${Number(datos.costo_unitario || 0).toFixed(2)}`
  if (tabla === 'cierres') return datos.dia
  return ''
}

export default function Actividad() {
  const [lista, setLista] = useState([])

  useEffect(() => {
    supabase.rpc('actividad_lista', { p_limite: 80 }).then(({ data }) => setLista(data || []))
  }, [])

  return (
    <div className="space-y-2 pb-4">
      <p className="text-xs text-muted mb-2">Registro de cambios — nadie puede borrarlo ni editarlo, ni tú.</p>
      {lista.map((a) => (
        <div key={a.id} className="rounded-xl border border-line bg-surface px-4 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{NOMBRES[a.tabla] || a.tabla}</span>
            <span className="text-[11px] text-muted">{new Date(a.creado_en).toLocaleString('es-CU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div className="text-xs text-muted tabular-nums">{resumenDato(a.tabla, a.datos)}</div>
          <div className="text-[11px] text-green-strong font-semibold mt-0.5">{a.usuario_nombre || 'Sistema'}</div>
        </div>
      ))}
      {lista.length === 0 && <p className="text-sm text-muted">Sin actividad todavía.</p>}
    </div>
  )
}
