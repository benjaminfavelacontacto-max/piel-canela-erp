import Link from "next/link"
import {
  ArrowLeft,
  BarChart3,
  Package,
  Users,
  Receipt,
  TrendingUp,
  Lightbulb,
} from "lucide-react"
import { getVentasStats } from "../actions"
import type { ClienteStats, ProductoStats } from "../actions"
import { MonthlyChart } from "./monthly-chart"
import { PeriodoTabs } from "./periodo-tabs"
import { AnimatedKpi, StaticKpi } from "./animated-kpi"
import { ClientesTable } from "./clientes-table"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const mxn0 = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
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
  "POLVO DE BLANQUEAR": "bg-pink-100 text-pink-700",
  HUMECTANTES: "bg-cyan-100 text-cyan-700",
  EXFOLIANTS: "bg-indigo-100 text-indigo-700",
  "DYE COLOR": "bg-fuchsia-100 text-fuchsia-700",
  SHAMPOO: "bg-sky-100 text-sky-700",
  SOMBRILLA: "bg-slate-100 text-slate-700",
}
function categoriaClass(c: string): string {
  return categoriaBadge[c.toUpperCase()] ?? "bg-gray-100 text-gray-600"
}

type Insight = {
  emoji: string
  title: string
  detail: string
  borderColor: string
}

function diasDesde(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

function buildInsights(stats: NonNullable<Awaited<ReturnType<typeof getVentasStats>>>): Insight[] {
  const out: Insight[] = []

  // a) Cliente en riesgo: mayor número de órdenes históricas + sin compra >60 días
  const riesgoCandidatos = stats.topClientes
    .filter((c) => diasDesde(c.ultimaCompra) > 60)
    .sort((a, b) => b.numOrdenes - a.numOrdenes)
  if (riesgoCandidatos.length > 0) {
    const c = riesgoCandidatos[0]
    out.push({
      emoji: "⚠️",
      title: `${c.nombre} en riesgo`,
      detail: `Tiene ${c.numOrdenes} órdenes pero no compra hace ${diasDesde(c.ultimaCompra)} días`,
      borderColor: "border-amber-400",
    })
  }

  // b) Mejor mes
  if (stats.mejorMes) {
    out.push({
      emoji: "🏆",
      title: `Mejor mes: ${monthLong.format(new Date(stats.mejorMes.mes + "-01"))}`,
      detail: `Vendiste ${mxn0.format(stats.mejorMes.total)}`,
      borderColor: "border-emerald-400",
    })
  }

  // c) Producto estrella
  if (stats.topProductos.length > 0) {
    const p = stats.topProductos[0]
    out.push({
      emoji: "⭐",
      title: `${p.nombre} es tu producto estrella`,
      detail: `${p.cantidadVendida.toLocaleString("es-MX")} unidades vendidas (${p.categoria})`,
      borderColor: "border-teal-400",
    })
  }

  // d) Tendencia: comparar mes actual vs anterior
  const arr = stats.ventasPorMes
  if (arr.length >= 2) {
    const ult = arr[arr.length - 1]
    const ant = arr[arr.length - 2]
    if (ant.total > 0) {
      const pct = ((ult.total - ant.total) / ant.total) * 100
      const up = pct >= 0
      out.push({
        emoji: up ? "📈" : "📉",
        title: `Tendencia ${up ? "+" : ""}${pct.toFixed(1)}% vs mes anterior`,
        detail: `${mxn0.format(ult.total)} vs ${mxn0.format(ant.total)}`,
        borderColor: up ? "border-emerald-400" : "border-red-400",
      })
    }
  }

  // e) Cliente más valioso
  if (stats.topClientes.length > 0) {
    const c = stats.topClientes[0]
    out.push({
      emoji: "💎",
      title: `${c.nombre} es tu cliente más valioso`,
      detail: `Total acumulado ${mxn0.format(c.totalCompras)} en ${c.numOrdenes} órdenes`,
      borderColor: "border-purple-400",
    })
  }

  return out
}

export default async function EstadisticasPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const { desde, hasta } = await searchParams
  const stats = await getVentasStats({ desde, hasta })
  const insights = stats ? buildInsights(stats) : []

  return (
    <div className="p-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-center gap-3">
          <Link
            href="/ventas"
            className="text-gray-400 hover:text-gray-600"
            aria-label="Volver a Ventas"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Estadísticas de Ventas
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              KPIs, top clientes, top productos y tendencia mensual
            </p>
          </div>
        </div>
        <PeriodoTabs />
      </header>

      {!stats && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las estadísticas.
        </div>
      )}

      {stats && (
        <>
          {/* ─── Insights ─── */}
          {insights.length > 0 && (
            <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <header className="flex items-center gap-2">
                <Lightbulb className="size-4 text-amber-500" />
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                  Insights
                </h2>
              </header>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {insights.map((it, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 rounded-xl border-l-4 ${it.borderColor} bg-white p-4 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md cursor-default`}
                  >
                    <span className="text-2xl select-none">{it.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900">
                        {it.title}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {it.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ─── KPIs animados ─── */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <AnimatedKpi
              icon={<Users className="size-4 text-pink-700" />}
              label="Clientes únicos"
              value={stats.clientesUnicos}
              formatStyle="integer"
              subtitle={`${stats.totalOrdenes} órdenes`}
              tone="text-pink-700"
            />
            <AnimatedKpi
              icon={<Receipt className="size-4 text-blue-700" />}
              label="Ticket promedio global"
              value={stats.ticketPromedioGlobal}
              formatStyle="currency"
              subtitle={`Total ${mxn0.format(stats.totalVentas)}`}
              tone="text-blue-700"
            />
            <StaticKpi
              icon={<TrendingUp className="size-4 text-emerald-700" />}
              label="Mejor mes"
              value={
                stats.mejorMes
                  ? monthLong.format(new Date(stats.mejorMes.mes + "-01"))
                  : "—"
              }
              subtitle={
                stats.mejorMes ? mxn0.format(stats.mejorMes.total) : "Sin datos"
              }
              tone="text-emerald-700"
            />
          </section>

          {/* ─── Chart ─── */}
          <section className="rounded-xl border border-gray-200 bg-white p-5 transition-all duration-300 hover:shadow-md">
            <header className="mb-3 flex items-center gap-2">
              <BarChart3 className="size-4 text-gray-500" />
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                Ventas por mes
              </h2>
            </header>
            <MonthlyChart data={stats.ventasPorMes} />
          </section>

          {/* ─── Top clientes + Top productos ─── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-gray-200 bg-white">
              <header className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
                <Users className="size-4 text-gray-500" />
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                  Top clientes
                </h2>
                <span className="ml-auto text-xs text-gray-500">
                  {stats.topClientes.length}
                </span>
              </header>
              <ClientesTable data={stats.topClientes as ClienteStats[]} />
            </section>

            <section className="rounded-xl border border-gray-200 bg-white">
              <header className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
                <Package className="size-4 text-gray-500" />
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                  Top productos
                </h2>
                <span className="ml-auto text-xs text-gray-500">
                  {stats.topProductos.length}
                </span>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <Th>Producto</Th>
                      <Th>SKU</Th>
                      <Th>Categoría</Th>
                      <Th align="right">Unidades</Th>
                      <Th align="right">Total generado</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.topProductos.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-5 py-8 text-center text-sm text-gray-500"
                        >
                          Sin datos.
                        </td>
                      </tr>
                    ) : (
                      stats.topProductos.map((p: ProductoStats, i) => (
                        <tr
                          key={`${p.sku}-${i}`}
                          className="cursor-default transition-colors duration-150 hover:bg-teal-50"
                        >
                          <td className="px-5 py-3 text-gray-900">
                            <span className="text-xs text-gray-400 mr-2">
                              #{i + 1}
                            </span>
                            {p.nombre}
                          </td>
                          <td className="px-5 py-3 font-mono text-xs text-gray-500">
                            {p.sku || "—"}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${categoriaClass(p.categoria)}`}
                            >
                              {p.categoria}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums text-gray-500">
                            {p.cantidadVendida.toLocaleString("es-MX")}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">
                            {mxn.format(p.totalGenerado)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode
  align?: "left" | "right" | "center"
}) {
  return (
    <th
      className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-gray-500"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  )
}
