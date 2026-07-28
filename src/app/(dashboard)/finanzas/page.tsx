import { TrendingUp, Wallet, ChartLine, ScrollText, Gift } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { PageHeader } from "@/components/page-header"
import { formatMXN2 } from "@/lib/utils"
import { resumenRegalos, errorSinColumnasRegalo } from "@/lib/regalos"
import { RecoveryChart } from "./recovery-chart"

import { parseFecha } from "@/lib/fecha"

const SANDRA_ID = "4f21084b-dfe9-45f3-be80-935dc1a5e7a5"
const BENJAMIN_ID = "3165fe33-c760-4373-84d0-e1cd14d863b3"

// Paleta enterprise: emerald accent + slate neutral. Diferencia por nombre, no por color saturado.
const SOCIO_COLOR: Record<string, string> = {
  Sandra: "#94A3B8",
  Benjamin: "#0F766E",
}

const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})
const monthShort = new Intl.DateTimeFormat("es-MX", {
  month: "short",
  year: "2-digit",
})

type Inversion = {
  id: string
  socio_id: string
  numero_ronda: number | null
  monto_mxn: number | null
  fecha: string
  concepto: string | null
}

type VentaSocio = {
  venta_id: string
  socio_id: string
  monto: number
  pagado: boolean
  fecha_pago: string | null
}

type Venta = {
  id: string
  numero: string
  fecha: string
  total: number | null
  notas: string | null
}

type Socio = {
  id: string
  nombre: string
}

export default async function FinanzasPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  // Inversiones, venta_socios y socios pueden estar RLS-bloqueados → admin.
  // Ventas usan el cliente normal (legible para anon).
  const [invRes, vsRes, sociosRes, ventasRes] = await Promise.all([
    admin
      .from("inversiones")
      .select("id, socio_id, numero_ronda, monto_mxn, fecha, concepto")
      .order("fecha", { ascending: true })
      .order("numero_ronda", { ascending: true }),
    admin
      .from("venta_socios")
      .select("venta_id, socio_id, monto, pagado, fecha_pago"),
    admin
      .from("socios")
      .select("id, nombre")
      .in("id", [SANDRA_ID, BENJAMIN_ID]),
    supabase
      .from("ventas")
      .select("id, numero, fecha, total, notas, cliente_id, estatus")
      .order("fecha", { ascending: true }),
  ])

  // Excluir ventas internas (Piel Canela) — no entran en ROI ni capital recuperado
  const internalIds = await (
    await import("@/lib/internal-clientes")
  ).getInternalClienteIds()
  const inversionesData = (invRes.data ?? []) as Inversion[]
  const sociosDb = (sociosRes.data ?? []) as Socio[]
  const ventasRaw = (ventasRes.data ?? []) as (Venta & {
    cliente_id?: string | null
    estatus?: string | null
  })[]
  // ROI / capital recuperado: excluir internas (Piel Canela) Y canceladas.
  const ventas = ventasRaw.filter(
    (v) =>
      (!v.cliente_id || !internalIds.has(v.cliente_id)) &&
      v.estatus !== "cancelada",
  )
  const excludedVentaIds = new Set(
    ventasRaw
      .filter(
        (v) =>
          (v.cliente_id && internalIds.has(v.cliente_id)) ||
          v.estatus === "cancelada",
      )
      .map((v) => v.id),
  )
  const ventaSocios = ((vsRes.data ?? []) as VentaSocio[]).filter(
    (vs) => !excludedVentaIds.has(vs.venta_id),
  )

  const ventaById = new Map(ventas.map((v) => [v.id, v]))

  // ─── Cortesías (productos de regalo) ────────────────────────────
  // Se leen aparte porque son partidas de venta, no movimientos de socio. Su
  // costo YA está dentro de `ventas.costo_productos` (y por tanto restado de
  // `ganancia`): esta sección no vuelve a restarlo, solo lo hace visible.
  // Sin la migración de regalos la consulta falla → se degrada a "sin datos".
  const regalosRes = await admin
    .from("venta_items")
    .select(
      "venta_id, cantidad, precio_unitario, costo_unitario, precio_lista, es_regalo, productos(nombre, nombre_display, sku)",
    )
    .eq("es_regalo", true)
  const regalosPendienteMigracion = errorSinColumnasRegalo(regalosRes.error)
  type RegaloRow = {
    venta_id: string
    cantidad: number
    precio_unitario: number
    costo_unitario: number
    precio_lista: number | null
    es_regalo: boolean
    productos: {
      nombre: string
      nombre_display: string | null
      sku: string | null
    } | null
  }
  // Mismo criterio que el ROI: fuera internas (Piel Canela) y canceladas.
  const regalosItems = ((regalosRes.data ?? []) as unknown as RegaloRow[]).filter(
    (r) => !excludedVentaIds.has(r.venta_id),
  )
  const regalosTotales = resumenRegalos(regalosItems)

  // Por venta (para la tabla) y por producto (para saber qué se regala más)
  type RegaloPorVenta = {
    ventaId: string
    numero: string
    fecha: string
    piezas: number
    costo: number
    valor: number
  }
  const regalosPorVentaMap = new Map<string, RegaloPorVenta>()
  const regalosPorProductoMap = new Map<
    string,
    { nombre: string; piezas: number; costo: number }
  >()
  for (const r of regalosItems) {
    const venta = ventaById.get(r.venta_id)
    if (!venta) continue
    const cantidad = Number(r.cantidad ?? 0)
    const costo = Number(r.costo_unitario ?? 0) * cantidad
    const valor = Number(r.precio_lista ?? 0) * cantidad
    const cur =
      regalosPorVentaMap.get(r.venta_id) ??
      {
        ventaId: r.venta_id,
        numero: venta.numero,
        fecha: venta.fecha,
        piezas: 0,
        costo: 0,
        valor: 0,
      }
    cur.piezas += cantidad
    cur.costo += costo
    cur.valor += valor
    regalosPorVentaMap.set(r.venta_id, cur)

    const nombre = r.productos?.nombre_display ?? r.productos?.nombre ?? "Producto"
    const key = r.productos?.sku ?? nombre
    const prod =
      regalosPorProductoMap.get(key) ?? { nombre, piezas: 0, costo: 0 }
    prod.piezas += cantidad
    prod.costo += costo
    regalosPorProductoMap.set(key, prod)
  }
  const regalosPorVenta = Array.from(regalosPorVentaMap.values()).sort((a, b) =>
    a.fecha < b.fecha ? 1 : -1,
  )
  const regalosPorProducto = Array.from(regalosPorProductoMap.values()).sort(
    (a, b) => b.costo - a.costo,
  )

  const inversionesError = invRes.error?.message ?? null

  // Fallback si admin no puede leer socios
  const socios: Socio[] =
    sociosDb.length > 0
      ? sociosDb
      : [
          { id: SANDRA_ID, nombre: "Sandra" },
          { id: BENJAMIN_ID, nombre: "Benjamin" },
        ]
  const nombreById = new Map(socios.map((s) => [s.id, s.nombre]))

  // ─── KPIs por socio ────────────────────────────────────────────
  const sociosOrdenados = [
    socios.find((s) => s.id === SANDRA_ID) ?? socios[0],
    socios.find((s) => s.id === BENJAMIN_ID) ?? socios[1],
  ].filter(Boolean) as Socio[]

  const kpisPorSocio = sociosOrdenados.map((s) => {
    const totalInvertido = inversionesData
      .filter((i) => i.socio_id === s.id)
      .reduce((sum, i) => sum + Number(i.monto_mxn ?? 0), 0)
    const capitalRecuperado = ventaSocios
      .filter((vs) => vs.socio_id === s.id)
      .reduce((sum, vs) => sum + Number(vs.monto ?? 0), 0)
    const resultadoNeto = capitalRecuperado - totalInvertido
    const roi = totalInvertido > 0 ? (resultadoNeto / totalInvertido) * 100 : 0
    const capitalEnRiesgo =
      totalInvertido - Math.min(capitalRecuperado, totalInvertido)
    const progresoPct =
      totalInvertido > 0 ? (capitalRecuperado / totalInvertido) * 100 : 0
    return {
      socio: s,
      totalInvertido,
      capitalRecuperado,
      resultadoNeto,
      roi,
      capitalEnRiesgo,
      progresoPct,
    }
  })

  // ─── Inversiones agrupadas por socio (con subtotales) ─────────
  const inversionesPorSocio = sociosOrdenados.map((s) => ({
    socio: s,
    items: inversionesData.filter((i) => i.socio_id === s.id),
    subtotal: inversionesData
      .filter((i) => i.socio_id === s.id)
      .reduce((sum, i) => sum + Number(i.monto_mxn ?? 0), 0),
  }))

  // ─── Recuperación por venta (pivot) ─────────────────────────────
  const ventasFilas = ventas
    .map((v) => {
      const socioRows = ventaSocios.filter((vs) => vs.venta_id === v.id)
      const sandra = socioRows
        .filter((vs) => vs.socio_id === SANDRA_ID)
        .reduce((sum, vs) => sum + Number(vs.monto ?? 0), 0)
      const benjamin = socioRows
        .filter((vs) => vs.socio_id === BENJAMIN_ID)
        .reduce((sum, vs) => sum + Number(vs.monto ?? 0), 0)
      return { venta: v, sandra, benjamin, total: sandra + benjamin }
    })
    .sort((a, b) => (a.venta.fecha < b.venta.fecha ? 1 : -1))
  const totalSandra = ventasFilas.reduce((s, r) => s + r.sandra, 0)
  const totalBenjamin = ventasFilas.reduce((s, r) => s + r.benjamin, 0)
  const totalAsignado = totalSandra + totalBenjamin

  // ─── Serie acumulada para chart ─────────────────────────────────
  type Bucket = { mes: string; sandra: number; benjamin: number }
  const monthly: Map<string, Bucket> = new Map()
  for (const vs of ventaSocios) {
    const venta = ventaById.get(vs.venta_id)
    if (!venta?.fecha) continue
    const mes = venta.fecha.slice(0, 7)
    const cur = monthly.get(mes) ?? { mes, sandra: 0, benjamin: 0 }
    if (vs.socio_id === SANDRA_ID) cur.sandra += Number(vs.monto ?? 0)
    else if (vs.socio_id === BENJAMIN_ID) cur.benjamin += Number(vs.monto ?? 0)
    monthly.set(mes, cur)
  }
  const orderedBuckets = Array.from(monthly.values()).sort((a, b) =>
    a.mes.localeCompare(b.mes),
  )
  let acumS = 0
  let acumB = 0
  const chartData = orderedBuckets.map((b) => {
    acumS += b.sandra
    acumB += b.benjamin
    const d = parseFecha(b.mes)
    return {
      mes: b.mes,
      label: monthShort.format(d),
      sandra: Number(acumS.toFixed(2)),
      benjamin: Number(acumB.toFixed(2)),
    }
  })

  const invSandra = kpisPorSocio.find((k) => k.socio.id === SANDRA_ID)?.totalInvertido ?? 0
  const invBenjamin = kpisPorSocio.find((k) => k.socio.id === BENJAMIN_ID)?.totalInvertido ?? 0
  void invSandra
  void invBenjamin

  // ─── Series últimos 12 meses para sparklines KPI ─────────────────
  const today = new Date()
  type MK = {
    key: string
    recuperadoMes: number
    recuperadoAcum: number
    netoAcum: number
  }
  const monthly12: MK[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    monthly12.push({ key, recuperadoMes: 0, recuperadoAcum: 0, netoAcum: 0 })
  }
  const idxMK = new Map(monthly12.map((m, i) => [m.key, i]))
  for (const vs of ventaSocios) {
    const venta = ventaById.get(vs.venta_id)
    if (!venta?.fecha) continue
    const mes = venta.fecha.slice(0, 7)
    const i = idxMK.get(mes)
    if (i !== undefined) monthly12[i].recuperadoMes += Number(vs.monto ?? 0)
  }
  let acum = 0
  for (const m of monthly12) {
    acum += m.recuperadoMes
    m.recuperadoAcum = acum
  }
  // Inversión acumulada por mes (snapshot del invertido en cada cutoff)
  const invByMonth: number[] = monthly12.map((m) => {
    const cutoff = m.key + "-31"
    return inversionesData
      .filter((i) => (i.fecha ?? "0000-00-00") <= cutoff)
      .reduce((s, x) => s + Number(x.monto_mxn ?? 0), 0)
  })
  for (let i = 0; i < monthly12.length; i++) {
    monthly12[i].netoAcum = monthly12[i].recuperadoAcum - invByMonth[i]
  }

  // Totales globales para hero
  const totalInvertido = kpisPorSocio.reduce(
    (s, k) => s + k.totalInvertido,
    0,
  )
  const totalRecuperado = kpisPorSocio.reduce(
    (s, k) => s + k.capitalRecuperado,
    0,
  )
  const gananciaNeta = totalRecuperado - totalInvertido
  const roiPromedio =
    totalInvertido > 0
      ? (totalRecuperado / totalInvertido - 1) * 100
      : 0

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Finanzas"
        subtitle="Control de inversiones y capital · ROI por socio"
        icon={<TrendingUp className="size-5" />}
        kpis={(() => {
          const len = monthly12.length
          const cur = monthly12[len - 1]
          const prev = monthly12[len - 2]
          const pct = (a: number, b: number) =>
            b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100
          const dRecMes = cur && prev ? pct(cur.recuperadoMes, prev.recuperadoMes) : 0
          const dNeto = cur && prev ? pct(cur.netoAcum, prev.netoAcum) : 0
          return [
            {
              label: "Total invertido",
              value: formatMXN2(totalInvertido),
              sub: "ambos socios",
            },
            {
              label: "Capital recuperado",
              value: formatMXN2(totalRecuperado),
              sub: `${formatMXN2(cur?.recuperadoMes ?? 0)} este mes`,
              trend: {
                value: `${dRecMes >= 0 ? "+" : ""}${dRecMes.toFixed(1)}%`,
                positive: dRecMes >= 0,
              },
              sparkline: monthly12.map((m) => m.recuperadoAcum),
            },
            {
              label: "Ganancia neta",
              value: formatMXN2(gananciaNeta),
              sub: gananciaNeta >= 0 ? "en positivo" : "aún en rojo",
              color:
                gananciaNeta >= 0 ? "text-emerald-700" : "text-rose-600",
              trend: {
                value: `${dNeto >= 0 ? "+" : ""}${dNeto.toFixed(1)}%`,
                positive: dNeto >= 0,
              },
              sparkline: monthly12.map((m) => m.netoAcum),
            },
            {
              label: "ROI promedio",
              value: `${roiPromedio.toFixed(1)}%`,
              sub: "retorno sobre inversión",
              sparkline: monthly12.map((m, i) =>
                invByMonth[i] > 0
                  ? (m.recuperadoAcum / invByMonth[i] - 1) * 100
                  : 0,
              ),
            },
            {
              label: "Regalos entregados",
              value: formatMXN2(regalosTotales.costo),
              sub:
                regalosTotales.piezas > 0
                  ? `${regalosTotales.piezas} pzs · costo que salió del bolsillo`
                  : "sin cortesías registradas",
              color:
                regalosTotales.costo > 0 ? "text-fuchsia-700" : undefined,
              breakdown:
                regalosTotales.valor > 0
                  ? [
                      {
                        label: "Valor obsequiado",
                        value: formatMXN2(regalosTotales.valor),
                        tone: "violet" as const,
                      },
                    ]
                  : undefined,
            },
          ]
        })()}
      />

      {inversionesError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No se pudo leer la tabla <code>inversiones</code>:{" "}
          {inversionesError}. Si la tabla no existe corre el SQL del paso 1 en
          el SQL Editor de Supabase.
        </div>
      )}

      {/* ─── A. Tarjetas socios ─── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {kpisPorSocio.map((k) => {
          const color = SOCIO_COLOR[k.socio.nombre] ?? "#6b7280"
          const initial = k.socio.nombre[0]?.toUpperCase() ?? "?"
          return (
            <div
              key={k.socio.id}
              className="pc-card"
            >
              <header className="flex items-center gap-3 pb-4 border-b border-gray-100">
                <span
                  className="flex size-10 items-center justify-center rounded-full text-white font-bold text-lg"
                  style={{ background: color }}
                >
                  {initial}
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {k.socio.nombre}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {k.progresoPct >= 100
                      ? "Capital recuperado"
                      : `${k.progresoPct.toFixed(0)}% del capital recuperado`}
                  </p>
                </div>
              </header>

              <dl className="mt-4 space-y-2 text-sm">
                <Row label="Total invertido" value={formatMXN2(k.totalInvertido)} bold />
                <Row
                  label="Capital recuperado"
                  value={formatMXN2(k.capitalRecuperado)}
                  className="text-emerald-700"
                />
                <Row
                  label="Ganancia neta"
                  value={`${k.resultadoNeto >= 0 ? "+" : ""}${formatMXN2(k.resultadoNeto)}`}
                  className={k.resultadoNeto >= 0 ? "text-emerald-700" : "text-red-700"}
                  bold
                />
                <Row
                  label="Capital en riesgo"
                  value={formatMXN2(k.capitalEnRiesgo)}
                  className={k.capitalEnRiesgo > 0 ? "text-amber-700" : "text-gray-500"}
                />
                <div className="my-2 border-t border-gray-100" />
                <div className="flex items-center justify-between">
                  <dt className="text-gray-600">ROI</dt>
                  <dd
                    className={`text-2xl font-bold tabular-nums ${k.roi >= 0 ? "text-emerald-700" : "text-red-700"}`}
                  >
                    {k.roi >= 0 ? "+" : ""}
                    {k.roi.toFixed(1)}%
                  </dd>
                </div>
              </dl>

              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${Math.min(100, k.progresoPct)}%`,
                      background: color,
                    }}
                  />
                </div>
                {k.progresoPct > 100 && (
                  <p className="mt-1 text-xs text-emerald-700">
                    +{(k.progresoPct - 100).toFixed(0)}% por encima de la inversión
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </section>

      {/* ─── B. Inversiones agrupadas ─── */}
      <section className="pc-card-flush">
        <header className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
          <Wallet className="size-4 text-gray-500" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
            Inversiones por socio
          </h2>
          <span className="ml-auto text-xs text-gray-500">
            {inversionesData.length} movimientos
          </span>
        </header>
        <div className="divide-y divide-gray-100">
          {inversionesPorSocio.map(({ socio, items, subtotal }) => (
            <div key={socio.id}>
              <div className="flex items-center justify-between bg-gray-50 px-5 py-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: SOCIO_COLOR[socio.nombre] ?? "#6b7280" }}
                  />
                  {socio.nombre}
                </span>
                <span className="text-xs text-gray-500">
                  Subtotal{" "}
                  <strong className="font-semibold tabular-nums text-gray-900">
                    {formatMXN2(subtotal)}
                  </strong>
                </span>
              </div>
              {items.length === 0 ? (
                <div className="px-5 py-4 text-sm text-gray-500">
                  Sin inversiones registradas.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-500">
                      <Th>#</Th>
                      <Th>Concepto</Th>
                      <Th align="right">Monto</Th>
                      <Th align="right">Fecha</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-5 py-2 text-gray-500 tabular-nums">
                          {it.numero_ronda ?? "—"}
                        </td>
                        <td className="px-5 py-2 text-gray-900">
                          {it.concepto ?? "—"}
                        </td>
                        <td className="px-5 py-2 text-right tabular-nums font-semibold">
                          {formatMXN2(Number(it.monto_mxn ?? 0))}
                        </td>
                        <td className="px-5 py-2 text-right text-gray-500 text-xs">
                          {fechaFmt.format(parseFecha(it.fecha))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ─── B2. Cortesías / productos de regalo ─── */}
      {(regalosPorVenta.length > 0 || regalosPendienteMigracion) && (
        <section className="pc-card-flush">
          <header className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
            <Gift className="size-4 text-fuchsia-600" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
              Productos de regalo
            </h2>
            <span className="ml-auto text-xs text-gray-500">
              {regalosTotales.piezas} pzs en {regalosPorVenta.length}{" "}
              {regalosPorVenta.length === 1 ? "venta" : "ventas"}
            </span>
          </header>

          {regalosPendienteMigracion ? (
            <div className="px-5 py-4 text-sm text-amber-800">
              Falta correr <code>scripts/add-regalos-cotizaciones.sql</code> en
              el SQL Editor de Supabase para registrar cortesías.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-3">
                <ResumenRegalo
                  label="Costo total (pérdida)"
                  value={formatMXN2(regalosTotales.costo)}
                  tone="text-rose-700"
                  hint="Ya restado de la ganancia de cada venta"
                />
                <ResumenRegalo
                  label="Valor obsequiado"
                  value={formatMXN2(regalosTotales.valor)}
                  tone="text-fuchsia-700"
                  hint="A precio de lista"
                />
                <ResumenRegalo
                  label="Margen cedido"
                  value={formatMXN2(regalosTotales.margenCedido)}
                  tone="text-gray-900"
                  hint="Utilidad que se dejó de ganar"
                />
              </div>

              {regalosPorProducto.length > 0 && (
                <div className="border-t border-gray-100 px-5 py-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Lo que más se regala
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {regalosPorProducto.slice(0, 6).map((p) => (
                      <li
                        key={p.nombre}
                        className="rounded-full bg-fuchsia-50 px-2.5 py-1 text-xs text-fuchsia-800 ring-1 ring-fuchsia-200/70"
                      >
                        {p.nombre}
                        <span className="ml-1.5 tabular-nums font-semibold">
                          {p.piezas} pzs
                        </span>
                        <span className="ml-1.5 tabular-nums text-fuchsia-600">
                          {formatMXN2(p.costo)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="overflow-x-auto border-t border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#EEF1F4] bg-[#F9FAFB]">
                      <Th>Venta</Th>
                      <Th>Fecha</Th>
                      <Th align="right">Piezas</Th>
                      <Th align="right">Valor obsequiado</Th>
                      <Th align="right">Costo (pérdida)</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {regalosPorVenta.map((r) => (
                      <tr key={r.ventaId} className="hover:bg-gray-50">
                        <td className="px-5 py-2 font-mono text-xs text-[#0F766E]">
                          {r.numero}
                        </td>
                        <td className="px-5 py-2 text-xs text-gray-600">
                          {fechaFmt.format(parseFecha(r.fecha))}
                        </td>
                        <td className="px-5 py-2 text-right tabular-nums">
                          {r.piezas}
                        </td>
                        <td className="px-5 py-2 text-right tabular-nums text-fuchsia-700">
                          {formatMXN2(r.valor)}
                        </td>
                        <td className="px-5 py-2 text-right tabular-nums font-semibold text-rose-700">
                          {formatMXN2(r.costo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                      <td
                        colSpan={2}
                        className="px-5 py-2 text-xs uppercase tracking-wide text-gray-700"
                      >
                        Totales
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums">
                        {regalosTotales.piezas}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums text-fuchsia-700">
                        {formatMXN2(regalosTotales.valor)}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums text-rose-700">
                        {formatMXN2(regalosTotales.costo)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="border-t border-gray-100 px-5 py-2 text-[11px] text-gray-500">
                El costo de los regalos ya está incluido en{" "}
                <code>costo_productos</code> de cada venta, así que la ganancia
                y el ROI de arriba ya lo tienen descontado. Esta tabla solo lo
                hace visible — no se resta dos veces.
              </p>
            </>
          )}
        </section>
      )}

      {/* ─── D. Gráfica acumulada ─── */}
      <section className="pc-card">
        <header className="mb-3 flex items-center gap-2">
          <ChartLine className="size-4 text-gray-500" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
            Recuperación de capital acumulada
          </h2>
        </header>
        <RecoveryChart
          data={chartData}
          invSandra={invSandra}
          invBenjamin={invBenjamin}
        />
      </section>

      {/* ─── C. Tabla recuperación por venta ─── */}
      <section className="pc-card-flush">
        <header className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
          <ScrollText className="size-4 text-gray-500" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
            Recuperación por venta
          </h2>
          <span className="ml-auto text-xs text-gray-500">
            {ventasFilas.length} ventas
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EEF1F4] bg-[#F9FAFB]">
                <Th>Venta</Th>
                <Th>Fecha</Th>
                <Th align="right">Total</Th>
                <Th align="right">Sandra</Th>
                <Th align="right">Benjamin</Th>
                <Th>Notas</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ventasFilas.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-8 text-center text-sm text-gray-500"
                  >
                    Sin datos.
                  </td>
                </tr>
              ) : (
                ventasFilas.map(({ venta, sandra, benjamin }) => (
                  <tr key={venta.id} className="hover:bg-gray-50">
                    <td className="px-5 py-2 font-mono text-xs text-[#0F766E]">
                      {venta.numero}
                    </td>
                    <td className="px-5 py-2 text-gray-600 text-xs">
                      {fechaFmt.format(parseFecha(venta.fecha))}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums font-semibold">
                      {formatMXN2(Number(venta.total ?? 0))}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums text-[#0F766E]">
                      {sandra > 0 ? formatMXN2(sandra) : "—"}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums text-teal-700">
                      {benjamin > 0 ? formatMXN2(benjamin) : "—"}
                    </td>
                    <td className="px-5 py-2 text-xs text-gray-500 max-w-xs truncate">
                      {venta.notas ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {ventasFilas.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td
                    colSpan={2}
                    className="px-5 py-2 text-xs uppercase tracking-wide text-gray-700"
                  >
                    Totales
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums">
                    {formatMXN2(totalAsignado)}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums text-[#0F766E]">
                    {formatMXN2(totalSandra)}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums text-teal-700">
                    {formatMXN2(totalBenjamin)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  )
}

function Row({
  label,
  value,
  bold = false,
  className = "",
}: {
  label: string
  value: string
  bold?: boolean
  className?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-600">{label}</dt>
      <dd
        className={`tabular-nums ${bold ? "font-bold text-base" : "font-medium"} text-gray-900 ${className}`}
      >
        {value}
      </dd>
    </div>
  )
}

function ResumenRegalo({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: string
  tone: string
  hint: string
}) {
  return (
    <div className="rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/40 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-gray-500">{hint}</div>
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
      className="px-5 py-2 text-xs font-medium uppercase tracking-wide text-gray-500"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  )
}
