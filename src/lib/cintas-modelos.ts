/**
 * Modelos de cinta: agrupa las filas de `productos` (una por presentación) en
 * "modelos" para poder identificar una cinta en una foto y cotizarla en la
 * presentación correcta.
 *
 * Cada modelo tiene hasta 3 presentaciones que se cotizan por separado:
 *  - entera  → "(entera)"          SKU …-CE / …-E
 *  - 9/9     → "(cortada 9mm)"     SKU …-C9
 *  - 6/12    → "(cortada 12mm)"    SKU …-C12 / …-C612
 *
 * Funciones puras (sin imports de servidor): las usan tanto el servidor (para
 * armar las hojas de referencia que ve la IA) como el cliente (para resolver
 * qué producto cotizar). Las dos DEBEN producir las mismas claves de modelo.
 */

export type Presentacion = "entera" | "9-9" | "6-12"

export const PRESENTACIONES: { id: Presentacion; etiqueta: string; corta: string }[] = [
  { id: "entera", etiqueta: "Enteras", corta: "Entera" },
  { id: "9-9", etiqueta: "9/9", corta: "9/9" },
  { id: "6-12", etiqueta: "6/12", corta: "6/12" },
]

/** Lo mínimo que se necesita de un producto (compatible con `Producto`). */
export type ProductoCinta = {
  id: string
  sku: string | null
  nombre: string
  nombre_display?: string | null
  imagen_url: string | null
  categoria?: string | null
  activo?: boolean
}

type Variante = Presentacion | "c6" | "unica"

export type ModeloCinta<P extends ProductoCinta = ProductoCinta> = {
  /** Clave estable = nombre base normalizado. */
  clave: string
  nombre: string
  imagen_url: string | null
  entera?: P
  c9?: P
  c12?: P
  /** Otras filas del modelo (6mm, cintas viejas sin presentación). */
  otras: P[]
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()

/** Quita el sufijo de presentación del nombre: "Naranja (cortada 9mm)" → "Naranja". */
function nombreBase(nombre: string): string {
  return nombre
    .replace(/\s*\((?:entera|cortada\s*\d+\s*mm)\)\s*$/i, "")
    .replace(/-c\d+$/i, "")
    .trim()
}

function varianteDe(nombre: string, sku: string | null): Variante {
  const n = norm(nombre)
  if (/\(entera\)\s*$/.test(n)) return "entera"
  if (/\(cortada 9mm\)\s*$/.test(n)) return "9-9"
  if (/\(cortada 12mm\)\s*$/.test(n)) return "6-12"
  if (/\(cortada 6mm\)\s*$/.test(n)) return "c6"
  const s = (sku ?? "").toUpperCase()
  if (/-(CE|E)$/.test(s)) return "entera"
  if (/-C9B?$/.test(s)) return "9-9"
  if (/-C(12|612)$/.test(s)) return "6-12"
  if (/-C66$/.test(s)) return "c6"
  return "unica"
}

/** Comodines y genéricos que NO son un modelo concreto. */
function esCintaConcreta(p: ProductoCinta): boolean {
  const sku = (p.sku ?? "").toUpperCase()
  if (!sku.startsWith("CN-")) return false
  if (sku.startsWith("CN-POR-ESCOGER")) return false
  if (sku === "CN-DEC") return false
  return p.activo !== false
}

/**
 * Agrupa las cintas en modelos. Sólo cuenta productos de la categoría CINTAS
 * (o con SKU "CN-…"); el orden de salida es estable (alfabético por nombre).
 */
export function agruparModelos<P extends ProductoCinta>(productos: readonly P[]): ModeloCinta<P>[] {
  const map = new Map<string, ModeloCinta<P>>()
  for (const p of productos) {
    if (!esCintaConcreta(p)) continue
    const display = p.nombre_display ?? p.nombre
    const base = nombreBase(display)
    // "Cinta Blanca" (fila vieja sin presentación) y "Blanca (entera)" son el MISMO modelo.
    const clave = norm(base).replace(/^cinta /, "")
    if (!clave) continue
    const v = varianteDe(display, p.sku)
    const m =
      map.get(clave) ??
      ({ clave, nombre: base, imagen_url: null, otras: [] } as ModeloCinta<P>)
    // El nombre limpio lo da una fila con presentación, no la "Cinta X" vieja.
    if (v !== "unica") m.nombre = base
    if (v === "entera" && !m.entera) m.entera = p
    else if (v === "9-9" && !m.c9) m.c9 = p
    else if (v === "6-12" && !m.c12) m.c12 = p
    else m.otras.push(p)
    map.set(clave, m)
  }
  const modelos = [...map.values()]
  for (const m of modelos) {
    // La foto de referencia: la de la entera, si no la de cualquier presentación.
    m.imagen_url =
      m.entera?.imagen_url ??
      m.c9?.imagen_url ??
      m.c12?.imagen_url ??
      m.otras.find((o) => o.imagen_url)?.imagen_url ??
      null
  }
  return modelos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}

/**
 * Producto a cotizar para un modelo en la presentación pedida.
 * Si el modelo es una cinta vieja sin presentaciones (una sola fila), esa fila
 * sirve para cualquier presentación.
 */
export function productoDeModelo<P extends ProductoCinta>(
  m: ModeloCinta<P>,
  pres: Presentacion,
): P | null {
  const directo = pres === "entera" ? m.entera : pres === "9-9" ? m.c9 : m.c12
  if (directo) return directo
  const tieneAlguna = m.entera || m.c9 || m.c12
  if (!tieneAlguna && m.otras.length === 1) return m.otras[0]
  return null
}
