import Link from "next/link"
import {
  Sparkles,
  Users,
  Package,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Receipt,
  ShoppingCart,
} from "lucide-react"
import { getVentasStats } from "../actions"
import type { ProductoStats } from "../actions"
import { createClient } from "@/lib/supabase/server"
import { MonthlyChart } from "./monthly-chart"
import { PeriodoTabs } from "./periodo-tabs"
import { ClientesTable } from "./clientes-table"
import { AnimatedNumber } from "./animated-number"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const monthLong = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
})

const categoriaBadge: Record<string, string> = {
  CINTAS: "bg-orange-100 text-orange-700",
  ACTIVADORES: "bg-teal-100 text-teal-700",
  POTENCIADORES: "bg-green-100 text-green-700",
  "EMULSIÓN REVELADORA": "bg-blue-100 text-blue-700",
  OXIGENANTES: "bg-blue-100 text-blue-700",
  AEROGRAFÍA: "bg-purple-100 text-purple-700",
  "ACEITE CORPORAL": "bg-amber-100 text-amber-700",
  "POLVO DE BLANQUEAR": "bg-[#DFF7F4] text-[#0F766E]",
  HUMECTANTES: "bg-cyan-100 text-cyan-700",
  EXFOLIANTS: "bg-indigo-100 text-indigo-700",
  "DYE COLOR": "bg-fuchsia-100 text-fuchsia-700",
  SHAMPOO: "bg-sky-100 text-sky-700",
  SOMBRILLA: "bg-slate-100 text-slate-700",
}
function categoriaClass(c: string): string {
  return categoriaBadge[c.toUpperCase()] ?? "bg-gray-100 text-gray-600"
}

function diasDesde(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

function pctChange(now: number, prev: number): number {
  if (prev === 0) return now > 0 ? 100 : 0
  return ((now - prev) / prev) * 100
}

function periodAnterior(
  desde?: string,
  hasta?: string,
): { desde: string; hasta: string } | null {
  if (!desde || !hasta) return null
  const d = new Date(desde)
  const h = new Date(hasta)
  const days = Math.max(
    1,
    Math.floor((h.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)) + 1,
  )
  const prevHasta = new Date(d)
  prevHasta.setDate(prevHasta.getDate() - 1)
  const prevDesde = new Date(prevHasta)
  prevDesde.setDate(prevDesde.getDate() - days + 1)
  return {
    desde: prevDesde.toISOString().slice(0, 10),
    hasta: prevHasta.toISOString().slice(0, 10),
  }
}

export default async function EstadisticasPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const { desde, hasta } = await searchParams
  const stats = await getVentasStats({ desde, hasta })

  // Periodo anterior — para % vs anterior. Solo si hay rango definido.
  const ant = periodAnterior(desde, hasta)
  let prevTotal = 0
  let prevGanancia = 0
  let prevOrdenes = 0
  if (ant) {
    const supabase = await createClient()
    const { data } = await supabase
      .from("ventas")
      .select("total, ganancia, cliente_id, clientes!left(is_internal)")
      .gte("fecha", ant.desde)
      .lte("fecha", ant.hasta)
    for (const v of data ?? []) {
      // Excluir ventas internas (Piel Canela)
      const cli = v.clientes as { is_internal?: boolean } | null
      if (cli?.is_internal === true) continue
      prevTotal += Number(v.total ?? 0)
      prevGanancia += Number(v.ganancia ?? 0)
      prevOrdenes += 1
    }
  }

  // ─── IVA recaudado en el periodo (real cobrado, NO referencial) ──
  let ventasConIva = 0
  let ventasSinIva = 0
  let ivaRecaudado = 0
  {
    const supabase = await createClient()
    let q = supabase
      .from("ventas")
      .select("iva, cliente_id, clientes!left(is_internal)")
    if (desde) q = q.gte("fecha", desde)
    if (hasta) q = q.lte("fecha", hasta)
    const { data } = await q
    for (const v of data ?? []) {
      const cli = v.clientes as { is_internal?: boolean } | null
      if (cli?.is_internal === true) continue
      const ivaVal = Number(v.iva ?? 0)
      if (ivaVal > 0) {
        ventasConIva += 1
        ivaRecaudado += ivaVal
      } else {
        ventasSinIva += 1
      }
    }
  }

  const margen =
    stats && stats.totalVentas > 0
      ? ((stats.totalVentas - prevGanancia) /* placeholder */, 0) // unused
      : 0
  void margen

  // ─── Insights ────────────────────────────────────────────────────
  type Insight = { emoji: string; texto: string }
  const insights: Insight[] = []
  if (stats) {
    const topCli = stats.topClientes[0]
    if (topCli) {
      insights.push({
        emoji: "🏆",
        texto: `Mejor cliente: ${topCli.nombre} con ${mxn.format(topCli.totalCompras)}`,
      })
    }
    const topProd = stats.topProductos[0]
    if (topProd) {
      insights.push({
        emoji: "⭐",
        texto: `Producto estrella: ${topProd.nombre} (${topProd.cantidadVendida.toLocaleString("es-MX")} unidades)`,
      })
    }
    const arr = stats.ventasPorMes
    if (arr.length >= 2) {
      const ult = arr[arr.length - 1]
      const ante = arr[arr.length - 2]
      if (ante.total > 0) {
        const pct = ((ult.total - ante.total) / ante.total) * 100
        insights.push({
          emoji: pct >= 0 ? "📈" : "📉",
          texto: `Ventas ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs mes anterior`,
        })
      }
    }
    const margenPeriodo =
      stats.totalVentas > 0
        ? (stats.ventasPorMes.reduce((s, m) => s + m.ganancia, 0) /
            stats.totalVentas) *
          100
        : 0
    insights.push({
      emoji: "💎",
      texto: `Margen neto del periodo: ${margenPeriodo.toFixed(1)}%`,
    })
    const masRecurrente = [...stats.topClientes].sort(
      (a, b) => b.numOrdenes - a.numOrdenes,
    )[0]
    if (masRecurrente) {
      insights.push({
        emoji: "🔁",
        texto: `Cliente más recurrente: ${masRecurrente.nombre} (${masRecurrente.numOrdenes} órdenes)`,
      })
    }
    const enRiesgo = stats.topClientes
      .filter((c) => diasDesde(c.ultimaCompra) > 60)
      .sort((a, b) => b.numOrdenes - a.numOrdenes)[0]
    insights.push({
      emoji: enRiesgo ? "⚠️" : "✅",
      texto: enRiesgo
        ? `${enRiesgo.nombre} sin comprar hace +${diasDesde(enRiesgo.ultimaCompra)} días`
        : "Todos los clientes activos",
    })
  }

  // Insight de IVA real recaudado
  if (ventasConIva + ventasSinIva > 0) {
    const mxn0 = new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    })
    insights.push({
      emoji: "🧾",
      texto: `${ventasConIva} ventas con IVA · ${ventasSinIva} sin IVA · IVA recaudado real: ${mxn0.format(ivaRecaudado)}`,
    })
  }

  // KPI numbers
  const totalVentas = stats?.totalVentas ?? 0
  const gananciaPeriodo = stats?.ventasPorMes.reduce((s, m) => s + m.ganancia, 0) ?? 0
  const totalOrdenes = stats?.totalOrdenes ?? 0
  const ticket = stats?.ticketPromedioGlobal ?? 0
  const margenPct = totalVentas > 0 ? (gananciaPeriodo / totalVentas) * 100 : 0

  // % vs anterior (solo si periodo definido)
  const cambioVentas = ant ? pctChange(totalVentas, prevTotal) : null
  const cambioOrdenes = ant ? pctChange(totalOrdenes, prevOrdenes) : null
  const ticketPrev = ant && prevOrdenes > 0 ? prevTotal / prevOrdenes : 0
  const cambioTicket = ant ? pctChange(ticket, ticketPrev) : null
  const cambioGanancia = ant ? pctChange(gananciaPeriodo, prevGanancia) : null

  return (
    <div className="p-4 space-y-8">
      {/* ─── Header ─── */}
      <div className="animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="mb-2 flex items-center gap-3 text-sm">
          <Link
            href="/ventas"
            className="text-gray-400 transition-colors hover:text-gray-600"
          >
            ← Ventas
          </Link>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-gray-700">Estadísticas</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Centro de Análisis
            </h1>
            <p className="mt-1 text-gray-500">
              Métricas financieras en tiempo real
            </p>
          </div>
          <PeriodoTabs />
        </div>
      </div>

      {!stats && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las estadísticas.
        </div>
      )}

      {stats && (
        <>
          {/* ─── KPI cards (4) ─── */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <Kpi
              icon={<TrendingUp className="size-5 text-teal-600" />}
              iconBg="bg-teal-50 group-hover:bg-teal-100"
              label="Total vendido"
              value={
                <AnimatedNumber
                  value={totalVentas}
                  prefix="$"
                />
              }
              sub={
                ant
                  ? `vs ${mxn.format(prevTotal)} periodo anterior`
                  : "Todo el histórico"
              }
              change={cambioVentas}
            />
            <Kpi
              icon={<Sparkles className="size-5 text-emerald-600" />}
              iconBg="bg-emerald-50 group-hover:bg-emerald-100"
              label="Ganancia neta"
              value={
                <AnimatedNumber
                  value={gananciaPeriodo}
                  prefix="$"
                />
              }
              sub={`${margenPct.toFixed(1)}% margen`}
              change={cambioGanancia}
            />
            <Kpi
              icon={<ShoppingCart className="size-5 text-[#0F766E]" />}
              iconBg="bg-[#F9FAFB] group-hover:bg-[#DFF7F4]"
              label="Órdenes"
              value={<AnimatedNumber value={totalOrdenes} />}
              sub={
                ant
                  ? `vs ${prevOrdenes} órdenes`
                  : `${(totalOrdenes / Math.max(1, stats.ventasPorMes.length / 4 || 1)).toFixed(1)} prom. semanal`
              }
              change={cambioOrdenes}
            />
            <Kpi
              icon={<Receipt className="size-5 text-blue-600" />}
              iconBg="bg-blue-50 group-hover:bg-blue-100"
              label="Ticket promedio"
              value={
                <AnimatedNumber
                  value={ticket}
                  prefix="$"
                />
              }
              sub={
                ant
                  ? `vs ${mxn.format(ticketPrev)} anterior`
                  : "Promedio histórico"
              }
              change={cambioTicket}
            />
          </section>

          {/* ─── Insights premium ─── */}
          {insights.length > 0 && (
            <section className="rounded-2xl bg-gradient-to-br from-teal-600 via-teal-700 to-emerald-700 p-6 text-white shadow-lg animate-in fade-in slide-in-from-bottom-3 duration-500">
              <div className="mb-5 flex items-center gap-2">
                <div className="rounded-xl bg-white/10 p-2 backdrop-blur-sm">
                  <Sparkles className="size-5" />
                </div>
                <h2 className="text-lg font-semibold">Insights automáticos</h2>
                <span className="ml-auto rounded-full bg-white/20 px-3 py-1 text-xs">
                  Actualizado ahora
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {insights.map((it, i) => (
                  <div
                    key={i}
                    className="cursor-default rounded-xl bg-white/10 p-3.5 backdrop-blur-sm transition-colors hover:bg-white/20"
                  >
                    <p className="text-sm leading-relaxed">
                      <span className="mr-1.5">{it.emoji}</span>
                      {it.texto}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ─── Chart + Top Clientes (3/5 + 2/5) ─── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:shadow-md lg:col-span-3">
              <header className="mb-4 flex items-center gap-2">
                <BarChart3 className="size-4 text-teal-600" />
                <h3 className="font-semibold text-gray-900">
                  Ventas por mes
                </h3>
                <span className="ml-auto text-xs text-gray-400">
                  {stats.mejorMes
                    ? `Mejor mes ${monthLong.format(new Date(stats.mejorMes.mes + "-01"))}`
                    : ""}
                </span>
              </header>
              <MonthlyChart data={stats.ventasPorMes} />
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden lg:col-span-2">
              <header className="border-b border-gray-50 p-5">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Users className="size-4 text-teal-600" />
                  Top Clientes
                </h3>
              </header>
              <ClientesTable data={stats.topClientes} />
            </section>
          </div>

          {/* ─── Top Productos (2-col card grid) ─── */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Package className="size-4 text-teal-600" />
              <h3 className="font-semibold text-gray-900">Top productos</h3>
              <span className="text-xs text-gray-400">
                {stats.topProductos.length} productos
              </span>
            </div>
            {stats.topProductos.length === 0 ? (
              <div className="rounded-2xl border border-gray-100 bg-white p-4 text-center text-sm text-gray-400">
                Sin datos.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {stats.topProductos.map((p: ProductoStats, i) => (
                  <div
                    key={`${p.sku}-${i}`}
                    className="group rounded-xl border border-gray-100 bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gray-100 to-gray-50 text-sm font-bold text-gray-400">
                          #{i + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {p.nombre}
                          </p>
                          <p className="font-mono text-xs text-gray-400">
                            {p.sku || "—"}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-lg px-2 py-1 text-xs font-medium ${categoriaClass(p.categoria)}`}
                      >
                        {p.categoria}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-gray-50 p-2.5">
                        <p className="text-xs text-gray-400">Unidades</p>
                        <p className="font-bold text-gray-900">
                          {p.cantidadVendida.toLocaleString("es-MX")}
                        </p>
                      </div>
                      <div className="rounded-lg bg-teal-50 p-2.5">
                        <p className="text-xs text-teal-600">Generado</p>
                        <p className="font-bold text-teal-700">
                          {mxn.format(p.totalGenerado)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Kpi({
  icon,
  iconBg,
  label,
  value,
  sub,
  change,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: React.ReactNode
  sub?: string
  change?: number | null
}) {
  return (
    <div className="group rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <div className={`rounded-xl p-2.5 transition-colors ${iconBg}`}>
          {icon}
        </div>
        {change !== undefined && change !== null && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
              change >= 0
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {change >= 0 ? (
              <TrendingUp className="size-3" />
            ) : (
              <TrendingDown className="size-3" />
            )}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="mb-1 text-3xl font-bold tabular-nums text-gray-900">
        {value}
      </p>
      <p className="text-sm text-gray-500">{label}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}
