// Formato de números compartido por todas las pantallas.
// n()   → cantidades y montos en CUP (formato cubano).
// usd() → montos en dólares (el signo $ lo pone cada pantalla).
export function n(v) {
  return Number(v || 0).toLocaleString('es-CU')
}

export function usd(v) {
  return Number(v || 0).toLocaleString('en-US')
}

// Precio en USD para mostrar: sin decimales si es entero ($8) y con dos si tiene
// centavos ($15.50). El signo $ lo pone quien lo muestra.
export function precio(v) {
  const x = Number(v || 0)
  return Number.isInteger(x)
    ? x.toLocaleString('en-US')
    : x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
