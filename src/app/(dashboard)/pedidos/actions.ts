"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import {
  subirDocumento,
  borrarDocumento,
  getDocumentoSignedUrl,
} from "@/lib/storage-docs"

export type NuevoItemEntrada = {
  producto_id: string
  cantidad: number
  precio_usd: number
}

type Admin = ReturnType<typeof createAdminClient>

// Campos derivados de un ítem de pedido (envío prorrateado por unidad).
function itemFields(
  precioUsd: number,
  cantidad: number,
  envioUnitUsd: number,
  tc: number,
  pubMxn: number | null,
) {
  const precioMxn = precioUsd * tc
  const envioUnitMxn = envioUnitUsd * tc
  const costoTotUsd = precioUsd + envioUnitUsd
  const costoTotMxn = costoTotUsd * tc
  const subUsd = precioUsd * cantidad
  const profitUnit = pubMxn != null ? pubMxn - costoTotMxn : null
  return {
    precio_unitario_usd: precioUsd,
    precio_unitario_mxn: precioMxn,
    envio_unitario_usd: envioUnitUsd,
    envio_unitario_mxn: envioUnitMxn,
    costo_total_unitario_usd: costoTotUsd,
    costo_total_unitario_mxn: costoTotMxn,
    subtotal_usd: subUsd,
    subtotal_mxn: subUsd * tc,
    total_con_envio_usd: costoTotUsd * cantidad,
    total_con_envio_mxn: costoTotMxn * cantidad,
    profit_unitario: profitUnit,
    profit_total: profitUnit != null ? profitUnit * cantidad : null,
  }
}

// Snapshot de costo al producto → alimenta vista_inventario.
// No se escribe costo_envio_mxn (la vista lo deriva = costo_envio_usd × TC).
async function snapshotProducto(
  admin: Admin,
  productoId: string,
  precioUsd: number,
  envioUnitUsd: number,
  tc: number,
) {
  await admin
    .from("productos")
    .update({
      precio_usd: precioUsd,
      costo_envio_usd: envioUnitUsd,
      tipo_cambio: tc,
      costo: (precioUsd + envioUnitUsd) * tc,
    })
    .eq("id", productoId)
}

// Suma (o resta) stock al inventario; crea la fila si no existe.
async function sumarStock(admin: Admin, productoId: string, delta: number) {
  if (!delta) return
  const { data: inv } = await admin
    .from("inventario")
    .select("id, stock_actual")
    .eq("producto_id", productoId)
    .maybeSingle()
  if (inv?.id) {
    const nuevo = Math.max(0, Number(inv.stock_actual ?? 0) + delta)
    await admin.from("inventario").update({ stock_actual: nuevo }).eq("id", inv.id)
  } else {
    const v = Math.max(0, delta)
    await admin.from("inventario").insert({
      producto_id: productoId,
      stock_actual: v,
      stock_minimo: 0,
      stock_inicial: v,
    })
  }
}

/**
 * Suma stock al inventario por cada ítem de una entrada (pedido nuevo).
 * Usado por el form de pedidos nuevos para que el pedido sea una entrada real.
 */
export async function sumarStockEntrada(
  items: { producto_id: string; cantidad: number }[],
): Promise<{ ok: boolean; error?: string }> {
  if (!items?.length) return { ok: true }
  const admin = createAdminClient()
  for (const it of items) {
    if (it.producto_id && it.cantidad > 0) {
      await sumarStock(admin, it.producto_id, Math.round(it.cantidad))
    }
  }
  revalidatePath("/inventario")
  return { ok: true }
}

/**
 * Datos para el formulario de "Nuevo Pedido" (productos + proveedores +
 * categorías). Server-side con service role: el form ya no usa el anon key.
 */
export async function getNuevoPedidoData(): Promise<{
  productos: unknown[]
  proveedores: { id: string; nombre: string }[]
  categorias: { id: string; nombre: string }[]
}> {
  const admin = createAdminClient()
  const [{ data: prods }, { data: provs }, { data: cats }] = await Promise.all([
    admin
      .from("productos")
      .select(
        `id, sku, nombre, precio_usd, costo_envio_usd, proveedor_id,
         precios_producto(precio, listas_precios(nombre))`,
      )
      .eq("activo", true)
      .order("nombre"),
    admin.from("proveedores").select("id, nombre"),
    admin.from("categorias").select("id, nombre").order("nombre"),
  ])
  return {
    productos: (prods ?? []) as unknown[],
    proveedores: (provs ?? []) as { id: string; nombre: string }[],
    categorias: (cats ?? []) as { id: string; nombre: string }[],
  }
}

export type CrearPedidoPayload = {
  nombre: string
  fecha: string
  proveedor_id: string | null
  tipo: string
  tipo_cambio: number
  envio_total_usd: number
  notas: string | null
  sandra_usd: number
  benjamin_usd: number
  items: {
    producto_id: string
    cantidad: number
    precio_usd: number
    proveedor_id: string | null
  }[]
}

/**
 * Crea un pedido de compra NUEVO (entrada de inventario). Mueve al servidor
 * toda la lógica que antes hacía el browser con el anon key:
 *  - número correlativo + insert del header
 *  - re-prorrateo del envío por unidad + insert de ítems (vía itemFields)
 *  - snapshot de costos a productos (alimenta vista_inventario)
 *  - suma del stock al inventario
 * El precio público se lee server-side (no se confía en el cliente).
 */
export async function crearPedido(
  payload: CrearPedidoPayload,
): Promise<{ ok: true; pedidoId: string } | { ok: false; error: string }> {
  if (!payload.nombre?.trim())
    return { ok: false, error: "Falta el nombre del pedido" }
  const items = (payload.items ?? []).filter(
    (i) => i.producto_id && i.cantidad > 0,
  )
  if (items.length === 0)
    return { ok: false, error: "Agrega al menos un producto" }

  const admin = createAdminClient()
  const tc = Number(payload.tipo_cambio) || 0
  const envioTotal = Number(payload.envio_total_usd) || 0

  // Número correlativo
  const { count } = await admin
    .from("pedidos_compra")
    .select("*", { count: "exact", head: true })
  const numero = (count ?? 0) + 1

  // Cantidades / precio / proveedor por producto (suma duplicados por si acaso)
  const cantByProd = new Map<string, number>()
  const precioByProd = new Map<string, number>()
  const provByProd = new Map<string, string | null>()
  for (const it of items) {
    const c = Math.round(it.cantidad)
    cantByProd.set(it.producto_id, (cantByProd.get(it.producto_id) ?? 0) + c)
    if (!precioByProd.has(it.producto_id))
      precioByProd.set(it.producto_id, Number(it.precio_usd) || 0)
    if (!provByProd.has(it.producto_id))
      provByProd.set(it.producto_id, it.proveedor_id ?? null)
  }

  // Precio público (Pública MXN) para el profit
  const pubByProd = new Map<string, number>()
  const { data: lista } = await admin
    .from("listas_precios")
    .select("id")
    .eq("nombre", "Pública MXN")
    .maybeSingle()
  if (lista?.id) {
    const { data: precios } = await admin
      .from("precios_producto")
      .select("producto_id, precio")
      .eq("lista_id", lista.id)
      .in("producto_id", [...cantByProd.keys()])
    for (const p of precios ?? [])
      pubByProd.set(p.producto_id as string, Number(p.precio))
  }

  const totalUnidades = [...cantByProd.values()].reduce((s, c) => s + c, 0)
  const envioUnit = totalUnidades > 0 ? envioTotal / totalUnidades : 0
  const subtotalUsd = [...cantByProd.entries()].reduce(
    (s, [pid, c]) => s + (precioByProd.get(pid) ?? 0) * c,
    0,
  )
  const grandTotalUsd = subtotalUsd + envioTotal
  const sandraUsd = Number(payload.sandra_usd) || 0
  const benjaminUsd = Number(payload.benjamin_usd) || 0

  const { data: pedido, error } = await admin
    .from("pedidos_compra")
    .insert({
      numero,
      nombre: payload.nombre.trim(),
      fecha: payload.fecha,
      proveedor_id: payload.proveedor_id || null,
      tipo: payload.tipo,
      tipo_cambio: tc,
      subtotal_usd: subtotalUsd,
      costo_envio_usd: envioTotal,
      costo_envio_mxn: envioTotal * tc,
      total_usd: grandTotalUsd,
      total_mxn: grandTotalUsd * tc,
      inversion_sandra_usd: sandraUsd,
      inversion_benjamin_usd: benjaminUsd,
      inversion_sandra_mxn: sandraUsd * tc,
      inversion_benjamin_mxn: benjaminUsd * tc,
      notas: payload.notas || null,
    })
    .select("id")
    .single()
  if (error || !pedido)
    return { ok: false, error: error?.message ?? "Error al guardar el pedido" }

  let sort = 0
  for (const [pid, cant] of cantByProd) {
    const precio = precioByProd.get(pid) ?? 0
    const pub = pubByProd.get(pid) ?? null
    const fields = itemFields(precio, cant, envioUnit, tc, pub)
    const { error: itErr } = await admin.from("pedido_compra_items").insert({
      pedido_id: pedido.id,
      producto_id: pid,
      cantidad: cant,
      precio_publico_mxn: pub,
      proveedor_id: provByProd.get(pid) ?? null,
      sort_order: sort++,
      ...fields,
    })
    if (itErr) return { ok: false, error: `item: ${itErr.message}` }
    await snapshotProducto(admin, pid, precio, envioUnit, tc)
    await sumarStock(admin, pid, cant)
  }

  revalidatePath("/pedidos")
  revalidatePath("/inventario")
  return { ok: true, pedidoId: pedido.id as string }
}

/**
 * Agrega productos a un pedido EXISTENTE (entrada de inventario):
 * - Re-prorratea el envío total del pedido sobre el nuevo total de unidades
 * - Recalcula y reescribe todos los ítems + snapshot de costos a productos
 * - Suma el stock de las cantidades AGREGADAS (no recuenta lo que ya estaba)
 * - Actualiza el header del pedido (subtotal/total/inversión, preservando el split)
 */
export async function agregarItemsPedido(
  pedidoId: string,
  nuevos: NuevoItemEntrada[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pedidoId) return { ok: false, error: "Falta el pedido" }
  const limpios = (nuevos ?? []).filter(
    (n) => n.producto_id && n.cantidad > 0,
  )
  if (limpios.length === 0) return { ok: false, error: "Sin productos para agregar" }

  const admin = createAdminClient()

  const { data: ped } = await admin
    .from("pedidos_compra")
    .select(
      "tipo_cambio, costo_envio_usd, total_usd, inversion_sandra_usd, inversion_benjamin_usd",
    )
    .eq("id", pedidoId)
    .maybeSingle()
  if (!ped) return { ok: false, error: "Pedido no encontrado" }
  const tc = Number(ped.tipo_cambio) || 0
  const envioTotal = Number(ped.costo_envio_usd) || 0

  const { data: existentes } = await admin
    .from("pedido_compra_items")
    .select("id, producto_id, cantidad, precio_unitario_usd, precio_publico_mxn, sort_order")
    .eq("pedido_id", pedidoId)
  const ex = existentes ?? []

  // Precio público (Pública MXN) para los productos nuevos
  const nuevosIds = [...new Set(limpios.map((n) => n.producto_id))]
  const pubByProd = new Map<string, number>()
  const { data: lista } = await admin
    .from("listas_precios")
    .select("id")
    .eq("nombre", "Pública MXN")
    .maybeSingle()
  if (lista?.id) {
    const { data: precios } = await admin
      .from("precios_producto")
      .select("producto_id, precio")
      .eq("lista_id", lista.id)
      .in("producto_id", nuevosIds)
    for (const p of precios ?? []) {
      pubByProd.set(p.producto_id as string, Number(p.precio))
    }
  }

  // Proveedor por defecto de cada producto nuevo (para heredarlo al ítem)
  const provByProd = new Map<string, string | null>()
  const { data: prodsProv } = await admin
    .from("productos")
    .select("id, proveedor_id")
    .in("id", nuevosIds)
  for (const p of prodsProv ?? [])
    provByProd.set(p.id as string, (p.proveedor_id as string | null) ?? null)

  // Merge: producto_id → { cantidad, precioUsd, pubMxn, itemId?, oldCantidad }
  type Entry = {
    cantidad: number
    precioUsd: number
    pubMxn: number | null
    itemId?: string
    oldCantidad: number
    sort: number
  }
  const map = new Map<string, Entry>()
  let maxSort = -1
  for (const it of ex) {
    const sort = Number(it.sort_order ?? 0)
    maxSort = Math.max(maxSort, sort)
    map.set(it.producto_id as string, {
      cantidad: Number(it.cantidad),
      precioUsd: Number(it.precio_unitario_usd),
      pubMxn: it.precio_publico_mxn != null ? Number(it.precio_publico_mxn) : null,
      itemId: it.id as string,
      oldCantidad: Number(it.cantidad),
      sort,
    })
  }
  for (const n of limpios) {
    const cant = Math.round(n.cantidad)
    const cur = map.get(n.producto_id)
    if (cur) {
      cur.cantidad += cant // producto ya estaba → suma cantidad
    } else {
      map.set(n.producto_id, {
        cantidad: cant,
        precioUsd: n.precio_usd,
        pubMxn: pubByProd.get(n.producto_id) ?? null,
        oldCantidad: 0,
        sort: ++maxSort,
      })
    }
  }

  const totalUnidades = [...map.values()].reduce((s, e) => s + e.cantidad, 0)
  const envioUnit = totalUnidades > 0 ? envioTotal / totalUnidades : 0

  // Reescribir ítems + snapshot + stock delta
  let subtotalUsd = 0
  for (const [productoId, e] of map) {
    const fields = itemFields(e.precioUsd, e.cantidad, envioUnit, tc, e.pubMxn)
    if (e.itemId) {
      const { error } = await admin
        .from("pedido_compra_items")
        .update(fields)
        .eq("id", e.itemId)
      if (error) return { ok: false, error: `item: ${error.message}` }
    } else {
      const { error } = await admin.from("pedido_compra_items").insert({
        pedido_id: pedidoId,
        producto_id: productoId,
        cantidad: e.cantidad,
        precio_publico_mxn: e.pubMxn,
        proveedor_id: provByProd.get(productoId) ?? null,
        sort_order: e.sort,
        ...fields,
      })
      if (error) return { ok: false, error: `item nuevo: ${error.message}` }
    }
    await snapshotProducto(admin, productoId, e.precioUsd, envioUnit, tc)
    const delta = e.cantidad - e.oldCantidad
    if (delta !== 0) await sumarStock(admin, productoId, delta)
    subtotalUsd += e.precioUsd * e.cantidad
  }

  // Header — preserva el ratio de inversión por socio
  const totalUsd = subtotalUsd + envioTotal
  const oldTotal = Number(ped.total_usd) || 0
  const rSandra = oldTotal > 0 ? Number(ped.inversion_sandra_usd) / oldTotal : 0.5
  const rBenjamin =
    oldTotal > 0 ? Number(ped.inversion_benjamin_usd) / oldTotal : 0.5
  const sandraUsd = totalUsd * rSandra
  const benjaminUsd = totalUsd * rBenjamin
  const { error: hErr } = await admin
    .from("pedidos_compra")
    .update({
      subtotal_usd: subtotalUsd,
      costo_envio_mxn: envioTotal * tc,
      total_usd: totalUsd,
      total_mxn: totalUsd * tc,
      inversion_sandra_usd: sandraUsd,
      inversion_benjamin_usd: benjaminUsd,
      inversion_sandra_mxn: sandraUsd * tc,
      inversion_benjamin_mxn: benjaminUsd * tc,
    })
    .eq("id", pedidoId)
  if (hErr) return { ok: false, error: `header: ${hErr.message}` }

  revalidatePath("/pedidos")
  revalidatePath(`/pedidos/${pedidoId}`)
  revalidatePath("/inventario")
  return { ok: true }
}

export type EditarPedidoPayload = {
  nombre: string
  fecha: string
  proveedor_id: string | null
  tipo: string
  tipo_cambio: number
  envio_total_usd: number
  notas: string | null
  sandra_usd: number
  benjamin_usd: number
  items: {
    producto_id: string
    cantidad: number
    precio_usd: number
    proveedor_id: string | null
  }[]
}

/**
 * Edita un pedido COMPLETO: datos generales + ítems (editar/quitar/agregar).
 * Reconcilia el stock por delta (newQty − oldQty por producto), re-prorratea
 * el envío y re-snapshotea los costos. Borra y reinserta los ítems.
 */
export async function editarPedido(
  pedidoId: string,
  payload: EditarPedidoPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pedidoId) return { ok: false, error: "Falta el pedido" }
  const items = (payload.items ?? []).filter((i) => i.producto_id && i.cantidad > 0)
  if (items.length === 0)
    return { ok: false, error: "El pedido necesita al menos un producto" }

  const admin = createAdminClient()
  const tc = Number(payload.tipo_cambio) || 0
  const envioTotal = Number(payload.envio_total_usd) || 0

  // 1) Ítems actuales → cantidades por producto (para el delta de stock)
  const { data: viejos } = await admin
    .from("pedido_compra_items")
    .select("producto_id, cantidad")
    .eq("pedido_id", pedidoId)
  const oldByProd = new Map<string, number>()
  for (const v of viejos ?? []) {
    const k = v.producto_id as string
    oldByProd.set(k, (oldByProd.get(k) ?? 0) + Number(v.cantidad))
  }

  // 2) Nuevas cantidades por producto (suma duplicados) + precio/proveedor por producto
  const newByProd = new Map<string, number>()
  const precioByProd = new Map<string, number>()
  const provByProd = new Map<string, string | null>()
  for (const it of items) {
    const c = Math.round(it.cantidad)
    newByProd.set(it.producto_id, (newByProd.get(it.producto_id) ?? 0) + c)
    if (!precioByProd.has(it.producto_id))
      precioByProd.set(it.producto_id, Number(it.precio_usd) || 0)
    if (!provByProd.has(it.producto_id))
      provByProd.set(it.producto_id, it.proveedor_id ?? null)
  }

  // 3) Delta de stock por producto (unión viejos ∪ nuevos)
  for (const pid of new Set([...oldByProd.keys(), ...newByProd.keys()])) {
    const delta = (newByProd.get(pid) ?? 0) - (oldByProd.get(pid) ?? 0)
    if (delta !== 0) await sumarStock(admin, pid, delta)
  }

  // 4) Precio público (Pública MXN) para profit
  const pubByProd = new Map<string, number>()
  const { data: lista } = await admin
    .from("listas_precios")
    .select("id")
    .eq("nombre", "Pública MXN")
    .maybeSingle()
  if (lista?.id) {
    const { data: precios } = await admin
      .from("precios_producto")
      .select("producto_id, precio")
      .eq("lista_id", lista.id)
      .in("producto_id", [...newByProd.keys()])
    for (const p of precios ?? [])
      pubByProd.set(p.producto_id as string, Number(p.precio))
  }

  // 5) Re-prorrateo + reescritura de ítems (borra y reinserta)
  const totalUnidades = [...newByProd.values()].reduce((s, c) => s + c, 0)
  const envioUnit = totalUnidades > 0 ? envioTotal / totalUnidades : 0
  await admin.from("pedido_compra_items").delete().eq("pedido_id", pedidoId)

  let sort = 0
  let subtotalUsd = 0
  for (const [pid, cant] of newByProd) {
    const precio = precioByProd.get(pid) ?? 0
    const pub = pubByProd.get(pid) ?? null
    const fields = itemFields(precio, cant, envioUnit, tc, pub)
    const { error } = await admin.from("pedido_compra_items").insert({
      pedido_id: pedidoId,
      producto_id: pid,
      cantidad: cant,
      precio_publico_mxn: pub,
      proveedor_id: provByProd.get(pid) ?? null,
      sort_order: sort++,
      ...fields,
    })
    if (error) return { ok: false, error: `item: ${error.message}` }
    await snapshotProducto(admin, pid, precio, envioUnit, tc)
    subtotalUsd += precio * cant
  }

  // 6) Header
  const totalUsd = subtotalUsd + envioTotal
  const sandraUsd = Number(payload.sandra_usd) || 0
  const benjaminUsd = Number(payload.benjamin_usd) || 0
  const { error: hErr } = await admin
    .from("pedidos_compra")
    .update({
      nombre: payload.nombre,
      fecha: payload.fecha,
      proveedor_id: payload.proveedor_id || null,
      tipo: payload.tipo,
      tipo_cambio: tc,
      subtotal_usd: subtotalUsd,
      costo_envio_usd: envioTotal,
      costo_envio_mxn: envioTotal * tc,
      total_usd: totalUsd,
      total_mxn: totalUsd * tc,
      inversion_sandra_usd: sandraUsd,
      inversion_benjamin_usd: benjaminUsd,
      inversion_sandra_mxn: sandraUsd * tc,
      inversion_benjamin_mxn: benjaminUsd * tc,
      notas: payload.notas || null,
    })
    .eq("id", pedidoId)
  if (hErr) return { ok: false, error: `header: ${hErr.message}` }

  revalidatePath("/pedidos")
  revalidatePath(`/pedidos/${pedidoId}`)
  revalidatePath("/inventario")
  return { ok: true }
}

export type ConversionInput = {
  fecha: string
  mxn_gastado: number
  usdt_recibido: number
  tipo_cambio: number
  comision_mxn: number
  notas?: string | null
}

/**
 * Registra una conversión MXN→USDT que fondeó un pedido (los dólares enviados
 * al proveedor) con su comisión. Alimenta el "costo total con comisiones".
 */
export async function agregarConversion(
  pedidoId: string,
  c: ConversionInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pedidoId) return { ok: false, error: "Falta el pedido" }
  const mxnGastado = Number(c.mxn_gastado) || 0
  const usdtRecibido = Number(c.usdt_recibido) || 0
  if (mxnGastado <= 0 || usdtRecibido <= 0)
    return { ok: false, error: "Captura el monto en MXN y los USDT recibidos" }

  const admin = createAdminClient()
  const { error } = await admin.from("pedido_conversiones").insert({
    pedido_id: pedidoId,
    fecha: c.fecha || new Date().toISOString(),
    mxn_gastado: mxnGastado,
    usdt_recibido: usdtRecibido,
    // Si no se da TC, se infiere del propio monto/usdt
    tipo_cambio: Number(c.tipo_cambio) || (usdtRecibido > 0 ? mxnGastado / usdtRecibido : 0),
    comision_mxn: Number(c.comision_mxn) || 0,
    notas: c.notas || null,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/pedidos/${pedidoId}`)
  return { ok: true }
}

export async function eliminarConversion(
  pedidoId: string,
  conversionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!conversionId) return { ok: false, error: "Falta la conversión" }
  const admin = createAdminClient()
  const { error } = await admin
    .from("pedido_conversiones")
    .delete()
    .eq("id", conversionId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/pedidos/${pedidoId}`)
  return { ok: true }
}

export type PagoInput = {
  fecha: string
  usdt_enviado: number
  destinatario?: string | null
  mensaje?: string | null
}

/**
 * Registra un PAGO (transfer de USDT) enviado al proveedor de un pedido.
 * Distinto de una conversión: aquí solo salen dólares (sin comisión MXN).
 * Alimenta la barra "Pagado al proveedor".
 */
export async function agregarPago(
  pedidoId: string,
  p: PagoInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pedidoId) return { ok: false, error: "Falta el pedido" }
  const usdt = Number(p.usdt_enviado) || 0
  if (usdt <= 0) return { ok: false, error: "Captura los USDT enviados" }

  const admin = createAdminClient()
  const { error } = await admin.from("pedido_pagos").insert({
    pedido_id: pedidoId,
    fecha: p.fecha || new Date().toISOString(),
    usdt_enviado: usdt,
    destinatario: p.destinatario || null,
    mensaje: p.mensaje || null,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/pedidos/${pedidoId}`)
  return { ok: true }
}

export async function eliminarPago(
  pedidoId: string,
  pagoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pagoId) return { ok: false, error: "Falta el pago" }
  const admin = createAdminClient()
  const { error } = await admin.from("pedido_pagos").delete().eq("id", pagoId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/pedidos/${pedidoId}`)
  return { ok: true }
}

// ─── Documentos: comprobantes de pago + facturas del pedido ──────────

export async function subirComprobantePago(
  pedidoId: string,
  pagoId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const file = formData.get("archivo") as File | null
  const sub = await subirDocumento(file, `pago-${pagoId}`)
  if (!sub.ok) return { ok: false, error: sub.error }
  const admin = createAdminClient()
  // Borrar el comprobante previo si lo había (no acumular huérfanos)
  const { data: prev } = await admin
    .from("pedido_pagos")
    .select("comprobante_url")
    .eq("id", pagoId)
    .maybeSingle()
  if (prev?.comprobante_url) await borrarDocumento(prev.comprobante_url as string)
  const { error } = await admin
    .from("pedido_pagos")
    .update({ comprobante_url: sub.filename })
    .eq("id", pagoId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/pedidos/${pedidoId}`)
  return { ok: true }
}

export async function eliminarComprobantePago(
  pedidoId: string,
  pagoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data: prev } = await admin
    .from("pedido_pagos")
    .select("comprobante_url")
    .eq("id", pagoId)
    .maybeSingle()
  if (prev?.comprobante_url) await borrarDocumento(prev.comprobante_url as string)
  const { error } = await admin
    .from("pedido_pagos")
    .update({ comprobante_url: null })
    .eq("id", pagoId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/pedidos/${pedidoId}`)
  return { ok: true }
}

export async function subirDocumentoPedido(
  pedidoId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const file = formData.get("archivo") as File | null
  const nombre = String(formData.get("nombre") ?? "").trim()
  const tipo = String(formData.get("tipo") ?? "otro")
  const notas = String(formData.get("notas") ?? "").trim() || null
  if (!nombre) return { ok: false, error: "Captura un nombre para el documento" }
  const sub = await subirDocumento(file, `doc-${pedidoId}`)
  if (!sub.ok) return { ok: false, error: sub.error }
  const admin = createAdminClient()
  const { error } = await admin.from("pedido_documentos").insert({
    pedido_id: pedidoId,
    nombre,
    tipo,
    filename: sub.filename,
    notas,
  })
  if (error) {
    await borrarDocumento(sub.filename) // rollback del archivo si falla la BD
    return { ok: false, error: error.message }
  }
  revalidatePath(`/pedidos/${pedidoId}`)
  return { ok: true }
}

export async function eliminarDocumentoPedido(
  pedidoId: string,
  docId: string,
  filename: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { error } = await admin
    .from("pedido_documentos")
    .delete()
    .eq("id", docId)
  if (error) return { ok: false, error: error.message }
  if (filename) await borrarDocumento(filename)
  revalidatePath(`/pedidos/${pedidoId}`)
  return { ok: true }
}

/** Genera un enlace temporal (signed URL) para ver/descargar un documento. */
export async function verDocumento(
  filename: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const url = await getDocumentoSignedUrl(filename)
  if (!url) return { ok: false, error: "No se pudo generar el enlace" }
  return { ok: true, url }
}

// ─── Desglose del envío por tramos (informativo) ─────────────────────

export async function agregarEnvioTramo(
  pedidoId: string,
  input: {
    tramo: string
    monto_usd: number
    monto_mxn: number
    notas?: string | null
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.tramo?.trim()) return { ok: false, error: "Captura el tramo (origen → destino)" }
  const admin = createAdminClient()
  const { error } = await admin.from("pedido_envios").insert({
    pedido_id: pedidoId,
    tramo: input.tramo.trim(),
    monto_usd: Number(input.monto_usd) || 0,
    monto_mxn: Number(input.monto_mxn) || 0,
    notas: input.notas || null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/pedidos/${pedidoId}`)
  return { ok: true }
}

export async function eliminarEnvioTramo(
  pedidoId: string,
  tramoId: string,
  filename: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { error } = await admin.from("pedido_envios").delete().eq("id", tramoId)
  if (error) return { ok: false, error: error.message }
  if (filename) await borrarDocumento(filename)
  revalidatePath(`/pedidos/${pedidoId}`)
  return { ok: true }
}

export async function subirFacturaEnvio(
  pedidoId: string,
  tramoId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const file = formData.get("archivo") as File | null
  const sub = await subirDocumento(file, `envio-${tramoId}`)
  if (!sub.ok) return { ok: false, error: sub.error }
  const admin = createAdminClient()
  const { data: prev } = await admin
    .from("pedido_envios")
    .select("filename")
    .eq("id", tramoId)
    .maybeSingle()
  if (prev?.filename) await borrarDocumento(prev.filename as string)
  const { error } = await admin
    .from("pedido_envios")
    .update({ filename: sub.filename })
    .eq("id", tramoId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/pedidos/${pedidoId}`)
  return { ok: true }
}

export async function eliminarFacturaEnvio(
  pedidoId: string,
  tramoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data: prev } = await admin
    .from("pedido_envios")
    .select("filename")
    .eq("id", tramoId)
    .maybeSingle()
  if (prev?.filename) await borrarDocumento(prev.filename as string)
  const { error } = await admin
    .from("pedido_envios")
    .update({ filename: null })
    .eq("id", tramoId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/pedidos/${pedidoId}`)
  return { ok: true }
}

// ─── Comprobante por conversión MXN→USDT ─────────────────────────────

export async function subirComprobanteConversion(
  pedidoId: string,
  conversionId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const file = formData.get("archivo") as File | null
  const sub = await subirDocumento(file, `conv-${conversionId}`)
  if (!sub.ok) return { ok: false, error: sub.error }
  const admin = createAdminClient()
  const { data: prev } = await admin
    .from("pedido_conversiones")
    .select("comprobante_url")
    .eq("id", conversionId)
    .maybeSingle()
  if (prev?.comprobante_url) await borrarDocumento(prev.comprobante_url as string)
  const { error } = await admin
    .from("pedido_conversiones")
    .update({ comprobante_url: sub.filename })
    .eq("id", conversionId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/pedidos/${pedidoId}`)
  return { ok: true }
}

export async function eliminarComprobanteConversion(
  pedidoId: string,
  conversionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data: prev } = await admin
    .from("pedido_conversiones")
    .select("comprobante_url")
    .eq("id", conversionId)
    .maybeSingle()
  if (prev?.comprobante_url) await borrarDocumento(prev.comprobante_url as string)
  const { error } = await admin
    .from("pedido_conversiones")
    .update({ comprobante_url: null })
    .eq("id", conversionId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/pedidos/${pedidoId}`)
  return { ok: true }
}
