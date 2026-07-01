"use client"

import { useState } from "react"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatMXN } from "@/lib/utils"

export interface DataPoint {
  mes: string
  label: string
  ventas: number | null
  ganancia: number | null
  proyeccion: number | null
  proyeccionGanancia: number | null
  esFuturo: boolean
  esTemporadaAlta: boolean
}

type Vista = "ambas" | "ventas" | "ganancia"

function fmtShort(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`
  return `$${v}`
}

interface TooltipPayloadItem {
  payload?: DataPoint
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const data = payload[0]?.payload
  if (!data) return null

  return (
    <div
      className="min-w-[200px] rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white p-4 backdrop-blur-sm"
      style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.10)" }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {label}
        </p>
        {data.esFuturo && (
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600">
            Proyección
          </span>
        )}
        {data.esTemporadaAlta && !data.esFuturo && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
            ☀ Temporada alta
          </span>
        )}
      </div>

      <div className="space-y-2">
        {(data.ventas != null || data.proyeccion != null) && (
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div
                className={`h-2.5 w-2.5 rounded-sm ${
                  data.esFuturo ? "bg-violet-300" : "bg-gray-300"
                }`}
              />
              <span className="text-xs text-gray-500">Ventas</span>
            </div>
            <span className="text-sm font-bold tabular-nums text-gray-900">
              {formatMXN(data.ventas ?? data.proyeccion)}
            </span>
          </div>
        )}

        {(data.ganancia != null || data.proyeccionGanancia != null) && (
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-xs text-gray-500">Ganancia</span>
            </div>
            <span className="text-sm font-bold tabular-nums text-emerald-600">
              {formatMXN(data.ganancia ?? data.proyeccionGanancia)}
            </span>
          </div>
        )}

        {data.ventas != null && data.ganancia != null && data.ventas > 0 && (
          <div className="mt-2 border-t border-gray-50 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Margen</span>
              <span className="text-xs font-semibold tabular-nums text-gray-600">
                {Math.round((data.ganancia / data.ventas) * 100)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Gráfica Histórico vs Proyección — estilo Stripe / Vercel Analytics.
 * - Toggle de vista (Ambas / Ventas / Ganancia)
 * - Resumen ejecutivo arriba (proyectado, % vs promedio, confianza)
 * - Tooltip premium con tone por tipo de fila
 * - Línea "Hoy" entre histórico y proyección
 * - Barras proyección violet, ganancia line emerald, forecast dashed
 */
export function GraficaHistoricoProyeccion({
  data,
  confianzaPct = 82,
}: {
  data: DataPoint[]
  confianzaPct?: number
}) {
  const [vista, setVista] = useState<Vista>("ambas")

  const historico = data.filter((d) => !d.esFuturo)
  const futuro = data.filter((d) => d.esFuturo)

  const proyeccionTotal = futuro.reduce(
    (s, d) => s + (d.proyeccion ?? 0),
    0,
  )
  const promedioHistorico =
    historico.length > 0
      ? historico.reduce((s, d) => s + (d.ventas ?? 0), 0) / historico.length
      : 0
  const cambioPct =
    promedioHistorico > 0 && futuro.length > 0
      ? Math.round(
          ((proyeccionTotal / futuro.length - promedioHistorico) /
            promedioHistorico) *
            100,
        )
      : 0

  const todayLabel = historico[historico.length - 1]?.label

  return (
    <div
      className="overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.05)] bg-white"
      style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.03)" }}
    >
      {/* ─── Header con resumen ejecutivo ─── */}
      <div className="border-b border-[rgba(15,23,42,0.04)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p
              className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]"
            >
              Histórico · Proyección próximos {futuro.length} meses
            </p>
            <div className="flex flex-wrap items-baseline gap-3">
              <div>
                <p
                  className="text-[24px] font-bold leading-none tracking-[-0.03em] tabular-nums text-[#0F172A]"
                  style={{ fontFeatureSettings: '"tnum" 1, "ss01" 1' }}
                >
                  {fmtShort(proyeccionTotal)}
                </p>
                <p className="mt-1 text-[11px] text-[#94A3B8]">proyectados</p>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
                  cambioPct >= 0
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-rose-50 text-rose-500"
                }`}
              >
                {cambioPct >= 0 ? "↑" : "↓"} {Math.abs(cambioPct)}% vs promedio
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-600">
                {confianzaPct}% confianza
              </span>
            </div>
          </div>

          {/* Toggle vista */}
          <div className="flex items-center gap-1 rounded-xl bg-[#F3F5F7] p-1">
            {(["ambas", "ventas", "ganancia"] as Vista[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all duration-180 ${
                  vista === v
                    ? "bg-white text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                {v === "ambas"
                  ? "Ambas"
                  : v === "ventas"
                    ? "Ventas"
                    : "Ganancia"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Chart ─── */}
      <div className="p-5 pt-4">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            barCategoryGap="32%"
          >
            <defs>
              <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E2E8F0" stopOpacity={1} />
                <stop offset="100%" stopColor="#F1F5F9" stopOpacity={0.8} />
              </linearGradient>
              <linearGradient id="gradProyeccion" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.85} />
                <stop offset="100%" stopColor="#C4B5FD" stopOpacity={0.55} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="0"
              stroke="rgba(148,163,184,0.12)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              axisLine={false}
              tickLine={false}
              dy={8}
            />
            <YAxis
              tickFormatter={fmtShort}
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(15,118,110,0.04)" }}
            />

            {todayLabel && (
              <ReferenceLine
                x={todayLabel}
                stroke="#8B5CF6"
                strokeOpacity={0.35}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{
                  value: "Hoy",
                  position: "top",
                  fontSize: 10,
                  fill: "#8B5CF6",
                  fontWeight: 600,
                }}
              />
            )}

            {(vista === "ambas" || vista === "ventas") && (
              <Bar
                dataKey="ventas"
                fill="url(#gradVentas)"
                radius={[6, 6, 0, 0]}
                maxBarSize={32}
                name="ventas"
              />
            )}
            {(vista === "ambas" || vista === "ventas") && (
              <Bar
                dataKey="proyeccion"
                fill="url(#gradProyeccion)"
                stroke="#8B5CF6"
                strokeOpacity={0.4}
                strokeDasharray="3 3"
                radius={[6, 6, 0, 0]}
                maxBarSize={32}
                name="proyeccion"
              />
            )}
            {(vista === "ambas" || vista === "ganancia") && (
              <Line
                dataKey="ganancia"
                stroke="#10B981"
                strokeWidth={2.5}
                dot={{
                  r: 4,
                  fill: "#10B981",
                  stroke: "white",
                  strokeWidth: 2,
                }}
                activeDot={{
                  r: 6,
                  fill: "#10B981",
                  stroke: "white",
                  strokeWidth: 2,
                }}
                connectNulls={false}
                name="ganancia"
              />
            )}
            {(vista === "ambas" || vista === "ganancia") && (
              <Line
                dataKey="proyeccionGanancia"
                stroke="#10B981"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                strokeOpacity={0.5}
                dot={{
                  r: 3,
                  fill: "#10B981",
                  stroke: "white",
                  strokeWidth: 1.5,
                  opacity: 0.6,
                }}
                connectNulls={false}
                name="proyeccionGanancia"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {/* ─── Leyenda minimalista ─── */}
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[rgba(15,23,42,0.04)] pt-3">
          {(vista === "ambas" || vista === "ventas") && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-[#E2E8F0]" />
              <span className="text-[11px] text-[#94A3B8]">Ventas</span>
            </div>
          )}
          {(vista === "ambas" || vista === "ganancia") && (
            <div className="flex items-center gap-2">
              <div className="h-0.5 w-4 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-[#94A3B8]">Ganancia neta</span>
            </div>
          )}
          {(vista === "ambas" || vista === "ventas") && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-[#A78BFA] opacity-70" />
              <span className="text-[11px] text-[#94A3B8]">Proyección</span>
            </div>
          )}
          {(vista === "ambas" || vista === "ganancia") && (
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-0.5 w-1 rounded-full bg-emerald-400 opacity-50"
                  />
                ))}
              </div>
              <span className="text-[11px] text-[#94A3B8]">Forecast</span>
            </div>
          )}
          <span className="ml-auto text-[10px] text-[#CBD5E1]">
            Proyección: prom. 3m × estacionalidad
          </span>
        </div>
      </div>
    </div>
  )
}
