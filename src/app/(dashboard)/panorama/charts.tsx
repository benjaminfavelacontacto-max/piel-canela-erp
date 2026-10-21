"use client"

import {
  Bar,
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
import { CHART } from "@/lib/chart-palette"
import { formatMXN, formatMXNshort } from "@/lib/utils"
import type { MesPunto, Panorama } from "@/lib/panorama"

const tooltipStyle = {
  border: "1px solid rgba(15,23,42,0.06)",
  borderRadius: 12,
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
}

/**
 * Ventas por mes (barras), utilidad registrada y promedio móvil de 3 meses.
 * Los meses sin ventas se dibujan en cero: la forma "a brincos" del negocio es
 * parte del mensaje. El mes en curso va más claro (aún no termina).
 */
export function VentasUtilidadChart({ data }: { data: MesPunto[] }) {
  return (
    <div role="img" aria-label="Gráfica de ventas, utilidad y promedio móvil por mes">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
          <defs>
            <linearGradient id="pnBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.real} stopOpacity={0.95} />
              <stop offset="100%" stopColor={CHART.real} stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: CHART.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
          <YAxis
            tick={{ fill: CHART.axisTick, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatMXNshort(v)}
            width={52}
          />
          <Tooltip
            cursor={{ fill: CHART.cursor }}
            contentStyle={tooltipStyle}
            formatter={(v, name) => [formatMXN(Number(v ?? 0)), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
          <Bar dataKey="ventas" name="Vendido" fill={CHART.real} radius={[10, 10, 3, 3]} animationDuration={900}>
            {data.map((d) => (
              <Cell key={d.mes} fill="url(#pnBar)" fillOpacity={d.parcial ? 0.55 : 1} />
            ))}
          </Bar>
          <Line type="monotone" dataKey="utilidad" name="Utilidad registrada" stroke="#F59E0B" strokeWidth={2.2} dot={false} animationDuration={1100} />
          <Line type="monotone" dataKey="promedio3m" name="Promedio móvil 3 m" stroke="#64748B" strokeWidth={2} strokeDasharray="5 4" dot={false} animationDuration={1300} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Ingresos por mes de clientes que compran por primera vez vs los que ya eran clientes. */
export function NuevosRecurrentesChart({ data }: { data: Panorama["clientes"]["nuevosVsRecurrentes"] }) {
  return (
    <div role="img" aria-label="Gráfica de ingresos por mes: clientes nuevos contra recurrentes">
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: CHART.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
          <YAxis tick={{ fill: CHART.axisTick, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatMXNshort(v)} width={52} />
          <Tooltip cursor={{ fill: CHART.cursor }} contentStyle={tooltipStyle} formatter={(v, name) => [formatMXN(Number(v ?? 0)), String(name)]} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
          <Bar dataKey="recurrentes" stackId="a" name="Clientes que ya compraban" fill={CHART.real} animationDuration={900} />
          <Bar dataKey="nuevos" stackId="a" name="Clientes nuevos" fill="#F59E0B" radius={[8, 8, 0, 0]} animationDuration={900} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
