import { createAdminClient } from "@/lib/supabase/admin"
import { OrderCatalog, type Producto } from "./order-catalog"

// Catálogo público siempre fresco (refleja stock casi en tiempo real).
export const dynamic = "force-dynamic"

const STORAGE_URL =
  "https://szjzaajjpuomvpnghvzu.supabase.co/storage/v1/object/public/productos/"

// Excepciones del catálogo público (lo que NO se ofrece a clientes en /order):
//  - Presentaciones de 5 litros → solo venta interna/mayoreo especial.
//    Marcador en BD: productos.peso = '5lt' (los SKUs además traen "-5L-").
//  - Aerografía Rosa Baruk.
//  - Toda la línea Dye Color.
//  - Jabón líquido (Sabonete Liquido).
function ocultoEnCatalogoPublico(p: {
  peso: string | null
  sku: string
  nombre: string
  categoria: string
}): boolean {
  const peso = (p.peso ?? "").toLowerCase().replace(/[\s.]/g, "")
  if (peso.startsWith("5l") || /(^|[-_])5l([-_]|$)/i.test(p.sku)) return true
  if (/baru?k/i.test(p.nombre) || /(^|[-_])bar($|[-_])/i.test(p.sku)) return true
  if (
    /dye/i.test(p.categoria) ||
    /^dy[-_]/i.test(p.sku) ||
    /dye\s*color/i.test(p.nombre)
  )
    return true
  if (/sabonete|jab[oó]n/i.test(p.nombre) || /(^|[-_])sab($|[-_])/i.test(p.sku))
    return true
  return false
}

/**
 * Portal público de pedidos (/order). SERVER COMPONENT.
 *
 * El catálogo + stock se leen aquí con el service role (createAdminClient),
 * NO desde el navegador. Así el anon key deja de enviarse en la página
 * pública y, con RLS activado, nadie puede leer las tablas internas con él.
 */
export default async function OrderPage() {
  const supabase = createAdminClient()

  const [{ data: prodData }, { data: invData }] = await Promise.all([
    supabase
      .from("productos")
      .select(
        `id, sku, nombre, peso, imagen_url,
         categorias(nombre),
         precios_producto(precio, listas_precios(nombre))`,
      )
      .eq("activo", true)
      .order("nombre"),
    supabase.from("vista_inventario").select("id, stock_actual"),
  ])

  // Stock por producto. vista_inventario sintetiza 0 cuando el producto no
  // tiene fila en inventario, así que queda como agotado (lo deseado).
  const stockMap = new Map<string, number>(
    ((invData ?? []) as { id: string; stock_actual: number | null }[]).map(
      (r) => [r.id, Number(r.stock_actual) || 0],
    ),
  )

  type Row = {
    id: string
    sku: string | null
    nombre: string
    peso: string | null
    imagen_url: string | null
    categorias: { nombre: string } | null
    precios_producto: {
      precio: number | null
      listas_precios: { nombre: string } | null
    }[]
  }

  const productos: Producto[] = ((prodData ?? []) as unknown as Row[])
    .map((p): Producto => {
      const precio =
        p.precios_producto?.find(
          (pp) => pp.listas_precios?.nombre === "Pública MXN",
        )?.precio ?? 0
      return {
        id: p.id,
        sku: p.sku ?? "",
        nombre: p.nombre,
        peso: p.peso,
        imagen_url: p.imagen_url
          ? `${STORAGE_URL}${encodeURIComponent(p.imagen_url)}`
          : null,
        categoria: p.categorias?.nombre ?? "OTROS",
        precio: Number(precio),
        stock: stockMap.get(p.id) ?? 0,
      }
    })
    .filter((p) => p.precio > 0 && !ocultoEnCatalogoPublico(p))

  return <OrderCatalog productos={productos} />
}
