"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ShoppingBag,
  TrendingUp,
  Users,
  Receipt,
  BarChart3,
  Crown,
  Trophy,
  ArrowUpRight,
  PiggyBank,
  Sparkles,
} from "lucide-react"
import { VentasTablePremium, type EnrichedVenta } from "./ventas-table-premium"
import { VentaDrawer } from "./venta-drawer"
import { AnimatedNumber } from "./estadisticas/animated-number"
import { PageHeader } from "@/components/page-header"
import { formatMXNshort } from "@/lib/utils"
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

const SOCIO_COLORS: Record<string, string> = {
  Sandra: "#db2777",
  Benjamin: "#0d9488",
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
  error,
}: {
  ventas: VentaRow[]
  venta_socios: VentaSocioRow[]
  socios: SocioInfo[]
  venta_items: VentaItemRow[]
  stock: VistaStockRow[]
  inversionesPorSocio: Record<string, number>
  error: string | null
}) {
  const [from, setFrom] = useState<string>("")
  const [to, setTo] = useState<string>("")
  const [clienteFilter, setClienteFilter] = useState<string>("todos")
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
    <div className="p-4 space-y-4">
      <PageHeader
        title="Ventas"
        subtitle={`${ventas.length} ventas · ${clienteOptions.length} clientes`}
        icon={<ShoppingBag className="size-5" />}
        gradient="bg-gradient-to-br from-[#0f2d0f] via-[#1a4a1a] to-[#134e13]"
        kpis={[
          {
            label: "Total histórico",
            value: mxn.format(kpis.totalVentas),
            sub: `${kpis.activosCount} órdenes`,
          },
          {
            label: "Utilidad neta",
            value: mxn.format(kpis.utilidadNeta),
            sub: `${kpis.margenNeto.toFixed(1)}% margen`,
            color: "text-emerald-300",
          },
          {
            label: "Sandra",
            value: formatMXNshort(kpis.sandra),
            sub: "acumulado",
          },
          {
            label: "Benjamin",
            value: formatMXNshort(kpis.benjamin),
            sub: "acumulado",
          },
        ]}
        actions={
          <>
            <Link
              href="/ventas/estadisticas"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/30"
            >
              <BarChart3 className="size-4" />
              Estadísticas
            </Link>
            <Link
              href="/ventas/nueva"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-medium text-[#0f2d0f] transition-all hover:bg-white/90"
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

      {/* ─── Hero KPIs ─── */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <HeroKpi
          icon={<ShoppingBag className="size-4" />}
          label="Total vendido"
          value={kpis.totalVentas}
          gradient="from-pink-50 via-white to-rose-50/50"
          accent="text-pink-700"
          ring="ring-pink-100"
          subtitle={`${kpis.activosCount} órdenes activas`}
        />
        <HeroKpi
          icon={<TrendingUp className="size-4" />}
          label="Utilidad neta"
          value={kpis.utilidadNeta}
          gradient="from-emerald-50 via-white to-teal-50/50"
          accent="text-emerald-700"
          ring="ring-emerald-100"
          subtitle={`${kpis.margenNeto.toFixed(1)}% margen neto · sin envío ${mxn.format(kpis.totalCostoEnvio)}`}
          badge={
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
              <ArrowUpRight className="size-2.5" />
              {kpis.margenNeto.toFixed(0)}%
            </span>
          }
        />
        <HeroKpi
          icon={<PiggyBank className="size-4" />}
          label="Cobrado"
          value={kpis.cobrado}
          gradient="from-teal-50 via-white to-cyan-50/50"
          accent="text-teal-700"
          ring="ring-teal-100"
          subtitle={`${kpis.pctCobrado.toFixed(0)}% del total`}
          progress={kpis.pctCobrado}
        />
        <HeroKpi
          icon={<Receipt className="size-4" />}
          label="Ticket promedio"
          value={kpis.ticket}
          gradient="from-violet-50 via-white to-fuchsia-50/50"
          accent="text-violet-700"
          ring="ring-violet-100"
          subtitle={
            kpis.saldo > 0
              ? `${kpis.pendientes} pendientes · ${mxn.format(kpis.saldo)}`
              : "Todo cobrado"
          }
        />
      </section>

      {/* ─── Insights ─── */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <InsightCard
          icon={<Trophy className="size-3.5" />}
          tone="pink"
          label="ROI Sandra"
          big={`${kpis.sandraROI.toFixed(0)}%`}
          line1={`Recuperó ${mxn.format(kpis.sandra)}`}
          line2={`Invirtió ${mxn.format(kpis.sandraInvertido)}`}
          progress={Math.min(100, kpis.sandraROI)}
        />
        <InsightCard
          icon={<Trophy className="size-3.5" />}
          tone="teal"
          label="ROI Benjamin"
          big={`${kpis.benjaminROI.toFixed(0)}%`}
          line1={`Recuperó ${mxn.format(kpis.benjamin)}`}
          line2={`Invirtió ${mxn.format(kpis.benjaminInvertido)}`}
          progress={Math.min(100, kpis.benjaminROI)}
        />
        <InsightCard
          icon={<Crown className="size-3.5" />}
          tone="amber"
          label="Mejor cliente"
          big={kpis.mejorCliente?.nombre ?? "—"}
          line1={
            kpis.mejorCliente
              ? mxn.format(kpis.mejorCliente.monto)
              : "Sin ventas"
          }
          line2={
            kpis.mejorCliente
              ? `${kpis.mejorCliente.n} ${kpis.mejorCliente.n === 1 ? "venta" : "ventas"}`
              : ""
          }
          truncateBig
        />
        <InsightCard
          icon={<Sparkles className="size-3.5" />}
          tone="blue"
          label="Bruta vs Neta"
          big={mxn.format(kpis.ganancia)}
          line1={`Bruta (Sheet) · margen ${kpis.margen.toFixed(1)}%`}
          line2={`Neta ${mxn.format(kpis.utilidadNeta)} · ${kpis.margenNeto.toFixed(1)}%`}
        />
      </section>

      {/* ─── Insights extra: descuento + envío + sin IVA ─── */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <InsightCard
          icon={<Sparkles className="size-3.5" />}
          tone="violet"
          label="Sin IVA"
          big={`${kpis.sinIVA} ventas`}
          line1={`${mxn.format(kpis.sinIVAMonto)} facturadas sin IVA`}
        />
        <InsightCard
          icon={<Sparkles className="size-3.5" />}
          tone="amber"
          label="Costo envío total"
          big={mxn.format(kpis.totalCostoEnvio)}
          line1="Restado de la utilidad neta"
        />
        <InsightCard
          icon={<Sparkles className="size-3.5" />}
          tone="emerald"
          label="Descuentos otorgados"
          big={mxn.format(kpis.totalDescuento)}
          line1={`${kpis.totalDescuento > 0 ? "Aplicados a clientes" : "Sin descuentos en periodo"}`}
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
          <ResponsiveContainer width="100%" height={220}>
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
                fill="#0d9488"
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

      {/* ─── Filtros globales ─── */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-md bg-pink-50 text-pink-700">
              <Sparkles className="size-3.5" />
            </span>
            <h2 className="text-sm font-semibold text-gray-900">Filtros</h2>
            {activeFilters > 0 && (
              <span className="rounded-full bg-pink-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-pink-700">
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
                className="text-[11px] font-medium text-pink-700 hover:text-pink-900"
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

function HeroKpi({
  icon,
  label,
  value,
  gradient,
  accent,
  ring,
  subtitle,
  badge,
  progress,
}: {
  icon: React.ReactNode
  label: string
  value: number
  gradient: string
  accent: string
  ring: string
  subtitle?: string
  badge?: React.ReactNode
  progress?: number
}) {
  return (
    <article
      className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-5 ring-1 ${ring} shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      <header className="flex items-center justify-between">
        <div className={`flex items-center gap-1.5 ${accent}`}>
          {icon}
          <span className="text-[10.5px] font-semibold uppercase tracking-wider">
            {label}
          </span>
        </div>
        {badge}
      </header>
      <div className={`mt-3 text-3xl font-bold tabular-nums ${accent}`}>
        <AnimatedNumber value={value} prefix="$" decimals={0} duration={1000} />
      </div>
      {subtitle && (
        <p className="mt-1 text-xs text-gray-600">{subtitle}</p>
      )}
      {progress !== undefined && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/60">
          <div
            className={`h-full rounded-full bg-gradient-to-r from-current to-current opacity-80 ${accent}`}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}
    </article>
  )
}

function InsightCard({
  icon,
  tone,
  label,
  big,
  line1,
  line2,
  progress,
  truncateBig,
}: {
  icon: React.ReactNode
  tone: "pink" | "teal" | "amber" | "blue" | "violet" | "emerald"
  label: string
  big: string
  line1?: string
  line2?: string
  progress?: number
  truncateBig?: boolean
}) {
  const tones: Record<typeof tone, { ring: string; text: string; bar: string; icon: string }> = {
    pink:    { ring: "ring-pink-100",    text: "text-pink-700",    bar: "bg-pink-500",    icon: "bg-pink-50 text-pink-700" },
    teal:    { ring: "ring-teal-100",    text: "text-teal-700",    bar: "bg-teal-500",    icon: "bg-teal-50 text-teal-700" },
    amber:   { ring: "ring-amber-100",   text: "text-amber-700",   bar: "bg-amber-500",   icon: "bg-amber-50 text-amber-700" },
    blue:    { ring: "ring-blue-100",    text: "text-blue-700",    bar: "bg-blue-500",    icon: "bg-blue-50 text-blue-700" },
    violet:  { ring: "ring-violet-100",  text: "text-violet-700",  bar: "bg-violet-500",  icon: "bg-violet-50 text-violet-700" },
    emerald: { ring: "ring-emerald-100", text: "text-emerald-700", bar: "bg-emerald-500", icon: "bg-emerald-50 text-emerald-700" },
  }
  const c = tones[tone]
  return (
    <article className={`group rounded-2xl border border-gray-100 bg-white p-4 ring-1 ${c.ring} shadow-sm transition hover:shadow-md`}>
      <header className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </span>
        <span className={`flex size-6 items-center justify-center rounded-md ${c.icon}`}>
          {icon}
        </span>
      </header>
      <div
        className={`mt-2 text-lg font-bold ${c.text} ${truncateBig ? "truncate" : "tabular-nums"}`}
        title={truncateBig ? big : undefined}
      >
        {big}
      </div>
      {line1 && (
        <p className="mt-0.5 text-[11px] text-gray-700 tabular-nums">{line1}</p>
      )}
      {line2 && (
        <p className="text-[10px] text-gray-500 tabular-nums">{line2}</p>
      )}
      {progress !== undefined && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full ${c.bar} transition-all`}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
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
