"use client"

import { useState } from "react"
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

interface Orden {
  id: string
  numero: number | string | null
  fecha: string
  total: number
  estatus: string | null
  cliente: string
}

export interface TipoData {
  categoria: string
  totalVentas: number
  totalUnidades: number
  ordenes: Orden[]
}

const COLORES_CATEGORIA: Record<string, string> = {
  CINTAS: "#B45309",
  ACTIVADORES: "#0F766E",
  POTENCIADORES: "#047857",
  OXIGENANTES: "#0E7490",
  POLVOS: "#BE185D",
  "POLVO DE BLANQUEAR": "#7E22CE",
  AEROSOL: "#EA580C",
  "EMULSIÓN REVELADORA": "#1D4ED8",
  EMULSIÓN: "#1D4ED8",
  "ACEITE CORPORAL": "#B45309",
  ACEITE: "#B45309",
  EXFOLIANTS: "#0F766E",
  HUMECTANTES: "#4F46E5",
  "DYE COLOR": "#0E7490",
  AEROGRAFÍA: "#B91C1C",
  SHAMPOO: "#BE185D",
  OTROS: "#475569",
  "SIN CATEGORÍA": "#94A3B8",
}

const getColor = (cat: string) =>
  COLORES_CATEGORIA[cat.toUpperCase()] ?? "#475569"

const ESTATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  pagada_total: {
    label: "Pagada",
    color: "#047857",
    bg: "rgba(5,150,105,0.10)",
    border: "rgba(5,150,105,0.20)",
  },
  pagada_parcial: {
    label: "Parcial",
    color: "#B45309",
    bg: "rgba(217,119,6,0.10)",
    border: "rgba(217,119,6,0.20)",
  },
  pendiente: {
    label: "Pendiente",
    color: "#B91C1C",
    bg: "rgba(220,38,38,0.10)",
    border: "rgba(220,38,38,0.20)",
  },
  cancelada: {
    label: "Cancelada",
    color: "#475569",
    bg: "rgba(100,116,139,0.10)",
    border: "rgba(100,116,139,0.20)",
  },
}

const fmtMXN = (v: number) =>
  v.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  })

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
        background: "white",
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
          color: "#0F172A",
          fontVariantNumeric: "tabular-nums",
          marginBottom: 4,
          letterSpacing: "-0.025em",
        }}
      >
        {fmtMXN(d.totalVentas)}
      </p>
      <p style={{ fontSize: 11, color: "#64748B" }}>
        {d.totalUnidades.toLocaleString("es-MX")} unidades · {d.ordenes.length}{" "}
        órdenes
      </p>
      <p style={{ fontSize: 10, color: "#94A3B8", marginTop: 6 }}>
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
      <section className="rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
        Sin ventas registradas para análisis por tipo todavía.
      </section>
    )
  }

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white shadow-sm">
        {/* Header */}
        <header className="flex items-center justify-between gap-4 border-b border-[rgba(15,23,42,0.04)] px-6 py-4">
          <div>
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-gray-400">
              Análisis de Ventas
            </p>
            <h2 className="mt-0.5 text-[15px] font-semibold tracking-[-0.01em] text-[#0F172A]">
              Ventas por Tipo de Producto
            </h2>
          </div>
          <div className="text-right">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.10em] text-gray-400">
              Total general
            </p>
            <p
              className="mt-0.5 text-[18px] font-bold tabular-nums text-[#0F172A]"
              style={{ letterSpacing: "-0.025em" }}
            >
              {fmtMXN(totalGeneral)}
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_260px]">
          {/* Gráfica */}
          <div className="px-5 py-5 lg:pr-3">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={data}
                onClick={(e) => {
                  const ap = (
                    e as { activePayload?: { payload: TipoData }[] }
                  )?.activePayload
                  if (ap?.[0]) {
                    const clicked = ap[0].payload
                    setSeleccionado((prev) =>
                      prev?.categoria === clicked.categoria ? null : clicked,
                    )
                  }
                }}
                style={{ cursor: "pointer" }}
                margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(15,23,42,0.06)"
                  vertical={false}
                />
                <XAxis
                  dataKey="categoria"
                  tick={{
                    fontSize: 9,
                    fill: "#64748B",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                  }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) =>
                    v.length > 10 ? v.slice(0, 10) + "…" : v
                  }
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "#94A3B8" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
                  width={42}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: "rgba(15,23,42,0.03)" }}
                />
                <Bar dataKey="totalVentas" radius={[6, 6, 0, 0]} maxBarSize={52}>
                  {data.map((entry) => {
                    const isActive = seleccionado?.categoria === entry.categoria
                    const color = getColor(entry.categoria)
                    return (
                      <Cell
                        key={entry.categoria}
                        fill={isActive ? color : `${color}AA`}
                        style={{
                          filter: isActive
                            ? `drop-shadow(0 4px 8px ${color}40)`
                            : "none",
                          transition: "all 0.2s",
                        }}
                      />
                    )
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="mt-1 text-center text-[10px] text-gray-400">
              Click en una barra para ver las órdenes de ese tipo
            </p>
          </div>

          {/* Ranking lateral */}
          <div className="flex max-h-[340px] flex-col gap-2 overflow-y-auto border-t border-[rgba(15,23,42,0.04)] px-5 py-5 lg:border-l lg:border-t-0">
            <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-gray-400">
              Ranking
            </p>
            {data.map((tipo, i) => {
              const pct =
                totalGeneral > 0
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
                  className="rounded-xl border bg-white p-2.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                  style={{
                    borderColor: isSelected ? color : "rgba(15,23,42,0.06)",
                    boxShadow: isSelected ? `0 0 0 2px ${color}20` : undefined,
                    background: isSelected ? `${color}08` : "white",
                  }}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-[14px] text-[9px] font-bold text-gray-400 tabular-nums">
                        #{i + 1}
                      </span>
                      <span
                        className="text-[10.5px] font-semibold"
                        style={{
                          color: isSelected ? color : "#475569",
                          letterSpacing: "0.02em",
                        }}
                      >
                        {tipo.categoria.length > 14
                          ? tipo.categoria.slice(0, 13) + "…"
                          : tipo.categoria}
                      </span>
                    </div>
                    <span className="text-[10.5px] font-bold text-gray-700 tabular-nums">
                      {pct}%
                    </span>
                  </div>
                  <div className="h-[3px] overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-gray-500 tabular-nums">
                    {fmtMXN(tipo.totalVentas)} · {tipo.ordenes.length} órdenes
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* Donut: Unidades por Categoría */}
      <section className="overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white shadow-sm">
        <header className="flex items-center justify-between gap-4 border-b border-[rgba(15,23,42,0.04)] px-6 py-4">
          <div>
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-gray-400">
              Distribución
            </p>
            <h2 className="mt-0.5 text-[15px] font-semibold tracking-[-0.01em] text-[#0F172A]">
              Unidades Vendidas por Tipo
            </h2>
          </div>
          <div className="text-right">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.10em] text-gray-400">
              Total unidades
            </p>
            <p
              className="mt-0.5 text-[18px] font-bold tabular-nums text-[#0F172A]"
              style={{ letterSpacing: "-0.025em" }}
            >
              {data.reduce((s, d) => s + d.totalUnidades, 0).toLocaleString("es-MX")}
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_280px]">
          {/* Donut */}
          <div className="flex items-center justify-center px-5 py-6">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.filter((d) => d.totalUnidades > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={75}
                  outerRadius={120}
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
                      const isActive =
                        seleccionado?.categoria === entry.categoria
                      return (
                        <Cell
                          key={entry.categoria}
                          fill={isActive ? color : `${color}AA`}
                          stroke={isActive ? color : "white"}
                          strokeWidth={2}
                          style={{
                            filter: isActive
                              ? `drop-shadow(0 4px 8px ${color}40)`
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
                    const pct =
                      total > 0
                        ? ((d.totalUnidades / total) * 100).toFixed(1)
                        : "0"
                    return (
                      <div
                        style={{
                          background: "white",
                          border: `1px solid ${getColor(d.categoria)}40`,
                          borderRadius: 12,
                          padding: "12px 16px",
                          boxShadow:
                            "0 1px 2px rgba(15,23,42,0.04), 0 16px 40px rgba(15,23,42,0.10)",
                          minWidth: 160,
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
                            fontSize: 22,
                            fontWeight: 700,
                            color: "#0F172A",
                            letterSpacing: "-0.025em",
                            fontVariantNumeric: "tabular-nums",
                            marginBottom: 4,
                          }}
                        >
                          {d.totalUnidades.toLocaleString("es-MX")}
                        </p>
                        <p style={{ fontSize: 11, color: "#64748B" }}>
                          {pct}% del total
                        </p>
                        <p
                          style={{
                            fontSize: 10,
                            color: "#94A3B8",
                            marginTop: 6,
                          }}
                        >
                          Click para ver órdenes →
                        </p>
                      </div>
                    )
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Lista lateral */}
          <div className="flex max-h-[340px] flex-col justify-center gap-2 overflow-y-auto border-t border-[rgba(15,23,42,0.04)] px-5 py-5 lg:border-l lg:border-t-0">
            <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-gray-400">
              Distribución
            </p>
            {[...data]
              .filter((d) => d.totalUnidades > 0)
              .sort((a, b) => b.totalUnidades - a.totalUnidades)
              .map((tipo) => {
                const total = data.reduce((s, d) => s + d.totalUnidades, 0)
                const pct =
                  total > 0 ? (tipo.totalUnidades / total) * 100 : 0
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
                    className="flex items-center gap-2.5 rounded-lg border bg-white px-2.5 py-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                    style={{
                      borderColor: isSelected ? color : "rgba(15,23,42,0.06)",
                      background: isSelected ? `${color}08` : "white",
                    }}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        background: color,
                        boxShadow: isSelected
                          ? `0 0 8px ${color}80`
                          : "none",
                      }}
                    />
                    <span
                      className="flex-1 truncate text-[11px] font-medium"
                      style={{
                        color: isSelected ? color : "#475569",
                      }}
                    >
                      {tipo.categoria.length > 14
                        ? tipo.categoria.slice(0, 13) + "…"
                        : tipo.categoria}
                    </span>
                    <div className="shrink-0 text-right">
                      <span className="block text-[12px] font-bold tabular-nums text-[#0F172A]">
                        {tipo.totalUnidades.toLocaleString("es-MX")}
                      </span>
                      <span className="text-[9.5px] tabular-nums text-gray-400">
                        {pct.toFixed(1)}%
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
          className="overflow-hidden rounded-2xl border bg-white shadow-sm"
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
                  color: "#0F172A",
                },
                {
                  label: "Unidades",
                  value: seleccionado.totalUnidades.toLocaleString("es-MX"),
                  color: "#475569",
                },
                {
                  label: "Órdenes",
                  value: String(seleccionado.ordenes.length),
                  color: "#475569",
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
                className="flex size-7 items-center justify-center rounded-md border border-gray-200 bg-white text-[16px] text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-700"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
          </header>

          {/* Lista órdenes */}
          <div className="max-h-[320px] overflow-y-auto">
            {[...seleccionado.ordenes]
              .sort(
                (a, b) =>
                  new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
              )
              .map((orden) => {
                const sc = ESTATUS_CONFIG[orden.estatus ?? ""] ?? {
                  label: orden.estatus ?? "—",
                  color: "#94A3B8",
                  bg: "rgba(100,116,139,0.10)",
                  border: "rgba(100,116,139,0.20)",
                }
                return (
                  <div
                    key={orden.id}
                    className="grid items-center gap-4 border-b border-[rgba(15,23,42,0.03)] px-6 py-3 transition-colors hover:bg-gray-50/60"
                    style={{
                      gridTemplateColumns: "100px 1fr 110px 130px 100px",
                    }}
                  >
                    <p
                      className="truncate text-[12px] font-semibold tabular-nums"
                      style={{ color: getColor(seleccionado.categoria) }}
                    >
                      #{orden.numero ?? orden.id.slice(0, 8)}
                    </p>
                    <p className="truncate text-[12px] font-medium text-[#475569]">
                      {orden.cliente}
                    </p>
                    <p className="text-[11px] text-gray-400 tabular-nums">
                      {new Date(orden.fecha).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                        year: "2-digit",
                      })}
                    </p>
                    <p className="text-right text-[13px] font-bold tabular-nums text-[#0F172A]">
                      {fmtMXN(Number(orden.total))}
                    </p>
                    <div className="text-right">
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
                  </div>
                )
              })}
          </div>
        </section>
      )}
    </div>
  )
}
