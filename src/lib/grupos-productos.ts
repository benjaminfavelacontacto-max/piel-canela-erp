/**
 * GRUPOS de producto (familias) — una sola clasificación para toda la app.
 *
 * Sirve para dos cosas que antes vivían duplicadas: el resumen por categoría
 * del formulario y del PDF, y el DESCUENTO POR LOTE ("15% a todas las cintas"
 * sin tener que teclearlo partida por partida).
 *
 * Orden de detección (de más a menos confiable):
 *   1. SKU  — `CN-…` es cinta, `AC-…` activador, etc.
 *   2. Categoría de la BD — para productos con SKU atípico.
 *   3. Nombre — último recurso (cintas viejas sin SKU normalizado).
 */

export type GrupoProducto = {
  /** Nombre visible del grupo: "Cintas", "Activadores"… */
  label: string
  /** Clases Tailwind del chip (texto + fondo). */
  tone: string
}

/** Familias por prefijo de SKU. El orden importa: gana la primera que casa. */
const POR_SKU: Array<[RegExp, GrupoProducto]> = [
  [/^CN-/i, { label: "Cintas", tone: "text-[#0F766E] bg-[#F9FAFB]" }],
  [/^AC-/i, { label: "Activadores", tone: "text-emerald-700 bg-emerald-50" }],
  [/^OX/i, { label: "Emulsión", tone: "text-teal-700 bg-teal-50" }],
  [/^PB-/i, { label: "Polvo blanquear", tone: "text-violet-700 bg-violet-50" }],
  [/^AE-/i, { label: "Aerografía", tone: "text-amber-700 bg-amber-50" }],
  [/^PO-/i, { label: "Potenciadores", tone: "text-rose-700 bg-rose-50" }],
  [/^HI-/i, { label: "Humectantes", tone: "text-blue-700 bg-blue-50" }],
  [/^EX-/i, { label: "Exfoliants", tone: "text-orange-700 bg-orange-50" }],
  [/^SM/i, { label: "Sombrillas", tone: "text-cyan-700 bg-cyan-50" }],
  [/^DYE/i, { label: "Dye Color", tone: "text-purple-700 bg-purple-50" }],
  [/^DOL/i, { label: "Aceite", tone: "text-yellow-700 bg-yellow-50" }],
]

export const GRUPO_OTROS: GrupoProducto = {
  label: "Otros",
  tone: "text-gray-700 bg-gray-100",
}

/** Forma mínima para clasificar una partida. */
export type ProductoClasificable = {
  sku?: string | null
  categoria?: string | null
  nombre?: string | null
}

/** Familia de la partida. Nunca devuelve null: el fallback es "Otros". */
export function grupoProducto(it: ProductoClasificable): GrupoProducto {
  const sku = (it.sku ?? "").trim()
  const porSku = POR_SKU.find(([rx]) => rx.test(sku))
  if (porSku) return porSku[1]
  if (esCinta(it)) return POR_SKU[0][1]
  const categoria = (it.categoria ?? "").trim()
  if (categoria) {
    const porCat = POR_SKU.find(([, g]) =>
      categoria.toUpperCase().includes(g.label.toUpperCase()),
    )
    if (porCat) return porCat[1]
  }
  return GRUPO_OTROS
}

/**
 * ¿Es cinta? Se mantiene aparte del grupo fino porque el PDF resume el pedido
 * en solo dos bloques (Cintas / Otros) y esa vista no debe cambiar.
 */
export function esCinta(it: ProductoClasificable): boolean {
  const sku = (it.sku ?? "").toUpperCase().trim()
  const categoria = (it.categoria ?? "").toUpperCase().trim()
  const nombre = (it.nombre ?? "").toUpperCase().trim()
  // SKU CN-XXX → más confiable
  if (sku.startsWith("CN-")) return true
  // Categoría con cualquier variante de "CINTA"
  if (categoria.includes("CINTA")) return true
  // Fallback por nombre
  if (nombre.startsWith("CINTA ")) return true
  if (nombre.includes("CORTADA")) return true
  if (nombre.includes("ENTERA") && !nombre.includes("ML")) return true
  return false
}
