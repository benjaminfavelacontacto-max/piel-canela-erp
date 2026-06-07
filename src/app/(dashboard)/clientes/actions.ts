"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"

export type ClienteInput = {
  nombre: string
  nombre_negocio: string | null
  tipo: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  colonia: string | null
  codigo_postal: string | null
  ciudad: string | null
  estado: string | null
  pais: string | null
  rfc: string | null
  redes_sociales: Record<string, string> | null
  vendedor_socio_id: string | null
  metodo_pago_pref: string | null
  notas: string | null
  activo?: boolean
}

export async function saveCliente(input: ClienteInput) {
  if (!input.nombre.trim()) {
    return { ok: false as const, error: "El nombre es requerido" }
  }
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("clientes")
    .insert({
      nombre: input.nombre.trim(),
      nombre_negocio: input.nombre_negocio?.trim() || null,
      tipo: input.tipo || "particular",
      telefono: input.telefono?.trim() || null,
      email: input.email?.trim() || null,
      direccion: input.direccion?.trim() || null,
      colonia: input.colonia?.trim() || null,
      codigo_postal: input.codigo_postal?.trim() || null,
      ciudad: input.ciudad?.trim() || null,
      estado: input.estado?.trim() || null,
      pais: input.pais?.trim() || "México",
      rfc: input.rfc?.trim() || null,
      redes_sociales: input.redes_sociales ?? {},
      vendedor_socio_id: input.vendedor_socio_id || null,
      metodo_pago_pref: input.metodo_pago_pref?.trim() || null,
      notas: input.notas?.trim() || null,
      activo: input.activo ?? true,
    })
    .select("id")
    .single()
  if (error || !data) {
    return { ok: false as const, error: error?.message ?? "Error al guardar" }
  }
  revalidatePath("/clientes")
  return { ok: true as const, id: data.id as string }
}

export async function updateCliente(id: string, input: ClienteInput) {
  if (!input.nombre.trim()) {
    return { ok: false as const, error: "El nombre es requerido" }
  }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("clientes")
    .update({
      nombre: input.nombre.trim(),
      nombre_negocio: input.nombre_negocio?.trim() || null,
      tipo: input.tipo || "particular",
      telefono: input.telefono?.trim() || null,
      email: input.email?.trim() || null,
      direccion: input.direccion?.trim() || null,
      colonia: input.colonia?.trim() || null,
      codigo_postal: input.codigo_postal?.trim() || null,
      ciudad: input.ciudad?.trim() || null,
      estado: input.estado?.trim() || null,
      pais: input.pais?.trim() || "México",
      rfc: input.rfc?.trim() || null,
      redes_sociales: input.redes_sociales ?? {},
      vendedor_socio_id: input.vendedor_socio_id || null,
      metodo_pago_pref: input.metodo_pago_pref?.trim() || null,
      notas: input.notas?.trim() || null,
      activo: input.activo ?? true,
    })
    .eq("id", id)
  if (error) return { ok: false as const, error: error.message }
  revalidatePath("/clientes")
  revalidatePath(`/clientes/${id}`)
  return { ok: true as const, id }
}

// Cliente interno Piel Canela — nunca se elimina (descuenta inventario propio).
const INTERNAL_CLIENTE_ID = "08449791-0fab-4bfb-818f-b9dbf077c879"

export type DeleteClienteResult =
  | { ok: true }
  | {
      ok: false
      error: string
      blocked?: "ventas" | "internal"
      needsConfirm?: boolean
      ventas?: number
      cotizaciones?: number
    }

/**
 * Elimina un cliente.
 * - Si tiene VENTAS → bloqueado (registros financieros: afectan ROI/KPIs). Sugiere desactivar.
 * - Si tiene COTIZACIONES → requiere `force=true`; se borran en cascada (items → cotizaciones).
 * - El cliente interno Piel Canela nunca se elimina.
 */
export async function deleteCliente(
  id: string,
  force = false,
): Promise<DeleteClienteResult> {
  if (id === INTERNAL_CLIENTE_ID) {
    return {
      ok: false,
      blocked: "internal",
      error:
        "Piel Canela es el cliente interno del sistema; no se puede eliminar.",
    }
  }
  const supabase = createAdminClient()
  const [ventasCount, cotsCount] = await Promise.all([
    supabase
      .from("ventas")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", id),
    supabase
      .from("cotizaciones")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", id),
  ])
  const nVentas = ventasCount.count ?? 0
  const nCots = cotsCount.count ?? 0

  // Ventas = registros financieros. Nunca se borran en cascada.
  if (nVentas > 0) {
    return {
      ok: false,
      blocked: "ventas",
      ventas: nVentas,
      cotizaciones: nCots,
      error: `Tiene ${nVentas} ${nVentas === 1 ? "venta" : "ventas"} registradas (afectan reportes financieros). Desactívalo, o elimina/reasigna esas ventas primero.`,
    }
  }

  // Cotizaciones: se borran en cascada pero requieren confirmación explícita.
  if (nCots > 0 && !force) {
    return {
      ok: false,
      needsConfirm: true,
      ventas: 0,
      cotizaciones: nCots,
      error: `Tiene ${nCots} ${nCots === 1 ? "cotización" : "cotizaciones"}.`,
    }
  }

  // Cascada: cotizacion_items → cotizaciones → cliente
  if (nCots > 0) {
    const { data: cots } = await supabase
      .from("cotizaciones")
      .select("id")
      .eq("cliente_id", id)
    const cotIds = (cots ?? []).map((c) => c.id as string)
    if (cotIds.length) {
      const delItems = await supabase
        .from("cotizacion_items")
        .delete()
        .in("cotizacion_id", cotIds)
      if (delItems.error) return { ok: false, error: delItems.error.message }
    }
    const delCots = await supabase
      .from("cotizaciones")
      .delete()
      .eq("cliente_id", id)
    if (delCots.error) return { ok: false, error: delCots.error.message }
  }

  const { error } = await supabase.from("clientes").delete().eq("id", id)
  if (error) return { ok: false, error: error.message }
  revalidatePath("/clientes")
  revalidatePath("/cotizaciones")
  return { ok: true }
}

/**
 * Activa/desactiva un cliente (soft-delete). Alternativa a eliminar cuando
 * tiene ventas que no se pueden borrar.
 */
export async function setClienteActivo(id: string, activo: boolean) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("clientes")
    .update({ activo })
    .eq("id", id)
  if (error) return { ok: false as const, error: error.message }
  revalidatePath("/clientes")
  revalidatePath(`/clientes/${id}`)
  return { ok: true as const }
}

/**
 * Fusiona el cliente `sourceId` dentro de `targetId`:
 * - Re-apunta ventas y cotizaciones del source al target
 * - Borra el source
 * Útil para limpiar duplicados.
 */
export async function mergeClientes(sourceId: string, targetId: string) {
  if (sourceId === targetId) {
    return { ok: false as const, error: "No puedes fusionar un cliente con sí mismo" }
  }
  const supabase = createAdminClient()
  const v = await supabase
    .from("ventas")
    .update({ cliente_id: targetId })
    .eq("cliente_id", sourceId)
  if (v.error) return { ok: false as const, error: v.error.message }
  const c = await supabase
    .from("cotizaciones")
    .update({ cliente_id: targetId })
    .eq("cliente_id", sourceId)
  if (c.error) return { ok: false as const, error: c.error.message }
  const d = await supabase.from("clientes").delete().eq("id", sourceId)
  if (d.error) return { ok: false as const, error: d.error.message }
  revalidatePath("/clientes")
  revalidatePath("/ventas")
  revalidatePath("/cotizaciones")
  return { ok: true as const }
}

/**
 * Actualiza únicamente el campo `tipo` de un cliente.
 * Usado por la edición inline desde la tabla.
 */
export async function actualizarTipoCliente(id: string, tipo: string) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("clientes")
    .update({ tipo })
    .eq("id", id)
  if (error) {
    return { ok: false as const, error: error.message }
  }
  revalidatePath("/clientes")
  return { ok: true as const }
}

/**
 * Búsqueda fuzzy de clientes similares (usa pg_trgm).
 * Útil para advertir duplicados durante captura.
 */
export async function findSimilarClientes(
  query: string,
  excludeId?: string,
): Promise<
  Array<{ id: string; nombre: string; nombre_negocio: string | null; rfc: string | null }>
> {
  if (!query || query.trim().length < 3) return []
  const supabase = createAdminClient()
  const q = query.trim().toLowerCase()
  // ilike más fuzzy via or — búsqueda en nombre, nombre_negocio, rfc
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nombre, nombre_negocio, rfc")
    .or(
      `nombre.ilike.%${q}%,nombre_negocio.ilike.%${q}%,rfc.ilike.%${q}%`,
    )
    .limit(5)
  if (error || !data) return []
  return data.filter((c) => c.id !== excludeId)
}
