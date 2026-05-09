"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { ArrowLeft, FileDown, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import type { CotizacionData, Estatus } from "@/lib/cotizacion-types"
import { CotizacionPreview } from "@/components/cotizaciones/CotizacionPreview"
import { downloadCotizacionPdf } from "@/lib/pdf"
import { marcarVendida } from "../actions"

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

export function CotizacionDetail({
  cotizacionId,
  numero,
  estatus,
  preview,
}: {
  cotizacionId: string
  numero: string
  estatus: Estatus
  preview: CotizacionData
}) {
  const [pending, startTransition] = useTransition()
  const [currentEstatus, setCurrentEstatus] = useState<Estatus>(estatus)
  const previewRef = useRef<HTMLDivElement>(null)

  function handleMarkSold() {
    if (currentEstatus === "aceptada") {
      toast.info("Esta cotización ya está marcada como vendida.")
      return
    }
    const itemSummary = preview.items
      .map((it) => `${it.cantidad}× ${it.nombre}`)
      .join(", ")
    if (
      !confirm(
        `Esto creará una venta y descontará el inventario de:\n\n${itemSummary}\n\n¿Continuar?`,
      )
    )
      return

    startTransition(async () => {
      const result = await marcarVendida(cotizacionId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setCurrentEstatus("aceptada")
      toast.success("Vendida. Inventario descontado.", {
        description: itemSummary,
      })
    })
  }

  async function handlePdf() {
    if (!previewRef.current) return
    try {
      const nombreCliente =
        preview.cliente?.nombre_negocio ??
        preview.cliente?.nombre ??
        "SinCliente"
      await downloadCotizacionPdf(previewRef.current, numero, nombreCliente)
    } catch (e) {
      toast.error(`Error al generar PDF: ${(e as Error).message}`)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/cotizaciones"
            className="text-gray-400 hover:text-gray-600"
            aria-label="Volver"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 font-mono">
              {numero}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${estatusBadge[currentEstatus]}`}
              >
                {estatusLabel[currentEstatus]}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleMarkSold}
            disabled={pending || currentEstatus === "aceptada"}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            <CheckCircle2 className="size-4" />
            {currentEstatus === "aceptada"
              ? "Vendida"
              : pending
                ? "Procesando…"
                : "Marcar como Vendida"}
          </button>
          <button
            type="button"
            onClick={handlePdf}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <FileDown className="size-4" />
            Descargar PDF
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-auto">
        <CotizacionPreview data={preview} innerRef={previewRef} />
      </div>
    </div>
  )
}
