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

export async function deleteCliente(id: string) {
  const supabase = createAdminClient()
  // Verificar que no tenga ventas/cotizaciones asociadas
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
  if ((ventasCount.count ?? 0) > 0 || (cotsCount.count ?? 0) > 0) {
    return {
      ok: false as const,
      error: `Cliente tiene ${ventasCount.count ?? 0} ventas y ${cotsCount.count ?? 0} cotizaciones. Fusiona primero o desactívalo.`,
    }
  }
  const { error } = await supabase.from("clientes").delete().eq("id", id)
  if (error) return { ok: false as const, error: error.message }
  revalidatePath("/clientes")
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
