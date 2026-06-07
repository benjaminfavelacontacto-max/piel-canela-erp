"use server"

import { createAdminClient } from "@/lib/supabase/admin"
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
  costo_envio: number
  notas: string | null
  items: SaveItem[]
}

export async function saveCotizacion(input: SaveCotizacionInput) {
  const supabase = createAdminClient()

  // total y utilidad_neta son GENERATED — no se insertan. Postgres las calcula.
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
      costo_productos: input.costo_productos,
      costo_envio: input.costo_envio ?? 0,
      estatus: "borrador",
      notas: input.notas,
    })
    .select("id")
    .single()

  if (cotErr || !cot) {
    console.error("[saveCotizacion] insert cotización falló:", JSON.stringify(cotErr, null, 2))
    return {
      ok: false as const,
      error: cotErr?.message ?? "Error al crear cotización",
    }
  }

  if (input.items.length > 0) {
    // cotizacion_items.subtotal también es GENERATED — no se inserta.
    const itemsRows = input.items.map((it, i) => ({
      cotizacion_id: cot.id,
      producto_id: it.producto_id,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
      costo_unitario: it.costo_unitario,
      sort_order: i,
    }))

    const { error: itemsErr } = await supabase
      .from("cotizacion_items")
      .insert(itemsRows)

    if (itemsErr) {
      console.error("[saveCotizacion] insert items falló:", JSON.stringify(itemsErr, null, 2))
      return {
        ok: false as const,
        error: `Cotización creada pero items fallaron: ${itemsErr.message}`,
      }
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
  const supabase = createAdminClient()

  const { data: cot, error: cotErr } = await supabase
    .from("cotizaciones")
    .select(
      "numero, cliente_id, fecha, moneda, subtotal, iva, descuento, total, costo_productos, costo_envio, notas",
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

  // total / ganancia / saldo_pendiente / utilidad_neta son GENERATED — Postgres los calcula.
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
      costo_envio: cot.costo_envio ?? 0,
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

// ───────────────────────────────────────────────────────────────────
// cambiarEstatusCotizacion — cambio inline desde la lista
// ───────────────────────────────────────────────────────────────────

const ESTATUS_VALIDOS = [
  "borrador",
  "enviada",
  "aceptada",
  "rechazada",
  "vencida",
] as const
type EstatusCotizacion = (typeof ESTATUS_VALIDOS)[number]

export async function cambiarEstatusCotizacion(
  id: string,
  estatus: string,
) {
  if (!ESTATUS_VALIDOS.includes(estatus as EstatusCotizacion)) {
    return { ok: false as const, error: `Estatus inválido: ${estatus}` }
  }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("cotizaciones")
    .update({ estatus })
    .eq("id", id)
  if (error) {
    console.error(
      "[cambiarEstatusCotizacion] error:",
      JSON.stringify(error, null, 2),
    )
    return { ok: false as const, error: error.message }
  }
  revalidatePath("/cotizaciones")
  revalidatePath(`/cotizaciones/${id}`)
  return { ok: true as const }
}

// ───────────────────────────────────────────────────────────────────
// duplicarCotizacion — clona como nueva en estatus 'borrador'
// ───────────────────────────────────────────────────────────────────

export async function duplicarCotizacion(id: string) {
  const supabase = createAdminClient()
  const { data: orig, error: fetchErr } = await supabase
    .from("cotizaciones")
    .select(
      "numero, cliente_id, fecha, valida_hasta, moneda, subtotal, iva, descuento, costo_productos, costo_envio, notas",
    )
    .eq("id", id)
    .single()
  if (fetchErr || !orig) {
    console.error(
      "[duplicarCotizacion] fetch error:",
      JSON.stringify(fetchErr, null, 2),
    )
    throw new Error(fetchErr?.message ?? "Cotización no encontrada")
  }

  const newNumero = `${orig.numero}-COPIA-${Date.now().toString().slice(-6)}`
  const today = new Date().toISOString().slice(0, 10)
  const validaHasta = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })()

  const { data: cot, error: insErr } = await supabase
    .from("cotizaciones")
    .insert({
      numero: newNumero,
      cliente_id: orig.cliente_id,
      fecha: today,
      valida_hasta: validaHasta,
      moneda: orig.moneda,
      subtotal: orig.subtotal,
      iva: orig.iva,
      descuento: orig.descuento,
      costo_productos: orig.costo_productos,
      costo_envio: orig.costo_envio ?? 0,
      estatus: "borrador",
      notas: orig.notas,
    })
    .select("id")
    .single()
  if (insErr || !cot) {
    console.error(
      "[duplicarCotizacion] insert error:",
      JSON.stringify(insErr, null, 2),
    )
    throw new Error(insErr?.message ?? "No se pudo duplicar")
  }

  const { data: items, error: itemsErr } = await supabase
    .from("cotizacion_items")
    .select("producto_id, cantidad, precio_unitario, costo_unitario, sort_order")
    .eq("cotizacion_id", id)
  if (itemsErr) {
    console.error(
      "[duplicarCotizacion] items fetch error:",
      JSON.stringify(itemsErr, null, 2),
    )
  }
  if (items && items.length > 0) {
    const newItems = items.map((it) => ({
      cotizacion_id: cot.id,
      producto_id: it.producto_id,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
      costo_unitario: it.costo_unitario,
      sort_order: it.sort_order,
    }))
    const { error: insItemsErr } = await supabase
      .from("cotizacion_items")
      .insert(newItems)
    if (insItemsErr) {
      console.error(
        "[duplicarCotizacion] insert items error:",
        JSON.stringify(insItemsErr, null, 2),
      )
    }
  }

  revalidatePath("/cotizaciones")
  redirect(`/cotizaciones/${cot.id}/editar`)
}

// ───────────────────────────────────────────────────────────────────
// updateCotizacion — usado por la página de editar
// ───────────────────────────────────────────────────────────────────

export async function updateCotizacion(
  id: string,
  input: SaveCotizacionInput,
) {
  const supabase = createAdminClient()

  // total y utilidad_neta son GENERATED — Postgres los recalcula
  const { error: updErr } = await supabase
    .from("cotizaciones")
    .update({
      numero: input.numero,
      cliente_id: input.cliente_id,
      fecha: input.fecha,
      valida_hasta: input.valida_hasta,
      moneda: input.moneda,
      subtotal: input.subtotal,
      iva: input.iva,
      descuento: input.descuento,
      costo_productos: input.costo_productos,
      costo_envio: input.costo_envio ?? 0,
      notas: input.notas,
    })
    .eq("id", id)
  if (updErr) {
    console.error(
      "[updateCotizacion] update error:",
      JSON.stringify(updErr, null, 2),
    )
    return { ok: false as const, error: updErr.message }
  }

  // Reemplaza items: DELETE old, INSERT new (subtotal es GENERATED — no se envía)
  const { error: delErr } = await supabase
    .from("cotizacion_items")
    .delete()
    .eq("cotizacion_id", id)
  if (delErr) {
    console.error(
      "[updateCotizacion] delete items error:",
      JSON.stringify(delErr, null, 2),
    )
    return { ok: false as const, error: delErr.message }
  }
  if (input.items.length > 0) {
    const rows = input.items.map((it, i) => ({
      cotizacion_id: id,
      producto_id: it.producto_id,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
      costo_unitario: it.costo_unitario,
      sort_order: i,
    }))
    const { error: insErr } = await supabase
      .from("cotizacion_items")
      .insert(rows)
    if (insErr) {
      console.error(
        "[updateCotizacion] insert items error:",
        JSON.stringify(insErr, null, 2),
      )
      return { ok: false as const, error: insErr.message }
    }
  }

  revalidatePath("/cotizaciones")
  revalidatePath(`/cotizaciones/${id}`)
  return { ok: true as const, id }
}


// ─── Eliminar cotización ──────────────────────────────────────────
// Protegido: si tiene venta vinculada, regresa error y no borra nada.

export async function eliminarCotizacion(id: string) {
  const supabase = createAdminClient()

  // Verificar que no tenga venta vinculada
  const { data: venta } = await supabase
    .from("ventas")
    .select("id, numero")
    .eq("cotizacion_id", id)
    .maybeSingle()

  if (venta) {
    return {
      ok: false as const,
      error: `No se puede eliminar: tiene la venta ${venta.numero} vinculada. Elimina primero la venta.`,
    }
  }

  // Eliminar items primero (FK constraint)
  const { error: errItems } = await supabase
    .from("cotizacion_items")
    .delete()
    .eq("cotizacion_id", id)
  if (errItems) {
    return { ok: false as const, error: errItems.message }
  }

  const { error } = await supabase
    .from("cotizaciones")
    .delete()
    .eq("id", id)
  if (error) {
    return { ok: false as const, error: error.message }
  }

  revalidatePath("/cotizaciones")
  return { ok: true as const }
}

// ─── Revertir cotización vendida → borrador ────────────────────────
// Deshace un "Marcar como Vendida" hecho por error:
//  1. Restaura el inventario que se descontó (re-suma cantidades de venta_items;
//     descontar_inventario_venta no tiene RPC inversa, se hace manual).
//  2. Borra venta_socios, venta_items y la venta.
//  3. Regresa la cotización a estatus 'borrador'.
// Restaura ANTES de borrar para no perder las cantidades. Si no hay venta
// asociada (solo estatus 'aceptada'), únicamente regresa el estatus.

export async function revertirCotizacion(cotizacionId: string) {
  const supabase = createAdminClient()

  const { data: venta, error: ventaErr } = await supabase
    .from("ventas")
    .select("id, numero")
    .eq("cotizacion_id", cotizacionId)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (ventaErr) {
    return { ok: false as const, error: ventaErr.message }
  }

  if (venta) {
    // 1) Restaurar inventario desde los items de la venta
    const { data: items, error: itemsErr } = await supabase
      .from("venta_items")
      .select("producto_id, cantidad")
      .eq("venta_id", venta.id)
    if (itemsErr) {
      return { ok: false as const, error: `Items: ${itemsErr.message}` }
    }
    const byProd = new Map<string, number>()
    for (const it of items ?? []) {
      const pid = it.producto_id as string | null
      if (!pid) continue
      byProd.set(pid, (byProd.get(pid) ?? 0) + Number(it.cantidad ?? 0))
    }
    for (const [productoId, cant] of byProd) {
      if (cant <= 0) continue
      const { data: inv } = await supabase
        .from("inventario")
        .select("id, stock_actual")
        .eq("producto_id", productoId)
        .maybeSingle()
      if (inv?.id) {
        const { error } = await supabase
          .from("inventario")
          .update({ stock_actual: Number(inv.stock_actual ?? 0) + cant })
          .eq("id", inv.id)
        if (error) {
          return { ok: false as const, error: `Inventario: ${error.message}` }
        }
      } else {
        const { error } = await supabase.from("inventario").insert({
          producto_id: productoId,
          stock_actual: cant,
          stock_minimo: 0,
          stock_inicial: cant,
        })
        if (error) {
          return { ok: false as const, error: `Inventario: ${error.message}` }
        }
      }
    }

    // 2) Borrar reparto a socios, items y la venta (en ese orden por FKs)
    await supabase.from("venta_socios").delete().eq("venta_id", venta.id)
    await supabase.from("venta_items").delete().eq("venta_id", venta.id)
    const { error: delErr } = await supabase
      .from("ventas")
      .delete()
      .eq("id", venta.id)
    if (delErr) {
      return { ok: false as const, error: `Venta: ${delErr.message}` }
    }
  }

  // 3) Regresar la cotización a borrador
  const { error: updErr } = await supabase
    .from("cotizaciones")
    .update({ estatus: "borrador" })
    .eq("id", cotizacionId)
  if (updErr) {
    return { ok: false as const, error: `Estatus: ${updErr.message}` }
  }

  revalidatePath(`/cotizaciones/${cotizacionId}`)
  revalidatePath("/cotizaciones")
  revalidatePath("/ventas")
  revalidatePath("/inventario")
  revalidatePath("/")
  return {
    ok: true as const,
    ventaNumero: (venta?.numero as string | undefined) ?? null,
  }
}
