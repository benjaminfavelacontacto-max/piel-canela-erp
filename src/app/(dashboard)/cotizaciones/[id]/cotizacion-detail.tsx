"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  FileDown,
  CheckCircle2,
  Pencil,
  Copy,
  ShoppingBag,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import type { CotizacionData, CotizacionItem, Estatus } from "@/lib/cotizacion-types"
import { CotizacionPreview } from "@/components/cotizaciones/CotizacionPreview"
import { SpreadsheetItems } from "@/components/cotizaciones/spreadsheet-items"
import { downloadCotizacionPdf } from "@/lib/pdf"
import {
  marcarVendida,
  duplicarCotizacion,
  eliminarCotizacion,
} from "../actions"

// Light theme V1.1 — paletas por estatus
const estatusStyle: Record<
  Estatus,
  { label: string; text: string; bg: string; border: string }
> = {
  borrador:  { label: "Borrador",  text: "#475569", bg: "#F1F5F9", border: "#CBD5E1" },
  enviada:   { label: "Enviada",   text: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" },
  aceptada:  { label: "Aceptada",  text: "#047857", bg: "#ECFDF5", border: "#A7F3D0" },
  rechazada: { label: "Rechazada", text: "#B91C1C", bg: "#FEF2F2", border: "#FECACA" },
  vencida:   { label: "Vencida",   text: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
}

const mxn0 = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

const fmtMXN = (v: number | null | undefined) =>
  mxn0.format(Number(v) || 0)

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
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [currentEstatus, setCurrentEstatus] = useState<Estatus>(estatus)
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  const sc = estatusStyle[currentEstatus]

  // Agrupar items por categoría para el resumen visual
  const itemsByCategoria = useMemo(() => {
    const map = new Map<string, CotizacionItem[]>()
    for (const item of preview.items) {
      const cat = item.categoria ?? "Otros"
      const arr = map.get(cat) ?? []
      arr.push(item)
      map.set(cat, arr)
    }
    return Array.from(map.entries())
  }, [preview.items])

  const cliente = preview.cliente
  const clienteDisplay =
    cliente?.nombre_negocio ?? cliente?.nombre ?? "Sin cliente"
  const clienteInitials = clienteDisplay
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?"
  const contacto = [cliente?.telefono, cliente?.email]
    .filter(Boolean)
    .join(" · ")

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
    <div className="mx-auto max-w-[1100px] p-6">
      {/* ─── Header: breadcrumb + título + status + acciones ─── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-gray-400">
            <Link
              href="/cotizaciones"
              className="inline-flex items-center gap-1 hover:text-gray-700"
            >
              <ArrowLeft className="size-3" />
              Cotizaciones
            </Link>
            <span className="text-gray-300">·</span>
            <span className="font-mono text-gray-500">{numero}</span>
          </div>
          <div className="mb-1.5 flex items-center gap-2.5">
            <h1 className="text-[22px] font-bold tracking-tight text-gray-900">
              Cotización
            </h1>
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
              style={{
                color: sc.text,
                background: sc.bg,
                border: `1px solid ${sc.border}`,
              }}
            >
              {sc.label}
            </span>
          </div>
          <p className="text-[11px] text-gray-500">
            {new Date(preview.fecha).toLocaleDateString("es-MX", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {preview.valida_hasta && (
              <>
                {" · Vigente al "}
                {new Date(preview.valida_hasta).toLocaleDateString("es-MX", {
                  day: "numeric",
                  month: "short",
                })}
              </>
            )}
          </p>
        </div>

        {/* Botones de acción */}
        <div className="flex flex-wrap items-center gap-2">
          {currentEstatus === "aceptada" && (
            <Link
              href={`/ventas/nueva?cotizacion=${cotizacionId}`}
              className="inline-flex items-center gap-2 rounded-lg bg-[#047857] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#065F46]"
            >
              <ShoppingBag className="size-4" />
              Convertir a Venta
            </Link>
          )}
          <button
            type="button"
            onClick={handleMarkSold}
            disabled={pending || currentEstatus === "aceptada"}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-teal-300"
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
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Pencil className="size-4" />
            Editar
          </Link>
          <form action={duplicarCotizacion.bind(null, cotizacionId)}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Copy className="size-4" />
              Duplicar
            </button>
          </form>
          <button
            type="button"
            onClick={handlePdf}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <FileDown className="size-4" />
            PDF
          </button>
          {currentEstatus !== "aceptada" && (
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

      {confirmarEliminar && (
        <DeleteCotModal
          numero={numero}
          loading={deleting}
          onCancel={() => setConfirmarEliminar(false)}
          onConfirm={handleEliminar}
        />
      )}

      {/* ─── Mini resumen ejecutivo: 4 stats ─── */}
      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
        <MiniStat label="Productos" value={preview.items.length.toString()} />
        <MiniStat label="Subtotal" value={fmtMXN(preview.subtotal)} />
        <MiniStat label="IVA" value={fmtMXN(preview.iva)} />
        <MiniStat label="Total" value={fmtMXN(preview.total)} highlight />
      </div>

      {/* ─── Layout 2 columnas ─── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        {/* ════ COLUMNA IZQUIERDA ════ */}
        <div className="flex flex-col gap-3">
          {/* Cliente */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Cliente
            </p>
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0F766E] to-[#047857] text-sm font-bold text-white">
                {clienteInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {clienteDisplay}
                </p>
                <p className="truncate text-[11px] text-gray-500">
                  {contacto || "Sin datos de contacto"}
                </p>
                {(cliente?.ciudad || cliente?.estado) && (
                  <p className="truncate text-[11px] text-gray-400">
                    {[cliente?.ciudad, cliente?.estado]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Productos agrupados por categoría */}
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Productos incluidos
              </p>
              <span className="text-[10px] text-gray-400">
                {preview.items.length}{" "}
                {preview.items.length === 1 ? "item" : "items"}
              </span>
            </header>

            <div className="grid grid-cols-[1fr_60px_90px_100px] gap-2 border-b border-gray-100 bg-gray-50/60 px-5 py-2 text-[9px] font-semibold uppercase tracking-wider text-gray-400">
              <span>Producto</span>
              <span className="text-center">Cant.</span>
              <span className="text-center">P. Unit.</span>
              <span className="text-right">Total</span>
            </div>

            {itemsByCategoria.map(([cat, catItems]) => (
              <div key={cat}>
                <div className="bg-gray-50/40 px-5 py-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#0F766E]">
                    {cat}
                  </span>
                </div>
                {catItems.map((item, idx) => (
                  <div
                    key={`${cat}-${idx}`}
                    className="grid grid-cols-[1fr_60px_90px_100px] items-center gap-2 border-t border-gray-50 px-5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-800">
                        {item.nombre}
                      </p>
                      {item.sku && (
                        <p className="truncate text-[10px] text-gray-400">
                          {item.sku}
                          {item.peso ? ` · ${item.peso}` : ""}
                        </p>
                      )}
                    </div>
                    <p className="text-center text-sm tabular-nums text-gray-600">
                      ×{item.cantidad}
                    </p>
                    <p className="text-center text-[11px] tabular-nums text-gray-500">
                      {fmtMXN(item.precio_unitario)}
                    </p>
                    <p className="text-right text-sm font-semibold tabular-nums text-gray-800">
                      {fmtMXN(
                        Number(item.precio_unitario) * Number(item.cantidad),
                      )}
                    </p>
                  </div>
                ))}
              </div>
            ))}
          </section>

          {/* Notas si existen */}
          {preview.notas && (
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Notas
              </p>
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-gray-600">
                {preview.notas}
              </p>
            </section>
          )}

          {/* Análisis de items (spreadsheet existente) */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <header className="mb-3 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Análisis de margen
              </p>
              <span className="text-[10px] text-gray-400">
                {preview.items.length} línea
                {preview.items.length === 1 ? "" : "s"}
              </span>
            </header>
            <SpreadsheetItems items={preview.items} />
          </section>

          {/* PDF Preview (oculto visualmente pero presente para render del PDF) */}
          {preview.iva > 0 && (
            <p className="px-1 text-[11px] italic text-gray-400">
              * IVA incluido en cotización para referencia del cliente. El cobro
              real se confirma al registrar la venta y puede diferir.
            </p>
          )}

          <section className="overflow-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <CotizacionPreview data={preview} innerRef={previewRef} />
          </section>
        </div>

        {/* ════ COLUMNA DERECHA (SIDEBAR) ════ */}
        <aside className="flex flex-col gap-2.5 lg:sticky lg:top-4 lg:self-start">
          {/* Total protagonista */}
          <div className="rounded-2xl border border-[#047857]/20 bg-gradient-to-br from-[#ECFDF5] to-white p-5 text-center shadow-sm">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#047857]/70">
              Total a pagar
            </p>
            <p className="text-[30px] font-extrabold leading-none tracking-tight tabular-nums text-[#065F46]">
              {fmtMXN(preview.total)}
            </p>
            <p className="mt-2 text-[10px] text-gray-500">
              MXN ·{" "}
              {Number(preview.iva) > 0 ? "IVA incluido" : "Sin IVA"}
            </p>
          </div>

          {/* Desglose */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <SidebarRow label="Subtotal" value={fmtMXN(preview.subtotal)} />
            {Number(preview.iva) > 0 && (
              <SidebarRow label="IVA (16%)" value={fmtMXN(preview.iva)} divider />
            )}
            {Number(preview.descuento) > 0 && (
              <SidebarRow
                label="Descuento"
                value={`− ${fmtMXN(preview.descuento)}`}
                positive
                divider
              />
            )}
          </div>

          {/* Vigencia */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-center shadow-sm">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Vigencia
            </p>
            <p className="text-[12px] font-semibold text-gray-700">
              {preview.valida_hasta
                ? new Date(preview.valida_hasta).toLocaleDateString("es-MX", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "30 días desde emisión"}
            </p>
            <p className="mt-1 text-[10px] text-gray-400">
              Precios sujetos a cambio de TC
            </p>
          </div>

          {/* CTA Convertir (solo si aceptada y pendiente de venta) */}
          {currentEstatus === "aceptada" && (
            <Link
              href={`/ventas/nueva?cotizacion=${cotizacionId}`}
              className="block rounded-xl border border-[#047857]/30 bg-gradient-to-br from-[#ECFDF5] to-[#D1FAE5] py-3 text-center text-sm font-bold text-[#047857] shadow-sm transition-colors hover:from-[#D1FAE5] hover:to-[#A7F3D0]"
            >
              ✓ Convertir a Venta
            </Link>
          )}

          {/* Datos emisor */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-4">
            <p className="mb-1.5 text-[12px] font-semibold text-gray-700">
              Piel Canela
            </p>
            <p className="text-[10px] leading-relaxed text-gray-500">
              Av Guadalupe 6304, Jardines de Chapalita
              <br />
              Guadalajara, Jalisco · CP 45010
              <br />
              +52 333 250 8073
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function MiniStat({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-3 text-center shadow-sm transition-colors ${
        highlight
          ? "border-[#047857]/30 bg-gradient-to-br from-[#ECFDF5] to-white"
          : "border-gray-200 bg-white"
      }`}
    >
      <p
        className={`mb-1 text-[9px] font-semibold uppercase tracking-wider ${
          highlight ? "text-[#047857]/70" : "text-gray-400"
        }`}
      >
        {label}
      </p>
      <p
        className={`text-[15px] font-bold tabular-nums ${
          highlight ? "text-[#065F46]" : "text-gray-800"
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function SidebarRow({
  label,
  value,
  positive,
  divider,
}: {
  label: string
  value: string
  positive?: boolean
  divider?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between py-2 ${divider ? "border-t border-gray-100" : ""}`}
    >
      <span className="text-[12px] text-gray-500">{label}</span>
      <span
        className={`text-[12px] font-semibold tabular-nums ${positive ? "text-[#047857]" : "text-gray-800"}`}
      >
        {value}
      </span>
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
