"use client"

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

type Point = {
  mes: string
  label: string
  sandra: number
  benjamin: number
}

export function RecoveryChart({
  data,
  invSandra,
  invBenjamin,
}: {
  data: Point[]
  invSandra: number
  invBenjamin: number
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-500">
        Sin movimientos para graficar.
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#EEF1F4" strokeDasharray="3 3" />
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
          contentStyle={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(v) => mxn.format(Number(v ?? 0))}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine
          y={invSandra}
          stroke="#94A3B8"
          strokeDasharray="4 4"
          strokeOpacity={0.55}
          label={{
            value: `Inv. Sandra ${mxn.format(invSandra)}`,
            position: "insideTopRight",
            fill: "#94A3B8",
            fontSize: 10,
          }}
        />
        <ReferenceLine
          y={invBenjamin}
          stroke="#0F766E"
          strokeDasharray="4 4"
          strokeOpacity={0.55}
          label={{
            value: `Inv. Benjamin ${mxn.format(invBenjamin)}`,
            position: "insideBottomRight",
            fill: "#0F766E",
            fontSize: 10,
          }}
        />
        <Line
          type="monotone"
          dataKey="sandra"
          name="Sandra"
          stroke="#94A3B8"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#94A3B8" }}
        />
        <Line
          type="monotone"
          dataKey="benjamin"
          name="Benjamin"
          stroke="#0F766E"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#0F766E" }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
