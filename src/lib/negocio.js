// Datos del negocio que usa el catálogo público.
// El WhatsApp es el mismo que aparece en el menú de El Yerro y en las facturas.
export const NOMBRE_NEGOCIO = "Maykel's Gym Shop"
export const WHATSAPP = '5352821502' // código de país + número, sin + ni espacios

export function enlaceWhatsApp(texto) {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`
}
