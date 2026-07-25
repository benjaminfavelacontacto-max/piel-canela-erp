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
  // costo_envio_mxn NO se escribe: vista_inventario lo deriva = costo_envio_usd × tipo_cambio
  if ("costo_envio_usd" in data) prodPatch.costo_envio_usd = data.costo_envio_usd
  if ("tipo_cambio" in data) prodPatch.tipo_cambio = data.tipo_cambio
  if (Object.keys(prodPatch).length > 0) {
    const { error } = await admin
      .from("productos")
      .update(prodPatch)
      .eq("id", productoId)
    if (error) return { ok: false, error: `productos: ${error.message}` }
  }

  // 2) Tabla inventario (stock) — 1 fila por producto.
  // OJO: inventario.estatus es GENERATED (la BD lo recalcula desde el stock) —
  // NUNCA escribirla, igual que ventas.total.
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
    const invPatch = { stock_actual: stockActual, stock_minimo: stockMinimo }
    if (invRow?.id) {
      const { error } = await admin
        .from("inventario")
        .update(invPatch)
        .eq("id", invRow.id)
      if (error) return { ok: false, error: `inventario: ${error.message}` }
    } else {
      // Fila nueva: stock_inicial es NOT NULL → lo igualamos al stock actual.
      const { error } = await admin
        .from("inventario")
        .insert({
          producto_id: productoId,
          stock_inicial: stockActual,
          ...invPatch,
        })
      if (error) return { ok: false, error: `inventario: ${error.message}` }
    }

    // Bitácora del ajuste manual (tabla de scripts/ajustes-inventario.sql).
    // La auditoría 2026-07-25 no pudo distinguir ajustes legítimos de errores
    // porque las ediciones de stock no dejaban rastro. No-fatal a propósito:
    // si la tabla aún no existe, la edición no debe romperse — sólo se avisa
    // en el log del servidor.
    const stockAnterior = Number(invRow?.stock_actual ?? 0)
    if ("stock_actual" in data && stockAnterior !== stockActual) {
      const { error: logErr } = await admin.from("ajustes_inventario").insert({
        producto_id: productoId,
        stock_antes: stockAnterior,
        stock_despues: stockActual,
        origen: "edicion_manual",
      })
      if (logErr)
        console.error(
          "[actualizarProducto] bitácora ajustes_inventario (¿falta aplicar scripts/ajustes-inventario.sql?):",
          logErr.message,
        )
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
            vigente_desde: new Date().toISOString().slice(0, 10), // NOT NULL
          })
        if (error) return { ok: false, error: `precio: ${error.message}` }
      }
    }
  }

  revalidatePath("/inventario")
  return { ok: true }
}

export type ProductoCreatePayload = {
  sku: string
  nombre: string
  nombre_display?: string | null
  peso?: string | null
  categoria_id: string
  proveedor_id?: string | null
  precio_publico?: number | null
  precio_usd?: number | null
  costo_envio_usd?: number | null
  tipo_cambio?: number | null
  stock_actual?: number | null
  stock_minimo?: number | null
}

/**
 * Crea un producto nuevo desde cero: fila en `productos` + `inventario`
 * (+ `precios_producto` si se da precio público). costo_envio_mxn NO se escribe
 * (vista_inventario lo deriva = costo_envio_usd × tipo_cambio).
 */
export async function crearProducto(
  data: ProductoCreatePayload,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const sku = data.sku?.trim()
  const nombre = data.nombre?.trim()
  if (!sku) return { ok: false, error: "El SKU es obligatorio" }
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" }
  if (!data.categoria_id) return { ok: false, error: "La categoría es obligatoria" }

  const admin = createAdminClient()

  // SKU único
  const { data: dup } = await admin
    .from("productos")
    .select("id")
    .eq("sku", sku)
    .maybeSingle()
  if (dup?.id) return { ok: false, error: `Ya existe un producto con SKU "${sku}"` }

  // costo (NOT NULL) = costo landed en MXN = (precio + envío) × TC
  const tc = data.tipo_cambio ?? 0
  const costo = ((data.precio_usd ?? 0) + (data.costo_envio_usd ?? 0)) * tc

  // 1) productos
  const { data: created, error: prodErr } = await admin
    .from("productos")
    .insert({
      sku,
      nombre,
      nombre_display: data.nombre_display?.trim() || nombre,
      peso: data.peso?.trim() || null,
      categoria_id: data.categoria_id,
      proveedor_id: data.proveedor_id || null,
      precio_usd: data.precio_usd ?? null,
      costo_envio_usd: data.costo_envio_usd ?? null,
      tipo_cambio: data.tipo_cambio ?? null,
      costo,
      activo: true,
    })
    .select("id")
    .single()
  if (prodErr || !created) {
    return { ok: false, error: `productos: ${prodErr?.message ?? "no se pudo crear"}` }
  }
  const productoId = created.id as string

  // 2) inventario — stock_inicial NOT NULL, estatus GENERATED (no escribir)
  const stockActual = Math.max(0, Math.round(Number(data.stock_actual ?? 0)))
  const stockMinimo = Math.max(0, Math.round(Number(data.stock_minimo ?? 0)))
  const { error: invErr } = await admin.from("inventario").insert({
    producto_id: productoId,
    stock_actual: stockActual,
    stock_minimo: stockMinimo,
    stock_inicial: stockActual,
  })
  if (invErr) return { ok: false, error: `inventario: ${invErr.message}` }

  // 3) precio público (lista 'Pública MXN')
  if (data.precio_publico != null) {
    const { data: lista } = await admin
      .from("listas_precios")
      .select("id")
      .eq("nombre", "Pública MXN")
      .maybeSingle()
    if (lista?.id) {
      const { error: precioErr } = await admin.from("precios_producto").insert({
        producto_id: productoId,
        lista_id: lista.id,
        precio: data.precio_publico,
        vigente_desde: new Date().toISOString().slice(0, 10), // NOT NULL
      })
      if (precioErr) return { ok: false, error: `precio: ${precioErr.message}` }
    }
  }

  revalidatePath("/inventario")
  return { ok: true, id: productoId }
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
