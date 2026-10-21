import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { getInternalClienteIds } from "@/lib/internal-clientes"
import { formatMXN2 } from "@/lib/utils"
import { calcularCobrar, type VentaConSaldo } from "@/lib/hoy"
import { ReporteAcciones } from "./reporte-acciones"

const SANDRA_ID = "4f21084b-dfe9-45f3-be80-935dc1a5e7a5"
const BENJAMIN_ID = "3165fe33-c760-4373-84d0-e1cd14d863b3"

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]
const etiquetaMes = (ym: string) => {
  const [y, m] = ym.split("-").map(Number)
  return `${MESES[m - 1]} ${y}`
}
const ymDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
const redondear = (n: number) => Math.round(n * 100) / 100

type VentaMes = {
  id: string
  numero: string
  fecha: string
  subtotal: number | null
  iva: number | null
  descuento: number | null
  total: number | null
  costo_productos: number | null
  costo_envio: number | null
  utilidad_neta: number | null
  cantidad_pagada: number | null
  saldo_pendiente: number | null
  estatus: string
  cliente_id: string | null
  clientes: { nombre: string; nombre_negocio: string | null } | null
}

const ESTATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  pagada_parcial: "Parcial",
  pagada_total: "Pagada",
  cancelada: "Cancelada",
}

function Delta({ actual, previo }: { actual: number; previo: number }) {
  if (previo === 0 && actual === 0) return <span className="text-gray-400">—</span>
  if (previo === 0) return <span className="text-emerald-700">nuevo</span>
  const pct = ((actual - previo) / previo) * 100
  const sube = pct >= 0
  return (
    <span className={sube ? "text-emerald-700" : "text-rose-700"}>
      {sube ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 print:break-inside-avoid">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

export default async function ReporteMensualPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const { mes: mesParam } = await searchParams
  const hoy = new Date()
  const mes = mesParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesParam) ? mesParam : ymDe(hoy)
  const [anio, mesNum] = mes.split("-").map(Number)
  const inicio = `${mes}-01`
  const siguiente = ymDe(new Date(anio, mesNum, 1))
  const finExcl = `${siguiente}-01`
  const anterior = ymDe(new Date(anio, mesNum - 2, 1))

  const admin = createAdminClient()
  const campos =
    "id, numero, fecha, subtotal, iva, descuento, total, costo_productos, costo_envio, utilidad_neta, cantidad_pagada, saldo_pendiente, estatus, cliente_id, clientes(nombre, nombre_negocio)"

  const [internos, ventasRes, previoRes, saldoRes, invRes, vsAllRes, ventasAllRes] =
    await Promise.all([
      getInternalClienteIds(),
      admin.from("ventas").select(campos).gte("fecha", inicio).lt("fecha", finExcl).order("fecha", { ascending: true }),
      admin
        .from("ventas")
        .select("total, utilidad_neta, estatus, cliente_id")
        .gte("fecha", `${anterior}-01`)
        .lt("fecha", inicio),
      admin
        .from("ventas")
        .select("id, numero, fecha, saldo_pendiente, estatus, cliente_id, clientes(nombre, nombre_negocio, telefono)")
        .gt("saldo_pendiente", 0)
        .neq("estatus", "cancelada"),
      admin.from("inversiones").select("socio_id, monto_mxn"),
      admin.from("venta_socios").select("venta_id, socio_id, monto"),
      admin.from("ventas").select("id, estatus, cliente_id"),
    ])

  const esInterna = (c: string | null) => !!c && internos.has(c)
  const todas = (ventasRes.data ?? []) as unknown as VentaMes[]
  const ventas = todas.filter((v) => v.estatus !== "cancelada" && !esInterna(v.cliente_id))
  const canceladas = todas.filter((v) => v.estatus === "cancelada" && !esInterna(v.cliente_id)).length
  const previas = ((previoRes.data ?? []) as { total: number | null; utilidad_neta: number | null; estatus: string; cliente_id: string | null }[]).filter(
    (v) => v.estatus !== "cancelada" && !esInterna(v.cliente_id),
  )

  const suma = (arr: (number | null | undefined)[]) => arr.reduce<number>((s, n) => s + Number(n ?? 0), 0)
  const totalMes = suma(ventas.map((v) => v.total))
  const utilidadMes = suma(ventas.map((v) => v.utilidad_neta))
  const cobradoMes = suma(ventas.map((v) => v.cantidad_pagada))
  const saldoMes = suma(ventas.map((v) => v.saldo_pendiente))
  const totalPrev = suma(previas.map((v) => v.total))
  const utilidadPrev = suma(previas.map((v) => v.utilidad_neta))
  const ticket = ventas.length ? totalMes / ventas.length : 0
  const ticketPrev = previas.length ? totalPrev / previas.length : 0

  // Items del mes (categorías / productos)
  const ids = ventas.map((v) => v.id)
  const itemsRes = ids.length
    ? await admin
        .from("venta_items")
        .select("venta_id, cantidad, subtotal, productos(nombre, sku, categorias(nombre))")
        .in("venta_id", ids)
    : { data: [] }
  type Item = {
    venta_id: string
    cantidad: number
    subtotal: number
    productos: { nombre: string; sku: string | null; categorias: { nombre: string } | null } | null
  }
  const items = (itemsRes.data ?? []) as unknown as Item[]
  const porCategoria = new Map<string, { unidades: number; ingresos: number }>()
  const porProducto = new Map<string, { unidades: number; ingresos: number }>()
  for (const it of items) {
    const cat = it.productos?.categorias?.nombre?.toUpperCase() ?? "SIN CATEGORÍA"
    const c = porCategoria.get(cat) ?? { unidades: 0, ingresos: 0 }
    c.unidades += Number(it.cantidad ?? 0)
    c.ingresos += Number(it.subtotal ?? 0)
    porCategoria.set(cat, c)
    const nombre = it.productos?.nombre ?? "Desconocido"
    const p = porProducto.get(nombre) ?? { unidades: 0, ingresos: 0 }
    p.unidades += Number(it.cantidad ?? 0)
    p.ingresos += Number(it.subtotal ?? 0)
    porProducto.set(nombre, p)
  }
  const categorias = [...porCategoria.entries()].sort((a, b) => b[1].ingresos - a[1].ingresos)
  const topProductos = [...porProducto.entries()].sort((a, b) => b[1].unidades - a[1].unidades).slice(0, 5)

  // Clientes del mes
  const porCliente = new Map<string, { total: number; n: number }>()
  for (const v of ventas) {
    const nombre = v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? "Sin cliente"
    const c = porCliente.get(nombre) ?? { total: 0, n: 0 }
    c.total += Number(v.total ?? 0)
    c.n += 1
    porCliente.set(nombre, c)
  }
  const topClientes = [...porCliente.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5)

  // Socios: reparto del mes + ROI acumulado
  const vsAll = (vsAllRes.data ?? []) as { venta_id: string; socio_id: string; monto: number }[]
  const ventaPorId = new Map(ventas.map((v) => [v.id, v]))
  const reparto = (socioId: string) => {
    let vendido = 0
    let ganancia = 0
    for (const vs of vsAll) {
      if (vs.socio_id !== socioId) continue
      const v = ventaPorId.get(vs.venta_id)
      if (!v) continue
      vendido += Number(vs.monto ?? 0)
      if (Number(v.total) > 0) ganancia += (Number(vs.monto ?? 0) / Number(v.total)) * Number(v.utilidad_neta ?? 0)
    }
    return { vendido, ganancia }
  }
  const excluidas = new Set(
    ((ventasAllRes.data ?? []) as { id: string; estatus: string; cliente_id: string | null }[])
      .filter((v) => v.estatus === "cancelada" || esInterna(v.cliente_id))
      .map((v) => v.id),
  )
  const inversiones = (invRes.data ?? []) as { socio_id: string; monto_mxn: number | null }[]
  const roiDe = (socioId: string) => {
    const invertido = suma(inversiones.filter((i) => i.socio_id === socioId).map((i) => i.monto_mxn))
    const recuperado = suma(vsAll.filter((vs) => vs.socio_id === socioId && !excluidas.has(vs.venta_id)).map((vs) => vs.monto))
    return { invertido, recuperado, roi: invertido > 0 ? ((recuperado - invertido) / invertido) * 100 : 0 }
  }
  const socios = [
    { id: SANDRA_ID, nombre: "Sandra" },
    { id: BENJAMIN_ID, nombre: "Benjamin" },
  ].map((s) => ({ ...s, ...reparto(s.id), ...roiDe(s.id) }))

  const cobrar = calcularCobrar((saldoRes.data ?? []) as unknown as VentaConSaldo[], internos, hoy)

  // Opciones del selector: últimos 18 meses
  const opciones = Array.from({ length: 18 }, (_, i) => {
    const ym = ymDe(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1))
    return { value: ym, label: etiquetaMes(ym) }
  })
  if (!opciones.some((o) => o.value === mes)) opciones.push({ value: mes, label: etiquetaMes(mes) })

  const csv = {
    nombre: `reporte-ventas-${mes}`,
    headers: ["Número", "Fecha", "Cliente", "Estatus", "Subtotal", "Descuento", "IVA", "Total", "Costo productos", "Costo envío", "Utilidad neta", "Pagado", "Saldo"],
    rows: ventas.map((v) => [
      v.numero,
      v.fecha,
      v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? "",
      ESTATUS_LABEL[v.estatus] ?? v.estatus,
      redondear(Number(v.subtotal ?? 0)),
      redondear(Number(v.descuento ?? 0)),
      redondear(Number(v.iva ?? 0)),
      redondear(Number(v.total ?? 0)),
      redondear(Number(v.costo_productos ?? 0)),
      redondear(Number(v.costo_envio ?? 0)),
      redondear(Number(v.utilidad_neta ?? 0)),
      redondear(Number(v.cantidad_pagada ?? 0)),
      redondear(Number(v.saldo_pendiente ?? 0)),
    ]),
  }

  const fechaFmt = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short" })

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-6 print:max-w-none print:space-y-4 print:p-0">
      <Link
        href="/finanzas"
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 print:hidden"
      >
        <ArrowLeft className="size-3.5" aria-hidden /> Finanzas
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0F766E]">Piel Canela · Reporte mensual</p>
          <h1 className="text-[28px] font-bold capitalize leading-tight tracking-[-0.03em] text-gray-900">
            {etiquetaMes(mes)}
          </h1>
          <p className="mt-1 text-xs text-gray-500">
            Generado el {new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(hoy)} · excluye ventas internas y canceladas
            {canceladas > 0 ? ` (${canceladas} cancelada${canceladas === 1 ? "" : "s"} del mes)` : ""}
          </p>
        </div>
        <ReporteAcciones mes={mes} opciones={opciones} csv={csv} />
      </header>

      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Vendido" value={formatMXN2(totalMes)} sub={<>{ventas.length} ventas · <Delta actual={totalMes} previo={totalPrev} /> vs {etiquetaMes(anterior)}</>} />
        <Kpi label="Utilidad neta" value={formatMXN2(utilidadMes)} sub={<>{totalMes > 0 ? `${((utilidadMes / totalMes) * 100).toFixed(1)}% margen` : "—"} · <Delta actual={utilidadMes} previo={utilidadPrev} /></>} />
        <Kpi label="Cobrado" value={formatMXN2(cobradoMes)} sub={totalMes > 0 ? `${((cobradoMes / totalMes) * 100).toFixed(0)}% de lo vendido` : "—"} />
        <Kpi label="Ticket promedio" value={formatMXN2(ticket)} sub={<Delta actual={ticket} previo={ticketPrev} />} />
      </section>

      <section aria-label="Socios" className="rounded-xl border border-gray-200 bg-white p-4 print:break-inside-avoid">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Socios</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3 font-semibold">Socio</th>
                <th className="py-2 pr-3 text-right font-semibold">Vendido en el mes</th>
                <th className="py-2 pr-3 text-right font-semibold">Ganancia del mes</th>
                <th className="py-2 pr-3 text-right font-semibold">Invertido</th>
                <th className="py-2 pr-3 text-right font-semibold">Recuperado (total)</th>
                <th className="py-2 text-right font-semibold">ROI acumulado</th>
              </tr>
            </thead>
            <tbody>
              {socios.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 pr-3 font-medium text-gray-900">{s.nombre}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatMXN2(s.vendido)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-emerald-700">{formatMXN2(s.ganancia)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatMXN2(s.invertido)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatMXN2(s.recuperado)}</td>
                  <td className={`py-2 text-right font-semibold tabular-nums ${s.roi >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {s.roi >= 0 ? "+" : ""}{s.roi.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section aria-label="Por categoría" className="rounded-xl border border-gray-200 bg-white p-4 print:break-inside-avoid">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Ventas por categoría</h2>
          {categorias.length === 0 ? (
            <p className="py-4 text-sm text-gray-500">Sin ventas con productos este mes.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {categorias.map(([cat, d]) => (
                <li key={cat} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-gray-800">{cat}</span>
                  <span className="shrink-0 tabular-nums text-gray-500">{d.unidades} u</span>
                  <span className="w-28 shrink-0 text-right font-medium tabular-nums">{formatMXN2(d.ingresos)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-5">
          <section aria-label="Mejores clientes" className="rounded-xl border border-gray-200 bg-white p-4 print:break-inside-avoid">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Mejores clientes</h2>
            {topClientes.length === 0 ? (
              <p className="py-2 text-sm text-gray-500">—</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {topClientes.map(([n, d]) => (
                  <li key={n} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-gray-800">{n}</span>
                    <span className="shrink-0 tabular-nums text-gray-500">{d.n} {d.n === 1 ? "venta" : "ventas"}</span>
                    <span className="w-28 shrink-0 text-right font-medium tabular-nums">{formatMXN2(d.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="Productos más vendidos" className="rounded-xl border border-gray-200 bg-white p-4 print:break-inside-avoid">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Productos más vendidos</h2>
            {topProductos.length === 0 ? (
              <p className="py-2 text-sm text-gray-500">—</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {topProductos.map(([n, d]) => (
                  <li key={n} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-gray-800">{n}</span>
                    <span className="shrink-0 tabular-nums text-gray-500">{d.unidades} u</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section aria-label="Por cobrar" className="rounded-xl border border-gray-200 bg-white p-4 print:break-inside-avoid">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">Por cobrar (acumulado)</h2>
          <span className="text-sm font-semibold tabular-nums text-amber-700">{formatMXN2(cobrar.total)}</span>
        </div>
        {cobrar.cantidad === 0 ? (
          <p className="text-sm text-gray-500">Sin saldos pendientes.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {cobrar.items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-gray-800">{i.cliente} <span className="font-mono text-xs text-gray-400">{i.numero}</span></span>
                <span className="shrink-0 text-xs text-gray-500">hace {i.dias} d</span>
                <span className="w-28 shrink-0 text-right font-medium tabular-nums">{formatMXN2(i.saldo)}</span>
              </li>
            ))}
          </ul>
        )}
        {saldoMes > 0 && (
          <p className="mt-2 text-xs text-gray-500">De lo vendido en {etiquetaMes(mes)} quedan por cobrar {formatMXN2(saldoMes)}.</p>
        )}
      </section>

      <section aria-label="Detalle de ventas" className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Detalle de ventas ({ventas.length})</h2>
        {ventas.length === 0 ? (
          <p className="py-4 text-sm text-gray-500">No hay ventas registradas este mes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3 font-semibold">Fecha</th>
                  <th className="py-2 pr-3 font-semibold">Cliente</th>
                  <th className="py-2 pr-3 font-semibold">Estatus</th>
                  <th className="py-2 pr-3 text-right font-semibold">Total</th>
                  <th className="py-2 text-right font-semibold">Utilidad</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((v) => (
                  <tr key={v.id} className="border-b border-gray-100 last:border-0 print:break-inside-avoid">
                    <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-gray-600">{fechaFmt.format(new Date(v.fecha + "T12:00:00"))}</td>
                    <td className="py-1.5 pr-3 text-gray-900">{v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? "—"}</td>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-gray-600">{ESTATUS_LABEL[v.estatus] ?? v.estatus}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatMXN2(Number(v.total ?? 0))}</td>
                    <td className="py-1.5 text-right tabular-nums text-emerald-700">{formatMXN2(Number(v.utilidad_neta ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
