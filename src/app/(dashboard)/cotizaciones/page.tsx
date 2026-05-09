import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { CotizacionesList } from "./cotizaciones-list"
import type {
  ClienteOption,
  CotItemRow,
  CotizacionRow,
  KpisGlobales,
  VentaSummary,
} from "./cotizaciones-list"

export default async function CotizacionesPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const [cotsRes, clientesRes, itemsRes, ventasRes] = await Promise.all([
    supabase
      .from("cotizaciones")
      .select(
        `id, numero, fecha, valida_hasta, subtotal, descuento, iva, total,
         costo_productos, costo_envio, utilidad_neta, estatus, cliente_id,
         notas, created_at, updated_at,
         clientes(id, nombre, nombre_negocio, rfc, ciudad, vendedor_socio_id)`,
      )
      .order("fecha", { ascending: false })
      .limit(500),
    supabase
      .from("clientes")
      .select("id, nombre, nombre_negocio")
      .order("nombre", { ascending: true }),
    admin
      .from("cotizacion_items")
      .select(
        `cotizacion_id, cantidad, precio_unitario,
         productos(id, sku, nombre)`,
      ),
    // Ventas con fecha + total para métricas: convertidas, valor convertido,
    // tiempo prom. cierre, conversiones por mes
    admin
      .from("ventas")
      .select("id, numero, fecha, total, cotizacion_id, cliente_id"),
  ])

  const cotizaciones = (cotsRes.data ?? []) as unknown as CotizacionRow[]
  const clientes = (clientesRes.data ?? []) as ClienteOption[]
  const items = (itemsRes.data ?? []) as unknown as CotItemRow[]
  const ventas = (ventasRes.data ?? []) as {
    id: string
    numero: string
    fecha: string
    total: number | null
    cotizacion_id: string | null
    cliente_id: string | null
  }[]
  const error =
    cotsRes.error?.message ??
    clientesRes.error?.message ??
    itemsRes.error?.message ??
    null

  // ─── KPIs globales rediseñados ────────────────────────────────────
  const totalCotizaciones = cotizaciones.length
  const convertidas = ventas.length

  // Valor convertido = SUM ventas.total (lo realmente cobrado/cobrable)
  const valorConvertido = ventas.reduce(
    (s, v) => s + Number(v.total ?? 0),
    0,
  )

  // Mapeo cot.id → tiene venta?
  const cotIdsConVenta = new Set(
    ventas.map((v) => v.cotizacion_id).filter((x): x is string => !!x),
  )

  const hoyISO = new Date().toISOString().slice(0, 10)

  // Pipeline potencial = SUM cotizaciones NO convertidas, vigentes, no perdidas
  const pipelinePotencial = cotizaciones
    .filter(
      (c) =>
        !cotIdsConVenta.has(c.id) &&
        c.estatus !== "rechazada" &&
        c.estatus !== "vencida" &&
        (c.valida_hasta == null || c.valida_hasta >= hoyISO),
    )
    .reduce((s, c) => s + Number(c.total ?? 0), 0)

  // Pendiente convertir (enviadas vigentes, ya en flujo activo)
  const pendienteConvertir = cotizaciones
    .filter(
      (c) =>
        c.estatus === "enviada" &&
        !cotIdsConVenta.has(c.id) &&
        (c.valida_hasta == null || c.valida_hasta >= hoyISO),
    )
    .reduce((s, c) => s + Number(c.total ?? 0), 0)

  // Tasa de conversión
  const tasaConversion =
    totalCotizaciones > 0 ? (convertidas / totalCotizaciones) * 100 : 0

  // Tiempo promedio de cierre (días entre cot.fecha y venta.fecha)
  const cotById = new Map(cotizaciones.map((c) => [c.id, c]))
  const tiemposCierre: number[] = []
  for (const v of ventas) {
    if (!v.cotizacion_id) continue
    const cot = cotById.get(v.cotizacion_id)
    if (!cot) continue
    const diff =
      (new Date(v.fecha).getTime() - new Date(cot.fecha).getTime()) /
      (1000 * 60 * 60 * 24)
    if (diff >= 0 && diff < 365) tiemposCierre.push(diff)
  }
  const tiempoPromCierreDias =
    tiemposCierre.length > 0
      ? tiemposCierre.reduce((s, x) => s + x, 0) / tiemposCierre.length
      : 0

  // Ticket promedio cotización
  const ticketProm =
    totalCotizaciones > 0
      ? cotizaciones.reduce((s, c) => s + Number(c.total ?? 0), 0) /
        totalCotizaciones
      : 0

  // Utilidad estimada del pipeline (cotizaciones no convertidas activas × utilidad_neta)
  const utilidadEstimada = cotizaciones
    .filter(
      (c) =>
        !cotIdsConVenta.has(c.id) &&
        c.estatus !== "rechazada" &&
        c.estatus !== "vencida",
    )
    .reduce((s, c) => s + Number(c.utilidad_neta ?? 0), 0)

  // Activas = en pipeline (no convertidas, vigentes, no perdidas)
  const activas = cotizaciones.filter(
    (c) =>
      !cotIdsConVenta.has(c.id) &&
      c.estatus !== "rechazada" &&
      c.estatus !== "vencida" &&
      (c.valida_hasta == null || c.valida_hasta >= hoyISO),
  ).length

  // Perdidas = rechazada + vencida sin venta
  const perdidas = cotizaciones.filter(
    (c) =>
      !cotIdsConVenta.has(c.id) &&
      (c.estatus === "rechazada" ||
        c.estatus === "vencida" ||
        (c.valida_hasta != null && c.valida_hasta < hoyISO)),
  ).length

  const kpis: KpisGlobales = {
    totalCotizaciones,
    convertidas,
    activas,
    perdidas,
    valorConvertido,
    pipelinePotencial,
    pendienteConvertir,
    tasaConversion,
    tiempoPromCierreDias,
    ticketProm,
    utilidadEstimada,
  }

  const ventasSummary: VentaSummary[] = ventas.map((v) => ({
    id: v.id,
    fecha: v.fecha,
    total: Number(v.total ?? 0),
    cotizacion_id: v.cotizacion_id,
    cliente_id: v.cliente_id,
  }))

  return (
    <CotizacionesList
      cotizaciones={cotizaciones}
      clientes={clientes}
      items={items}
      ventas={ventasSummary}
      kpis={kpis}
      error={error}
    />
  )
}
