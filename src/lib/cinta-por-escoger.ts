/**
 * "Cinta por escoger" — partidas comodín para cotizar y cobrar cintas cuando la
 * clienta todavía no decide el modelo. Son productos reales (SKU fijo, inactivos,
 * precio de cinta) para no tocar el esquema: `cotizacion_items.producto_id` es
 * NOT NULL. Hay UN comodín por medida porque se cotizan por medida y cantidad
 * ("5 de 9,9 y 3 de 6,12"); todas las cintas cuestan lo mismo ($150).
 * Alta de los productos + RPC: `scripts/add-cintas-por-escoger-medidas.sql`.
 *
 * Una cotización con cintas por escoger SÍ se puede vender y cobrar. Lo único
 * que cambia: esas piezas NO descuentan stock (no hay modelo). La venta queda
 * con las partidas comodín como marca de "cintas pendientes" hasta que se
 * reemplazan por los modelos reales y se descuentan.
 */
export const PREFIJO_CINTA_POR_ESCOGER = "CN-POR-ESCOGER"

/** Comodín genérico original (sin medida). Se conserva por las cotizaciones viejas. */
export const SKU_CINTA_POR_ESCOGER = PREFIJO_CINTA_POR_ESCOGER

export const MEDIDAS_POR_ESCOGER = [
  { sku: "CN-POR-ESCOGER-ENT", etiqueta: "Entera", nombre: "Cinta entera por escoger" },
  { sku: "CN-POR-ESCOGER-9", etiqueta: "9,9", nombre: "Cinta 9,9 por escoger" },
  { sku: "CN-POR-ESCOGER-12", etiqueta: "6,12", nombre: "Cinta 6,12 por escoger" },
] as const

export function esCintaPorEscoger(
  it: { sku?: string | null } | null | undefined,
): boolean {
  return (it?.sku ?? "")
    .trim()
    .toUpperCase()
    .startsWith(PREFIJO_CINTA_POR_ESCOGER)
}

/** "Entera", "9,9", "6,12" o null si es el comodín genérico / no es comodín. */
export function medidaPorEscoger(
  it: { sku?: string | null } | null | undefined,
): string | null {
  const sku = (it?.sku ?? "").trim().toUpperCase()
  return MEDIDAS_POR_ESCOGER.find((m) => m.sku === sku)?.etiqueta ?? null
}

/** "Cinta 9,9 por escoger"… o null si es el genérico / no es comodín. */
export function nombrePorEscoger(
  it: { sku?: string | null } | null | undefined,
): string | null {
  const sku = (it?.sku ?? "").trim().toUpperCase()
  return MEDIDAS_POR_ESCOGER.find((m) => m.sku === sku)?.nombre ?? null
}

/** Piezas "por escoger" en una lista de partidas (0 si ya están todas elegidas). */
export function piezasPorEscoger(
  items: Array<{ sku?: string | null; cantidad?: number | null }>,
): number {
  return items.reduce(
    (s, it) => s + (esCintaPorEscoger(it) ? Number(it.cantidad ?? 0) : 0),
    0,
  )
}

/**
 * Desglose por medida: "5 de 9,9 · 3 de 6,12". El comodín genérico (sin medida)
 * se cuenta como "sin medida".
 */
export function desglosePorEscoger(
  items: Array<{ sku?: string | null; cantidad?: number | null }>,
): string {
  const porMedida = new Map<string, number>()
  for (const it of items) {
    if (!esCintaPorEscoger(it)) continue
    const medida = medidaPorEscoger(it) ?? "sin medida"
    porMedida.set(medida, (porMedida.get(medida) ?? 0) + Number(it.cantidad ?? 0))
  }
  return [...porMedida.entries()].map(([m, n]) => `${n} de ${m}`).join(" · ")
}

/** Aviso (no bloquea): estas piezas se cobran pero aún no descuentan stock. */
export function avisoPorEscoger(piezas: number): string {
  return (
    `${piezas} cinta${piezas === 1 ? "" : "s"} por escoger: se cobra${
      piezas === 1 ? "" : "n"
    } normal, pero no descuenta${piezas === 1 ? "" : "n"} inventario ` +
    "hasta elegir los modelos."
  )
}

/**
 * Piezas por escoger que tiene una cotización guardada (consulta). Recibe el
 * cliente de Supabase para poder usarse desde cualquier server action.
 */
export async function piezasPorEscogerEnCotizacion(
  supabase: {
    from: (t: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
  },
  cotizacionId: string,
): Promise<number> {
  const { data } = await supabase
    .from("cotizacion_items")
    .select("cantidad, productos!inner(sku)")
    .eq("cotizacion_id", cotizacionId)
    .like("productos.sku", `${PREFIJO_CINTA_POR_ESCOGER}%`)
  return ((data ?? []) as { cantidad: number }[]).reduce(
    (s, r) => s + Number(r.cantidad ?? 0),
    0,
  )
}

/**
 * IDs de los productos comodín. Sirven para apartarlos del descuento de
 * inventario (no tienen fila de stock) al crear o revertir una venta.
 */
export async function idsComodinCintas(supabase: {
  from: (t: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}): Promise<Set<string>> {
  const { data } = await supabase
    .from("productos")
    .select("id")
    .like("sku", `${PREFIJO_CINTA_POR_ESCOGER}%`)
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id))
}
