"use client"

import { useRouter } from "next/navigation"
import { Download, Printer } from "lucide-react"
import { downloadCSV } from "@/lib/export-csv"

type Cell = string | number | null

/** Barra de acciones del reporte: mes, imprimir/PDF y CSV. No se imprime. */
export function ReporteAcciones({
  mes,
  opciones,
  csv,
}: {
  mes: string
  opciones: { value: string; label: string }[]
  csv: { nombre: string; headers: string[]; rows: Cell[][] }
}) {
  const router = useRouter()
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <label className="sr-only" htmlFor="reporte-mes">
        Mes del reporte
      </label>
      <select
        id="reporte-mes"
        value={mes}
        onChange={(e) => router.push(`/finanzas/reporte?mes=${e.target.value}`)}
        className="h-11 rounded-xl border border-gray-200 bg-pc-card px-3 text-sm font-medium capitalize text-gray-800 md:h-10"
      >
        {opciones.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => downloadCSV(csv.nombre, csv.headers, csv.rows)}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-gray-200 bg-pc-card px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 md:h-10"
      >
        <Download className="size-4" aria-hidden /> CSV
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-pc-teal px-4 text-sm font-semibold text-white hover:bg-pc-teal-hover md:h-10"
      >
        <Printer className="size-4" aria-hidden /> Imprimir / PDF
      </button>
    </div>
  )
}
