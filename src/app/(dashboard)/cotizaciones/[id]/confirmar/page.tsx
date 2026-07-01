import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import {
  ShoppingCart,
  User,
  Package,
  StickyNote,
  Pencil,
  ArrowRight,
  MessageSquare,
} from "lucide-react"
import { formatMXN } from "@/lib/utils"

function formatPhoneIntl(tel: string | null | undefined): string {
  if (!tel) return ""
  const digits = tel.replace(/\D/g, "")
  return digits.startsWith("52") ? digits : `52${digits}`
}

export default async function ConfirmarPedidoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: cot, error } = await supabase
    .from("cotizaciones")
    .select(
      `id, numero, fecha, valida_hasta, subtotal, iva, descuento, total,
       costo_productos, costo_envio, estatus, notas, cliente_id,
       clientes(id, nombre, nombre_negocio, telefono, email, ciudad, estado),
       cotizacion_items(
         id, cantidad, precio_unitario, costo_unitario, sort_order,
         productos(id, nombre, sku, peso, imagen_url)
       )`,
    )
    .eq("id", id)
    .maybeSingle()

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error.message}
        </div>
      </div>
    )
  }
  if (!cot) notFound()

  type Cliente = {
    id: string
    nombre: string
    nombre_negocio: string | null
    telefono: string | null
    email: string | null
    ciudad: string | null
    estado: string | null
  }
  type ItemRow = {
    id: string
    cantidad: number
    precio_unitario: number
    costo_unitario: number
    sort_order: number | null
    productos: {
      id: string
      nombre: string
      sku: string | null
      peso: string | null
      imagen_url: string | null
    } | null
  }

  const cliente = (cot.clientes as unknown as Cliente | null) ?? null
  const items =
    ((cot.cotizacion_items as unknown as ItemRow[]) ?? []).slice().sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    )

  const tel = formatPhoneIntl(cliente?.telefono)
  const wpText = `Hola ${cliente?.nombre ?? ""}! Recibimos tu pedido en Piel Canela (${cot.numero}). Te enviaremos tu cotización formal en breve. ¿Tienes alguna pregunta?`
  const wpUrl = tel
    ? `https://wa.me/${tel}?text=${encodeURIComponent(wpText)}`
    : null

  return (
    <div className="mx-auto max-w-3xl p-8 space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="mb-1 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#DFF7F4] text-[#0F766E]">
            <ShoppingCart className="size-5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-700">
              Pedido del portal
            </p>
            <h1 className="font-mono text-lg font-bold tracking-tight text-gray-900">
              {cot.numero}
            </h1>
          </div>
        </div>
      </div>

      {/* Datos del cliente */}
      <div className="rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <User className="size-4 text-gray-400" />
          Datos del cliente
        </h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">
              Nombre
            </p>
            <p className="mt-0.5 font-medium text-gray-900">
              {cliente?.nombre || "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">
              Negocio
            </p>
            <p className="mt-0.5 font-medium text-gray-900">
              {cliente?.nombre_negocio || "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">
              Teléfono
            </p>
            <p className="mt-0.5 font-medium text-[#0F766E]">
              {cliente?.telefono || "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">
              Email
            </p>
            <p className="mt-0.5 truncate font-medium text-gray-900">
              {cliente?.email || "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400">
              Ciudad
            </p>
            <p className="mt-0.5 font-medium text-gray-900">
              {cliente?.ciudad || "—"}
            </p>
          </div>
        </div>

        {cot.notas && (
          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
              <StickyNote className="size-3" />
              Notas del pedido
            </p>
            <p className="whitespace-pre-line text-xs text-amber-700">
              {cot.notas}
            </p>
          </div>
        )}
      </div>

      {/* Productos */}
      <div className="rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Package className="size-4 text-gray-400" />
          Productos solicitados
        </h2>
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            Esta cotización no tiene productos.
          </p>
        ) : (
          items.map((item) => {
            const linea =
              Number(item.cantidad) * Number(item.precio_unitario)
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 border-b border-[rgba(15,23,42,0.04)] py-2.5 last:border-0"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#F9FAFB] text-[10px] font-bold text-gray-400">
                  {item.productos?.sku?.slice(0, 2) ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {item.productos?.nombre ?? "—"}
                  </p>
                  <p className="text-xs text-gray-400">
                    {item.productos?.sku}
                    {item.productos?.peso ? ` · ${item.productos.peso}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-gray-900">
                    ×{item.cantidad}
                  </p>
                  <p className="text-xs tabular-nums text-gray-500">
                    {formatMXN(Number(item.precio_unitario))} c/u
                  </p>
                </div>
                <div className="w-24 text-right">
                  <p className="text-sm font-bold tabular-nums text-[#0F766E]">
                    {formatMXN(linea)}
                  </p>
                </div>
              </div>
            )
          })
        )}

        <div className="mt-4 flex items-center justify-between border-t border-[rgba(15,23,42,0.06)] pt-3">
          <p className="font-semibold text-gray-900">Total solicitado</p>
          <p className="text-xl font-bold tabular-nums text-[#0F766E]">
            {formatMXN(Number(cot.subtotal ?? 0))}
          </p>
        </div>
        <p className="mt-1 text-[11px] text-gray-400">
          Subtotal sin IVA ni envío. Ajusta antes de enviar la cotización
          formal.
        </p>
      </div>

      {/* Acciones */}
      <div className="flex gap-3">
        <Link
          href={`/cotizaciones/${id}/editar`}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-[#0F766E] bg-white py-3 text-sm font-semibold text-[#0F766E] transition-all hover:-translate-y-0.5 hover:bg-[#DFF7F4]"
        >
          <Pencil className="size-4" />
          Editar antes de enviar
        </Link>
        <Link
          href={`/cotizaciones/${id}`}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#0F766E] py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#115E59]"
        >
          Ver cotización completa
          <ArrowRight className="size-4" />
        </Link>
      </div>

      {wpUrl && (
        <a
          href={wpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-emerald-600"
        >
          <MessageSquare className="size-4" />
          Contactar por WhatsApp ahora
        </a>
      )}
    </div>
  )
}
