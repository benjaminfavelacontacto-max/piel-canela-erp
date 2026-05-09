"use client"

import { useMemo } from "react"
import {
  AlertTriangle,
  Brain,
  Calendar,
  ChevronRight,
  Crown,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type {
  EnrichedCliente,
  VentaSummaryRow,
} from "./clientes-dashboard"
import {
  EmpiricalCDFModel,
  MES_ABBR,
  calcularGlobalFrecuencia,
  type ConfidenceLevel,
  type PrediccionResult,
} from "./lib-prediccion"

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
const fechaCorta = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "2-digit",
})

const CONFIANZA_CONF: Record<
  ConfidenceLevel,
  { label: string; bg: string; text: string }
> = {
  alta: { label: "Alta", bg: "bg-emerald-100", text: "text-emerald-700" },
  media: { label: "Media", bg: "bg-amber-100", text: "text-amber-700" },
  baja: { label: "Baja", bg: "bg-orange-100", text: "text-orange-700" },
  insuficiente: {
    label: "Insuf.",
    bg: "bg-gray-100",
    text: "text-gray-500",
  },
}

type EnrichedConPred = EnrichedCliente & { pred: PrediccionResult }

export function PrediccionCompras({
  clientes,
  ventas,
  onClienteClick,
}: {
  clientes: EnrichedCliente[]
  ventas: VentaSummaryRow[]
  onClienteClick?: (cliente: EnrichedCliente) => void
}) {
  const today = useMemo(() => new Date(), [])

  // ─── Predicciones por cliente ─────────────────────────────────────
  const predicciones: EnrichedConPred[] = useMemo(() => {
    const globalFreq = calcularGlobalFrecuencia(clientes)
    const model = new EmpiricalCDFModel(globalFreq)
    return clientes.map((c) => ({
      ...c,
      pred: model.predict(c, ventas, today),
    }))
  }, [clientes, ventas, today])

  // ─── KPIs ──────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const conPred = predicciones.filter(
      (c) => c.pred.metodo !== "insufficient",
    )
    const ingreso30 = conPred.reduce(
      (s, c) => s + c.ticket_promedio * c.pred.probabilidadProx30,
      0,
    )
    const ingreso60 = conPred.reduce(
      (s, c) => s + c.pred.ingresoEstimadoProx,
      0,
    )
    const ingreso90 = conPred.reduce(
      (s, c) => s + c.ticket_promedio * c.pred.probabilidadProx90,
      0,
    )
    const altaProb = conPred.filter(
      (c) => c.pred.probabilidadProx60 >= 0.6,
    ).length
    const enRiesgo = conPred.filter(
      (c) => c.pred.riesgoAbandono >= 0.6,
    ).length
    const valorFuturoTotal = conPred.reduce(
      (s, c) => s + c.pred.valorFuturo12m,
      0,
    )
    const mejorPredicho = [...conPred]
      .sort((a, b) => b.pred.valorFuturo12m - a.pred.valorFuturo12m)[0]

    return {
      ingreso30,
      ingreso60,
      ingreso90,
      altaProb,
      enRiesgo,
      valorFuturoTotal,
      mejorPredicho,
      sinDatos: predicciones.length - conPred.length,
    }
  }, [predicciones])

  // ─── Próximas compras esperadas (top 12 por prob × ticket) ────────
  const proximasCompras = useMemo(() => {
    return [...predicciones]
      .filter((c) => c.pred.metodo !== "insufficient")
      .map((c) => ({
        ...c,
        score:
          c.pred.probabilidadProx60 * 0.6 +
          (c.pred.ingresoEstimadoProx / Math.max(1, c.ticket_promedio)) * 0.4,
      }))
      .sort((a, b) => {
        // Priority: probability × estimated revenue, but favor high prob
        const aSc = a.pred.probabilidadProx60 * a.pred.ingresoEstimadoProx
        const bSc = b.pred.probabilidadProx60 * b.pred.ingresoEstimadoProx
        return bSc - aSc
      })
      .slice(0, 12)
  }, [predicciones])

  // ─── Clientes en riesgo de abandono ───────────────────────────────
  const enRiesgo = useMemo(() => {
    return [...predicciones]
      .filter((c) => c.pred.riesgoAbandono >= 0.5 && c.ventas_count > 0)
      .sort((a, b) => b.pred.riesgoAbandono - a.pred.riesgoAbandono)
      .slice(0, 6)
  }, [predicciones])

  // ─── Timeline 6 meses futuros: ingreso esperado por mes ───────────
  const timeline6m = useMemo(() => {
    const meses: {
      label: string
      monthIdx: number
      total: number
      contribuciones: { cliente: string; monto: number; prob: number }[]
    }[] = []
    for (let m = 0; m < 6; m++) {
      const d = new Date(today.getFullYear(), today.getMonth() + m, 1)
      meses.push({
        label: `${MES_ABBR[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        monthIdx: m,
        total: 0,
        contribuciones: [],
      })
    }
    for (const c of predicciones) {
      if (c.pred.metodo === "insufficient") continue
      for (let m = 0; m < 6; m++) {
        const p = c.pred.probMesesFuturos[m] ?? 0
        if (p < 0.05) continue
        const monto = c.ticket_promedio * p
        meses[m].total += monto
        if (p >= 0.3) {
          meses[m].contribuciones.push({
            cliente: c.nombre_negocio ?? c.nombre,
            monto,
            prob: p,
          })
        }
      }
    }
    return meses.map((m) => ({
      ...m,
      contribuciones: m.contribuciones
        .sort((a, b) => b.monto - a.monto)
        .slice(0, 3),
    }))
  }, [predicciones, today])

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 via-pink-500 to-amber-500 text-white shadow-sm">
            <Brain className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Predicción de compras
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Modelos por cliente: CDF empírica · Bell curve · seasonality boost
            </p>
          </div>
        </div>
        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">
          AI-ready
        </span>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PredKpi
          icon={<Target className="size-4" />}
          label="Ingreso esperado · 60d"
          value={mxn.format(kpis.ingreso60)}
          sub={`30d ${mxn.format(kpis.ingreso30)} · 90d ${mxn.format(kpis.ingreso90)}`}
          accent="text-pink-700"
          gradient="from-pink-50 via-white to-rose-50/50"
          ring="ring-pink-100"
        />
        <PredKpi
          icon={<Zap className="size-4" />}
          label="Alta probabilidad recompra"
          value={`${kpis.altaProb}`}
          sub="P(60d) ≥ 60%"
          accent="text-emerald-700"
          gradient="from-emerald-50 via-white to-teal-50/50"
          ring="ring-emerald-100"
        />
        <PredKpi
          icon={<AlertTriangle className="size-4" />}
          label="En riesgo de abandono"
          value={`${kpis.enRiesgo}`}
          sub="Riesgo ≥ 60%"
          accent="text-rose-700"
          gradient="from-rose-50 via-white to-pink-50/50"
          ring="ring-rose-100"
        />
        <PredKpi
          icon={<Crown className="size-4" />}
          label="Valor futuro 12m total"
          value={mxn.format(kpis.valorFuturoTotal)}
          sub={
            kpis.mejorPredicho
              ? `Top: ${(kpis.mejorPredicho.nombre_negocio ?? kpis.mejorPredicho.nombre).slice(0, 22)}`
              : ""
          }
          accent="text-amber-700"
          gradient="from-amber-50 via-white to-orange-50/50"
          ring="ring-amber-100"
        />
      </div>

      {/* Timeline 6 meses */}
      <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
              <Calendar className="size-4 text-violet-600" />
              Timeline predictivo · próximos 6 meses
            </h4>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Ingreso esperado por mes = Σ (ticket × P de cada cliente para ese mes)
            </p>
          </div>
        </header>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={timeline6m}
            margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="#f0f0f0" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
              }
              width={50}
            />
            <Tooltip
              cursor={{ fill: "#ede9fe", opacity: 0.4 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const data = payload[0].payload as (typeof timeline6m)[number]
                return (
                  <div className="min-w-[220px] rounded-xl border border-gray-100 bg-white p-3 shadow-xl">
                    <p className="mb-2 border-b border-gray-100 pb-1.5 font-semibold text-gray-800">
                      {data.label}
                    </p>
                    <div className="mb-2 flex justify-between text-xs">
                      <span className="text-gray-600">Ingreso esperado</span>
                      <span className="font-bold text-violet-700 tabular-nums">
                        {mxn2.format(data.total)}
                      </span>
                    </div>
                    {data.contribuciones.length > 0 && (
                      <>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Top probable
                        </div>
                        {data.contribuciones.map((c, i) => (
                          <div
                            key={i}
                            className="mt-0.5 flex justify-between text-[11px]"
                          >
                            <span className="truncate text-gray-700">
                              {c.cliente.slice(0, 26)}
                            </span>
                            <span className="ml-2 tabular-nums text-pink-700">
                              {(c.prob * 100).toFixed(0)}%
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )
              }}
            />
            <Bar dataKey="total" radius={[6, 6, 0, 0]}>
              {timeline6m.map((m, i) => (
                <Cell
                  key={i}
                  fill={
                    m.total > 0
                      ? `rgba(167, 139, 250, ${0.4 + Math.min(0.6, m.total / Math.max(1, ...timeline6m.map((x) => x.total)) * 0.6)})`
                      : "#f3f4f6"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </article>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Tabla próximas compras */}
        <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <header className="mb-3">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
              <Sparkles className="size-4 text-pink-600" />
              Próximas compras esperadas
            </h4>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Top 12 ordenado por (probabilidad × ticket esperado)
            </p>
          </header>
          {proximasCompras.length === 0 ? (
            <p className="py-8 text-center text-xs italic text-gray-400">
              Sin patrones suficientes para predecir.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <Th align="left">Cliente</Th>
                    <Th>Próx. fecha</Th>
                    <Th>Ventana</Th>
                    <Th align="right">P(60d)</Th>
                    <Th align="right">Ticket esp.</Th>
                    <Th>Confianza</Th>
                    <Th align="right" />
                  </tr>
                </thead>
                <tbody>
                  {proximasCompras.map((c) => {
                    const conf = CONFIANZA_CONF[c.pred.confianza]
                    const probColor =
                      c.pred.probabilidadProx60 >= 0.7
                        ? "text-emerald-700 bg-emerald-50"
                        : c.pred.probabilidadProx60 >= 0.4
                          ? "text-amber-700 bg-amber-50"
                          : "text-gray-600 bg-gray-50"
                    const ventanaLabel =
                      c.pred.ventanaInicio && c.pred.ventanaFin
                        ? `${fechaCorta.format(c.pred.ventanaInicio)} – ${fechaCorta.format(c.pred.ventanaFin)}`
                        : "—"
                    return (
                      <tr
                        key={c.id}
                        onClick={() => onClienteClick?.(c)}
                        className={`border-b border-gray-50 transition-colors ${onClienteClick ? "cursor-pointer hover:bg-pink-50/40" : ""}`}
                      >
                        <td className="py-2 pr-2 font-semibold text-gray-900">
                          <div className="truncate max-w-[200px]">
                            {c.nombre_negocio ?? c.nombre}
                          </div>
                          <div className="text-[10px] font-normal text-gray-500">
                            {c.ventas_count} compras · cada{" "}
                            {c.frecuencia_dias
                              ? `${Math.round(c.frecuencia_dias)}d`
                              : "—"}
                          </div>
                        </td>
                        <td className="py-2 text-center text-gray-700 tabular-nums">
                          {c.pred.fechaProxima
                            ? fechaCorta.format(c.pred.fechaProxima)
                            : "—"}
                        </td>
                        <td className="py-2 text-center text-[10px] text-gray-500 tabular-nums">
                          {ventanaLabel}
                        </td>
                        <td className="py-2 text-right">
                          <span
                            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${probColor}`}
                          >
                            {(c.pred.probabilidadProx60 * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="py-2 text-right font-semibold text-pink-700 tabular-nums">
                          {mxn.format(c.pred.ingresoEstimadoProx)}
                        </td>
                        <td className="py-2 text-center">
                          <span
                            className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium ${conf.bg} ${conf.text}`}
                          >
                            {conf.label}
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          {onClienteClick && (
                            <ChevronRight className="ml-auto size-3 text-gray-400" />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>

        {/* Clientes en riesgo */}
        <article className="rounded-2xl border border-rose-200/60 bg-gradient-to-br from-rose-50/40 to-white p-5 shadow-sm">
          <header className="mb-3">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold text-rose-700">
              <TrendingDown className="size-4" />
              En riesgo de abandono
            </h4>
            <p className="mt-0.5 text-[11px] text-rose-600/80">
              Días sin compra &gt; frecuencia normal
            </p>
          </header>
          {enRiesgo.length === 0 ? (
            <p className="py-6 text-center text-xs italic text-gray-400">
              Ningún cliente en zona de riesgo. 🎉
            </p>
          ) : (
            <ul className="space-y-2">
              {enRiesgo.map((c) => {
                const tone =
                  c.pred.riesgoAbandono >= 0.85
                    ? "from-rose-100 to-rose-50 ring-rose-300/60"
                    : "from-amber-50 to-rose-50/50 ring-amber-200/60"
                return (
                  <li
                    key={c.id}
                    onClick={() => onClienteClick?.(c)}
                    className={`cursor-pointer rounded-lg bg-gradient-to-r ${tone} p-2 ring-1 transition hover:scale-[1.01] hover:shadow-sm`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-gray-900">
                          {c.nombre_negocio ?? c.nombre}
                        </div>
                        <div className="mt-0.5 text-[10px] text-gray-600">
                          Hace {c.dias_sin_compra}d · cycle{" "}
                          {c.frecuencia_dias
                            ? Math.round(c.frecuencia_dias)
                            : "—"}
                          d
                        </div>
                      </div>
                      <span className="ml-2 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {(c.pred.riesgoAbandono * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/70">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-rose-500"
                        style={{
                          width: `${Math.min(100, c.pred.riesgoAbandono * 100)}%`,
                        }}
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

function PredKpi({
  icon,
  label,
  value,
  sub,
  accent,
  gradient,
  ring,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  accent: string
  gradient: string
  ring: string
}) {
  return (
    <article
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-4 ring-1 ${ring} shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      <header className={`flex items-center gap-1.5 ${accent}`}>
        {icon}
        <span className="text-[10.5px] font-semibold uppercase tracking-wider">
          {label}
        </span>
      </header>
      <div className={`mt-2 text-lg font-bold tabular-nums ${accent}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10.5px] text-gray-600">{sub}</div>}
    </article>
  )
}

function Th({
  children,
  align = "center",
}: {
  children?: React.ReactNode
  align?: "left" | "right" | "center"
}) {
  return (
    <th
      className="px-2 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  )
}

// Suprimir warning de TrendingUp unused (lo dejamos por si lo añadimos después)
void TrendingUp
