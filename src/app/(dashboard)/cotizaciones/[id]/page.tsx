import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { buildImageMap, findImageFor } from "@/lib/storage-images"
import type {
  Cliente,
  CotizacionItem,
  CotizacionData,
  Estatus,
} from "@/lib/cotizacion-types"
import { CotizacionDetail, type Faltante } from "./cotizacion-detail"

export default async function CotizacionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: cot, error } = await supabase
    .from("cotizaciones")
    .select(
      `id, numero, fecha, valida_hasta, moneda, subtotal, iva, descuento, total,
       costo_productos, estatus, notas,
       clientes(id, nombre, nombre_negocio, telefono, email, direccion, colonia, codigo_postal, ciudad, estado)`,
    )
    .eq("id", id)
    .maybeSingle()

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error.message}
        </div>
      </div>
    )
  }
  if (!cot) notFound()

  const { data: itemRows } = await supabase
    .from("cotizacion_items")
    .select(
      `cantidad, precio_unitario, costo_unitario, subtotal, sort_order,
       productos(id, sku, nombre, nombre_display, imagen_url, peso,
         categorias(nombre))`,
    )
    .eq("cotizacion_id", id)
    .order("sort_order", { ascending: true })

  const imageMap = await buildImageMap()

  type ItemRow = {
    cantidad: number
    precio_unitario: number
    costo_unitario: number
    subtotal: number
    productos: {
      id: string
      sku: string | null
      nombre: string
      nombre_display: string | null
      imagen_url: string | null
      peso: string | null
      categorias: { nombre: string } | null
    } | null
  }

  const items: CotizacionItem[] = ((itemRows ?? []) as unknown as ItemRow[]).map((r) => {
    const display = r.productos?.nombre_display ?? r.productos?.nombre ?? "—"
    return {
      producto_id: r.productos?.id ?? "",
      sku: r.productos?.sku ?? null,
      nombre: display,
      imagen_url: findImageFor(display, r.productos?.imagen_url ?? null, imageMap),
      peso: r.productos?.peso ?? null,
      categoria: r.productos?.categorias?.nombre ?? null,
      cantidad: r.cantidad,
      precio_unitario: r.precio_unitario,
      costo_unitario: r.costo_unitario,
      subtotal: r.subtotal,
    }
  })

  // Faltantes de stock. `crear_venta_desde_cotizacion` descuenta inventario y
  // aborta la transacción entera si alguna partida no alcanza, así que se
  // comprueba ANTES: si no, el usuario descubre el problema hasta que falla la
  // venta, sin saber qué producto lo causó.
  const productoIds = [...new Set(items.map((i) => i.producto_id).filter(Boolean))]
  const stockPorProducto = new Map<string, number>()
  if (productoIds.length > 0) {
    const { data: invRows } = await supabase
      .from("inventario")
      .select("producto_id, stock_actual")
      .in("producto_id", productoIds)
    for (const row of invRows ?? []) {
      stockPorProducto.set(
        row.producto_id as string,
        Number(row.stock_actual ?? 0),
      )
    }
  }
  // Sin fila de inventario = sin existencias registradas → cuenta como 0.
  const faltantes: Faltante[] = items
    .map((i) => ({
      nombre: i.nombre,
      sku: i.sku,
      cantidad: i.cantidad,
      stock: stockPorProducto.get(i.producto_id) ?? 0,
    }))
    .filter((f) => f.stock < f.cantidad)

  // ¿Esta cotización ya generó una venta? Señal fuerte de "vendida" — más
  // confiable que el estatus, que puede quedar en "borrador" aunque ya se vendió.
  const { data: ventasAsoc } = await supabase
    .from("ventas")
    .select("id, numero")
    .eq("cotizacion_id", id)
    .order("fecha", { ascending: false })
    .limit(1)
  const ventaAsociada =
    (ventasAsoc?.[0] as { id: string; numero: string } | undefined) ?? null

  const ivaActivo = Number(cot.iva ?? 0) > 0

  const cliente = (cot.clientes as unknown as Cliente | null) ?? null

  const preview: CotizacionData = {
    numero: cot.numero,
    fecha: cot.fecha,
    valida_hasta: cot.valida_hasta,
    cliente,
    items,
    subtotal: Number(cot.subtotal ?? 0),
    iva: Number(cot.iva ?? 0),
    ivaActivo,
    descuento: Number(cot.descuento ?? 0),
    total: Number(cot.total ?? 0),
    notas: cot.notas,
  }

  return (
    <CotizacionDetail
      cotizacionId={cot.id as string}
      numero={cot.numero}
      estatus={cot.estatus as Estatus}
      ventaAsociada={ventaAsociada}
      faltantes={faltantes}
      preview={preview}
    />
  )
}
