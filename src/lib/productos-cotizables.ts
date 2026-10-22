import type { SupabaseClient } from "@supabase/supabase-js"
import { buildImageMap, findImageFor } from "@/lib/storage-images"
import type { Producto } from "@/lib/cotizacion-types"

/**
 * Productos cotizables con su precio de la lista "Pública MXN" y su costo.
 * Un solo cargador para el formulario completo, la cotización rápida, la edición
 * y la lista de precios — antes cada página repetía la misma consulta.
 *
 * Incluye `categoria` (nombre en BD) para agrupar por familia, e incluye al
 * comodín "Cinta por escoger" aunque esté inactivo (no filtra por `activo`).
 */
export async function cargarProductosCotizables(
  supabase: SupabaseClient,
  imageMap?: Awaited<ReturnType<typeof buildImageMap>>,
): Promise<{ productos: Producto[]; error: string | null }> {
  const mapa = imageMap ?? (await buildImageMap())

  const { data: lista } = await supabase
    .from("listas_precios")
    .select("id")
    .eq("nombre", "Pública MXN")
    .maybeSingle()
  const listaId = lista?.id as string | undefined
  const error: string | null = listaId
    ? null
    : 'No se encontró la lista de precios "Pública MXN" — los productos se mostrarán sin precio.'

  const { data, error: prodErr } = await supabase
    .from("productos")
    .select(
      `id, sku, nombre, nombre_display, imagen_url, peso, costo, activo,
       categorias(nombre),
       precios_producto!inner(precio, lista_id)`,
    )
    .eq(
      "precios_producto.lista_id",
      listaId ?? "00000000-0000-0000-0000-000000000000",
    )
    .order("nombre", { ascending: true })

  if (prodErr) return { productos: [], error: prodErr.message }

  type Row = {
    id: string
    sku: string | null
    nombre: string
    nombre_display: string | null
    imagen_url: string | null
    peso: string | null
    costo: number | null
    activo: boolean | null
    categorias: { nombre: string } | { nombre: string }[] | null
    precios_producto: { precio: number }[] | { precio: number } | null
  }
  const productos = ((data ?? []) as unknown as Row[]).map((r): Producto => {
    const pp = Array.isArray(r.precios_producto)
      ? r.precios_producto[0]
      : r.precios_producto
    const cat = Array.isArray(r.categorias) ? r.categorias[0] : r.categorias
    const display = r.nombre_display ?? r.nombre
    return {
      id: r.id,
      sku: r.sku,
      nombre: display,
      nombre_display: r.nombre_display,
      imagen_url: findImageFor(display, r.imagen_url, mapa),
      peso: r.peso,
      precio: Number(pp?.precio ?? 0),
      costo: Number(r.costo ?? 0),
      categoria: cat?.nombre ?? null,
      activo: r.activo !== false,
    }
  })
  return { productos, error }
}
