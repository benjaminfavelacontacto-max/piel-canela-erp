"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { CHART } from "@/lib/chart-palette"
import type { FormatoValor, Grafica } from "@/lib/asistente/tipos"

// Paleta categórica de datos (excepción documentada a la regla de tokens).
const SERIES = [CHART.real, "#8B5CF6", "#C5A47E", "#0E7490", "#B45309", "#4F46E5", "#B91C1C", "#475569"]

const compacto = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 })

export function formatear(v: number, f: FormatoValor): string {
  if (f === "moneda") return (Number(v) || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" })
  if (f === "porcentaje") return (Number(v) || 0).toLocaleString("es-MX", { maximumFractionDigits: 1 }) + "%"
  return (Number(v) || 0).toLocaleString("es-MX", { maximumFractionDigits: 2 })
}

function corto(v: number, f: FormatoValor): string {
  const t = compacto.format(Number(v) || 0)
  return f === "moneda" ? "$" + t : f === "porcentaje" ? t + "%" : t
}

const tooltipStyle = {
  background: "var(--pc-bg-card)",
  border: "1px solid var(--pc-hair)",
  borderRadius: 12,
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
}

export function GraficaAsistente({ grafica }: { grafica: Grafica }) {
  const { tipo, titulo, etiquetas, series, formato } = grafica
  const datos = etiquetas.map((etiqueta, i) => {
    const fila: Record<string, string | number> = { etiqueta }
    series.forEach((s, j) => (fila["s" + j] = s.valores[i] ?? 0))
    return fila
  })
  const fmt = (v: unknown) => formatear(Number(v), formato)
  const variasSeries = series.length > 1

  let cuerpo: React.ReactNode
  let alto = 220

  if (tipo === "dona") {
    const total = series[0].valores.reduce((a, v) => a + (Number(v) || 0), 0)
    cuerpo = (
      <PieChart>
        <Pie
          data={datos}
          dataKey="s0"
          nameKey="etiqueta"
          innerRadius={58}
          outerRadius={86}
          paddingAngle={2}
          stroke="none"
          isAnimationActive
          animationDuration={700}
        >
          {datos.map((_, i) => (
            <Cell key={i} fill={SERIES[i % SERIES.length]} />
          ))}
        </Pie>
        <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="var(--pc-text-muted)">
          Total
        </text>
        <text x="50%" y="56%" textAnchor="middle" dominantBaseline="middle" fontSize={14} fontWeight={600} fill="currentColor">
          {corto(total, formato)}
        </text>
        <Tooltip formatter={fmt} contentStyle={tooltipStyle} />
      </PieChart>
    )
    return (
      <Marco titulo={titulo}>
        <div style={{ width: "100%", height: alto }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            {cuerpo}
          </ResponsiveContainer>
        </div>
        <ul className="mt-1 space-y-1">
          {datos.map((d, i) => (
            <li key={i} className="flex items-center gap-2 text-[12px]">
              <span className="size-2 shrink-0 rounded-full" style={{ background: SERIES[i % SERIES.length] }} />
              <span className="min-w-0 flex-1 truncate text-pc-ink-2">{d.etiqueta}</span>
              <span className="tabular-nums text-pc-ink">{fmt(d.s0)}</span>
              <span className="w-10 text-right tabular-nums text-pc-ink-3">
                {total ? Math.round((Number(d.s0) / total) * 100) : 0}%
              </span>
            </li>
          ))}
        </ul>
      </Marco>
    )
  }

  const ejes = {
    tick: { fontSize: 10.5, fill: CHART.axisTick },
    axisLine: false,
    tickLine: false,
  } as const

  if (tipo === "barras") {
    // En un panel angosto, las barras horizontales dejan leer nombres largos (clientes, productos).
    const horizontal = !variasSeries && (etiquetas.length > 6 || etiquetas.some((e) => e.length > 9))
    if (horizontal) {
      alto = Math.max(160, etiquetas.length * 30 + 20)
      cuerpo = (
        <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke={CHART.grid} />
          <XAxis type="number" {...ejes} tickFormatter={(v) => corto(v, formato)} />
          <YAxis
            type="category"
            dataKey="etiqueta"
            width={112}
            {...ejes}
            tickFormatter={(v: string) => (v.length > 17 ? v.slice(0, 16) + "…" : v)}
          />
          <Tooltip formatter={fmt} cursor={{ fill: CHART.cursor }} contentStyle={tooltipStyle} />
          <Bar dataKey="s0" name={series[0].nombre} fill={SERIES[0]} radius={[4, 8, 8, 4]} barSize={16} animationDuration={700} />
        </BarChart>
      )
    } else {
      cuerpo = (
        <BarChart data={datos} margin={{ top: 6, right: 6, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="etiqueta" {...ejes} interval="preserveStartEnd" />
          <YAxis {...ejes} width={48} tickFormatter={(v) => corto(v, formato)} />
          <Tooltip formatter={fmt} cursor={{ fill: CHART.cursor }} contentStyle={tooltipStyle} />
          {series.map((s, j) => (
            <Bar key={j} dataKey={"s" + j} name={s.nombre} fill={SERIES[j % SERIES.length]} radius={[8, 8, 3, 3]} maxBarSize={26} animationDuration={700} />
          ))}
        </BarChart>
      )
    }
  } else if (tipo === "area") {
    cuerpo = (
      <AreaChart data={datos} margin={{ top: 6, right: 6, bottom: 0, left: -8 }}>
        <defs>
          {series.map((_, j) => (
            <linearGradient key={j} id={"pc-ai-area-" + j} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[j % SERIES.length]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={SERIES[j % SERIES.length]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="etiqueta" {...ejes} interval="preserveStartEnd" />
        <YAxis {...ejes} width={48} tickFormatter={(v) => corto(v, formato)} />
        <Tooltip formatter={fmt} contentStyle={tooltipStyle} />
        {series.map((s, j) => (
          <Area key={j} type="monotone" dataKey={"s" + j} name={s.nombre} stroke={SERIES[j % SERIES.length]} strokeWidth={2.2} fill={"url(#pc-ai-area-" + j + ")"} animationDuration={800} />
        ))}
      </AreaChart>
    )
  } else {
    cuerpo = (
      <LineChart data={datos} margin={{ top: 6, right: 6, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="etiqueta" {...ejes} interval="preserveStartEnd" />
        <YAxis {...ejes} width={48} tickFormatter={(v) => corto(v, formato)} />
        <Tooltip formatter={fmt} contentStyle={tooltipStyle} />
        {series.map((s, j) => (
          <Line key={j} type="monotone" dataKey={"s" + j} name={s.nombre} stroke={SERIES[j % SERIES.length]} strokeWidth={2.2} dot={etiquetas.length <= 12 ? { r: 2.5 } : false} animationDuration={800} />
        ))}
      </LineChart>
    )
  }

  return (
    <Marco titulo={titulo}>
      <div style={{ width: "100%", height: alto }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {cuerpo}
        </ResponsiveContainer>
      </div>
      {variasSeries && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {series.map((s, j) => (
            <span key={j} className="flex items-center gap-1.5 text-[11px] text-pc-ink-2">
              <span className="size-2 rounded-full" style={{ background: SERIES[j % SERIES.length] }} />
              {s.nombre}
            </span>
          ))}
        </div>
      )}
    </Marco>
  )
}

function Marco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <figure className="rounded-2xl border border-pc-line-soft bg-pc-card p-3.5 text-pc-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <figcaption className="mb-2 text-[12.5px] font-semibold tracking-tight text-pc-ink">{titulo}</figcaption>
      {children}
    </figure>
  )
}
