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
    <section
      className="relative overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.05)] p-5"
      style={{
        background:
          "radial-gradient(ellipse at top right, rgba(139,92,246,0.04), transparent 50%), radial-gradient(ellipse at bottom left, rgba(15,118,110,0.03), transparent 50%), white",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.03), 0 8px 24px rgba(15,23,42,0.02)",
      }}
    >
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
              <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-[#0F172A]">
                AI Pattern Analysis
              </h3>
              <p className="mt-0.5 text-[11px] text-[#64748B]">
                CDF empírica · Bell curve · seasonality boost
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700 ring-1 ring-violet-200/40 backdrop-blur-sm">
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-violet-400 opacity-75" />
              <span className="relative size-1.5 rounded-full bg-violet-500" />
            </span>
            AI-ready
          </span>
        </header>

        {/* AI tiles compactos — superficie única */}
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-[rgba(15,23,42,0.05)] bg-white/60 backdrop-blur-sm lg:grid-cols-4">
          <AiTile
            icon={<Target className="size-3.5" strokeWidth={1.75} />}
            label="Ingreso 60d"
            value={mxn.format(kpis.ingreso60)}
            sub={`30d ${mxn.format(kpis.ingreso30)} · 90d ${mxn.format(kpis.ingreso90)}`}
            tone="emerald"
          />
          <AiTile
            icon={<Zap className="size-3.5" strokeWidth={1.75} />}
            label="Alta probabilidad"
            value={`${kpis.altaProb}`}
            sub="P(60d) ≥ 60%"
            tone="emerald"
          />
          <AiTile
            icon={<AlertTriangle className="size-3.5" strokeWidth={1.75} />}
            label="En riesgo"
            value={`${kpis.enRiesgo}`}
            sub="Riesgo ≥ 60%"
            tone="rose"
          />
          <AiTile
            icon={<Crown className="size-3.5" strokeWidth={1.75} />}
            label="Valor futuro 12m"
            value={mxn.format(kpis.valorFuturoTotal)}
            sub={
              kpis.mejorPredicho
                ? `Top: ${(kpis.mejorPredicho.nombre_negocio ?? kpis.mejorPredicho.nombre).slice(0, 18)}`
                : ""
            }
            tone="amber"
          />
        </div>

      {/* Timeline 6 meses */}
      <article className="rounded-xl border border-[rgba(15,23,42,0.05)] bg-white/80 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] backdrop-blur-sm">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <h4 className="flex items-center gap-1.5 text-sm font-semibold text-[#0F172A]">
              <Calendar className="size-4 text-violet-600" strokeWidth={1.75} />
              Timeline predictivo · próximos 6 meses
            </h4>
            <p className="mt-0.5 text-[11px] text-[#64748B]">
              Ingreso esperado por mes = Σ (ticket × P de cada cliente para ese mes)
            </p>
          </div>
        </header>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={timeline6m}
            margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="#EEF1F4" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#9CA3AF", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#9CA3AF", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
              }
              width={50}
            />
            <Tooltip
              cursor={{ fill: "#F3F5F7", opacity: 0.4 }}
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
                            <span className="ml-2 tabular-nums text-[#0F766E]">
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
        {/* Próximas compras — CRM intelligence list */}
        <article className="rounded-xl border border-[rgba(15,23,42,0.05)] bg-white/80 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] backdrop-blur-sm lg:col-span-2">
          <header className="mb-3 flex items-center justify-between">
            <div>
              <h4 className="flex items-center gap-1.5 text-sm font-semibold text-[#0F172A]">
                <Sparkles className="size-4 text-[#0F766E]" strokeWidth={1.75} />
                Próximas compras esperadas
              </h4>
              <p className="mt-0.5 text-[11px] text-[#64748B]">
                Ordenado por probabilidad × ticket esperado
              </p>
            </div>
            <span className="rounded-full bg-[#F3F5F7] px-2 py-0.5 text-[10px] font-medium text-[#64748B] tabular-nums">
              Top {proximasCompras.length}
            </span>
          </header>
          {proximasCompras.length === 0 ? (
            <p className="py-8 text-center text-xs italic text-[#94A3B8]">
              Sin patrones suficientes para predecir.
            </p>
          ) : (
            <ul className="-mx-2 divide-y divide-[rgba(15,23,42,0.04)]">
              {proximasCompras.map((c) => (
                <ClienteRowCRM
                  key={c.id}
                  cliente={c}
                  onClick={onClienteClick ? () => onClienteClick(c) : undefined}
                />
              ))}
            </ul>
          )}
        </article>

        {/* Clientes en riesgo */}
        <article
          className="relative overflow-hidden rounded-xl border border-rose-200/40 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
          style={{
            background:
              "radial-gradient(ellipse at top right, rgba(220,38,38,0.04), transparent 60%), white",
          }}
        >
          <header className="mb-3">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold text-rose-700">
              <TrendingDown className="size-4" strokeWidth={1.75} />
              En riesgo de abandono
            </h4>
            <p className="mt-0.5 text-[11px] text-rose-600/70">
              Días sin compra &gt; frecuencia normal
            </p>
          </header>
          {enRiesgo.length === 0 ? (
            <p className="py-6 text-center text-xs italic text-[#94A3B8]">
              Ningún cliente en zona de riesgo. 🎉
            </p>
          ) : (
            <ul className="-mx-2 divide-y divide-[rgba(15,23,42,0.04)]">
              {enRiesgo.map((c) => (
                <RiesgoRow
                  key={c.id}
                  cliente={c}
                  onClick={onClienteClick ? () => onClienteClick(c) : undefined}
                />
              ))}
            </ul>
          )}
        </article>
      </div>
      </div>
    </section>
  )
}

/** Iniciales (2) del cliente */
function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  )
}

/** Health dot — color según probabilidad */
function HealthDot({ value }: { value: number }) {
  const color =
    value >= 0.7
      ? "bg-emerald-500"
      : value >= 0.4
        ? "bg-amber-500"
        : "bg-gray-400"
  return (
    <span className="relative flex size-2 shrink-0">
      {value >= 0.7 && (
        <span
          aria-hidden
          className="absolute inset-0 animate-ping rounded-full bg-emerald-400/50"
          style={{ animationDuration: "2.4s" }}
        />
      )}
      <span className={`relative size-2 rounded-full ${color}`} />
    </span>
  )
}

/** Fila CRM intelligence — avatar + nombre + cycle + score + ticket */
function ClienteRowCRM({
  cliente: c,
  onClick,
}: {
  cliente: EnrichedConPred
  onClick?: () => void
}) {
  const conf = CONFIANZA_CONF[c.pred.confianza]
  const prob = c.pred.probabilidadProx60
  const probColor =
    prob >= 0.7
      ? "text-emerald-700"
      : prob >= 0.4
        ? "text-amber-700"
        : "text-[#64748B]"
  const display = c.nombre_negocio ?? c.nombre
  const fecha = c.pred.fechaProxima
    ? fechaCorta.format(c.pred.fechaProxima)
    : "—"
  return (
    <li
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-180 ${onClick ? "cursor-pointer hover:bg-[rgba(15,118,110,0.03)]" : ""}`}
    >
      {/* Avatar + health dot */}
      <div className="relative shrink-0">
        <div
          className="flex size-9 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm ring-2 ring-white"
          style={{
            background:
              "linear-gradient(135deg, #0F766E 0%, #115E59 100%)",
          }}
        >
          {getInitials(display)}
        </div>
        <span className="absolute -right-0.5 -top-0.5">
          <HealthDot value={prob} />
        </span>
      </div>

      {/* Nombre + cycle */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p
            className="truncate text-[13px] font-semibold tracking-[-0.01em] text-[#0F172A]"
            title={display}
          >
            {display}
          </p>
          <span className={`shrink-0 rounded-md px-1 py-0.5 text-[9px] font-bold ${conf.bg} ${conf.text}`}>
            {conf.label}
          </span>
        </div>
        <p className="text-[10.5px] tabular-nums text-[#64748B]">
          {c.ventas_count} compras · cada{" "}
          {c.frecuencia_dias ? `${Math.round(c.frecuencia_dias)}d` : "—"} · próx{" "}
          <span className="font-medium text-[#0F172A]">{fecha}</span>
        </p>
      </div>

      {/* Score + ticket esperado */}
      <div className="shrink-0 text-right">
        <div className={`text-[15px] font-bold tabular-nums leading-none ${probColor}`} style={{ letterSpacing: "-0.02em" }}>
          {(prob * 100).toFixed(0)}%
        </div>
        <div className="mt-0.5 text-[11px] font-medium tabular-nums text-[#0F766E]">
          {mxn.format(c.pred.ingresoEstimadoProx)}
        </div>
      </div>

      {/* Mini progress bar bottom */}
      {onClick && (
        <ChevronRight className="size-3.5 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
      )}
    </li>
  )
}

/** Fila de riesgo — avatar + nombre + dias sin compra + score riesgo */
function RiesgoRow({
  cliente: c,
  onClick,
}: {
  cliente: EnrichedConPred
  onClick?: () => void
}) {
  const riesgo = c.pred.riesgoAbandono
  const display = c.nombre_negocio ?? c.nombre
  return (
    <li
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-180 ${onClick ? "cursor-pointer hover:bg-[rgba(220,38,38,0.03)]" : ""}`}
    >
      <div className="relative shrink-0">
        <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-rose-600 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
          {getInitials(display)}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-[12.5px] font-semibold tracking-[-0.01em] text-[#0F172A]"
          title={display}
        >
          {display}
        </p>
        <p className="text-[10.5px] tabular-nums text-[#64748B]">
          Hace{" "}
          <span className="font-medium text-rose-600">
            {c.dias_sin_compra}d
          </span>
          {" · cycle "}
          {c.frecuencia_dias ? `${Math.round(c.frecuencia_dias)}d` : "—"}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <div
          className="text-[14px] font-bold tabular-nums leading-none text-rose-600"
          style={{ letterSpacing: "-0.02em" }}
        >
          {(riesgo * 100).toFixed(0)}%
        </div>
        <div className="mt-1 h-[3px] w-16 overflow-hidden rounded-full bg-rose-100/50">
          <div
            className="h-[3px] rounded-full bg-gradient-to-r from-amber-500 to-rose-500"
            style={{ width: `${Math.min(100, riesgo * 100)}%` }}
          />
        </div>
      </div>
    </li>
  )
}

/**
 * AI tile compacto — mismo patrón que EstimadoIngresos.
 * Sin card visible, divisores invisibles, hover glow per-tone.
 */
function AiTile({
  icon,
  label,
  value,
  sub,
  tone = "emerald",
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tone?: "emerald" | "violet" | "amber" | "rose"
}) {
  const iconColor =
    tone === "violet"
      ? "text-violet-600"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "rose"
          ? "text-rose-600"
          : "text-[#0F766E]"
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
      <div className="flex items-center gap-1.5">
        <span
          className={`${iconColor} transition-transform duration-180 group-hover:scale-110`}
        >
          {icon}
        </span>
        <p
          className="text-[9.5px] font-semibold uppercase text-[#64748B]/70"
          style={{ letterSpacing: "0.12em" }}
        >
          {label}
        </p>
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

// Suprimir warning de TrendingUp unused (lo dejamos por si lo añadimos después)
void TrendingUp
