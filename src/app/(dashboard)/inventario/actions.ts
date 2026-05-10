"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const TIPOS_PERMITIDOS = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]
const MAX_SIZE = 5 * 1024 * 1024

export async function subirImagenProducto(
  productoId: string,
  formData: FormData,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = await createClient()
  const archivo = formData.get("imagen") as File | null
  if (!archivo || archivo.size === 0) {
    return { success: false, error: "No se seleccionó archivo" }
  }
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
    return { success: false, error: "Solo JPG, PNG o WebP" }
  }
  if (archivo.size > MAX_SIZE) {
    return { success: false, error: "La imagen pesa más de 5MB" }
  }

  const extension = (archivo.name.split(".").pop() ?? "jpg").toLowerCase()
  const nombreArchivo = `${productoId}-${Date.now()}.${extension}`

  // Admin client → bypass RLS en Storage (no requiere políticas auth)
  const admin = createAdminClient()
  const { error: uploadError } = await admin.storage
    .from("productos")
    .upload(nombreArchivo, archivo, {
      upsert: true,
      contentType: archivo.type,
    })
  if (uploadError) {
    console.error("[subirImagenProducto] upload error:", uploadError)
    return { success: false, error: uploadError.message }
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("productos").getPublicUrl(nombreArchivo)

  const { error: updateError } = await supabase
    .from("productos")
    .update({ imagen_url: publicUrl })
    .eq("id", productoId)
  if (updateError) {
    return {
      success: false,
      error: updateError.message ?? "Error guardando URL",
    }
  }

  revalidatePath("/inventario")
  return { success: true, url: publicUrl }
}

export async function eliminarImagenProducto(
  productoId: string,
  imagenUrl: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const admin = createAdminClient()

  // Extraer path después de /productos/
  const idx = imagenUrl.indexOf("/productos/")
  const path = idx >= 0 ? imagenUrl.slice(idx + "/productos/".length) : null
  if (path) {
    await admin.storage.from("productos").remove([path])
  }
  const { error } = await supabase
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
