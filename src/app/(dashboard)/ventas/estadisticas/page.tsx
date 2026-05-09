import Link from "next/link"
import {
  ArrowLeft,
  BarChart3,
  Package,
  Users,
  Receipt,
  TrendingUp,
} from "lucide-react"
import { getVentasStats } from "../actions"
import { MonthlyChart } from "./monthly-chart"
import { PeriodoTabs } from "./periodo-tabs"

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
const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})
const monthLong = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
})

function frecuenciaLabel(n: number): {
  label: string
  className: string
} {
  if (n >= 4)
    return { label: "Alta", className: "bg-teal-100 text-teal-700" }
  if (n >= 2)
    return { label: "Media", className: "bg-amber-100 text-amber-700" }
  return { label: "Nueva", className: "bg-gray-100 text-gray-600" }
}

export default async function EstadisticasPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const { desde, hasta } = await searchParams
  const stats = await getVentasStats({ desde, hasta })

  return (
    <div className="p-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
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
          {/* KPIs del periodo */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Kpi
              icon={Users}
              label="Clientes únicos"
              value={stats.clientesUnicos.toLocaleString("es-MX")}
              subtitle={`${stats.totalOrdenes} órdenes`}
              tone="text-pink-700"
            />
            <Kpi
              icon={Receipt}
              label="Ticket promedio global"
              value={mxn0.format(stats.ticketPromedioGlobal)}
              subtitle={`Total ${mxn0.format(stats.totalVentas)}`}
              tone="text-blue-700"
            />
            <Kpi
              icon={TrendingUp}
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

          {/* Chart */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <header className="mb-3 flex items-center gap-2">
              <BarChart3 className="size-4 text-gray-500" />
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                Ventas por mes
              </h2>
            </header>
            <MonthlyChart data={stats.ventasPorMes} />
          </section>

          {/* Top clientes + Top productos */}
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <Th>Cliente</Th>
                      <Th align="right">Órdenes</Th>
                      <Th align="right">Total</Th>
                      <Th align="right">Ticket prom.</Th>
                      <Th align="right">Última</Th>
                      <Th>Frecuencia</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.topClientes.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-5 py-8 text-center text-sm text-gray-500"
                        >
                          Sin datos.
                        </td>
                      </tr>
                    ) : (
                      stats.topClientes.map((c, i) => {
                        const f = frecuenciaLabel(c.numOrdenes)
                        return (
                          <tr key={`${c.nombre}-${i}`} className="hover:bg-gray-50">
                            <td className="px-5 py-3 text-gray-900">
                              <span className="text-xs text-gray-400 mr-2">
                                #{i + 1}
                              </span>
                              {c.nombre}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums text-gray-500">
                              {c.numOrdenes}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">
                              {mxn.format(c.totalCompras)}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums text-gray-700">
                              {mxn.format(c.ticketPromedio)}
                            </td>
                            <td className="px-5 py-3 text-right text-xs text-gray-500">
                              {fechaFmt.format(new Date(c.ultimaCompra))}
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${f.className}`}
                              >
                                {f.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
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
                      <Th align="right">Unidades</Th>
                      <Th align="right">Total generado</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.topProductos.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-5 py-8 text-center text-sm text-gray-500"
                        >
                          Sin datos.
                        </td>
                      </tr>
                    ) : (
                      stats.topProductos.map((p, i) => (
                        <tr key={`${p.nombre}-${i}`} className="hover:bg-gray-50">
                          <td className="px-5 py-3 text-gray-900">
                            <span className="text-xs text-gray-400 mr-2">
                              #{i + 1}
                            </span>
                            {p.nombre}
                          </td>
                          <td className="px-5 py-3 font-mono text-xs text-gray-500">
                            {p.sku || "—"}
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

function Kpi({
  icon: Icon,
  label,
  value,
  subtitle,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  subtitle?: string
  tone: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </span>
        <Icon className={`size-4 ${tone}`} />
      </div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>
        {value}
      </div>
      {subtitle && (
        <div className="mt-1 text-xs text-gray-500">{subtitle}</div>
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
