import { createClient } from "@/lib/supabase/server"
import { VentasDashboard } from "./ventas-dashboard"
import type {
  Periodicidad,
  RecuperacionSocio,
  SocioRow,
  VentaRow,
} from "./ventas-dashboard"

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

  // Equivalent of:
  //   SELECT s.id, s.nombre,
  //     SUM(vs.monto) AS asignado,
  //     SUM(CASE WHEN vs.pagado THEN vs.monto ELSE 0 END) AS cobrado,
  //     SUM(CASE WHEN NOT vs.pagado THEN vs.monto ELSE 0 END) AS pendiente
  //   FROM socios s LEFT JOIN venta_socios vs ON vs.socio_id = s.id
  //   WHERE s.activo = true
  //   GROUP BY s.id, s.nombre;
  // PostgREST no expone SUM/CASE, así que se trae la unión y se agrega en JS.
  const [ventasRes, ventaSociosRes, sociosRes] = await Promise.all([
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
    supabase
      .from("socios")
      .select("id, nombre, venta_socios(monto, pagado)")
      .eq("activo", true)
      .order("nombre", { ascending: true }),
  ])

  type SocioWithItems = {
    id: string
    nombre: string
    venta_socios: { monto: number; pagado: boolean }[] | null
  }

  const recuperacion: RecuperacionSocio[] = (
    (sociosRes.data ?? []) as SocioWithItems[]
  ).map((s) => {
    const items = s.venta_socios ?? []
    const asignado = items.reduce((sum, i) => sum + Number(i.monto ?? 0), 0)
    const cobrado = items
      .filter((i) => i.pagado)
      .reduce((sum, i) => sum + Number(i.monto ?? 0), 0)
    return {
      id: s.id,
      nombre: s.nombre,
      asignado,
      cobrado,
      pendiente: asignado - cobrado,
    }
  })

  const ventas = (ventasRes.data ?? []) as unknown as VentaRow[]
  const socios = (ventaSociosRes.data ?? []) as SocioRow[]
  const periodicidad = computePeriodicidad(ventas)
  const error =
    ventasRes.error?.message ??
    ventaSociosRes.error?.message ??
    sociosRes.error?.message ??
    null

  return (
    <VentasDashboard
      ventas={ventas}
      socios={socios}
      recuperacion={recuperacion}
      periodicidad={periodicidad}
      error={error}
    />
  )
}
