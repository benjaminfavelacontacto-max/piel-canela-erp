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
import { formatMXN } from "@/lib/utils"

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
        <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "var(--pc-text-muted)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--pc-text-muted)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) =>
            v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
          }
          width={60}
        />
        <Tooltip
          cursor={{ stroke: "rgba(15,118,110,0.12)", strokeWidth: 1 }}
          contentStyle={{
            border: "1px solid var(--pc-border)",
            borderRadius: 12,
            fontSize: 12,
            boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
          }}
          formatter={(v) => formatMXN(Number(v ?? 0))}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
        <ReferenceLine
          y={invSandra}
          stroke="var(--pc-text-muted)"
          strokeDasharray="4 4"
          strokeOpacity={0.4}
          label={{
            value: `Inv. Sandra ${formatMXN(invSandra)}`,
            position: "insideTopRight",
            fill: "var(--pc-text-muted)",
            fontSize: 10,
          }}
        />
        <ReferenceLine
          y={invBenjamin}
          stroke="var(--pc-chart-real)"
          strokeDasharray="4 4"
          strokeOpacity={0.4}
          label={{
            value: `Inv. Benjamin ${formatMXN(invBenjamin)}`,
            position: "insideBottomRight",
            fill: "var(--pc-chart-real)",
            fontSize: 10,
          }}
        />
        <Line
          type="monotone"
          dataKey="sandra"
          name="Sandra"
          stroke="var(--pc-text-muted)"
          strokeWidth={2.2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="benjamin"
          name="Benjamin"
          stroke="var(--pc-chart-real)"
          strokeWidth={2.2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
