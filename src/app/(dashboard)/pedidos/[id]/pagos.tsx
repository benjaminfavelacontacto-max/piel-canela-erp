"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, X, Loader2, Send, CheckCircle2 } from "lucide-react"
import {
  agregarPago,
  eliminarPago,
  subirComprobantePago,
  eliminarComprobantePago,
} from "../actions"
import { DocChip } from "./doc-upload"

type Pago = {
  id: string
  fecha: string
  usdt_enviado: number
  destinatario: string | null
  mensaje: string | null
  comprobante_url: string | null
}

const num = (v: number | null | undefined, d = 2) =>
  (Number(v) || 0).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })

const EMPTY = { fecha: "", usdt_enviado: "", destinatario: "", mensaje: "" }

export function Pagos({
  pedidoId,
  pagos,
  productosUsd,
}: {
  pedidoId: string
  pagos: Pago[]
  /** Costo de la MERCANCÍA (sin envío) — al proveedor solo se le paga esto. */
  productosUsd: number
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [pending, startTransition] = useTransition()

  const totEnviado = pagos.reduce((s, p) => s + Number(p.usdt_enviado || 0), 0)
  // El proveedor cobra solo la mercancía; el envío se paga aparte a las paqueterías.
  const cobertura = productosUsd > 0 ? (totEnviado / productosUsd) * 100 : 0
  const faltante = Math.max(0, productosUsd - totEnviado)
  const completo = totEnviado >= productosUsd - 0.5

  const setF = (k: keyof typeof EMPTY, v: string) =>
    setForm((p) => ({ ...p, [k]: v }))

  function guardar() {
    setError(null)
    const usdt = Number(form.usdt_enviado) || 0
    if (usdt <= 0) {
      setError("Captura los USDT enviados.")
      return
    }
    startTransition(async () => {
      const res = await agregarPago(pedidoId, {
        fecha: form.fecha || new Date().toISOString(),
        usdt_enviado: usdt,
        destinatario: form.destinatario || null,
        mensaje: form.mensaje || null,
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
      await eliminarPago(pedidoId, id)
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-gray-900">
            <Send className="size-4 text-emerald-600" />
            Pagos al proveedor
          </h3>
          <p className="text-[11.5px] text-gray-500">
            Los dólares (USDT) enviados al proveedor para cubrir este pedido.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAbierto((v) => !v)
            setError(null)
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-gray-700 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
        >
          {abierto ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          {abierto ? "Cancelar" : "Agregar pago"}
        </button>
      </div>

      {/* Form */}
      {abierto && (
        <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Field label="Fecha">
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => setF("fecha", e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 px-2 text-[12.5px]"
              />
            </Field>
            <Field label="USDT enviado">
              <input
                type="number"
                step="0.01"
                min={0}
                placeholder="3731.94"
                value={form.usdt_enviado}
                onChange={(e) => setF("usdt_enviado", e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 px-2 text-right text-[12.5px]"
              />
            </Field>
            <Field label="Destinatario">
              <input
                type="text"
                placeholder="Julio Ayarza Delgado"
                value={form.destinatario}
                onChange={(e) => setF("destinatario", e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 px-2 text-[12.5px]"
              />
            </Field>
            <Field label="Mensaje">
              <input
                type="text"
                placeholder="Productos Brasil"
                value={form.mensaje}
                onChange={(e) => setF("mensaje", e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 px-2 text-[12.5px]"
              />
            </Field>
          </div>
          {error && <p className="mt-2 text-[11.5px] text-rose-600">{error}</p>}
          <div className="mt-2.5 flex justify-end">
            <button
              type="button"
              onClick={guardar}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Guardar pago
            </button>
          </div>
        </div>
      )}

      {/* Tabla de pagos */}
      {pagos.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                <th className="px-2 py-2 text-left">Fecha</th>
                <th className="px-2 py-2 text-left">Destinatario</th>
                <th className="px-2 py-2 text-left">Mensaje</th>
                <th className="px-2 py-2 text-right">USDT enviado</th>
                <th className="px-2 py-2 text-center">Comprobante</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => (
                <tr key={p.id} className="border-b border-gray-50">
                  <td className="px-2 py-2 text-gray-700">
                    {new Date(p.fecha).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-2 py-2 text-gray-700">{p.destinatario ?? "—"}</td>
                  <td className="px-2 py-2 text-gray-500">{p.mensaje ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold text-emerald-700">
                    {num(p.usdt_enviado)}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <DocChip
                      filename={p.comprobante_url}
                      onUpload={(fd) => subirComprobantePago(pedidoId, p.id, fd)}
                      onDelete={() => eliminarComprobantePago(pedidoId, p.id)}
                      label="Subir"
                    />
                  </td>
                  <td className="px-1 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => borrar(p.id)}
                      disabled={pending}
                      className="inline-flex size-7 items-center justify-center rounded-md bg-rose-50 text-rose-500 transition-colors hover:bg-rose-100 disabled:opacity-40"
                      aria-label="Eliminar pago"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 text-[12px] font-semibold text-gray-900">
                <td className="px-2 py-2" colSpan={3}>
                  Total enviado
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-emerald-700">
                  {num(totEnviado)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-[12px] italic text-gray-400">
          Aún no hay pagos registrados. Agrega cada transfer de USDT al proveedor.
        </p>
      )}

      {/* Progreso: pagado al proveedor */}
      <div
        className="mt-4 rounded-xl border p-4"
        style={{
          borderColor: completo ? "rgba(5,150,105,0.18)" : "rgba(217,119,6,0.18)",
          background: completo ? "rgba(5,150,105,0.05)" : "rgba(217,119,6,0.05)",
        }}
      >
        <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p
              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: completo ? "#047857" : "#B45309" }}
            >
              {completo && <CheckCircle2 className="size-3.5" />}
              Pagado al proveedor
            </p>
            <p className="mt-1 text-[12.5px] text-gray-600">
              <span className="font-bold tabular-nums text-gray-900">{num(totEnviado)}</span> enviado
              {completo ? (
                <>
                  <span className="mx-1 text-gray-300">·</span>
                  mercancía cubierta ✓
                </>
              ) : (
                <>
                  <span className="mx-1 text-gray-300">·</span>
                  <span className="font-semibold tabular-nums">{num(productosUsd)}</span> en productos
                  <span className="mx-1 text-gray-300">·</span>
                  faltan{" "}
                  <span className="font-semibold tabular-nums text-amber-700">{num(faltante)}</span> USDT
                </>
              )}
            </p>
            <p className="mt-0.5 text-[10.5px] text-gray-400">
              Solo mercancía — el envío se paga por separado (ver “Desglose del envío”).
            </p>
          </div>
          <span
            className="text-[24px] font-bold leading-none tabular-nums"
            style={{ color: completo ? "#047857" : "#B45309" }}
          >
            {Math.min(100, cobertura).toFixed(0)}%
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, cobertura)}%`,
              background: completo ? "#059669" : "#D97706",
            }}
          />
        </div>
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
