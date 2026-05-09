"use client"

import { useMemo } from "react"
import { Brain, Calendar, Sparkles, Target, TrendingUp, Zap } from "lucide-react"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { EnrichedCliente, VentaSummaryRow } from "./clientes-dashboard"

const MESES_ABBR = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
function formatMesLabel(mesStr: string) {
  const [year, month] = mesStr.split("-")
  return `${MESES_ABBR[parseInt(month, 10) - 1]} ${year.slice(2)}`
}
function formatMXN(v: number | null | undefined) {
  if (v == null) return "—"
  return v.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  })
}
function formatYAxis(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`
  return `$${value}`
}

type TooltipPayloadEntry = {
  name?: string
  value?: number | null
  fill?: string
  color?: string
}
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-[200px] rounded-xl border border-gray-100 bg-white p-4 shadow-xl">
      <p className="mb-3 border-b border-gray-100 pb-2 font-semibold text-gray-800">
        {label}
      </p>
      {payload.map(
        (p, i) =>
          p.value != null && (
            <div
              key={`${p.name ?? i}`}
              className="mb-1.5 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-2">
                <div
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: p.fill ?? p.color ?? "#9ca3af" }}
                />
                <span className="text-sm text-gray-600">
                  {p.name === "real"
                    ? "Vendido real"
                    : p.name === "estimado"
                      ? "Proyectado"
                      : p.name === "ganancia"
                        ? "Ganancia neta"
                        : (p.name ?? "")}
                </span>
              </div>
              <span className="font-bold tabular-nums text-gray-900">
                {formatMXN(p.value)}
              </span>
            </div>
          ),
      )}
    </div>
  )
}

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})
const mxn2 = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const monthLong = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
})

export function EstimadoIngresos({
  clientes,
  ventas,
}: {
  clientes: EnrichedCliente[]
  ventas: VentaSummaryRow[]
}) {
  const today = useMemo(() => new Date(), [])

  // ─── Histórico mensual: SOLO meses con ventas reales ─────────────
  // Agrupa por mes desde ventas (no se rellena con ceros pre-data).
  const historico = useMemo(() => {
    const map = new Map<
      string,
      { mes: string; real: number; ganancia: number; count: number }
    >()
    for (const v of ventas) {
      if (v.estatus === "cancelada") continue
      const mes = v.fecha.slice(0, 7) // '2025-06'
      const cur = map.get(mes) ?? { mes, real: 0, ganancia: 0, count: 0 }
      cur.real += Number(v.total ?? 0)
      cur.ganancia += Number(v.utilidad_neta ?? 0)
      cur.count += 1
      map.set(mes, cur)
    }
    return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes))
  }, [ventas])

  // ─── Promedios reales + estimación basada en últimos 3 meses ─────
  const insights = useMemo(() => {
    const last3 = historico.slice(-3)
    const last6 = historico.slice(-6)
    const promMes3 =
      last3.reduce((s, m) => s + m.real, 0) / Math.max(1, last3.length)
    const promMes6 =
      last6.reduce((s, m) => s + m.real, 0) / Math.max(1, last6.length)
    const promGanancia3 =
      last3.reduce((s, m) => s + m.ganancia, 0) / Math.max(1, last3.length)
    // Tendencia: último trimestre (mes -3..-1) vs trimestre previo (mes -6..-4)
    const trim1 = last3.reduce((s, m) => s + m.real, 0)
    const trim2 = historico.slice(-6, -3).reduce((s, m) => s + m.real, 0)
    const tendenciaPct = trim2 > 0 ? ((trim1 - trim2) / trim2) * 100 : 0
    // Estimación = promedio últ 3 + ajuste tendencia (capped ±30%)
    const estimadoBase = promMes3 * 0.7 + promMes6 * 0.3
    const ajusteTend = Math.max(-30, Math.min(30, tendenciaPct)) / 100
    const estimadoMesProx = estimadoBase * (1 + ajusteTend)
    const estimadoTrim = estimadoMesProx * 3

    return {
      promMes3,
      promMes6,
      promGanancia3,
      tendenciaPct,
      estimadoMesProx,
      estimadoTrim,
    }
  }, [historico])

  // ─── Proyección 3 meses futuros ──────────────────────────────────
  const proyecciones = useMemo(() => {
    if (historico.length === 0) return []
    const ultimoMes = historico[historico.length - 1].mes
    return [1, 2, 3].map((i) => {
      const fecha = new Date(`${ultimoMes}-01T00:00:00`)
      fecha.setMonth(fecha.getMonth() + i)
      const mesStr = fecha.toISOString().slice(0, 7)
      // +2% mensual optimista compuesto
      const factor = 1 + i * 0.02
      return {
        mes: mesStr,
        estimado: Math.round(insights.estimadoMesProx * factor),
        ganancia: Math.round(insights.promGanancia3 * factor),
      }
    })
  }, [historico, insights])

  // ─── Combinar histórico + proyección para Recharts ──────────────
  const dataGrafica = useMemo(() => {
    return [
      ...historico.map((m) => ({
        mes: m.mes,
        label: formatMesLabel(m.mes),
        real: m.real,
        estimado: null as number | null,
        ganancia: m.ganancia,
        esProyeccion: false,
      })),
      ...proyecciones.map((p) => ({
        mes: p.mes,
        label: `${formatMesLabel(p.mes)} (est.)`,
        real: null as number | null,
        estimado: p.estimado,
        ganancia: p.ganancia,
        esProyeccion: true,
      })),
    ]
  }, [historico, proyecciones])

  // ─── Clientes "probable recompra" ─────────────────────────────────
  // Si dias_sin_compra está cerca (o por encima) de su frecuencia_dias,
  // es alta probabilidad de recompra inminente.
  const probableRecompra = useMemo(() => {
    return clientes
      .filter(
        (c) =>
          c.frecuencia_dias !== null &&
          c.dias_sin_compra !== null &&
          c.frecuencia_dias > 0 &&
          c.ventas_count >= 2,
      )
      .map((c) => {
        const ratio = (c.dias_sin_compra ?? 0) / (c.frecuencia_dias ?? 1)
        // Score: cuanto más cerca de o pasado del cycle, más probable
        // Si ratio > 1.5, probablemente ya se "perdió" — bajar score
        let score: number
        if (ratio > 1.5) score = Math.max(0, 1.5 - (ratio - 1.5) * 0.5) * 50
        else if (ratio > 0.8) score = 80 + (1 - Math.abs(ratio - 1)) * 20
        else score = ratio * 80
        // Estimado: ticket promedio
        const estimado = c.ticket_promedio
        return {
          ...c,
          score,
          estimado,
          ratio,
        }
      })
      .filter((c) => c.score > 30)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
  }, [clientes])

  const probabilidadTotal = probableRecompra.reduce(
    (s, c) => s + (c.estimado * c.score) / 100,
    0,
  )

  const proxMes = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const proxMesLabel = monthLong.format(proxMes)

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-sm">
            <Brain className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Estimado de ingresos
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Basado en historial, recurrencia y patrones de recompra
            </p>
          </div>
        </div>
        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-700">
          predictivo
        </span>
      </header>

      {/* KPIs forecast */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ForecastCard
          icon={<Target className="size-4" />}
          label={`Estimado ${proxMesLabel.split(" ")[0]}`}
          value={mxn.format(insights.estimadoMesProx)}
          sub="Próximo mes"
          accent="text-pink-700"
          gradient="from-pink-50 via-white to-rose-50/50"
          ring="ring-pink-100"
          badge={
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                insights.tendenciaPct >= 0
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-rose-100 text-rose-700"
              }`}
            >
              {insights.tendenciaPct >= 0 ? "↗" : "↘"}{" "}
              {Math.abs(insights.tendenciaPct).toFixed(0)}%
            </span>
          }
        />
        <ForecastCard
          icon={<Calendar className="size-4" />}
          label="Proyección trimestral"
          value={mxn.format(insights.estimadoTrim)}
          sub="Próximos 3 meses"
          accent="text-violet-700"
          gradient="from-violet-50 via-white to-purple-50/50"
          ring="ring-violet-100"
        />
        <ForecastCard
          icon={<TrendingUp className="size-4" />}
          label="Promedio últimos 3 meses"
          value={mxn.format(insights.promMes3)}
          sub={`vs ${mxn.format(insights.promMes6)} (6m)`}
          accent="text-emerald-700"
          gradient="from-emerald-50 via-white to-teal-50/50"
          ring="ring-emerald-100"
        />
        <ForecastCard
          icon={<Zap className="size-4" />}
          label="Recompra probable"
          value={mxn.format(probabilidadTotal)}
          sub={`${probableRecompra.length} clientes en cycle`}
          accent="text-amber-700"
          gradient="from-amber-50 via-white to-orange-50/50"
          ring="ring-amber-100"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Bar chart histórico + estimado proyectado */}
        <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <header className="mb-3 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">
                Histórico vs Proyección
              </h4>
              <p className="mt-0.5 text-[11px] text-gray-500">
                12 meses + 3 proyectados (rosa = real, violeta = estimado)
              </p>
            </div>
          </header>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={dataGrafica}
              margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="gradReal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f9a8d4" stopOpacity={1} />
                  <stop offset="100%" stopColor="#fbcfe8" stopOpacity={0.6} />
                </linearGradient>
                <linearGradient id="gradEst" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c4b5fd" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#ddd6fe" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#f0f0f0"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatYAxis}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                iconType="circle"
                formatter={(value) =>
                  value === "real"
                    ? "Ventas reales"
                    : value === "estimado"
                      ? "Proyección"
                      : value === "ganancia"
                        ? "Ganancia neta"
                        : value
                }
              />
              <Bar
                dataKey="real"
                name="real"
                fill="url(#gradReal)"
                radius={[6, 6, 0, 0]}
                animationDuration={800}
              />
              <Bar
                dataKey="estimado"
                name="estimado"
                fill="url(#gradEst)"
                radius={[6, 6, 0, 0]}
                animationDuration={1000}
              />
              <Line
                dataKey="ganancia"
                name="ganancia"
                stroke="#0d9488"
                strokeWidth={2}
                dot={{ r: 4, fill: "#0d9488", strokeWidth: 2, stroke: "#fff" }}
                connectNulls
                animationDuration={1200}
              />
            </ComposedChart>
          </ResponsiveContainer>
          {/* Leyenda + nota */}
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-gray-50 pt-4 text-[10.5px] text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-pink-300" />
              Ventas reales históricas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-violet-300" />
              Proyección (prom. últ. 3 meses +2%/mes)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-teal-500" />
              Ganancia neta
            </span>
            <span className="ml-auto italic">
              Proyección automática · No garantiza resultados futuros
            </span>
          </div>
        </article>

        {/* Lista de clientes probable recompra */}
        <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <header className="mb-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-amber-600" />
              <h4 className="text-sm font-semibold text-gray-900">
                Probable recompra
              </h4>
            </div>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Clientes en su ciclo de recompra
            </p>
          </header>
          {probableRecompra.length === 0 ? (
            <p className="py-6 text-center text-xs italic text-gray-400">
              Aún sin patrones suficientes.
            </p>
          ) : (
            <ul className="space-y-2">
              {probableRecompra.map((c) => {
                const tone =
                  c.score >= 80
                    ? "bg-emerald-100 text-emerald-700"
                    : c.score >= 60
                      ? "bg-amber-100 text-amber-700"
                      : "bg-gray-100 text-gray-600"
                return (
                  <li
                    key={c.id}
                    className="rounded-lg border border-gray-100 bg-gradient-to-r from-white to-gray-50/40 p-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-gray-900">
                          {c.nombre_negocio ?? c.nombre}
                        </div>
                        <div className="mt-0.5 text-[10px] text-gray-500">
                          {c.dias_sin_compra}d de{" "}
                          {Math.round(c.frecuencia_dias ?? 0)}d cycle
                        </div>
                      </div>
                      <div className="ml-2 text-right">
                        <span
                          className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tone}`}
                        >
                          {c.score.toFixed(0)}%
                        </span>
                        <div className="mt-0.5 text-[10px] tabular-nums text-pink-700">
                          {mxn2.format(c.estimado)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${
                          c.score >= 80
                            ? "bg-emerald-500"
                            : c.score >= 60
                              ? "bg-amber-500"
                              : "bg-gray-400"
                        }`}
                        style={{ width: `${Math.min(100, c.score)}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </article>
      </div>
    </section>
  )
}

function ForecastCard({
  icon,
  label,
  value,
  sub,
  accent,
  gradient,
  ring,
  badge,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  accent: string
  gradient: string
  ring: string
  badge?: React.ReactNode
}) {
  return (
    <article
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-4 ring-1 ${ring} shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      <header className="flex items-center justify-between">
        <div className={`flex items-center gap-1.5 ${accent}`}>
          {icon}
          <span className="text-[10.5px] font-semibold uppercase tracking-wider">
            {label}
          </span>
        </div>
        {badge}
      </header>
      <div className={`mt-2 text-lg font-bold tabular-nums ${accent}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10.5px] text-gray-600">{sub}</div>}
    </article>
  )
}
