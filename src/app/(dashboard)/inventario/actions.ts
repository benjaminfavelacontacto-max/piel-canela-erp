"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"

const TIPOS_PERMITIDOS = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

export async function subirImagenProducto(
  productoId: string,
  formData: FormData,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const archivo = formData.get("imagen") as File | null

  console.log(
    "[subirImagenProducto] productoId:",
    productoId,
    "archivo:",
    archivo?.name,
    archivo?.size,
    archivo?.type,
  )

  if (!archivo || archivo.size === 0) {
    return { success: false, error: "No se seleccionó archivo" }
  }
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
    return { success: false, error: "Solo JPG, PNG o WebP" }
  }
  if (archivo.size > MAX_SIZE) {
    return { success: false, error: "La imagen pesa más de 5MB" }
  }

  // File → Uint8Array (necesario para que .upload() reciba bytes reales en SA)
  const buffer = new Uint8Array(await archivo.arrayBuffer())

  const extension = (archivo.name.split(".").pop() ?? "jpg").toLowerCase()
  const nombreArchivo = `producto-${productoId}-${Date.now()}.${extension}`

  // Admin client → service role key → bypassea RLS de storage.objects
  const admin = createAdminClient()
  const { error: uploadError } = await admin.storage
    .from("productos")
    .upload(nombreArchivo, buffer, {
      contentType: archivo.type,
      upsert: true,
    })
  if (uploadError) {
    console.error("[subirImagenProducto] upload error:", uploadError)
    return { success: false, error: uploadError.message }
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("productos").getPublicUrl(nombreArchivo)

  const { error: updateError } = await admin
    .from("productos")
    .update({ imagen_url: publicUrl })
    .eq("id", productoId)
  if (updateError) {
    console.error("[subirImagenProducto] update BD error:", updateError)
    return {
      success: false,
      error: updateError.message ?? "Error guardando URL",
    }
  }

  console.log("[subirImagenProducto] OK:", publicUrl)
  revalidatePath("/inventario")
  return { success: true, url: publicUrl }
}

export async function eliminarImagenProducto(
  productoId: string,
  imagenUrl: string,
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient()

  // Extraer path después de /productos/ en la URL pública
  const idx = imagenUrl.indexOf("/productos/")
  const path = idx >= 0 ? imagenUrl.slice(idx + "/productos/".length) : null
  if (path) {
    const { error: rmError } = await admin.storage
      .from("productos")
      .remove([path])
    if (rmError) console.warn("[eliminarImagenProducto] remove warning:", rmError)
  }

  const { error } = await admin
    .from("productos")
    .update({ imagen_url: null })
    .eq("id", productoId)
  if (error) return { success: false, error: error.message }

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
