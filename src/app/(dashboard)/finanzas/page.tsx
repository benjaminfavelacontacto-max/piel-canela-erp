import { TrendingUp, Wallet, ChartLine, ScrollText } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { PageHeader } from "@/components/page-header"
import { RecoveryChart } from "./recovery-chart"

const SANDRA_ID = "4f21084b-dfe9-45f3-be80-935dc1a5e7a5"
const BENJAMIN_ID = "3165fe33-c760-4373-84d0-e1cd14d863b3"

// Paleta enterprise: emerald accent + slate neutral. Diferencia por nombre, no por color saturado.
const SOCIO_COLOR: Record<string, string> = {
  Sandra: "#94A3B8",
  Benjamin: "#0F766E",
}

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
      .select("id, numero, fecha, total, notas, cliente_id")
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
  })[]
  const ventas = ventasRaw.filter(
    (v) => !v.cliente_id || !internalIds.has(v.cliente_id),
  )
  const internalVentaIds = new Set(
    ventasRaw
      .filter((v) => v.cliente_id && internalIds.has(v.cliente_id))
      .map((v) => v.id),
  )
  const ventaSocios = ((vsRes.data ?? []) as VentaSocio[]).filter(
    (vs) => !internalVentaIds.has(vs.venta_id),
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
  const ventaById = new Map(ventas.map((v) => [v.id, v]))

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
    const d = new Date(b.mes + "-01")
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
    <div className="p-8 space-y-8">
      <PageHeader
        title="Finanzas"
        subtitle="Control de inversiones y capital · ROI por socio"
        icon={<TrendingUp className="size-5" />}
        kpis={[
          {
            label: "Total invertido",
            value: mxn.format(totalInvertido),
            sub: "ambos socios",
          },
          {
            label: "Capital recuperado",
            value: mxn.format(totalRecuperado),
            sub: "de ventas reales",
            color: "text-emerald-300",
          },
          {
            label: "Ganancia neta",
            value: mxn.format(gananciaNeta),
            sub: "resultado neto",
            color:
              gananciaNeta >= 0 ? "text-emerald-300" : "text-rose-300",
          },
          {
            label: "ROI promedio",
            value: `${roiPromedio.toFixed(1)}%`,
            sub: "retorno sobre inversión",
            color: "text-teal-300",
          },
        ]}
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
              className="rounded-xl border border-gray-200 bg-white p-5"
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
                <Row label="Total invertido" value={mxn.format(k.totalInvertido)} bold />
                <Row
                  label="Capital recuperado"
                  value={mxn.format(k.capitalRecuperado)}
                  className="text-emerald-700"
                />
                <Row
                  label="Ganancia neta"
                  value={`${k.resultadoNeto >= 0 ? "+" : ""}${mxn.format(k.resultadoNeto)}`}
                  className={k.resultadoNeto >= 0 ? "text-emerald-700" : "text-red-700"}
                  bold
                />
                <Row
                  label="Capital en riesgo"
                  value={mxn.format(k.capitalEnRiesgo)}
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
      <section className="rounded-xl border border-gray-200 bg-white">
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
                    {mxn.format(subtotal)}
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
                          {mxn.format(Number(it.monto_mxn ?? 0))}
                        </td>
                        <td className="px-5 py-2 text-right text-gray-500 text-xs">
                          {fechaFmt.format(new Date(it.fecha))}
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

      {/* ─── D. Gráfica acumulada ─── */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
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
      <section className="rounded-xl border border-gray-200 bg-white">
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
                      {fechaFmt.format(new Date(venta.fecha))}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums font-semibold">
                      {mxn.format(Number(venta.total ?? 0))}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums text-[#0F766E]">
                      {sandra > 0 ? mxn.format(sandra) : "—"}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums text-teal-700">
                      {benjamin > 0 ? mxn.format(benjamin) : "—"}
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
                    {mxn.format(totalAsignado)}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums text-[#0F766E]">
                    {mxn.format(totalSandra)}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums text-teal-700">
                    {mxn.format(totalBenjamin)}
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
