"use client"

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatMXN2 } from "@/lib/utils"

const monthLong = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" })

// Misma paleta que ventas-dashboard.tsx
const SOCIO_COLORS: Record<string, string> = {
  Sandra: "#0F766E",
  Benjamin: "#94A3B8",
}
const FALLBACK_COLORS = ["#0F766E", "#94A3B8", "#CBD5E1", "#6B7280"]

export type MonthlyPoint = {
  key: string
  date: Date
  label: string
  total: number
  ganancia: number
  count: number
}

/** Ventas mensuales (barras = total, línea = ganancia). Cargada bajo demanda. */
export function VentasMensualChart({ data }: { data: MonthlyPoint[] }) {
  return (
  <ResponsiveContainer width="100%" height={260}>
    <ComposedChart
      data={data}
      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
      barCategoryGap="32%"
    >
      <defs>
        <linearGradient id="ventasBarGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0F766E" stopOpacity={0.92} />
          <stop offset="100%" stopColor="#0F766E" stopOpacity={0.35} />
        </linearGradient>
      </defs>
      <CartesianGrid
        stroke="rgba(148,163,184,0.12)"
        strokeDasharray="0"
        vertical={false}
      />
      <XAxis
        dataKey="label"
        tick={{ fill: "#94A3B8", fontSize: 11 }}
        axisLine={false}
        tickLine={false}
      />
      <YAxis
        tick={{ fill: "#94A3B8", fontSize: 11 }}
        axisLine={false}
        tickLine={false}
        tickFormatter={(v: number) =>
          v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
        }
        width={60}
      />
      <Tooltip
        cursor={{ fill: "rgba(15,118,110,0.04)" }}
        contentStyle={{
          border: "1px solid rgba(15,23,42,0.06)",
          borderRadius: 12,
          fontSize: 12,
          boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
        }}
        formatter={(v) => formatMXN2(Number(v ?? 0))}
        labelFormatter={(l, p) => {
          const item = p?.[0]?.payload
          return item?.date ? monthLong.format(item.date) : l
        }}
      />
      <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
      <Bar
        dataKey="total"
        name="Total vendido"
        fill="url(#ventasBarGradient)"
        radius={[12, 12, 4, 4]}
        barSize={22}
        opacity={0.92}
      />
      <Line
        type="monotone"
        dataKey="ganancia"
        name="Ganancia"
        stroke="#94A3B8"
        strokeWidth={2.2}
        dot={false}
      />
    </ComposedChart>
  </ResponsiveContainer>
  )
}

/** Dona de reparto por socio. Cargada bajo demanda. */
export function SociosDonut({
  data,
}: {
  data: { id: string; name: string; value: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={140}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={42}
          outerRadius={58}
          paddingAngle={3}
          stroke="#ffffff"
          strokeWidth={2}
        >
          {data.map((s, i) => (
            <Cell
              key={s.id}
              fill={
                SOCIO_COLORS[s.name] ??
                FALLBACK_COLORS[i % FALLBACK_COLORS.length]
              }
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(v) => formatMXN2(Number(v ?? 0))}
          cursor={{ fill: "rgba(15,118,110,0.04)" }}
          contentStyle={{
            border: "1px solid rgba(15,23,42,0.06)",
            borderRadius: 12,
            fontSize: 12,
            boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

// Mismo módulo async → Recharts se descarga UNA sola vez para toda la página
export { VentasPorTipo } from "./ventas-por-tipo"
