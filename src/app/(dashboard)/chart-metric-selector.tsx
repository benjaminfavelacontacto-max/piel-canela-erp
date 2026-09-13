"use client"

import { useState } from "react"
import { MonthlyChart } from "./ventas/estadisticas/monthly-chart"

/**
 * Envuelve MonthlyChart con un selector de métrica (Ventas/Utilidad/Órdenes).
 * "Ventas" mantiene el look actual (barra + línea de ganancia); las otras
 * dos muestran una sola serie. No hay fetching aquí — `data` ya viene del
 * servidor con todo lo necesario (incluye `count`, que antes se calculaba
 * pero nunca se pintaba).
 */

type Metric = "total" | "ganancia" | "count"

const OPTIONS: { metric: Metric; label: string }[] = [
  { metric: "total", label: "Ventas" },
  { metric: "ganancia", label: "Utilidad" },
  { metric: "count", label: "Órdenes" },
]

export function ChartMetricSelector({
  data,
  height,
}: {
  data: { mes: string; total: number; ganancia: number; count: number }[]
  height?: number
}) {
  const [metric, setMetric] = useState<Metric>("total")

  return (
    <div>
      <div className="mb-3 flex justify-end gap-1">
        {OPTIONS.map((o) => (
          <button
            key={o.metric}
            type="button"
            onClick={() => setMetric(o.metric)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              metric === o.metric
                ? "bg-[#0F766E] text-white"
                : "text-gray-500 hover:bg-black/5"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <MonthlyChart data={data} height={height} metric={metric} />
    </div>
  )
}
