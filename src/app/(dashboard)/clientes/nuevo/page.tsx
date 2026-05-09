import { createAdminClient } from "@/lib/supabase/admin"
import { ClienteForm } from "../cliente-form"
import type { SocioBasic } from "../clientes-dashboard"

export default async function NuevoClientePage() {
  const admin = createAdminClient()
  const { data } = await admin
    .from("socios")
    .select("id, nombre")
    .eq("activo", true)
    .order("nombre")
  const socios = (data ?? []) as SocioBasic[]
  return <ClienteForm socios={socios} />
}
