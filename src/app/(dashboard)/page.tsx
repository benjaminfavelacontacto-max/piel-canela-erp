import Link from "next/link"
import {
  ShoppingBag,
  TrendingUp,
  Users,
  FileText,
  Package,
  ArrowRight,
  Plus,
  UserPlus,
  PackagePlus,
  Wallet,
  BarChart3,
  BrainCircuit,
  AlertTriangle,
  CircleDollarSign,
} from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getInternalClienteIds } from "@/lib/internal-clientes"
import { formatMXN } from "@/lib/utils"
import { buildImageMap, findImageFor } from "@/lib/storage-images"
import { MonthlyChart } from "./ventas/estadisticas/monthly-chart"
import { PortalBadge, type PortalCotizacion } from "./portal-badge"
import { DashboardHero } from "./dashboard-hero"
import { DashboardWidgets, type WidgetSlot } from "./dashboard-widgets"
import { GoalCard } from "./goal-card"
import { TopProductos, type ProductoRank } from "./top-productos"
import type { SearchItem } from "./global-search"

import { parseFecha } from "@/lib/fecha"

const SANDRA_ID = "4f21084b-dfe9-45f3-be80-935dc1a5e7a5"
const BENJAMIN_ID = "3165fe33-c760-4373-84d0-e1cd14d863b3"

const fechaLarga = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
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

// Avatares por hash del nombre (estable entre renders y filtros)
const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #0F766E, #14B8A6)",
  "linear-gradient(135deg, #475569, #94A3B8)",
  "linear-gradient(135deg, #B45309, #F59E0B)",
  "linear-gradient(135deg, #1D4ED8, #60A5FA)",
  "linear-gradient(135deg, #047857, #34D399)",
  "linear-gradient(135deg, #7C3AED, #A78BFA)",
]
function avatarGradient(nombre: string) {
  let h = 0
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length]
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
  const en3dias = new Date(
    today.getFullYear(), today.getMonth(), today.getDate() + 3,
  ).toISOString().slice(0, 10)
  const hace7dias = new Date(
    today.getFullYear(), today.getMonth(), today.getDate() - 7,
  ).toISOString()

  const [
    ventasMesRes,
    ventasMesAntRes,
    ventasAllRes,
    clientesCountRes,
    clientesNuevosRes,
    cotizacionesPendCountRes,
    cotPorVencerRes,
    pagosPendRes,
    inventarioBajoRes,
    inversionesRes,
    ventaSociosRes,
    itemsTopMesRes,
    itemsAllRes,
    todasCotsRecRes,
    todasVentasRecRes,
    cotizacionesPortalRes,
    searchClientesRes,
    searchProductosRes,
  ] = await Promise.all([
    supabase
      .from("ventas")
      .select(
        "id, fecha, total, utilidad_neta, estatus, cliente_id, clientes(nombre, nombre_negocio)",
      )
      .gte("fecha", monthStart),
    supabase
      .from("ventas")
      .select("total, utilidad_neta, estatus, cliente_id")
      .gte("fecha", lastMonthStart)
      .lte("fecha", lastMonthEnd),
    supabase
      .from("ventas")
      .select("id, fecha, total, utilidad_neta, estatus, cliente_id")
      .order("fecha", { ascending: true }),
    supabase.from("clientes").select("*", { count: "exact", head: true }),
    supabase
      .from("clientes")
      .select("*", { count: "exact", head: true })
      .gte("created_at", hace7dias),
    supabase
      .from("cotizaciones")
      .select("*", { count: "exact", head: true })
      .eq("estatus", "enviada"),
    admin
      .from("cotizaciones")
      .select(
        "id, numero, total, valida_hasta, cliente_id, clientes(nombre, nombre_negocio)",
      )
      .eq("estatus", "enviada")
      .lte("valida_hasta", en3dias)
      .gte("valida_hasta", todayIso)
      .order("valida_hasta", { ascending: true })
      .limit(6),
    admin
      .from("ventas")
      .select(
        "id, numero, total, saldo_pendiente, estatus, cliente_id, clientes(nombre, nombre_negocio)",
      )
      .in("estatus", ["pendiente", "pagada_parcial"])
      .order("saldo_pendiente", { ascending: false })
      .limit(8),
    supabase
      .from("vista_inventario")
      .select("sku, nombre, stock_actual, stock_minimo, estatus")
      .in("estatus", ["bajo", "agotado"])
      .order("stock_actual", { ascending: true })
      .limit(8),
    admin.from("inversiones").select("socio_id, monto_mxn"),
    admin.from("venta_socios").select("venta_id, socio_id, monto"),
    admin
      .from("venta_items")
      .select("venta_id, cantidad, precio_unitario, productos(nombre, sku)")
      .gte("created_at", monthStart),
    admin
      .from("venta_items")
      .select(
        "venta_id, cantidad, precio_unitario, costo_unitario, productos(nombre, nombre_display, sku, imagen_url, categorias(nombre))",
      ),
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
    admin
      .from("cotizaciones")
      .select(
        "id, numero, total, created_at, clientes(nombre, nombre_negocio, telefono)",
      )
      .eq("estatus", "borrador")
      .ilike("numero", "%-P-Portal")
      .order("created_at", { ascending: false })
      .limit(20),
    // Índice del buscador global (compacto, filtrado en el cliente)
    admin
      .from("clientes")
      .select("id, nombre, nombre_negocio, ciudad")
      .order("nombre")
      .limit(400),
    admin
      .from("productos")
      .select("nombre, nombre_display, sku")
      .order("nombre")
      .limit(500),
  ])

  // Excluir clientes internos (Piel Canela) de KPIs y feeds.
  const [internalIds, imageMap] = await Promise.all([
    getInternalClienteIds(),
    buildImageMap(),
  ])
  const isInternalCli = (cli: string | null | undefined) =>
    !!cli && internalIds.has(cli)

  type VentaRow = {
    id: string
    total: number | null
    utilidad_neta: number | null
    saldo_pendiente?: number | null
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
  ).filter((v) => !isInternalCli(v.cliente_id) && v.estatus !== "cancelada")
  const ventasMesAnt = (
    (ventasMesAntRes.data ?? []) as unknown as VentaRow[]
  ).filter((v) => !isInternalCli(v.cliente_id) && v.estatus !== "cancelada")
  const ventasAllRaw = (ventasAllRes.data ?? []) as {
    id: string
    fecha: string
    total: number | null
    utilidad_neta: number | null
    estatus: Estatus
    cliente_id: string | null
  }[]
  const ventasAll = ventasAllRaw.filter((v) => !isInternalCli(v.cliente_id))
  const excludedVentaIds = new Set(
    ventasAllRaw
      .filter((v) => isInternalCli(v.cliente_id) || v.estatus === "cancelada")
      .map((v) => v.id),
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
  ).filter((vs) => !excludedVentaIds.has(vs.venta_id))
  const cotPorVencer = (
    (cotPorVencerRes.data ?? []) as unknown as VentaRow[]
  ).filter((c) => !isInternalCli(c.cliente_id))
  const pagosPend = (
    (pagosPendRes.data ?? []) as unknown as VentaRow[]
  ).filter((v) => !isInternalCli(v.cliente_id))
  const itemsMes = (
    (itemsTopMesRes.data ?? []) as unknown as {
      venta_id: string
      cantidad: number
      precio_unitario: number
      productos: { nombre: string; sku: string | null } | null
    }[]
  ).filter((it) => !excludedVentaIds.has(it.venta_id))
  const inventarioBajo = (inventarioBajoRes.data ?? []) as {
    sku: string | null
    nombre: string
    stock_actual: number | null
    stock_minimo: number | null
    estatus: string
  }[]
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

  // ─── KPIs ─────────────────────────────────────────────────────────
  const totalVentasMes = ventasMes.reduce((s, v) => s + Number(v.total ?? 0), 0)
  const gananciaMes = ventasMes.reduce(
    (s, v) => s + Number(v.utilidad_neta ?? 0),
    0,
  )
  const totalVentasMesAnt = ventasMesAnt.reduce(
    (s, v) => s + Number(v.total ?? 0),
    0,
  )
  const cambioVentas = pctChange(totalVentasMes, totalVentasMesAnt)
  const gananciaMesAnt = ventasMesAnt.reduce(
    (s, v) => s + Number(v.utilidad_neta ?? 0),
    0,
  )
  const cambioGanancia = pctChange(gananciaMes, gananciaMesAnt)
  const margenMes = totalVentasMes > 0 ? (gananciaMes / totalVentasMes) * 100 : 0
  const ticketMes = ventasMes.length > 0 ? totalVentasMes / ventasMes.length : 0
  const ticketMesAnt =
    ventasMesAnt.length > 0
      ? totalVentasMesAnt / Math.max(1, ventasMesAnt.length)
      : 0
  const cambioTicket = pctChange(ticketMes, ticketMesAnt)
  const totalClientes = clientesCountRes.count ?? 0
  const clientesNuevos = clientesNuevosRes.count ?? 0
  const cotPendCount = cotizacionesPendCountRes.count ?? 0
  const stockBajoCount = inventarioBajo.length
  const ventasHoyArr = ventasMes.filter((v) => v.fecha === todayIso)
  const ventasHoy = ventasHoyArr.reduce((s, v) => s + Number(v.total ?? 0), 0)
  const pagosPendTotal = pagosPend.reduce(
    (s, v) => s + Number(v.saldo_pendiente ?? 0),
    0,
  )

  // Portal badge
  type CotPortalRaw = {
    id: string
    numero: string
    total: number | null
    created_at: string
    clientes: {
      nombre: string | null
      nombre_negocio: string | null
      telefono: string | null
    } | null
  }
  const cotizacionesPortal: PortalCotizacion[] = (
    (cotizacionesPortalRes.data ?? []) as unknown as CotPortalRaw[]
  ).map((c) => ({
    id: c.id,
    numero: c.numero,
    total: Number(c.total ?? 0),
    created_at: c.created_at,
    cliente_nombre: c.clientes?.nombre_negocio ?? c.clientes?.nombre ?? null,
    cliente_telefono: c.clientes?.telefono ?? null,
  }))

  // ─── Serie mensual (12 meses) ─────────────────────────────────────
  const monthly: Map<
    string,
    { mes: string; total: number; ganancia: number; count: number }
  > = new Map()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    monthly.set(ymKey(d), { mes: ymKey(d), total: 0, ganancia: 0, count: 0 })
  }
  for (const v of ventasAll) {
    if (v.estatus === "cancelada") continue
    const d = parseFecha(v.fecha)
    if (Number.isNaN(d.getTime())) continue
    const b = monthly.get(ymKey(d))
    if (!b) continue
    b.total += Number(v.total ?? 0)
    b.ganancia += Number(v.utilidad_neta ?? 0)
    b.count += 1
  }
  const chartData = Array.from(monthly.values())

  // Meta sugerida: mejor mes de los últimos 12 redondeado a decenas de miles.
  const mejorMes = Math.max(...chartData.map((d) => d.total), 0)
  const metaSugerida = Math.max(50000, Math.ceil(mejorMes / 10000) * 10000)

  // ─── Socios ───────────────────────────────────────────────────────
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

  // ─── Estado general del negocio (18) ──────────────────────────────
  let score = 0
  if (cambioVentas >= 10) score += 2
  else if (cambioVentas >= 0) score += 1
  if (margenMes >= 30) score += 2
  else if (margenMes >= 15) score += 1
  if (stockBajoCount === 0) score += 1
  if (pagosPend.length === 0) score += 1
  const estado =
    score >= 5
      ? { nivel: "Excelente", emoji: "🟢", tone: "#059669" }
      : score >= 3
        ? { nivel: "Bien", emoji: "🟢", tone: "#059669" }
        : score >= 2
          ? { nivel: "Atención", emoji: "🟡", tone: "#D97706" }
          : { nivel: "En riesgo", emoji: "🔴", tone: "#DC2626" }

  // ─── Panel IA (reglas, no LLM) ────────────────────────────────────
  const prodRevenue = new Map<string, number>()
  let revenueItemsMes = 0
  for (const it of itemsMes) {
    const monto = Number(it.cantidad ?? 0) * Number(it.precio_unitario ?? 0)
    revenueItemsMes += monto
    const k = it.productos?.nombre ?? "Desconocido"
    prodRevenue.set(k, (prodRevenue.get(k) ?? 0) + monto)
  }
  const topProdRev = Array.from(prodRevenue.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0]
  const iaLineas: string[] = []
  iaLineas.push(
    cambioVentas >= 0
      ? `Las ventas crecieron ${cambioVentas.toFixed(0)}% vs el mes anterior.`
      : `Las ventas bajaron ${Math.abs(cambioVentas).toFixed(0)}% vs el mes anterior.`,
  )
  if (topProdRev && revenueItemsMes > 0) {
    iaLineas.push(
      `${topProdRev[0]} representa el ${((topProdRev[1] / revenueItemsMes) * 100).toFixed(0)}% de tus ingresos del mes.`,
    )
  }
  if (stockBajoCount > 0) {
    iaLineas.push(
      `Riesgo de quedarte sin inventario en ${stockBajoCount} producto${stockBajoCount === 1 ? "" : "s"}.`,
    )
  }
  if (pagosPendTotal > 0) {
    iaLineas.push(
      `Tienes ${formatMXN(pagosPendTotal)} por cobrar en ${pagosPend.length} venta${pagosPend.length === 1 ? "" : "s"}.`,
    )
  }
  const iaRecomendacion =
    stockBajoCount > 0
      ? `Se recomienda reponer inventario (${inventarioBajo
          .slice(0, 2)
          .map((p) => p.nombre)
          .join(", ")}${stockBajoCount > 2 ? "…" : ""}).`
      : pagosPendTotal > 0
        ? "Se recomienda dar seguimiento a los pagos pendientes."
        : cotPendCount > 0
          ? "Se recomienda dar seguimiento a las cotizaciones enviadas."
          : "Todo en orden — buen momento para impulsar ventas."

  // ─── Top productos: qué se mueve, qué deja utilidad, qué cintas gustan ──
  type ItemAllRow = {
    venta_id: string
    cantidad: number
    precio_unitario: number
    costo_unitario: number | null
    productos: {
      nombre: string
      nombre_display: string | null
      sku: string | null
      imagen_url: string | null
      categorias: { nombre: string } | null
    } | null
  }
  const itemsAll = (
    (itemsAllRes.data ?? []) as unknown as ItemAllRow[]
  ).filter((it) => !excludedVentaIds.has(it.venta_id))

  // Piezas de ESTE mes por producto (badge "+N este mes")
  const piezasMesPorKey = new Map<string, number>()
  for (const it of itemsMes) {
    const k = it.productos?.sku ?? it.productos?.nombre ?? "?"
    piezasMesPorKey.set(k, (piezasMesPorKey.get(k) ?? 0) + Number(it.cantidad ?? 0))
  }

  const esCinta = (r: ItemAllRow) => {
    const sku = (r.productos?.sku ?? "").toUpperCase()
    const cat = (r.productos?.categorias?.nombre ?? "").toUpperCase()
    return sku.startsWith("CN-") || cat.includes("CINTA")
  }

  const prodAgg = new Map<string, ProductoRank & { cinta: boolean }>()
  for (const it of itemsAll) {
    const key = it.productos?.sku ?? it.productos?.nombre ?? "?"
    const display = it.productos?.nombre_display ?? it.productos?.nombre ?? "Producto"
    const cantidad = Number(it.cantidad ?? 0)
    const ingresos = cantidad * Number(it.precio_unitario ?? 0)
    // Utilidad de la partida: (precio − costo) × cantidad. Los regalos van con
    // precio $0, así que restan utilidad solos — no hay que tratarlos aparte.
    const utilidad =
      cantidad * (Number(it.precio_unitario ?? 0) - Number(it.costo_unitario ?? 0))
    const cur =
      prodAgg.get(key) ??
      {
        nombre: display,
        sku: it.productos?.sku ?? null,
        imagen: findImageFor(display, it.productos?.imagen_url ?? null, imageMap),
        piezas: 0,
        ingresos: 0,
        utilidad: 0,
        margen: 0,
        piezasMes: piezasMesPorKey.get(key) ?? 0,
        cinta: esCinta(it),
      }
    cur.piezas += cantidad
    cur.ingresos += ingresos
    cur.utilidad += utilidad
    prodAgg.set(key, cur)
  }
  const rankBase = Array.from(prodAgg.values()).map((p) => ({
    ...p,
    margen: p.ingresos > 0 ? (p.utilidad / p.ingresos) * 100 : 0,
  }))
  const masVendidos = [...rankBase].sort((a, b) => b.piezas - a.piezas).slice(0, 5)
  const masUtilidad = [...rankBase]
    .sort((a, b) => b.utilidad - a.utilidad)
    .slice(0, 5)
  const cintasTop = rankBase
    .filter((p) => p.cinta)
    .sort((a, b) => b.piezas - a.piezas)
    .slice(0, 5)

  // ─── Acciones sugeridas (26: ¿qué debo hacer ahora?) ──────────────
  const acciones: { label: string; href: string }[] = []
  if (stockBajoCount > 0)
    acciones.push({
      label: `Reponer inventario (${stockBajoCount})`,
      href: "/inventario",
    })
  if (cotPorVencer[0])
    acciones.push({
      label: `Dar seguimiento a ${cotPorVencer[0].numero}`,
      href: `/cotizaciones/${cotPorVencer[0].id}`,
    })
  if (pagosPend[0])
    acciones.push({
      label: `Cobrar ${pagosPend[0].numero} (${formatMXN(Number(pagosPend[0].saldo_pendiente ?? 0))})`,
      href: `/ventas/${pagosPend[0].id}`,
    })
  if (ventasHoyArr.length === 0)
    acciones.push({ label: "Registrar la primera venta de hoy", href: "/ventas/nueva" })

  // ─── Índice del buscador global ───────────────────────────────────
  type CliIdx = {
    id: string
    nombre: string
    nombre_negocio: string | null
    ciudad: string | null
  }
  type ProdIdx = { nombre: string; nombre_display: string | null; sku: string | null }
  const searchItems: SearchItem[] = [
    ...((searchClientesRes.data ?? []) as CliIdx[]).map((c) => ({
      tipo: "cliente" as const,
      label: c.nombre_negocio ?? c.nombre,
      sub: c.nombre_negocio ? c.nombre : c.ciudad,
      href: `/clientes/${c.id}`,
    })),
    ...((searchProductosRes.data ?? []) as ProdIdx[]).map((p) => ({
      tipo: "producto" as const,
      label: p.nombre_display ?? p.nombre,
      sub: p.sku,
      href: "/inventario",
    })),
    ...allVentasRecientes.map((v) => ({
      tipo: "venta" as const,
      label: v.numero ?? "—",
      sub: v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? null,
      href: `/ventas/${v.id}`,
    })),
    ...allCotsRecientes.map((c) => ({
      tipo: "cotizacion" as const,
      label: c.numero ?? "—",
      sub: c.clientes?.nombre_negocio ?? c.clientes?.nombre ?? null,
      href: `/cotizaciones/${c.id}`,
    })),
  ]

  // ─── Actividad (merge ventas + cotizaciones) ──────────────────────
  type ActivityItem = {
    tipo: "venta" | "cotizacion"
    numero: string
    cliente: string
    total: number
    created_at: string
    href: string
  }
  const activity: ActivityItem[] = [
    ...allVentasRecientes.map((v) => ({
      tipo: "venta" as const,
      numero: v.numero ?? "—",
      cliente: v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? "Sin cliente",
      total: Number(v.total ?? 0),
      created_at: v.created_at ?? v.fecha ?? "",
      href: v.id ? `/ventas/${v.id}` : "/ventas",
    })),
    ...allCotsRecientes.map((c) => ({
      tipo: "cotizacion" as const,
      numero: c.numero ?? "—",
      cliente: c.clientes?.nombre_negocio ?? c.clientes?.nombre ?? "Sin cliente",
      total: Number(c.total ?? 0),
      created_at: c.created_at ?? c.fecha ?? "",
      href: c.id ? `/cotizaciones/${c.id}` : "/cotizaciones",
    })),
  ]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8)

  // ─── Widgets modulares (16) ───────────────────────────────────────
  const slots: WidgetSlot[] = [
    {
      id: "panorama",
      nombre: "Gráfica e inteligencia",
      node: (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* Gráfica ejecutiva (8): 30% más baja, resumen arriba */}
          <div className="pc-card xl:col-span-2">
            <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Ventas</h2>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-[-0.02em] tabular-nums text-gray-900">
                    {formatMXN(totalVentasMes)}
                  </span>
                  <span
                    className={`text-[12px] font-semibold tabular-nums ${
                      cambioVentas >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {cambioVentas >= 0 ? "▲" : "▼"}{" "}
                    {Math.abs(cambioVentas).toFixed(1)}%
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  Últimos 12 meses
                </p>
              </div>
              <Link
                href="/ventas/estadisticas"
                className="inline-flex items-center gap-1 text-[12px] font-medium text-[#0F766E] transition-colors hover:text-[#115E59] hover:underline"
              >
                Ver reportes <ArrowRight className="size-3" />
              </Link>
            </header>
            <MonthlyChart data={chartData} height={224} />
          </div>

          {/* Columna: Estado del negocio + Panel IA */}
          <div className="flex flex-col gap-4">
            {/* Estado del negocio (18) — gradiente sutil permitido (23) */}
            <div
              className="rounded-[20px] border border-black/5 p-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)]"
              style={{
                background:
                  "linear-gradient(150deg, #FFFFFF 0%, #FAFDFB 60%, rgba(15,118,110,0.06) 100%)",
              }}
            >
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                Estado del negocio
              </p>
              <p className="mt-2 flex items-center gap-2 text-xl font-bold text-gray-900">
                <span aria-hidden>{estado.emoji}</span> {estado.nivel}
              </p>
              <dl className="mt-4 space-y-2.5">
                <EstadoRow
                  label={cambioVentas >= 0 ? "Ventas creciendo" : "Ventas a la baja"}
                  value={`${cambioVentas >= 0 ? "+" : ""}${cambioVentas.toFixed(0)}%`}
                  ok={cambioVentas >= 0}
                />
                <EstadoRow
                  label={margenMes >= 30 ? "Margen saludable" : "Margen ajustado"}
                  value={`${margenMes.toFixed(0)}%`}
                  ok={margenMes >= 30}
                />
                <EstadoRow
                  label={
                    stockBajoCount === 0
                      ? "Inventario en orden"
                      : `${stockBajoCount} alertas de stock`
                  }
                  value={stockBajoCount === 0 ? "✓" : String(stockBajoCount)}
                  ok={stockBajoCount === 0}
                />
                <EstadoRow
                  label={
                    pagosPend.length === 0
                      ? "Sin pagos pendientes"
                      : "Pagos por cobrar"
                  }
                  value={
                    pagosPend.length === 0 ? "✓" : formatMXN(pagosPendTotal)
                  }
                  ok={pagosPend.length === 0}
                />
              </dl>
            </div>

            {/* Panel IA (11) — reglas del negocio, no LLM */}
            <div className="relative overflow-hidden rounded-[20px] border border-black/5 bg-[#0E1B18] p-6 text-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(20,184,166,0.25), transparent 70%)" }}
              />
              <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-teal-300">
                <BrainCircuit className="size-3.5" />
                Análisis IA
              </p>
              <ul className="mt-3 space-y-2">
                {iaLineas.map((l, i) => (
                  <li key={i} className="text-[12.5px] leading-snug text-white/80">
                    {l}
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-white/10 pt-3 text-[12.5px] font-medium leading-snug text-teal-200">
                {iaRecomendacion}
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "productos",
      nombre: "Top productos",
      node: (
        <TopProductos
          masVendidos={masVendidos}
          masUtilidad={masUtilidad}
          cintasTop={cintasTop}
        />
      ),
    },
    {
      id: "atencion",
      nombre: "Qué necesita atención",
      node: (
        <div>
          <SectionTitle>¿Qué necesita atención?</SectionTitle>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <PanelCard
              title="Stock bajo"
              href="/inventario"
              hrefLabel="Ver inventario"
              badge={
                stockBajoCount > 0 ? (
                  <Badge tone="danger">
                    <AlertTriangle className="size-2.5" />
                    {stockBajoCount}
                  </Badge>
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
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          p.estatus === "agotado"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {p.stock_actual ?? 0}/{p.stock_minimo ?? 0}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            <PanelCard
              title="Cotizaciones por vencer"
              href="/cotizaciones"
              hrefLabel="Ver todas"
              badge={
                cotPorVencer.length > 0 ? (
                  <Badge tone="warning">{cotPorVencer.length}</Badge>
                ) : null
              }
            >
              {cotPorVencer.length === 0 ? (
                <Empty>Nada vence en los próximos 3 días ✓</Empty>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {cotPorVencer.slice(0, 5).map((c) => (
                    <li key={c.id}>
                      <RowLink
                        href={`/cotizaciones/${c.id}`}
                        top={c.numero ?? "—"}
                        bottom={
                          c.clientes?.nombre_negocio ?? c.clientes?.nombre ?? "—"
                        }
                        right={formatMXN(Number(c.total ?? 0))}
                        rightSub={
                          c.valida_hasta === todayIso
                            ? "vence hoy"
                            : `vence ${c.valida_hasta}`
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            <PanelCard
              title="Pagos pendientes"
              href="/ventas"
              hrefLabel="Ver ventas"
              badge={
                pagosPend.length > 0 ? (
                  <Badge tone="warning">{formatMXN(pagosPendTotal)}</Badge>
                ) : null
              }
            >
              {pagosPend.length === 0 ? (
                <Empty>Todo cobrado ✓</Empty>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {pagosPend.slice(0, 5).map((v) => (
                    <li key={v.id}>
                      <RowLink
                        href={`/ventas/${v.id}`}
                        top={v.numero ?? "—"}
                        bottom={
                          v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? "—"
                        }
                        right={formatMXN(Number(v.saldo_pendiente ?? 0))}
                        rightSub="por cobrar"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>
          </div>

          {acciones.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                Hacer ahora →
              </span>
              {acciones.map((a) => (
                <Link
                  key={a.href + a.label}
                  href={a.href}
                  className="pc-quick-action !h-8 !rounded-full !px-3 !text-[12px]"
                >
                  {a.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "socios",
      nombre: "Socios",
      node: (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
        </div>
      ),
    },
    {
      id: "actividad",
      nombre: "Actividad reciente",
      node: (
        <section className="pc-card">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Actividad reciente
            </h2>
            <span className="text-[11px] text-gray-400">
              últimas ventas y cotizaciones
            </span>
          </header>
          {activity.length === 0 ? (
            <Empty>Sin actividad reciente.</Empty>
          ) : (
            <ul>
              {activity.map((a, i) => (
                <li
                  key={`${a.tipo}-${a.numero}-${i}`}
                  className="group relative flex items-center gap-3 py-2.5"
                >
                  {/* Línea de tiempo */}
                  {i < activity.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute left-[15px] top-10 h-[calc(100%-24px)] w-px bg-gray-100"
                    />
                  )}
                  <span
                    className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                    style={{ background: avatarGradient(a.cliente) }}
                    aria-hidden
                  >
                    {a.cliente
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w) => w[0]?.toUpperCase() ?? "")
                      .join("")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-gray-900">
                      <span className="font-medium">{a.cliente}</span>
                      <span className="text-gray-400"> · </span>
                      {a.tipo === "venta" ? "Venta" : "Cotización"}{" "}
                      <Link
                        href={a.href}
                        className="font-mono text-[12px] text-[#0F766E] hover:underline"
                      >
                        {a.numero}
                      </Link>
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {a.created_at ? tiempoRelativo(a.created_at) : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                    {formatMXN(a.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ),
    },
  ]

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:space-y-8 md:p-8">
      {/* 1. Hero / resumen ejecutivo */}
      <DashboardHero
        nombre="Benjamín"
        fechaLarga={fechaLarga.format(today)}
        ventasHoy={ventasHoy}
        ordenesHoy={ventasHoyArr.length}
        ventasMes={totalVentasMes}
        ventasMesAnt={totalVentasMesAnt}
        cambioVentas={cambioVentas}
        ordenesMes={ventasMes.length}
        estado={estado}
        searchItems={searchItems}
      />

      {/* 2. Acciones rápidas */}
      <nav
        aria-label="Acciones rápidas"
        className="pc-enter flex flex-wrap gap-2"
        style={{ animationDelay: "60ms" }}
      >
        <Link href="/ventas/nueva" className="pc-quick-action">
          <Plus className="size-4" /> Nueva venta
        </Link>
        <Link href="/cotizaciones/nueva" className="pc-quick-action">
          <FileText className="size-4" /> Nueva cotización
        </Link>
        <Link href="/clientes/nuevo" className="pc-quick-action">
          <UserPlus className="size-4" /> Nuevo cliente
        </Link>
        <Link href="/inventario" className="pc-quick-action">
          <PackagePlus className="size-4" /> Nuevo producto
        </Link>
        <Link href="/ventas" className="pc-quick-action">
          <Wallet className="size-4" /> Registrar pago
        </Link>
        <Link href="/ventas/estadisticas" className="pc-quick-action">
          <BarChart3 className="size-4" /> Ver reportes
        </Link>
      </nav>

      {/* 3. KPIs — jerarquía: 1 grande + meta + ticket, luego fila menor */}
      <section
        aria-label="Indicadores principales"
        className="pc-enter space-y-3"
        style={{ animationDelay: "120ms" }}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            featured
            className="md:col-span-2"
            label="Ganancia neta del mes"
            value={formatMXN(gananciaMes)}
            trend={cambioGanancia}
            sub={`${margenMes.toFixed(1)}% de margen · vs mes anterior`}
            spark={chartData.map((d) => d.ganancia)}
            icon={<TrendingUp className="size-4 text-[#0F766E]" />}
            title="Suma de utilidad_neta de las ventas del mes (sin internas ni canceladas)"
          />
          <GoalCard ventasMes={totalVentasMes} metaSugerida={metaSugerida} />
          <KpiTile
            label="Ticket promedio"
            value={formatMXN(ticketMes)}
            trend={cambioTicket}
            sub={`${ventasMes.length} órdenes este mes`}
            spark={chartData.map((d) => (d.count > 0 ? d.total / d.count : 0))}
            icon={<ShoppingBag className="size-4 text-gray-500" />}
            title="Ventas del mes ÷ número de órdenes"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KpiTile
            small
            label="Clientes"
            value={totalClientes.toLocaleString("es-MX")}
            sub={
              clientesNuevos > 0
                ? `+${clientesNuevos} esta semana`
                : "sin altas esta semana"
            }
            icon={<Users className="size-4 text-gray-500" />}
            href="/clientes"
            title="Clientes en la base · altas de los últimos 7 días"
          />
          <PortalBadge cotizaciones={cotizacionesPortal}>
            <KpiTile
              small
              label="Cotizaciones"
              value={cotPendCount.toLocaleString("es-MX")}
              sub={
                cotPorVencer.length > 0
                  ? `${cotPorVencer.length} vencen pronto`
                  : "ninguna por vencer"
              }
              icon={<FileText className="size-4 text-amber-600" />}
              title="Cotizaciones en estatus enviada · vencen en ≤3 días"
            />
          </PortalBadge>
          <KpiTile
            small
            label="Stock bajo"
            value={stockBajoCount.toLocaleString("es-MX")}
            sub="Ver inventario →"
            icon={<Package className="size-4 text-rose-500" />}
            href="/inventario"
            urgent={stockBajoCount > 0}
            title="Productos con existencias en o bajo el mínimo"
          />
          <KpiTile
            small
            label="Por cobrar"
            value={formatMXN(pagosPendTotal)}
            sub={`${pagosPend.length} venta${pagosPend.length === 1 ? "" : "s"} con saldo`}
            icon={<CircleDollarSign className="size-4 text-amber-600" />}
            href="/ventas"
            urgent={pagosPendTotal > 0}
            title="Suma de saldo_pendiente de ventas pendientes o parciales"
          />
        </div>
      </section>

      {/* 4-7. Widgets modulares (arrastra el asa para reordenar) */}
      <div className="pc-enter" style={{ animationDelay: "180ms" }}>
        <DashboardWidgets slots={slots} />
      </div>
    </div>
  )
}

// ─── Piezas de presentación (server) ─────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-gray-500">
      {children}
    </h2>
  )
}

function Sparkline({ points }: { points: number[] }) {
  const w = 96
  const h = 28
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const step = points.length > 1 ? w / (points.length - 1) : 0
  const path = points
    .map((v, i) => {
      const x = i * step
      const y = h - ((v - min) / range) * h
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(" ")
  const positive = points[points.length - 1] >= points[0]
  const stroke = positive ? "#0F766E" : "#94A3B8"
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      fill="none"
      className="h-7 w-full opacity-50"
      aria-hidden
    >
      <path d={`${path} L ${w} ${h} L 0 ${h} Z`} fill={stroke} fillOpacity="0.06" />
      <path
        d={path}
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function KpiTile({
  label,
  value,
  sub,
  trend,
  spark,
  icon,
  href,
  urgent,
  featured,
  small,
  className = "",
  title,
}: {
  label: string
  value: string
  sub?: string
  trend?: number
  spark?: number[]
  icon?: React.ReactNode
  href?: string
  urgent?: boolean
  featured?: boolean
  small?: boolean
  className?: string
  /** Tooltip nativo: de dónde sale el número. */
  title?: string
}) {
  const inner = (
    <div
      className={`pc-kpi-card h-full ${featured ? "justify-between" : ""} ${className}`}
      title={title}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-500">
          {icon}
          {label}
        </p>
        {trend !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${
              trend >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            <span aria-hidden className="text-[8px]">
              {trend >= 0 ? "▲" : "▼"}
            </span>
            {trend >= 0 ? "+" : ""}
            {trend.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-3">
        <p
          className={`font-bold leading-none tracking-[-0.025em] tabular-nums ${
            urgent ? "text-[#DC2626]" : "text-gray-900"
          } ${featured ? "text-[32px]" : small ? "text-xl" : "text-[26px]"}`}
        >
          {value}
        </p>
        {spark && spark.length > 1 && (
          <div className="w-full max-w-[110px] min-w-0 flex-1">
            <Sparkline points={spark} />
          </div>
        )}
      </div>
      {sub && <p className="text-[11px] leading-tight text-gray-500">{sub}</p>}
    </div>
  )
  if (href) {
    return (
      <Link
        href={href}
        className={`block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/30 ${className}`}
      >
        {inner}
      </Link>
    )
  }
  return inner
}

function EstadoRow({
  label,
  value,
  ok,
}: {
  label: string
  value: string
  ok: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12.5px]">
      <dt className="flex items-center gap-1.5 text-gray-600">
        <span
          aria-hidden
          className={`size-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`}
        />
        {label}
      </dt>
      <dd
        className={`font-semibold tabular-nums ${ok ? "text-emerald-700" : "text-amber-700"}`}
      >
        {value}
      </dd>
    </div>
  )
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: "danger" | "warning"
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        tone === "danger"
          ? "bg-red-50 text-red-700"
          : "bg-amber-50 text-amber-700"
      }`}
    >
      {children}
    </span>
  )
}

function RowLink({
  href,
  top,
  bottom,
  right,
  rightSub,
}: {
  href: string
  top: string
  bottom: string
  right: string
  rightSub?: string
}) {
  return (
    <Link
      href={href}
      className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2.5 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/25"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-xs text-[#0F766E]">{top}</div>
        <div className="truncate text-xs text-gray-500">{bottom}</div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold tabular-nums text-gray-900">
          {right}
        </div>
        {rightSub && (
          <div className="text-[10px] text-gray-400">{rightSub}</div>
        )}
      </div>
    </Link>
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
    <div className="pc-card">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {badge}
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs text-[#0F766E] hover:underline"
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
    <div className="pc-card">
      <div className="mb-5 flex items-center gap-3">
        <div
          className="flex size-10 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ background: avatarGradient(nombre) }}
        >
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
            {formatMXN(stats.totalInvertido)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
            Recuperado
          </p>
          <p className="mt-1 font-bold tabular-nums text-emerald-600">
            {formatMXN(stats.recuperado)}
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
        <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.05]">
          <div
            className="h-full rounded-full bg-[#0F766E] transition-all duration-700"
            style={{ width: `${Math.min(100, stats.pct)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
