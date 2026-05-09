"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Bar,
  BarChart,
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
import {
  Activity,
  Calendar,
  Crown,
  ExternalLink,
  Flame,
  Repeat,
  TrendingUp,
  X,
} from "lucide-react"
import type {
  CotizacionSummaryRow,
  EnrichedCliente,
  VentaItemSummary,
  VentaSummaryRow,
} from "./clientes-dashboard"
import { EmpiricalCDFModel, MES_ABBR } from "./lib-prediccion"

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
const monthShort = new Intl.DateTimeFormat("es-MX", {
  month: "short",
  year: "2-digit",
})
const monthLong = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
})
const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "2-digit",
})

type Granularity = "mensual" | "trimestral"
type Period = "12m" | "all" | string // "12m" | "all" | year as string

type Bucket = {
  key: string // "2025-04" mensual o "2025-Q2" trimestral
  label: string // "abr 25" o "Q2 25"
  start: Date
  end: Date
  isCurrent: boolean
}

function buildBuckets(
  granularity: Granularity,
  period: Period,
  today: Date,
  earliestVenta: Date | null,
): Bucket[] {
  const out: Bucket[] = []
  const curYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
  const curQ = `${today.getFullYear()}-Q${Math.floor(today.getMonth() / 3) + 1}`

  if (granularity === "mensual") {
    if (period === "all" && earliestVenta) {
      // Desde primer venta hasta hoy
      const cur = new Date(earliestVenta.getFullYear(), earliestVenta.getMonth(), 1)
      const limit = new Date(today.getFullYear(), today.getMonth(), 1)
      while (cur <= limit) {
        const start = new Date(cur.getFullYear(), cur.getMonth(), 1)
        const end = new Date(cur.getFullYear(), cur.getMonth() + 1, 0)
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`
        out.push({
          key,
          label: monthShort.format(cur).replace(".", ""),
          start,
          end,
          isCurrent: key === curYM,
        })
        cur.setMonth(cur.getMonth() + 1)
      }
    } else if (period === "12m") {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
        const start = new Date(d.getFullYear(), d.getMonth(), 1)
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        out.push({
          key,
          label: monthShort.format(d).replace(".", ""),
          start,
          end,
          isCurrent: key === curYM,
        })
      }
    } else {
      const year = parseInt(period, 10)
      for (let m = 0; m < 12; m++) {
        const d = new Date(year, m, 1)
        const start = new Date(year, m, 1)
        const end = new Date(year, m + 1, 0)
        const key = `${year}-${String(m + 1).padStart(2, "0")}`
        out.push({
          key,
          label: d.toLocaleDateString("es-MX", { month: "short" }).replace(".", ""),
          start,
          end,
          isCurrent: key === curYM,
        })
      }
    }
  } else {
    // trimestral
    let years: number[]
    if (period === "all" && earliestVenta) {
      years = []
      for (let y = earliestVenta.getFullYear(); y <= today.getFullYear(); y++) {
        years.push(y)
      }
    } else if (period === "12m") {
      years = [today.getFullYear() - 1, today.getFullYear()]
    } else {
      years = [parseInt(period, 10)]
    }
    for (const year of years) {
      for (let q = 0; q < 4; q++) {
        const start = new Date(year, q * 3, 1)
        const end = new Date(year, q * 3 + 3, 0)
        if (
          period === "12m" &&
          end < new Date(today.getFullYear() - 1, today.getMonth(), 1)
        )
          continue
        if (period === "all" && earliestVenta && end < earliestVenta) continue
        if (period === "all" && start > today) continue
        const key = `${year}-Q${q + 1}`
        out.push({
          key,
          label: `Q${q + 1} ${String(year).slice(2)}`,
          start,
          end,
          isCurrent: key === curQ,
        })
      }
    }
    if (period === "12m") {
      // Limitar a últimos 4-5 trimestres
      while (out.length > 5) out.shift()
    }
  }
  return out
}

function bucketKeyFor(
  fecha: string,
  granularity: Granularity,
): string {
  const d = new Date(fecha)
  if (granularity === "mensual") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  }
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
}

export function RecurrenciaAnalytics({
  clientes,
  ventas,
  cotizaciones,
  venta_items,
}: {
  clientes: EnrichedCliente[]
  ventas: VentaSummaryRow[]
  cotizaciones: CotizacionSummaryRow[]
  venta_items: VentaItemSummary[]
}) {
  const today = useMemo(() => new Date(), [])

  // ─── Filtros del heatmap ──────────────────────────────────────────
  const [granularity, setGranularity] = useState<Granularity>("mensual")
  const [period, setPeriod] = useState<Period>("12m")
  const [mode, setMode] = useState<"historico" | "predictivo">("historico")
  const [drilldown, setDrilldown] = useState<{
    clienteId: string
    bucket: Bucket
  } | null>(null)

  // Lista de años disponibles según ventas (para el selector)
  const yearsAvailable = useMemo(() => {
    const set = new Set<number>()
    for (const v of ventas) {
      if (v.estatus === "cancelada") continue
      set.add(new Date(v.fecha).getFullYear())
    }
    set.add(today.getFullYear())
    return Array.from(set).sort((a, b) => b - a)
  }, [ventas, today])

  // Fecha de la primera venta (para "Todos los años")
  const earliestVenta = useMemo(() => {
    let earliest: Date | null = null
    for (const v of ventas) {
      if (v.estatus === "cancelada") continue
      const d = new Date(v.fecha)
      if (!earliest || d < earliest) earliest = d
    }
    return earliest
  }, [ventas])

  const buckets = useMemo(() => {
    if (mode === "predictivo") {
      // Próximos 6 meses (mensual) o 2 trimestres (trimestral)
      const out: Bucket[] = []
      if (granularity === "mensual") {
        for (let i = 0; i < 6; i++) {
          const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
          const start = new Date(d.getFullYear(), d.getMonth(), 1)
          const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
          out.push({
            key,
            label: `${MES_ABBR[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
            start,
            end,
            isCurrent: i === 0,
          })
        }
      } else {
        for (let i = 0; i < 2; i++) {
          const m0 = today.getMonth() + i * 3
          const d = new Date(today.getFullYear(), m0, 1)
          const q = Math.floor(d.getMonth() / 3) + 1
          const start = new Date(d.getFullYear(), (q - 1) * 3, 1)
          const end = new Date(d.getFullYear(), q * 3, 0)
          out.push({
            key: `${d.getFullYear()}-Q${q}`,
            label: `Q${q} ${String(d.getFullYear()).slice(2)}`,
            start,
            end,
            isCurrent: i === 0,
          })
        }
      }
      return out
    }
    return buildBuckets(granularity, period, today, earliestVenta)
  }, [mode, granularity, period, today, earliestVenta])

  // Modelo predictivo (instancia única)
  const model = useMemo(() => new EmpiricalCDFModel(60), [])

  // ─── Heatmap data: top 10 clientes × buckets ──────────────────────
  const heatmap = useMemo(() => {
    const top = [...clientes]
      .filter((c) => c.ventas_count > 0)
      .sort((a, b) =>
        mode === "predictivo"
          ? b.ticket_promedio - a.ticket_promedio
          : b.ltv - a.ltv,
      )
      .slice(0, 10)

    const result = top.map((c) => {
      let cells: { bucketKey: string; total: number; count: number; prob?: number }[]

      if (mode === "predictivo") {
        const pred = model.predict(c, ventas, today)
        cells = buckets.map((b, idx) => {
          // Para mensual, usar probMesesFuturos directo (idx coincide)
          // Para trimestral, sumar 3 meses correspondientes
          let prob = 0
          if (granularity === "mensual") {
            prob = pred.probMesesFuturos[idx] ?? 0
          } else {
            // Trimestral: sumar P de meses idx*3..idx*3+2 (capped 1)
            const slice = pred.probMesesFuturos.slice(idx * 3, idx * 3 + 3)
            prob = Math.min(1, slice.reduce((s, x) => s + x, 0))
          }
          const total = c.ticket_promedio * prob
          return { bucketKey: b.key, total, count: 0, prob }
        })
      } else {
        cells = buckets.map((b) => {
          const ventasDelBucket = ventas.filter(
            (v) =>
              v.cliente_id === c.id &&
              v.estatus !== "cancelada" &&
              bucketKeyFor(v.fecha, granularity) === b.key,
          )
          const total = ventasDelBucket.reduce(
            (s, v) => s + Number(v.total ?? 0),
            0,
          )
          return { bucketKey: b.key, total, count: ventasDelBucket.length }
        })
      }
      const maxRow = Math.max(0, ...cells.map((x) => x.total))
      return {
        clienteId: c.id,
        cliente: c.nombre_negocio ?? c.nombre,
        ltv: c.ltv,
        cells,
        maxRow,
      }
    })
    return result
  }, [clientes, ventas, buckets, granularity, mode, model, today])

  // ─── Line chart "Clientes activos por mes" ────────────────────────
  // Usa TODAS las ventas agrupadas por mes (independiente del filtro del heatmap).
  // Solo incluye meses con actividad real (no rellena con ceros).
  const activosPorMes = useMemo(() => {
    const map = new Map<
      string,
      { mes: string; ingreso: number; clientesSet: Set<string> }
    >()
    for (const v of ventas) {
      if (v.estatus === "cancelada") continue
      const mes = v.fecha.slice(0, 7)
      const cur =
        map.get(mes) ??
        { mes, ingreso: 0, clientesSet: new Set<string>() }
      cur.ingreso += Number(v.total ?? 0)
      if (v.cliente_id) cur.clientesSet.add(v.cliente_id)
      map.set(mes, cur)
    }
    return Array.from(map.values())
      .map((m) => ({
        mes: m.mes,
        label: `${MES_ABBR[parseInt(m.mes.slice(5, 7), 10) - 1]} ${m.mes.slice(2, 4)}`,
        ingreso: Math.round(m.ingreso),
        clientes: m.clientesSet.size,
      }))
      .sort((a, b) => a.mes.localeCompare(b.mes))
  }, [ventas])

  const maxClientesPorMes = useMemo(
    () => Math.max(1, ...activosPorMes.map((m) => m.clientes)),
    [activosPorMes],
  )

  // ─── Top recurrentes ──────────────────────────────────────────────
  const topRecurrentes = useMemo(() => {
    return [...clientes]
      .filter((c) => c.ventas_count >= 2)
      .sort((a, b) => b.ventas_count - a.ventas_count)
      .slice(0, 8)
  }, [clientes])

  // ─── KPIs analíticos ──────────────────────────────────────────────
  const kpis = useMemo(() => {
    const conVentas = clientes.filter((c) => c.ventas_count > 0)
    const recompra = conVentas.filter((c) => c.ventas_count >= 2)
    const recompraPct =
      conVentas.length > 0 ? (recompra.length / conVentas.length) * 100 : 0
    const masGrande = clientes
      .filter((c) => c.ltv > 0)
      .sort((a, b) => b.ltv - a.ltv)[0]
    const masFrecuente = clientes
      .filter((c) => c.ventas_count > 0)
      .sort((a, b) => b.ventas_count - a.ventas_count)[0]
    const inactivos = clientes.filter(
      (c) =>
        c.dias_sin_compra !== null &&
        c.dias_sin_compra > 90 &&
        c.ventas_count > 0,
    )
    const inactivosLTV = inactivos.reduce((s, c) => s + c.ltv, 0)
    return {
      recompraPct,
      masGrande,
      masFrecuente,
      inactivosCount: inactivos.length,
      inactivosLTV,
    }
  }, [clientes])

  return (
    <section className="space-y-4">
      {/* Hero analytics row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AnalyticsCard
          icon={<Repeat className="size-4" />}
          label="Tasa de recompra"
          value={`${kpis.recompraPct.toFixed(0)}%`}
          sub={`${clientes.filter((c) => c.ventas_count >= 2).length} de ${clientes.filter((c) => c.ventas_count > 0).length} repiten`}
          accent="text-[#0F766E]"
          gradient="from-white via-white to-white/50"
          ring="ring-[#E7EAF0]"
        />
        <AnalyticsCard
          icon={<Crown className="size-4" />}
          label="Cliente más rentable"
          value={
            kpis.masGrande?.nombre_negocio ?? kpis.masGrande?.nombre ?? "—"
          }
          sub={kpis.masGrande ? mxn.format(kpis.masGrande.ltv) : ""}
          accent="text-amber-700"
          gradient="from-amber-50 via-white to-orange-50/50"
          ring="ring-amber-100"
          truncate
        />
        <AnalyticsCard
          icon={<Flame className="size-4" />}
          label="Más frecuente"
          value={
            kpis.masFrecuente?.nombre_negocio ??
            kpis.masFrecuente?.nombre ??
            "—"
          }
          sub={
            kpis.masFrecuente
              ? `${kpis.masFrecuente.ventas_count} compras · cada ${kpis.masFrecuente.frecuencia_dias ? Math.round(kpis.masFrecuente.frecuencia_dias) + "d" : "—"}`
              : ""
          }
          accent="text-emerald-700"
          gradient="from-emerald-50 via-white to-teal-50/50"
          ring="ring-emerald-100"
          truncate
        />
        <AnalyticsCard
          icon={<Activity className="size-4" />}
          label="Inactivos (90+ días)"
          value={kpis.inactivosCount.toString()}
          sub={`${mxn.format(kpis.inactivosLTV)} en LTV "perdido"`}
          accent="text-rose-700"
          gradient="from-white via-white to-white/50"
          ring="ring-rose-100"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Heatmap top 10 clientes */}
        <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                Heatmap de compras
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${mode === "predictivo" ? "bg-violet-100 text-violet-700" : "bg-[#DFF7F4] text-[#0F766E]"}`}
                >
                  {mode === "predictivo" ? "predictivo" : "histórico"}
                </span>
              </h3>
              <p className="mt-0.5 text-[11px] text-gray-500">
                {mode === "predictivo"
                  ? "Próximos 6 meses · ticket × probabilidad de recompra"
                  : "Click en una celda para ver el detalle de ese periodo"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Modo: Histórico / Predictivo */}
              <div className="inline-flex items-center rounded-md bg-gray-100 p-0.5 text-[10.5px]">
                <button
                  type="button"
                  onClick={() => setMode("historico")}
                  className={`rounded px-2 py-0.5 font-medium transition ${mode === "historico" ? "bg-white text-[#0F766E] shadow-sm" : "text-gray-500"}`}
                >
                  Histórico
                </button>
                <button
                  type="button"
                  onClick={() => setMode("predictivo")}
                  className={`rounded px-2 py-0.5 font-medium transition ${mode === "predictivo" ? "bg-white text-violet-700 shadow-sm" : "text-gray-500"}`}
                >
                  Predictivo
                </button>
              </div>
              <div className="inline-flex items-center rounded-md bg-gray-100 p-0.5 text-[10.5px]">
                <button
                  type="button"
                  onClick={() => setGranularity("mensual")}
                  className={`rounded px-2 py-0.5 font-medium transition ${granularity === "mensual" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
                >
                  Mensual
                </button>
                <button
                  type="button"
                  onClick={() => setGranularity("trimestral")}
                  className={`rounded px-2 py-0.5 font-medium transition ${granularity === "trimestral" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
                >
                  Trimestral
                </button>
              </div>
              {mode === "historico" && (
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="h-7 rounded-md border border-gray-200 bg-white px-2 text-[10.5px] text-gray-700 focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#DFF7F4]"
                >
                  <option value="12m">Últimos 12 meses</option>
                  <option value="all">Todos los años (global)</option>
                  {yearsAvailable.map((y) => (
                    <option key={y} value={String(y)}>
                      Año {y}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </header>
          {heatmap.length === 0 ? (
            <p className="py-8 text-center text-xs italic text-gray-400">
              Sin datos suficientes para el heatmap.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-[10px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white pr-3 text-left text-[9.5px] font-semibold uppercase tracking-wider text-gray-400">
                      Cliente
                    </th>
                    {buckets.map((b) => (
                      <th
                        key={b.key}
                        className={`px-1 pb-1 text-center font-semibold ${b.isCurrent ? "text-[#0F766E]" : "text-gray-400"}`}
                      >
                        {b.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmap.map((row) => (
                    <tr key={row.clienteId}>
                      <td
                        className="sticky left-0 max-w-[160px] truncate bg-white py-1 pr-3 text-xs font-medium text-gray-800"
                        title={row.cliente}
                      >
                        {row.cliente}
                      </td>
                      {row.cells.map((c, idx) => {
                        const intensity =
                          row.maxRow > 0 ? c.total / row.maxRow : 0
                        let tone: string
                        if (mode === "predictivo") {
                          tone =
                            c.total === 0 || (c.prob ?? 0) < 0.05
                              ? "bg-gray-50 text-gray-300"
                              : intensity >= 0.7
                                ? "bg-violet-600 text-white hover:ring-2 hover:ring-violet-400"
                                : intensity >= 0.4
                                  ? "bg-violet-400 text-white hover:ring-2 hover:ring-violet-300"
                                  : intensity >= 0.15
                                    ? "bg-violet-200 text-violet-900 hover:ring-2 hover:ring-violet-200"
                                    : "bg-violet-100 text-violet-700 hover:ring-2 hover:ring-violet-100"
                        } else {
                          tone =
                            c.total === 0
                              ? "bg-gray-50 text-gray-300 hover:bg-gray-100"
                              : intensity >= 0.7
                                ? "bg-[#0F766E] text-white hover:ring-2 hover:ring-emerald-200"
                                : intensity >= 0.4
                                  ? "bg-[#0F766E] text-white hover:ring-2 hover:ring-[#DFF7F4]"
                                  : intensity >= 0.15
                                    ? "bg-[#DFF7F4] text-[#0F766E] hover:ring-2 hover:ring-[#DFF7F4]"
                                    : "bg-[#DFF7F4] text-[#0F766E] hover:ring-2 hover:ring-[#E7EAF0]"
                        }
                        const isPredictivo = mode === "predictivo"
                        const tooltipDetail = isPredictivo
                          ? `prob ${((c.prob ?? 0) * 100).toFixed(0)}% · esperado`
                          : c.count > 0
                            ? `(${c.count})`
                            : ""
                        const isClickable =
                          !isPredictivo && c.total > 0
                        return (
                          <td key={c.bucketKey} className="p-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (!isClickable) return
                                setDrilldown({
                                  clienteId: row.clienteId,
                                  bucket: buckets[idx],
                                })
                              }}
                              disabled={!isClickable}
                              className={`flex h-7 w-12 items-center justify-center rounded text-[9.5px] font-semibold tabular-nums transition ${isClickable ? "cursor-pointer hover:scale-110 hover:shadow" : "cursor-default"} ${tone}`}
                              title={`${row.cliente} · ${buckets[idx].label}: ${mxn.format(c.total)} ${tooltipDetail}`}
                            >
                              {c.total > 0
                                ? c.total >= 1000
                                  ? `${Math.round(c.total / 1000)}k`
                                  : Math.round(c.total).toString()
                                : "·"}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        {/* Top recurrentes */}
        <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <header className="mb-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Top recurrentes
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Por número de compras
            </p>
          </header>
          {topRecurrentes.length === 0 ? (
            <p className="py-8 text-center text-xs italic text-gray-400">
              Aún sin clientes recurrentes.
            </p>
          ) : (
            <ul className="space-y-2">
              {topRecurrentes.map((c, i) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 bg-gradient-to-r from-white to-gray-50/40 p-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex size-6 items-center justify-center rounded-md text-[10px] font-bold tabular-nums ${
                        i === 0
                          ? "bg-amber-100 text-amber-700"
                          : i === 1
                            ? "bg-gray-100 text-gray-600"
                            : i === 2
                              ? "bg-orange-100 text-orange-700"
                              : "bg-gray-50 text-gray-500"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-gray-900">
                        {c.nombre_negocio ?? c.nombre}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {c.frecuencia_dias
                          ? `cada ${Math.round(c.frecuencia_dias)}d`
                          : "—"}{" "}
                        · {mxn.format(c.ltv)}
                      </div>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#DFF7F4] px-2 py-0.5 text-[10.5px] font-bold text-[#0F766E] tabular-nums">
                    {c.ventas_count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      {/* Line chart: clientes activos por mes (datos históricos reales) */}
      <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Clientes activos por mes
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Clientes únicos que compraron cada mes ·{" "}
              {activosPorMes.length} meses con actividad
            </p>
          </div>
          <TrendingUp className="size-4 text-gray-400" />
        </header>
        {activosPorMes.length === 0 ? (
          <p className="py-8 text-center text-xs italic text-gray-400">
            Sin ventas registradas.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart
              data={activosPorMes}
              margin={{ top: 5, right: 5, left: 5, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#EEF1F4"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
              />
              {/* Eje izquierdo: clientes (entero, dinámico desde 0) */}
              <YAxis
                yAxisId="clientes"
                orientation="left"
                domain={[0, Math.max(5, maxClientesPorMes + 1)]}
                allowDecimals={false}
                tick={{ fontSize: 12, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
                label={{
                  value: "Clientes",
                  angle: -90,
                  position: "insideLeft",
                  fontSize: 11,
                  fill: "#9CA3AF",
                  style: { textAnchor: "middle" },
                }}
              />
              {/* Eje derecho: ingreso MXN */}
              <YAxis
                yAxisId="ingreso"
                orientation="right"
                tickFormatter={(v: number) =>
                  v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                }
                tick={{ fontSize: 12, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "#F3F5F7", opacity: 0.3 }}
                content={<ActivosPorMesTooltip />}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                iconType="circle"
                formatter={(value) =>
                  value === "clientes" ? "Clientes únicos" : "Ingreso MXN"
                }
              />
              <Bar
                yAxisId="ingreso"
                dataKey="ingreso"
                fill="#CBD5E1"
                radius={[6, 6, 0, 0]}
                animationDuration={800}
                name="ingreso"
              />
              <Line
                yAxisId="clientes"
                type="monotone"
                dataKey="clientes"
                stroke="#0F766E"
                strokeWidth={2.5}
                dot={{ r: 5, fill: "#0F766E", strokeWidth: 2, stroke: "white" }}
                activeDot={{ r: 7 }}
                animationDuration={1000}
                name="clientes"
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </article>

      {/* Drilldown modal */}
      {drilldown && (
        <DrilldownModal
          clienteId={drilldown.clienteId}
          bucket={drilldown.bucket}
          clientes={clientes}
          ventas={ventas}
          cotizaciones={cotizaciones}
          venta_items={venta_items}
          onClose={() => setDrilldown(null)}
        />
      )}
    </section>
  )
}

// ─── Drilldown Modal: detalle del cliente × bucket ──────────────────

function DrilldownModal({
  clienteId,
  bucket,
  clientes,
  ventas,
  cotizaciones,
  venta_items,
  onClose,
}: {
  clienteId: string
  bucket: Bucket
  clientes: EnrichedCliente[]
  ventas: VentaSummaryRow[]
  cotizaciones: CotizacionSummaryRow[]
  venta_items: VentaItemSummary[]
  onClose: () => void
}) {
  const cliente = clientes.find((c) => c.id === clienteId)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  const ventasInBucket = useMemo(() => {
    return ventas
      .filter(
        (v) =>
          v.cliente_id === clienteId &&
          v.estatus !== "cancelada" &&
          new Date(v.fecha) >= bucket.start &&
          new Date(v.fecha) <= bucket.end,
      )
      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
  }, [ventas, clienteId, bucket])

  const cotsInBucket = useMemo(() => {
    return cotizaciones.filter(
      (c) =>
        c.cliente_id === clienteId &&
        new Date(c.fecha) >= bucket.start &&
        new Date(c.fecha) <= bucket.end,
    )
  }, [cotizaciones, clienteId, bucket])

  const productosInBucket = useMemo(() => {
    const ventaIds = new Set(ventasInBucket.map((v) => v.id))
    const map = new Map<
      string,
      { nombre: string; sku: string | null; cantidad: number; revenue: number }
    >()
    for (const it of venta_items) {
      if (!ventaIds.has(it.venta_id)) continue
      const p = it.productos
      if (!p) continue
      const cur = map.get(p.id) ?? {
        nombre: p.nombre,
        sku: p.sku,
        cantidad: 0,
        revenue: 0,
      }
      cur.cantidad += Number(it.cantidad ?? 0)
      cur.revenue += Number(it.cantidad ?? 0) * Number(it.precio_unitario ?? 0)
      map.set(p.id, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.cantidad - a.cantidad)
  }, [venta_items, ventasInBucket])

  const total = ventasInBucket.reduce((s, v) => s + Number(v.total ?? 0), 0)
  const piezasTotal = productosInBucket.reduce(
    (s, p) => s + p.cantidad,
    0,
  )

  if (!cliente) return null

  const periodLabel = bucket.key.includes("Q")
    ? `Trimestre ${bucket.label}`
    : monthLong.format(bucket.start)

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <header className="relative border-b border-gray-100 bg-gradient-to-br from-white via-white to-violet-50/50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full p-1.5 text-gray-400 hover:bg-white hover:text-gray-700"
          >
            <X className="size-4" />
          </button>
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-violet-700" />
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-violet-700">
              Detalle de periodo
            </span>
          </div>
          <h2 className="mt-1 text-xl font-bold text-gray-900">
            {cliente.nombre_negocio ?? cliente.nombre}
          </h2>
          <p className="text-xs text-gray-500">{periodLabel}</p>
          {/* Stats */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Total" value={mxn2.format(total)} accent="text-[#0F766E]" />
            <Stat
              label="Órdenes"
              value={`${ventasInBucket.length} venta${ventasInBucket.length === 1 ? "" : "s"}`}
              accent="text-emerald-700"
            />
            <Stat
              label="Productos"
              value={`${piezasTotal} pzs`}
              accent="text-teal-700"
            />
          </div>
        </header>

        <div className="max-h-[70vh] overflow-y-auto">
          {/* Ventas */}
          <SectionBlock
            title={`Ventas (${ventasInBucket.length})`}
            icon="🛒"
          >
            {ventasInBucket.length === 0 ? (
              <p className="text-xs italic text-gray-400">Sin ventas en este periodo.</p>
            ) : (
              <ul className="space-y-1">
                {ventasInBucket.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 bg-white p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/ventas/${v.id}`}
                        className="block truncate font-mono text-xs text-[#0F766E] hover:underline"
                      >
                        {v.numero}
                      </Link>
                      <div className="text-[10px] text-gray-500">
                        {fechaFmt.format(new Date(v.fecha))}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold tabular-nums text-gray-900">
                        {mxn2.format(Number(v.total ?? 0))}
                      </div>
                      <span className="text-[9.5px] text-gray-500">
                        {v.estatus}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionBlock>

          {/* Cotizaciones */}
          {cotsInBucket.length > 0 && (
            <SectionBlock
              title={`Cotizaciones (${cotsInBucket.length})`}
              icon="📄"
            >
              <ul className="space-y-1">
                {cotsInBucket.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 bg-white p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/cotizaciones/${c.id}`}
                        className="block truncate font-mono text-xs text-teal-700 hover:underline"
                      >
                        {c.numero}
                      </Link>
                      <div className="text-[10px] text-gray-500">
                        {fechaFmt.format(new Date(c.fecha))}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold tabular-nums text-gray-900">
                        {mxn2.format(Number(c.total ?? 0))}
                      </div>
                      <span className="text-[9.5px] text-gray-500">
                        {c.estatus}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionBlock>
          )}

          {/* Productos */}
          {productosInBucket.length > 0 && (
            <SectionBlock
              title={`Productos (${productosInBucket.length})`}
              icon="📦"
            >
              <ul className="space-y-1">
                {productosInBucket.slice(0, 12).map((p, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-gray-100 bg-white p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-gray-900">
                        {p.nombre}
                      </div>
                      {p.sku && (
                        <div className="font-mono text-[10px] text-gray-500">
                          {p.sku}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold tabular-nums text-[#0F766E]">
                        {p.cantidad} und
                      </div>
                      <div className="text-[10px] tabular-nums text-gray-500">
                        {mxn2.format(p.revenue)}
                      </div>
                    </div>
                  </li>
                ))}
                {productosInBucket.length > 12 && (
                  <li className="text-center text-[10px] italic text-gray-400">
                    + {productosInBucket.length - 12} productos más
                  </li>
                )}
              </ul>
            </SectionBlock>
          )}
        </div>

        {/* Footer action */}
        <footer className="border-t border-gray-100 bg-gray-50/50 px-6 py-3">
          <Link
            href={`/ventas?cliente=${clienteId}&desde=${bucket.start.toISOString().slice(0, 10)}&hasta=${bucket.end.toISOString().slice(0, 10)}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] hover:text-[#0F766E] hover:underline"
          >
            Ver en /ventas con filtros aplicados
            <ExternalLink className="size-3" />
          </Link>
        </footer>
      </div>
    </>
  )
}

function SectionBlock({
  title,
  icon,
  children,
}: {
  title: string
  icon: string
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-gray-100 px-6 py-4 last:border-b-0">
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        <span>{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: string
}) {
  return (
    <div className="rounded-lg bg-white/80 p-2 ring-1 ring-gray-200/60 backdrop-blur">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-bold tabular-nums ${accent}`}>
        {value}
      </div>
    </div>
  )
}

function AnalyticsCard({
  icon,
  label,
  value,
  sub,
  accent,
  gradient,
  ring,
  truncate,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  accent: string
  gradient: string
  ring: string
  truncate?: boolean
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
      <div
        className={`mt-2 text-base font-bold ${accent} ${truncate ? "truncate" : "tabular-nums"}`}
        title={truncate ? value : undefined}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-gray-600">{sub}</div>}
    </article>
  )
}

// Tooltip especializado para "Clientes activos por mes" — formato MXN
type ChartTooltipPayload = {
  dataKey?: string | number
  value?: number | string
  color?: string
  name?: string
}
function ActivosPorMesTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: ChartTooltipPayload[]
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-[200px] rounded-xl border border-gray-100 bg-white p-4 shadow-xl">
      <p className="mb-3 border-b border-gray-100 pb-2 font-semibold capitalize text-gray-800">
        {label}
      </p>
      {payload.map((p, i) => {
        const isClientes = p.dataKey === "clientes"
        const valNum = typeof p.value === "number" ? p.value : Number(p.value)
        const formatted = isClientes
          ? String(valNum)
          : valNum.toLocaleString("es-MX", {
              style: "currency",
              currency: "MXN",
              maximumFractionDigits: 0,
            })
        return (
          <div
            key={`${p.dataKey ?? i}`}
            className="mb-1.5 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: p.color ?? "#9ca3af" }}
              />
              <span className="text-sm text-gray-500">
                {isClientes ? "Clientes activos" : "Ingreso del mes"}
              </span>
            </div>
            <span className="font-bold tabular-nums text-gray-900">
              {formatted}
            </span>
          </div>
        )
      })}
    </div>
  )
}
