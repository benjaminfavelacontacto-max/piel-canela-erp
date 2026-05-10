"use client"

import { useMemo, useState } from "react"
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

// Avatar gradient consistente por nombre (hash → índice estable)
const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #4F46E5, #047857)",
  "linear-gradient(135deg, #047857, #0E7490)",
  "linear-gradient(135deg, #B45309, #B91C1C)",
  "linear-gradient(135deg, #BE185D, #4F46E5)",
  "linear-gradient(135deg, #0E7490, #047857)",
  "linear-gradient(135deg, #EA580C, #B45309)",
  "linear-gradient(135deg, #7E22CE, #BE185D)",
  "linear-gradient(135deg, #047857, #B45309)",
  "linear-gradient(135deg, #A8895F, #BE185D)",
  "linear-gradient(135deg, #0891B2, #4F46E5)",
  "linear-gradient(135deg, #B91C1C, #EA580C)",
  "linear-gradient(135deg, #15803D, #0891B2)",
]
function getAvatarGradient(nombre: string): string {
  if (!nombre) return AVATAR_GRADIENTS[0]
  let hash = 0
  for (let i = 0; i < nombre.length; i++) hash += nombre.charCodeAt(i)
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}

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

  // ─── Mapeo a ClientePrediccion para nuevo panel ────────────────────
  type Filtro = "TODOS" | "ALTA_PROB" | "ALTO_VALOR" | "ESTA_SEMANA" | "RIESGO" | "SIN_DATA"
  const [filtro, setFiltro] = useState<Filtro>("TODOS")
  const [expandido, setExpandido] = useState<string | null>(null)

  const ticketAnteriorMap = useMemo(() => {
    const m = new Map<string, number>()
    const sorted = [...ventas].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
    )
    for (const v of sorted) {
      if (v.cliente_id && !m.has(v.cliente_id)) m.set(v.cliente_id, Number(v.total ?? 0))
    }
    return m
  }, [ventas])

  const clientesPanel = useMemo(() => {
    return predicciones.map((c) => {
      const display = c.nombre_negocio ?? c.nombre
      const iniciales =
        display
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((s) => s[0]?.toUpperCase() ?? "")
          .join("") || "?"
      return {
        id: c.id,
        nombre: display,
        iniciales,
        compras: c.ventas_count,
        frecuenciaDias: c.frecuencia_dias,
        proximaFecha: c.pred.fechaProxima,
        probabilidad: Math.round((c.pred.probabilidadProx60 ?? 0) * 100),
        ticketEsperado: c.pred.ingresoEstimadoProx,
        ticketPromedio: c.ticket_promedio,
        ticketAnterior: ticketAnteriorMap.get(c.id) ?? c.ticket_promedio,
        diasDesdeUltimaCompra: c.dias_sin_compra ?? 0,
        suficienteData: c.pred.metodo !== "insufficient",
      }
    })
  }, [predicciones, ticketAnteriorMap])

  const fmtMXNAbbr = (v: number | undefined | null): string => {
    const n = Number(v) || 0
    if (n === 0) return "—"
    if (n >= 1000) return "$" + (n / 1000).toFixed(0) + "K"
    return "$" + n.toLocaleString("es-MX", { maximumFractionDigits: 0 })
  }

  const fechaHumana = (
    fecha: Date | null | undefined,
  ): {
    label: string
    sub: string
    urgencia: "pasado" | "hoy" | "pronto" | "normal" | "lejano"
  } => {
    if (!fecha) return { label: "Sin predicción", sub: "", urgencia: "normal" }
    const h = new Date()
    h.setHours(0, 0, 0, 0)
    const f = new Date(fecha)
    f.setHours(0, 0, 0, 0)
    const diff = Math.round((f.getTime() - h.getTime()) / 86400000)
    const sub = fechaCorta.format(f)
    if (diff < 0) {
      const dias = Math.abs(diff)
      return { label: "Atrasado " + dias + "d", sub, urgencia: "pasado" }
    }
    if (diff === 0) return { label: "Hoy", sub, urgencia: "hoy" }
    if (diff === 1) return { label: "Mañana", sub, urgencia: "hoy" }
    if (diff <= 7) return { label: "En " + diff + " días", sub, urgencia: "pronto" }
    if (diff <= 30) return { label: diff + "d", sub, urgencia: "normal" }
    return { label: diff + "d", sub, urgencia: "lejano" }
  }

  type AccionInfo = { label: string; color: string; bg: string; border: string; icon: string }
  const accionRecomendada = (
    c: (typeof clientesPanel)[number],
  ): AccionInfo => {
    if (!c.suficienteData)
      return {
        label: "Recopilar data",
        color: "#64748B",
        bg: "rgba(100,116,139,0.08)",
        border: "rgba(100,116,139,0.20)",
        icon: "•",
      }
    const diasProx = c.proximaFecha
      ? Math.round((c.proximaFecha.getTime() - today.getTime()) / 86400000)
      : 999
    if (c.diasDesdeUltimaCompra > (c.frecuenciaDias ?? 90) * 1.5)
      return {
        label: "Reenganchar",
        color: "#B91C1C",
        bg: "rgba(220,38,38,0.08)",
        border: "rgba(220,38,38,0.25)",
        icon: "↻",
      }
    if (diasProx <= 0)
      return {
        label: "Contactar HOY",
        color: "#047857",
        bg: "rgba(5,150,105,0.10)",
        border: "rgba(5,150,105,0.30)",
        icon: "⚡",
      }
    if (diasProx <= 7 && c.probabilidad >= 70)
      return {
        label: "Contactar pronto",
        color: "#047857",
        bg: "rgba(5,150,105,0.08)",
        border: "rgba(5,150,105,0.20)",
        icon: "📞",
      }
    if (c.probabilidad >= 80)
      return {
        label: "Upsell potencial",
        color: "#4F46E5",
        bg: "rgba(99,102,241,0.08)",
        border: "rgba(99,102,241,0.20)",
        icon: "↑",
      }
    if (diasProx <= 14)
      return {
        label: "Follow-up",
        color: "#B45309",
        bg: "rgba(217,119,6,0.08)",
        border: "rgba(217,119,6,0.20)",
        icon: "💬",
      }
    return {
      label: "Esperar",
      color: "#64748B",
      bg: "rgba(100,116,139,0.06)",
      border: "rgba(100,116,139,0.14)",
      icon: "⏳",
    }
  }

  const URG_COLOR = {
    pasado: "#B91C1C",
    hoy: "#047857",
    pronto: "#B45309",
    normal: "#475569",
    lejano: "#94A3B8",
  } as const

  const filtrados = useMemo(() => {
    return clientesPanel.filter((c) => {
      const diasProx = c.proximaFecha
        ? Math.round((c.proximaFecha.getTime() - today.getTime()) / 86400000)
        : 999
      switch (filtro) {
        case "ALTA_PROB":
          return c.probabilidad >= 70 && c.suficienteData
        case "ALTO_VALOR":
          return c.ticketEsperado >= 10000
        case "ESTA_SEMANA":
          return diasProx >= 0 && diasProx <= 7
        case "RIESGO":
          return (
            c.suficienteData &&
            c.diasDesdeUltimaCompra > (c.frecuenciaDias ?? 90) * 1.3
          )
        case "SIN_DATA":
          return !c.suficienteData
        default:
          return true
      }
    })
  }, [clientesPanel, filtro, today])

  // KPIs derivados para header
  const revenueSemana = clientesPanel
    .filter((c) => {
      if (!c.proximaFecha) return false
      const d = Math.round(
        (c.proximaFecha.getTime() - today.getTime()) / 86400000,
      )
      return d >= 0 && d <= 7 && c.probabilidad >= 60
    })
    .reduce((s, c) => s + c.ticketEsperado * (c.probabilidad / 100), 0)
  const activosCount = clientesPanel.filter(
    (c) => c.probabilidad >= 50 && c.suficienteData,
  ).length
  const enRiesgoCount = clientesPanel.filter(
    (c) =>
      c.suficienteData &&
      c.diasDesdeUltimaCompra > (c.frecuenciaDias ?? 90) * 1.3,
  ).length

  const FILTROS: { key: Filtro; label: string; count: number }[] = [
    { key: "TODOS", label: "Todos", count: clientesPanel.length },
    {
      key: "ALTA_PROB",
      label: "Alta probabilidad",
      count: clientesPanel.filter(
        (c) => c.probabilidad >= 70 && c.suficienteData,
      ).length,
    },
    {
      key: "ALTO_VALOR",
      label: "Alto valor",
      count: clientesPanel.filter((c) => c.ticketEsperado >= 10000).length,
    },
    {
      key: "ESTA_SEMANA",
      label: "Esta semana",
      count: clientesPanel.filter((c) => {
        const d = c.proximaFecha
          ? Math.round(
              (c.proximaFecha.getTime() - today.getTime()) / 86400000,
            )
          : 999
        return d >= 0 && d <= 7
      }).length,
    },
    { key: "RIESGO", label: "En riesgo", count: enRiesgoCount },
    {
      key: "SIN_DATA",
      label: "Sin datos",
      count: clientesPanel.filter((c) => !c.suficienteData).length,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* KPI HEADER */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            label: "Revenue proyectado esta semana",
            value: mxn.format(revenueSemana),
            sub: "probabilidad ponderada · 7 días",
            color: "#047857",
            tint: "rgba(5,150,105,0.08)",
            border: "rgba(5,150,105,0.20)",
          },
          {
            label: "Clientes activos con predicción",
            value: String(activosCount),
            sub: `de ${clientesPanel.length} clientes totales`,
            color: "#4F46E5",
            tint: "rgba(99,102,241,0.06)",
            border: "rgba(99,102,241,0.18)",
          },
          {
            label: "En riesgo de abandono",
            value: String(enRiesgoCount),
            sub: enRiesgoCount === 0 ? "Todos al día ✓" : "Requieren atención",
            color: enRiesgoCount > 0 ? "#B91C1C" : "#047857",
            tint:
              enRiesgoCount > 0
                ? "rgba(220,38,38,0.06)"
                : "rgba(5,150,105,0.06)",
            border:
              enRiesgoCount > 0
                ? "rgba(220,38,38,0.18)"
                : "rgba(5,150,105,0.18)",
          },
        ].map((kpi, i) => (
          <div
            key={i}
            className="rounded-2xl border bg-white p-4 shadow-sm"
            style={{ borderColor: kpi.border, background: kpi.tint }}
          >
            <p
              className="mb-2 text-[9.5px] font-semibold uppercase tracking-[0.10em]"
              style={{ color: kpi.color, opacity: 0.85 }}
            >
              {kpi.label}
            </p>
            <p
              className="mb-1 text-[22px] font-bold leading-none tracking-[-0.02em] tabular-nums"
              style={{ color: kpi.color, fontFeatureSettings: '"tnum" 1' }}
            >
              {kpi.value}
            </p>
            <p className="text-[10.5px] text-gray-500">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* FILTROS */}
      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => {
          const active = filtro === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFiltro(f.key)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-all"
              style={{
                background: active ? "rgba(99,102,241,0.10)" : "white",
                color: active ? "#4F46E5" : "#64748B",
                border: `1px solid ${active ? "rgba(99,102,241,0.30)" : "rgba(15,23,42,0.08)"}`,
              }}
            >
              {f.label}
              <span
                className="rounded-full px-1.5 py-px text-[9px] font-bold tabular-nums"
                style={{
                  background: active
                    ? "rgba(99,102,241,0.20)"
                    : "rgba(15,23,42,0.06)",
                  color: active ? "#4F46E5" : "#94A3B8",
                }}
              >
                {f.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* TABLA */}
      <div className="overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white shadow-sm">
        {/* Header columnas */}
        <div
          className="grid items-center gap-3 border-b border-[rgba(15,23,42,0.04)] px-5 py-2.5"
          style={{
            gridTemplateColumns: "1fr 110px 120px 100px 130px 160px",
          }}
        >
          {[
            { l: "Cliente", a: "left" },
            { l: "Próxima compra", a: "center" },
            { l: "Probabilidad", a: "center" },
            { l: "Frecuencia", a: "center" },
            { l: "Revenue esp.", a: "center" },
            { l: "Acción", a: "center" },
          ].map((h, i) => (
            <p
              key={i}
              className="text-[9.5px] font-semibold uppercase tracking-[0.10em] text-gray-400"
              style={{ textAlign: h.a as "left" | "center" }}
            >
              {h.l}
            </p>
          ))}
        </div>

        {filtrados.length === 0 && (
          <div className="px-6 py-10 text-center text-[13px] text-gray-400">
            No hay clientes en esta categoría
          </div>
        )}

        {filtrados.map((cliente, i) => {
          const fechaInfo = fechaHumana(cliente.proximaFecha)
          const accion = accionRecomendada(cliente)
          const isExp = expandido === cliente.id
          const tendencia =
            (cliente.ticketEsperado ?? 0) > (cliente.ticketAnterior ?? 0)
              ? "↑"
              : (cliente.ticketEsperado ?? 0) < (cliente.ticketAnterior ?? 0)
                ? "↓"
                : "→"
          const tendColor =
            tendencia === "↑"
              ? "#047857"
              : tendencia === "↓"
                ? "#B91C1C"
                : "#94A3B8"
          return (
            <div
              key={cliente.id}
              className="cursor-pointer border-b border-[rgba(15,23,42,0.03)] bg-white transition-colors hover:bg-[rgba(15,23,42,0.02)]"
              onClick={() => setExpandido(isExp ? null : cliente.id)}
            >
              <div
                className="grid items-center gap-3 px-5 py-3"
                style={{
                  gridTemplateColumns: "1fr 110px 120px 100px 130px 160px",
                }}
              >
                {/* Cliente */}
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-[11px] text-[12px] font-bold text-white"
                    style={{
                      background: getAvatarGradient(cliente.nombre),
                      boxShadow: "0 2px 6px rgba(15,23,42,0.12)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {cliente.iniciales}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-[#0F172A]">
                      {cliente.nombre}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {cliente.compras} compra
                      {cliente.compras !== 1 ? "s" : ""} históricas
                    </p>
                  </div>
                </div>

                {/* Próxima fecha */}
                <div className="text-center">
                  <p
                    className="text-[12px] font-bold leading-none tabular-nums"
                    style={{ color: URG_COLOR[fechaInfo.urgencia] }}
                  >
                    {fechaInfo.label}
                  </p>
                  {fechaInfo.sub && (
                    <p className="mt-0.5 text-[9.5px] text-gray-400">
                      {fechaInfo.sub}
                    </p>
                  )}
                </div>

                {/* Probabilidad */}
                <div className="text-center">
                  {!cliente.suficienteData ? (
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[9.5px] font-semibold text-gray-500">
                      Insuf. data
                    </span>
                  ) : (
                    <>
                      <p
                        className="mb-1 text-[14px] font-bold leading-none tabular-nums"
                        style={{
                          color:
                            cliente.probabilidad >= 80
                              ? "#047857"
                              : cliente.probabilidad >= 50
                                ? "#B45309"
                                : "#B91C1C",
                        }}
                      >
                        {cliente.probabilidad}%
                      </p>
                      <div className="h-[3px] overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${cliente.probabilidad}%`,
                            background:
                              cliente.probabilidad >= 80
                                ? "#047857"
                                : cliente.probabilidad >= 50
                                  ? "#B45309"
                                  : "#B91C1C",
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Frecuencia */}
                <div className="text-center">
                  <p className="text-[12px] font-semibold tabular-nums text-[#475569]">
                    {cliente.frecuenciaDias
                      ? `${Math.round(cliente.frecuenciaDias)}d`
                      : "—"}
                  </p>
                  <p className="mt-0.5 text-[9.5px] text-gray-400">
                    {cliente.frecuenciaDias ? "ciclo" : "sin ciclo"}
                  </p>
                </div>

                {/* Revenue esperado */}
                <div className="text-center">
                  {cliente.ticketEsperado > 0 ? (
                    <>
                      <p
                        className="text-[14px] font-bold leading-none tabular-nums text-[#0F172A]"
                        style={{ letterSpacing: "-0.01em" }}
                      >
                        {fmtMXNAbbr(cliente.ticketEsperado)}
                      </p>
                      <span
                        className="mt-0.5 inline-block text-[9.5px] font-semibold"
                        style={{ color: tendColor }}
                      >
                        {tendencia} vs anterior
                      </span>
                    </>
                  ) : (
                    <p className="text-[11px] text-gray-300">—</p>
                  )}
                </div>

                {/* Acción */}
                <div className="flex justify-center">
                  <span
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold"
                    style={{
                      background: accion.bg,
                      color: accion.color,
                      border: `1px solid ${accion.border}`,
                    }}
                  >
                    <span className="text-[10px]">{accion.icon}</span>
                    {accion.label}
                  </span>
                </div>
              </div>

              {/* Expandido */}
              {isExp && (
                <div
                  className="grid grid-cols-2 gap-2 border-t border-[rgba(15,23,42,0.03)] bg-gray-50/50 px-5 py-3 sm:grid-cols-4"
                >
                  {[
                    {
                      l: "Última compra",
                      v: `Hace ${cliente.diasDesdeUltimaCompra}d`,
                    },
                    {
                      l: "Ticket promedio",
                      v: mxn.format(cliente.ticketPromedio),
                    },
                    {
                      l: "Ticket anterior",
                      v: mxn.format(cliente.ticketAnterior),
                    },
                    {
                      l: "Revenue total",
                      v: mxn.format(
                        cliente.ticketPromedio * cliente.compras,
                      ),
                    },
                  ].map((s, j) => (
                    <div
                      key={j}
                      className="rounded-lg border border-gray-100 bg-white px-3 py-2"
                    >
                      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                        {s.l}
                      </p>
                      <p className="mt-0.5 text-[12.5px] font-bold tabular-nums text-[#0F172A]">
                        {s.v}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
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

/** Fila CRM intelligence — columnas separadas: cliente | fecha | score | monto */
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

      {/* Cliente — nombre + confianza badge + total compras */}
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
          {c.ventas_count}{" "}
          {c.ventas_count === 1 ? "compra" : "compras"}
        </p>
      </div>

      {/* Frecuencia — columna propia */}
      <div className="hidden w-[110px] shrink-0 text-right md:block">
        <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
          Frecuencia
        </p>
        <p
          className="mt-0.5 text-[12.5px] font-semibold tabular-nums text-[#0F172A]"
          style={{ letterSpacing: "-0.01em" }}
        >
          {c.frecuencia_dias
            ? `${Math.round(c.frecuencia_dias)}d`
            : "—"}
        </p>
      </div>

      {/* Próxima fecha — columna propia */}
      <div className="hidden w-[110px] shrink-0 text-right sm:block">
        <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
          Próxima fecha
        </p>
        <p
          className="mt-0.5 text-[12.5px] font-semibold tabular-nums text-[#0F172A]"
          style={{ letterSpacing: "-0.01em" }}
        >
          {fecha}
        </p>
      </div>

      {/* Probabilidad — columna propia */}
      <div className="w-[110px] shrink-0 text-right">
        <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
          Probabilidad
        </p>
        <p
          className={`mt-0.5 text-[14px] font-bold tabular-nums leading-none ${probColor}`}
          style={{ letterSpacing: "-0.02em" }}
        >
          {(prob * 100).toFixed(0)}%
        </p>
      </div>

      {/* Ticket esperado — columna propia */}
      <div className="w-[110px] shrink-0 text-right">
        <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
          Ticket esperado
        </p>
        <p
          className="mt-0.5 text-[12.5px] font-bold tabular-nums text-[#0F766E]"
          style={{ letterSpacing: "-0.01em", fontFeatureSettings: '"tnum" 1' }}
        >
          {mxn.format(c.pred.ingresoEstimadoProx)}
        </p>
      </div>

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
