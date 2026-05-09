"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export type SaveVentaInput = {
  numero: string
  cotizacion_id: string | null
  cliente_id: string
  fecha: string
  subtotal: number
  iva: number
  descuento: number
  total: number
  costo_productos: number
  costo_envio: number
  cantidad_pagada: number
  metodo_pago: "transferencia" | "efectivo" | "tarjeta"
  notas: string
}

function buildNotas(metodo: string, notas: string): string {
  const tag = `Método: ${metodo}.`
  if (!notas.trim()) return tag
  return `${tag} ${notas.trim()}`
}

function estatusFor(
  total: number,
  pagado: number,
): "pendiente" | "pagada_parcial" | "pagada_total" {
  if (pagado <= 0) return "pendiente"
  if (pagado >= total) return "pagada_total"
  return "pagada_parcial"
}

export async function saveVenta(input: SaveVentaInput) {
  const supabase = await createClient()

  // total, ganancia y saldo_pendiente son columnas GENERATED — Postgres las calcula.
  const estatus = estatusFor(input.total, input.cantidad_pagada)

  const { data: venta, error: ventaErr } = await supabase
    .from("ventas")
    .insert({
      numero: input.numero,
      cotizacion_id: input.cotizacion_id,
      cliente_id: input.cliente_id,
      fecha: input.fecha,
      moneda: "MXN",
      subtotal: input.subtotal,
      iva: input.iva,
      descuento: input.descuento,
      costo_productos: input.costo_productos,
      costo_envio: input.costo_envio,
      cantidad_pagada: input.cantidad_pagada,
      estatus,
      notas: buildNotas(input.metodo_pago, input.notas),
      inventario_descontado: false,
    })
    .select("id")
    .single()

  if (ventaErr || !venta) {
    return { ok: false as const, error: ventaErr?.message ?? "Error al crear venta" }
  }

  if (input.cotizacion_id) {
    const { data: cotItems, error: cotErr } = await supabase
      .from("cotizacion_items")
      .select("producto_id, cantidad, precio_unitario, costo_unitario, subtotal, sort_order")
      .eq("cotizacion_id", input.cotizacion_id)
      .order("sort_order", { ascending: true })

    if (cotErr) {
      return { ok: false as const, error: `Venta creada pero items fallaron: ${cotErr.message}` }
    }

    if (cotItems && cotItems.length > 0) {
      const ventaItems = cotItems.map((it) => ({
        venta_id: venta.id,
        producto_id: it.producto_id,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        costo_unitario: it.costo_unitario,
        subtotal: it.subtotal,
        costo_total: Number(it.costo_unitario) * Number(it.cantidad),
        sort_order: it.sort_order,
      }))

      const { error: itemsErr } = await supabase.from("venta_items").insert(ventaItems)
      if (itemsErr) {
        return {
          ok: false as const,
          error: `Venta creada pero items fallaron: ${itemsErr.message}`,
        }
      }
    }
  }

  // Refetch socios at save time so the client cannot tamper with porcentajes
  const { data: socios, error: sociosErr } = await supabase
    .from("socios")
    .select("id, porcentaje")
    .eq("activo", true)

  if (sociosErr) {
    return {
      ok: false as const,
      error: `Venta creada pero socios fallaron: ${sociosErr.message}`,
    }
  }

  if (socios && socios.length > 0) {
    const ventaSocios = socios.map((s) => ({
      venta_id: venta.id,
      socio_id: s.id,
      monto: Number(((input.total * Number(s.porcentaje)) / 100).toFixed(2)),
      concepto: `Comisión venta ${input.numero}`,
      pagado: false,
      fecha_pago: null,
    }))

    const { error: vsErr } = await supabase.from("venta_socios").insert(ventaSocios)
    if (vsErr) {
      return {
        ok: false as const,
        error: `Venta creada pero distribución de socios falló: ${vsErr.message}`,
      }
    }
  }

  if (input.cotizacion_id) {
    await supabase
      .from("cotizaciones")
      .update({ estatus: "aceptada" })
      .eq("id", input.cotizacion_id)
  }

  revalidatePath("/ventas")
  revalidatePath("/")
  revalidatePath("/cotizaciones")

  return { ok: true as const, id: venta.id as string }
}

