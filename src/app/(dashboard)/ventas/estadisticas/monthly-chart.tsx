"use client"

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

type TooltipPayloadItem = {
  name?: string | number
  value?: number
  color?: string
  dataKey?: string | number
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  const NAMES: Record<string, string> = {
    total: "Total vendido",
    ganancia: "Ganancia",
  }
  return (
    <div className="min-w-[180px] rounded-xl border border-gray-100 bg-white p-3 shadow-xl">
      <p className="mb-2 text-sm font-semibold text-gray-800">{label}</p>
      {payload.map((p, i) => (
        <div
          key={`${p.dataKey ?? p.name ?? i}`}
          className="flex items-center justify-between gap-4 text-xs"
        >
          <span style={{ color: p.color ?? "#6b7280" }}>
            {NAMES[String(p.dataKey ?? "")] ?? p.name ?? "—"}
          </span>
          <span className="font-bold tabular-nums text-gray-900">
            {typeof p.value === "number" ? mxn.format(p.value) : "—"}
          </span>
        </div>
      ))}
    </div>
  )
}

export function MonthlyChart({
  data,
  height = 320,
}: {
  data: { mes: string; total: number; ganancia: number; count: number }[]
  height?: number
}) {
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.mes + "-01").toLocaleDateString("es-MX", {
      month: "short",
      year: "2-digit",
    }),
  }))

  if (formatted.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-gray-500"
        style={{ height }}
      >
        Sin ventas en este periodo.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={formatted} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d9488" stopOpacity={1} />
            <stop offset="100%" stopColor="#0d9488" stopOpacity={0.3} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#f0f0f0" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) =>
            v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
          }
          width={60}
        />
        <Tooltip cursor={{ fill: "#f9fafb" }} content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
        <Bar
          dataKey="total"
          name="Total vendido"
          fill="url(#colorTotal)"
          radius={[6, 6, 0, 0]}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="ganancia"
          name="Ganancia"
          stroke="#db2777"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#db2777", strokeWidth: 2, stroke: "#fff" }}
          animationDuration={1200}
          animationEasing="ease-in-out"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
