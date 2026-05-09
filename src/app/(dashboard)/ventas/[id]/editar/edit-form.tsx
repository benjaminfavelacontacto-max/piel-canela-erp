"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Save } from "lucide-react"
import { updateVenta } from "../../actions"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

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
    const iva = ivaActivo ? Number((subtotal * 0.16).toFixed(2)) : 0
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
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm tabular-nums focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            />
          </label>

          <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">IVA 16%</p>
              <p className="text-xs text-gray-500">
                Aplica impuesto al subtotal
                {ivaActivo ? ` (${mxn.format(computed.iva)})` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIvaActivo((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                ivaActivo ? "bg-pink-600" : "bg-gray-300"
              }`}
              aria-pressed={ivaActivo}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${
                  ivaActivo ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
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
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300"
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
            <Row label="Subtotal" value={mxn.format(subtotal)} />
            {descuento > 0 && (
              <Row
                label="Descuento"
                value={`-${mxn.format(descuento)}`}
                className="text-emerald-700"
              />
            )}
            <Row
              label={ivaActivo ? "IVA 16%" : "IVA"}
              value={
                ivaActivo
                  ? mxn.format(computed.iva)
                  : "—"
              }
              className={ivaActivo ? "text-teal-700" : "text-gray-400"}
            />
            <div className="my-2 border-t border-gray-100" />
            <Row label="Total" value={mxn.format(computed.total)} bold />
            <Row
              label="Pagado"
              value={mxn.format(cantidadPagada)}
              className="text-blue-700"
            />
            <Row
              label="Saldo"
              value={mxn.format(computed.saldo)}
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
