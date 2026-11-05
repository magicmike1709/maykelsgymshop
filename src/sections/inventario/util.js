import { supabase } from '../../supabaseClient'

// Quita el código técnico ("MG409: ...") de los errores del servidor.
export function msgError(error) {
  const m = (error && error.message) || 'Algo salió mal'
  return m.replace(/^MG\d+:\s*/, '')
}

export const dinero = (n, dec = 0) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })

// Reduce la foto del celular (≈900px, JPEG) antes de subirla: sube rápido
// aunque la conexión sea mala y no llena el almacenamiento.
async function reducirImagen(archivo, ladoMax = 900) {
  const url = URL.createObjectURL(archivo)
  try {
    const img = await new Promise((ok, mal) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => mal(new Error('No se pudo leer la imagen'))
      i.src = url
    })
    const escala = Math.min(1, ladoMax / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * escala)
    canvas.height = Math.round(img.height * escala)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo reducir la imagen'))), 'image/jpeg', 0.82))
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function subirFotoProducto(archivo) {
  const blob = await reducirImagen(archivo)
  const ruta = `${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('productos').upload(ruta, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  if (error) throw error
  return supabase.storage.from('productos').getPublicUrl(ruta).data.publicUrl
}

// CSV de productos: acepta coma o punto y coma, y encabezados en español.
export function parseCSVProductos(texto) {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lineas.length < 2) return { filas: [], error: 'El archivo está vacío o solo trae el encabezado.' }
  const sep = (lineas[0].match(/;/g) || []).length > (lineas[0].match(/,/g) || []).length ? ';' : ','
  const cabeza = lineas[0].split(sep).map((h) => h.trim().toLowerCase())
  const idx = (...nombres) => cabeza.findIndex((h) => nombres.includes(h))
  const iNombre = idx('nombre', 'producto')
  const iPrecio = idx('precio', 'precio venta')
  const iCosto = idx('costo', 'precio compra')
  const iStock = idx('stock', 'cantidad', 'existencia')
  const iCat = idx('categoria', 'categoría')
  if (iNombre < 0) return { filas: [], error: 'Falta la columna "nombre" en el encabezado.' }
  const num = (v) => {
    const n = Number(String(v || '').replace(',', '.').replace(/[^0-9.\-]/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  const filas = lineas.slice(1).map((l) => {
    const c = l.split(sep).map((x) => x.trim())
    return {
      nombre: c[iNombre] || '',
      precio: iPrecio >= 0 ? num(c[iPrecio]) : 0,
      costo: iCosto >= 0 ? num(c[iCosto]) : 0,
      stock: iStock >= 0 ? num(c[iStock]) : 0,
      categoria: iCat >= 0 ? c[iCat] || '' : ''
    }
  }).filter((f) => f.nombre)
  return { filas, error: filas.length === 0 ? 'No encontré productos en el archivo.' : '' }
}
