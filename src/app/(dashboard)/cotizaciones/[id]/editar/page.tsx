import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { buildImageMap, findImageFor } from "@/lib/storage-images"
import type { Cliente, CotizacionItem } from "@/lib/cotizacion-types"
import { cargarProductosCotizables } from "@/lib/productos-cotizables"
import { fetchCotizacionItems } from "@/lib/cotizacion-items-query"
import type { TipoDescuento } from "@/lib/descuentos"
import { CotizacionForm } from "../../nueva/cotizacion-form"
import type { CotizacionFormInitial } from "../../nueva/cotizacion-form"

export default async function EditarCotizacionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  let { data: cot, error: cotErr } = await supabase
    .from("cotizaciones")
    .select(
      "id, numero, cliente_id, fecha, valida_hasta, iva, descuento, descuento_tipo, descuento_valor, costo_envio, notas",
    )
    .eq("id", id)
    .maybeSingle()
  // BD sin la migración de descuento_tipo: reintenta sin esas columnas.
  if (cotErr && /descuento_(tipo|valor)/.test(cotErr.message ?? "")) {
    ;({ data: cot, error: cotErr } = await supabase
      .from("cotizaciones")
      .select(
        "id, numero, cliente_id, fecha, valida_hasta, iva, descuento, costo_envio, notas",
      )
      .eq("id", id)
      .maybeSingle())
  }

  if (cotErr) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {cotErr.message}
        </div>
      </div>
    )
  }
  if (!cot) notFound()

  const imageMap = await buildImageMap()

  const [clientesRes, itemsRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nombre, nombre_negocio, telefono, email, direccion, colonia, codigo_postal, ciudad, estado, rfc, metodo_pago_pref")
      .order("nombre", { ascending: true }),
    // Degrada solo si falta alguna migración de partidas (regalos / descuento
    // por producto) — ver src/lib/cotizacion-items-query.ts.
    fetchCotizacionItems(
      supabase,
      id,
      `productos(id, sku, nombre, nombre_display, imagen_url, peso)`,
    ),
  ])

  const itemsData = itemsRes.rows

  const clientes = (clientesRes.data ?? []) as Cliente[]

  // Mismos productos y precios que en nueva/page.tsx
  const { productos, error: productosError } =
    await cargarProductosCotizables(supabase, imageMap)

  // Build items en el shape que espera CotizacionForm (con imagen, peso, etc.)
  type ItemRow = {
    cantidad: number
    precio_unitario: number
    costo_unitario: number
    subtotal: number
    es_regalo?: boolean | null
    precio_lista?: number | null
    descuento_tipo?: TipoDescuento | null
    descuento_valor?: number | null
    productos: {
      id: string
      sku: string | null
      nombre: string
      nombre_display: string | null
      imagen_url: string | null
      peso: string | null
    } | null
  }
  const items: CotizacionItem[] = ((itemsData ?? []) as unknown as ItemRow[]).map(
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
        es_regalo: r.es_regalo === true,
        precio_lista: r.precio_lista != null ? Number(r.precio_lista) : null,
        descuento_tipo: r.descuento_tipo ?? null,
        descuento_valor: Number(r.descuento_valor ?? 0),
      }
    },
  )

  const initial: CotizacionFormInitial = {
    numero: cot.numero,
    cliente_id: cot.cliente_id ?? "",
    fecha: cot.fecha,
    valida_hasta: cot.valida_hasta,
    ivaActivo: Number(cot.iva ?? 0) > 0,
    // Cotizaciones previas a la migración no traen tipo/valor: se tratan
    // como monto fijo igual al descuento guardado (comportamiento anterior).
    descuentoTipo:
      ((cot as { descuento_tipo?: string }).descuento_tipo as
        | "monto"
        | "pct") ?? "monto",
    descuentoValor: Number(
      (cot as { descuento_valor?: number }).descuento_valor ??
        cot.descuento ??
        0,
    ),
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
