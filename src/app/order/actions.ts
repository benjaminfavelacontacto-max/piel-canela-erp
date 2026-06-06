"use server"

import { headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"

type OrderInput = {
  cliente: {
    nombre: string
    negocio: string
    telefono: string
    email: string
    ciudad: string
    notas: string
  }
  items: {
    producto_id: string
    nombre: string
    cantidad: number
    precio: number
  }[]
  /** Si el cliente fue identificado en el portal por teléfono, se reusa
   *  ese ID en lugar de crear uno nuevo (anti-duplicados). */
  clienteExistenteId?: string
}

type OrderResult =
  | { success: true; numero: string; cotizacionId: string }
  | { success: false; error: string }

/**
 * Crea una cotización en estatus "borrador" desde el portal público.
 * - Reusa cliente existente si telefono coincide (match exacto)
 * - Si no, crea cliente nuevo con tipo 'particular' (lowercase = enum DB)
 * - Numero de cotización con sufijo `-P-Portal` para distinguir en el ERP
 *
 * Usa admin client (service role) para bypassear RLS si llegara a activarse.
 */
export async function submitOrder(input: OrderInput): Promise<OrderResult> {
  // Límite anti-spam del portal público: 10 pedidos por IP cada hora.
  const ip = clientIp(await headers())
  const rl = checkRateLimit(`order:${ip}`, 10, 60 * 60 * 1000)
  if (!rl.allowed) {
    return {
      success: false,
      error: "Has enviado demasiados pedidos. Inténtalo de nuevo más tarde.",
    }
  }

  if (!input.cliente.nombre.trim() || !input.cliente.telefono.trim()) {
    return { success: false, error: "Nombre y teléfono son requeridos" }
  }
  if (input.items.length === 0) {
    return { success: false, error: "El pedido está vacío" }
  }
  // Límites de tamaño: rechazar payloads absurdos (anti-abuso).
  if (input.items.length > 50) {
    return { success: false, error: "El pedido tiene demasiados productos." }
  }
  if (
    input.items.some(
      (i) => !Number.isFinite(i.cantidad) || i.cantidad <= 0 || i.cantidad > 10_000,
    )
  ) {
    return { success: false, error: "Cantidad inválida en algún producto." }
  }

  const supabase = createAdminClient()

  // Generar número de cotización
  const fecha = new Date()
  const dd = String(fecha.getDate()).padStart(2, "0")
  const mm = String(fecha.getMonth() + 1).padStart(2, "0")
  const yy = String(fecha.getFullYear()).slice(2)
  const rand = Math.floor(Math.random() * 900) + 100
  const numero = `PC-${dd}${mm}${yy}${rand}-P-Portal`

  // Buscar o crear cliente (match por telefono)
  let clienteId: string | null = null
  const tel = input.cliente.telefono.trim()
  const telDigits = tel.replace(/\D/g, "")

  // 1) Si el portal ya identificó al cliente, reusamos su ID directo
  if (input.clienteExistenteId) {
    clienteId = input.clienteExistenteId
  }

  // 2) Sino, buscamos por telefono (match flexible — solo dígitos)
  if (!clienteId && telDigits.length >= 10) {
    const { data: existente } = await supabase
      .from("clientes")
      .select("id")
      .ilike("telefono", `%${telDigits}%`)
      .limit(1)
      .maybeSingle()
    if (existente?.id) clienteId = existente.id as string
  }

  if (!clienteId) {
    const { data: nuevo, error: errCli } = await supabase
      .from("clientes")
      .insert({
        nombre: input.cliente.nombre.trim(),
        nombre_negocio: input.cliente.negocio.trim() || null,
        telefono: tel,
        email: input.cliente.email.trim() || null,
        ciudad: input.cliente.ciudad.trim() || null,
        tipo: "particular",
        activo: true,
      })
      .select("id")
      .single()

    if (errCli || !nuevo) {
      return {
        success: false,
        error: errCli?.message ?? "No se pudo crear el cliente",
      }
    }
    clienteId = nuevo.id as string
  }

  const subtotal = input.items.reduce(
    (s, i) => s + i.precio * i.cantidad,
    0,
  )

  const validaHasta = new Date(fecha.getTime() + 30 * 24 * 60 * 60 * 1000)
  const notas = [
    "Pedido desde portal web.",
    `Cliente: ${input.cliente.nombre}`,
    `Tel: ${tel}`,
    input.cliente.negocio ? `Negocio: ${input.cliente.negocio}` : null,
    input.cliente.email ? `Email: ${input.cliente.email}` : null,
    input.cliente.ciudad ? `Ciudad: ${input.cliente.ciudad}` : null,
    input.cliente.notas ? `Notas: ${input.cliente.notas}` : null,
  ]
    .filter(Boolean)
    .join("\n")

  // total y utilidad_neta son GENERATED — Postgres los calcula
  const { data: cotizacion, error: errCot } = await supabase
    .from("cotizaciones")
    .insert({
      numero,
      cliente_id: clienteId,
      fecha: fecha.toISOString().slice(0, 10),
      valida_hasta: validaHasta.toISOString().slice(0, 10),
      moneda: "MXN",
      subtotal,
      iva: 0,
      descuento: 0,
      costo_productos: 0,
      costo_envio: 0,
      estatus: "borrador",
      notas,
    })
    .select("id")
    .single()

  if (errCot || !cotizacion) {
    return {
      success: false,
      error: errCot?.message ?? "No se pudo crear la cotización",
    }
  }

  // cotizacion_items.subtotal es GENERATED — NO insertarlo
  const { error: errItems } = await supabase.from("cotizacion_items").insert(
    input.items.map((item, i) => ({
      cotizacion_id: cotizacion.id as string,
      producto_id: item.producto_id,
      cantidad: item.cantidad,
      precio_unitario: item.precio,
      costo_unitario: 0,
      sort_order: i,
    })),
  )

  if (errItems) {
    return {
      success: false,
      error: errItems.message,
    }
  }

  // ─── Notificar al dashboard (Realtime) ───
  // No bloqueamos el flujo si falla — el pedido ya está creado. Pero
  // logueamos para que el problema no quede silenciado (el más común
  // es que la tabla `notificaciones` no exista o no esté en la
  // publication supabase_realtime).
  const formatMXN = (v: number) =>
    v.toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    })
  const negocio = input.cliente.negocio.trim()
  const nombre = input.cliente.nombre.trim()
  const cliLabel = negocio ? `${nombre} · ${negocio}` : nombre
  const { error: notifError } = await supabase
    .from("notificaciones")
    .insert({
      tipo: "pedido_portal",
      titulo: "Nuevo pedido del portal",
      mensaje: `${cliLabel} solicitó ${input.items.length} producto${input.items.length === 1 ? "" : "s"} por ${formatMXN(subtotal)}`,
      datos: {
        cotizacion_numero: numero,
        cotizacion_id: cotizacion.id,
        cliente_nombre: nombre,
        cliente_negocio: negocio || null,
        cliente_telefono: tel,
        cliente_email: input.cliente.email.trim() || null,
        cliente_ciudad: input.cliente.ciudad.trim() || null,
        items_count: input.items.length,
        subtotal,
        notas: input.cliente.notas.trim() || null,
        url: `/cotizaciones/${cotizacion.id}/confirmar`,
      },
    })
    .select("id")
    .single()
  if (notifError) {
    console.error(
      "[submitOrder] notificación no insertada:",
      notifError.message,
    )
  }

  return {
    success: true,
    numero,
    cotizacionId: cotizacion.id as string,
  }
}
