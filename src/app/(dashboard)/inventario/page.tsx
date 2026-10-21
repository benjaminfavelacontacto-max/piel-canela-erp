import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { buildProductoImageUrl } from "@/lib/storage-images"
import { InventarioView } from "./inventario-view"
import type { ProductoEnriquecido, ProductoSales } from "./inventario-view"

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ producto?: string }>
}) {
  const { producto: initialSku } = await searchParams
  const supabase = await createClient()
  const admin = createAdminClient()

  const [vistaRes, prodRes, categoriasRes, proveedoresRes, preciosRes, ventaItemsRes] =
    await Promise.all([
      supabase
        .from("vista_inventario")
        .select(
          `sku, nombre, categoria, stock_actual, stock_minimo, estatus, updated_at,
           precio_publico, precio_usd, precio_mxn_calculado,
           costo_envio_usd, costo_envio_mxn,
           costo_total_usd, costo_total_mxn,
           tipo_cambio, profit_unitario, unidades_vendidas`,
        ),
      supabase
        .from("productos")
        .select(
          "id, sku, nombre, nombre_display, peso, imagen_url, categoria_id, proveedor_id, activo, categorias(nombre), proveedores(nombre)",
        ),
      supabase.from("categorias").select("id, nombre").order("nombre"),
      supabase.from("proveedores").select("id, nombre").order("nombre"),
      // Precios de la lista 'Pública MXN' en una sola consulta (join con listas_precios)
      supabase
        .from("precios_producto")
        .select("producto_id, precio, listas_precios!inner(nombre)")
        .eq("listas_precios.nombre", "Pública MXN"),
      // venta_items: solo lo mínimo para unidades vendidas + costo promedio.
      // El historial detallado por producto se pide al abrir el drawer
      // (acción cargarVentasProducto) para no inflar el payload.
      admin.from("venta_items").select("producto_id, cantidad, costo_unitario"),
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
  // Map producto_id → sku (para los items)
  const idToSku = new Map(prodRows.map((p) => [p.id, p.sku ?? ""]))
  const idToPriceMap = new Map<string, number>()
  for (const p of preciosRes.data ?? []) {
    idToPriceMap.set(p.producto_id as string, Number(p.precio))
  }

  // Aggregate venta_items por producto: unidades_vendidas + costo_promedio
  type VI = {
    producto_id: string
    cantidad: number
    costo_unitario: number
  }
  const items = (ventaItemsRes.data ?? []) as unknown as VI[]
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

  // Vista (stock + costos USD/MXN) por sku
  type Vista = {
    sku: string | null
    nombre: string
    categoria: string
    stock_actual: number | null
    stock_minimo: number | null
    estatus: string
    updated_at: string | null
    precio_publico: number | null
    precio_usd: number | null
    precio_mxn_calculado: number | null
    costo_envio_usd: number | null
    costo_envio_mxn: number | null
    costo_total_usd: number | null
    costo_total_mxn: number | null
    tipo_cambio: number | null
    profit_unitario: number | null
    unidades_vendidas: number | null
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
      // Costo unitario REAL = costo landed de la vista (precio_usd + envío × TC).
      // Si el producto no tiene costeo cargado, caemos al promedio de costos de
      // ventas pasadas. Así capital/margen YA NO dependen de haber vendido antes
      // (antes: capital = stock × costoProm → 0 en los 78 productos sin ventas).
      const costoLanded =
        v.costo_total_mxn != null ? Number(v.costo_total_mxn) : 0
      const costoUnit = costoLanded > 0 ? costoLanded : costoProm
      const valor = precio != null ? stock * precio : null
      const capital = costoUnit > 0 ? stock * costoUnit : null
      const margen =
        precio != null && precio > 0 && costoUnit > 0
          ? ((precio - costoUnit) / precio) * 100
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
        costo_unitario_prom: costoUnit > 0 ? costoUnit : null,
        stock_actual: stock,
        stock_minimo: minimo,
        estatus: (v.estatus as "ok" | "bajo" | "agotado") ?? "ok",
        unidades_vendidas:
          v.unidades_vendidas != null
            ? Number(v.unidades_vendidas)
            : agg.unidades,
        valor_inventario: valor,
        capital_invertido: capital,
        margen_pct: margen,
        // Campos USD/MXN desde la vista
        precio_usd: v.precio_usd != null ? Number(v.precio_usd) : null,
        precio_mxn_calculado:
          v.precio_mxn_calculado != null
            ? Number(v.precio_mxn_calculado)
            : null,
        costo_envio_usd:
          v.costo_envio_usd != null ? Number(v.costo_envio_usd) : null,
        costo_envio_mxn:
          v.costo_envio_mxn != null ? Number(v.costo_envio_mxn) : null,
        costo_total_usd:
          v.costo_total_usd != null ? Number(v.costo_total_usd) : null,
        costo_total_mxn:
          v.costo_total_mxn != null ? Number(v.costo_total_mxn) : null,
        tipo_cambio:
          v.tipo_cambio != null ? Number(v.tipo_cambio) : null,
        profit_unitario:
          v.profit_unitario != null ? Number(v.profit_unitario) : null,
        updated_at: v.updated_at,
        activo: p?.activo ?? true,
      }
    })

  // Serie mensual de ventas SOLO para los 20 más vendidos: la usa la "sugerencia de pedido"
  // (ritmo mensual). Es una consulta chica; el historial completo por SKU va aparte (drawer).
  const top20 = [...productos]
    .filter((p) => p.unidades_vendidas > 0)
    .sort((a, b) => b.unidades_vendidas - a.unidades_vendidas)
    .slice(0, 20)
  const idPorSku = new Map(prodRows.map((p) => [p.sku ?? "", p.id]))
  const skuPorId = new Map(top20.map((p) => [idPorSku.get(p.sku) ?? "", p.sku]))
  const salesTop: Record<string, ProductoSales> = {}
  if (top20.length > 0) {
    const { data: itemsTop } = await admin
      .from("venta_items")
      .select("producto_id, cantidad, precio_unitario, ventas(fecha)")
      .in("producto_id", [...skuPorId.keys()].filter(Boolean))
    const porSku = new Map<string, Map<string, { cantidad: number; revenue: number }>>()
    for (const it of (itemsTop ?? []) as unknown as {
      producto_id: string
      cantidad: number
      precio_unitario: number
      ventas: { fecha: string } | null
    }[]) {
      const sku = skuPorId.get(it.producto_id)
      if (!sku || !it.ventas?.fecha) continue
      const mes = it.ventas.fecha.slice(0, 7)
      const meses = porSku.get(sku) ?? new Map()
      const cur = meses.get(mes) ?? { cantidad: 0, revenue: 0 }
      cur.cantidad += Number(it.cantidad ?? 0)
      cur.revenue += Number(it.cantidad ?? 0) * Number(it.precio_unitario ?? 0)
      meses.set(mes, cur)
      porSku.set(sku, meses)
    }
    for (const [sku, meses] of porSku) {
      salesTop[sku] = {
        ventas: [],
        monthly: [...meses].map(([mes, v]) => ({ mes, ...v })).sort((a, b) => a.mes.localeCompare(b.mes)),
      }
    }
  }

  const categorias = (categoriasRes.data ?? []).map((c) => c.nombre as string)
  const proveedores = ((proveedoresRes.data ?? []) as { nombre: string }[])
    .map((p) => p.nombre)
    .filter(Boolean)
  const categoriaOptions = ((categoriasRes.data ?? []) as { id: string; nombre: string }[])
    .filter((c) => c.nombre)
    .map((c) => ({ id: c.id, nombre: c.nombre }))
  const proveedorOptions = ((proveedoresRes.data ?? []) as { id: string; nombre: string }[])
    .filter((p) => p.nombre)
    .map((p) => ({ id: p.id, nombre: p.nombre }))

  const error =
    vistaRes.error?.message ??
    prodRes.error?.message ??
    null

  return (
    <InventarioView
      // key: al llegar desde la búsqueda global con ?producto=SKU (ya estando en /inventario) se reabre el drawer
      key={initialSku ?? "lista"}
      productos={productos}
      categorias={categorias}
      proveedores={proveedores}
      categoriaOptions={categoriaOptions}
      proveedorOptions={proveedorOptions}
      error={error}
      salesTop={salesTop}
      initialSku={initialSku ?? null}
    />
  )
}
