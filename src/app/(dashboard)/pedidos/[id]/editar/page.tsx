import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { EditarPedidoForm, type PedidoInicial } from "./editar-pedido-form"

export default async function EditarPedidoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("pedidos_compra")
    .select(
      `
      id, nombre, fecha, proveedor_id, tipo, tipo_cambio, costo_envio_usd,
      inversion_sandra_usd, inversion_benjamin_usd, notas,
      pedido_compra_items(
        producto_id, cantidad, precio_unitario_usd, proveedor_id, sort_order,
        productos(sku, nombre)
      )
    `,
    )
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("[editar pedido] query error:", error)
    notFound()
  }
  if (!data) notFound()

  type ItemRow = {
    producto_id: string
    cantidad: number
    precio_unitario_usd: number
    proveedor_id: string | null
    sort_order: number | null
    productos: { sku: string; nombre: string } | null
  }
  const ped = data as unknown as {
    nombre: string
    fecha: string
    proveedor_id: string | null
    tipo: string | null
    tipo_cambio: number
    costo_envio_usd: number | null
    inversion_sandra_usd: number | null
    inversion_benjamin_usd: number | null
    notas: string | null
    pedido_compra_items: ItemRow[]
  }

  const items = (ped.pedido_compra_items ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((it) => ({
      producto_id: it.producto_id,
      sku: it.productos?.sku ?? "",
      nombre: it.productos?.nombre ?? "",
      cantidad: Number(it.cantidad),
      precio_usd: Number(it.precio_unitario_usd),
      proveedor_id: it.proveedor_id ?? null,
    }))

  const inicial: PedidoInicial = {
    nombre: ped.nombre,
    fecha: ped.fecha,
    proveedor_id: ped.proveedor_id,
    tipo: ped.tipo ?? "productos",
    tipo_cambio: Number(ped.tipo_cambio) || 20.7,
    envio_total_usd: Number(ped.costo_envio_usd) || 0,
    notas: ped.notas,
    sandra_usd: Number(ped.inversion_sandra_usd) || 0,
    benjamin_usd: Number(ped.inversion_benjamin_usd) || 0,
    items,
  }

  const [{ data: prods }, { data: provs }, { data: cats }] = await Promise.all([
    supabase
      .from("productos")
      .select("id, sku, nombre, precio_usd, proveedor_id")
      .eq("activo", true)
      .order("nombre"),
    supabase.from("proveedores").select("id, nombre").order("nombre"),
    supabase.from("categorias").select("id, nombre").order("nombre"),
  ])

  const productos = (prods ?? []) as {
    id: string
    sku: string
    nombre: string
    precio_usd: number | null
    proveedor_id: string | null
  }[]
  const proveedorOptions = ((provs ?? []) as { id: string; nombre: string }[]).filter(
    (p) => p.nombre,
  )
  const categoriaOptions = ((cats ?? []) as { id: string; nombre: string }[]).filter(
    (c) => c.nombre,
  )

  return (
    <EditarPedidoForm
      pedidoId={id}
      inicial={inicial}
      productos={productos}
      proveedorOptions={proveedorOptions}
      categoriaOptions={categoriaOptions}
    />
  )
}
