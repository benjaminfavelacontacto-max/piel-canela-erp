import { createAdminClient } from "./supabase/admin"

/**
 * Fetch the set of cliente_ids marked as is_internal = true.
 * Used to exclude internal "Piel Canela" movements from financial KPIs.
 *
 * Reglas:
 * - SÍ aparecen en lista de cotizaciones (con badge "Interno")
 * - NO se cuentan en totales de ventas, KPIs financieros, ROI socios,
 *   ticket promedio, estadísticas de clientes, conversiones reales.
 */
export async function getInternalClienteIds(): Promise<Set<string>> {
  const sb = createAdminClient()
  const { data } = await sb
    .from("clientes")
    .select("id")
    .eq("is_internal", true)
  return new Set((data ?? []).map((c) => c.id as string))
}

export function isInternal(
  cliente_id: string | null | undefined,
  internalIds: Set<string>,
): boolean {
  return !!cliente_id && internalIds.has(cliente_id)
}
