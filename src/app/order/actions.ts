"use server"

import { headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import {
  cambiarTipoNumero,
  construirNumeroOrden,
  nombreCorto,
} from "@/lib/numero-orden"
import { formatMXN } from "@/lib/utils"

/** Últimos 10 dígitos del teléfono (ignora lada país/formato). */
function normalizeTel(t: string): string {
  return (t || "").replace(/\D/g, "").slice(-10)
}

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

export type ClienteMatch = {
  id: string
  nombre: string
  nombre_negocio: string | null
  email: string | null
  ciudad: string | null
  telefono: string | null
}

/**
 * Busca un cliente por teléfono para el portal público (feature
 * "¡Te reconocemos!" + anti-duplicados). Corre server-side con service role
 * porque, con RLS activado, el anon key ya no puede leer `clientes`.
 *
 * Devuelve SOLO el match exacto por teléfono completo (no permite listar
 * clientes). Rate-limit para evitar enumeración de números/PII.
 */
export async function buscarClientePorTelefono(
  tel: string,
): Promise<ClienteMatch | null> {
  const last10 = normalizeTel(tel)
  if (last10.length < 10) return null

  // Anti-enumeración: 8 búsquedas por IP cada minuto.
  const ip = clientIp(await headers())
  const rl = checkRateLimit(`cliente-lookup:${ip}`, 8, 60 * 1000)
  if (!rl.allowed) return null

  const supabase = createAdminClient()
  // ilike sobre los últimos 10 dígitos solo ACOTA candidatos; la coincidencia
  // se confirma en JS comparando el número completo normalizado. Así se exige
  // conocer el número entero (no sufijos parciales) → no se puede enumerar la
  // cartera ni los emails dígito a dígito.
  const { data } = await supabase
    .from("clientes")
    .select("id, nombre, nombre_negocio, email, ciudad, telefono")
    .ilike("telefono", `%${last10}%`)
    .limit(5)

  const match = ((data ?? []) as ClienteMatch[]).find(
    (c) => normalizeTel(c.telefono ?? "") === last10,
  )
  return match ?? null
}

/** ¿El número (en versión -C- o -V-) ya existe en cotizaciones o ventas? */
async function numeroOrdenExiste(
  supabase: ReturnType<typeof createAdminClient>,
  numero: string,
): Promise<boolean> {
  const numV = cambiarTipoNumero(numero, "V")
  const [c1, c2, v1, v2] = await Promise.all([
    supabase.from("cotizaciones").select("id").eq("numero", numero).maybeSingle(),
    supabase.from("cotizaciones").select("id").eq("numero", numV).maybeSingle(),
    supabase.from("ventas").select("id").eq("numero", numero).maybeSingle(),
    supabase.from("ventas").select("id").eq("numero", numV).maybeSingle(),
  ])
  return !!(c1.data || c2.data || v1.data || v2.data)
}

/**
 * Número en el formato ESTÁNDAR del ERP (PC-DDMMYY-NNN-C-NombreCorto), mismo
 * que genera el alta manual de cotizaciones: consecutivo por cliente + sufijo
 * con la primera palabra de su negocio. Se usa para clientes ya reconocidos en
 * el portal, para no tener que reescribirlo a mano ni marcarlo como "del portal".
 */
async function generarNumeroEstandar(
  supabase: ReturnType<typeof createAdminClient>,
  clienteId: string,
  fecha: Date | string,
): Promise<string> {
  const { count } = await supabase
    .from("cotizaciones")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", clienteId)
  const { data: cli } = await supabase
    .from("clientes")
    .select("nombre, nombre_negocio")
    .eq("id", clienteId)
    .maybeSingle()
  const corto = nombreCorto(cli ?? null)
  let consecutivo = (count ?? 0) + 1
  for (let i = 0; i < 50; i++) {
    const numero = construirNumeroOrden({ fecha, consecutivo, tipo: "C", nombreCorto: corto })
    if (!(await numeroOrdenExiste(supabase, numero))) return numero
    consecutivo++
  }
  return construirNumeroOrden({ fecha, consecutivo, tipo: "C", nombreCorto: corto })
}

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

  // ── Precios autoritativos desde la BD ──────────────────────────────
  // NUNCA confiar en el `precio` que envía el navegador: se recalcula desde
  // `precios_producto` (lista 'Pública MXN'), igual que el catálogo. Productos
  // desconocidos o inactivos abortan el pedido (anti-manipulación de precios e
  // IDOR de producto_id).
  const productoIds = [...new Set(input.items.map((i) => i.producto_id))]
  if (productoIds.some((id) => typeof id !== "string" || id.length < 10)) {
    return { success: false, error: "Producto inválido en el pedido." }
  }
  const { data: prodRows } = await supabase
    .from("productos")
    .select("id, activo, precios_producto(precio, listas_precios(nombre))")
    .in("id", productoIds)
  type ProdRow = {
    id: string
    activo: boolean | null
    precios_producto: {
      precio: number | null
      listas_precios: { nombre: string } | null
    }[]
  }
  const priceMap = new Map<string, number>()
  for (const p of (prodRows ?? []) as unknown as ProdRow[]) {
    if (p.activo === false) continue
    const precio = p.precios_producto?.find(
      (pp) => pp.listas_precios?.nombre === "Pública MXN",
    )?.precio
    if (precio != null && Number(precio) > 0) priceMap.set(p.id, Number(precio))
  }
  if (input.items.some((i) => !priceMap.has(i.producto_id))) {
    return {
      success: false,
      error:
        "Uno o más productos ya no están disponibles. Actualiza el catálogo e inténtalo de nuevo.",
    }
  }
  const pricedItems = input.items.map((i) => ({
    ...i,
    precio: priceMap.get(i.producto_id) as number,
  }))

  const fecha = new Date()

  // Buscar o crear cliente (match por telefono)
  let clienteId: string | null = null
  // ¿El cliente ya existía? (identificado por el portal o por teléfono).
  // Define si el número/notas usan el formato estándar o el de "portal".
  let reconocido = false
  const tel = input.cliente.telefono.trim()
  const telDigits = normalizeTel(tel)

  // 1) Si el portal ya identificó al cliente, reusamos su ID directo
  if (input.clienteExistenteId) {
    clienteId = input.clienteExistenteId
    reconocido = true
  }

  // 2) Sino, buscamos por telefono (coincidencia EXACTA del número completo,
  //    confirmada en JS — no por substring, para no fusionar clientes distintos
  //    cuyos números compartan dígitos).
  if (!clienteId && telDigits.length >= 10) {
    const { data: candidatos } = await supabase
      .from("clientes")
      .select("id, telefono")
      .ilike("telefono", `%${telDigits}%`)
      .limit(5)
    const existente = ((candidatos ?? []) as { id: string; telefono: string | null }[]).find(
      (c) => normalizeTel(c.telefono ?? "") === telDigits,
    )
    if (existente?.id) {
      clienteId = existente.id
      reconocido = true
    }
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

  const subtotal = pricedItems.reduce(
    (s, i) => s + i.precio * i.cantidad,
    0,
  )

  const validaHasta = new Date(fecha.getTime() + 30 * 24 * 60 * 60 * 1000)

  // Número y notas según si el cliente ya es conocido:
  // - Reconocido → formato estándar del ERP (PC-DDMMYY-NNN-C-NombreCorto) y notas
  //   limpias (solo las del cliente). Queda idéntico a una cotización dada de alta
  //   a mano: nada que reescribir ni etiqueta de "portal".
  // - Nuevo/no identificado → sufijo -P-Portal + metadatos del contacto, para
  //   poder revisarlo antes de formalizarlo.
  let numero: string
  let notas: string | null
  if (reconocido && clienteId) {
    numero = await generarNumeroEstandar(supabase, clienteId, fecha)
    notas = input.cliente.notas.trim() || null
  } else {
    const dd = String(fecha.getDate()).padStart(2, "0")
    const mm = String(fecha.getMonth() + 1).padStart(2, "0")
    const yy = String(fecha.getFullYear()).slice(2)
    const rand = Math.floor(Math.random() * 900) + 100
    numero = `PC-${dd}${mm}${yy}${rand}-P-Portal`
    notas = [
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
  }

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
    pricedItems.map((item, i) => ({
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
