// Formato de números compartido por todas las pantallas.
// n()   → cantidades y montos en CUP (formato cubano).
// usd() → montos en dólares (el signo $ lo pone cada pantalla).
export function n(v) {
  return Number(v || 0).toLocaleString('es-CU')
}

export function usd(v) {
  return Number(v || 0).toLocaleString('en-US')
}
