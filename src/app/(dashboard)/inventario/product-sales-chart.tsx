"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatMXN2 } from "@/lib/utils"

export default function ProductSalesChart({
  data,
}: {
  data: { mes: string; cantidad: number; revenue: number; label: string }[]
}) {
  return (
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#EEF1F4" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#9CA3AF", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#9CA3AF", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "#f3f4f6" }}
              contentStyle={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(v, key) =>
                key === "cantidad"
                  ? `${Number(v ?? 0)} u`
                  : formatMXN2(Number(v ?? 0))
              }
            />
            <Bar
              dataKey="cantidad"
              fill="#0F766E"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
  )
}
