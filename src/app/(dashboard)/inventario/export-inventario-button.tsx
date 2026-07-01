"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { downloadCSV } from "@/lib/export-csv"
import type { ProductoEnriquecido } from "./inventario-view"

const ESTATUS_LABEL: Record<string, string> = {
  ok: "OK",
  bajo: "Stock bajo",
  agotado: "Agotado",
}

const round2 = (v: number | null | undefined) =>
  Math.round((Number(v) || 0) * 100) / 100

/** Exporta a CSV (Excel) el inventario con stock, costos USD/MXN y márgenes. */
export function ExportInventarioButton({
  productos,
}: {
  productos: ProductoEnriquecido[]
}) {
  const [busy, setBusy] = useState(false)

  function handleExport() {
    if (busy || productos.length === 0) return
    setBusy(true)
    try {
      const headers = [
        "SKU",
        "Nombre",
        "Categoría",
        "Proveedor",
        "Estatus",
        "Stock actual",
        "Stock mínimo",
        "Precio público (MXN)",
        "Costo unitario prom (MXN)",
        "Precio USD",
        "Tipo de cambio",
        "Costo envío USD",
        "Costo total (MXN)",
        "Margen %",
        "Unidades vendidas",
        "Valor inventario (MXN)",
        "Capital invertido (MXN)",
      ]
      const rows = productos.map((p) => [
        p.sku,
        p.nombre_display ?? p.nombre,
        p.categoria,
        p.proveedor ?? "",
        ESTATUS_LABEL[p.estatus] ?? p.estatus,
        p.stock_actual,
        p.stock_minimo,
        round2(p.precio_publico),
        round2(p.costo_unitario_prom),
        round2(p.precio_usd),
        round2(p.tipo_cambio),
        round2(p.costo_envio_usd),
        round2(p.costo_total_mxn),
        round2(p.margen_pct),
        p.unidades_vendidas,
        round2(p.valor_inventario),
        round2(p.capital_invertido),
      ])
      const today = new Date().toISOString().slice(0, 10)
      downloadCSV(`inventario-${today}.csv`, headers, rows)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={busy || productos.length === 0}
      title={
        productos.length === 0
          ? "No hay productos para exportar"
          : `Exportar ${productos.length} productos a CSV`
      }
      className="inline-flex items-center gap-1.5 rounded-xl border border-[rgba(15,23,42,0.1)] bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Download className="size-4" />
      Exportar CSV
    </button>
  )
}
