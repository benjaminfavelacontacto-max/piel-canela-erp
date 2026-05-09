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

export function MonthlyChart({
  data,
}: {
  data: { mes: string; total: number; ganancia: number; count: number }[]
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
      <div className="flex h-64 items-center justify-center text-sm text-gray-500">
        Sin ventas en este periodo.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={formatted} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fill: "#6b7280", fontSize: 12 }}
          axisLine={{ stroke: "#e5e7eb" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#6b7280", fontSize: 12 }}
          axisLine={{ stroke: "#e5e7eb" }}
          tickLine={false}
          tickFormatter={(v: number) =>
            v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
          }
          width={60}
        />
        <Tooltip
          cursor={{ fill: "#f9fafb" }}
          contentStyle={{ border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => mxn.format(v)}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="total" name="Total vendido" fill="#1b4332" radius={[4, 4, 0, 0]} />
        <Line
          type="monotone"
          dataKey="ganancia"
          name="Ganancia"
          stroke="#db2777"
          strokeWidth={2}
          dot={{ r: 3, fill: "#db2777" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
