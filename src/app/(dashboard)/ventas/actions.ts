"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getInternalClienteIds } from "@/lib/internal-clientes"
import { revalidatePath } from "next/cache"
import { parseNotas } from "./notas-util"

const SANDRA_ID = "4f21084b-dfe9-45f3-be80-935dc1a5e7a5"
const BENJAMIN_ID = "3165fe33-c760-4373-84d0-e1cd14d863b3"

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
  // Admin client: bypassa RLS para que los INSERTs no bloqueen.
  const supabase = createAdminClient()

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

  // División hardcodeada Sandra/Benjamin al 50% (no depende de RLS sobre `socios`).
  const half = Number((input.total / 2).toFixed(2))
  const ventaSocios = [
    {
      venta_id: venta.id,
      socio_id: SANDRA_ID,
      monto: half,
      concepto: `Comisión venta ${input.numero}`,
      pagado: false,
      fecha_pago: null,
    },
    {
      venta_id: venta.id,
      socio_id: BENJAMIN_ID,
      monto: half,
      concepto: `Comisión venta ${input.numero}`,
      pagado: false,
      fecha_pago: null,
    },
  ]
  const { error: vsErr } = await supabase.from("venta_socios").insert(ventaSocios)
  if (vsErr) {
    return {
      ok: false as const,
      error: `Venta creada pero distribución de socios falló: ${vsErr.message}`,
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

// ───────────────────────────────────────────────────────────────────
// getVentasStats — agregaciones para la página /ventas/estadisticas
// ───────────────────────────────────────────────────────────────────

export type MesStats = {
  mes: string
  total: number
  ganancia: number
  count: number
}
export type ClienteStats = {
  nombre: string
  totalCompras: number
  numOrdenes: number
  ultimaCompra: string
  ticketPromedio: number
}
export type ProductoStats = {
  nombre: string
  sku: string
  categoria: string
  cantidadVendida: number
  totalGenerado: number
}
export type VentasStats = {
  ventasPorMes: MesStats[]
  topClientes: ClienteStats[]
  topProductos: ProductoStats[]
  clientesUnicos: number
  totalVentas: number
  totalOrdenes: number
  ticketPromedioGlobal: number
  mejorMes: { mes: string; total: number } | null
}

type VentaForStats = {
  id: string
  total: number | null
  ganancia: number | null
  fecha: string
  cliente_id: string | null
  cotizacion_id: string | null
  clientes: { nombre: string; nombre_negocio: string | null } | null
}

type ItemRow = {
  cantidad: number
  precio_unitario: number
  productos: {
    nombre: string
    sku: string | null
    categorias: { nombre: string } | null
  } | null
}

export async function getVentasStats(filtros?: {
  desde?: string
  hasta?: string
  socioId?: string
  clienteId?: string
}): Promise<VentasStats | null> {
  const supabase = await createClient()
  // venta_items / productos pueden estar RLS-bloqueados para anon
  const admin = createAdminClient()

  let query = supabase.from("ventas").select(
    `id, total, ganancia, fecha, cliente_id, cotizacion_id,
     clientes(nombre, nombre_negocio)`,
  )
  if (filtros?.desde) query = query.gte("fecha", filtros.desde)
  if (filtros?.hasta) query = query.lte("fecha", filtros.hasta)
  if (filtros?.clienteId) query = query.eq("cliente_id", filtros.clienteId)

  const { data, error } = await query.order("fecha", { ascending: true })
  if (error) {
    console.error("[getVentasStats] ventas error:", error.message)
    return null
  }
  // Excluir ventas internas (Piel Canela) — movimientos de inventario
  const internalIds = await getInternalClienteIds()
  const ventas = ((data ?? []) as unknown as VentaForStats[]).filter(
    (v) => !v.cliente_id || !internalIds.has(v.cliente_id),
  )
  const ventaIds = ventas.map((v) => v.id)
  const cotIds = ventas
    .map((v) => v.cotizacion_id)
    .filter((x): x is string => !!x)

  // Pull TODOS los venta_items históricos (admin: bypass RLS) — sin filtro
  // de fecha. Top productos siempre refleja el histórico completo;
  // restringirlo al periodo del filtro escondería las cintas que se
  // vendieron en ventas de meses pasados.
  let items: ItemRow[] = []
  const r1 = await admin
    .from("venta_items")
    .select(
      "cantidad, precio_unitario, producto_id, productos!inner(nombre, sku, categorias(nombre))",
    )
  if (r1.error) console.error("[getVentasStats] venta_items error:", r1.error.message)
  items = (r1.data ?? []) as unknown as ItemRow[]

  // Fallback histórico desde cotizacion_items si por algún motivo
  // venta_items quedara vacío (queda como red de seguridad).
  if (items.length === 0 && cotIds.length > 0) {
    const r = await admin
      .from("cotizacion_items")
      .select(
        "cantidad, precio_unitario, producto_id, productos!inner(nombre, sku, categorias(nombre))",
      )
      .in("cotizacion_id", cotIds)
    if (r.error) console.error("[getVentasStats] cotizacion_items error:", r.error.message)
    items = (r.data ?? []) as unknown as ItemRow[]
  }
  // Suprimir warning de unused vars
  void ventaIds
  void cotIds

  // ─── Ventas por mes ─────────────────────────────────────────────
  const ventasPorMes = ventas.reduce<Record<string, MesStats>>((acc, v) => {
    if (!v.fecha) return acc
    const mes = v.fecha.slice(0, 7)
    const cur = acc[mes] ?? { mes, total: 0, ganancia: 0, count: 0 }
    cur.total += Number(v.total ?? 0)
    cur.ganancia += Number(v.ganancia ?? 0)
    cur.count += 1
    acc[mes] = cur
    return acc
  }, {})

  // ─── Top clientes (con ultima compra y ticket promedio) ────────
  type ClienteAcc = {
    nombre: string
    totalCompras: number
    numOrdenes: number
    ultimaCompra: string
  }
  const porCliente = ventas.reduce<Record<string, ClienteAcc>>((acc, v) => {
    const nombre =
      v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? "Sin cliente"
    const cur =
      acc[nombre] ??
      { nombre, totalCompras: 0, numOrdenes: 0, ultimaCompra: v.fecha }
    cur.totalCompras += Number(v.total ?? 0)
    cur.numOrdenes += 1
    if (v.fecha > cur.ultimaCompra) cur.ultimaCompra = v.fecha
    acc[nombre] = cur
    return acc
  }, {})

  // ─── Top productos (key by SKU para evitar colisiones de nombre) ─
  const porProducto = items.reduce<Record<string, ProductoStats>>(
    (acc, item) => {
      const nombre = item.productos?.nombre ?? "Desconocido"
      const sku = item.productos?.sku ?? ""
      const categoria = item.productos?.categorias?.nombre ?? "Sin categoría"
      const key = sku || nombre
      const cur =
        acc[key] ??
        { nombre, sku, categoria, cantidadVendida: 0, totalGenerado: 0 }
      cur.cantidadVendida += Number(item.cantidad ?? 0)
      cur.totalGenerado +=
        Number(item.cantidad ?? 0) * Number(item.precio_unitario ?? 0)
      acc[key] = cur
      return acc
    },
    {},
  )

  // ─── KPIs globales del periodo ──────────────────────────────────
  const ventasPorMesArr = Object.values(ventasPorMes).sort((a, b) =>
    a.mes.localeCompare(b.mes),
  )
  const totalVentas = ventas.reduce((s, v) => s + Number(v.total ?? 0), 0)
  const totalOrdenes = ventas.length
  const ticketPromedioGlobal = totalOrdenes > 0 ? totalVentas / totalOrdenes : 0
  const clientesUnicos = Object.keys(porCliente).length
  const mejorMes =
    ventasPorMesArr.length > 0
      ? ventasPorMesArr.reduce((best, m) => (m.total > best.total ? m : best))
      : null

  return {
    ventasPorMes: ventasPorMesArr,
    topClientes: Object.values(porCliente)
      .map((c) => ({
        ...c,
        ticketPromedio: c.numOrdenes > 0 ? c.totalCompras / c.numOrdenes : 0,
      }))
      .sort((a, b) => b.totalCompras - a.totalCompras)
      .slice(0, 10),
    topProductos: Object.values(porProducto)
      .sort((a, b) => b.totalGenerado - a.totalGenerado)
      .slice(0, 20),
    clientesUnicos,
    totalVentas,
    totalOrdenes,
    ticketPromedioGlobal,
    mejorMes: mejorMes ? { mes: mejorMes.mes, total: mejorMes.total } : null,
  }
}

// ───────────────────────────────────────────────────────────────────
// updateVenta — edición desde /ventas/[id]/editar
// ───────────────────────────────────────────────────────────────────

export type UpdateVentaInput = {
  id: string
  notas: string
  ivaActivo: boolean
  cantidad_pagada: number
  // Campos financieros opcionales — solo se actualizan si vienen definidos
  descuento?: number
  costo_envio?: number
  costo_productos?: number
}

function ventaEstatus(
  total: number,
  pagado: number,
): "pendiente" | "pagada_parcial" | "pagada_total" {
  if (pagado <= 0) return "pendiente"
  if (pagado >= total) return "pagada_total"
  return "pagada_parcial"
}

export async function updateVenta(input: UpdateVentaInput) {
  // Admin client para bypassar RLS en UPDATEs
  const supabase = createAdminClient()

  const { data: current, error: fetchErr } = await supabase
    .from("ventas")
    .select("subtotal, descuento, costo_envio, costo_productos, notas")
    .eq("id", input.id)
    .single()
  if (fetchErr || !current) {
    console.error("[updateVenta] fetch falló:", fetchErr)
    return {
      ok: false as const,
      error: fetchErr?.message ?? "Venta no encontrada",
    }
  }

  const subtotal = Number(current.subtotal ?? 0)
  const descuento =
    input.descuento != null ? Number(input.descuento) : Number(current.descuento ?? 0)
  const iva = input.ivaActivo ? Number((subtotal * 0.16).toFixed(2)) : 0
  // total y saldo_pendiente son GENERATED — Postgres los calcula desde
  // subtotal/iva/descuento/cantidad_pagada. Solo usamos el cálculo aquí
  // para decidir el estatus correcto.
  const calcTotal = subtotal + iva - descuento
  const estatus = ventaEstatus(calcTotal, input.cantidad_pagada)

  // Preserva el tag "Método: X." si existe en las notas previas
  const { metodo } = parseNotas(current.notas)
  const newNotas =
    input.notas.trim().length > 0
      ? metodo
        ? `Método: ${metodo}. ${input.notas.trim()}`
        : input.notas.trim()
      : metodo
        ? `Método: ${metodo}.`
        : null

  const updatePayload: Record<string, unknown> = {
    iva,
    cantidad_pagada: input.cantidad_pagada,
    estatus,
    notas: newNotas,
  }
  if (input.descuento != null) updatePayload.descuento = input.descuento
  if (input.costo_envio != null) updatePayload.costo_envio = input.costo_envio
  if (input.costo_productos != null)
    updatePayload.costo_productos = input.costo_productos

  const { error: updErr } = await supabase
    .from("ventas")
    .update(updatePayload)
    .eq("id", input.id)

  if (updErr) {
    console.error("[updateVenta] update falló:", updErr)
    return { ok: false as const, error: updErr.message }
  }

  // NOTA: venta_socios.monto NO se modifica aquí. El reparto Sandra/Benjamin
  // refleja el cobro real per Sheet ("A quien se le dio") — se gestiona
  // independiente, no es 50/50 automático sobre el total.

  revalidatePath(`/ventas/${input.id}`)
  revalidatePath("/ventas")
  revalidatePath("/")

  return { ok: true as const }
}

// ───────────────────────────────────────────────────────────────────
// updateVentaSocio — UPSERT del monto de un socio para una venta
// Permite editar el reparto Sandra/Benjamin desde la tabla.
// ───────────────────────────────────────────────────────────────────

export async function updateVentaSocio(
  ventaId: string,
  socioId: string,
  monto: number,
) {
  if (!Number.isFinite(monto) || monto < 0) {
    return { ok: false as const, error: "Monto inválido" }
  }
  const supabase = createAdminClient()
  const m = Number(monto.toFixed(2))

  const { data: existing, error: fetchErr } = await supabase
    .from("venta_socios")
    .select("id")
    .eq("venta_id", ventaId)
    .eq("socio_id", socioId)
    .maybeSingle()

  if (fetchErr) {
    return { ok: false as const, error: fetchErr.message }
  }

  if (existing) {
    const { error } = await supabase
      .from("venta_socios")
      .update({ monto: m })
      .eq("id", existing.id)
    if (error) return { ok: false as const, error: error.message }
  } else {
    const { error } = await supabase
      .from("venta_socios")
      .insert({
        venta_id: ventaId,
        socio_id: socioId,
        monto: m,
        pagado: false,
      })
    if (error) return { ok: false as const, error: error.message }
  }

  revalidatePath("/ventas")
  revalidatePath("/")
  return { ok: true as const }
}


// ───────────────────────────────────────────────────────────────────
// cambiarEstatusVenta — cambio inline desde la lista
// ───────────────────────────────────────────────────────────────────

const ESTATUS_VENTA_VALIDOS = [
  "pendiente",
  "pagada_parcial",
  "pagada_total",
  "cancelada",
] as const

export async function cambiarEstatusVenta(id: string, estatus: string) {
  if (!ESTATUS_VENTA_VALIDOS.includes(estatus as (typeof ESTATUS_VENTA_VALIDOS)[number])) {
    return { ok: false as const, error: `Estatus inválido: ${estatus}` }
  }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("ventas")
    .update({ estatus })
    .eq("id", id)
  if (error) {
    return { ok: false as const, error: error.message }
  }
  revalidatePath("/ventas")
  revalidatePath(`/ventas/${id}`)
  revalidatePath("/")
  return { ok: true as const }
}

// ───────────────────────────────────────────────────────────────────
// eliminarVenta — borra venta_items y venta_socios primero (FK)
// ───────────────────────────────────────────────────────────────────

export async function eliminarVenta(id: string) {
  const supabase = createAdminClient()

  // Borrar items
  const { error: errItems } = await supabase
    .from("venta_items")
    .delete()
    .eq("venta_id", id)
  if (errItems) {
    return { ok: false as const, error: `venta_items: ${errItems.message}` }
  }

  // Borrar reparto a socios
  const { error: errSocios } = await supabase
    .from("venta_socios")
    .delete()
    .eq("venta_id", id)
  if (errSocios) {
    return { ok: false as const, error: `venta_socios: ${errSocios.message}` }
  }

  // Desvincular cotización (poner cotizacion_id de la cotizacion → null si la
  // venta era la única referencia). El campo está en `ventas.cotizacion_id`,
  // no en cotizaciones. Si la cotización referencia esta venta vía algún
  // campo inverso lo manejaríamos aquí — por ahora no aplica.

  const { error } = await supabase.from("ventas").delete().eq("id", id)
  if (error) {
    return { ok: false as const, error: error.message }
  }

  revalidatePath("/ventas")
  revalidatePath("/")
  revalidatePath("/inventario")
  return { ok: true as const }
}
