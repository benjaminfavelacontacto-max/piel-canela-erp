import type { Producto } from "@/lib/cotizacion-types"
import { esCintaPorEscoger } from "@/lib/cinta-por-escoger"

/**
 * LISTA DE PRECIOS / catálogo rápido de cotización.
 *
 * Agrupa los productos por familia (categoría de BD) con nombres comerciales y
 * un orden fijo pensado para enseñar la lista: lo que más se pregunta primero.
 *
 * Quedan FUERA de la lista (se siguen pudiendo buscar al cotizar):
 *   · Presentaciones de 5 L (OX…-5L-…).
 *   · Dye Color.
 * Las cintas (176 modelos al mismo precio) se resumen en UNA fila —el comodín
 * "Cinta por escoger"— en vez de listar los 176.
 */

const FAMILIAS: Array<{ key: string; label: string; nota?: string }> = [
  { key: "ACTIVADORES", label: "Activadores" },
  { key: "POTENCIADORES", label: "Potenciadores" },
  { key: "EXFOLIANTS", label: "Exfoliantes" },
  {
    key: "POLVO DE BLANQUEAR",
    label: "Aclaradores",
    nota: "Polvo decolorante",
  },
  {
    key: "EMULSIÓN REVELADORA",
    label: "Oxigenantes",
    nota: "Emulsión reveladora",
  },
  { key: "HUMECTANTES", label: "Humectantes" },
  {
    key: "CINTAS",
    label: "Cintas",
    nota: "Mismo precio en cualquier modelo (9 mm, 12 mm o entera)",
  },
  { key: "AEROGRAFÍA", label: "Aerografía" },
  { key: "ACEITE CORPORAL", label: "Aceite corporal" },
  { key: "SOMBRILLA", label: "Sombrillas" },
  { key: "SHAMPOO", label: "Shampoo" },
  { key: "OTROS", label: "Otros" },
]

const NO_LISTADAS = new Set(["DYE COLOR"])

export type SeccionCatalogo = {
  key: string
  label: string
  nota?: string
  productos: Producto[]
}

/** ¿Va fuera de la lista de precios? (5 L y Dye Color) */
export function excluidoDeLista(p: Producto): boolean {
  const cat = (p.categoria ?? "").toUpperCase()
  if (NO_LISTADAS.has(cat)) return true
  if (/-5L(-|$)/i.test(p.sku ?? "")) return true
  if (/^5\s*(l|lt|litros?)$/i.test((p.peso ?? "").trim())) return true
  return false
}

/**
 * Secciones de la lista de precios. Sin cintas-modelo (solo el comodín), sin 5 L
 * ni Dye Color, sin productos sin precio.
 */
export function seccionesCatalogo(productos: readonly Producto[]): SeccionCatalogo[] {
  const porFamilia = new Map<string, Producto[]>()
  for (const p of productos) {
    if (p.precio <= 0) continue
    if (excluidoDeLista(p)) continue
    const cat = (p.categoria ?? "OTROS").toUpperCase()
    const key = FAMILIAS.some((f) => f.key === cat) ? cat : "OTROS"
    if (key === "CINTAS" && !esCintaPorEscoger(p)) continue
    // Un producto inactivo solo se lista si es el comodín de cintas.
    if (p.activo === false && !esCintaPorEscoger(p)) continue
    porFamilia.set(key, [...(porFamilia.get(key) ?? []), p])
  }
  return FAMILIAS.flatMap((f) => {
    const lista = porFamilia.get(f.key)
    if (!lista?.length) return []
    const productos = [...lista].sort((a, b) =>
      (a.sku ?? a.nombre).localeCompare(b.sku ?? b.nombre, "es", { numeric: true }),
    )
    return [{ key: f.key, label: f.label, nota: f.nota, productos }]
  })
}

/** Nombre comercial a mostrar (el comodín se llama distinto en la lista). */
export function nombreEnLista(p: Producto): string {
  return esCintaPorEscoger(p) ? "Cinta (cualquier modelo)" : p.nombre
}

/** Presentación a mostrar (peso/volumen), salvo que el nombre ya la traiga. */
export function presentacionEnLista(p: Producto): string | null {
  if (esCintaPorEscoger(p) || !p.peso) return null
  const compacto = (t: string) => t.toLowerCase().replace(/\s+/g, "")
  return compacto(p.nombre).includes(compacto(p.peso)) ? null : p.peso
}

/** Texto plano de la lista, listo para pegar en WhatsApp. */
export function listaParaWhatsApp(secciones: SeccionCatalogo[]): string {
  const mxn = (n: number) =>
    n.toLocaleString("es-MX", { style: "currency", currency: "MXN" })
  const bloques = secciones.map((s) => {
    const filas = s.productos.map((p) => {
      const pres = presentacionEnLista(p)
      return `• ${nombreEnLista(p)}${pres ? ` (${pres})` : ""} — ${mxn(p.precio)}`
    })
    return `*${s.label.toUpperCase()}*\n${filas.join("\n")}`
  })
  return `*LISTA DE PRECIOS · PIEL CANELA*\n\n${bloques.join("\n\n")}`
}
