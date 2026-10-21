"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Wallet, X } from "lucide-react"
import { toast } from "sonner"
import { formatMXN2 } from "@/lib/utils"
import { registrarPago, restaurarEstadoVenta } from "./actions"

/**
 * Abono rápido a una venta: hoja inferior en móvil, diálogo centrado en escritorio.
 * Monto precargado con el saldo (un toque para liquidar) y toast con "Deshacer".
 */
export function PagoRapidoDialog({
  venta,
  onClose,
  onDone,
}: {
  venta: { id: string; numero: string; cliente: string; total: number; saldo: number }
  onClose: () => void
  /** Se llama tras registrar el pago (p. ej. cerrar el drawer, cuyos datos quedan viejos) */
  onDone?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [monto, setMonto] = useState(venta.saldo.toFixed(2))
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const valor = Number(monto)
  const valido = Number.isFinite(valor) && valor > 0
  const restante = valido ? Math.max(0, venta.saldo - valor) : venta.saldo

  function enviar(montoFinal: number) {
    setError(null)
    startTransition(async () => {
      const r = await registrarPago(venta.id, montoFinal)
      if (!r.ok) {
        setError(r.error)
        return
      }
      const previo = r.previo
      toast.success(`Pago de ${formatMXN2(r.aplicado)} registrado`, {
        description:
          r.saldo > 0 ? `Saldo pendiente: ${formatMXN2(r.saldo)}` : "Venta liquidada",
        duration: 8000,
        action: {
          label: "Deshacer",
          onClick: async () => {
            const u = await restaurarEstadoVenta(
              venta.id,
              previo.estatus,
              previo.cantidad_pagada,
            )
            if (u.ok) {
              toast.success("Pago deshecho")
              router.refresh()
            } else {
              toast.error(u.error)
            }
          },
        },
      })
      router.refresh()
      onDone?.()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center md:p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-label={`Registrar pago de ${venta.numero}`}
        onSubmit={(e) => {
          e.preventDefault()
          if (valido) enviar(valor)
        }}
        className="pc-pb-safe relative w-full rounded-t-3xl bg-pc-card p-5 shadow-2xl md:max-w-sm md:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Wallet className="size-3.5" /> Registrar pago
            </p>
            <h2 className="mt-1 truncate text-lg font-bold text-gray-900">
              {venta.cliente}
            </h2>
            <p className="truncate font-mono text-[11px] text-gray-400">{venta.numero}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-2 -mt-2 flex size-11 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">Total</p>
            <p className="font-semibold tabular-nums text-gray-900">{formatMXN2(venta.total)}</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-amber-700">Saldo</p>
            <p className="font-semibold tabular-nums text-amber-800">{formatMXN2(venta.saldo)}</p>
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">Monto a cobrar</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
            <input
              ref={inputRef}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              max={venta.saldo}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="h-12 w-full rounded-xl border border-gray-200 bg-pc-card pl-7 pr-3 text-lg font-semibold tabular-nums focus:border-pc-teal focus:outline-none focus:ring-2 focus:ring-pc-teal/20"
            />
          </div>
        </label>
        <p className="mt-2 min-h-5 text-xs text-gray-500">
          {valido && valor > venta.saldo
            ? `Se aplicará solo el saldo (${formatMXN2(venta.saldo)}).`
            : valido
              ? restante > 0
                ? `Quedará pendiente ${formatMXN2(restante)}.`
                : "Con este pago la venta queda liquidada."
              : ""}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-xs font-medium text-rose-600">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => enviar(venta.saldo)}
            disabled={pending}
            className="h-12 flex-1 rounded-xl border border-gray-200 bg-pc-card text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Liquidar todo
          </button>
          <button
            type="submit"
            disabled={pending || !valido}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-pc-teal text-sm font-semibold text-white hover:bg-pc-teal-hover disabled:opacity-50"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Registrar pago
          </button>
        </div>
      </form>
    </div>
  )
}
