import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { VentasDashboard } from "./ventas-dashboard"
import type { SocioInfo, VentaRow, VentaSocioRow } from "./ventas-dashboard"

export default async function VentasPage() {
  const supabase = await createClient()
  // venta_socios y socios están RLS-bloqueados para anon; usamos admin client
  // server-side para garantizar lectura. Nunca llega al navegador.
  const admin = createAdminClient()

  const [ventasRes, ventaSociosRes, sociosRes] = await Promise.all([
    supabase
      .from("ventas")
      .select(
        `id, numero, cotizacion_id, cliente_id, fecha,
         total, iva, ganancia, cantidad_pagada, saldo_pendiente, estatus,
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
  ])

  const ventas = (ventasRes.data ?? []) as unknown as VentaRow[]
  const venta_socios = (ventaSociosRes.data ?? []) as VentaSocioRow[]
  const socios = (sociosRes.data ?? []) as SocioInfo[]
  const error =
    ventasRes.error?.message ??
    ventaSociosRes.error?.message ??
    sociosRes.error?.message ??
    null

  return (
    <VentasDashboard
      ventas={ventas}
      venta_socios={venta_socios}
      socios={socios}
      error={error}
    />
  )
}
