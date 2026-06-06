import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Package, Pencil } from "lucide-react"
import { buildProductoImageUrl } from "@/lib/storage-images"
import { AgregarProductosPedido } from "./agregar-productos"
import { Conversiones } from "./conversiones"

const mxn = (v: number) =>
  v.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  })

const mxn2 = (v: number) =>
  v.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const usd = (v: number, decimals = 0) =>
  `$${Number(v).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`

interface Item {
  id: string
  cantidad: number
  precio_unitario_usd: number
  precio_unitario_mxn: number
  envio_unitario_usd: number
  envio_unitario_mxn: number
  costo_total_unitario_usd: number
  costo_total_unitario_mxn: number
  subtotal_usd: number
  subtotal_mxn: number
  total_con_envio_usd: number
  total_con_envio_mxn: number
  precio_publico_mxn: number
  profit_unitario: number
  profit_total: number
  sort_order: number
  proveedor_id: string | null
  productos: {
    sku: string
    nombre: string
    peso: string | null
    imagen_url: string | null
    categorias: { nombre: string } | null
  } | null
  proveedores: { nombre: string } | null
}

interface Pedido {
  id: string
  numero: number
  nombre: string
  fecha: string
  tipo: string | null
  tipo_cambio: number
  subtotal_usd: number
  costo_envio_usd: number
  costo_envio_mxn: number
  total_usd: number
  total_mxn: number
  inversion_sandra_usd: number
  inversion_benjamin_usd: number
  inversion_sandra_mxn: number
  inversion_benjamin_mxn: number
  notas: string | null
  proveedores: { nombre: string } | null
  pedido_compra_items: Item[]
}

export default async function PedidoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("pedidos_compra")
    .select(
      `
      *,
      proveedores(nombre),
      pedido_compra_items(
        id, cantidad,
        precio_unitario_usd, precio_unitario_mxn,
        envio_unitario_usd, envio_unitario_mxn,
        costo_total_unitario_usd, costo_total_unitario_mxn,
        subtotal_usd, subtotal_mxn,
        total_con_envio_usd, total_con_envio_mxn,
        precio_publico_mxn, profit_unitario, profit_total, sort_order, proveedor_id,
        productos(sku, nombre, peso, imagen_url, categorias(nombre)),
        proveedores(nombre)
      )
    `,
    )
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("[pedido detail] query error:", error)
    notFound()
  }
  if (!data) notFound()
  const pedido = data as unknown as Pedido

  // Productos para el buscador de "Agregar productos"
  const { data: productosData } = await supabase
    .from("productos")
    .select("id, sku, nombre, precio_usd")
    .eq("activo", true)
    .order("nombre")
  const productosBuscador = (productosData ?? []) as {
    id: string
    sku: string
    nombre: string
    precio_usd: number | null
  }[]

  // Categorías/proveedores para crear un producto nuevo desde el pedido
  const [{ data: catData }, { data: provData }] = await Promise.all([
    supabase.from("categorias").select("id, nombre").order("nombre"),
    supabase.from("proveedores").select("id, nombre").order("nombre"),
  ])
  const categoriaOptions = ((catData ?? []) as { id: string; nombre: string }[]).filter(
    (c) => c.nombre,
  )
  const proveedorOptions = ((provData ?? []) as { id: string; nombre: string }[]).filter(
    (p) => p.nombre,
  )

  // Conversiones MXN→USDT del pedido (tolerante si la tabla aún no existe)
  const { data: conversionesData } = await supabase
    .from("pedido_conversiones")
    .select("id, fecha, mxn_gastado, usdt_recibido, tipo_cambio, comision_mxn, notas")
    .eq("pedido_id", id)
    .order("fecha", { ascending: true })
  const conversiones = (conversionesData ?? []) as {
    id: string
    fecha: string
    mxn_gastado: number
    usdt_recibido: number
    tipo_cambio: number
    comision_mxn: number
    notas: string | null
  }[]

  const items = (pedido.pedido_compra_items ?? []).sort(
    (a, b) => a.sort_order - b.sort_order,
  )
  const totalUnidades = items.reduce((s, i) => s + Number(i.cantidad), 0)
  const totalProfit = items.reduce((s, i) => s + Number(i.profit_total ?? 0), 0)
  const envioUnitUSD = items[0]?.envio_unitario_usd ?? 0
  const envioUnitMXN = items[0]?.envio_unitario_mxn ?? 0

  // Group by categoría
  const grouped = items.reduce<Record<string, Item[]>>((acc, item) => {
    const cat = item.productos?.categorias?.nombre ?? "OTROS"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})
  const categories = Object.keys(grouped).sort()

  // Proveedores involucrados (derivados de los ítems)
  const proveedoresInvolucrados = Array.from(
    new Set(
      items.map((it) => it.proveedores?.nombre).filter((n): n is string => !!n),
    ),
  )
  const proveedoresLabel =
    proveedoresInvolucrados.length > 0
      ? proveedoresInvolucrados.join(" · ")
      : (pedido.proveedores?.nombre ?? null)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/pedidos"
            className="mb-2 inline-flex items-center gap-1.5 text-[12px] text-gray-500 transition-colors hover:text-gray-900"
          >
            <ArrowLeft className="size-3.5" />
            Pedidos de Compra
          </Link>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-gray-900">
            {pedido.nombre}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-gray-500">
            <span>
              {new Date(pedido.fecha).toLocaleDateString("es-MX", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <span className="text-gray-300">·</span>
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                background: "rgba(5,150,105,0.10)",
                color: "#047857",
                border: "1px solid rgba(5,150,105,0.20)",
              }}
            >
              TC ${Number(pedido.tipo_cambio).toFixed(2)} MXN/USD
            </span>
            <span className="text-gray-300">·</span>
            <span className="capitalize">{pedido.tipo ?? "—"}</span>
            {proveedoresLabel && (
              <>
                <span className="text-gray-300">·</span>
                <span>{proveedoresLabel}</span>
              </>
            )}
          </p>
        </div>
        <Link
          href={`/pedidos/${pedido.id}/editar`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
        >
          <Pencil className="size-4" />
          Editar pedido
        </Link>
      </div>

      {/* Agregar productos (entrada de inventario) */}
      <AgregarProductosPedido
        pedidoId={pedido.id}
        productos={productosBuscador}
        categoriaOptions={categoriaOptions}
        proveedorOptions={proveedorOptions}
        defaultTc={Number(pedido.tipo_cambio) || 20.7}
      />

      {/* KPI strip — totales del pedido */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Subtotal productos"
          valueUSD={usd(pedido.subtotal_usd)}
          valueMXN={mxn(pedido.subtotal_usd * pedido.tipo_cambio)}
          tone="indigo"
        />
        <Kpi
          label="Costo envío"
          valueUSD={usd(pedido.costo_envio_usd)}
          valueMXN={mxn(pedido.costo_envio_mxn)}
          tone="amber"
          sub={
            envioUnitUSD > 0
              ? `${usd(envioUnitUSD, 4)} / ${mxn2(envioUnitMXN)} por unidad`
              : undefined
          }
        />
        <Kpi
          label="Total invertido"
          valueUSD={usd(pedido.total_usd)}
          valueMXN={mxn(pedido.total_mxn)}
          tone="champagne"
          sub={`${totalUnidades} unidades · ${items.length} SKUs`}
        />
        <Kpi
          label="Profit potencial"
          valueUSD={undefined}
          valueMXN={mxn(totalProfit)}
          tone="emerald"
          sub="si se vende todo el stock"
        />
      </section>

      {/* Inversión por socio */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PartnerCard
          name="Sandra"
          mxn={pedido.inversion_sandra_mxn}
          usdValue={pedido.inversion_sandra_usd}
          tc={pedido.tipo_cambio}
          tone="rose"
          totalMXN={pedido.total_mxn}
        />
        <PartnerCard
          name="Benjamin"
          mxn={pedido.inversion_benjamin_mxn}
          usdValue={pedido.inversion_benjamin_usd}
          tc={pedido.tipo_cambio}
          tone="indigo"
          totalMXN={pedido.total_mxn}
        />
      </section>

      {/* Conversiones MXN → USDT (costo real con comisiones) */}
      <Conversiones
        pedidoId={pedido.id}
        conversiones={conversiones}
        pedidoTotalUsd={Number(pedido.total_usd)}
        pedidoTotalMxn={Number(pedido.total_mxn)}
      />

      {/* Items por categoría */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Este pedido no tiene items detallados (sólo monto de inversión).
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => {
            const catItems = grouped[cat]
            const catUnits = catItems.reduce(
              (s, i) => s + Number(i.cantidad),
              0,
            )
            const catCostUSD = catItems.reduce(
              (s, i) => s + Number(i.subtotal_usd),
              0,
            )
            const catCostMXN = catItems.reduce(
              (s, i) => s + Number(i.total_con_envio_mxn),
              0,
            )
            return (
              <section
                key={cat}
                className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
              >
                <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Package className="size-4 text-gray-400" strokeWidth={1.75} />
                    <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-gray-700">
                      {cat}
                    </h2>
                    <span className="text-[11px] text-gray-400">
                      {catItems.length} SKUs · {catUnits} unidades
                    </span>
                  </div>
                  <p className="text-[11.5px] tabular-nums text-gray-500">
                    {usd(catCostUSD)}
                    <span className="mx-1.5 text-gray-300">·</span>
                    <span className="font-semibold text-gray-700">
                      {mxn(catCostMXN)}
                    </span>{" "}
                    con envío
                  </p>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="border-b border-gray-50">
                        {[
                          ["Foto", "left"],
                          ["Producto", "left"],
                          ["Peso", "left"],
                          ["Cant.", "right"],
                          ["P. USD", "right"],
                          ["P. MXN", "right"],
                          ["Sub USD", "right"],
                          ["Envío/u USD", "right"],
                          ["Costo/u MXN", "right"],
                          ["Total MXN", "right"],
                          ["P. Público", "right"],
                          ["Profit", "right"],
                        ].map(([h, align]) => (
                          <th
                            key={h}
                            className={`whitespace-nowrap px-3 py-2.5 text-${align} text-[9.5px] font-semibold uppercase tracking-[0.08em] text-gray-400`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {catItems.map((item) => {
                        const prod = item.productos
                        const profitPositive = item.profit_unitario >= 0
                        return (
                          <tr
                            key={item.id}
                            className="border-b border-gray-50 transition-colors hover:bg-gray-50/50"
                          >
                            <td className="px-3 py-2.5">
                              {prod?.imagen_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={buildProductoImageUrl(prod.imagen_url) ?? ""}
                                  alt={prod.nombre ?? ""}
                                  className="size-10 rounded-lg border border-gray-100 object-cover"
                                />
                              ) : (
                                <div className="flex size-10 items-center justify-center rounded-lg border border-gray-100 bg-gray-50 text-gray-300">
                                  <Package className="size-4" />
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <p className="font-medium text-gray-900">
                                {prod?.nombre ?? "—"}
                              </p>
                              <p className="text-[10px] text-gray-400">
                                {prod?.sku ?? "—"}
                              </p>
                            </td>
                            <td className="px-3 py-2.5 text-[11.5px] text-gray-500">
                              {prod?.peso ?? "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                              {item.cantidad}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-indigo-700">
                              {usd(item.precio_unitario_usd, 2)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">
                              {mxn2(item.precio_unitario_mxn)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-indigo-700">
                              {usd(item.subtotal_usd, 2)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">
                              {usd(item.envio_unitario_usd, 4)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                              {mxn2(item.costo_total_unitario_mxn)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                              {mxn(item.total_con_envio_mxn)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">
                              {item.precio_publico_mxn > 0
                                ? mxn(item.precio_publico_mxn)
                                : "—"}
                            </td>
                            <td
                              className="px-3 py-2.5 text-right font-semibold tabular-nums"
                              style={{
                                color: profitPositive ? "#047857" : "#B91C1C",
                              }}
                            >
                              {item.precio_publico_mxn > 0
                                ? mxn(item.profit_total)
                                : "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}
        </div>
      )}

      {pedido.notas && (
        <section className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">
            Notas
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-gray-700">
            {pedido.notas}
          </p>
        </section>
      )}
    </div>
  )
}

const KPI_TONES: Record<
  "indigo" | "amber" | "champagne" | "emerald",
  { bg: string; border: string; text: string }
> = {
  indigo: { bg: "rgba(99,102,241,0.06)", border: "rgba(99,102,241,0.16)", text: "#4F46E5" },
  amber: { bg: "rgba(217,119,6,0.06)", border: "rgba(217,119,6,0.16)", text: "#B45309" },
  champagne: { bg: "rgba(197,164,126,0.08)", border: "rgba(197,164,126,0.20)", text: "#A8895F" },
  emerald: { bg: "rgba(5,150,105,0.06)", border: "rgba(5,150,105,0.16)", text: "#047857" },
}

function Kpi({
  label,
  valueUSD,
  valueMXN,
  tone,
  sub,
}: {
  label: string
  valueUSD?: string
  valueMXN: string
  tone: keyof typeof KPI_TONES
  sub?: string
}) {
  const t = KPI_TONES[tone]
  return (
    <div
      className="rounded-2xl border bg-white p-4 shadow-sm"
      style={{ borderColor: t.border }}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.10em]"
        style={{ color: t.text }}
      >
        {label}
      </p>
      <p
        className="mt-2 text-[22px] font-bold leading-none tracking-[-0.025em] tabular-nums text-gray-900"
        style={{ fontFeatureSettings: '"tnum" 1' }}
      >
        {valueMXN}
      </p>
      {valueUSD && (
        <p className="mt-1.5 inline-flex items-baseline gap-1 text-[11.5px] tabular-nums text-gray-500">
          {valueUSD}
          <span
            className="rounded-md px-1 py-0.5 text-[8.5px] font-bold tracking-[0.06em]"
            style={{ background: "rgba(5,150,105,0.08)", color: "#047857" }}
          >
            USD
          </span>
        </p>
      )}
      {sub && <p className="mt-1.5 text-[11px] text-gray-400">{sub}</p>}
    </div>
  )
}

function PartnerCard({
  name,
  mxn: amount,
  usdValue,
  tc,
  tone,
  totalMXN,
}: {
  name: string
  mxn: number
  usdValue: number
  tc: number
  tone: "rose" | "indigo"
  totalMXN: number
}) {
  const pct = totalMXN > 0 ? (amount / totalMXN) * 100 : 0
  const colors =
    tone === "rose"
      ? { bg: "rgba(220,38,38,0.06)", text: "#B91C1C", bar: "#DC2626" }
      : { bg: "rgba(99,102,241,0.06)", text: "#4F46E5", bar: "#6366F1" }
  return (
    <div
      className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-gray-500">
          Inversión {name}
        </p>
        <span
          className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
          style={{ background: colors.bg, color: colors.text }}
        >
          {pct.toFixed(1)}% del pedido
        </span>
      </div>
      <p className="mt-2 text-[24px] font-bold leading-none tracking-[-0.025em] tabular-nums text-gray-900">
        {mxn(amount)}
      </p>
      <p className="mt-1.5 inline-flex items-baseline gap-1 text-[11.5px] tabular-nums text-gray-500">
        {usd(usdValue)}
        <span
          className="rounded-md px-1 py-0.5 text-[8.5px] font-bold tracking-[0.06em]"
          style={{ background: "rgba(5,150,105,0.08)", color: "#047857" }}
        >
          USD
        </span>
        <span className="text-gray-400">@ TC {tc.toFixed(2)}</span>
      </p>
      <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, pct)}%`, background: colors.bar }}
        />
      </div>
    </div>
  )
}
