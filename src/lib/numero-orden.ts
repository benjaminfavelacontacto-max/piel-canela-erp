/**
 * Generación del número de orden (cotización / venta).
 *
 * Formato:  PC-DDMMYY + NNN + -TIPO- + NombreCorto
 *   ej:     PC-020626009-C-Mithra   (cotizado)
 *           PC-020626009-V-Mithra   (al venderse)
 *
 * - DDMMYY: fecha de la orden (día, mes, año corto).
 * - NNN: consecutivo de 3 dígitos POR CLIENTE.
 * - TIPO: "C" = cotizado · "V" = vendido.
 * - NombreCorto: nombre completo del negocio del cliente (sin espacios ni acentos).
 */

export type TipoOrden = "C" | "V"

/** Fecha en formato DDMMYY. Ej: 2 jun 2026 → "020626". Acepta Date o "YYYY-MM-DD". */
export function fechaDDMMYY(fecha: Date | string = new Date()): string {
  const d =
    typeof fecha === "string" ? new Date(fecha + "T00:00:00") : fecha
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}${mm}${yy}`
}

/**
 * Nombre del cliente para el sufijo: nombre_negocio COMPLETO (o nombre), sin
 * acentos ni caracteres especiales. Los espacios se concatenan para mantener el
 * número como un identificador limpio (sin guiones que choquen con el -C-/-V-).
 * "Mithra Sun & Spa" → "MithraSunSpa" · "Ana Lucia" → "AnaLucia".
 */
export function nombreCorto(
  cliente: { nombre_negocio?: string | null; nombre?: string | null } | null,
): string {
  const base = (cliente?.nombre_negocio ?? cliente?.nombre ?? "Cliente").trim()
  // NFD separa los acentos en marcas combinantes; el filtro alfanumérico las
  // elimina junto con espacios y símbolos. "Café Sol" → "CafeSol".
  const limpio = base.normalize("NFD").replace(/[^A-Za-z0-9]/g, "")
  return limpio || "Cliente"
}

/** Construye el número completo. NNN = consecutivo con padding de 3 dígitos. */
export function construirNumeroOrden(opts: {
  fecha?: Date | string
  consecutivo: number
  tipo: TipoOrden
  nombreCorto: string
}): string {
  const f = fechaDDMMYY(opts.fecha ?? new Date())
  const nnn = String(Math.max(1, Math.floor(opts.consecutivo))).padStart(3, "0")
  return `PC-${f}${nnn}-${opts.tipo}-${opts.nombreCorto}`
}

/**
 * Cambia el segmento de tipo (-C- ↔ -V-) de un número existente.
 * Robusto: si no encuentra el patrón, devuelve el número sin cambios.
 */
export function cambiarTipoNumero(numero: string, nuevoTipo: TipoOrden): string {
  return numero.replace(/-(?:C|V)-/, `-${nuevoTipo}-`)
}
