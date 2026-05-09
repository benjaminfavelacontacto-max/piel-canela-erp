"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ShoppingBag,
  TrendingUp,
  Users,
  Receipt,
  ChevronLeft,
  ChevronRight,
  FileText,
  BarChart3,
} from "lucide-react"
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export type Estatus = "pendiente" | "pagada_parcial" | "pagada_total" | "cancelada"

export type VentaRow = {
  id: string
  numero: string
  cotizacion_id: string | null
  cliente_id: string | null
  fecha: string
  total: number | null
  ganancia: number | null
  cantidad_pagada: number | null
  saldo_pendiente: number | null
  estatus: Estatus
  clientes: {
    id: string
    nombre: string
    nombre_negocio: string | null
  } | null
}

export type VentaSocioRow = {
  venta_id: string
  socio_id: string
  monto: number
  pagado: boolean
}

export type SocioInfo = {
  id: string
  nombre: string
  porcentaje: number
}

const PAGE_SIZE = 15

const SOCIO_COLORS: Record<string, string> = {
  Sandra: "#db2777",
  Benjamin: "#1b4332",
}
const FALLBACK_COLORS = ["#2563eb", "#ea580c", "#0891b2", "#7c3aed"]

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
const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})
const monthShort = new Intl.DateTimeFormat("es-MX", { month: "short" })
const monthLong = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" })

const estatusBadge: Record<Estatus, string> = {
  pagada_total: "bg-emerald-100 text-emerald-700",
  pagada_parcial: "bg-amber-100 text-amber-700",
  pendiente: "bg-red-100 text-red-700",
  cancelada: "bg-gray-100 text-gray-600",
}
const estatusLabel: Record<Estatus, string> = {
  pagada_total: "Pagada",
  pagada_parcial: "Parcial",
  pendiente: "Pendiente",
  cancelada: "Cancelada",
}

function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function buildLast12Months(today: Date) {
  const out: { key: string; date: Date; label: string }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const label = monthShort.format(d).replace(".", "")
    out.push({ key: ymKey(d), date: d, label: `${label[0].toUpperCase()}${label.slice(1)}` })
  }
  return out
}

export function VentasDashboard({
  ventas,
  venta_socios,
  socios,
  error,
}: {
  ventas: VentaRow[]
  venta_socios: VentaSocioRow[]
  socios: SocioInfo[]
  error: string | null
}) {
  const [from, setFrom] = useState<string>("")
  const [to, setTo] = useState<string>("")
  const [clienteFilter, setClienteFilter] = useState<string>("todos")
  const [estatusFilter, setEstatusFilter] = useState<"todos" | Estatus>("todos")
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [from, to, clienteFilter, estatusFilter])

  const sandraId = useMemo(
    () => socios.find((s) => /sandra/i.test(s.nombre))?.id,
    [socios],
  )
  const benjaminId = useMemo(
    () => socios.find((s) => /benjamin/i.test(s.nombre))?.id,
    [socios],
  )

  // ─── KPIs (global) ────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalVentas = ventas.reduce((s, v) => s + Number(v.total ?? 0), 0)
    const ganancia = ventas.reduce((s, v) => s + Number(v.ganancia ?? 0), 0)
    const ticket = ventas.length ? totalVentas / ventas.length : 0
    const margen = totalVentas > 0 ? (ganancia / totalVentas) * 100 : 0

    const tally = (id: string | undefined) =>
      id
        ? venta_socios
            .filter((vs) => vs.socio_id === id)
            .reduce((s, x) => s + Number(x.monto ?? 0), 0)
        : 0
    return {
      totalVentas,
      ganancia,
      ticket,
      margen,
      sandra: tally(sandraId),
      benjamin: tally(benjaminId),
    }
  }, [ventas, venta_socios, sandraId, benjaminId])

  // ─── Last 12 months series ────────────────────────────────────────
  const monthly = useMemo(() => {
    const today = new Date()
    const buckets = buildLast12Months(today)
    const map = new Map(buckets.map((b) => [b.key, { ...b, total: 0, ganancia: 0, count: 0 }]))
    for (const v of ventas) {
      if (v.estatus === "cancelada") continue
      const d = new Date(v.fecha)
      if (Number.isNaN(d.getTime())) continue
      const key = ymKey(d)
      const b = map.get(key)
      if (!b) continue
      b.total += Number(v.total ?? 0)
      b.ganancia += Number(v.ganancia ?? 0)
      b.count += 1
    }
    return Array.from(map.values())
  }, [ventas])

  // ─── Socios stats ─────────────────────────────────────────────────
  const sociosStats = useMemo(() => {
    const ventaById = new Map(ventas.map((v) => [v.id, v]))
    return socios.map((socio) => {
      const items = venta_socios.filter((vs) => vs.socio_id === socio.id)
      const vendido = items.reduce((s, x) => s + Number(x.monto ?? 0), 0)
      const cobrado = items
        .filter((x) => x.pagado)
        .reduce((s, x) => s + Number(x.monto ?? 0), 0)
      let ganancia = 0
      for (const it of items) {
        const v = ventaById.get(it.venta_id)
        if (!v || !v.total || Number(v.total) === 0) continue
        const share = Number(it.monto ?? 0) / Number(v.total)
        ganancia += share * Number(v.ganancia ?? 0)
      }
      return { socio, vendido, cobrado, ganancia }
    })
  }, [socios, venta_socios, ventas])

  const totalAsignado = sociosStats.reduce((s, x) => s + x.vendido, 0)

  // ─── Cliente options for the filter ───────────────────────────────
  const clienteOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const v of ventas) {
      if (v.cliente_id && !m.has(v.cliente_id)) {
        m.set(
          v.cliente_id,
          v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? v.cliente_id,
        )
      }
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "es"))
  }, [ventas])

  // ─── Filtered ventas for the table ────────────────────────────────
  const filtered = useMemo(() => {
    let list = ventas
    if (from) list = list.filter((v) => v.fecha >= from)
    if (to) list = list.filter((v) => v.fecha <= to)
    if (clienteFilter !== "todos") list = list.filter((v) => v.cliente_id === clienteFilter)
    if (estatusFilter !== "todos") list = list.filter((v) => v.estatus === estatusFilter)
    return list
  }, [ventas, from, to, clienteFilter, estatusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingBag className="size-7 text-amber-700" />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Ventas</h1>
            <p className="text-gray-500 text-sm mt-1">
              {ventas.length} ventas · {clienteOptions.length} clientes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/ventas/estadisticas"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <BarChart3 className="size-4" />
            Ver estadísticas →
          </Link>
          <Link
            href="/ventas/nueva"
            className="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-pink-700"
          >
            Nueva Venta
          </Link>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ─── KPI row ─── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={ShoppingBag}
          label="Total Ventas"
          value={mxn.format(kpis.totalVentas)}
          subtitle={`${ventas.length} órdenes`}
          tone="text-gray-900"
        />
        <Kpi
          icon={TrendingUp}
          label="Ganancia Neta"
          value={mxn.format(kpis.ganancia)}
          subtitle={`${kpis.margen.toFixed(1)}% margen`}
          tone="text-emerald-700"
        />
        <Kpi
          icon={Users}
          label="Sandra / Benjamin"
          value={`${mxn.format(kpis.sandra)} / ${mxn.format(kpis.benjamin)}`}
          subtitle="Asignado en venta_socios"
          tone="text-pink-700"
        />
        <Kpi
          icon={Receipt}
          label="Ticket promedio"
          value={mxn.format(kpis.ticket)}
          subtitle={`${ventas.length} ventas`}
          tone="text-blue-700"
        />
      </section>

      {/* ─── Chart + Socios panel ─── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
              Ventas mensuales (últimos 12 meses)
            </h2>
            <span className="text-xs text-gray-500">Total · Ganancia</span>
          </header>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart
              data={monthly}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tick={{ fill: "#6b7280", fontSize: 12 }}
                axisLine={{ stroke: "#e5e7eb" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 12 }}
                axisLine={{ stroke: "#e5e7eb" }}
                tickLine={false}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
                }
                width={60}
              />
              <Tooltip
                cursor={{ fill: "#f9fafb" }}
                contentStyle={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => mxn2.format(v)}
                labelFormatter={(l, p) => {
                  const item = p?.[0]?.payload
                  return item?.date ? monthLong.format(item.date) : l
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="total"
                name="Total vendido"
                fill="#1b4332"
                radius={[4, 4, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="ganancia"
                name="Ganancia"
                stroke="#db2777"
                strokeWidth={2}
                dot={{ r: 3, fill: "#db2777" }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <header className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
              Socios
            </h2>
            <span className="text-xs text-gray-500">{socios.length} activos</span>
          </header>

          <div className="space-y-3">
            {sociosStats.map(({ socio, vendido, cobrado, ganancia }, i) => {
              const pct =
                totalAsignado > 0 ? (vendido / totalAsignado) * 100 : 0
              const color =
                SOCIO_COLORS[socio.nombre] ??
                FALLBACK_COLORS[i % FALLBACK_COLORS.length]
              return (
                <div
                  key={socio.id}
                  className="rounded-lg border border-gray-100 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: color }}
                      />
                      <span className="text-sm font-semibold text-gray-900">
                        {socio.nombre}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {socio.porcentaje}% participación
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                    <Mini label="Vendido" value={mxn.format(vendido)} />
                    <Mini
                      label="Ganancia"
                      value={mxn.format(ganancia)}
                      valueClass="text-emerald-700"
                    />
                    <Mini
                      label="% del total"
                      value={`${pct.toFixed(1)}%`}
                    />
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: color,
                      }}
                    />
                  </div>
                  <div className="mt-1 text-[10px] text-gray-500">
                    Cobrado: {mxn.format(cobrado)} ·{" "}
                    {vendido > 0
                      ? `${((cobrado / vendido) * 100).toFixed(0)}%`
                      : "—"}
                  </div>
                </div>
              )
            })}
          </div>

          {totalAsignado > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">
                Distribución
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={sociosStats.map((s) => ({
                      name: s.socio.nombre,
                      value: s.vendido,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                    stroke="#ffffff"
                  >
                    {sociosStats.map((s, i) => (
                      <Cell
                        key={s.socio.id}
                        fill={
                          SOCIO_COLORS[s.socio.nombre] ??
                          FALLBACK_COLORS[i % FALLBACK_COLORS.length]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => mxn2.format(v)}
                    contentStyle={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* ─── Filters ─── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Desde">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            />
          </FilterField>
          <FilterField label="Hasta">
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            />
          </FilterField>
          <FilterField label="Cliente">
            <select
              value={clienteFilter}
              onChange={(e) => setClienteFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            >
              <option value="todos">Todos</option>
              {clienteOptions.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Estatus">
            <select
              value={estatusFilter}
              onChange={(e) =>
                setEstatusFilter(e.target.value as "todos" | Estatus)
              }
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            >
              <option value="todos">Todos</option>
              <option value="pagada_total">Pagadas</option>
              <option value="pagada_parcial">Parciales</option>
              <option value="pendiente">Pendientes</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </FilterField>
          <div className="ml-auto text-xs text-gray-500">
            {filtered.length} / {ventas.length} registros
          </div>
        </div>
      </section>

      {/* ─── Table ─── */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <Th>Número</Th>
                <Th>Cliente</Th>
                <Th>Fecha</Th>
                <Th align="right">Total</Th>
                <Th align="right">Ganancia</Th>
                <Th>Estatus</Th>
                <Th align="right">Cotización</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-12 text-center text-sm text-gray-500"
                  >
                    Sin resultados con esos filtros.
                  </td>
                </tr>
              ) : (
                pageRows.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs">
                      <Link
                        href={`/ventas/${v.id}`}
                        className="text-pink-700 hover:underline"
                      >
                        {v.numero}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-gray-900">
                      {v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {fechaFmt.format(new Date(v.fecha))}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">
                      {mxn2.format(Number(v.total ?? 0))}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-emerald-700">
                      {mxn2.format(Number(v.ganancia ?? 0))}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${estatusBadge[v.estatus]}`}
                      >
                        {estatusLabel[v.estatus]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {v.cotizacion_id ? (
                        <Link
                          href={`/cotizaciones/${v.cotizacion_id}`}
                          className="inline-flex items-center gap-1 text-xs text-pink-600 hover:underline"
                        >
                          <FileText className="size-3" />
                          Ver
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
            <span>
              Mostrando {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filtered.length)} de{" "}
              {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="size-3" />
                Anterior
              </button>
              <span className="px-2">
                Página <strong className="text-gray-900">{safePage}</strong> de{" "}
                {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage === totalPages}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Siguiente
                <ChevronRight className="size-3" />
              </button>
            </div>
          </div>
        )}
      </section>
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

function FilterField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </span>
      {children}
    </label>
  )
}

function Mini({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="rounded-md bg-gray-50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div
        className={`mt-0.5 text-xs font-semibold tabular-nums ${valueClass ?? "text-gray-900"}`}
      >
        {value}
      </div>
    </div>
  )
}
