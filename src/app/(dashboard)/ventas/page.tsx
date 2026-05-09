import Link from "next/link"
import { ShoppingBag, TrendingUp, Wallet } from "lucide-react"
import { createClient } from "@/lib/supabase/server"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
})

const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

type Estatus = "pendiente" | "pagada_parcial" | "pagada_total" | "cancelada"

const estatusBadge: Record<Estatus, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  pagada_parcial: "bg-blue-100 text-blue-700",
  pagada_total: "bg-emerald-100 text-emerald-700",
  cancelada: "bg-gray-100 text-gray-600",
}

const estatusLabel: Record<Estatus, string> = {
  pendiente: "Pendiente",
  pagada_parcial: "Parcial",
  pagada_total: "Pagada",
  cancelada: "Cancelada",
}

type Row = {
  id: string
  numero: string
  fecha: string
  total: number | null
  ganancia: number | null
  cantidad_pagada: number | null
  saldo_pendiente: number | null
  estatus: Estatus
  clientes: { nombre: string; nombre_negocio: string | null } | null
}

export default async function VentasPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ventas")
    .select(
      "id, numero, fecha, total, ganancia, cantidad_pagada, saldo_pendiente, estatus, clientes(nombre, nombre_negocio)",
    )
    .order("fecha", { ascending: false })
    .limit(200)

  const rows = (data ?? []) as unknown as Row[]
  const totalVendido = rows.reduce((s, r) => s + Number(r.total ?? 0), 0)
  const totalGanancia = rows.reduce((s, r) => s + Number(r.ganancia ?? 0), 0)
  const totalPendiente = rows.reduce(
    (s, r) => s + Number(r.saldo_pendiente ?? 0),
    0,
  )

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingBag className="size-7 text-amber-700" />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Ventas</h1>
            <p className="text-gray-500 text-sm mt-1">
              {rows.length.toLocaleString("es-MX")} ventas
            </p>
          </div>
        </div>
        <Link
          href="/ventas/nueva"
          className="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-pink-700"
        >
          Nueva Venta
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total vendido"
          value={mxn.format(totalVendido)}
          icon={ShoppingBag}
          tone="text-gray-900"
        />
        <StatCard
          label="Ganancia"
          value={mxn.format(totalGanancia)}
          icon={TrendingUp}
          tone="text-emerald-700"
        />
        <StatCard
          label="Saldo pendiente"
          value={mxn.format(totalPendiente)}
          icon={Wallet}
          tone={totalPendiente > 0 ? "text-amber-700" : "text-gray-900"}
        />
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
              <Th>Orden</Th>
              <Th>Cliente</Th>
              <Th>Fecha</Th>
              <Th align="right">Total</Th>
              <Th align="right">Ganancia</Th>
              <Th align="right">Pagado</Th>
              <Th align="right">Pendiente</Th>
              <Th>Estatus</Th>
              <Th align="right">Acciones</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && !error ? (
              <tr>
                <td colSpan={9} className="px-5 py-12 text-center text-sm text-gray-500">
                  No hay ventas todavía.{" "}
                  <Link href="/ventas/nueva" className="text-pink-600 underline">
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
                  <Money value={r.total} bold />
                  <Money value={r.ganancia} className="text-emerald-700" />
                  <Money value={r.cantidad_pagada} />
                  <Money
                    value={r.saldo_pendiente}
                    className={
                      Number(r.saldo_pendiente ?? 0) > 0 ? "text-amber-700" : ""
                    }
                  />
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${estatusBadge[r.estatus]}`}
                    >
                      {estatusLabel[r.estatus]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/ventas/${r.id}`}
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

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode
  align?: "left" | "right" | "center"
}) {
  return (
    <th
      className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-gray-500"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  )
}

function Money({
  value,
  bold = false,
  className = "",
}: {
  value: number | null
  bold?: boolean
  className?: string
}) {
  return (
    <td
      className={`px-5 py-3 text-right tabular-nums ${bold ? "font-semibold text-gray-900" : "text-gray-700"} ${className}`}
    >
      {value != null ? mxn.format(Number(value)) : "—"}
    </td>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  tone: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </span>
        <Icon className={`size-4 ${tone}`} />
      </div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>
        {value}
      </div>
    </div>
  )
}
