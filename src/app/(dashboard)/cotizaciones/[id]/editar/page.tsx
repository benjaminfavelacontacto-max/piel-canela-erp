import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { buildImageMap, findImageFor } from "@/lib/storage-images"
import type { Cliente, CotizacionItem, Producto } from "@/lib/cotizacion-types"
import { CotizacionForm } from "../../nueva/cotizacion-form"
import type { CotizacionFormInitial } from "../../nueva/cotizacion-form"

export default async function EditarCotizacionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: cot, error: cotErr } = await supabase
    .from("cotizaciones")
    .select(
      "id, numero, cliente_id, fecha, valida_hasta, iva, descuento, costo_envio, notas",
    )
    .eq("id", id)
    .maybeSingle()

  if (cotErr) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {cotErr.message}
        </div>
      </div>
    )
  }
  if (!cot) notFound()

  const imageMap = await buildImageMap()

  const [clientesRes, listaRes, itemsRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nombre, nombre_negocio, telefono, email, direccion, ciudad, estado, rfc, metodo_pago_pref")
      .order("nombre", { ascending: true }),
    supabase
      .from("listas_precios")
      .select("id")
      .eq("nombre", "Pública MXN")
      .maybeSingle(),
    supabase
      .from("cotizacion_items")
      .select(
        `cantidad, precio_unitario, costo_unitario, subtotal, sort_order,
         productos(id, sku, nombre, nombre_display, imagen_url, peso)`,
      )
      .eq("cotizacion_id", id)
      .order("sort_order", { ascending: true }),
  ])

  const clientes = (clientesRes.data ?? []) as Cliente[]
  const listaId = listaRes.data?.id as string | undefined

  // Fetch productos con precio (igual que en nueva/page.tsx)
  let productos: Producto[] = []
  let productosError: string | null = null
  if (!listaId) {
    productosError =
      'No se encontró la lista de precios "Pública MXN" — los productos se mostrarán sin precio.'
  }
  const { data: prodRows, error: prodErr } = await supabase
    .from("productos")
    .select(
      `id, sku, nombre, nombre_display, imagen_url, peso, costo,
       precios_producto!inner(precio, lista_id)`,
    )
    .eq(
      "precios_producto.lista_id",
      listaId ?? "00000000-0000-0000-0000-000000000000",
    )
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
      costo: number | null
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
        costo: Number(r.costo ?? 0),
      }
    })
  }

  // Build items en el shape que espera CotizacionForm (con imagen, peso, etc.)
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
    } | null
  }
  const items: CotizacionItem[] = ((itemsRes.data ?? []) as ItemRow[]).map(
    (r) => {
      const display =
        r.productos?.nombre_display ?? r.productos?.nombre ?? "—"
      return {
        producto_id: r.productos?.id ?? "",
        sku: r.productos?.sku ?? null,
        nombre: display,
        imagen_url: findImageFor(
          display,
          r.productos?.imagen_url ?? null,
          imageMap,
        ),
        peso: r.productos?.peso ?? null,
        cantidad: Number(r.cantidad),
        precio_unitario: Number(r.precio_unitario),
        costo_unitario: Number(r.costo_unitario ?? 0),
        subtotal: Number(r.subtotal),
      }
    },
  )

  const initial: CotizacionFormInitial = {
    numero: cot.numero,
    cliente_id: cot.cliente_id ?? "",
    fecha: cot.fecha,
    valida_hasta: cot.valida_hasta,
    ivaActivo: Number(cot.iva ?? 0) > 0,
    descuentoTipo: "monto",
    descuentoValor: Number(cot.descuento ?? 0),
    costoEnvio: Number(cot.costo_envio ?? 0),
    notas: cot.notas,
    items,
  }

  return (
    <CotizacionForm
      clientes={clientes}
      productos={productos}
      productosError={productosError}
      editId={id}
      initial={initial}
    />
  )
}
