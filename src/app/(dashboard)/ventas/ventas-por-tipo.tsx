"use client"

import { useState } from "react"
import Link from "next/link"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
  PieChart,
  Pie,
} from "recharts"
import { formatMXN as fmtMXN } from "@/lib/utils"

import { parseFecha } from "@/lib/fecha"

interface Orden {
  id: string
  numero: number | string | null
  fecha: string
  total: number
  estatus: string | null
  cliente: string
  unidadesCat?: number
  subtotalCat?: number
}

export interface TipoData {
  categoria: string
  totalVentas: number
  totalUnidades: number
  ordenes: Orden[]
}

const COLORES_CATEGORIA: Record<string, string> = {
  ACTIVADORES: "var(--pc-accent-ink)",
  POTENCIADORES: "var(--pc-success-ink)",
  CINTAS: "var(--pc-warning-ink)",
  "EMULSIÓN REVELADORA": "var(--pc-info-ink)",
  EMULSIÓN: "var(--pc-info-ink)",
  "POLVO DE BLANQUEAR": "var(--pc-purple-ink)",
  POLVOS: "var(--pc-purple-ink)",
  "ACEITE CORPORAL": "var(--pc-warning-ink)",
  ACEITE: "var(--pc-warning-ink)",
  OXIGENANTES: "var(--pc-cyan-ink)",
  AEROGRAFÍA: "var(--pc-danger-ink)",
  AEROSOL: "var(--pc-orange-ink)",
  HUMECTANTES: "var(--pc-indigo-ink)",
  HIDRATANTES: "var(--pc-indigo-ink)",
  EXFOLIANTS: "var(--pc-warning-ink)",
  EXFOLIANTES: "var(--pc-warning-ink)",
  "DYE COLOR": "var(--pc-cyan-ink)",
  SOMBRILLA: "var(--pc-gold-ink)",
  SOMBRILLAS: "var(--pc-gold-ink)",
  SHAMPOO: "var(--pc-pink-ink)",
  OTROS: "var(--pc-text-body)",
  "SIN CATEGORÍA": "var(--pc-text-secondary)",
}

// Paleta de fallback (tonos saturados que funcionan en light theme)
const FALLBACK_COLORS = [
  "var(--pc-warning)",
  "var(--pc-success)",
  "var(--pc-indigo-ink)",
  "#DB2777",
  "#0D9488",
  "var(--pc-violet-ink)",
  "var(--pc-orange-ink)",
  "#0891B2",
  "#65A30D",
  "var(--pc-danger)",
  "var(--pc-info)",
  "#C026D3",
]
const colorCache: Record<string, string> = {}
let fallbackIndex = 0

const getColor = (cat: string): string => {
  if (!cat) return COLORES_CATEGORIA["OTROS"]
  const key = cat.toUpperCase().trim()
  // Match exacto
  if (COLORES_CATEGORIA[key]) return COLORES_CATEGORIA[key]
  // Match por substring (ej: "EMULSIÓN" dentro de "EMULSIÓN REVELADORA")
  const matchKey = Object.keys(COLORES_CATEGORIA).find(
    (k) => key.includes(k) || k.includes(key),
  )
  if (matchKey) return COLORES_CATEGORIA[matchKey]
  // Fallback: asignar color del ciclo y cachear (idempotente por nombre)
  if (!colorCache[key]) {
    colorCache[key] = FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length]
    fallbackIndex++
  }
  return colorCache[key]
}

const ESTATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  pagada_total: {
    label: "Pagada",
    color: "var(--pc-success-ink)",
    bg: "rgba(5,150,105,0.10)",
    border: "rgba(5,150,105,0.20)",
  },
  pagada_parcial: {
    label: "Parcial",
    color: "var(--pc-warning-ink)",
    bg: "rgba(217,119,6,0.10)",
    border: "rgba(217,119,6,0.20)",
  },
  pendiente: {
    label: "Pendiente",
    color: "var(--pc-danger-ink)",
    bg: "rgba(220,38,38,0.10)",
    border: "rgba(220,38,38,0.20)",
  },
  cancelada: {
    label: "Cancelada",
    color: "var(--pc-text-body)",
    bg: "rgba(100,116,139,0.10)",
    border: "rgba(100,116,139,0.20)",
  },
}

interface TooltipPayload {
  payload: TipoData
}
function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayload[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div
      style={{
        background: "var(--pc-bg-card)",
        border: `1px solid ${getColor(d.categoria)}40`,
        borderRadius: 12,
        padding: "12px 16px",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 16px 40px rgba(15,23,42,0.10)",
        minWidth: 180,
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: getColor(d.categoria),
          marginBottom: 8,
        }}
      >
        {d.categoria}
      </p>
      <p
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "var(--pc-text)",
          fontVariantNumeric: "tabular-nums",
          marginBottom: 4,
          letterSpacing: "-0.025em",
        }}
      >
        {fmtMXN(d.totalVentas)}
      </p>
      <p style={{ fontSize: 11, color: "var(--pc-text-secondary)" }}>
        {d.totalUnidades.toLocaleString("es-MX")} unidades · {d.ordenes.length}{" "}
        órdenes
      </p>
      <p style={{ fontSize: 10, color: "var(--pc-text-muted)", marginTop: 6 }}>
        Click para ver órdenes →
      </p>
    </div>
  )
}

export function VentasPorTipo({ data }: { data: TipoData[] }) {
  const [seleccionado, setSeleccionado] = useState<TipoData | null>(null)
  const totalGeneral = data.reduce((s, d) => s + d.totalVentas, 0)

  if (data.length === 0) {
    return (
      <section className="rounded-2xl border border-pc-line bg-pc-card p-8 text-center text-sm text-gray-500 shadow-sm">
        Sin ventas registradas para análisis por tipo todavía.
      </section>
    )
  }

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-2xl border border-pc-line bg-pc-card shadow-sm">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-pc-line-soft px-6 py-4">
          <div>
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-gray-400">
              Análisis de Ventas
            </p>
            <h2 className="mt-0.5 text-[15px] font-semibold tracking-[-0.01em] text-pc-ink">
              Ventas por Tipo de Producto
            </h2>
          </div>
          <div className="flex items-center gap-8">
            <div className="text-right">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.10em] text-gray-400">
                Total MXN
              </p>
              <p
                className="mt-0.5 text-[16px] font-bold tabular-nums text-pc-ink"
                style={{ letterSpacing: "-0.025em" }}
              >
                {fmtMXN(totalGeneral)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.10em] text-gray-400">
                Total Unidades
              </p>
              <p
                className="mt-0.5 text-[16px] font-bold tabular-nums text-pc-ink"
                style={{ letterSpacing: "-0.025em" }}
              >
                {data.reduce((s, d) => s + d.totalUnidades, 0).toLocaleString("es-MX")}
              </p>
            </div>
          </div>
        </header>

        {/* Body: 3 columnas [barras | dona | ranking] */}
        <div
          className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_280px_240px]"
          style={{ minHeight: 320 }}
        >
          {/* COL 1: Barras */}
          <div className="border-b border-pc-line-soft px-5 pt-4 pb-3 lg:border-b-0 lg:border-r">
            <p className="mb-3 text-[9.5px] font-semibold uppercase tracking-[0.10em] text-gray-400">
              Ingresos por categoría
            </p>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={data}
                onClick={(e) => {
                  const ap = (e as { activePayload?: { payload: TipoData }[] })?.activePayload
                  if (ap?.[0]) {
                    const clicked = ap[0].payload
                    setSeleccionado((prev) =>
                      prev?.categoria === clicked.categoria ? null : clicked,
                    )
                  }
                }}
                style={{ cursor: "pointer" }}
                margin={{ top: 4, right: 8, bottom: 8, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--pc-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="categoria"
                  tick={{
                    fontSize: 9,
                    fill: "var(--pc-text-secondary)",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                  }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => (v.length > 8 ? v.slice(0, 8) + "…" : v)}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "var(--pc-text-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
                  width={38}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--pc-border-soft)" }} />
                <Bar dataKey="totalVentas" radius={[5, 5, 0, 0]} maxBarSize={44}>
                  {data.map((entry) => {
                    const isActive = seleccionado?.categoria === entry.categoria
                    const color = getColor(entry.categoria)
                    return (
                      <Cell
                        key={entry.categoria}
                        fill={isActive ? color : `color-mix(in srgb, ${color} 67%, transparent)`}
                        style={{
                          filter: isActive ? `drop-shadow(0 4px 8px color-mix(in srgb, ${color} 25%, transparent))` : "none",
                          transition: "all 0.2s",
                        }}
                      />
                    )
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="mt-1 text-center text-[10px] text-gray-400">
              Click en una barra para ver las órdenes
            </p>
          </div>

          {/* COL 2: Dona */}
          <div className="flex flex-col items-center border-b border-pc-line-soft px-3 pt-4 pb-3 lg:border-b-0 lg:border-r">
            <p className="mb-3 self-start pl-2 text-[9.5px] font-semibold uppercase tracking-[0.10em] text-gray-400">
              Unidades por categoría
            </p>
            <div className="relative flex w-full flex-1 items-center justify-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={data.filter((d) => d.totalUnidades > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="totalUnidades"
                    nameKey="categoria"
                    onClick={(entry) => {
                      const e = entry as unknown as TipoData
                      setSeleccionado((prev) =>
                        prev?.categoria === e.categoria ? null : e,
                      )
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {data
                      .filter((d) => d.totalUnidades > 0)
                      .map((entry) => {
                        const color = getColor(entry.categoria)
                        const isActive = seleccionado?.categoria === entry.categoria
                        return (
                          <Cell
                            key={entry.categoria}
                            fill={isActive ? color : `color-mix(in srgb, ${color} 67%, transparent)`}
                            stroke={isActive ? color : "var(--pc-bg-card)"}
                            strokeWidth={2}
                            style={{
                              filter: isActive
                                ? `drop-shadow(0 4px 8px color-mix(in srgb, ${color} 25%, transparent))`
                                : "none",
                              transition: "all 0.2s",
                            }}
                          />
                        )
                      })}
                  </Pie>
                  <Tooltip
                    content={(props: unknown) => {
                      const { active, payload } = props as {
                        active?: boolean
                        payload?: ReadonlyArray<{ payload: TipoData }>
                      }
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      const total = data.reduce((s, x) => s + x.totalUnidades, 0)
                      const pct = total > 0
                        ? ((d.totalUnidades / total) * 100).toFixed(1)
                        : "0"
                      return (
                        <div
                          style={{
                            background: "var(--pc-bg-card)",
                            border: `1px solid ${getColor(d.categoria)}40`,
                            borderRadius: 12,
                            padding: "10px 14px",
                            boxShadow:
                              "0 1px 2px rgba(15,23,42,0.04), 0 16px 40px rgba(15,23,42,0.10)",
                          }}
                        >
                          <p
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: getColor(d.categoria),
                              marginBottom: 6,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                            }}
                          >
                            {d.categoria}
                          </p>
                          <p
                            style={{
                              fontSize: 18,
                              fontWeight: 700,
                              color: "var(--pc-text)",
                              letterSpacing: "-0.025em",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {d.totalUnidades.toLocaleString("es-MX")} uds
                          </p>
                          <p style={{ fontSize: 10, color: "var(--pc-text-secondary)", marginTop: 3 }}>
                            {pct}% · {d.ordenes.length} órdenes
                          </p>
                          <p style={{ fontSize: 9, color: "var(--pc-text-muted)", marginTop: 4 }}>
                            Click para ver detalle →
                          </p>
                        </div>
                      )
                    }}
                  />
                  {/* Label central como SVG <text> — debajo del tooltip HTML */}
                  <text
                    x="50%"
                    y="47%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={
                      seleccionado
                        ? getColor(seleccionado.categoria)
                        : "var(--pc-text)"
                    }
                    fontSize={seleccionado ? 18 : 20}
                    fontWeight={700}
                    fontFamily="inherit"
                    style={{
                      pointerEvents: "none",
                      transition: "all 0.2s",
                      letterSpacing: "-0.025em",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {seleccionado
                      ? seleccionado.totalUnidades.toLocaleString("es-MX")
                      : data
                          .reduce((s, d) => s + d.totalUnidades, 0)
                          .toLocaleString("es-MX")}
                  </text>
                  <text
                    x="50%"
                    y="58%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--pc-text-muted)"
                    fontSize={9}
                    fontWeight={600}
                    fontFamily="inherit"
                    letterSpacing="0.10em"
                    style={{ pointerEvents: "none" }}
                  >
                    {seleccionado ? "UDS" : "TOTAL UDS"}
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-center text-[10px] text-gray-400">
              Click en un sector para ver las órdenes
            </p>
          </div>

          {/* COL 3: Ranking combinado */}
          <div
            className="flex flex-col gap-1.5 overflow-y-auto px-4 py-4"
            style={{ maxHeight: 320 }}
          >
            <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-gray-400">
              Ranking
            </p>
            {[...data]
              .sort((a, b) => b.totalVentas - a.totalVentas)
              .map((tipo, i) => {
                const pctMXN = totalGeneral > 0
                  ? Math.round((tipo.totalVentas / totalGeneral) * 100)
                  : 0
                const isSelected = seleccionado?.categoria === tipo.categoria
                const color = getColor(tipo.categoria)
                return (
                  <button
                    key={tipo.categoria}
                    type="button"
                    onClick={() =>
                      setSeleccionado((prev) =>
                        prev?.categoria === tipo.categoria ? null : tipo,
                      )
                    }
                    className="rounded-xl border bg-pc-card px-2.5 py-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                    style={{
                      borderColor: isSelected ? color : "var(--pc-border)",
                      background: isSelected ? `color-mix(in srgb, ${color} 3%, transparent)` : "var(--pc-bg-card)",
                    }}
                  >
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{
                            background: color,
                            boxShadow: isSelected ? `0 0 6px color-mix(in srgb, ${color} 50%, transparent)` : "none",
                          }}
                        />
                        <span
                          className="truncate text-[10.5px] font-semibold"
                          style={{
                            color: isSelected ? color : "var(--pc-text-body)",
                            maxWidth: 110,
                            letterSpacing: "0.02em",
                          }}
                        >
                          {tipo.categoria}
                        </span>
                      </div>
                      <span className="text-[9.5px] font-bold text-gray-400 tabular-nums">
                        #{i + 1}
                      </span>
                    </div>
                    <div className="mb-1 h-[2px] overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pctMXN}%`, background: color }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9.5px] tabular-nums text-gray-500">
                        {fmtMXN(tipo.totalVentas)}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-gray-500"
                      >
                        <span style={{ color, opacity: 0.9 }}>
                          {tipo.totalUnidades}u
                        </span>
                        · {pctMXN}%
                      </span>
                    </div>
                  </button>
                )
              })}
          </div>
        </div>
      </section>

      {/* Drill-down panel */}
      {seleccionado && (
        <section
          className="overflow-hidden rounded-2xl border bg-pc-card shadow-sm"
          style={{
            borderColor: `${getColor(seleccionado.categoria)}40`,
            boxShadow: `0 1px 2px rgba(15,23,42,0.04), 0 0 0 1px ${getColor(seleccionado.categoria)}10`,
            animation: "vpt-slide 0.2s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          <style>{`@keyframes vpt-slide { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }`}</style>
          <header
            className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4"
            style={{ borderColor: `${getColor(seleccionado.categoria)}20` }}
          >
            <div className="flex items-center gap-3">
              <span
                className="size-2.5 rounded-full"
                style={{
                  background: getColor(seleccionado.categoria),
                  boxShadow: `0 0 10px ${getColor(seleccionado.categoria)}60`,
                }}
              />
              <div>
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                  Órdenes
                </p>
                <h3
                  className="text-[14px] font-semibold tracking-[-0.01em]"
                  style={{ color: getColor(seleccionado.categoria) }}
                >
                  {seleccionado.categoria}
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-5">
              {[
                {
                  label: "Total vendido",
                  value: fmtMXN(seleccionado.totalVentas),
                  color: "var(--pc-text)",
                },
                {
                  label: "Unidades",
                  value: seleccionado.totalUnidades.toLocaleString("es-MX"),
                  color: "var(--pc-text-body)",
                },
                {
                  label: "Órdenes",
                  value: String(seleccionado.ordenes.length),
                  color: "var(--pc-text-body)",
                },
              ].map((s, i) => (
                <div key={i} className="text-right">
                  <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                    {s.label}
                  </p>
                  <p
                    className="mt-0.5 text-[15px] font-bold tabular-nums"
                    style={{ color: s.color, letterSpacing: "-0.015em" }}
                  >
                    {s.value}
                  </p>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSeleccionado(null)}
                className="flex size-7 items-center justify-center rounded-md border border-gray-200 bg-pc-card text-[16px] text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-700"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
          </header>

          {/* Header de columnas */}
          <div
            className="grid items-center gap-5 border-b border-pc-line px-8 py-3"
            style={{
              gridTemplateColumns: "1fr 160px 100px 100px 130px 100px 40px",
            }}
          >
            {[
              { label: "Orden", align: "left" },
              { label: "Cliente", align: "left" },
              { label: "Fecha", align: "center" },
              { label: "Unidades", align: "center" },
              { label: "Total venta", align: "right" },
              { label: "Estatus", align: "center" },
              { label: "", align: "center" },
            ].map((h, i) => (
              <p
                key={i}
                className="text-[9.5px] font-semibold uppercase tracking-[0.10em] text-gray-400"
                style={{ textAlign: h.align as "left" | "right" | "center" }}
              >
                {h.label}
              </p>
            ))}
          </div>

          {/* Lista órdenes */}
          <div className="max-h-[360px] overflow-y-auto">
            {[...seleccionado.ordenes]
              .sort(
                (a, b) =>
                  parseFecha(b.fecha).getTime() - parseFecha(a.fecha).getTime(),
              )
              .map((orden) => {
                const sc = ESTATUS_CONFIG[orden.estatus ?? ""] ?? {
                  label: orden.estatus ?? "—",
                  color: "var(--pc-text-muted)",
                  bg: "rgba(100,116,139,0.10)",
                  border: "rgba(100,116,139,0.20)",
                }
                const catColor = getColor(seleccionado.categoria)
                return (
                  <div
                    key={orden.id}
                    className="grid items-center gap-5 overflow-hidden border-b border-pc-line-soft px-8 py-3.5 transition-colors hover:bg-gray-50/60"
                    style={{
                      gridTemplateColumns:
                        "1fr 160px 100px 100px 130px 100px 40px",
                    }}
                  >
                    {/* Número clickeable */}
                    <Link
                      href={`/ventas/${orden.id}`}
                      className="flex items-center gap-1.5 overflow-hidden text-[12px] font-semibold tabular-nums transition-opacity hover:opacity-70"
                      style={{
                        color: catColor,
                        minWidth: 0,
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                      }}
                      title={String(orden.numero ?? orden.id)}
                    >
                      <span className="truncate">
                        #{orden.numero ?? orden.id.slice(0, 8)}
                      </span>
                      <span
                        className="shrink-0 rounded text-[8.5px] opacity-50"
                        style={{
                          border: "1px solid currentColor",
                          padding: "0 4px",
                          letterSpacing: "0.05em",
                        }}
                      >
                        ↗
                      </span>
                    </Link>

                    {/* Cliente */}
                    <p
                      className="truncate text-[12.5px] font-medium text-pc-ink-2"
                      title={orden.cliente}
                    >
                      {orden.cliente}
                    </p>

                    {/* Fecha */}
                    <p className="text-center text-[11px] tabular-nums text-gray-400">
                      {parseFecha(orden.fecha).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                        year: "2-digit",
                      })}
                    </p>

                    {/* Unidades de la categoría seleccionada en esta orden */}
                    <div className="text-center">
                      <span
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums"
                        style={{
                          background: `color-mix(in srgb, ${catColor} 6%, transparent)`,
                          color: catColor,
                          border: `1px solid color-mix(in srgb, ${catColor} 14%, transparent)`,
                        }}
                      >
                        {orden.unidadesCat ?? 0}
                        <span className="text-[9px] font-normal opacity-70">
                          uds
                        </span>
                      </span>
                      <p className="mt-0.5 text-[9.5px] tabular-nums text-gray-400">
                        {fmtMXN(orden.subtotalCat ?? 0)}
                      </p>
                    </div>

                    {/* Total venta completa (más tenue — es el total de TODA la venta) */}
                    <p className="text-right text-[13px] font-semibold tabular-nums text-gray-500">
                      {fmtMXN(Number(orden.total))}
                    </p>

                    {/* Status */}
                    <div className="text-center">
                      <span
                        className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: sc.bg,
                          color: sc.color,
                          border: `1px solid ${sc.border}`,
                        }}
                      >
                        {sc.label}
                      </span>
                    </div>

                    {/* Botón ir */}
                    <Link
                      href={`/ventas/${orden.id}`}
                      title={`Abrir orden ${orden.numero ?? ""}`}
                      className="mx-auto flex size-8 items-center justify-center rounded-md border border-gray-200 bg-pc-card text-gray-400 transition-all hover:-translate-y-0.5"
                      style={{ fontSize: 14 }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget
                        el.style.background = `color-mix(in srgb, ${catColor} 6%, transparent)`
                        el.style.borderColor = `color-mix(in srgb, ${catColor} 25%, transparent)`
                        el.style.color = catColor
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget
                        el.style.background = "var(--pc-bg-card)"
                        el.style.borderColor = "rgb(229 231 235)"
                        el.style.color = "var(--pc-text-muted)"
                      }}
                    >
                      ↗
                    </Link>
                  </div>
                )
              })}
          </div>
        </section>
      )}
    </div>
  )
}
