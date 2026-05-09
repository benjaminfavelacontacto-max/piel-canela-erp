import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { buildProductoImageUrl } from "@/lib/storage-images"
import { InventarioView } from "./inventario-view"
import type { ProductoEnriquecido } from "./inventario-view"

export default async function InventarioPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const [vistaRes, prodRes, categoriasRes, proveedoresRes, listaRes, ventaItemsRes] =
    await Promise.all([
      supabase
        .from("vista_inventario")
        .select(
          "sku, nombre, categoria, stock_actual, stock_minimo, estatus, updated_at",
        ),
      supabase
        .from("productos")
        .select(
          "id, sku, nombre, nombre_display, peso, imagen_url, categoria_id, proveedor_id, activo, categorias(nombre), proveedores(nombre)",
        ),
      supabase.from("categorias").select("id, nombre").order("nombre"),
      supabase.from("proveedores").select("id, nombre").order("nombre"),
      supabase
        .from("listas_precios")
        .select("id")
        .eq("nombre", "Pública MXN")
        .maybeSingle(),
      // venta_items para top sellers — admin (RLS)
      admin
        .from("venta_items")
        .select("producto_id, cantidad, costo_unitario, precio_unitario"),
    ])

  type ProdRow = {
    id: string
    sku: string | null
    nombre: string
    nombre_display: string | null
    peso: string | null
    imagen_url: string | null
    categoria_id: string | null
    proveedor_id: string | null
    activo: boolean | null
    categorias: { nombre: string } | null
    proveedores: { nombre: string } | null
  }
  const prodRows = (prodRes.data ?? []) as unknown as ProdRow[]
  const listaId = listaRes.data?.id as string | undefined

  // Precios públicos — query separada
  let preciosBySku = new Map<string, number>()
  if (listaId) {
    const { data: prc } = await supabase
      .from("precios_producto")
      .select("producto_id, precio")
      .eq("lista_id", listaId)
    const idToPrice = new Map<string, number>()
    for (const p of prc ?? []) {
      idToPrice.set(p.producto_id as string, Number(p.precio))
    }
    for (const r of prodRows) {
      if (!r.sku) continue
      const v = idToPrice.get(r.id)
      if (v != null) preciosBySku.set(r.sku, v)
    }
    void preciosBySku
  }
  // Map producto_id → sku (para los items)
  const idToSku = new Map(prodRows.map((p) => [p.id, p.sku ?? ""]))
  const idToPriceMap = new Map<string, number>()
  if (listaId) {
    const { data: prc } = await supabase
      .from("precios_producto")
      .select("producto_id, precio")
      .eq("lista_id", listaId)
    for (const p of prc ?? []) {
      idToPriceMap.set(p.producto_id as string, Number(p.precio))
    }
  }

  // Aggregate venta_items por producto: unidades_vendidas + costo_promedio
  type VI = { producto_id: string; cantidad: number; costo_unitario: number; precio_unitario: number }
  const items = (ventaItemsRes.data ?? []) as VI[]
  const aggBySku = new Map<
    string,
    { unidades: number; costo_sum: number; costo_n: number }
  >()
  for (const it of items) {
    const sku = idToSku.get(it.producto_id) ?? ""
    if (!sku) continue
    const cur = aggBySku.get(sku) ?? { unidades: 0, costo_sum: 0, costo_n: 0 }
    cur.unidades += Number(it.cantidad ?? 0)
    if (Number(it.costo_unitario ?? 0) > 0) {
      cur.costo_sum += Number(it.costo_unitario)
      cur.costo_n += 1
    }
    aggBySku.set(sku, cur)
  }

  // Vista (stock) por sku
  type Vista = {
    sku: string | null
    nombre: string
    categoria: string
    stock_actual: number | null
    stock_minimo: number | null
    estatus: string
    updated_at: string | null
  }
  const vistas = (vistaRes.data ?? []) as Vista[]

  // Indexado por SKU para hacer un solo merge
  const prodBySku = new Map<string, ProdRow>()
  for (const p of prodRows) {
    if (p.sku) prodBySku.set(p.sku, p)
  }

  const productos: ProductoEnriquecido[] = vistas
    .filter((v): v is Vista & { sku: string } => !!v.sku)
    .map((v) => {
      const p = prodBySku.get(v.sku)
      const agg = aggBySku.get(v.sku) ?? { unidades: 0, costo_sum: 0, costo_n: 0 }
      const costoProm = agg.costo_n > 0 ? agg.costo_sum / agg.costo_n : 0
      const precio = p ? idToPriceMap.get(p.id) ?? null : null
      const stock = Number(v.stock_actual ?? 0)
      const minimo = Number(v.stock_minimo ?? 0)
      const valor = precio != null ? stock * precio : null
      const capital = stock * costoProm
      const margen =
        precio != null && precio > 0 && costoProm > 0
          ? ((precio - costoProm) / precio) * 100
          : null
      return {
        id: p?.id ?? v.sku,
        sku: v.sku,
        nombre: v.nombre,
        nombre_display: p?.nombre_display ?? null,
        peso: p?.peso ?? null,
        imagen_url: buildProductoImageUrl(p?.imagen_url ?? null),
        categoria: v.categoria ?? p?.categorias?.nombre ?? "Sin categoría",
        proveedor: p?.proveedores?.nombre ?? null,
        precio_publico: precio,
        costo_unitario_prom: costoProm > 0 ? costoProm : null,
        stock_actual: stock,
        stock_minimo: minimo,
        estatus: (v.estatus as "ok" | "bajo" | "agotado") ?? "ok",
        unidades_vendidas: agg.unidades,
        valor_inventario: valor,
        capital_invertido: capital > 0 ? capital : null,
        margen_pct: margen,
        updated_at: v.updated_at,
        activo: p?.activo ?? true,
      }
    })

  const categorias = (categoriasRes.data ?? []).map((c) => c.nombre as string)
  const proveedores = ((proveedoresRes.data ?? []) as { nombre: string }[])
    .map((p) => p.nombre)
    .filter(Boolean)

  const error =
    vistaRes.error?.message ??
    prodRes.error?.message ??
    null

  return (
    <InventarioView
      productos={productos}
      categorias={categorias}
      proveedores={proveedores}
      error={error}
    />
  )
}
