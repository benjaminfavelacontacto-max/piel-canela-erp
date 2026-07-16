"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getInternalClienteIds } from "@/lib/internal-clientes"
import { saveCotizacion, marcarVendida } from "../cotizaciones/actions"
import { revalidatePath } from "next/cache"

/**
 * Crea una "salida interna" de Piel Canela (producto que la socia se lleva al
 * spa): arma una cotización interna con precios públicos + costo, la convierte a
 * venta interna con la RPC atómica (que descuenta inventario) y limpia negativos.
 * Reusa saveCotizacion (folio auto) + marcarVendida (crear_venta_desde_cotizacion).
 * Queda EXCLUIDA de finanzas/ROI por ser cliente is_internal.
 */
export async function crearSalidaInterna(
  entrada: { producto_id: string; cantidad: number }[],
): Promise<
  | { ok: true; ventaId: string; numero: string; fecha: string }
  | { ok: false; error: string }
> {
  const limpios = (entrada ?? []).filter((i) => i.producto_id && i.cantidad > 0)
  if (limpios.length === 0) return { ok: false, error: "Agrega al menos un producto" }

  const admin = createAdminClient()
  const internalIds = [...(await getInternalClienteIds())]
  if (internalIds.length === 0)
    return { ok: false, error: "No hay cliente interno (Piel Canela) configurado" }
  const clienteId = internalIds[0]

  // Consolidar cantidades por producto
  const qtyBy = new Map<string, number>()
  for (const i of limpios)
    qtyBy.set(i.producto_id, (qtyBy.get(i.producto_id) ?? 0) + Math.round(i.cantidad))
  const ids = [...qtyBy.keys()]

  // Precio público (Pública MXN) + costo landed
  const pubBy = new Map<string, number>()
  const { data: lista } = await admin
    .from("listas_precios")
    .select("id")
    .eq("nombre", "Pública MXN")
    .maybeSingle()
  if (lista?.id) {
    const { data: prc } = await admin
      .from("precios_producto")
      .select("producto_id, precio")
      .eq("lista_id", lista.id)
      .in("producto_id", ids)
    for (const p of prc ?? []) pubBy.set(p.producto_id as string, Number(p.precio))
  }
  const costBy = new Map<string, number>()
  const { data: prods } = await admin.from("productos").select("id, costo").in("id", ids)
  for (const p of prods ?? []) costBy.set(p.id as string, Number(p.costo ?? 0))

  const items = [...qtyBy.entries()].map(([producto_id, cantidad]) => {
    const precio = pubBy.get(producto_id) ?? 0
    const costo = costBy.get(producto_id) ?? 0
    return {
      producto_id,
      cantidad,
      precio_unitario: precio,
      costo_unitario: costo,
      subtotal: precio * cantidad,
    }
  })
  const subtotal = items.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0)
  const costoProd = items.reduce((s, i) => s + i.costo_unitario * i.cantidad, 0)
  const today = new Date().toISOString().slice(0, 10)

  // 1) Cotización interna (folio auto: PC-…-C-Piel Canela)
  const cot = await saveCotizacion({
    numero: "",
    cliente_id: clienteId,
    fecha: today,
    valida_hasta: today,
    moneda: "MXN",
    subtotal,
    iva: 0,
    descuento: 0,
    total: subtotal,
    costo_productos: costoProd,
    costo_envio: 0,
    notas: "Salida interna Piel Canela (terraza)",
    items,
  })
  if (!cot.ok) return { ok: false, error: cot.error }

  // 2) Pre-crear filas de inventario faltantes (la RPC de descuento las requiere)
  for (const i of items) {
    const { data: inv } = await admin
      .from("inventario")
      .select("id")
      .eq("producto_id", i.producto_id)
      .maybeSingle()
    if (!inv)
      await admin.from("inventario").insert({
        producto_id: i.producto_id,
        stock_actual: i.cantidad,
        stock_minimo: 0,
        stock_inicial: i.cantidad,
      })
  }

  // 3) Convertir a venta interna → descuenta inventario (RPC atómica)
  const venta = await marcarVendida(cot.id)
  if (!venta.ok) return { ok: false, error: venta.error }

  // 4) Clamp de negativos (si se llevó más de lo que había en stock)
  for (const i of items) {
    const { data: inv } = await admin
      .from("inventario")
      .select("id, stock_actual")
      .eq("producto_id", i.producto_id)
      .maybeSingle()
    if (inv && Number(inv.stock_actual) < 0)
      await admin.from("inventario").update({ stock_actual: 0 }).eq("id", inv.id)
  }

  const { data: v } = await admin
    .from("ventas")
    .select("numero")
    .eq("id", venta.ventaId)
    .maybeSingle()

  revalidatePath("/piel-canela")
  revalidatePath("/inventario")
  revalidatePath("/cotizaciones")
  return { ok: true, ventaId: venta.ventaId, numero: v?.numero ?? "", fecha: today }
}
