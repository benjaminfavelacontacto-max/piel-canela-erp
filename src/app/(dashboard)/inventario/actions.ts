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
): Promise<{ success: boolean; filename?: string; error?: string }> {
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

  // File → Uint8Array (Server Actions necesitan bytes reales)
  const buffer = new Uint8Array(await archivo.arrayBuffer())

  const extension = (archivo.name.split(".").pop() ?? "jpg").toLowerCase()
  const nombreArchivo = `producto-${productoId}-${Date.now()}.${extension}`

  const admin = createAdminClient()

  // Borrar imagen previa del bucket (si existe) para no acumular huérfanos
  const { data: prev } = await admin
    .from("productos")
    .select("imagen_url")
    .eq("id", productoId)
    .maybeSingle()
  const prevFilename = prev?.imagen_url as string | null | undefined
  if (prevFilename && !prevFilename.startsWith("http")) {
    await admin.storage.from("productos").remove([prevFilename])
  }

  // Upload nuevo
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

  // IMPORTANTE: BD guarda SOLO el filename. `buildProductoImageUrl()` en
  // src/lib/storage-images.ts antepone el prefijo público al renderizar.
  const { error: updateError } = await admin
    .from("productos")
    .update({ imagen_url: nombreArchivo })
    .eq("id", productoId)
  if (updateError) {
    console.error("[subirImagenProducto] update BD error:", updateError)
    return {
      success: false,
      error: updateError.message ?? "Error guardando URL",
    }
  }

  console.log("[subirImagenProducto] OK:", nombreArchivo)
  revalidatePath("/inventario")
  return { success: true, filename: nombreArchivo }
}

export async function eliminarImagenProducto(
  productoId: string,
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient()

  // Leer filename actual de BD
  const { data: row } = await admin
    .from("productos")
    .select("imagen_url")
    .eq("id", productoId)
    .maybeSingle()
  const filename = row?.imagen_url as string | null | undefined

  if (filename && !filename.startsWith("http")) {
    const { error: rmError } = await admin.storage
      .from("productos")
      .remove([filename])
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
