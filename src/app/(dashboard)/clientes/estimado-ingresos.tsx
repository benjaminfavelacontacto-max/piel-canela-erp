"use client"

import { useMemo } from "react"
import {
  Brain,
  Calendar,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
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

  // ─── Índices estacionales reales por mes-del-año (1..12) ─────────
  // Si no hay datos históricos de un mes, fallback:
  //   Jun-Ago = 1.4 (verano = bronceado)
  //   Dic-Ene = 1.2 (fin de año)
  //   Resto   = 0.9 (temporada normal)
  const indiceEstacional = useMemo(() => {
    const porMes: Record<number, { total: number; count: number }> = {}
    for (const m of historico) {
      const moy = parseInt(m.mes.slice(5, 7), 10)
      porMes[moy] = porMes[moy] ?? { total: 0, count: 0 }
      porMes[moy].total += m.real
      porMes[moy].count += 1
    }
    const totalSum = historico.reduce((s, m) => s + m.real, 0)
    const promedioGlobal =
      historico.length > 0 ? totalSum / historico.length : 0

    const idx: Record<number, number> = {}
    for (let m = 1; m <= 12; m++) {
      if (porMes[m] && promedioGlobal > 0) {
        const avgMes = porMes[m].total / porMes[m].count
        idx[m] = avgMes / promedioGlobal
      } else {
        // Defaults conservadores si no hay datos
        idx[m] = m >= 6 && m <= 8 ? 1.4 : m === 12 || m === 1 ? 1.2 : 0.9
      }
    }
    return idx
  }, [historico])

  // ─── Promedios mensuales históricos por mes-del-año (para insights) ─
  const promedioPorMes = useMemo(() => {
    const porMes: Record<number, { total: number; count: number }> = {}
    for (const m of historico) {
      const moy = parseInt(m.mes.slice(5, 7), 10)
      porMes[moy] = porMes[moy] ?? { total: 0, count: 0 }
      porMes[moy].total += m.real
      porMes[moy].count += 1
    }
    const out: Record<number, number> = {}
    for (let m = 1; m <= 12; m++) {
      out[m] = porMes[m] ? porMes[m].total / porMes[m].count : 0
    }
    return out
  }, [historico])

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

  // ─── Proyección 6 meses futuros con índice estacional ────────────
  // estimado = promBase × indiceEstacional[mes] × factorConfianza(i)
  // factorConfianza: 0.95 (mes 1) → 0.70 (mes 6+) — más incertidumbre futuro
  const proyecciones = useMemo(() => {
    if (historico.length === 0) return []
    const ultimoMes = historico[historico.length - 1].mes
    const promBase = insights.promMes3 // promedio últimos 3 meses (real)
    const promGanBase = insights.promGanancia3
    return [1, 2, 3, 4, 5, 6].map((i) => {
      const fecha = new Date(`${ultimoMes}-01T00:00:00`)
      fecha.setMonth(fecha.getMonth() + i)
      const monthOfYear = fecha.getMonth() + 1
      const mesStr = fecha.toISOString().slice(0, 7)
      const factorEstacional = indiceEstacional[monthOfYear] ?? 1
      const factorConfianza = Math.max(0.7, 1 - i * 0.05)
      return {
        mes: mesStr,
        estimado: Math.round(promBase * factorEstacional * factorConfianza),
        ganancia: Math.round(promGanBase * factorEstacional * factorConfianza),
        factorEstacional,
        esTemporadaAlta: factorEstacional > 1.2,
        monthOfYear,
      }
    })
  }, [historico, insights, indiceEstacional])

  // ─── Insights estacionales para banners y KPIs ──────────────────
  const seasonalInsights = useMemo(() => {
    const proxFecha = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const proxMonthOfYear = proxFecha.getMonth() + 1
    const factorProx = indiceEstacional[proxMonthOfYear] ?? 1
    const proxNombre = proxFecha.toLocaleDateString("es-MX", { month: "long" })
    const proxNombreCap =
      proxNombre.charAt(0).toUpperCase() + proxNombre.slice(1)

    // Detectar próxima temporada alta dentro de los próximos 3 meses
    let proxTempAlta: { mesNombre: string; factor: number; offset: number } | null = null
    for (let i = 1; i <= 3; i++) {
      const f = new Date(today.getFullYear(), today.getMonth() + i, 1)
      const moy = f.getMonth() + 1
      const factor = indiceEstacional[moy] ?? 1
      if (factor > 1.2) {
        proxTempAlta = {
          mesNombre: f.toLocaleDateString("es-MX", { month: "long" }),
          factor,
          offset: i,
        }
        break
      }
    }

    // Junio histórico (verano top)
    const junioPromedio = Math.round(promedioPorMes[6] ?? 0)

    return {
      proxNombre: proxNombreCap,
      factorProx,
      proximaTemporadaAlta: factorProx > 1.2,
      proxTempAlta,
      junioPromedio,
    }
  }, [today, indiceEstacional, promedioPorMes])

  // ─── Combinar histórico + proyección para Recharts ──────────────
  // Splitting en 4 series mutuamente exclusivas para que el Legend pueda
  // tomar colores explícitos (no se ven negros).
  const dataGrafica = useMemo(() => {
    return [
      ...historico.map((m) => {
        const moy = parseInt(m.mes.slice(5, 7), 10)
        const esAlta = (indiceEstacional[moy] ?? 1) > 1.2
        return {
          mes: m.mes,
          label: esAlta ? `${formatMesLabel(m.mes)} 🌞` : formatMesLabel(m.mes),
          real: esAlta ? null : m.real,
          realAlta: esAlta ? m.real : null,
          estimado: null as number | null,
          estimadoAlta: null as number | null,
          ganancia: m.ganancia,
          esProyeccion: false,
          esTemporadaAlta: esAlta,
        }
      }),
      ...proyecciones.map((p) => ({
        mes: p.mes,
        label: p.esTemporadaAlta
          ? `${formatMesLabel(p.mes)} 🌞 (est.)`
          : `${formatMesLabel(p.mes)} (est.)`,
        real: null as number | null,
        realAlta: null as number | null,
        estimado: p.esTemporadaAlta ? null : p.estimado,
        estimadoAlta: p.esTemporadaAlta ? p.estimado : null,
        ganancia: p.ganancia,
        esProyeccion: true,
        esTemporadaAlta: p.esTemporadaAlta,
      })),
    ]
  }, [historico, proyecciones, indiceEstacional])

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
    <section
      className="relative overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.05)] p-5"
      style={{
        background:
          "radial-gradient(ellipse at top right, rgba(139,92,246,0.04), transparent 50%), radial-gradient(ellipse at bottom left, rgba(15,118,110,0.03), transparent 50%), white",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.03), 0 8px 24px rgba(15,23,42,0.02)",
      }}
    >
      {/* Glow violet sutil top-right */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full opacity-40"
        style={{
          background:
            "radial-gradient(circle, rgba(139,92,246,0.08), transparent 70%)",
          filter: "blur(40px)",
        }}
        aria-hidden
      />

      <div className="relative space-y-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
              style={{
                background:
                  "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
                boxShadow:
                  "0 1px 2px rgba(139,92,246,0.2), 0 4px 12px rgba(139,92,246,0.15)",
              }}
            >
              <Brain className="size-4" strokeWidth={1.75} />
            </span>
            <div>
              <h3
                className="text-[15px] font-semibold tracking-[-0.02em] text-[#0F172A]"
              >
                AI Revenue Intelligence
              </h3>
              <p className="mt-0.5 text-[11px] text-[#64748B]">
                Predicciones basadas en recurrencia y patrones de recompra
              </p>
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-violet-50/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700 ring-1 ring-violet-200/40 backdrop-blur-sm"
          >
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-violet-400 opacity-75" />
              <span className="relative size-1.5 rounded-full bg-violet-500" />
            </span>
            Predictivo
          </span>
        </header>

        {/* Hero alert: temporada alta detectada */}
        {seasonalInsights.proxTempAlta && (
          <div
            className="relative flex items-start gap-4 overflow-hidden rounded-xl border border-amber-200/40 p-4"
            style={{
              background:
                "linear-gradient(135deg, rgba(254,243,199,0.6) 0%, rgba(254,215,170,0.3) 50%, rgba(255,255,255,0.5) 100%)",
              boxShadow: "0 4px 12px rgba(245,158,11,0.06)",
            }}
          >
            <div
              className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full opacity-60"
              style={{
                background:
                  "radial-gradient(circle, rgba(245,158,11,0.10), transparent 70%)",
                filter: "blur(20px)",
              }}
              aria-hidden
            />
            <span
              className="relative flex size-11 shrink-0 items-center justify-center rounded-xl text-white"
              style={{
                background:
                  "linear-gradient(135deg, #F59E0B 0%, #EA580C 100%)",
                boxShadow:
                  "0 1px 2px rgba(245,158,11,0.25), 0 6px 20px rgba(245,158,11,0.20)",
              }}
            >
              {/* Pulse ring sutil */}
              <span
                aria-hidden
                className="absolute inset-0 animate-ping rounded-xl bg-amber-400/40"
                style={{ animationDuration: "2.4s" }}
              />
              <Sun className="relative size-5" strokeWidth={1.75} />
            </span>
            <div className="relative flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[15px] font-semibold tracking-[-0.015em] text-[#78350F]">
                  {seasonalInsights.proxTempAlta.mesNombre.charAt(0).toUpperCase() +
                    seasonalInsights.proxTempAlta.mesNombre.slice(1)}{" "}
                  es temporada alta
                </p>
                {/* Heat intensity indicator */}
                <span
                  className="inline-flex items-center gap-0.5 rounded-full bg-white/60 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.1em] text-amber-700 ring-1 ring-amber-200/50 backdrop-blur-sm"
                  title={`Intensidad: ×${seasonalInsights.proxTempAlta.factor.toFixed(2)}`}
                >
                  {(() => {
                    const f = seasonalInsights.proxTempAlta.factor
                    const bars = Math.min(5, Math.max(1, Math.round((f - 1) * 5)))
                    return Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        aria-hidden
                        className="block h-2 w-[3px] rounded-sm"
                        style={{
                          background:
                            i < bars
                              ? `linear-gradient(180deg, #F59E0B, #EA580C)`
                              : "rgba(245,158,11,0.18)",
                        }}
                      />
                    ))
                  })()}
                  <span className="ml-1">Heat</span>
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-amber-800/80">
                Históricamente{" "}
                <span className="font-semibold tabular-nums text-amber-900">
                  +
                  {Math.round(
                    (seasonalInsights.proxTempAlta.factor - 1) * 100,
                  )}
                  %
                </span>{" "}
                sobre el promedio · prepara stock e inventario
              </p>
            </div>
            {seasonalInsights.junioPromedio > 0 && (
              <div
                className="relative shrink-0 rounded-lg border border-amber-200/50 bg-white/60 px-3 py-2 backdrop-blur-sm"
              >
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-700/80">
                  Promedio histórico
                </p>
                <p
                  className="mt-0.5 text-base font-bold tabular-nums tracking-[-0.025em] text-amber-900"
                  style={{ fontFeatureSettings: '"tnum" 1' }}
                >
                  {mxn.format(seasonalInsights.junioPromedio)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* AI tiles compactos — sin cards visibles */}
        <div
          className="grid grid-cols-2 overflow-hidden rounded-xl border border-[rgba(15,23,42,0.05)] bg-white/60 backdrop-blur-sm lg:grid-cols-4"
        >
          <AiTile
            icon={<Target className="size-3.5" strokeWidth={1.75} />}
            label={`Estimado ${seasonalInsights.proxNombre}`}
            value={mxn.format(
              proyecciones[0]?.estimado ?? insights.estimadoMesProx,
            )}
            sub={
              seasonalInsights.proximaTemporadaAlta
                ? `Temporada alta · ×${seasonalInsights.factorProx.toFixed(2)}`
                : `Factor ×${seasonalInsights.factorProx.toFixed(2)}`
            }
            tone={seasonalInsights.proximaTemporadaAlta ? "amber" : "emerald"}
            trend={insights.tendenciaPct}
          />
          <AiTile
            icon={<Calendar className="size-3.5" strokeWidth={1.75} />}
            label="Proyección Q3"
            value={mxn.format(insights.estimadoTrim)}
            sub="Próximos 3 meses"
            tone="violet"
          />
          <AiTile
            icon={<TrendingUp className="size-3.5" strokeWidth={1.75} />}
            label="Promedio 3m"
            value={mxn.format(insights.promMes3)}
            sub={`vs ${mxn.format(insights.promMes6)} (6m)`}
            tone="emerald"
          />
          <AiTile
            icon={<Zap className="size-3.5" strokeWidth={1.75} />}
            label="Recompra probable"
            value={mxn.format(probabilidadTotal)}
            sub={`${probableRecompra.length} clientes en cycle`}
            tone="amber"
          />
        </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Bar chart histórico + estimado proyectado */}
        <article className="rounded-xl border border-[rgba(15,23,42,0.05)] bg-white/80 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] backdrop-blur-sm lg:col-span-2">
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
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart
              data={dataGrafica}
              margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="gradHistReal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#94A3B8" stopOpacity={1} />
                  <stop offset="100%" stopColor="#CBD5E1" stopOpacity={0.7} />
                </linearGradient>
                <linearGradient id="gradHistAlta" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FDE68A" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#FEF3C7" stopOpacity={0.6} />
                </linearGradient>
                <linearGradient id="gradProy" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.85} />
                  <stop offset="100%" stopColor="#C4B5FD" stopOpacity={0.55} />
                </linearGradient>
                <linearGradient id="gradProyAlta" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.65} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(148,163,184,0.12)"
                vertical={false}
              />
              {/* Forecast zone — área shaded violet sobre los meses proyectados */}
              {dataGrafica.length > historico.length && (
                <ReferenceArea
                  x1={dataGrafica[historico.length]?.label}
                  x2={dataGrafica[dataGrafica.length - 1]?.label}
                  fill="#8B5CF6"
                  fillOpacity={0.04}
                  stroke="none"
                  ifOverflow="extendDomain"
                />
              )}
              {/* Línea vertical "Hoy" entre histórico y proyección */}
              {historico.length > 0 && proyecciones.length > 0 && (
                <ReferenceLine
                  x={dataGrafica[historico.length - 1]?.label}
                  stroke="#8B5CF6"
                  strokeOpacity={0.35}
                  strokeDasharray="2 4"
                  label={{
                    value: "Hoy",
                    position: "insideTopRight",
                    fill: "#8B5CF6",
                    fontSize: 9,
                    offset: 6,
                  }}
                />
              )}
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatYAxis}
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend content={<HistVsProyLegend />} />
              <Bar
                dataKey="real"
                name="Ventas reales"
                fill="url(#gradHistReal)"
                stroke="#94A3B8"
                radius={[6, 6, 0, 0]}
                animationDuration={800}
                legendType="square"
              />
              <Bar
                dataKey="realAlta"
                name="Temp. alta histórica"
                fill="url(#gradHistAlta)"
                stroke="#FDE68A"
                radius={[6, 6, 0, 0]}
                animationDuration={800}
                legendType="square"
              />
              <Bar
                dataKey="estimado"
                name="Proyección"
                fill="url(#gradProy)"
                stroke="#8B5CF6"
                strokeOpacity={0.4}
                strokeDasharray="3 3"
                radius={[6, 6, 0, 0]}
                animationDuration={1000}
                legendType="square"
              />
              <Bar
                dataKey="estimadoAlta"
                name="Proyección temp. alta"
                fill="url(#gradProyAlta)"
                stroke="#7C3AED"
                strokeOpacity={0.6}
                strokeDasharray="3 3"
                radius={[6, 6, 0, 0]}
                animationDuration={1000}
                legendType="square"
              />
              <Line
                dataKey="ganancia"
                name="Ganancia neta"
                stroke="#0F766E"
                strokeWidth={2.5}
                dot={{ r: 5, fill: "#0F766E", stroke: "white", strokeWidth: 2 }}
                activeDot={{ r: 7, fill: "#0F766E" }}
                connectNulls
                animationDuration={1200}
                legendType="circle"
              />
            </ComposedChart>
          </ResponsiveContainer>
          {/* Nota explicativa de la fórmula (la leyenda visual va dentro del chart) */}
          <p className="mt-3 border-t border-gray-50 pt-3 text-[10.5px] italic text-gray-400">
            estimado = prom. últ. 3 meses × índice estacional × confianza ·
            proyección 6 meses · 🌞 = temporada alta histórica
          </p>
        </article>

        {/* Lista de clientes probable recompra */}
        <article className="rounded-xl border border-[rgba(15,23,42,0.05)] bg-white/80 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] backdrop-blur-sm">
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
                        <div className="mt-0.5 text-[10px] tabular-nums text-[#0F766E]">
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
      </div>
    </section>
  )
}

// Leyenda custom: garantiza colores correctos (Recharts pinta dots negros
// cuando se usa <Cell> con fill por defecto undefined en el Bar padre).
function HistVsProyLegend() {
  const items: Array<{ color: string; label: string; shape: "square" | "circle" }> = [
    { color: "#CBD5E1", label: "Ventas reales", shape: "square" },
    { color: "#FEF3C7", label: "Temp. alta histórica 🌞", shape: "square" },
    { color: "#A78BFA", label: "Proyección", shape: "square" },
    { color: "#7C3AED", label: "Proyección temp. alta 🌞", shape: "square" },
    { color: "#0F766E", label: "Ganancia neta", shape: "circle" },
  ]
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-gray-600">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          {it.shape === "circle" ? (
            <span
              className="inline-block size-3 shrink-0 rounded-full ring-2 ring-white"
              style={{ backgroundColor: it.color }}
            />
          ) : (
            <span
              className="inline-block size-3 shrink-0 rounded-sm"
              style={{ backgroundColor: it.color }}
            />
          )}
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * AI tile compacto — sin card visible, solo icono mono + label + valor + sub.
 * Divisores invisibles entre tiles (inset shadow). Hover sutil.
 */
function AiTile({
  icon,
  label,
  value,
  sub,
  tone = "emerald",
  trend,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tone?: "emerald" | "violet" | "amber" | "rose"
  trend?: number
}) {
  const iconColor =
    tone === "violet"
      ? "text-violet-600"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "rose"
          ? "text-rose-600"
          : "text-[#0F766E]"
  // Glow rgb por tono — para hover halo
  const glowRgb =
    tone === "violet"
      ? "139,92,246"
      : tone === "amber"
        ? "245,158,11"
        : tone === "rose"
          ? "220,38,38"
          : "15,118,110"
  return (
    <div
      className="group relative px-4 py-3 transition-all duration-180 hover:bg-white/55"
      style={{ boxShadow: "inset 1px 0 0 0 rgba(15,23,42,0.04)" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `inset 1px 0 0 0 rgba(15,23,42,0.04), inset 0 -2px 0 0 rgba(${glowRgb},0.4), 0 4px 16px rgba(${glowRgb},0.06)`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "inset 1px 0 0 0 rgba(15,23,42,0.04)"
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className={`${iconColor} transition-transform duration-180 group-hover:scale-110`}>
            {icon}
          </span>
          <p
            className="text-[9.5px] font-semibold uppercase text-[#64748B]/70"
            style={{ letterSpacing: "0.12em" }}
          >
            {label}
          </p>
        </div>
        {trend !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 text-[9.5px] font-semibold tabular-nums ${
              trend >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            <span aria-hidden className="text-[7px]">
              {trend >= 0 ? "▲" : "▼"}
            </span>
            {Math.abs(trend).toFixed(0)}%
          </span>
        )}
      </div>
      <p
        className="mt-1.5 text-[20px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[#0F172A]"
        style={{ fontFeatureSettings: '"tnum" 1, "ss01" 1' }}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-[10.5px] leading-tight text-[#64748B]">{sub}</p>
      )}
    </div>
  )
}
