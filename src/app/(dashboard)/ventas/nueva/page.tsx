import { createClient } from "@/lib/supabase/server"
import { VentaForm, type ProductoOpcion } from "../venta-form"

type Cliente = {
  id: string
  nombre: string
  nombre_negocio: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  ciudad: string | null
}

type Socio = {
  id: string
  nombre: string
  email: string | null
  porcentaje: number
}

export type CotizacionLoaded = {
  id: string
  numero: string
  cliente_id: string | null
  subtotal: number
  iva: number
  descuento: number
  total: number
  costo_productos: number
  estatus: string
  itemsCount: number
}

export default async function NuevaVentaPage({
  searchParams,
}: {
  searchParams: Promise<{ cotizacion?: string }>
}) {
  const { cotizacion: cotizacionId } = await searchParams
  const supabase = await createClient()

  const [clientesRes, sociosRes, productosRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nombre, nombre_negocio, telefono, email, direccion, ciudad")
      .order("nombre", { ascending: true }),
    supabase
      .from("socios")
      .select("id, nombre, email, porcentaje")
      .eq("activo", true)
      .order("nombre", { ascending: true }),
    supabase
      .from("productos")
      .select(
        "id, sku, nombre, nombre_display, costo, precios_producto(precio, listas_precios(nombre))",
      )
      .eq("activo", true)
      .order("nombre", { ascending: true }),
  ])

  const clientes = (clientesRes.data ?? []) as Cliente[]
  const socios = (sociosRes.data ?? []) as Socio[]

  // Productos con precio público (MXN) y costo, para el editor de partidas
  // opcional de la venta manual. Se descarta lo que no tenga precio.
  type ProdRow = {
    id: string
    sku: string | null
    nombre: string
    nombre_display: string | null
    costo: number | null
    precios_producto: {
      precio: number | null
      listas_precios: { nombre: string } | null
    }[]
  }
  const productos: ProductoOpcion[] = ((productosRes.data ?? []) as unknown as ProdRow[])
    .map((p) => {
      const precio =
        p.precios_producto?.find(
          (pp) => pp.listas_precios?.nombre === "Pública MXN",
        )?.precio ?? 0
      return {
        id: p.id,
        sku: p.sku,
        nombre: p.nombre_display ?? p.nombre,
        precio: Number(precio),
        costo: Number(p.costo ?? 0),
      }
    })
    .filter((p) => p.precio > 0)

  let cotizacion: CotizacionLoaded | null = null
  let cotizacionError: string | null = null

  if (cotizacionId) {
    const { data: cot, error: cotErr } = await supabase
      .from("cotizaciones")
      .select(
        "id, numero, cliente_id, subtotal, iva, descuento, total, costo_productos, estatus",
      )
      .eq("id", cotizacionId)
      .maybeSingle()

    if (cotErr) {
      cotizacionError = cotErr.message
    } else if (!cot) {
      cotizacionError = `Cotización ${cotizacionId} no encontrada.`
    } else {
      const { count } = await supabase
        .from("cotizacion_items")
        .select("*", { count: "exact", head: true })
        .eq("cotizacion_id", cot.id)

      cotizacion = {
        id: cot.id,
        numero: cot.numero,
        cliente_id: cot.cliente_id,
        subtotal: Number(cot.subtotal ?? 0),
        iva: Number(cot.iva ?? 0),
        descuento: Number(cot.descuento ?? 0),
        total: Number(cot.total ?? 0),
        costo_productos: Number(cot.costo_productos ?? 0),
        estatus: cot.estatus,
        itemsCount: count ?? 0,
      }
    }
  }

  return (
    <VentaForm
      clientes={clientes}
      socios={socios}
      productos={productos}
      cotizacion={cotizacion}
      cotizacionError={cotizacionError}
    />
  )
}
