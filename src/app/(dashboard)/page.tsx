import Link from "next/link"
import {
  ShoppingBag,
  TrendingUp,
  Users,
  FileText,
  Package,
  Receipt,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Plus,
  Calendar,
} from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getInternalClienteIds } from "@/lib/internal-clientes"
import { formatMXNshort } from "@/lib/utils"
import { PageHeader } from "@/components/page-header"
import { MonthlyChart } from "./ventas/estadisticas/monthly-chart"

const SANDRA_ID = "4f21084b-dfe9-45f3-be80-935dc1a5e7a5"
const BENJAMIN_ID = "3165fe33-c760-4373-84d0-e1cd14d863b3"

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
const fechaLarga = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
})

type Estatus =
  | "pendiente"
  | "pagada_parcial"
  | "pagada_total"
  | "cancelada"
  | "borrador"
  | "enviada"
  | "aceptada"
  | "rechazada"
  | "vencida"

const estatusBadge: Record<Estatus, string> = {
  pagada_total: "bg-teal-50 text-teal-700",
  pagada_parcial: "bg-amber-50 text-amber-700",
  pendiente: "bg-red-50 text-red-700",
  cancelada: "bg-gray-100 text-gray-600",
  borrador: "bg-gray-100 text-gray-700",
  enviada: "bg-blue-50 text-blue-700",
  aceptada: "bg-teal-50 text-teal-700",
  rechazada: "bg-red-50 text-red-700",
  vencida: "bg-amber-50 text-amber-700",
}
const estatusLabel: Record<Estatus, string> = {
  pagada_total: "Pagada",
  pagada_parcial: "Parcial",
  pendiente: "Pendiente",
  cancelada: "Cancelada",
  borrador: "Borrador",
  enviada: "Enviada",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  vencida: "Vencida",
}

function tiempoRelativo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return "hace unos segundos"
  const min = Math.floor(sec / 60)
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} hora${h === 1 ? "" : "s"}`
  const d = Math.floor(h / 24)
  if (d < 30) return `hace ${d} día${d === 1 ? "" : "s"}`
  const mo = Math.floor(d / 30)
  return `hace ${mo} mes${mo === 1 ? "" : "es"}`
}

function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function pctChange(now: number, prev: number): number {
  if (prev === 0) return now > 0 ? 100 : 0
  return ((now - prev) / prev) * 100
}

function greeting(now: Date): string {
  const h = now.getHours()
  if (h < 12) return "Buenos días"
  if (h < 18) return "Buenas tardes"
  return "Buenas noches"
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10)
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    .toISOString()
    .slice(0, 10)
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
    .toISOString()
    .slice(0, 10)
  const todayIso = today.toISOString().slice(0, 10)

  const [
    ventasMesRes,
    ventasMesAntRes,
    ventasAllRes,
    clientesCountRes,
    cotizacionesPendCountRes,
    inventarioBajoRes,
    inversionesRes,
    ventaSociosRes,
    recentVentasRes,
    cotizacionesPendListRes,
    itemsTopMesRes,
    proximaCotRes,
    todasCotsRecRes,
    todasVentasRecRes,
  ] = await Promise.all([
    supabase
      .from("ventas")
      .select("id, total, ganancia, cliente_id, clientes(nombre, nombre_negocio)")
      .gte("fecha", monthStart),
    supabase
      .from("ventas")
      .select("total, cliente_id")
      .gte("fecha", lastMonthStart)
      .lte("fecha", lastMonthEnd),
    supabase
      .from("ventas")
      .select("id, fecha, total, ganancia, estatus, cliente_id")
      .order("fecha", { ascending: true }),
    supabase.from("clientes").select("*", { count: "exact", head: true }),
    supabase
      .from("cotizaciones")
      .select("*", { count: "exact", head: true })
      .eq("estatus", "enviada"),
    supabase
      .from("vista_inventario")
      .select("sku, nombre, stock_actual, stock_minimo, estatus")
      .in("estatus", ["bajo", "agotado"])
      .order("stock_actual", { ascending: true })
      .limit(8),
    admin.from("inversiones").select("socio_id, monto_mxn"),
    admin.from("venta_socios").select("venta_id, socio_id, monto"),
    admin
      .from("ventas")
      .select(
        "id, numero, total, fecha, estatus, created_at, clientes(nombre, nombre_negocio)",
      )
      .order("fecha", { ascending: false })
      .limit(5),
    admin
      .from("cotizaciones")
      .select(
        "id, numero, total, fecha, estatus, valida_hasta, clientes(nombre, nombre_negocio)",
      )
      .eq("estatus", "enviada")
      .order("fecha", { ascending: false })
      .limit(4),
    admin
      .from("venta_items")
      .select(
        "venta_id, cantidad, precio_unitario, productos(nombre, sku)",
      )
      .gte("created_at", monthStart),
    admin
      .from("cotizaciones")
      .select("id, numero, valida_hasta, clientes(nombre, nombre_negocio)")
      .gte("valida_hasta", todayIso)
      .in("estatus", ["enviada", "borrador"])
      .order("valida_hasta", { ascending: true })
      .limit(1),
    admin
      .from("cotizaciones")
      .select(
        "id, numero, total, fecha, created_at, cliente_id, clientes(nombre, nombre_negocio)",
      )
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("ventas")
      .select(
        "id, numero, total, fecha, created_at, cliente_id, clientes(nombre, nombre_negocio)",
      )
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  // Excluir ventas/cotizaciones de clientes internos (Piel Canela) de KPIs.
  const internalIds = await getInternalClienteIds()
  const isInternalCli = (cli: string | null | undefined) =>
    !!cli && internalIds.has(cli)

  type VentaRow = {
    id: string
    total: number | null
    ganancia: number | null
    cliente_id: string | null
    clientes: { nombre: string; nombre_negocio: string | null } | null
    fecha?: string
    estatus?: Estatus
    numero?: string
    created_at?: string
    valida_hasta?: string | null
  }
  const ventasMes = (
    (ventasMesRes.data ?? []) as unknown as VentaRow[]
  ).filter((v) => !isInternalCli(v.cliente_id))
  const ventasMesAnt = (
    (ventasMesAntRes.data ?? []) as {
      total: number | null
      cliente_id: string | null
    }[]
  ).filter((v) => !isInternalCli(v.cliente_id))
  const ventasAllRaw = (ventasAllRes.data ?? []) as {
    id: string
    fecha: string
    total: number | null
    ganancia: number | null
    estatus: Estatus
    cliente_id: string | null
  }[]
  const ventasAll = ventasAllRaw.filter((v) => !isInternalCli(v.cliente_id))
  // Set de venta_ids internos para filtrar venta_socios y venta_items
  const internalVentaIds = new Set(
    ventasAllRaw.filter((v) => isInternalCli(v.cliente_id)).map((v) => v.id),
  )
  const inversiones = (inversionesRes.data ?? []) as {
    socio_id: string
    monto_mxn: number
  }[]
  const ventaSocios = (
    (ventaSociosRes.data ?? []) as {
      venta_id: string
      socio_id: string
      monto: number
    }[]
  ).filter((vs) => !internalVentaIds.has(vs.venta_id))
  const recentVentas = (
    (recentVentasRes.data ?? []) as unknown as VentaRow[]
  ).filter((v) => !isInternalCli(v.cliente_id))
  const cotPendList = (cotizacionesPendListRes.data ?? []) as unknown as VentaRow[]
  const itemsMes = (
    (itemsTopMesRes.data ?? []) as unknown as {
      venta_id: string
      cantidad: number
      precio_unitario: number
      productos: { nombre: string; sku: string | null } | null
    }[]
  ).filter((it) => !internalVentaIds.has(it.venta_id))
  const inventarioBajo = (inventarioBajoRes.data ?? []) as {
    sku: string | null
    nombre: string
    stock_actual: number | null
    stock_minimo: number | null
    estatus: string
  }[]
  const proximaCot = (proximaCotRes.data ?? []) as unknown as VentaRow[]
  const allCotsRecientes = (
    (todasCotsRecRes.data ?? []) as unknown as VentaRow[]
  )
    .filter((c) => !isInternalCli(c.cliente_id))
    .slice(0, 8)
  const allVentasRecientes = (
    (todasVentasRecRes.data ?? []) as unknown as VentaRow[]
  )
    .filter((v) => !isInternalCli(v.cliente_id))
    .slice(0, 8)

  // ─── KPI calcs ────────────────────────────────────────────────────
  const totalVentasMes = ventasMes.reduce((s, v) => s + Number(v.total ?? 0), 0)
  const gananciaMes = ventasMes.reduce((s, v) => s + Number(v.ganancia ?? 0), 0)
  const totalVentasMesAnt = ventasMesAnt.reduce(
    (s, v) => s + Number(v.total ?? 0),
    0,
  )
  const cambioVentas = pctChange(totalVentasMes, totalVentasMesAnt)
  const ticketMes =
    ventasMes.length > 0 ? totalVentasMes / ventasMes.length : 0
  const ticketMesAnt =
    ventasMesAnt.length > 0
      ? totalVentasMesAnt / Math.max(1, ventasMesAnt.length)
      : 0
  const cambioTicket = pctChange(ticketMes, ticketMesAnt)
  const totalClientes = clientesCountRes.count ?? 0
  const cotPendCount = cotizacionesPendCountRes.count ?? 0
  const stockBajoCount = inventarioBajo.length

  // ─── Monthly chart series (12 últimos meses) ─────────────────────
  const monthly: Map<string, { mes: string; total: number; ganancia: number; count: number }> = new Map()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    monthly.set(ymKey(d), { mes: ymKey(d), total: 0, ganancia: 0, count: 0 })
  }
  for (const v of ventasAll) {
    if (v.estatus === "cancelada") continue
    const d = new Date(v.fecha)
    if (Number.isNaN(d.getTime())) continue
    const k = ymKey(d)
    const b = monthly.get(k)
    if (!b) continue
    b.total += Number(v.total ?? 0)
    b.ganancia += Number(v.ganancia ?? 0)
    b.count += 1
  }
  const chartData = Array.from(monthly.values())

  // ─── Socios stats ─────────────────────────────────────────────────
  const socioStats = (id: string) => {
    const totalInvertido = inversiones
      .filter((i) => i.socio_id === id)
      .reduce((s, i) => s + Number(i.monto_mxn ?? 0), 0)
    const recuperado = ventaSocios
      .filter((v) => v.socio_id === id)
      .reduce((s, v) => s + Number(v.monto ?? 0), 0)
    const pct = totalInvertido > 0 ? (recuperado / totalInvertido) * 100 : 0
    const roi =
      totalInvertido > 0
        ? ((recuperado - totalInvertido) / totalInvertido) * 100
        : 0
    return { totalInvertido, recuperado, pct, roi }
  }
  const sandra = socioStats(SANDRA_ID)
  const benjamin = socioStats(BENJAMIN_ID)

  // ─── Insights ─────────────────────────────────────────────────────
  const insights: { emoji: string; texto: string }[] = []

  // Mejor cliente del mes
  const clienteMonto = new Map<string, number>()
  for (const v of ventasMes) {
    const nombre =
      v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? "Sin cliente"
    clienteMonto.set(
      nombre,
      (clienteMonto.get(nombre) ?? 0) + Number(v.total ?? 0),
    )
  }
  const topCliente = Array.from(clienteMonto.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0]
  if (topCliente) {
    insights.push({
      emoji: "🏆",
      texto: `Mejor cliente del mes: ${topCliente[0]} con ${mxn.format(topCliente[1])}`,
    })
  }

  // Producto más vendido del mes
  const prodCantidad = new Map<string, number>()
  for (const it of itemsMes) {
    const k = it.productos?.nombre ?? "Desconocido"
    prodCantidad.set(k, (prodCantidad.get(k) ?? 0) + Number(it.cantidad ?? 0))
  }
  const topProd = Array.from(prodCantidad.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0]
  if (topProd) {
    insights.push({
      emoji: "⭐",
      texto: `Producto top del mes: ${topProd[0]} (${topProd[1]} unidades)`,
    })
  }

  // Comparativa vs mes anterior
  insights.push({
    emoji: cambioVentas >= 0 ? "📈" : "📉",
    texto: `Ventas ${cambioVentas >= 0 ? "+" : ""}${cambioVentas.toFixed(1)}% vs el mes pasado`,
  })

  // Próxima cotización por vencer
  const px = proximaCot[0]
  if (px?.valida_hasta) {
    const dias = Math.max(
      0,
      Math.floor(
        (new Date(px.valida_hasta).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      ),
    )
    const cliente =
      px.clientes?.nombre_negocio ?? px.clientes?.nombre ?? "—"
    insights.push({
      emoji: "📅",
      texto: `Cotización ${px.numero} (${cliente}) vence en ${dias} día${dias === 1 ? "" : "s"}`,
    })
  }

  // ─── Activity feed (merge ventas + cots, sort by created_at desc) ─
  type ActivityItem = {
    tipo: "venta" | "cotizacion"
    numero: string
    cliente: string
    total: number
    created_at: string
  }
  const actVentas: ActivityItem[] = allVentasRecientes.map((v) => ({
    tipo: "venta" as const,
    numero: v.numero ?? "—",
    cliente:
      v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? "Sin cliente",
    total: Number(v.total ?? 0),
    created_at: v.created_at ?? v.fecha ?? "",
  }))
  const actCots: ActivityItem[] = allCotsRecientes.map((c) => ({
    tipo: "cotizacion" as const,
    numero: c.numero ?? "—",
    cliente:
      c.clientes?.nombre_negocio ?? c.clientes?.nombre ?? "Sin cliente",
    total: Number(c.total ?? 0),
    created_at: c.created_at ?? c.fecha ?? "",
  }))
  const activity = [...actVentas, ...actCots]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8)

  return (
    <div className="p-8 space-y-8">
      {/* ─── Header premium con KPIs inline ─── */}
      <PageHeader
        title={`${greeting(today)}, Benjamín`}
        subtitle={fechaLarga.format(today)}
        kpis={[
          {
            label: "Ventas del mes",
            value: mxn.format(totalVentasMes),
            sub: `${ventasMes.length} órdenes`,
          },
          {
            label: "Ganancia neta",
            value: mxn.format(gananciaMes),
            sub:
              totalVentasMes > 0
                ? `${((gananciaMes / totalVentasMes) * 100).toFixed(1)}% margen`
                : "Sin ventas",
          },
          {
            label: "Sandra / Benjamin",
            value: `${formatMXNshort(sandra.recuperado)} / ${formatMXNshort(benjamin.recuperado)}`,
            sub: "recuperado",
          },
          {
            label: "Ticket promedio",
            value: mxn.format(ticketMes),
            sub: "este mes",
          },
        ]}
        actions={
          <>
            <Link
              href="/ventas/nueva"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/30"
            >
              <Plus className="size-4" />
              Nueva Venta
            </Link>
            <Link
              href="/cotizaciones/nueva"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-medium text-[#0f2d0f] transition-all hover:bg-white/90"
            >
              <Plus className="size-4" />
              Cotización
            </Link>
          </>
        }
      />

      {/* ─── KPIs secundarios ─── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi
          icon={<Users className="size-5 text-[#0F766E]" />}
          iconBg="bg-[#F9FAFB]"
          label="Clientes activos"
          value={totalClientes.toLocaleString("es-MX")}
          sub="En la base de datos"
        />
        <Kpi
          icon={<FileText className="size-5 text-amber-600" />}
          iconBg="bg-amber-50"
          label="Cotizaciones pendientes"
          value={cotPendCount.toLocaleString("es-MX")}
          sub="Estatus: enviada"
        />
        <Kpi
          icon={<Package className="size-5 text-red-600" />}
          iconBg="bg-red-50"
          label="Stock bajo"
          value={stockBajoCount.toLocaleString("es-MX")}
          sub="Productos en alerta"
          urgent={stockBajoCount > 0}
        />
      </section>

      {/* ─── Chart full-width con summary inline ─── */}
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:shadow-md">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Ventas mensuales
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Últimos 12 meses · Total vendido y ganancia
            </p>
          </div>
          <div className="flex items-center gap-6">
            <ChartSummary
              label="Este mes"
              value={mxn.format(totalVentasMes)}
              tone="text-gray-900"
            />
            <ChartSummary
              label="Mes anterior"
              value={mxn.format(totalVentasMesAnt)}
              tone="text-gray-500"
            />
            <ChartSummary
              label="Cambio"
              value={`${cambioVentas >= 0 ? "+" : ""}${cambioVentas.toFixed(1)}%`}
              tone={
                cambioVentas >= 0 ? "text-emerald-700" : "text-red-700"
              }
            />
            <Link
              href="/ventas/estadisticas"
              className="inline-flex items-center gap-1 text-xs text-teal-600 hover:underline"
            >
              Ver detalle <ArrowRight className="size-3" />
            </Link>
          </div>
        </header>
        <MonthlyChart data={chartData} height={360} />
      </section>

      {/* ─── 3 panels lado a lado, alturas balanceadas ─── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Últimas ventas */}
        <PanelCard title="Últimas ventas" href="/ventas" hrefLabel="Ver todas">
          {recentVentas.length === 0 ? (
            <Empty>Sin ventas todavía.</Empty>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentVentas.map((v) => {
                const cliente =
                  v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? "—"
                return (
                  <li key={v.id}>
                    <Link
                      href={`/ventas/${v.id}`}
                      className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2.5 transition-colors hover:bg-gray-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-xs text-[#0F766E]">
                          {v.numero}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                          {cliente}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums text-gray-900">
                          {mxn.format(Number(v.total ?? 0))}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {v.fecha ? tiempoRelativo(v.fecha) : ""}
                        </div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </PanelCard>

        {/* Stock bajo */}
        <PanelCard
          title="Alertas de stock"
          href="/inventario"
          hrefLabel="Ver inventario"
          badge={
            stockBajoCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                <AlertTriangle className="size-2.5" />
                {stockBajoCount}
              </span>
            ) : null
          }
        >
          {inventarioBajo.length === 0 ? (
            <Empty>Sin alertas. Todo en orden ✓</Empty>
          ) : (
            <ul className="divide-y divide-gray-100">
              {inventarioBajo.slice(0, 5).map((p) => (
                <li
                  key={p.sku ?? p.nombre}
                  className="flex items-center justify-between gap-2 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-gray-900">
                      {p.nombre}
                    </div>
                    <div className="font-mono text-[10px] text-gray-400">
                      {p.sku ?? "—"}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${p.estatus === "agotado" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
                  >
                    {p.stock_actual ?? 0}/{p.stock_minimo ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>

        {/* Cotizaciones pendientes */}
        <PanelCard
          title="Cotizaciones pendientes"
          href="/cotizaciones"
          hrefLabel="Ver todas"
          badge={
            cotPendCount > 0 ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                {cotPendCount}
              </span>
            ) : null
          }
        >
          {cotPendList.length === 0 ? (
            <Empty>Sin pendientes ✓</Empty>
          ) : (
            <ul className="divide-y divide-gray-100">
              {cotPendList.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/cotizaciones/${c.id}`}
                    className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2.5 transition-colors hover:bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs text-[#0F766E]">
                        {c.numero}
                      </div>
                      <div className="truncate text-xs text-gray-500">
                        {c.clientes?.nombre_negocio ??
                          c.clientes?.nombre ??
                          "—"}
                      </div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-gray-900">
                      {mxn.format(Number(c.total ?? 0))}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      </div>

      {/* ─── Socios ─── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SocioCard
          inicial="S"
          nombre="Sandra"
          subtitulo="Socia fundadora"
          stats={sandra}
        />
        <SocioCard
          inicial="B"
          nombre="Benjamin"
          subtitulo="Socio fundador"
          stats={benjamin}
        />
      </section>

      {/* ─── Insights ─── */}
      {insights.length > 0 && (
        <section className="rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <header className="mb-4 flex items-center gap-2">
            <Sparkles className="size-4 text-[#0F766E]" />
            <h3 className="text-sm font-semibold text-gray-900">Insights</h3>
          </header>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {insights.map((i, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-[#EEF1F4] bg-[#F9FAFB] p-3"
              >
                <p className="text-sm text-gray-700">
                  <span className="mr-1.5">{i.emoji}</span>
                  {i.texto}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Activity feed ─── */}
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <header className="mb-4 flex items-center gap-2">
          <Calendar className="size-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">
            Actividad reciente
          </h2>
        </header>
        {activity.length === 0 ? (
          <Empty>Sin actividad reciente.</Empty>
        ) : (
          <ul className="divide-y divide-gray-100">
            {activity.map((a, i) => {
              const Icon = a.tipo === "venta" ? ShoppingBag : FileText
              const iconColor =
                a.tipo === "venta"
                  ? "bg-teal-50 text-teal-600"
                  : "bg-[#F9FAFB] text-[#0F766E]"
              const tipoLabel = a.tipo === "venta" ? "Venta" : "Cotización"
              const href =
                a.tipo === "venta"
                  ? `/ventas` // no tenemos ID directo aquí pero es OK
                  : `/cotizaciones`
              return (
                <li
                  key={`${a.tipo}-${a.numero}-${i}`}
                  className="flex items-center gap-3 py-3 hover:bg-gray-50 -mx-2 px-2 rounded-md transition-colors"
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${iconColor}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-900">
                      {tipoLabel}{" "}
                      <Link
                        href={href}
                        className="font-mono text-[#0F766E] hover:underline"
                      >
                        {a.numero}
                      </Link>
                      <span className="text-gray-400"> · </span>
                      <span className="text-gray-700">{a.cliente}</span>
                      <span className="text-gray-400"> · </span>
                      <span className="font-semibold tabular-nums text-gray-900">
                        {mxn.format(a.total)}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {a.created_at ? tiempoRelativo(a.created_at) : ""}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
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
  urgent,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  sub?: string
  change?: number
  urgent?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md cursor-default ${urgent ? "border-red-100" : "border-gray-100"}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className={`p-2 rounded-xl ${iconBg}`}>{icon}</div>
        {change !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-medium ${
              change >= 0
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-3xl font-bold tabular-nums text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function ChartSummary({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: string
}) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-[10px] uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${tone}`}>
        {value}
      </span>
    </div>
  )
}

function PanelCard({
  title,
  href,
  hrefLabel,
  badge,
  children,
}: {
  title: string
  href: string
  hrefLabel: string
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {badge}
        </div>
        <Link
          href={href}
          className="text-xs text-teal-600 hover:underline inline-flex items-center gap-1"
        >
          {hrefLabel} <ArrowRight className="size-3" />
        </Link>
      </header>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-6 text-center text-xs text-gray-400">{children}</div>
  )
}

function SocioCard({
  inicial,
  nombre,
  subtitulo,
  stats,
}: {
  inicial: string
  nombre: string
  subtitulo: string
  stats: {
    totalInvertido: number
    recuperado: number
    pct: number
    roi: number
  }
}) {
  return (
    <div className="rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-[#F3F5F7] text-sm font-semibold text-gray-700">
          {inicial}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{nombre}</p>
          <p className="text-xs text-gray-500">{subtitulo}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
            Invertido
          </p>
          <p className="mt-1 font-bold tabular-nums text-gray-900">
            {mxn.format(stats.totalInvertido)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
            Recuperado
          </p>
          <p className="mt-1 font-bold tabular-nums text-emerald-600">
            {mxn.format(stats.recuperado)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
            ROI
          </p>
          <p
            className={`mt-1 font-bold tabular-nums ${stats.roi >= 0 ? "text-[#0F766E]" : "text-rose-600"}`}
          >
            {stats.roi >= 0 ? "+" : ""}
            {stats.roi.toFixed(1)}%
          </p>
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-[11px] font-medium text-gray-500">
          <span>Recuperación</span>
          <span className="tabular-nums text-gray-700">
            {stats.pct.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#F3F5F7]">
          <div
            className="h-full rounded-full bg-[#0F766E] transition-all duration-500"
            style={{ width: `${Math.min(100, stats.pct)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
