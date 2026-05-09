import { createClient } from "@/lib/supabase/server"
import { buildImageMap, findImageFor } from "@/lib/storage-images"
import type { Cliente, Producto } from "@/lib/cotizacion-types"
import { CotizacionForm } from "./cotizacion-form"

export default async function NuevaCotizacionPage() {
  const supabase = await createClient()
  const imageMap = await buildImageMap()

  const [clientesRes, listaRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nombre, nombre_negocio, telefono, email, direccion, ciudad")
      .order("nombre", { ascending: true }),
    supabase
      .from("listas_precios")
      .select("id")
      .eq("nombre", "Pública MXN")
      .maybeSingle(),
  ])

  const clientes = (clientesRes.data ?? []) as Cliente[]
  const listaId = listaRes.data?.id as string | undefined

  let productos: Producto[] = []
  let productosError: string | null = null

  if (!listaId) {
    productosError =
      'No se encontró la lista de precios "Pública MXN" — los productos se mostrarán sin precio.'
  }

  const { data: prodRows, error: prodErr } = await supabase
    .from("productos")
    .select(
      `id, sku, nombre, nombre_display, imagen_url, peso,
       precios_producto!inner(precio, lista_id)`,
    )
    .eq("precios_producto.lista_id", listaId ?? "00000000-0000-0000-0000-000000000000")
    .order("nombre", { ascending: true })

  if (prodErr) {
    productosError = prodErr.message
  } else if (prodRows) {
    type Row = {
      id: string
      sku: string | null
      nombre: string
      nombre_display: string | null
      imagen_url: string | null
      peso: string | null
      precios_producto: { precio: number }[] | { precio: number } | null
    }
    productos = (prodRows as Row[]).map((r) => {
      const pp = Array.isArray(r.precios_producto)
        ? r.precios_producto[0]
        : r.precios_producto
      const display = r.nombre_display ?? r.nombre
      return {
        id: r.id,
        sku: r.sku,
        nombre: display,
        nombre_display: r.nombre_display,
        imagen_url: findImageFor(display, r.imagen_url, imageMap),
        peso: r.peso,
        precio: Number(pp?.precio ?? 0),
      }
    })
  }

  return (
    <CotizacionForm
      clientes={clientes}
      productos={productos}
      productosError={productosError}
    />
  )
}
