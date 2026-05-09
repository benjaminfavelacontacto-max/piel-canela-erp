import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { CotizacionesList } from "./cotizaciones-list"
import type {
  ClienteOption,
  CotItemRow,
  CotizacionRow,
} from "./cotizaciones-list"

export default async function CotizacionesPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const [cotsRes, clientesRes, itemsRes] = await Promise.all([
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
  ])

  const cotizaciones = (cotsRes.data ?? []) as unknown as CotizacionRow[]
  const clientes = (clientesRes.data ?? []) as ClienteOption[]
  const items = (itemsRes.data ?? []) as unknown as CotItemRow[]
  const error =
    cotsRes.error?.message ??
    clientesRes.error?.message ??
    itemsRes.error?.message ??
    null

  return (
    <CotizacionesList
      cotizaciones={cotizaciones}
      clientes={clientes}
      items={items}
      error={error}
    />
  )
}
