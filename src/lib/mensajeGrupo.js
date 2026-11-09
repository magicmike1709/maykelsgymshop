import { fechaLocal, fechaDiaMesAnio } from './fecha'
import { precio } from './formato'
import { NOMBRE_NEGOCIO } from './negocio'

// Hasta cuántas unidades se avisa "¡últimas!" en la lista de existencias.
export const ULTIMAS_UNIDADES = 3

const unidadesDe = (p) => Number(p.stock) || 0

// Productos con stock y precio: los únicos que tiene sentido ofrecer.
export function disponibles(productos) {
  return (productos || []).filter((p) => p.activo !== false && unidadesDe(p) > 0 && Number(p.precio) > 0)
}

function diasDesde(fechaISO, hoyISO) {
  const [y1, m1, d1] = fechaISO.split('-').map(Number)
  const [y2, m2, d2] = hoyISO.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

// Novedades: productos con stock a los que les llegó mercancía en los últimos `dias` días.
export function novedades(productos, dias, hoyISO = fechaLocal()) {
  return disponibles(productos)
    .filter((p) => p.ultima_entrada && diasDesde(p.ultima_entrada, hoyISO) >= 0 && diasDesde(p.ultima_entrada, hoyISO) <= dias)
    .sort((a, b) => b.ultima_entrada.localeCompare(a.ultima_entrada) || a.nombre.localeCompare(b.nombre, 'es'))
}

// Existencias agrupadas por categoría (solo las categorías pedidas, o todas si no se indica).
export function existenciasPorCategoria(productos, categoriasElegidas = null) {
  const grupos = {}
  for (const p of disponibles(productos)) {
    const cat = p.categoria || 'Otros'
    if (categoriasElegidas && !categoriasElegidas.includes(cat)) continue
    ;(grupos[cat] = grupos[cat] || []).push(p)
  }
  return Object.keys(grupos)
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((cat) => ({ categoria: cat, productos: grupos[cat].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) }))
}

export function categoriasDisponibles(productos) {
  return existenciasPorCategoria(productos).map((g) => g.categoria)
}

/**
 * Arma el texto para pegar en el grupo de WhatsApp.
 * Usa el formato de WhatsApp: *negrita* y ~tachado~.
 * opciones: { productos, enlace, usarNovedades, diasNovedades, ofertas: [{nombre, precioNormal, precioOferta}],
 *             usarExistencias, categorias (null = todas), hoyISO }
 */
export function armarMensaje({
  productos, enlace, usarNovedades = true, diasNovedades = 14, ofertas = [],
  usarExistencias = true, categorias = null, hoyISO = fechaLocal()
}) {
  const bloques = [`🏋️ *${NOMBRE_NEGOCIO}*\nActualizado ${fechaDiaMesAnio(hoyISO)}`]

  if (usarNovedades) {
    const lista = novedades(productos, diasNovedades, hoyISO)
    if (lista.length > 0) {
      bloques.push(['🆕 *NOVEDADES*', ...lista.map((p) => `• ${p.nombre} — $${precio(p.precio)}`)].join('\n'))
    }
  }

  const ofertasValidas = (ofertas || []).filter((o) => o.nombre && Number(o.precioOferta) > 0)
  if (ofertasValidas.length > 0) {
    bloques.push(['🔥 *OFERTAS*', ...ofertasValidas.map((o) =>
      Number(o.precioNormal) > 0 && Number(o.precioNormal) !== Number(o.precioOferta)
        ? `• ${o.nombre} — ~$${precio(o.precioNormal)}~ *$${precio(o.precioOferta)}*`
        : `• ${o.nombre} — *$${precio(o.precioOferta)}*`)].join('\n'))
  }

  if (usarExistencias) {
    const grupos = existenciasPorCategoria(productos, categorias)
    if (grupos.length > 0) {
      const lineas = ['📦 *EN EXISTENCIA*']
      for (const g of grupos) {
        lineas.push('', `*${g.categoria}*`)
        for (const p of g.productos) {
          const u = unidadesDe(p)
          const ultimas = u === 1 ? ' (¡última unidad!)' : u <= ULTIMAS_UNIDADES ? ` (¡últimas ${u}!)` : ''
          lineas.push(`• ${p.nombre} — $${precio(p.precio)}${ultimas}`)
        }
      }
      bloques.push(lineas.join('\n'))
    }
  }

  bloques.push(`🛒 Catálogo completo y pedidos por WhatsApp:\n${enlace}`)
  return bloques.join('\n\n')
}
