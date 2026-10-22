/**
 * "Cinta por escoger" — partida comodín para cotizar cintas cuando la clienta
 * todavía no decide el modelo. Es un producto real (SKU fijo, inactivo, precio
 * de cinta) para no tocar el esquema: `cotizacion_items.producto_id` es NOT NULL.
 * Alta del producto: `scripts/add-cinta-por-escoger.sql`.
 *
 * Mientras exista en una cotización NO se puede convertir en venta: no hay
 * modelo, y por tanto no hay stock que descontar. Se reemplaza por las cintas
 * reales desde "Editar" cuando la clienta elige.
 */
export const SKU_CINTA_POR_ESCOGER = "CN-POR-ESCOGER"

export function esCintaPorEscoger(
  it: { sku?: string | null } | null | undefined,
): boolean {
  return (it?.sku ?? "").trim().toUpperCase() === SKU_CINTA_POR_ESCOGER
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

export function mensajePorEscoger(piezas: number): string {
  return (
    `Hay ${piezas} cinta${piezas === 1 ? "" : "s"} por escoger. ` +
    "Elige los modelos (Editar cotización) antes de convertir a venta."
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
    .eq("productos.sku", SKU_CINTA_POR_ESCOGER)
  return ((data ?? []) as { cantidad: number }[]).reduce(
    (s, r) => s + Number(r.cantidad ?? 0),
    0,
  )
}
