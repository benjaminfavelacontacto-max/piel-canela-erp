"use client"

import { useEffect } from "react"
import { AlertTriangle, RotateCw } from "lucide-react"

/**
 * Error boundary para TODAS las rutas del dashboard. Reemplaza el crash feo por
 * una pantalla clara con opción de reintentar. `reset()` re-renderiza el
 * segmento (reintenta la carga del server component sin recargar toda la app).
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Deja rastro en consola/logs del servidor para diagnóstico.
    console.error("[dashboard error]", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[rgba(15,23,42,0.05)] bg-white p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-rose-50">
          <AlertTriangle className="size-6 text-rose-600" strokeWidth={1.75} />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">
          Algo salió mal
        </h2>
        <p className="mt-1.5 text-sm text-gray-500">
          No se pudo cargar esta sección. Suele ser temporal — vuelve a
          intentarlo.
        </p>
        {error?.digest && (
          <p className="mt-2 font-mono text-[11px] text-gray-400">
            Ref: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex h-[42px] items-center gap-2 rounded-[14px] bg-[#0F766E] px-[18px] text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#115E59]"
        >
          <RotateCw className="size-4" strokeWidth={1.75} />
          Reintentar
        </button>
      </div>
    </div>
  )
}
