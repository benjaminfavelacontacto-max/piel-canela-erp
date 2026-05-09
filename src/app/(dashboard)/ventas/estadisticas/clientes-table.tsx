"use client"

import { useState } from "react"
import type { ClienteStats } from "../actions"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const fechaCorta = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "2-digit",
})

function frecuenciaBadge(n: number): { label: string; className: string } {
  if (n >= 4)
    return {
      label: "● Alta",
      className: "bg-green-50 text-green-700",
    }
  if (n >= 2)
    return {
      label: "● Media",
      className: "bg-yellow-50 text-yellow-700",
    }
  return { label: "● Nueva", className: "bg-gray-50 text-gray-500" }
}

function diasDesde(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

export function ClientesTable({ data }: { data: ClienteStats[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const maxTotal = data[0]?.totalCompras ?? 1

  if (data.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-gray-400">Sin datos.</div>
    )
  }

  return (
    <div className="divide-y divide-gray-50">
      {data.map((c) => {
        const isOpen = expanded === c.nombre
        const f = frecuenciaBadge(c.numOrdenes)
        const ratio = maxTotal > 0 ? (c.totalCompras / maxTotal) * 100 : 0
        const inicial = c.nombre.trim()[0]?.toUpperCase() ?? "?"
        const ticket = c.numOrdenes > 0 ? c.totalCompras / c.numOrdenes : 0
        return (
          <div
            key={c.nombre}
            className="cursor-pointer p-4 transition-colors hover:bg-gray-50"
            onClick={() => setExpanded(isOpen ? null : c.nombre)}
          >
            <div className="flex items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 text-xs font-bold text-white">
                {inicial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {c.nombre}
                  </p>
                  <p className="ml-2 shrink-0 text-sm font-bold text-gray-900">
                    {mxn.format(c.totalCompras)}
                  </p>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-700"
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${f.className}`}
                  >
                    {f.label}
                  </span>
                </div>
              </div>
            </div>
            {isOpen && (
              <div className="mt-3 grid grid-cols-3 gap-3 border-t border-gray-100 pt-3 animate-in slide-in-from-top-2 duration-200">
                <div className="text-center">
                  <p className="text-xs text-gray-400">Órdenes</p>
                  <p className="font-bold text-gray-900">{c.numOrdenes}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">Ticket prom.</p>
                  <p className="font-bold text-gray-900">{mxn.format(ticket)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400">Última compra</p>
                  <p className="font-bold text-gray-900 text-xs">
                    {fechaCorta.format(new Date(c.ultimaCompra))}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    hace {diasDesde(c.ultimaCompra)} días
                  </p>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
