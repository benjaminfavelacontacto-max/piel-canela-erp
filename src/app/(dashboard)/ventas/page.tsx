import { createClient } from "@/lib/supabase/server"
import { VentasDashboard } from "./ventas-dashboard"
import type { Periodicidad, SocioRow, VentaRow } from "./ventas-dashboard"

const DAY_MS = 1000 * 60 * 60 * 24

// Equivalent to:
//   SELECT cliente_id,
//          (MAX(fecha) - MIN(fecha)) / NULLIF(COUNT(*) - 1, 0) AS dias_promedio
//   FROM ventas GROUP BY cliente_id;
function computePeriodicidad(ventas: VentaRow[]): Periodicidad[] {
  const groups = new Map<string, string[]>()
  for (const v of ventas) {
    if (!v.cliente_id) continue
    const arr = groups.get(v.cliente_id) ?? []
    arr.push(v.fecha)
    groups.set(v.cliente_id, arr)
  }
  return Array.from(groups, ([cliente_id, fechas]) => {
    if (fechas.length <= 1) return { cliente_id, dias_promedio: null }
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (const f of fechas) {
      const t = new Date(f).getTime()
      if (t < min) min = t
      if (t > max) max = t
    }
    const days = (max - min) / DAY_MS / (fechas.length - 1)
    return { cliente_id, dias_promedio: Math.round(days) }
  })
}

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
  const periodicidad = computePeriodicidad(ventas)
  const error = ventasRes.error?.message ?? sociosRes.error?.message ?? null

  return (
    <VentasDashboard
      ventas={ventas}
      socios={socios}
      periodicidad={periodicidad}
      error={error}
    />
  )
}
