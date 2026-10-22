import { createAdminClient } from "@/lib/supabase/admin"
import { promoPortal } from "@/lib/promos-portal"
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
  /** Nombre interno + nombre editado en inventario (se revisan los dos). */
  nombres: string[]
  categoria: string
}): boolean {
  const nombre = p.nombres.join(" ")
  const peso = (p.peso ?? "").toLowerCase().replace(/[\s.]/g, "")
  if (peso.startsWith("5l") || /(^|[-_])5l([-_]|$)/i.test(p.sku)) return true
  if (/baru?k/i.test(nombre) || /(^|[-_])bar($|[-_])/i.test(p.sku)) return true
  if (
    /dye/i.test(p.categoria) ||
    /^dy[-_]/i.test(p.sku) ||
    /dye\s*color/i.test(nombre)
  )
    return true
  if (/sabonete|jab[oó]n/i.test(nombre) || /(^|[-_])sab($|[-_])/i.test(p.sku))
    return true
  return false
}

/**
 * Portal público de pedidos (/order). SERVER COMPONENT.
 *
 * El catálogo + stock se leen aquí con el service role (createAdminClient),
 * NO desde el navegador. Así el anon key deja de enviarse en la página
 * pública y, con RLS activado, nadie puede leer las tablas internas con él.
 *
 * Es "en vivo": cada carga lee la BD (force-dynamic) y el cliente vuelve a
 * pedirla cada ~20 s mientras la pestaña está abierta (router.refresh), así que
 * lo que cambies en Inventario (nombre, precio, surtido, agotado) se refleja
 * solo. Al navegador NUNCA viaja la cantidad: solo si está agotado o no.
 */
export default async function OrderPage() {
  const supabase = createAdminClient()

  const [{ data: prodData }, { data: invData }] = await Promise.all([
    supabase
      .from("productos")
      .select(
        `id, sku, nombre, nombre_display, peso, imagen_url,
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
    nombre_display: string | null
    peso: string | null
    imagen_url: string | null
    categorias: { nombre: string } | null
    precios_producto: {
      precio: number | null
      listas_precios: { nombre: string } | null
    }[]
  }

  const filas = (prodData ?? []) as unknown as Row[]
  const nombreInterno = new Map(filas.map((r) => [r.id, r.nombre]))

  const productos: Producto[] = filas
    .map((p): Producto => {
      const precio =
        p.precios_producto?.find(
          (pp) => pp.listas_precios?.nombre === "Pública MXN",
        )?.precio ?? 0
      const promo = promoPortal(p.sku ?? "", Number(precio))
      return {
        id: p.id,
        sku: p.sku ?? "",
        // El nombre que editas en Inventario (nombre_display) manda sobre el interno.
        nombre: p.nombre_display?.trim() || p.nombre,
        peso: p.peso,
        imagen_url: p.imagen_url
          ? `${STORAGE_URL}${encodeURIComponent(p.imagen_url)}`
          : null,
        categoria: p.categorias?.nombre ?? "OTROS",
        // Con promoción (Sem Sol): se cobra el rebajado y se muestra el de lista tachado.
        precio: promo?.precio ?? Number(precio),
        precioLista: promo ? promo.precioLista : null,
        descuentoPct: promo ? promo.descuentoPct : null,
        agotado: (stockMap.get(p.id) ?? 0) <= 0,
      }
    })
        .filter(
      (p) =>
        p.precio > 0 &&
        !ocultoEnCatalogoPublico({
          peso: p.peso,
          sku: p.sku,
          categoria: p.categoria,
          nombres: [p.nombre, nombreInterno.get(p.id) ?? ""],
        }),
    )

  return <OrderCatalog productos={productos} />
}
