"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { downloadCSV } from "@/lib/export-csv"
import type { EnrichedCliente } from "./clientes-dashboard"

const STATUS_LABEL: Record<string, string> = {
  prospecto: "Prospecto",
  recurrente: "Recurrente",
  activo: "Activo",
  nuevo: "Nuevo",
  inactivo: "Inactivo",
  sin_actividad: "Sin actividad",
}

const round2 = (v: number | null | undefined) =>
  Math.round((Number(v) || 0) * 100) / 100

/**
 * Exporta a CSV (Excel) la cartera de clientes ya enriquecida (LTV, utilidad,
 * frecuencia, etc.). Las internas Piel Canela ya vienen excluidas del server.
 */
export function ExportClientesButton({
  clientes,
}: {
  clientes: EnrichedCliente[]
}) {
  const [busy, setBusy] = useState(false)

  function handleExport() {
    if (busy || clientes.length === 0) return
    setBusy(true)
    try {
      const headers = [
        "Nombre",
        "Negocio",
        "Tipo",
        "Estatus",
        "Teléfono",
        "Email",
        "Ciudad",
        "RFC",
        "Compras",
        "Total comprado",
        "Utilidad",
        "Saldo pendiente",
        "Ticket promedio",
        "Frecuencia (días)",
        "Días sin compra",
        "Primer pedido",
        "Último pedido",
        "Vendedor",
      ]
      const rows = clientes.map((c) => [
        c.nombre,
        c.nombre_negocio ?? "",
        c.tipo ?? "",
        STATUS_LABEL[c.status] ?? c.status,
        c.telefono ?? "",
        c.email ?? "",
        c.ciudad ?? "",
        c.rfc ?? "",
        c.ventas_count,
        round2(c.ltv),
        round2(c.utilidad_total),
        round2(c.saldo_total),
        round2(c.ticket_promedio),
        c.frecuencia_dias ?? "",
        c.dias_sin_compra ?? "",
        c.primer_pedido ?? "",
        c.ultimo_pedido ?? "",
        c.vendedor_nombre ?? "",
      ])
      const today = new Date().toISOString().slice(0, 10)
      downloadCSV(`clientes-${today}.csv`, headers, rows)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={busy || clientes.length === 0}
      title={
        clientes.length === 0
          ? "No hay clientes para exportar"
          : `Exportar ${clientes.length} clientes a CSV`
      }
      className="pc-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Download className="size-4" strokeWidth={1.75} />
      Exportar CSV
    </button>
  )
}
