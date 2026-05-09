import { createClient } from "@/lib/supabase/server"
import { CotizacionesList } from "./cotizaciones-list"
import type { CotizacionRow, ClienteOption } from "./cotizaciones-list"

export default async function CotizacionesPage() {
  const supabase = await createClient()

  const [cotsRes, clientesRes] = await Promise.all([
    supabase
      .from("cotizaciones")
      .select(
        "id, numero, fecha, total, estatus, cliente_id, clientes(id, nombre, nombre_negocio)",
      )
      .order("fecha", { ascending: false })
      .limit(500),
    supabase
      .from("clientes")
      .select("id, nombre, nombre_negocio")
      .order("nombre", { ascending: true }),
  ])

  const cotizaciones = (cotsRes.data ?? []) as unknown as CotizacionRow[]
  const clientes = (clientesRes.data ?? []) as ClienteOption[]
  const error = cotsRes.error?.message ?? clientesRes.error?.message ?? null

  return (
    <CotizacionesList
      cotizaciones={cotizaciones}
      clientes={clientes}
      error={error}
    />
  )
}
