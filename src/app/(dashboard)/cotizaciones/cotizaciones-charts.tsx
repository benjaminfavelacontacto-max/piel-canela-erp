"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatMXN } from "@/lib/utils"

export type MonthlyCotPoint = {
  label: string
  cotsCreadas: number
  conversiones: number
  valorConvertido: number
  pipelineCreado: number
}

/** Conversiones por mes + valor convertido vs pipeline. Cargado bajo demanda. */
export function CotizacionesCharts({
  monthlySeries,
}: {
  monthlySeries: MonthlyCotPoint[]
}) {
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <article className="rounded-2xl border border-gray-200 bg-pc-card p-5 shadow-sm">
        <header className="mb-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Conversiones por mes
          </h3>
          <p className="mt-0.5 text-[11px] text-gray-500">
            # de ventas cerradas vs cotizaciones creadas
          </p>
        </header>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={monthlySeries}
            margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
            barCategoryGap="32%"
          >
            <defs>
              <linearGradient id="cotsBarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--pc-chart-real)" stopOpacity={0.92} />
                <stop offset="100%" stopColor="var(--pc-chart-real)" stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--pc-text-muted)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "var(--pc-text-muted)" }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
            <Tooltip
              cursor={{ fill: "rgba(15,118,110,0.04)" }}
              contentStyle={{
                border: "1px solid var(--pc-border)",
                borderRadius: 12,
                fontSize: 12,
                boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
            <Bar dataKey="cotsCreadas" name="Cotizaciones creadas" fill="var(--pc-chart-comparative)" radius={[12, 12, 4, 4]} barSize={22} opacity={0.92} />
            <Bar dataKey="conversiones" name="Convertidas en venta" fill="url(#cotsBarGradient)" radius={[12, 12, 4, 4]} barSize={22} opacity={0.92} />
          </BarChart>
        </ResponsiveContainer>
      </article>
      <article className="rounded-2xl border border-gray-200 bg-pc-card p-5 shadow-sm">
        <header className="mb-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Valor convertido vs Pipeline
          </h3>
          <p className="mt-0.5 text-[11px] text-gray-500">
            MXN cobrado real (verde) y en cotizaciones (línea)
          </p>
        </header>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart
            data={monthlySeries}
            margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="gradValorConvertido" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--pc-chart-real)" stopOpacity={0.92} />
                <stop offset="100%" stopColor="var(--pc-chart-real)" stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--pc-text-muted)" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--pc-text-muted)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
              }
              width={50}
            />
            <Tooltip
              cursor={{ fill: "rgba(15,118,110,0.04)" }}
              contentStyle={{
                border: "1px solid var(--pc-border)",
                borderRadius: 12,
                fontSize: 12,
                boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
              }}
              formatter={(v) =>
                typeof v === "number" ? formatMXN(v) : String(v)
              }
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
            <Bar
              dataKey="valorConvertido"
              name="Valor convertido"
              fill="url(#gradValorConvertido)"
              radius={[12, 12, 4, 4]}
              barSize={22}
              opacity={0.92}
            />
            <Line
              type="monotone"
              dataKey="pipelineCreado"
              name="Pipeline creado"
              stroke="var(--pc-text-muted)"
              strokeWidth={2.2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </article>
    </section>
  )
}
