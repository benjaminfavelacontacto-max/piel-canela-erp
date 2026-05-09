"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  FileDown,
  CheckCircle2,
  Pencil,
  Copy,
  ShoppingBag,
} from "lucide-react"
import { toast } from "sonner"
import type { CotizacionData, Estatus } from "@/lib/cotizacion-types"
import { CotizacionPreview } from "@/components/cotizaciones/CotizacionPreview"
import { SpreadsheetItems } from "@/components/cotizaciones/spreadsheet-items"
import { downloadCotizacionPdf } from "@/lib/pdf"
import { marcarVendida, duplicarCotizacion } from "../actions"

const estatusBadge: Record<Estatus, string> = {
  borrador: "bg-gray-100 text-gray-700",
  enviada: "bg-blue-100 text-blue-700",
  aceptada: "bg-teal-100 text-teal-700",
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
    <div className="p-4">
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
        <div className="flex flex-wrap items-center gap-2">
          {currentEstatus === "aceptada" && (
            <Link
              href={`/ventas/nueva?cotizacion=${cotizacionId}`}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#115E59]"
            >
              <ShoppingBag className="size-4" />
              Convertir a Venta
            </Link>
          )}
          <button
            type="button"
            onClick={handleMarkSold}
            disabled={pending || currentEstatus === "aceptada"}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-teal-300"
          >
            <CheckCircle2 className="size-4" />
            {currentEstatus === "aceptada"
              ? "Vendida"
              : pending
                ? "Procesando…"
                : "Marcar como Vendida"}
          </button>
          <Link
            href={`/cotizaciones/${cotizacionId}/editar`}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <Pencil className="size-4" />
            Editar
          </Link>
          <form action={duplicarCotizacion.bind(null, cotizacionId)}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Copy className="size-4" />
              Duplicar
            </button>
          </form>
          <button
            type="button"
            onClick={handlePdf}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <FileDown className="size-4" />
            PDF
          </button>
        </div>
      </div>

      <section className="mb-6 space-y-2">
        <header className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
            Análisis de items
          </h2>
          <span className="text-xs text-gray-400">
            {preview.items.length} línea
            {preview.items.length === 1 ? "" : "s"}
          </span>
        </header>
        <SpreadsheetItems items={preview.items} />
      </section>

      {/* Nota IVA referencial: cotizaciones.iva es solo presentación al
          cliente. El IVA real cobrado se confirma al registrar la venta. */}
      {preview.iva > 0 && (
        <p className="text-xs italic text-gray-400">
          * IVA incluido en cotización para referencia del cliente. El cobro
          real se confirma al registrar la venta y puede diferir.
        </p>
      )}

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-auto">
        <CotizacionPreview data={preview} innerRef={previewRef} />
      </div>
    </div>
  )
}
