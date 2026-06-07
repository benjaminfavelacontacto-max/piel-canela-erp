"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, Loader2, Power, Trash2, X } from "lucide-react"
import { deleteCliente, setClienteActivo } from "./actions"

export type DeleteTarget = {
  id: string
  nombre: string
  /** Ventas totales (cualquier estatus) — registros financieros. */
  ventas: number
  cotizaciones: number
} | null

export function ClienteDeleteDialog({
  target,
  onClose,
  onDone,
}: {
  target: DeleteTarget
  onClose: () => void
  onDone?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (!target) return null
  const { id, nombre, ventas, cotizaciones } = target
  const blockedByVentas = ventas > 0

  function confirmDelete() {
    startTransition(async () => {
      const res = await deleteCliente(id, true)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(
        cotizaciones > 0
          ? "Cliente y " +
              cotizaciones +
              " " +
              (cotizaciones === 1 ? "cotización" : "cotizaciones") +
              " eliminados"
          : "Cliente eliminado",
      )
      onClose()
      onDone?.()
      router.refresh()
    })
  }

  function desactivar() {
    startTransition(async () => {
      const res = await setClienteActivo(id, false)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Cliente desactivado")
      onClose()
      onDone?.()
      router.refresh()
    })
  }

  return (
    <>
      <div
        onClick={pending ? undefined : onClose}
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-start gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
              blockedByVentas
                ? "bg-amber-100 text-amber-600"
                : "bg-rose-100 text-rose-600"
            }`}
          >
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-900">
              {blockedByVentas ? "No se puede eliminar" : "Eliminar cliente"}
            </h2>
            <p className="mt-0.5 truncate text-sm text-gray-600">
              <strong className="font-semibold text-gray-900">{nombre}</strong>
            </p>
          </div>
        </div>

        <div className="mt-4 text-sm">
          {blockedByVentas ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
              Este cliente tiene{" "}
              <strong>
                {ventas} {ventas === 1 ? "venta" : "ventas"}
              </strong>{" "}
              registradas. Las ventas son registros financieros (afectan ROI y
              reportes), por eso no se eliminan. Puedes{" "}
              <strong>desactivarlo</strong> para sacarlo del flujo sin perder su
              historial.
            </div>
          ) : cotizaciones > 0 ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">
              Se eliminarán también sus{" "}
              <strong>
                {cotizaciones}{" "}
                {cotizaciones === 1 ? "cotización" : "cotizaciones"}
              </strong>{" "}
              (y sus partidas). Esta acción <strong>no se puede deshacer</strong>
              .
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-gray-700">
              Esta acción <strong>no se puede deshacer</strong>.
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          {blockedByVentas ? (
            <button
              type="button"
              onClick={desactivar}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Power className="size-4" />
              )}
              Desactivar
            </button>
          ) : (
            <button
              type="button"
              onClick={confirmDelete}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Eliminar definitivamente
            </button>
          )}
        </div>
      </div>
    </>
  )
}
