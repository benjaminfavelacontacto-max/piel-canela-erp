"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { downloadCSV } from "@/lib/export-csv"
import type { VentaRow } from "./ventas-dashboard"

const ESTATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  pagada_parcial: "Pagada parcial",
  pagada_total: "Pagada total",
  cancelada: "Cancelada",
}

const round2 = (v: number | null | undefined) =>
  Math.round((Number(v) || 0) * 100) / 100

/**
 * Exporta a CSV (compatible con Excel) la lista de ventas que ya está cargada
 * en el dashboard. Incluye TODOS los registros recibidos (las internas Piel
 * Canela ya vienen excluidas desde el server). Las canceladas se incluyen con
 * su estatus para que el registro contable quede completo.
 */
export function ExportVentasButton({ ventas }: { ventas: VentaRow[] }) {
  const [busy, setBusy] = useState(false)

  function handleExport() {
    if (busy || ventas.length === 0) return
    setBusy(true)
    try {
      const headers = [
        "Número",
        "Fecha",
        "Cliente",
        "Negocio",
        "Estatus",
        "Subtotal",
        "Descuento",
        "IVA",
        "Total",
        "Costo productos",
        "Costo envío",
        "Utilidad neta",
        "Pagado",
        "Saldo pendiente",
        "Notas",
      ]
      const rows = ventas.map((v) => [
        v.numero,
        v.fecha,
        v.clientes?.nombre ?? "",
        v.clientes?.nombre_negocio ?? "",
        ESTATUS_LABEL[v.estatus] ?? v.estatus,
        round2(v.subtotal),
        round2(v.descuento),
        round2(v.iva),
        round2(v.total),
        round2(v.costo_productos),
        round2(v.costo_envio),
        round2(v.utilidad_neta),
        round2(v.cantidad_pagada),
        round2(v.saldo_pendiente),
        v.notas ?? "",
      ])
      const today = new Date().toISOString().slice(0, 10)
      downloadCSV(`ventas-${today}.csv`, headers, rows)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={busy || ventas.length === 0}
      title={
        ventas.length === 0
          ? "No hay ventas para exportar"
          : `Exportar ${ventas.length} ventas a CSV`
      }
      className="inline-flex h-[42px] items-center gap-2 rounded-[14px] border border-[rgba(15,23,42,0.06)] bg-white px-[18px] text-sm font-medium text-gray-700 transition-all hover:-translate-y-0.5 hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
    >
      <Download className="size-4" strokeWidth={1.75} />
      Exportar CSV
    </button>
  )
}
