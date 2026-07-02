"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { BarChart3, Sparkles } from "lucide-react"
import { VentasTablePremium, type EnrichedVenta } from "./ventas-table-premium"
import { VentasPorTipo, type TipoData } from "./ventas-por-tipo"
import { VentaDrawer } from "./venta-drawer"
import { ExportVentasButton } from "./export-ventas-button"
import { PageHeader } from "@/components/page-header"
import { formatMXN, formatMXN2 } from "@/lib/utils"
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
  subtotal: number | null
  descuento: number | null
  total: number | null
  iva: number | null
  costo_productos: number | null
  costo_envio: number | null
  ganancia: number | null
  utilidad_neta: number | null
  cantidad_pagada: number | null
  saldo_pendiente: number | null
  estatus: Estatus
  notas: string | null
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

export type VentaItemRow = {
  venta_id: string
  cantidad: number
  precio_unitario: number
  costo_unitario: number | null
  subtotal: number
  productos: {
    id: string
    sku: string | null
    nombre: string
    peso: string | null
    imagen_url: string | null
  } | null
}

export type VistaStockRow = {
  sku: string | null
  stock_actual: number | null
  stock_minimo: number | null
  estatus: string
}

// Hardcoded para no depender de RLS sobre `socios`
const SANDRA_ID = "4f21084b-dfe9-45f3-be80-935dc1a5e7a5"
const BENJAMIN_ID = "3165fe33-c760-4373-84d0-e1cd14d863b3"

// Paleta enterprise: accent emerald + neutro. Diferencia por label, no por color saturado.
const SOCIO_COLORS: Record<string, string> = {
  Sandra: "#0F766E",
  Benjamin: "#94A3B8",
}
const FALLBACK_COLORS = ["#0F766E", "#94A3B8", "#CBD5E1", "#6B7280"]

const monthShort = new Intl.DateTimeFormat("es-MX", { month: "short" })
const monthLong = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" })

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
  venta_items,
  stock,
  inversionesPorSocio,
  tiposData,
  error,
}: {
  ventas: VentaRow[]
  venta_socios: VentaSocioRow[]
  socios: SocioInfo[]
  venta_items: VentaItemRow[]
  stock: VistaStockRow[]
  inversionesPorSocio: Record<string, number>
  tiposData?: TipoData[]
  error: string | null
}) {
  const [from, setFrom] = useState<string>("")
  const [to, setTo] = useState<string>("")
  const [clienteFilter, setClienteFilter] = useState<string>("todos")
  const [periodo, setPeriodo] = useState<"3M" | "6M" | "1A" | "TODO">("1A")
  const [estatusFilter, setEstatusFilter] = useState<"todos" | Estatus>("todos")
  const [socioFilter, setSocioFilter] = useState<"todos" | "sandra" | "benjamin" | "ambos">("todos")
  const [productoFilter, setProductoFilter] = useState<string>("todos")
  const [ivaFilter, setIvaFilter] = useState<"todos" | "con" | "sin">("todos")
  const [drawerVenta, setDrawerVenta] = useState<EnrichedVenta | null>(null)
  const stockBySku = useMemo(() => {
    const m = new Map<string, VistaStockRow>()
    for (const s of stock) if (s.sku) m.set(s.sku, s)
    return m
  }, [stock])

  // ─── KPIs (global, hardcoded socio IDs) ───────────────────────────
  const kpis = useMemo(() => {
    const activos = ventas.filter((v) => v.estatus !== "cancelada")
    const totalVentas = activos.reduce((s, v) => s + Number(v.total ?? 0), 0)
    // Ganancia bruta = Σ(subtotal − costo_productos) — fórmula Sheet computada en JS
    // BD.ganancia es GENERATED con fórmula distinta (= utilidad_neta) por eso no la usamos.
    const ganancia = activos.reduce(
      (s, v) =>
        s + (Number(v.subtotal ?? 0) - Number(v.costo_productos ?? 0)),
      0,
    )
    const utilidadNeta = activos.reduce(
      (s, v) => s + Number(v.utilidad_neta ?? 0),
      0,
    )
    const totalCostoEnvio = activos.reduce(
      (s, v) => s + Number(v.costo_envio ?? 0),
      0,
    )
    const totalDescuento = activos.reduce(
      (s, v) => s + Number(v.descuento ?? 0),
      0,
    )
    const ticket = activos.length ? totalVentas / activos.length : 0
    const margen = totalVentas > 0 ? (ganancia / totalVentas) * 100 : 0
    const margenNeto =
      totalVentas > 0 ? (utilidadNeta / totalVentas) * 100 : 0
    const cobrado = activos.reduce(
      (s, v) => s + Number(v.cantidad_pagada ?? 0),
      0,
    )
    const saldo = activos.reduce(
      (s, v) => s + Number(v.saldo_pendiente ?? 0),
      0,
    )
    const pctCobrado = totalVentas > 0 ? (cobrado / totalVentas) * 100 : 0
    const pendientes = activos.filter(
      (v) => Number(v.saldo_pendiente ?? 0) > 0,
    ).length
    const sinIVA = activos.filter((v) => Number(v.iva ?? 0) === 0).length
    const sinIVAMonto = activos
      .filter((v) => Number(v.iva ?? 0) === 0)
      .reduce((s, v) => s + Number(v.total ?? 0), 0)

    const tally = (id: string) =>
      venta_socios
        .filter((vs) => vs.socio_id === id)
        .reduce((s, x) => s + Number(x.monto ?? 0), 0)

    const sandra = tally(SANDRA_ID)
    const benjamin = tally(BENJAMIN_ID)

    // Mejor cliente
    const byCliente = new Map<string, { id: string; nombre: string; monto: number; n: number }>()
    for (const v of activos) {
      if (!v.cliente_id) continue
      const nombre = v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? "—"
      const cur = byCliente.get(v.cliente_id) ?? {
        id: v.cliente_id,
        nombre,
        monto: 0,
        n: 0,
      }
      cur.monto += Number(v.total ?? 0)
      cur.n += 1
      byCliente.set(v.cliente_id, cur)
    }
    const mejorCliente = Array.from(byCliente.values()).sort(
      (a, b) => b.monto - a.monto,
    )[0]

    // ROI por socio
    const sandraInvertido = inversionesPorSocio[SANDRA_ID] ?? 0
    const benjaminInvertido = inversionesPorSocio[BENJAMIN_ID] ?? 0
    const sandraROI =
      sandraInvertido > 0 ? (sandra / sandraInvertido) * 100 : 0
    const benjaminROI =
      benjaminInvertido > 0 ? (benjamin / benjaminInvertido) * 100 : 0

    return {
      totalVentas,
      ganancia,
      utilidadNeta,
      totalCostoEnvio,
      totalDescuento,
      ticket,
      margen,
      margenNeto,
      sandra,
      benjamin,
      cobrado,
      saldo,
      pctCobrado,
      pendientes,
      sinIVA,
      sinIVAMonto,
      mejorCliente,
      sandraInvertido,
      benjaminInvertido,
      sandraROI,
      benjaminROI,
      activosCount: activos.length,
    }
  }, [ventas, venta_socios, inversionesPorSocio])

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

  // ─── Series mensual completa (todos los meses desde la primera venta) ──
  const monthlyAll = useMemo(() => {
    const valid = ventas.filter(
      (v) => v.estatus !== "cancelada" && !Number.isNaN(new Date(v.fecha).getTime()),
    )
    if (valid.length === 0) return monthly
    const earliest = valid.reduce(
      (min, v) => (new Date(v.fecha) < min ? new Date(v.fecha) : min),
      new Date(valid[0].fecha),
    )
    const today = new Date()
    const buckets: { key: string; date: Date; label: string }[] = []
    const cursor = new Date(earliest.getFullYear(), earliest.getMonth(), 1)
    const end = new Date(today.getFullYear(), today.getMonth(), 1)
    while (cursor <= end) {
      const label = monthShort.format(cursor).replace(".", "")
      buckets.push({
        key: ymKey(cursor),
        date: new Date(cursor),
        label: `${label[0].toUpperCase()}${label.slice(1)}`,
      })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    const map = new Map(
      buckets.map((b) => [b.key, { ...b, total: 0, ganancia: 0, count: 0 }]),
    )
    for (const v of valid) {
      const key = ymKey(new Date(v.fecha))
      const b = map.get(key)
      if (!b) continue
      b.total += Number(v.total ?? 0)
      b.ganancia += Number(v.ganancia ?? 0)
      b.count += 1
    }
    return Array.from(map.values())
  }, [ventas, monthly])

  // ─── Filtro por período ──
  const monthlyFiltered = useMemo(() => {
    if (periodo === "TODO") return monthlyAll
    const n = periodo === "3M" ? 3 : periodo === "6M" ? 6 : 12
    return monthly.slice(-n)
  }, [periodo, monthly, monthlyAll])

  // ─── Socios stats (fallback hardcoded si RLS bloquea `socios`) ────
  const sociosStats = useMemo(() => {
    const fallback: SocioInfo[] = [
      { id: SANDRA_ID, nombre: "Sandra", porcentaje: 50 },
      { id: BENJAMIN_ID, nombre: "Benjamin", porcentaje: 50 },
    ]
    const list = socios.length > 0 ? socios : fallback
    const ventaById = new Map(ventas.map((v) => [v.id, v]))
    return list.map((socio) => {
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

  const productoOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const it of venta_items) {
      if (it.productos?.id && !m.has(it.productos.id)) {
        m.set(it.productos.id, it.productos.nombre ?? "—")
      }
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "es"))
  }, [venta_items])

  // ─── Filtered ventas for the table ────────────────────────────────
  const filtered = useMemo(() => {
    let list = ventas
    if (from) list = list.filter((v) => v.fecha >= from)
    if (to) list = list.filter((v) => v.fecha <= to)
    if (clienteFilter !== "todos") list = list.filter((v) => v.cliente_id === clienteFilter)
    if (estatusFilter !== "todos") list = list.filter((v) => v.estatus === estatusFilter)
    if (ivaFilter === "con") list = list.filter((v) => Number(v.iva ?? 0) > 0)
    if (ivaFilter === "sin") list = list.filter((v) => Number(v.iva ?? 0) === 0)
    if (socioFilter !== "todos") {
      const targetId =
        socioFilter === "sandra" ? SANDRA_ID : socioFilter === "benjamin" ? BENJAMIN_ID : null
      const ventaIds = new Set<string>()
      const groupBy = new Map<string, VentaSocioRow[]>()
      for (const vs of venta_socios) {
        const a = groupBy.get(vs.venta_id) ?? []
        a.push(vs); groupBy.set(vs.venta_id, a)
      }
      for (const [vid, arr] of groupBy) {
        const s = arr.find((x) => x.socio_id === SANDRA_ID)?.monto ?? 0
        const b = arr.find((x) => x.socio_id === BENJAMIN_ID)?.monto ?? 0
        if (socioFilter === "ambos" && Number(s) > 0 && Number(b) > 0) ventaIds.add(vid)
        else if (targetId && arr.some((x) => x.socio_id === targetId && Number(x.monto ?? 0) > 0)) ventaIds.add(vid)
      }
      list = list.filter((v) => ventaIds.has(v.id))
    }
    if (productoFilter !== "todos") {
      const ventaIds = new Set(
        venta_items
          .filter((it) => it.productos?.id === productoFilter)
          .map((it) => it.venta_id),
      )
      list = list.filter((v) => ventaIds.has(v.id))
    }
    return list
  }, [ventas, from, to, clienteFilter, estatusFilter, ivaFilter, socioFilter, productoFilter, venta_socios, venta_items])

  const activeFilters = [
    !!from || !!to,
    clienteFilter !== "todos",
    estatusFilter !== "todos",
    socioFilter !== "todos",
    productoFilter !== "todos",
    ivaFilter !== "todos",
  ].filter(Boolean).length

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Ventas"
        subtitle={`${ventas.length} ventas · ${clienteOptions.length} clientes`}
        kpis={(() => {
          const len = monthly.length
          const cur = monthly[len - 1]
          const prev = monthly[len - 2]
          const pct = (a: number, b: number) =>
            b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100
          const dTotal = cur && prev ? pct(cur.total, prev.total) : 0
          const dGanancia = cur && prev ? pct(cur.ganancia, prev.ganancia) : 0
          return [
            {
              label: "Total vendido",
              value: formatMXN(kpis.totalVentas),
              sub: `${kpis.activosCount} órdenes · vs mes anterior`,
              trend: {
                value: `${dTotal >= 0 ? "+" : ""}${dTotal.toFixed(1)}%`,
                positive: dTotal >= 0,
              },
              sparkline: monthly.map((m) => m.total),
              featured: true,
            },
            {
              label: "Utilidad neta",
              value: formatMXN(kpis.utilidadNeta),
              sub: `${kpis.margenNeto.toFixed(1)}% margen`,
              trend: {
                value: `${dGanancia >= 0 ? "+" : ""}${dGanancia.toFixed(1)}%`,
                positive: dGanancia >= 0,
              },
              sparkline: monthly.map((m) => m.ganancia),
            },
            {
              label: "Cobrado",
              value: formatMXN(kpis.cobrado),
              sub: `${kpis.pctCobrado.toFixed(0)}% del total · ${kpis.pendientes} pend.`,
            },
            {
              label: "Ticket promedio",
              value: formatMXN(kpis.ticket),
              sub:
                kpis.saldo > 0
                  ? `Saldo ${formatMXN(kpis.saldo)}`
                  : "Todo cobrado",
            },
          ]
        })()}
        actions={
          <>
            <ExportVentasButton ventas={ventas} />
            <Link
              href="/ventas/estadisticas"
              className="inline-flex h-[42px] items-center gap-2 rounded-[14px] border border-[rgba(15,23,42,0.06)] bg-white px-[18px] text-sm font-medium text-gray-700 transition-all hover:-translate-y-0.5 hover:bg-[#F9FAFB]"
            >
              <BarChart3 className="size-4" strokeWidth={1.75} />
              Estadísticas
            </Link>
            <Link
              href="/ventas/nueva"
              className="inline-flex h-[42px] items-center gap-2 rounded-[14px] bg-[#0F766E] px-[18px] text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#115E59]"
            >
              + Nueva Venta
            </Link>
          </>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ─── Chart principal + Socios panel (dominante) ─── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="pc-card lg:col-span-2">
          <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                Ventas mensuales
              </h2>
              <p className="mt-0.5 text-[10.5px] text-gray-400">
                {periodo === "TODO"
                  ? `Historial completo · ${monthlyAll.length} meses · Total · Ganancia`
                  : periodo === "1A"
                    ? "Últimos 12 meses · Total · Ganancia"
                    : periodo === "6M"
                      ? "Últimos 6 meses · Total · Ganancia"
                      : "Últimos 3 meses · Total · Ganancia"}
              </p>
            </div>
            <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50/60 p-0.5">
              {(["3M", "6M", "1A", "TODO"] as const).map((p) => {
                const active = periodo === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriodo(p)}
                    className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all"
                    style={{
                      background: active ? "white" : "transparent",
                      color: active ? "#0F766E" : "#64748B",
                      boxShadow: active
                        ? "0 1px 2px rgba(15,23,42,0.06), 0 0 0 1px rgba(15,118,110,0.20)"
                        : "none",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.color = "#0F172A"
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.color = "#64748B"
                      }
                    }}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          </header>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart
              data={monthlyFiltered}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              barCategoryGap="32%"
            >
              <defs>
                <linearGradient id="ventasBarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0F766E" stopOpacity={0.92} />
                  <stop offset="100%" stopColor="#0F766E" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="rgba(148,163,184,0.12)"
                strokeDasharray="0"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "#94A3B8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#94A3B8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
                }
                width={60}
              />
              <Tooltip
                cursor={{ fill: "rgba(15,118,110,0.04)" }}
                contentStyle={{
                  border: "1px solid rgba(15,23,42,0.06)",
                  borderRadius: 12,
                  fontSize: 12,
                  boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
                }}
                formatter={(v) => formatMXN2(Number(v ?? 0))}
                labelFormatter={(l, p) => {
                  const item = p?.[0]?.payload
                  return item?.date ? monthLong.format(item.date) : l
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              <Bar
                dataKey="total"
                name="Total vendido"
                fill="url(#ventasBarGradient)"
                radius={[12, 12, 4, 4]}
                barSize={22}
                opacity={0.92}
              />
              <Line
                type="monotone"
                dataKey="ganancia"
                name="Ganancia"
                stroke="#94A3B8"
                strokeWidth={2.2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-4 pc-card">
          <header className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
              Socios
            </h2>
            <span className="text-xs text-gray-500">
              {socios.length} activos
            </span>
          </header>

          <div className="space-y-3">
            {sociosStats.map(({ socio, vendido, cobrado, ganancia }, i) => {
              const pct =
                totalAsignado > 0 ? (vendido / totalAsignado) * 100 : 0
              const color =
                SOCIO_COLORS[socio.nombre] ??
                FALLBACK_COLORS[i % FALLBACK_COLORS.length]
              return (
                <div key={socio.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: color }}
                      />
                      <span className="text-sm font-semibold text-[#0F172A]">
                        {socio.nombre}
                      </span>
                    </div>
                    <span
                      className="text-[11px] tabular-nums text-[#64748B]"
                      style={{ letterSpacing: "-0.01em" }}
                    >
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-[11px] text-[#64748B]">
                    <span>
                      Vendido{" "}
                      <span
                        className="ml-1 font-semibold text-[#0F172A] tabular-nums"
                        style={{ letterSpacing: "-0.02em" }}
                      >
                        {formatMXN(vendido)}
                      </span>
                    </span>
                    <span>
                      Ganancia{" "}
                      <span
                        className="ml-1 font-semibold text-emerald-700 tabular-nums"
                        style={{ letterSpacing: "-0.02em" }}
                      >
                        {formatMXN(ganancia)}
                      </span>
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-[rgba(15,23,42,0.04)]">
                    <div
                      className="h-1 rounded-full transition-all"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                  <p className="text-[10.5px] text-[#94A3B8]">
                    Cobrado {formatMXN(cobrado)}
                    {vendido > 0
                      ? ` · ${((cobrado / vendido) * 100).toFixed(0)}%`
                      : ""}
                  </p>
                </div>
              )
            })}
          </div>

          {totalAsignado > 0 && (
            <div className="border-t border-[rgba(15,23,42,0.04)] pt-3">
              <div className="relative">
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie
                      data={sociosStats.map((s) => ({
                        name: s.socio.nombre,
                        value: s.vendido,
                      }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={42}
                      outerRadius={58}
                      paddingAngle={3}
                      stroke="#ffffff"
                      strokeWidth={2}
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
                      formatter={(v) => formatMXN2(Number(v ?? 0))}
                      cursor={{ fill: "rgba(15,118,110,0.04)" }}
                      contentStyle={{
                        border: "1px solid rgba(15,23,42,0.06)",
                        borderRadius: 12,
                        fontSize: 12,
                        boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Texto central */}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p
                    className="text-base font-bold leading-none tabular-nums text-[#0F172A]"
                    style={{ letterSpacing: "-0.03em" }}
                  >
                    {sociosStats.length === 2 &&
                    sociosStats[0].socio.porcentaje ===
                      sociosStats[1].socio.porcentaje
                      ? `${sociosStats[0].socio.porcentaje} / ${sociosStats[1].socio.porcentaje}`
                      : sociosStats
                          .map((s) => `${s.socio.porcentaje}`)
                          .join(" / ")}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[#64748B]">
                    Socios
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── KPIs secundarios — strips compactos neutros ─── */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <InsightCard
          label="ROI Sandra"
          big={`${kpis.sandraROI.toFixed(0)}%`}
          line1={`${formatMXN(kpis.sandra)} de ${formatMXN(kpis.sandraInvertido)}`}
        />
        <InsightCard
          label="ROI Benjamin"
          big={`${kpis.benjaminROI.toFixed(0)}%`}
          line1={`${formatMXN(kpis.benjamin)} de ${formatMXN(kpis.benjaminInvertido)}`}
        />
        <InsightCard
          label="Mejor cliente"
          big={kpis.mejorCliente?.nombre ?? "—"}
          line1={
            kpis.mejorCliente
              ? `${formatMXN(kpis.mejorCliente.monto)} · ${kpis.mejorCliente.n} ${kpis.mejorCliente.n === 1 ? "venta" : "ventas"}`
              : "Sin ventas"
          }
          truncateBig
        />
        <InsightCard
          label="Ganancia bruta"
          big={formatMXN(kpis.ganancia)}
          line1={`${kpis.margen.toFixed(1)}% margen bruto`}
        />
        <InsightCard
          label="Costo envío"
          big={formatMXN(kpis.totalCostoEnvio)}
          line1="Restado de utilidad neta"
        />
        <InsightCard
          label="Sin IVA"
          big={`${kpis.sinIVA}`}
          line1={`${formatMXN(kpis.sinIVAMonto)} sin IVA`}
        />
      </section>

      {/* ─── Filtros globales ─── */}
      <section className="pc-card-flush">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-md bg-[#F9FAFB] text-[#0F766E]">
              <Sparkles className="size-3.5" />
            </span>
            <h2 className="text-sm font-semibold text-gray-900">Filtros</h2>
            {activeFilters > 0 && (
              <span className="rounded-full bg-[#DFF7F4] px-2 py-0.5 text-[10.5px] font-semibold text-[#0F766E]">
                {activeFilters} activos
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] tabular-nums text-gray-500">
              Mostrando <strong className="text-gray-900">{filtered.length}</strong> de {ventas.length}
            </span>
            {activeFilters > 0 && (
              <button
                type="button"
                onClick={() => {
                  setFrom(""); setTo(""); setClienteFilter("todos")
                  setEstatusFilter("todos"); setSocioFilter("todos")
                  setProductoFilter("todos"); setIvaFilter("todos")
                }}
                className="text-[11px] font-medium text-[#0F766E] hover:text-[#115E59]"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-3 lg:grid-cols-7">
          <FilterField label="Desde">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100"
            />
          </FilterField>
          <FilterField label="Hasta">
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100"
            />
          </FilterField>
          <FilterField label="Cliente">
            <select
              value={clienteFilter}
              onChange={(e) => setClienteFilter(e.target.value)}
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100"
            >
              <option value="todos">Todos</option>
              {clienteOptions.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Producto">
            <select
              value={productoFilter}
              onChange={(e) => setProductoFilter(e.target.value)}
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100"
            >
              <option value="todos">Todos</option>
              {productoOptions.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Vendedor">
            <select
              value={socioFilter}
              onChange={(e) =>
                setSocioFilter(e.target.value as "todos" | "sandra" | "benjamin" | "ambos")
              }
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100"
            >
              <option value="todos">Todos</option>
              <option value="sandra">Sandra</option>
              <option value="benjamin">Benjamin</option>
              <option value="ambos">Ambos socios</option>
            </select>
          </FilterField>
          <FilterField label="Estado">
            <select
              value={estatusFilter}
              onChange={(e) =>
                setEstatusFilter(e.target.value as "todos" | Estatus)
              }
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100"
            >
              <option value="todos">Todos</option>
              <option value="pagada_total">Pagada</option>
              <option value="pagada_parcial">Parcial</option>
              <option value="pendiente">Pendiente</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </FilterField>
          <FilterField label="IVA">
            <select
              value={ivaFilter}
              onChange={(e) => setIvaFilter(e.target.value as "todos" | "con" | "sin")}
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100"
            >
              <option value="todos">Todas</option>
              <option value="con">Con IVA</option>
              <option value="sin">Sin IVA</option>
            </select>
          </FilterField>
        </div>
      </section>

      {/* ─── Ventas por Tipo de Producto ─── */}
      {tiposData && tiposData.length > 0 && (
        <VentasPorTipo data={tiposData} />
      )}

      {/* ─── Tabla premium ─── */}
      <VentasTablePremium
        ventas={filtered}
        venta_socios={venta_socios}
        onRowClick={setDrawerVenta}
      />

      {/* ─── Drawer detalle ─── */}
      <VentaDrawer
        venta={drawerVenta}
        open={drawerVenta !== null}
        onClose={() => setDrawerVenta(null)}
        venta_items={venta_items}
        venta_socios={venta_socios}
        stockBySku={stockBySku}
      />
    </div>
  )
}

/**
 * KPI strip neutro y compacto — sin tonos coloridos, sin iconos, sin
 * progress bars decorativos. Solo: LABEL · BIG · 1 línea contextual.
 * Estilo Linear/Stripe/Mercury.
 */
function InsightCard({
  label,
  big,
  line1,
  truncateBig,
}: {
  label: string
  big: string
  line1?: string
  truncateBig?: boolean
}) {
  return (
    <article
      className="flex flex-col rounded-2xl border bg-white px-4 py-3 transition-all duration-180 hover:-translate-y-0.5"
      style={{
        borderColor: "rgba(15,23,42,0.05)",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.03), 0 8px 24px rgba(15,23,42,0.02)",
        minHeight: 92,
      }}
    >
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
        {label}
      </p>
      <div
        className={`mt-1 text-[20px] font-bold leading-tight tracking-[-0.03em] text-[#0F172A] ${truncateBig ? "truncate" : "tabular-nums"}`}
        title={truncateBig ? big : undefined}
        style={{ fontFeatureSettings: '"tnum" 1' }}
      >
        {big}
      </div>
      {line1 && (
        <p className="mt-auto text-[11px] leading-tight tabular-nums text-[#64748B]">
          {line1}
        </p>
      )}
    </article>
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
