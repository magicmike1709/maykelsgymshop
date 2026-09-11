// "Hoy" y cualquier fecha de un objeto Date en hora de Cuba (America/Havana),
// no UTC. toISOString() convierte a UTC — desde ~7-8pm hora de Cuba ya
// devuelve el día siguiente, que es justo el horario pico del gimnasio.
// Esto desfasaba matrículas, ventas, gastos y cierres de caja al día
// calendario equivocado.
export function fechaLocal(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Havana' }).format(d)
}
