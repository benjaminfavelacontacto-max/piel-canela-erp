"use client"

import { useEffect } from "react"
import Link from "next/link"
import {
  X,
  Package,
  ShoppingBag,
  TrendingUp,
  DollarSign,
  Wallet,
  Layers,
  Truck,
  Pencil,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { ProductoEnriquecido, ProductoSales } from "./inventario-view"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const mxn2 = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "2-digit",
})
const monthShort = new Intl.DateTimeFormat("es-MX", {
  month: "short",
  year: "2-digit",
})

const categoriaBadge: Record<string, string> = {
  CINTAS: "bg-orange-100 text-orange-700",
  ACTIVADORES: "bg-teal-100 text-teal-700",
  POTENCIADORES: "bg-green-100 text-green-700",
  "EMULSIÓN REVELADORA": "bg-blue-100 text-blue-700",
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

export function ProductDrawer({
  producto,
  sales,
  onClose,
  onEdit,
}: {
  producto: ProductoEnriquecido | null
  sales: ProductoSales | undefined
  onClose: () => void
  onEdit: () => void
}) {
  // Esc cierra
  useEffect(() => {
    if (!producto) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    // Lock body scroll while drawer open
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [producto, onClose])

  if (!producto) return null

  const initials =
    producto.nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"

  const stockRatio =
    producto.stock_minimo > 0
      ? (producto.stock_actual / producto.stock_minimo) * 100
      : 100
  const stockBarColor =
    producto.estatus === "agotado"
      ? "bg-red-500"
      : producto.estatus === "bajo"
        ? "bg-amber-500"
        : "bg-teal-500"

  const monthlyData =
    sales?.monthly.map((m) => ({
      ...m,
      label: monthShort.format(new Date(m.mes + "-01")),
    })) ?? []
  const ventasList = sales?.ventas ?? []
  const totalUnidades = ventasList.reduce((s, v) => s + v.cantidad, 0)
  const totalRevenue = ventasList.reduce((s, v) => s + v.subtotal, 0)
  const ticketProm = ventasList.length > 0 ? totalRevenue / ventasList.length : 0

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        className="fixed inset-y-0 right-0 z-50 w-full max-w-[520px] overflow-y-auto bg-white shadow-2xl animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white/90 px-6 py-4 backdrop-blur">
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wide text-gray-400">
              Producto
            </p>
            <h2 className="text-base font-semibold text-gray-900 truncate">
              {producto.nombre}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Hero — image + key metadata */}
          <section className="flex items-start gap-4">
            {producto.imagen_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={producto.imagen_url}
                alt={producto.nombre}
                className="size-24 shrink-0 rounded-2xl border border-gray-100 object-cover shadow-sm"
              />
            ) : (
              <div className="flex size-24 shrink-0 items-center justify-center rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-gray-100 text-2xl font-bold text-gray-400">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${categoriaClass(producto.categoria)}`}
                >
                  {producto.categoria}
                </span>
                {producto.peso && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {producto.peso}
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    producto.estatus === "agotado"
                      ? "bg-red-100 text-red-700"
                      : producto.estatus === "bajo"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-teal-100 text-teal-700"
                  }`}
                >
                  {producto.estatus === "agotado"
                    ? "Agotado"
                    : producto.estatus === "bajo"
                      ? "Stock bajo"
                      : "Stock OK"}
                </span>
              </div>
              <p className="font-mono text-xs text-gray-500">{producto.sku}</p>
              {producto.proveedor && (
                <p className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Truck className="size-3" />
                  {producto.proveedor}
                </p>
              )}
            </div>
          </section>

          {/* Stats grid */}
          <section className="grid grid-cols-2 gap-3">
            <Stat
              icon={<Package className="size-4 text-teal-600" />}
              label="Stock actual"
              value={producto.stock_actual.toLocaleString("es-MX")}
              sub={`mín ${producto.stock_minimo.toLocaleString("es-MX")}`}
            >
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full ${stockBarColor} rounded-full transition-all duration-500`}
                  style={{ width: `${Math.min(100, stockRatio / 2)}%` }}
                />
              </div>
            </Stat>
            <Stat
              icon={<DollarSign className="size-4 text-blue-600" />}
              label="Precio público"
              value={
                producto.precio_publico != null
                  ? mxn2.format(producto.precio_publico)
                  : "—"
              }
              sub={
                producto.margen_pct != null
                  ? `${producto.margen_pct.toFixed(1)}% margen`
                  : "Sin costo conocido"
              }
            />
            <Stat
              icon={<Wallet className="size-4 text-emerald-600" />}
              label="Capital invertido"
              value={
                producto.capital_invertido != null
                  ? mxn.format(producto.capital_invertido)
                  : "—"
              }
              sub={
                producto.costo_unitario_prom != null
                  ? `${mxn2.format(producto.costo_unitario_prom)} costo unit.`
                  : "Sin ventas previas"
              }
            />
            <Stat
              icon={<Layers className="size-4 text-[#0F766E]" />}
              label="Valor inventario"
              value={
                producto.valor_inventario != null
                  ? mxn.format(producto.valor_inventario)
                  : "—"
              }
              sub="A precio público"
            />
          </section>

          {/* Sales chart */}
          {monthlyData.length > 0 && (
            <section>
              <header className="mb-2 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                    Rotación mensual
                  </h3>
                  <p className="text-[10px] text-gray-400">
                    Unidades vendidas por mes
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <TrendingUp className="size-3 text-teal-600" />
                  {totalUnidades} totales
                </div>
              </header>
              <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#EEF1F4" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#9CA3AF", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#9CA3AF", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: "#f3f4f6" }}
                      contentStyle={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                      formatter={(v, key) =>
                        key === "cantidad"
                          ? `${Number(v ?? 0)} u`
                          : mxn2.format(Number(v ?? 0))
                      }
                    />
                    <Bar
                      dataKey="cantidad"
                      fill="#0F766E"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* Sales history */}
          <section>
            <header className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                  Historial de ventas
                </h3>
                <p className="text-[10px] text-gray-400">
                  {ventasList.length} línea{ventasList.length === 1 ? "" : "s"}
                  {ventasList.length > 0
                    ? ` · ticket prom. ${mxn2.format(ticketProm)}`
                    : ""}
                </p>
              </div>
            </header>
            {ventasList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/40 px-4 py-6 text-center text-xs text-gray-400">
                Este producto no tiene ventas registradas.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#EEF1F4] bg-[#F9FAFB]">
                      <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-gray-500">
                        Venta
                      </th>
                      <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-gray-500">
                        Cliente
                      </th>
                      <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-gray-500">
                        Cant.
                      </th>
                      <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-gray-500">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ventasList.slice(0, 12).map((v, i) => (
                      <tr
                        key={`${v.venta_id}-${i}`}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-3 py-2">
                          <Link
                            href={`/ventas/${v.venta_id}`}
                            className="font-mono text-[#0F766E] hover:underline"
                            onClick={onClose}
                          >
                            {v.venta_numero}
                          </Link>
                          <div className="text-[10px] text-gray-400">
                            {fechaFmt.format(new Date(v.fecha))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-700 truncate max-w-[140px]">
                          {v.cliente ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                          {v.cantidad}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">
                          {mxn2.format(v.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {ventasList.length > 12 && (
                    <tfoot>
                      <tr className="bg-gray-50/40">
                        <td
                          colSpan={4}
                          className="px-3 py-1.5 text-center text-[10px] text-gray-400"
                        >
                          + {ventasList.length - 12} líneas más
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </section>

          {/* Quick actions (commit 3 hará algunos funcionales) */}
          <section className="grid grid-cols-2 gap-2">
            <Link
              href={`/cotizaciones/nueva`}
              onClick={onClose}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-medium text-gray-700 transition-all hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
            >
              <ShoppingBag className="size-3.5" />
              Crear cotización
            </Link>
            <button
              type="button"
              onClick={onEdit}
              title="Editar stock, precios y costos"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-medium text-gray-700 transition-all hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
            >
              <Pencil className="size-3.5" />
              Editar producto
            </button>
          </section>
        </div>
      </aside>
    </>
  )
}

function Stat({
  icon,
  label,
  value,
  sub,
  children,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wide text-gray-500">
          {label}
        </span>
      </div>
      <p className="mt-1 text-base font-bold tabular-nums text-gray-900">
        {value}
      </p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
      {children}
    </div>
  )
}
