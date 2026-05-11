"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function guardarUrlImagenProducto(
  productoId: string,
  url: string | null,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("productos")
    .update({ imagen_url: url })
    .eq("id", productoId)
  if (error) {
    console.error("[guardarUrlImagenProducto] Error:", error)
    return { success: false, error: error.message }
  }
  revalidatePath("/inventario")
  return { success: true }
}

export async function actualizarTipoCambio(nuevoTC: number) {
  if (!Number.isFinite(nuevoTC) || nuevoTC <= 0) {
    return { ok: false as const, error: "Valor inválido" }
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from("productos")
    .update({ tipo_cambio: nuevoTC })
    .not("id", "is", null)
  if (error) return { ok: false as const, error: error.message }
  revalidatePath("/inventario")
  return { ok: true as const }
}
