import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ClienteForm } from "../../cliente-form"
import type { ClienteRow, SocioBasic } from "../../clientes-dashboard"

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const [clienteRes, sociosRes, ventasCountRes, cotsCountRes] =
    await Promise.all([
      supabase
        .from("clientes")
        .select(
          `id, nombre, nombre_negocio, tipo, telefono, email,
         direccion, colonia, codigo_postal, ciudad, estado, pais, rfc, redes_sociales,
         vendedor_socio_id, metodo_pago_pref, notas, activo,
         created_at, updated_at`,
        )
        .eq("id", id)
        .maybeSingle(),
      admin
        .from("socios")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre"),
      admin
        .from("ventas")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", id),
      admin
        .from("cotizaciones")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", id),
    ])

  if (clienteRes.error) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {clienteRes.error.message}
        </div>
      </div>
    )
  }
  if (!clienteRes.data) notFound()

  const cliente = clienteRes.data as unknown as ClienteRow
  const socios = (sociosRes.data ?? []) as SocioBasic[]

  return (
    <ClienteForm
      initial={cliente}
      socios={socios}
      ventasCount={ventasCountRes.count ?? 0}
      cotizacionesCount={cotsCountRes.count ?? 0}
    />
  )
}
