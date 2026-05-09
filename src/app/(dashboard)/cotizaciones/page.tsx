import Link from "next/link"
import { Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import type { Estatus } from "@/lib/cotizacion-types"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
})

const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

const estatusBadge: Record<Estatus, string> = {
  borrador: "bg-gray-100 text-gray-700",
  enviada: "bg-blue-100 text-blue-700",
  aceptada: "bg-emerald-100 text-emerald-700",
  rechazada: "bg-red-100 text-red-700",
  vencida: "bg-amber-100 text-amber-700",
}

const estatusLabel: Record<Estatus, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  vencida: "Vencida",
}

type Row = {
  id: string
  numero: string
  fecha: string
  total: number | null
  estatus: Estatus
  clientes: { nombre: string; nombre_negocio: string | null } | null
}

export default async function CotizacionesPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("cotizaciones")
    .select("id, numero, fecha, total, estatus, clientes(nombre, nombre_negocio)")
    .order("fecha", { ascending: false })
    .limit(200)

  const rows = (data ?? []) as unknown as Row[]

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Piel Canela"
            className="h-10 w-10 rounded-md object-contain"
          />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Cotizaciones</h1>
            <p className="text-gray-500 text-sm mt-1">
              {rows.length.toLocaleString("es-MX")} cotizaciones
            </p>
          </div>
        </div>
        <Link
          href="/cotizaciones/nueva"
          className="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-pink-700"
        >
          <Plus className="size-4" />
          Nueva Cotización
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error.message}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Número
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Cliente
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Fecha
              </th>
              <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                Total
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Estatus
              </th>
              <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && !error ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-500">
                  No hay cotizaciones aún.{" "}
                  <Link href="/cotizaciones/nueva" className="text-pink-600 underline">
                    Crear la primera
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono text-xs text-gray-700">
                    {r.numero}
                  </td>
                  <td className="px-5 py-3 text-gray-900">
                    {r.clientes?.nombre_negocio ?? r.clientes?.nombre ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {fechaFmt.format(new Date(r.fecha))}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums text-gray-900">
                    {r.total != null ? mxn.format(r.total) : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${estatusBadge[r.estatus]}`}
                    >
                      {estatusLabel[r.estatus]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/cotizaciones/${r.id}`}
                      className="text-sm text-pink-600 hover:underline"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
