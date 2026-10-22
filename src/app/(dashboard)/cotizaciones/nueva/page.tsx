import { createClient } from "@/lib/supabase/server"
import { buildImageMap } from "@/lib/storage-images"
import type { Cliente } from "@/lib/cotizacion-types"
import { cargarProductosCotizables } from "@/lib/productos-cotizables"
import { CotizacionForm } from "./cotizacion-form"

export default async function NuevaCotizacionPage() {
  const supabase = await createClient()
  const imageMap = await buildImageMap()

  const { data: clientesData } = await supabase
    .from("clientes")
    .select("id, nombre, nombre_negocio, telefono, email, direccion, colonia, codigo_postal, ciudad, estado, rfc, metodo_pago_pref")
    .order("nombre", { ascending: true })

  const clientes = (clientesData ?? []) as Cliente[]
  const { productos, error: productosError } =
    await cargarProductosCotizables(supabase, imageMap)

  return (
    <CotizacionForm
      clientes={clientes}
      productos={productos}
      productosError={productosError}
    />
  )
}
