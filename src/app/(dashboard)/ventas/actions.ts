"use server"

import { createClient } from "@/lib/supabase/server"
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
}
export type ProductoStats = {
  nombre: string
  cantidadVendida: number
  totalGenerado: number
}
export type VentasStats = {
  ventasPorMes: MesStats[]
  topClientes: ClienteStats[]
  topProductos: ProductoStats[]
}

type VentaWithRel = {
  id: string
  total: number | null
  ganancia: number | null
  fecha: string
  cliente_id: string | null
  clientes: { nombre: string; nombre_negocio: string | null } | null
  venta_items:
    | {
        cantidad: number
        precio_unitario: number
        producto_id: string
        productos: { nombre: string } | null
      }[]
    | null
}

export async function getVentasStats(filtros?: {
  desde?: string
  hasta?: string
  socioId?: string
  clienteId?: string
}): Promise<VentasStats | null> {
  const supabase = await createClient()

  let query = supabase.from("ventas").select(
    `id, total, ganancia, fecha, cliente_id,
     clientes(nombre, nombre_negocio),
     venta_items(cantidad, precio_unitario, producto_id, productos(nombre))`,
  )

  if (filtros?.desde) query = query.gte("fecha", filtros.desde)
  if (filtros?.hasta) query = query.lte("fecha", filtros.hasta)
  if (filtros?.clienteId) query = query.eq("cliente_id", filtros.clienteId)

  const { data, error } = await query.order("fecha", { ascending: true })
  if (error) return null
  const ventas = (data ?? []) as unknown as VentaWithRel[]

  // Ventas por mes
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

  // Top clientes
  const porCliente = ventas.reduce<Record<string, ClienteStats>>((acc, v) => {
    const nombre =
      v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? "Sin cliente"
    const cur = acc[nombre] ?? { nombre, totalCompras: 0, numOrdenes: 0 }
    cur.totalCompras += Number(v.total ?? 0)
    cur.numOrdenes += 1
    acc[nombre] = cur
    return acc
  }, {})

  // Top productos
  const items = ventas.flatMap((v) => v.venta_items ?? [])
  const porProducto = items.reduce<Record<string, ProductoStats>>(
    (acc, item) => {
      const nombre = item.productos?.nombre ?? "Desconocido"
      const cur = acc[nombre] ?? {
        nombre,
        cantidadVendida: 0,
        totalGenerado: 0,
      }
      cur.cantidadVendida += Number(item.cantidad ?? 0)
      cur.totalGenerado +=
        Number(item.cantidad ?? 0) * Number(item.precio_unitario ?? 0)
      acc[nombre] = cur
      return acc
    },
    {},
  )

  return {
    ventasPorMes: Object.values(ventasPorMes).sort((a, b) =>
      a.mes.localeCompare(b.mes),
    ),
    topClientes: Object.values(porCliente)
      .sort((a, b) => b.totalCompras - a.totalCompras)
      .slice(0, 10),
    topProductos: Object.values(porProducto)
      .sort((a, b) => b.totalGenerado - a.totalGenerado)
      .slice(0, 10),
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
  const supabase = await createClient()

  const { data: current, error: fetchErr } = await supabase
    .from("ventas")
    .select("subtotal, descuento, notas")
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
  const descuento = Number(current.descuento ?? 0)
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

  const { error: updErr } = await supabase
    .from("ventas")
    .update({
      iva,
      cantidad_pagada: input.cantidad_pagada,
      estatus,
      notas: newNotas,
    })
    .eq("id", input.id)

  if (updErr) {
    console.error("[updateVenta] update falló:", updErr)
    return { ok: false as const, error: updErr.message }
  }

  // Re-distribuir 50/50 las venta_socios al nuevo total (las dos rows ya existen)
  const half = Number((calcTotal / 2).toFixed(2))
  await supabase
    .from("venta_socios")
    .update({ monto: half })
    .eq("venta_id", input.id)
    .eq("socio_id", SANDRA_ID)
  await supabase
    .from("venta_socios")
    .update({ monto: half })
    .eq("venta_id", input.id)
    .eq("socio_id", BENJAMIN_ID)

  revalidatePath(`/ventas/${input.id}`)
  revalidatePath("/ventas")
  revalidatePath("/")

  return { ok: true as const }
}

