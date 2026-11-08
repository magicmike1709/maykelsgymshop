// "Hoy" y cualquier fecha de un objeto Date en hora de Cuba (America/Havana),
// no UTC. toISOString() convierte a UTC — desde ~7-8pm hora de Cuba ya
// devuelve el día siguiente, que es justo el horario pico del gimnasio.
// Esto desfasaba matrículas, ventas, gastos y cierres de caja al día
// calendario equivocado.
export function fechaLocal(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Havana' }).format(d)
}

// "2026-11-08" → "8/11". Sin fecha devuelve `vacio`.
export function fechaDiaMes(f, vacio = 'sin fecha') {
  if (!f) return vacio
  const [, m, d] = f.split('-')
  return `${Number(d)}/${Number(m)}`
}

// "2026-11-08" → "8/11/2026". Sin fecha devuelve `vacio`.
export function fechaDiaMesAnio(f, vacio = null) {
  if (!f) return vacio
  const [y, m, d] = f.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

export function ultimoDiaMes(anio, mes0) {
  return new Date(anio, mes0 + 1, 0).getDate()
}

// Mes y año actuales ("2026-11" y "2026") para los selectores de historial.
const _ahora = new Date()
export const MES_ACTUAL = `${_ahora.getFullYear()}-${String(_ahora.getMonth() + 1).padStart(2, '0')}`
export const ANIO_ACTUAL = String(_ahora.getFullYear())

// Rango de fechas {desde, hasta} para los historiales: 'hoy', 'semana' (7 días),
// 'anio' (año entero) o un mes "YYYY-MM".
export function rangoPeriodo(periodo, mes, anio) {
  const hoy = new Date()
  const hastaHoy = fechaLocal(hoy)
  if (periodo === 'hoy') return { desde: hastaHoy, hasta: hastaHoy }
  if (periodo === 'semana') {
    const hace7 = new Date(hoy)
    hace7.setDate(hace7.getDate() - 6)
    return { desde: fechaLocal(hace7), hasta: hastaHoy }
  }
  if (periodo === 'anio') {
    const esAnioActual = Number(anio) === hoy.getFullYear()
    return { desde: `${anio}-01-01`, hasta: esAnioActual ? hastaHoy : `${anio}-12-31` }
  }
  const [y, m] = mes.split('-').map(Number)
  const esMesActual = y === hoy.getFullYear() && m - 1 === hoy.getMonth()
  return { desde: `${mes}-01`, hasta: esMesActual ? hastaHoy : `${mes}-${String(ultimoDiaMes(y, m - 1)).padStart(2, '0')}` }
}
