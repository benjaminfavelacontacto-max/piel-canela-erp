import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Lectura de `cotizacion_items` tolerante a migraciones pendientes.
 *
 * Las partidas fueron ganando columnas por etapas (regalos primero, descuento
 * por producto después) y la app tiene que seguir abriendo la cotización
 * aunque el SQL correspondiente no se haya corrido todavía:
 *
 *   1. completo            → regalos + descuento por producto
 *   2. sin descuento línea → falta scripts/add-descuento-por-producto.sql
 *   3. base                → falta también scripts/add-regalos-cotizaciones.sql
 *
 * Degradar de más a menos (en vez de pedir siempre lo mínimo) evita perder
 * información cuando la BD SÍ está al día.
 */

const CAMPOS_BASE = "cantidad, precio_unitario, costo_unitario, subtotal, sort_order"
const CAMPOS_REGALO = "es_regalo, precio_lista"
const CAMPOS_DESCUENTO = "descuento_tipo, descuento_valor"

export type NivelItems = "completo" | "sin-descuento-linea" | "base"

export async function fetchCotizacionItems(
  supabase: SupabaseClient,
  cotizacionId: string,
  /** Sub-select de productos, p. ej. `productos(id, sku, nombre)`. */
  productosSelect: string,
): Promise<{
  rows: unknown[] | null
  nivel: NivelItems
  error: { message?: string } | null
}> {
  const niveles: { nivel: NivelItems; campos: string[] }[] = [
    { nivel: "completo", campos: [CAMPOS_BASE, CAMPOS_REGALO, CAMPOS_DESCUENTO] },
    { nivel: "sin-descuento-linea", campos: [CAMPOS_BASE, CAMPOS_REGALO] },
    { nivel: "base", campos: [CAMPOS_BASE] },
  ]

  let ultimoError: { message?: string } | null = null
  for (const { nivel, campos } of niveles) {
    const { data, error } = await supabase
      .from("cotizacion_items")
      .select(`${campos.join(", ")}, ${productosSelect}`)
      .eq("cotizacion_id", cotizacionId)
      .order("sort_order", { ascending: true })
    if (!error) return { rows: data ?? [], nivel, error: null }
    ultimoError = error
    // Solo se degrada por columna inexistente; cualquier otro error (RLS,
    // conexión) se reporta tal cual en vez de esconderse tras un reintento.
    if (
      !/es_regalo|precio_lista|descuento_tipo|descuento_valor/.test(
        error.message ?? "",
      )
    ) {
      break
    }
  }
  return { rows: null, nivel: "base", error: ultimoError }
}
