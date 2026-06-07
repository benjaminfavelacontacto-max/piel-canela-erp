"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Truck, Plus, X, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  agregarEnvioTramo,
  eliminarEnvioTramo,
  subirFacturaEnvio,
  eliminarFacturaEnvio,
} from "../actions"
import { DocChip } from "./doc-upload"

type Tramo = {
  id: string
  tramo: string
  monto_usd: number
  monto_mxn: number
  filename: string | null
  notas: string | null
}

const usd = (v: number | null | undefined) =>
  `$${(Number(v) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
const mxn = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  })

const EMPTY = { tramo: "", monto_usd: "", monto_mxn: "", notas: "" }

export function DesgloseEnvio({
  pedidoId,
  tramos,
}: {
  pedidoId: string
  tramos: Tramo[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const totalUsd = tramos.reduce((s, t) => s + Number(t.monto_usd || 0), 0)
  const totalMxn = tramos.reduce((s, t) => s + Number(t.monto_mxn || 0), 0)
  const setF = (k: keyof typeof EMPTY, v: string) =>
    setForm((p) => ({ ...p, [k]: v }))

  function guardar() {
    setError(null)
    if (!form.tramo.trim()) {
      setError("Captura el tramo (ej. Brasil → USA).")
      return
    }
    startTransition(async () => {
      const r = await agregarEnvioTramo(pedidoId, {
        tramo: form.tramo.trim(),
        monto_usd: Number(form.monto_usd) || 0,
        monto_mxn: Number(form.monto_mxn) || 0,
        notas: form.notas || null,
      })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setForm(EMPTY)
      setAbierto(false)
      toast.success("Tramo agregado")
      router.refresh()
    })
  }

  function borrar(id: string, filename: string | null) {
    startTransition(async () => {
      const r = await eliminarEnvioTramo(pedidoId, id, filename)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success("Tramo eliminado")
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-gray-900">
            <Truck className="size-4 text-amber-600" />
            Desglose del envío
          </h3>
          <p className="text-[11.5px] text-gray-500">
            Lo que se pagó de envío por tramo, en USD y MXN, con su factura.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAbierto((v) => !v)
            setError(null)
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-gray-700 shadow-sm transition-colors hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"
        >
          {abierto ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          {abierto ? "Cancelar" : "Agregar tramo"}
        </button>
      </div>

      {abierto && (
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50/40 p-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                Tramo
              </span>
              <input
                type="text"
                value={form.tramo}
                onChange={(e) => setF("tramo", e.target.value)}
                placeholder="Brasil → USA"
                className="h-8 w-full rounded-lg border border-gray-200 px-2 text-[12.5px]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                Monto USD
              </span>
              <input
                type="number"
                step="0.01"
                min={0}
                placeholder="1488.50"
                value={form.monto_usd}
                onChange={(e) => setF("monto_usd", e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 px-2 text-right text-[12.5px]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                Monto MXN
              </span>
              <input
                type="number"
                step="0.01"
                min={0}
                placeholder="6170.25"
                value={form.monto_mxn}
                onChange={(e) => setF("monto_mxn", e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 px-2 text-right text-[12.5px]"
              />
            </label>
          </div>
          <p className="mt-1.5 text-[10.5px] text-gray-400">
            Captura el monto en la moneda en que pagaste ese tramo (puedes llenar uno o ambos).
          </p>
          {error && <p className="mt-1 text-[11.5px] text-rose-600">{error}</p>}
          <div className="mt-2.5 flex justify-end">
            <button
              type="button"
              onClick={guardar}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Guardar tramo
            </button>
          </div>
        </div>
      )}

      {tramos.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                <th className="px-2 py-2 text-left">Tramo</th>
                <th className="px-2 py-2 text-right">USD</th>
                <th className="px-2 py-2 text-right">MXN</th>
                <th className="px-2 py-2 text-center">Factura</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {tramos.map((t) => (
                <tr key={t.id} className="border-b border-gray-50">
                  <td className="px-2 py-2 text-gray-800">
                    <span className="font-medium">{t.tramo}</span>
                    {t.notas && (
                      <span className="block text-[10.5px] text-gray-400">
                        {t.notas}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-700">
                    {Number(t.monto_usd) > 0 ? usd(t.monto_usd) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-700">
                    {Number(t.monto_mxn) > 0 ? mxn(t.monto_mxn) : "—"}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <DocChip
                      filename={t.filename}
                      onUpload={(fd) => subirFacturaEnvio(pedidoId, t.id, fd)}
                      onDelete={() => eliminarFacturaEnvio(pedidoId, t.id)}
                      label="Factura"
                    />
                  </td>
                  <td className="px-1 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => borrar(t.id, t.filename)}
                      disabled={pending}
                      className="inline-flex size-7 items-center justify-center rounded-md bg-rose-50 text-rose-500 transition-colors hover:bg-rose-100 disabled:opacity-40"
                      aria-label="Eliminar tramo"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 text-[12px] font-semibold text-gray-900">
                <td className="px-2 py-2">Total envío</td>
                <td className="px-2 py-2 text-right tabular-nums text-amber-700">
                  {usd(totalUsd)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-amber-700">
                  {mxn(totalMxn)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-[12px] italic text-gray-400">
          Aún no hay tramos. Agrega cada costo de envío (ej. Brasil → USA,
          USA → México) con su monto y factura.
        </p>
      )}
    </section>
  )
}
