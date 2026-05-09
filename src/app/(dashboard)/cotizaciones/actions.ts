"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export type SaveItem = {
  producto_id: string
  cantidad: number
  precio_unitario: number
  costo_unitario: number
  subtotal: number
}

export type SaveCotizacionInput = {
  numero: string
  cliente_id: string | null
  fecha: string
  valida_hasta: string | null
  moneda: string
  subtotal: number
  iva: number
  descuento: number
  total: number
  costo_productos: number
  notas: string | null
  items: SaveItem[]
}

export async function saveCotizacion(input: SaveCotizacionInput) {
  const supabase = await createClient()

  const { data: cot, error: cotErr } = await supabase
    .from("cotizaciones")
    .insert({
      numero: input.numero,
      cliente_id: input.cliente_id,
      fecha: input.fecha,
      valida_hasta: input.valida_hasta,
      moneda: input.moneda,
      subtotal: input.subtotal,
      iva: input.iva,
      descuento: input.descuento,
      total: input.total,
      costo_productos: input.costo_productos,
      estatus: "borrador",
      notas: input.notas,
    })
    .select("id")
    .single()

  if (cotErr || !cot) {
    return { ok: false as const, error: cotErr?.message ?? "Error al crear cotización" }
  }

  if (input.items.length > 0) {
    const itemsRows = input.items.map((it, i) => ({
      cotizacion_id: cot.id,
      producto_id: it.producto_id,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
      costo_unitario: it.costo_unitario,
      subtotal: it.subtotal,
      sort_order: i,
    }))

    const { error: itemsErr } = await supabase
      .from("cotizacion_items")
      .insert(itemsRows)

    if (itemsErr) {
      return { ok: false as const, error: `Cotización creada pero items fallaron: ${itemsErr.message}` }
    }
  }

  revalidatePath("/cotizaciones")
  return { ok: true as const, id: cot.id as string }
}

export async function saveCotizacionAndRedirect(input: SaveCotizacionInput) {
  const result = await saveCotizacion(input)
  if (!result.ok) return result
  redirect(`/cotizaciones/${result.id}`)
}

/**
 * Marca una cotización como vendida:
 * 1. Crea una venta espejo (mismos campos que cotización + cotizacion_id).
 * 2. Copia los items a venta_items.
 * 3. Llama RPC descontar_inventario_venta(venta_id).
 * 4. Marca la cotización como 'aceptada'.
 *
 * NOTA: Asume que `ventas` y `venta_items` reflejan el shape de cotizaciones/cotizacion_items.
 * Si tu schema difiere, este insert va a fallar y debes ajustar los campos.
 */
export async function marcarVendida(cotizacionId: string) {
  const supabase = await createClient()

  const { data: cot, error: cotErr } = await supabase
    .from("cotizaciones")
    .select(
      "numero, cliente_id, fecha, moneda, subtotal, iva, descuento, total, costo_productos, notas",
    )
    .eq("id", cotizacionId)
    .single()

  if (cotErr || !cot) {
    return { ok: false as const, error: cotErr?.message ?? "Cotización no encontrada" }
  }

  const { data: items, error: itemsErr } = await supabase
    .from("cotizacion_items")
    .select("producto_id, cantidad, precio_unitario, costo_unitario, subtotal, sort_order")
    .eq("cotizacion_id", cotizacionId)
    .order("sort_order", { ascending: true })

  if (itemsErr) {
    return { ok: false as const, error: itemsErr.message }
  }

  // total / ganancia / saldo_pendiente son GENERATED — Postgres los calcula.
  const { data: venta, error: ventaErr } = await supabase
    .from("ventas")
    .insert({
      numero: cot.numero,
      cliente_id: cot.cliente_id,
      fecha: new Date().toISOString().slice(0, 10),
      moneda: cot.moneda,
      subtotal: cot.subtotal,
      iva: cot.iva,
      descuento: cot.descuento,
      costo_productos: cot.costo_productos,
      notas: cot.notas,
      cotizacion_id: cotizacionId,
    })
    .select("id")
    .single()

  if (ventaErr || !venta) {
    return {
      ok: false as const,
      error: `No se pudo crear la venta: ${ventaErr?.message ?? "desconocido"}`,
    }
  }

  if (items && items.length > 0) {
    const ventaItems = items.map((it) => ({
      venta_id: venta.id,
      producto_id: it.producto_id,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
      costo_unitario: it.costo_unitario,
      subtotal: it.subtotal,
      sort_order: it.sort_order,
    }))
    const { error: ventaItemsErr } = await supabase
      .from("venta_items")
      .insert(ventaItems)
    if (ventaItemsErr) {
      return {
        ok: false as const,
        error: `Venta creada pero items fallaron: ${ventaItemsErr.message}`,
      }
    }
  }

  const { error: rpcErr } = await supabase.rpc("descontar_inventario_venta", {
    venta_id: venta.id,
  })
  if (rpcErr) {
    return {
      ok: false as const,
      error: `Venta creada pero descuento de inventario falló: ${rpcErr.message}`,
    }
  }

  const { error: updErr } = await supabase
    .from("cotizaciones")
    .update({ estatus: "aceptada" })
    .eq("id", cotizacionId)

  if (updErr) {
    return {
      ok: false as const,
      error: `Inventario descontado pero estatus no se actualizó: ${updErr.message}`,
    }
  }

  revalidatePath(`/cotizaciones/${cotizacionId}`)
  revalidatePath("/cotizaciones")
  revalidatePath("/")
  revalidatePath("/inventario")

  return { ok: true as const, ventaId: venta.id as string }
}
