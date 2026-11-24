// Utilidades del cobro del gym: dólares, estados de vencimiento y errores del servidor.

// "9000" → 9000; "9.000,50" no se admite: se escribe con punto o coma decimal simple.
export function num(v) {
  const x = Number(String(v ?? '').trim().replace(',', '.'))
  return Number.isFinite(x) ? x : 0
}

// Dólares: sin decimales si es entero, con dos si no ("10", "5.50").
export function usdTxt(v) {
  const x = Number(v || 0)
  return x.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(x) ? 0 : 2,
    maximumFractionDigits: 2
  })
}

// El servidor responde "MG409: texto". Al usuario solo le toca el texto.
export function mensajeError(error) {
  const m = (error && (error.message || error)) || 'Error desconocido'
  return String(m).replace(/^MG\d+:\s*/, '')
}

export function esConflicto(error) {
  return /^MG409/.test(String((error && error.message) || ''))
}

// Identificador único de cada cobro: si la señal se corta y se reenvía, no se duplica.
export function nuevoOpId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
  return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`
}

// Etiqueta de color del estado de un cliente. `c` trae estado, restante y dias
// (de gym_clientes_buscar) o, en vencimientos, dias = días que faltan para vencer.
export function chipEstado(c) {
  const e = c?.estado
  if (e === 'sin_pagos' || !e) return { texto: 'Sin pagos', clase: 'bg-sunken text-muted' }
  if (e === 'inactivo') return { texto: `Inactivo · ${c.dias} d sin pagar`, clase: 'bg-sunken text-muted' }
  if (e === 'vencido') return { texto: `Venció hace ${-c.restante} d`, clase: 'bg-red-soft text-red' }
  if (e === 'por_vencer') {
    const r = c.restante
    return { texto: r <= 0 ? 'Vence hoy' : r === 1 ? 'Vence mañana' : `Vence en ${r} d`, clase: 'bg-yellow-soft text-yellow-ink' }
  }
  const r = c.restante
  return { texto: r === 1 ? 'Al día · vence mañana' : `Al día · vence en ${r} d`, clase: 'bg-green-soft text-green-strong' }
}

// Texto del vencimiento en la lista de "Se les vence" (dias = días que faltan, puede ser negativo).
export function textoVence(dias, estado) {
  if (estado === 'vencido') return { texto: `Venció hace ${-dias} d`, clase: 'text-red' }
  if (dias <= 0) return { texto: 'Vence hoy', clase: 'text-red' }
  if (dias === 1) return { texto: 'Vence mañana', clase: 'text-yellow-ink' }
  return { texto: `Vence en ${dias} d`, clase: 'text-yellow-ink' }
}
