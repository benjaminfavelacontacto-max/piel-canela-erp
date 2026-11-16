import { createClient } from "@/lib/supabase/server"
import { buildProductoImageUrl } from "@/lib/storage-images"
import type { ProductoCinta } from "@/lib/cintas-modelos"
import { CotejarView } from "./cotejar-view"

export const dynamic = "force-dynamic"

export type ProductoCotejo = ProductoCinta & { stock: number }

/**
 * Cotejo (reconteo) de las cintas: lista cada modelo con el stock que el sistema cree
 * tener por presentación (entera / 9/9 / 6/12) para compararlo con el conteo real.
 */
export default async function CotejarInventarioPage() {
  const supabase = await createClient() // service role (bypassa RLS)

  const [prodRes, invRes] = await Promise.all([
    supabase
      .from("productos")
      .select("id, sku, nombre, nombre_display, imagen_url, categoria_id, activo")
      .like("sku", "CN-%")
      .eq("activo", true),
    supabase.from("inventario").select("producto_id, stock_actual"),
  ])

  const stockPorProducto = new Map<string, number>(
    ((invRes.data ?? []) as { producto_id: string; stock_actual: number | null }[]).map((r) => [
      r.producto_id,
      Number(r.stock_actual ?? 0),
    ]),
  )

  const productos: ProductoCotejo[] = (
    (prodRes.data ?? []) as {
      id: string
      sku: string | null
      nombre: string
      nombre_display: string | null
      imagen_url: string | null
      activo: boolean | null
    }[]
  ).map((p) => ({
    id: p.id,
    sku: p.sku,
    nombre: p.nombre,
    nombre_display: p.nombre_display,
    // Aquí sí se pasa la URL completa: el cliente solo la pinta.
    imagen_url: buildProductoImageUrl(p.imagen_url),
    activo: p.activo ?? true,
    stock: stockPorProducto.get(p.id) ?? 0,
  }))

  return <CotejarView productos={productos} error={prodRes.error?.message ?? null} />
}
