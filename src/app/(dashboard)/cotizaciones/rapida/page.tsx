import { createClient } from "@/lib/supabase/server"
import { buildImageMap } from "@/lib/storage-images"
import type { Cliente } from "@/lib/cotizacion-types"
import { cargarProductosCotizables } from "@/lib/productos-cotizables"
import { QuickQuote } from "./quick-quote"

/**
 * Cotización rápida (móvil). Mismos datos que /cotizaciones/nueva: clientes y
 * productos con su precio de la lista "Pública MXN" y su costo.
 *
 * `?items=<id>:<cant>,<id>:<cant>` precarga partidas: así la lista de precios
 * (/cotizaciones/lista-precios) manda lo que se marcó directo a cotizar.
 */
export default async function CotizacionRapidaPage({
  searchParams,
}: {
  searchParams: Promise<{ items?: string }>
}) {
  const { items } = await searchParams
  const supabase = await createClient()
  const imageMap = await buildImageMap()

  const { data: clientesData } = await supabase
    .from("clientes")
    .select(
      "id, nombre, nombre_negocio, telefono, email, direccion, colonia, codigo_postal, ciudad, estado, rfc, metodo_pago_pref",
    )
    .order("nombre", { ascending: true })

  const clientes = (clientesData ?? []) as Cliente[]
  const { productos, error: productosError } =
    await cargarProductosCotizables(supabase, imageMap)

  return (
    <QuickQuote
      clientes={clientes}
      productos={productos}
      productosError={productosError}
      precarga={parsearPrecarga(items)}
    />
  )
}

/** "id:3,id:10" → [{id, cantidad}]. Descarta basura y topa cantidades. */
function parsearPrecarga(raw: string | undefined) {
  if (!raw) return []
  const out: { id: string; cantidad: number }[] = []
  for (const par of raw.split(",")) {
    const [id, cant] = par.split(":")
    const cantidad = Math.floor(Number(cant))
    if (!/^[0-9a-f-]{36}$/i.test(id ?? "") || !(cantidad >= 1)) continue
    out.push({ id, cantidad: Math.min(cantidad, 999) })
  }
  return out
}
