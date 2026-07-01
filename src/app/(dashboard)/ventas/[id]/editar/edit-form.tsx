"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Save } from "lucide-react"
import { updateVenta } from "../../actions"
import { formatMXN2 } from "@/lib/utils"

type Estatus = "pendiente" | "pagada_parcial" | "pagada_total"

const estatusBadge: Record<Estatus, string> = {
  pendiente: "bg-red-100 text-red-700",
  pagada_parcial: "bg-amber-100 text-amber-700",
  pagada_total: "bg-teal-100 text-teal-700",
}
const estatusLabel: Record<Estatus, string> = {
  pendiente: "Pendiente",
  pagada_parcial: "Parcial",
  pagada_total: "Pagada",
}

function estatusFor(total: number, pagado: number): Estatus {
  if (pagado <= 0) return "pendiente"
  if (pagado >= total) return "pagada_total"
  return "pagada_parcial"
}

export function EditVentaForm({
  id,
  subtotal,
  descuento,
  ivaInicial,
  cantidadPagadaInicial,
  notasIniciales,
}: {
  id: string
  subtotal: number
  descuento: number
  ivaInicial: number
  cantidadPagadaInicial: number
  notasIniciales: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [ivaActivo, setIvaActivo] = useState<boolean>(ivaInicial > 0)
  const [cantidadPagada, setCantidadPagada] = useState<number>(
    cantidadPagadaInicial,
  )
  const [notas, setNotas] = useState<string>(notasIniciales)

  const computed = useMemo(() => {
    // IVA sobre la base gravable (subtotal − descuento), estándar fiscal MX.
    const iva = ivaActivo ? Number(((subtotal - descuento) * 0.16).toFixed(2)) : 0
    const total = subtotal + iva - descuento
    const saldo = Math.max(0, total - cantidadPagada)
    const estatus = estatusFor(total, cantidadPagada)
    return { iva, total, saldo, estatus }
  }, [subtotal, descuento, cantidadPagada, ivaActivo])

  function handleSave() {
    startTransition(async () => {
      try {
        const result = await updateVenta({
          id,
          notas,
          ivaActivo,
          cantidad_pagada: cantidadPagada,
        })
        if (!result.ok) {
          console.error("[edit-form] updateVenta error:", result.error)
          toast.error(result.error, { duration: 8000 })
          return
        }
        toast.success("Venta actualizada.")
        router.push(`/ventas/${id}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error("[edit-form] threw:", e)
        toast.error(`Error al guardar: ${msg}`, { duration: 8000 })
      }
    })
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Pago
          </h2>

          <label className="block">
            <span className="text-xs uppercase tracking-wide text-gray-500">
              Cantidad pagada
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={cantidadPagada}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                setCantidadPagada(Number.isNaN(v) ? 0 : v)
              }}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm tabular-nums focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            />
          </label>

          {/* IVA real cobrado — afecta total y reportes financieros */}
          <div className="rounded-xl border border-amber-200/70 bg-amber-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-900">
                  IVA cobrado
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  ¿Esta venta se cobró con IVA incluido? Afecta el total real y
                  los reportes financieros.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIvaActivo((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 ${
                  ivaActivo ? "bg-amber-600" : "bg-gray-300"
                }`}
                role="switch"
                aria-checked={ivaActivo}
              >
                <span className="sr-only">
                  {ivaActivo ? "Desactivar IVA" : "Activar IVA"}
                </span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                    ivaActivo ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            {ivaActivo && (
              <p className="mt-2 rounded-md bg-white/70 px-2 py-1 text-xs tabular-nums text-amber-900">
                IVA 16%: <strong>{formatMXN2(computed.iva)}</strong> · Total:{" "}
                <strong>{formatMXN2(subtotal + computed.iva - descuento)}</strong>
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Notas
          </h2>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={4}
            placeholder="Notas internas, referencia de pago, etc."
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#115E59] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="size-4" />
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      </section>

      <aside className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Resumen
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Subtotal" value={formatMXN2(subtotal)} />
            {descuento > 0 && (
              <Row
                label="Descuento"
                value={`-${formatMXN2(descuento)}`}
                className="text-emerald-700"
              />
            )}
            <Row
              label={ivaActivo ? "IVA 16%" : "IVA"}
              value={
                ivaActivo
                  ? formatMXN2(computed.iva)
                  : "—"
              }
              className={ivaActivo ? "text-teal-700" : "text-gray-400"}
            />
            <div className="my-2 border-t border-gray-100" />
            <Row label="Total" value={formatMXN2(computed.total)} bold />
            <Row
              label="Pagado"
              value={formatMXN2(cantidadPagada)}
              className="text-blue-700"
            />
            <Row
              label="Saldo"
              value={formatMXN2(computed.saldo)}
              className={
                computed.saldo > 0 ? "text-amber-700 font-medium" : ""
              }
            />
            <div className="pt-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${estatusBadge[computed.estatus]}`}
              >
                {estatusLabel[computed.estatus]}
              </span>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  )
}

function Row({
  label,
  value,
  bold = false,
  className = "",
}: {
  label: string
  value: string
  bold?: boolean
  className?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-600">{label}</dt>
      <dd
        className={`tabular-nums ${bold ? "font-bold text-base" : "font-medium text-gray-900"} ${className}`}
      >
        {value}
      </dd>
    </div>
  )
}
