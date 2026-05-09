import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { parseNotas } from "../../notas-util"
import { EditVentaForm } from "./edit-form"

export default async function EditarVentaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: venta, error } = await supabase
    .from("ventas")
    .select(
      `id, numero, fecha, subtotal, iva, descuento, total,
       cantidad_pagada, saldo_pendiente, estatus, notas,
       clientes(nombre, nombre_negocio)`,
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
  if (!venta) notFound()

  const { metodo, notas: notasLimpias } = parseNotas(venta.notas)
  type Cliente = { nombre: string; nombre_negocio: string | null } | null
  const cliente = venta.clientes as Cliente

  return (
    <div className="p-8">
      <nav className="mb-4 flex items-center gap-2 text-xs text-gray-500">
        <Link href="/ventas" className="hover:text-gray-900">
          Ventas
        </Link>
        <span>/</span>
        <Link href={`/ventas/${id}`} className="hover:text-gray-900 font-mono">
          {venta.numero}
        </Link>
        <span>/</span>
        <span className="text-gray-900">Editar</span>
      </nav>

      <div className="mb-6 flex items-center gap-3">
        <Link
          href={`/ventas/${id}`}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Volver al detalle"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="font-mono text-2xl font-semibold text-gray-900">
            {venta.numero}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {cliente?.nombre_negocio ?? cliente?.nombre ?? "Sin cliente"}
            {metodo && (
              <>
                {" · método de pago: "}
                <strong className="text-gray-700">{metodo}</strong>
              </>
            )}
          </p>
        </div>
      </div>

      <EditVentaForm
        id={id}
        subtotal={Number(venta.subtotal ?? 0)}
        descuento={Number(venta.descuento ?? 0)}
        ivaInicial={Number(venta.iva ?? 0)}
        cantidadPagadaInicial={Number(venta.cantidad_pagada ?? 0)}
        notasIniciales={notasLimpias}
      />
    </div>
  )
}
