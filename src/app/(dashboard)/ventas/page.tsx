import { createClient } from "@/lib/supabase/server"
import { VentasDashboard } from "./ventas-dashboard"
import type { SocioRow, VentaRow } from "./ventas-dashboard"

export default async function VentasPage() {
  const supabase = await createClient()

  const [ventasRes, sociosRes] = await Promise.all([
    supabase
      .from("ventas")
      .select(
        `id, numero, cotizacion_id, cliente_id, fecha,
         total, costo_productos, costo_envio, ganancia,
         cantidad_pagada, saldo_pendiente, estatus, notas,
         clientes(id, nombre, nombre_negocio)`,
      )
      .order("fecha", { ascending: false })
      .limit(500),
    supabase
      .from("venta_socios")
      .select("venta_id, socio_id, monto, pagado"),
  ])

  const ventas = (ventasRes.data ?? []) as unknown as VentaRow[]
  const socios = (sociosRes.data ?? []) as SocioRow[]
  const error = ventasRes.error?.message ?? sociosRes.error?.message ?? null

  return <VentasDashboard ventas={ventas} socios={socios} error={error} />
}
