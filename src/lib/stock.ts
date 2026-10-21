import { createAdminClient } from "@/lib/supabase/admin"

type Admin = ReturnType<typeof createAdminClient>

export type FaltanteStock = {
  producto_id: string
  nombre: string
  sku: string | null
  pide: number
  hay: number
}

/**
 * Compara las cantidades pedidas contra `inventario.stock_actual`.
 *
 * - Consolida partidas repetidas del mismo producto.
 * - Sin fila de inventario = 0 existencias (igual que asume la RPC).
 *
 * Es la validación de servidor previa a `descontar_inventario_venta`: la RPC
 * NO valida existencias (deja el stock en negativo), así que sin este paso la
 * única barrera era visual — ver auditoría de inventario 2026-07-25.
 */
export async function faltantesDeStock(
  admin: Admin,
  items: { producto_id: string | null; cantidad: number }[],
): Promise<FaltanteStock[]> {
  const porProducto = new Map<string, number>()
  for (const it of items) {
    if (!it.producto_id) continue
    porProducto.set(
      it.producto_id,
      (porProducto.get(it.producto_id) ?? 0) + Number(it.cantidad ?? 0),
    )
  }
  const ids = [...porProducto.keys()]
  if (ids.length === 0) return []

  const [{ data: inv }, { data: prods }] = await Promise.all([
    admin
      .from("inventario")
      .select("producto_id, stock_actual")
      .in("producto_id", ids),
    admin
      .from("productos")
      .select("id, nombre, nombre_display, sku")
      .in("id", ids),
  ])
  const stockBy = new Map(
    (inv ?? []).map((r) => [r.producto_id as string, Number(r.stock_actual ?? 0)]),
  )
  type Prod = { id: string; nombre: string; nombre_display: string | null; sku: string | null }
  const prodBy = new Map(((prods ?? []) as Prod[]).map((p) => [p.id, p]))

  const out: FaltanteStock[] = []
  for (const [pid, pide] of porProducto) {
    const hay = stockBy.get(pid) ?? 0
    if (hay >= pide) continue
    const p = prodBy.get(pid)
    out.push({
      producto_id: pid,
      nombre: p?.nombre_display ?? p?.nombre ?? "Producto",
      sku: p?.sku ?? null,
      pide,
      hay,
    })
  }
  return out
}

/** Texto legible para toasts/errores: "Café Fit [AC-850-CF]: pide 4, hay 0 · …" */
export function describirFaltantes(faltantes: FaltanteStock[]): string {
  return faltantes
    .map((f) => `${f.nombre}${f.sku ? ` [${f.sku}]` : ""}: pide ${f.pide}, hay ${f.hay}`)
    .join(" · ")
}
