"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { ClienteStats } from "../actions"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

function frecuenciaLabel(n: number): {
  label: string
  className: string
  pulse: boolean
} {
  if (n >= 4)
    return {
      label: "Alta",
      className: "bg-teal-100 text-teal-700",
      pulse: true,
    }
  if (n >= 2)
    return {
      label: "Media",
      className: "bg-amber-100 text-amber-700",
      pulse: false,
    }
  return {
    label: "Nueva",
    className: "bg-gray-100 text-gray-600",
    pulse: false,
  }
}

function diasDesde(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

export function ClientesTable({ data }: { data: ClienteStats[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <Th></Th>
            <Th>Cliente</Th>
            <Th align="right">Órdenes</Th>
            <Th align="right">Total</Th>
            <Th align="right">Ticket prom.</Th>
            <Th align="right">Última</Th>
            <Th>Frecuencia</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                className="px-5 py-8 text-center text-sm text-gray-500"
              >
                Sin datos.
              </td>
            </tr>
          ) : (
            data.map((c, i) => {
              const f = frecuenciaLabel(c.numOrdenes)
              const isOpen = expanded === c.nombre
              return (
                <ClienteRow
                  key={`${c.nombre}-${i}`}
                  c={c}
                  i={i}
                  f={f}
                  isOpen={isOpen}
                  onToggle={() => setExpanded(isOpen ? null : c.nombre)}
                />
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

function ClienteRow({
  c,
  i,
  f,
  isOpen,
  onToggle,
}: {
  c: ClienteStats
  i: number
  f: { label: string; className: string; pulse: boolean }
  isOpen: boolean
  onToggle: () => void
}) {
  const dias = diasDesde(c.ultimaCompra)
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer transition-colors duration-150 hover:bg-teal-50"
      >
        <td className="px-3 py-3 text-gray-400">
          {isOpen ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </td>
        <td className="px-5 py-3 text-gray-900">
          <span className="text-xs text-gray-400 mr-2">#{i + 1}</span>
          {c.nombre}
        </td>
        <td className="px-5 py-3 text-right tabular-nums text-gray-500">
          {c.numOrdenes}
        </td>
        <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">
          {mxn.format(c.totalCompras)}
        </td>
        <td className="px-5 py-3 text-right tabular-nums text-gray-700">
          {mxn.format(c.ticketPromedio)}
        </td>
        <td className="px-5 py-3 text-right text-xs text-gray-500">
          {fechaFmt.format(new Date(c.ultimaCompra))}
        </td>
        <td className="px-5 py-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${f.className}`}
          >
            {f.pulse && (
              <span className="size-1.5 rounded-full bg-teal-500 animate-pulse" />
            )}
            {f.label}
          </span>
        </td>
      </tr>
      {isOpen && (
        <tr className="animate-in fade-in slide-in-from-top-1 duration-200">
          <td colSpan={7} className="bg-teal-50/60 p-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-6 py-4 text-sm">
              <Stat
                emoji="📅"
                label="Última compra"
                value={fechaFmt.format(new Date(c.ultimaCompra))}
              />
              <Stat
                emoji="⏱"
                label="Tiempo desde la última"
                value={dias === 0 ? "Hoy" : `Hace ${dias} día${dias === 1 ? "" : "s"}`}
                tone={
                  dias > 60
                    ? "text-amber-700"
                    : dias > 30
                      ? "text-blue-700"
                      : "text-emerald-700"
                }
              />
              <Stat
                emoji="🔁"
                label="Órdenes totales"
                value={`${c.numOrdenes}`}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function Stat({
  emoji,
  label,
  value,
  tone = "text-gray-900",
}: {
  emoji: string
  label: string
  value: string
  tone?: string
}) {
  return (
    <div>
      <div className="text-xs text-gray-500">
        <span className="mr-1">{emoji}</span>
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-semibold ${tone}`}>{value}</div>
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
