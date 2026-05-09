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
      error={error}
    />
  )
}
