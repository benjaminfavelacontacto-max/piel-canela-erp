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

export type ProductoEditPayload = {
  nombre_display?: string | null
  peso?: string | null
  precio_publico?: number | null
  precio_usd?: number | null
  costo_envio_usd?: number | null
  costo_envio_mxn?: number | null
  tipo_cambio?: number | null
  stock_actual?: number | null
  stock_minimo?: number | null
}

/**
 * Edita un producto del inventario escribiendo en las 3 tablas base:
 *  - productos        → nombre_display, peso, precio_usd, costo_envio_usd/mxn, tipo_cambio
 *  - inventario       → stock_actual, stock_minimo (+ estatus recalculado)
 *  - precios_producto → precio (lista 'Pública MXN')
 * La vista_inventario recalcula los campos derivados al revalidar.
 */
export async function actualizarProducto(
  productoId: string,
  data: ProductoEditPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!productoId) return { ok: false, error: "Falta el id del producto" }
  const admin = createAdminClient()

  // 1) Tabla productos (campos directos)
  const prodPatch: Record<string, unknown> = {}
  if ("nombre_display" in data)
    prodPatch.nombre_display = data.nombre_display?.trim() || null
  if ("peso" in data) prodPatch.peso = data.peso?.trim() || null
  if ("precio_usd" in data) prodPatch.precio_usd = data.precio_usd
  if ("costo_envio_usd" in data) prodPatch.costo_envio_usd = data.costo_envio_usd
  if ("costo_envio_mxn" in data) prodPatch.costo_envio_mxn = data.costo_envio_mxn
  if ("tipo_cambio" in data) prodPatch.tipo_cambio = data.tipo_cambio
  if (Object.keys(prodPatch).length > 0) {
    const { error } = await admin
      .from("productos")
      .update(prodPatch)
      .eq("id", productoId)
    if (error) return { ok: false, error: `productos: ${error.message}` }
  }

  // 2) Tabla inventario (stock) — 1 fila por producto. Recalcula estatus.
  if ("stock_actual" in data || "stock_minimo" in data) {
    const { data: invRow } = await admin
      .from("inventario")
      .select("id, stock_actual, stock_minimo")
      .eq("producto_id", productoId)
      .maybeSingle()
    const stockActual =
      "stock_actual" in data
        ? Math.max(0, Math.round(Number(data.stock_actual ?? 0)))
        : Number(invRow?.stock_actual ?? 0)
    const stockMinimo =
      "stock_minimo" in data
        ? Math.max(0, Math.round(Number(data.stock_minimo ?? 0)))
        : Number(invRow?.stock_minimo ?? 0)
    const estatus =
      stockActual <= 0 ? "agotado" : stockActual <= stockMinimo ? "bajo" : "ok"
    const invPatch = { stock_actual: stockActual, stock_minimo: stockMinimo, estatus }
    if (invRow?.id) {
      const { error } = await admin
        .from("inventario")
        .update(invPatch)
        .eq("id", invRow.id)
      if (error) return { ok: false, error: `inventario: ${error.message}` }
    } else {
      const { error } = await admin
        .from("inventario")
        .insert({ producto_id: productoId, ...invPatch })
      if (error) return { ok: false, error: `inventario: ${error.message}` }
    }
  }

  // 3) precios_producto (precio público — lista 'Pública MXN')
  if ("precio_publico" in data) {
    const { data: lista } = await admin
      .from("listas_precios")
      .select("id")
      .eq("nombre", "Pública MXN")
      .maybeSingle()
    const listaId = lista?.id as string | undefined
    if (listaId) {
      const { data: precioRow } = await admin
        .from("precios_producto")
        .select("id")
        .eq("producto_id", productoId)
        .eq("lista_id", listaId)
        .maybeSingle()
      if (precioRow?.id) {
        const { error } = await admin
          .from("precios_producto")
          .update({ precio: data.precio_publico })
          .eq("id", precioRow.id)
        if (error) return { ok: false, error: `precio: ${error.message}` }
      } else if (data.precio_publico != null) {
        const { error } = await admin
          .from("precios_producto")
          .insert({
            producto_id: productoId,
            lista_id: listaId,
            precio: data.precio_publico,
          })
        if (error) return { ok: false, error: `precio: ${error.message}` }
      }
    }
  }

  revalidatePath("/inventario")
  return { ok: true }
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
