import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getInternalClienteIds } from "@/lib/internal-clientes"
import { VentasDashboard } from "./ventas-dashboard"
import type {
  SocioInfo,
  VentaItemRow,
  VentaRow,
  VentaSocioRow,
  VistaStockRow,
} from "./ventas-dashboard"

export default async function VentasPage() {
  const supabase = await createClient()
  // venta_socios y socios están RLS-bloqueados para anon; usamos admin client
  // server-side para garantizar lectura. Nunca llega al navegador.
  const admin = createAdminClient()
  const internalIds = await getInternalClienteIds()

  const [
    ventasRes,
    ventaSociosRes,
    sociosRes,
    ventaItemsRes,
    stockRes,
    inversionesRes,
  ] = await Promise.all([
    supabase
      .from("ventas")
      .select(
        `id, numero, cotizacion_id, cliente_id, fecha,
         subtotal, descuento, total, iva, costo_productos, costo_envio,
         ganancia, utilidad_neta, cantidad_pagada, saldo_pendiente,
         estatus, notas,
         clientes(id, nombre, nombre_negocio)`,
      )
      .order("fecha", { ascending: false })
      .limit(2000),
    admin
      .from("venta_socios")
      .select("venta_id, socio_id, monto, pagado"),
    admin
      .from("socios")
      .select("id, nombre, porcentaje")
      .eq("activo", true)
      .order("nombre", { ascending: true }),
    admin
      .from("venta_items")
      .select(
        `venta_id, cantidad, precio_unitario, costo_unitario, subtotal,
         productos(id, sku, nombre, peso, imagen_url)`,
      )
      .order("sort_order", { ascending: true }),
    supabase
      .from("vista_inventario")
      .select("sku, stock_actual, stock_minimo, estatus"),
    admin.from("inversiones").select("socio_id, monto_mxn"),
  ])

  const ventasRaw = (ventasRes.data ?? []) as unknown as VentaRow[]
  // Excluir ventas de clientes internos (Piel Canela) — son movimientos
  // internos de inventario, no ventas reales.
  const ventas = ventasRaw.filter(
    (v) => !v.cliente_id || !internalIds.has(v.cliente_id),
  )
  const internalVentaIds = new Set(
    ventasRaw
      .filter((v) => v.cliente_id && internalIds.has(v.cliente_id))
      .map((v) => v.id),
  )
  const venta_socios = (
    (ventaSociosRes.data ?? []) as VentaSocioRow[]
  ).filter((vs) => !internalVentaIds.has(vs.venta_id))
  const socios = (sociosRes.data ?? []) as SocioInfo[]
  const venta_items = (
    (ventaItemsRes.data ?? []) as unknown as VentaItemRow[]
  ).filter((it) => !internalVentaIds.has(it.venta_id))

  // ── Datos para "Ventas por Tipo de Producto" ──
  const ventasPorTipoRes = await admin
    .from("venta_items")
    .select(
      `cantidad, subtotal, venta_id,
       productos(categorias(nombre))`,
    )
  type VentaItemConCat = {
    cantidad: number
    subtotal: number
    venta_id: string
    productos: { categorias: { nombre: string } | null } | null
  }
  const itemsConCat = ((ventasPorTipoRes.data ?? []) as unknown as VentaItemConCat[]).filter(
    (it) => !internalVentaIds.has(it.venta_id),
  )
  // Index ventas por id para acceso rápido a fecha/total/estatus/cliente
  const ventasById = new Map<
    string,
    {
      id: string
      numero: string | number | null
      fecha: string
      total: number
      estatus: string | null
      cliente: string
    }
  >()
  for (const v of ventas) {
    ventasById.set(v.id, {
      id: v.id,
      numero: v.numero ?? null,
      fecha: v.fecha,
      total: Number(v.total ?? 0),
      estatus: v.estatus ?? null,
      cliente:
        v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? "Sin cliente",
    })
  }
  const tipoMap = new Map<
    string,
    {
      categoria: string
      totalVentas: number
      totalUnidades: number
      ordenSet: Set<string>
      ordenes: typeof ventasById extends Map<string, infer V> ? V[] : never
    }
  >()
  for (const it of itemsConCat) {
    const cat =
      it.productos?.categorias?.nombre?.toUpperCase() ?? "SIN CATEGORÍA"
    let entry = tipoMap.get(cat)
    if (!entry) {
      entry = {
        categoria: cat,
        totalVentas: 0,
        totalUnidades: 0,
        ordenSet: new Set(),
        ordenes: [],
      }
      tipoMap.set(cat, entry)
    }
    entry.totalVentas += Number(it.subtotal ?? 0)
    entry.totalUnidades += Number(it.cantidad ?? 0)
    if (!entry.ordenSet.has(it.venta_id)) {
      entry.ordenSet.add(it.venta_id)
      const venta = ventasById.get(it.venta_id)
      if (venta) entry.ordenes.push(venta)
    }
  }
  const tiposData = Array.from(tipoMap.values())
    .map(({ categoria, totalVentas, totalUnidades, ordenes }) => ({
      categoria,
      totalVentas,
      totalUnidades,
      ordenes,
    }))
    .sort((a, b) => b.totalVentas - a.totalVentas)
  const stock = (stockRes.data ?? []) as VistaStockRow[]
  const inversiones = (inversionesRes.data ?? []) as {
    socio_id: string
    monto_mxn: number | null
  }[]
  const inversionesPorSocio: Record<string, number> = {}
  for (const inv of inversiones) {
    inversionesPorSocio[inv.socio_id] =
      (inversionesPorSocio[inv.socio_id] ?? 0) + Number(inv.monto_mxn ?? 0)
  }
  const error =
    ventasRes.error?.message ??
    ventaSociosRes.error?.message ??
    sociosRes.error?.message ??
    ventaItemsRes.error?.message ??
    null

  return (
    <VentasDashboard
      ventas={ventas}
      venta_socios={venta_socios}
      socios={socios}
      venta_items={venta_items}
      stock={stock}
      inversionesPorSocio={inversionesPorSocio}
      tiposData={tiposData}
      error={error}
    />
  )
}
