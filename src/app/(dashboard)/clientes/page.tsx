import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ClientesDashboard } from "./clientes-dashboard"
import type {
  ClienteRow,
  CotizacionSummaryRow,
  SocioBasic,
  VentaItemSummary,
  VentaSummaryRow,
} from "./clientes-dashboard"

export default async function ClientesPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const [clientesRes, ventasRes, cotizacionesRes, ventaItemsRes, sociosRes] =
    await Promise.all([
      supabase
        .from("clientes")
        .select(
          `id, nombre, nombre_negocio, tipo, telefono, email,
           direccion, ciudad, estado, pais, rfc, redes_sociales,
           vendedor_socio_id, metodo_pago_pref, notas, activo,
           created_at, updated_at`,
        )
        .order("nombre", { ascending: true }),
      admin
        .from("ventas")
        .select(
          `id, numero, cliente_id, fecha, total, iva, descuento,
           costo_productos, costo_envio, utilidad_neta,
           cantidad_pagada, saldo_pendiente, estatus`,
        )
        .order("fecha", { ascending: false }),
      admin
        .from("cotizaciones")
        .select(`id, numero, cliente_id, fecha, total, estatus`)
        .order("fecha", { ascending: false }),
      admin
        .from("venta_items")
        .select(
          `venta_id, cantidad, precio_unitario,
           productos(id, nombre, sku)`,
        ),
      admin
        .from("socios")
        .select("id, nombre")
        .eq("activo", true),
    ])

  const clientes = (clientesRes.data ?? []) as unknown as ClienteRow[]
  const ventas = (ventasRes.data ?? []) as VentaSummaryRow[]
  const cotizaciones = (cotizacionesRes.data ?? []) as CotizacionSummaryRow[]
  const ventaItems = (ventaItemsRes.data ?? []) as unknown as VentaItemSummary[]
  const socios = (sociosRes.data ?? []) as SocioBasic[]
  const error =
    clientesRes.error?.message ??
    ventasRes.error?.message ??
    cotizacionesRes.error?.message ??
    null

  return (
    <ClientesDashboard
      clientes={clientes}
      ventas={ventas}
      cotizaciones={cotizaciones}
      venta_items={ventaItems}
      socios={socios}
      error={error}
    />
  )
}
