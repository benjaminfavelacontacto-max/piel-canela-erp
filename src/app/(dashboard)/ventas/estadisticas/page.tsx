import Link from "next/link"
import { ArrowLeft, BarChart3, Package, Users } from "lucide-react"
import { getVentasStats } from "../actions"
import { MonthlyChart } from "./monthly-chart"

type Periodo = "mes" | "trimestre" | "year" | "todo"
const PERIODOS: { key: Periodo; label: string }[] = [
  { key: "mes", label: "Este mes" },
  { key: "trimestre", label: "Trimestre" },
  { key: "year", label: "Este año" },
  { key: "todo", label: "Todo" },
]

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function rangoFor(p: Periodo): { desde?: string; hasta?: string } {
  const today = new Date()
  if (p === "todo") return {}
  if (p === "mes") {
    return { desde: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)) }
  }
  if (p === "trimestre") {
    const q = Math.floor(today.getMonth() / 3)
    return { desde: isoDate(new Date(today.getFullYear(), q * 3, 1)) }
  }
  if (p === "year") {
    return { desde: isoDate(new Date(today.getFullYear(), 0, 1)) }
  }
  return {}
}

export default async function EstadisticasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  const { periodo } = await searchParams
  const activo: Periodo = (PERIODOS.find((p) => p.key === periodo)?.key ??
    "todo") as Periodo
  const filtros = rangoFor(activo)
  const stats = await getVentasStats(filtros)

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
              Top clientes, productos y tendencia mensual
            </p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          {PERIODOS.map((p) => (
            <Link
              key={p.key}
              href={`/ventas/estadisticas?periodo=${p.key}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activo === p.key
                  ? "bg-pink-600 text-white"
                  : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </header>

      {!stats && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las estadísticas.
        </div>
      )}

      {stats && (
        <>
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <header className="mb-3 flex items-center gap-2">
              <BarChart3 className="size-4 text-gray-500" />
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                Ventas por mes
              </h2>
            </header>
            <MonthlyChart data={stats.ventasPorMes} />
          </section>

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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <Th>Cliente</Th>
                    <Th align="right">Órdenes</Th>
                    <Th align="right">Total compras</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.topClientes.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-5 py-8 text-center text-sm text-gray-500"
                      >
                        Sin datos.
                      </td>
                    </tr>
                  ) : (
                    stats.topClientes.map((c, i) => (
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
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <Th>Producto</Th>
                    <Th align="right">Unidades</Th>
                    <Th align="right">Total generado</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.topProductos.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
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
