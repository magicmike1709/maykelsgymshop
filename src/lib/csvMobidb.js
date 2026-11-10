// Lee el CSV que exporta MobiDB: Nombre y Apellidos, Fecha, Sexo, Entrenador, Phone.
// La fecha viene como d/m/aaaa (o ya como aaaa-mm-dd).

// Parte una línea de CSV respetando las comillas ("García, Juan").
export function partirLinea(linea) {
  const celdas = []
  let actual = ''
  let entreComillas = false
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i]
    if (ch === '"') {
      if (entreComillas && linea[i + 1] === '"') { actual += '"'; i++ } else entreComillas = !entreComillas
    } else if (ch === ',' && !entreComillas) {
      celdas.push(actual)
      actual = ''
    } else {
      actual += ch
    }
  }
  celdas.push(actual)
  return celdas.map((c) => c.trim())
}

export function normalizarFechaCSV(f) {
  const t = String(f || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const partes = t.split('/')
  if (partes.length !== 3) return null
  const [d, m, y] = partes.map((x) => x.trim())
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || !/^\d{4}$/.test(y)) return null
  const dd = Number(d)
  const mm = Number(m)
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

// Devuelve { filas, descartadas, columnas }.
export function leerCSVMobiDB(texto) {
  const lineas = String(texto).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lineas.length < 2) return { filas: [], descartadas: 0, columnas: null }
  const cab = partirLinea(lineas[0]).map((h) => h.toLowerCase())
  const donde = (...claves) => cab.findIndex((h) => claves.some((c) => h.includes(c)))
  const idx = {
    nombre: donde('nombre'),
    fecha: donde('fecha'),
    sexo: donde('sexo'),
    entrenador: donde('entrenador'),
    telefono: donde('phone', 'telefono', 'teléfono', 'tel')
  }
  if (idx.nombre < 0 || idx.fecha < 0) return { filas: [], descartadas: lineas.length - 1, columnas: idx }
  let descartadas = 0
  const filas = []
  for (const linea of lineas.slice(1)) {
    const c = partirLinea(linea)
    const nombre = (c[idx.nombre] || '').trim()
    const fecha = normalizarFechaCSV(c[idx.fecha])
    if (!nombre || !fecha) { descartadas++; continue }
    filas.push({
      nombre,
      fecha,
      sexo: idx.sexo >= 0 ? c[idx.sexo] || null : null,
      entrenador: idx.entrenador >= 0 ? c[idx.entrenador] || null : null,
      telefono: idx.telefono >= 0 ? c[idx.telefono] || null : null
    })
  }
  return { filas, descartadas, columnas: idx }
}
