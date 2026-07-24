"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, X, Loader2, ArrowLeftRight } from "lucide-react"
import {
  agregarConversion,
  eliminarConversion,
  subirComprobanteConversion,
  eliminarComprobanteConversion,
} from "../actions"
import { DocChip } from "./doc-upload"
import { formatMXN2 } from "@/lib/utils"

import { parseFecha } from "@/lib/fecha"

type Conversion = {
  id: string
  fecha: string
  mxn_gastado: number
  usdt_recibido: number
  tipo_cambio: number
  comision_mxn: number
  notas: string | null
  comprobante_url: string | null
}

const num = (v: number | null | undefined, d = 2) =>
  (Number(v) || 0).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })

const EMPTY = {
  fecha: "",
  mxn_gastado: "",
  usdt_recibido: "",
  tipo_cambio: "",
  comision_mxn: "",
}

export function Conversiones({
  pedidoId,
  conversiones,
  pedidoTotalMxn,
}: {
  pedidoId: string
  conversiones: Conversion[]
  pedidoTotalMxn: number
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [pending, startTransition] = useTransition()

  const totMxn = conversiones.reduce((s, c) => s + Number(c.mxn_gastado || 0), 0)
  const totUsdt = conversiones.reduce((s, c) => s + Number(c.usdt_recibido || 0), 0)
  const totComision = conversiones.reduce((s, c) => s + Number(c.comision_mxn || 0), 0)
  const tcEfectivo = totUsdt > 0 ? totMxn / totUsdt : 0
  const costoConComision = pedidoTotalMxn + totComision

  const setF = (k: keyof typeof EMPTY, v: string) =>
    setForm((p) => ({ ...p, [k]: v }))

  function guardar() {
    setError(null)
    const mxnG = Number(form.mxn_gastado) || 0
    const usdt = Number(form.usdt_recibido) || 0
    if (mxnG <= 0 || usdt <= 0) {
      setError("Captura al menos el monto MXN gastado y los USDT recibidos.")
      return
    }
    startTransition(async () => {
      const res = await agregarConversion(pedidoId, {
        fecha: form.fecha || new Date().toISOString(),
        mxn_gastado: mxnG,
        usdt_recibido: usdt,
        tipo_cambio: Number(form.tipo_cambio) || 0,
        comision_mxn: Number(form.comision_mxn) || 0,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setForm(EMPTY)
      setAbierto(false)
      router.refresh()
    })
  }

  function borrar(id: string) {
    startTransition(async () => {
      await eliminarConversion(pedidoId, id)
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-gray-900">
            <ArrowLeftRight className="size-4 text-indigo-600" />
            Conversiones MXN → USDT
          </h3>
          <p className="text-[11.5px] text-gray-500">
            Compras de dólares (MXN→USDT) con su comisión — definen el costo real
            en pesos. Los envíos al proveedor van arriba en <b>Pagos</b>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAbierto((v) => !v)
            setError(null)
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
        >
          {abierto ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          {abierto ? "Cancelar" : "Agregar conversión"}
        </button>
      </div>

      {/* Form */}
      {abierto && (
        <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            <Field label="Fecha">
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => setF("fecha", e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 px-2 text-[12.5px]"
              />
            </Field>
            <Field label="MXN gastado">
              <input
                type="number"
                step="0.01"
                min={0}
                placeholder="21871.00"
                value={form.mxn_gastado}
                onChange={(e) => setF("mxn_gastado", e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 px-2 text-right text-[12.5px]"
              />
            </Field>
            <Field label="USDT recibido">
              <input
                type="number"
                step="0.01"
                min={0}
                placeholder="1236.38"
                value={form.usdt_recibido}
                onChange={(e) => setF("usdt_recibido", e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 px-2 text-right text-[12.5px]"
              />
            </Field>
            <Field label="TC (1 USDT)">
              <input
                type="number"
                step="0.0001"
                min={0}
                placeholder="17.60"
                value={form.tipo_cambio}
                onChange={(e) => setF("tipo_cambio", e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 px-2 text-right text-[12.5px]"
              />
            </Field>
            <Field label="Comisión MXN">
              <input
                type="number"
                step="0.01"
                min={0}
                placeholder="109.35"
                value={form.comision_mxn}
                onChange={(e) => setF("comision_mxn", e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 px-2 text-right text-[12.5px]"
              />
            </Field>
          </div>
          {error && (
            <p className="mt-2 text-[11.5px] text-rose-600">{error}</p>
          )}
          <div className="mt-2.5 flex justify-end">
            <button
              type="button"
              onClick={guardar}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Guardar conversión
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      {conversiones.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                <th className="px-2 py-2 text-left">Fecha</th>
                <th className="px-2 py-2 text-right">MXN gastado</th>
                <th className="px-2 py-2 text-right">USDT</th>
                <th className="px-2 py-2 text-right">TC</th>
                <th className="px-2 py-2 text-right">Comisión</th>
                <th className="px-2 py-2 text-center">Comprobante</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {conversiones.map((c) => (
                <tr key={c.id} className="border-b border-gray-50">
                  <td className="px-2 py-2 text-gray-700">
                    {parseFecha(c.fecha).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-900">
                    {formatMXN2(c.mxn_gastado)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold text-indigo-700">
                    {num(c.usdt_recibido)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-600">
                    {num(c.tipo_cambio, 2)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-amber-700">
                    {formatMXN2(c.comision_mxn)}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <DocChip
                      filename={c.comprobante_url}
                      onUpload={(fd) =>
                        subirComprobanteConversion(pedidoId, c.id, fd)
                      }
                      onDelete={() =>
                        eliminarComprobanteConversion(pedidoId, c.id)
                      }
                      label="Subir"
                    />
                  </td>
                  <td className="px-1 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => borrar(c.id)}
                      disabled={pending}
                      className="inline-flex size-7 items-center justify-center rounded-md bg-rose-50 text-rose-500 transition-colors hover:bg-rose-100 disabled:opacity-40"
                      aria-label="Eliminar conversión"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 text-[12px] font-semibold text-gray-900">
                <td className="px-2 py-2">Totales</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatMXN2(totMxn)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-indigo-700">
                  {num(totUsdt)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-gray-500">
                  {num(tcEfectivo, 2)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-amber-700">
                  {formatMXN2(totComision)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-[12px] italic text-gray-400">
          Aún no hay conversiones registradas. Agrega cada compra de USDT para
          calcular el costo real con comisiones.
        </p>
      )}

      {/* Resumen de costo real */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Summary label="Comisiones totales" value={formatMXN2(totComision)} tone="amber" />
        <Summary
          label="Costo total con comisiones"
          value={formatMXN2(costoConComision)}
          sub={`pedido ${formatMXN2(pedidoTotalMxn)} + comisiones`}
          tone="indigo"
          strong
        />
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-500">
        {label}
      </span>
      {children}
    </label>
  )
}

const TONES = {
  amber: { bg: "rgba(217,119,6,0.06)", border: "rgba(217,119,6,0.16)", text: "#B45309" },
  emerald: { bg: "rgba(5,150,105,0.06)", border: "rgba(5,150,105,0.16)", text: "#047857" },
  rose: { bg: "rgba(220,38,38,0.06)", border: "rgba(220,38,38,0.16)", text: "#B91C1C" },
  indigo: { bg: "rgba(99,102,241,0.06)", border: "rgba(99,102,241,0.20)", text: "#4F46E5" },
}

function Summary({
  label,
  value,
  sub,
  tone,
  strong,
}: {
  label: string
  value: string
  sub?: string
  tone: keyof typeof TONES
  strong?: boolean
}) {
  const t = TONES[tone]
  return (
    <div
      className="rounded-xl border bg-white p-3"
      style={{ borderColor: t.border, background: strong ? t.bg : undefined }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: t.text }}
      >
        {label}
      </p>
      <p
        className={`mt-1.5 tabular-nums text-gray-900 ${strong ? "text-[20px] font-bold leading-none tracking-[-0.02em]" : "text-[15px] font-semibold"}`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[10.5px] text-gray-400">{sub}</p>}
    </div>
  )
}
