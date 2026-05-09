"use server"

import { createAdminClient } from "@/lib/supabase/admin"

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
  if (!input.cliente.nombre.trim() || !input.cliente.telefono.trim()) {
    return { success: false, error: "Nombre y teléfono son requeridos" }
  }
  if (input.items.length === 0) {
    return { success: false, error: "El pedido está vacío" }
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

  const { data: existente } = await supabase
    .from("clientes")
    .select("id")
    .eq("telefono", tel)
    .maybeSingle()

  if (existente?.id) {
    clienteId = existente.id as string
  } else {
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

  return {
    success: true,
    numero,
    cotizacionId: cotizacion.id as string,
  }
}
