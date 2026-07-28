"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  FileDown,
  CheckCircle2,
  Pencil,
  Copy,
  ShoppingBag,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Gift,
} from "lucide-react"
import { toast } from "sonner"
import type { CotizacionData, Estatus } from "@/lib/cotizacion-types"
import { CotizacionPreview } from "@/components/cotizaciones/CotizacionPreview"
import { SpreadsheetItems } from "@/components/cotizaciones/spreadsheet-items"
import { downloadCotizacionPdf } from "@/lib/pdf"
import { resumenRegalos } from "@/lib/regalos"
import { formatMXN2 } from "@/lib/utils"
import { CotizacionKpis } from "./cotizacion-kpis"
import {
  marcarVendida,
  duplicarCotizacion,
  eliminarCotizacion,
  revertirCotizacion,
} from "../actions"

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

/** Partida cuya existencia no alcanza para lo cotizado. */
export type Faltante = {
  nombre: string
  sku: string | null
  cantidad: number
  stock: number
}

export function CotizacionDetail({
  cotizacionId,
  numero,
  estatus,
  ventaAsociada,
  faltantes,
  preview,
  finanzas,
}: {
  cotizacionId: string
  numero: string
  estatus: Estatus
  ventaAsociada: { id: string; numero: string } | null
  faltantes: Faltante[]
  preview: CotizacionData
  /** Columnas financieras de la cotización que el preview no trae. */
  finanzas: {
    costoProductos: number
    costoEnvio: number
    utilidadNetaBD: number | null
  }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [currentEstatus, setCurrentEstatus] = useState<Estatus>(estatus)
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmarRevertir, setConfirmarRevertir] = useState(false)
  const [reverting, setReverting] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  // "Vendida" = existe una venta generada desde esta cotización. El estatus
  // "aceptada" NO basta: se puede poner a mano desde el desplegable de la lista
  // (`cambiarEstatusCotizacion`), que sólo escribe el estatus y no crea venta.
  // Tomarlo como "vendida" dejaba la cotización en un callejón sin salida — el
  // único botón que genera la venta quedaba deshabilitado para siempre.
  // Venta recién creada en esta sesión (antes de que el refresh traiga
  // `ventaAsociada` del servidor).
  const [ventaCreada, setVentaCreada] = useState<string | null>(null)
  const yaVendida = ventaAsociada != null || ventaCreada != null
  // Sólo bloquea mientras la venta no exista: si ya se vendió, el inventario ya
  // se descontó y los faltantes de ahora son consecuencia, no impedimento.
  const bloqueadoPorStock = !yaVendida && faltantes.length > 0
  // Cortesías incluidas: cuánto costaron (pérdida) y cuánto valían.
  const regalos = resumenRegalos(preview.items)

  async function handleEliminar() {
    setDeleting(true)
    const result = await eliminarCotizacion(cotizacionId)
    setDeleting(false)
    if (!result.ok) {
      toast.error(result.error || "No se pudo eliminar")
      return
    }
    toast.success("Cotización eliminada")
    setConfirmarEliminar(false)
    router.push("/cotizaciones")
  }

  async function handleRevertir() {
    setReverting(true)
    const result = await revertirCotizacion(cotizacionId)
    setReverting(false)
    if (!result.ok) {
      toast.error(result.error || "No se pudo revertir")
      return
    }
    setConfirmarRevertir(false)
    setCurrentEstatus("borrador")
    toast.success("Revertida a cotización", {
      description: "Venta eliminada e inventario restaurado.",
    })
    router.refresh()
  }

  function handleMarkSold() {
    if (ventaAsociada || ventaCreada) {
      toast.info(
        `Esta cotización ya generó la venta ${ventaAsociada?.numero ?? ""}`.trim(),
      )
      return
    }
    if (bloqueadoPorStock) {
      toast.error(
        `Sin existencias para ${faltantes.length} ${
          faltantes.length === 1 ? "producto" : "productos"
        }.`,
        {
          description: faltantes
            .map((f) => `${f.nombre}: pide ${f.cantidad}, hay ${f.stock}`)
            .join(" · "),
        },
      )
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
      // Cierra el botón de inmediato: `ventaAsociada` llega del servidor y no
      // se actualiza hasta el refresh, así que sin esto un segundo clic crearía
      // una venta duplicada.
      setVentaCreada(result.ventaId ?? "creada")
      toast.success("Vendida. Inventario descontado.", {
        description: itemSummary,
      })
      router.refresh()
    })
  }

  async function handlePdf() {
    if (!previewRef.current) return
    try {
      await downloadCotizacionPdf(previewRef.current, numero)
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
              {yaVendida ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="size-3" />
                  Vendida
                </span>
              ) : (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${estatusBadge[currentEstatus]}`}
                >
                  {estatusLabel[currentEstatus]}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ventaAsociada ? (
            <>
              <Link
                href={`/ventas/${ventaAsociada.id}`}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100"
                title={`Esta cotización ya se vendió (${ventaAsociada.numero}). Ver la venta.`}
              >
                <CheckCircle2 className="size-4" />
                Ver venta
              </Link>
              <button
                type="button"
                onClick={() => setConfirmarRevertir(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm transition-colors hover:bg-amber-100"
                title="Deshacer la venta y regresar la cotización a borrador"
              >
                <RotateCcw className="size-4" />
                Revertir a cotización
              </button>
            </>
          ) : (
            <>
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
                disabled={pending || ventaCreada != null || bloqueadoPorStock}
                title={
                  bloqueadoPorStock
                    ? `Sin existencias para: ${faltantes
                        .map((f) => `${f.nombre} (pide ${f.cantidad}, hay ${f.stock})`)
                        .join(", ")}`
                    : undefined
                }
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-teal-300"
              >
                <CheckCircle2 className="size-4" />
                {pending
                  ? "Procesando…"
                  : bloqueadoPorStock
                    ? "Falta inventario"
                    : "Marcar como Vendida"}
              </button>
            </>
          )}
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
          {!yaVendida && (
            <button
              type="button"
              onClick={() => setConfirmarEliminar(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50"
              title="Eliminar cotización"
            >
              <Trash2 className="size-4" />
              Eliminar
            </button>
          )}
        </div>
      </div>

      {bloqueadoPorStock && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                No se puede vender: falta inventario en{" "}
                {faltantes.length}{" "}
                {faltantes.length === 1 ? "producto" : "productos"}
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                La venta descuenta existencias y se cancela entera si alguna
                partida no alcanza. Da entrada al inventario o ajusta las
                cantidades de la cotización.
              </p>
              <ul className="mt-2 space-y-1">
                {faltantes.map((f) => (
                  <li
                    key={`${f.sku ?? f.nombre}`}
                    className="flex flex-wrap items-baseline gap-x-2 text-xs text-amber-900"
                  >
                    <span className="font-medium">{f.nombre}</span>
                    {f.sku && (
                      <span className="font-mono text-[11px] text-amber-700">
                        {f.sku}
                      </span>
                    )}
                    <span>
                      pide <b>{f.cantidad}</b> · hay <b>{f.stock}</b>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {confirmarEliminar && (
        <DeleteCotModal
          numero={numero}
          loading={deleting}
          onCancel={() => setConfirmarEliminar(false)}
          onConfirm={handleEliminar}
        />
      )}

      {confirmarRevertir && (
        <RevertCotModal
          numero={numero}
          ventaNumero={ventaAsociada?.numero ?? null}
          loading={reverting}
          onCancel={() => setConfirmarRevertir(false)}
          onConfirm={handleRevertir}
        />
      )}

      {/* KPIs financieros con (?) explicativo por tarjeta */}
      <CotizacionKpis
        subtotal={preview.subtotal}
        iva={preview.iva}
        descuento={preview.descuento}
        total={preview.total}
        costoProductos={finanzas.costoProductos}
        costoEnvio={finanzas.costoEnvio}
        utilidadNetaBD={finanzas.utilidadNetaBD}
        items={preview.items}
      />

      {regalos.lineas > 0 && (
        <div className="mb-6 rounded-xl border border-fuchsia-200 bg-fuchsia-50/60 p-4">
          <div className="flex items-start gap-2">
            <Gift className="mt-0.5 size-4 shrink-0 text-fuchsia-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fuchsia-900">
                Esta cotización incluye {regalos.piezas}{" "}
                {regalos.piezas === 1 ? "pieza de regalo" : "piezas de regalo"}
                {" "}en {regalos.lineas}{" "}
                {regalos.lineas === 1 ? "partida" : "partidas"}
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <GiftStat
                  label="Costo (pérdida real)"
                  value={formatMXN2(regalos.costo)}
                  tone="text-rose-700"
                  hint="Ya restado de la utilidad neta"
                />
                <GiftStat
                  label="Valor obsequiado"
                  value={formatMXN2(regalos.valor)}
                  tone="text-fuchsia-700"
                  hint="Precio de lista de lo regalado"
                />
                <GiftStat
                  label="Margen cedido"
                  value={formatMXN2(regalos.margenCedido)}
                  tone="text-gray-700"
                  hint="Utilidad que se dejó de ganar"
                />
              </div>
            </div>
          </div>
        </div>
      )}

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

function GiftStat({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: string
  tone: string
  hint: string
}) {
  return (
    <div className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-fuchsia-200/70">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${tone}`}>
        {value}
      </div>
      <div className="text-[10px] text-gray-500">{hint}</div>
    </div>
  )
}

function DeleteCotModal({
  numero,
  loading,
  onCancel,
  onConfirm,
}: {
  numero: string
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white p-6 shadow-[0_24px_48px_rgba(15,23,42,0.16)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-rose-50">
          <Trash2 className="size-6 text-rose-500" />
        </div>
        <h3 className="mb-1 text-center text-base font-bold text-gray-900">
          ¿Eliminar cotización?
        </h3>
        <p className="mb-1 text-center font-mono text-sm font-semibold text-gray-700">
          {numero}
        </p>
        <p className="mb-5 text-center text-xs text-gray-400">
          Esta acción no se puede deshacer. Se eliminarán también todos sus
          productos.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-[rgba(15,23,42,0.06)] py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-[#F9FAFB]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <>
                <div className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Eliminando…
              </>
            ) : (
              <>
                <Trash2 className="size-3.5" />
                Eliminar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function RevertCotModal({
  numero,
  ventaNumero,
  loading,
  onCancel,
  onConfirm,
}: {
  numero: string
  ventaNumero: string | null
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white p-6 shadow-[0_24px_48px_rgba(15,23,42,0.16)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-amber-50">
          <RotateCcw className="size-6 text-amber-500" />
        </div>
        <h3 className="mb-1 text-center text-base font-bold text-gray-900">
          ¿Revertir a cotización?
        </h3>
        <p className="mb-1 text-center font-mono text-sm font-semibold text-gray-700">
          {numero}
        </p>
        <p className="mb-5 text-center text-xs text-gray-500">
          {ventaNumero ? (
            <>
              Se eliminará la venta <strong>{ventaNumero}</strong>, se
              devolverá el stock al inventario
            </>
          ) : (
            <>Se devolverá el stock al inventario</>
          )}{" "}
          y la cotización volverá a <strong>borrador</strong>. Esta acción no se
          puede deshacer.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-[rgba(15,23,42,0.06)] py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-[#F9FAFB]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <>
                <div className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Revirtiendo…
              </>
            ) : (
              <>
                <RotateCcw className="size-3.5" />
                Revertir
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
