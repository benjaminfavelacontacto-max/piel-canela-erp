import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { CotizacionesList } from "./cotizaciones-list"
import type {
  ClienteOption,
  CotItemRow,
  CotizacionRow,
  KpisGlobales,
} from "./cotizaciones-list"

export default async function CotizacionesPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const [cotsRes, clientesRes, itemsRes, ventasCountRes] = await Promise.all([
    supabase
      .from("cotizaciones")
      .select(
        `id, numero, fecha, valida_hasta, subtotal, descuento, iva, total,
         costo_productos, costo_envio, utilidad_neta, estatus, cliente_id,
         notas,
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
    // Total de ventas registradas → métrica "convertidas"
    // Cada venta representa una conversión (independiente de si su cotización
    // origen sigue existiendo en BD; algunas ventas históricas se importaron
    // del Sheet sin cotización espejo).
    admin
      .from("ventas")
      .select("id", { count: "exact", head: true }),
  ])

  const cotizaciones = (cotsRes.data ?? []) as unknown as CotizacionRow[]
  const clientes = (clientesRes.data ?? []) as ClienteOption[]
  const items = (itemsRes.data ?? []) as unknown as CotItemRow[]
  const error =
    cotsRes.error?.message ??
    clientesRes.error?.message ??
    itemsRes.error?.message ??
    null

  // ─── KPIs globales ────────────────────────────────────────────────
  const totalCotizaciones = cotizaciones.length
  const convertidas = ventasCountRes.count ?? 0
  const enProceso = Math.max(0, totalCotizaciones - convertidas)
  const totalValor = cotizaciones.reduce(
    (s, c) => s + Number(c.total ?? 0),
    0,
  )
  // Por vencer próximos 7 días (solo borrador/enviada con vigencia activa)
  const hoyISO = new Date().toISOString().slice(0, 10)
  const en7 = new Date()
  en7.setDate(en7.getDate() + 7)
  const limiteISO = en7.toISOString().slice(0, 10)
  const porVencer = cotizaciones.filter(
    (c) =>
      (c.estatus === "borrador" || c.estatus === "enviada") &&
      c.valida_hasta &&
      c.valida_hasta >= hoyISO &&
      c.valida_hasta <= limiteISO,
  ).length

  const kpis: KpisGlobales = {
    totalCotizaciones,
    convertidas,
    enProceso,
    totalValor,
    porVencer,
  }

  return (
    <CotizacionesList
      cotizaciones={cotizaciones}
      clientes={clientes}
      items={items}
      kpis={kpis}
      error={error}
    />
  )
}
