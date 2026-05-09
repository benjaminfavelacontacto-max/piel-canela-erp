import { createClient } from "@/lib/supabase/server"
import { VentaForm } from "../venta-form"

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

  const [clientesRes, sociosRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nombre, nombre_negocio, telefono, email, direccion, ciudad")
      .order("nombre", { ascending: true }),
    supabase
      .from("socios")
      .select("id, nombre, email, porcentaje")
      .eq("activo", true)
      .order("nombre", { ascending: true }),
  ])

  const clientes = (clientesRes.data ?? []) as Cliente[]
  const socios = (sociosRes.data ?? []) as Socio[]

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
      cotizacion={cotizacion}
      cotizacionError={cotizacionError}
    />
  )
}
