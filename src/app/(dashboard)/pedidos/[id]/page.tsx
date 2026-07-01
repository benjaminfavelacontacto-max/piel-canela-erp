import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  Package,
  Pencil,
  Boxes,
  Tag,
  Coins,
  Truck,
  Wallet,
  TrendingUp,
  Percent,
  Target,
  DollarSign,
  Users,
  type LucideIcon,
} from "lucide-react"
import { buildProductoImageUrl } from "@/lib/storage-images"
import { AgregarProductosPedido } from "./agregar-productos"
import { Conversiones } from "./conversiones"
import { Pagos } from "./pagos"
import { Documentos } from "./documentos"
import { DesgloseEnvio } from "./envios"
import { formatMXN, formatMXN2 } from "@/lib/utils"

const usd = (v: number, decimals = 0) =>
  `$${Number(v).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`

const pct = (v: number) => `${(Number(v) || 0).toFixed(1)}%`

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
  const convRes = await supabase
    .from("pedido_conversiones")
    .select(
      "id, fecha, mxn_gastado, usdt_recibido, tipo_cambio, comision_mxn, notas, comprobante_url",
    )
    .eq("pedido_id", id)
    .order("fecha", { ascending: true })
  const conversionesData = convRes.error
    ? (
        await supabase
          .from("pedido_conversiones")
          .select(
            "id, fecha, mxn_gastado, usdt_recibido, tipo_cambio, comision_mxn, notas",
          )
          .eq("pedido_id", id)
          .order("fecha", { ascending: true })
      ).data
    : convRes.data
  const conversiones = ((conversionesData ?? []) as Record<string, unknown>[]).map(
    (c) => ({
      id: c.id as string,
      fecha: c.fecha as string,
      mxn_gastado: c.mxn_gastado as number,
      usdt_recibido: c.usdt_recibido as number,
      tipo_cambio: c.tipo_cambio as number,
      comision_mxn: c.comision_mxn as number,
      notas: (c.notas as string | null) ?? null,
      comprobante_url: (c.comprobante_url as string | null) ?? null,
    }),
  )

  // Pagos (transfers USDT) al proveedor. Intenta traer comprobante_url; si la
  // columna aún no existe (SQL no corrido), hace fallback sin romper los pagos.
  const pagosRes = await supabase
    .from("pedido_pagos")
    .select("id, fecha, usdt_enviado, destinatario, mensaje, comprobante_url")
    .eq("pedido_id", id)
    .order("fecha", { ascending: true })
  const pagosData = pagosRes.error
    ? (
        await supabase
          .from("pedido_pagos")
          .select("id, fecha, usdt_enviado, destinatario, mensaje")
          .eq("pedido_id", id)
          .order("fecha", { ascending: true })
      ).data
    : pagosRes.data
  const pagos = ((pagosData ?? []) as Record<string, unknown>[]).map((p) => ({
    id: p.id as string,
    fecha: p.fecha as string,
    usdt_enviado: p.usdt_enviado as number,
    destinatario: (p.destinatario as string | null) ?? null,
    mensaje: (p.mensaje as string | null) ?? null,
    comprobante_url: (p.comprobante_url as string | null) ?? null,
  }))

  // Documentos del pedido (facturas, comprobantes) — tolerante si la tabla aún no existe
  const { data: docsData } = await supabase
    .from("pedido_documentos")
    .select("id, nombre, tipo, filename, notas, created_at")
    .eq("pedido_id", id)
    .order("created_at", { ascending: false })
  const documentos = (docsData ?? []) as {
    id: string
    nombre: string
    tipo: string
    filename: string
    notas: string | null
    created_at: string
  }[]

  // Tramos de envío (desglose informativo) — tolerante si la tabla aún no existe
  const { data: enviosData } = await supabase
    .from("pedido_envios")
    .select("id, tramo, monto_usd, monto_mxn, filename, notas, sort_order")
    .eq("pedido_id", id)
    .order("sort_order", { ascending: true })
  const tramosEnvio = (enviosData ?? []) as {
    id: string
    tramo: string
    monto_usd: number
    monto_mxn: number
    filename: string | null
    notas: string | null
  }[]

  const items = (pedido.pedido_compra_items ?? []).sort(
    (a, b) => a.sort_order - b.sort_order,
  )
  const totalUnidades = items.reduce((s, i) => s + Number(i.cantidad), 0)
  const totalProfit = items.reduce((s, i) => s + Number(i.profit_total ?? 0), 0)
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

  // ── Métricas financieras del pedido ──
  const tc = Number(pedido.tipo_cambio) || 0
  const valorProductosMXN = Number(pedido.subtotal_usd) * tc
  const envioMXN = Number(pedido.costo_envio_mxn)
  const totalMXN = Number(pedido.total_mxn)
  const totalUSD = Number(pedido.total_usd)
  // Lo que se le paga al proveedor (Julio) es SOLO la mercancía; el envío se
  // paga por separado a las paqueterías → la barra de pagos mide contra esto.
  const envioUSD = Number(pedido.costo_envio_usd)
  const productosUSD = Math.max(0, totalUSD - envioUSD)
  const envioPctPedido = totalMXN > 0 ? (envioMXN / totalMXN) * 100 : 0
  const envioPorSkuMXN = items.length > 0 ? envioMXN / items.length : 0
  // Rentabilidad (profit = precio_público − costo con envío)
  const ingresoEsperadoMXN = totalMXN + totalProfit
  const margenPct = ingresoEsperadoMXN > 0 ? (totalProfit / ingresoEsperadoMXN) * 100 : 0
  const roiPct = totalMXN > 0 ? (totalProfit / totalMXN) * 100 : 0
  // Conversiones MXN→USDT → costo real con comisiones (el detalle de progreso lo calcula <Conversiones/>)
  const totComisionMXN = conversiones.reduce((s, c) => s + Number(c.comision_mxn || 0), 0)
  const costoRealMXN = totalMXN + totComisionMXN

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

      {/* ═══ KPI Principal — Costo real del pedido ═══ */}
      <section
        className="relative overflow-hidden rounded-2xl p-6 shadow-sm"
        style={{ background: "linear-gradient(120deg, #1e293b 0%, #0f172a 100%)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/55">
              <DollarSign className="size-3.5" />
              Costo real del pedido
            </p>
            <p className="mt-2 text-[42px] font-bold leading-none tracking-[-0.03em] tabular-nums text-white">
              {formatMXN(costoRealMXN)}
            </p>
            <p className="mt-2.5 text-[12px] text-white/55">
              Productos {formatMXN(valorProductosMXN)}
              <span className="mx-1.5 text-white/25">+</span>Envío {formatMXN(envioMXN)}
              <span className="mx-1.5 text-white/25">+</span>Comisiones {formatMXN(totComisionMXN)}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right backdrop-blur">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/45">
              USD enviado al proveedor
            </p>
            <p className="mt-1 text-[22px] font-bold tabular-nums text-white">{usd(totalUSD, 2)}</p>
            <p className="mt-0.5 text-[10.5px] text-white/45">@ TC {tc.toFixed(2)} MXN/USD</p>
          </div>
        </div>
      </section>

      {/* ═══ Bloque 1 — Resumen del pedido ═══ */}
      <section className="rounded-2xl border border-gray-100 bg-white px-5 py-5 shadow-sm">
        <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
          <ResumenMetric icon={Boxes} tone="slate" value={totalUnidades.toLocaleString("es-MX")} label="Unidades pedidas" />
          <ResumenMetric icon={Tag} tone="slate" value={String(items.length)} label="SKUs distintos" />
          <ResumenMetric icon={Coins} tone="indigo" value={formatMXN(valorProductosMXN)} label="Valor productos" />
          <ResumenMetric icon={Truck} tone="amber" value={formatMXN(envioMXN)} label="Costo envío" />
          <ResumenMetric icon={Wallet} tone="emerald" value={formatMXN(totalMXN)} label="Inversión total" />
        </div>
      </section>

      {/* ═══ Bloque 5 — Rentabilidad (KPIs destacadas) ═══ */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={Wallet} tone="slate" label="Inversión total" value={formatMXN(totalMXN)} sub={`${usd(totalUSD, 2)} USD`} />
        <KpiCard icon={TrendingUp} tone="emerald" label="Profit potencial" value={formatMXN(totalProfit)} sub="si se vende todo" big />
        <KpiCard icon={Percent} tone="emerald" label="Margen esperado" value={pct(margenPct)} sub="sobre la venta" />
        <KpiCard icon={Target} tone="indigo" label="ROI esperado" value={pct(roiPct)} sub="sobre la inversión" big />
      </section>

      {/* ═══ Bloque 2 (Logística) + Bloque 4 (Inversionistas) ═══ */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-1.5 text-[13px] font-semibold text-gray-900">
            <Truck className="size-4 text-amber-600" />
            Logística del envío
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <StatBlock tone="amber" label="Costo total" value={formatMXN(envioMXN)} />
            <StatBlock tone="slate" label="Por unidad" value={formatMXN2(envioUnitMXN)} />
            <StatBlock tone="slate" label="Por SKU" value={formatMXN(envioPorSkuMXN)} />
            <StatBlock tone="amber" label="Representa del pedido" value={pct(envioPctPedido)} />
          </div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-1.5 text-[13px] font-semibold text-gray-900">
            <Users className="size-4 text-gray-500" />
            Participación de socios
          </h3>
          <div className="space-y-3.5">
            <PartnerRow name="Sandra" amount={Number(pedido.inversion_sandra_mxn)} usdValue={Number(pedido.inversion_sandra_usd)} totalMXN={totalMXN} tone="rose" />
            <PartnerRow name="Benjamin" amount={Number(pedido.inversion_benjamin_mxn)} usdValue={Number(pedido.inversion_benjamin_usd)} totalMXN={totalMXN} tone="indigo" />
          </div>
        </div>
      </section>

      {/* ═══ Desglose del envío por tramos (informativo) ═══ */}
      <DesgloseEnvio pedidoId={pedido.id} tramos={tramosEnvio} />

      {/* ═══ Pagos al proveedor (USDT enviado) ═══ */}
      <Pagos pedidoId={pedido.id} pagos={pagos} productosUsd={productosUSD} />

      {/* ═══ Conversiones MXN → USDT (comisiones → costo real) ═══ */}
      <Conversiones
        pedidoId={pedido.id}
        conversiones={conversiones}
        pedidoTotalMxn={totalMXN}
      />

      {/* ═══ Facturas y documentos (PDF/imagen) ═══ */}
      <Documentos pedidoId={pedido.id} documentos={documentos} />

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
                      {formatMXN(catCostMXN)}
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
                          ["Margen %", "right"],
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
                        // Margen sobre el precio público (cuánto del precio de venta es ganancia)
                        const margen =
                          item.precio_publico_mxn > 0
                            ? (item.profit_unitario / item.precio_publico_mxn) * 100
                            : null
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
                              {prod?.sku ? (
                                <Link
                                  href={`/inventario?producto=${encodeURIComponent(prod.sku)}`}
                                  className="group/prod block"
                                  title="Ver detalle del producto"
                                >
                                  <p className="font-medium text-gray-900 underline-offset-2 group-hover/prod:text-teal-700 group-hover/prod:underline">
                                    {prod.nombre ?? "—"}
                                  </p>
                                  <p className="text-[10px] text-gray-400">{prod.sku}</p>
                                </Link>
                              ) : (
                                <>
                                  <p className="font-medium text-gray-900">
                                    {prod?.nombre ?? "—"}
                                  </p>
                                  <p className="text-[10px] text-gray-400">—</p>
                                </>
                              )}
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
                              {formatMXN2(item.precio_unitario_mxn)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-indigo-700">
                              {usd(item.subtotal_usd, 2)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">
                              {usd(item.envio_unitario_usd, 4)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                              {formatMXN2(item.costo_total_unitario_mxn)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                              {formatMXN(item.total_con_envio_mxn)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">
                              {item.precio_publico_mxn > 0
                                ? formatMXN(item.precio_publico_mxn)
                                : "—"}
                            </td>
                            <td
                              className="px-3 py-2.5 text-right font-semibold tabular-nums"
                              style={{
                                color: profitPositive ? "#047857" : "#B91C1C",
                              }}
                            >
                              {item.precio_publico_mxn > 0
                                ? formatMXN(item.profit_total)
                                : "—"}
                            </td>
                            <td
                              className="px-3 py-2.5 text-right font-semibold tabular-nums"
                              style={{
                                color: profitPositive ? "#047857" : "#B91C1C",
                              }}
                            >
                              {margen != null ? `${margen.toFixed(1)}%` : "—"}
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

const TONES: Record<
  "slate" | "indigo" | "amber" | "emerald" | "rose",
  { bg: string; border: string; text: string; bar: string }
> = {
  slate: { bg: "rgba(71,85,105,0.06)", border: "rgba(71,85,105,0.16)", text: "#475569", bar: "#64748B" },
  indigo: { bg: "rgba(99,102,241,0.07)", border: "rgba(99,102,241,0.18)", text: "#4F46E5", bar: "#6366F1" },
  amber: { bg: "rgba(217,119,6,0.07)", border: "rgba(217,119,6,0.18)", text: "#B45309", bar: "#D97706" },
  emerald: { bg: "rgba(5,150,105,0.07)", border: "rgba(5,150,105,0.18)", text: "#047857", bar: "#059669" },
  rose: { bg: "rgba(220,38,38,0.06)", border: "rgba(220,38,38,0.16)", text: "#B91C1C", bar: "#DC2626" },
}

// Bloque 1 — métrica de resumen (icono + número grande + etiqueta)
function ResumenMetric({
  icon: Icon,
  tone,
  value,
  label,
}: {
  icon: LucideIcon
  tone: keyof typeof TONES
  value: string
  label: string
}) {
  const t = TONES[tone]
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: t.bg, color: t.text }}
      >
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[20px] font-bold leading-none tracking-[-0.025em] tabular-nums text-gray-900">
          {value}
        </p>
        <p className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.04em] text-gray-400">
          {label}
        </p>
      </div>
    </div>
  )
}

// Bloque 5 — KPI destacada (con icono; `big` resalta con fondo de color)
function KpiCard({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  big,
}: {
  icon: LucideIcon
  tone: keyof typeof TONES
  label: string
  value: string
  sub?: string
  big?: boolean
}) {
  const t = TONES[tone]
  return (
    <div
      className="rounded-2xl border bg-white p-4 shadow-sm"
      style={{ borderColor: t.border, background: big ? t.bg : undefined }}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5" style={{ color: t.text }} />
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: t.text }}>
          {label}
        </p>
      </div>
      <p className="mt-2 text-[26px] font-bold leading-none tracking-[-0.03em] tabular-nums text-gray-900">
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[11px] text-gray-400">{sub}</p>}
    </div>
  )
}

// Bloque 2 — stat de logística (etiqueta + valor)
function StatBlock({
  tone,
  label,
  value,
}: {
  tone: keyof typeof TONES
  label: string
  value: string
}) {
  const t = TONES[tone]
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: t.text }}>
        {label}
      </p>
      <p className="mt-1 text-[18px] font-bold leading-none tracking-[-0.02em] tabular-nums text-gray-900">
        {value}
      </p>
    </div>
  )
}

// Bloque 4 — fila compacta de participación de socio
function PartnerRow({
  name,
  amount,
  usdValue,
  totalMXN,
  tone,
}: {
  name: string
  amount: number
  usdValue: number
  totalMXN: number
  tone: keyof typeof TONES
}) {
  const t = TONES[tone]
  const p = totalMXN > 0 ? (amount / totalMXN) * 100 : 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-gray-900">{name}</p>
        <div className="text-right">
          <span className="text-[16px] font-bold tabular-nums text-gray-900">{formatMXN(amount)}</span>
          <span className="ml-1.5 text-[11px] tabular-nums text-gray-400">{usd(usdValue)} USD</span>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, p)}%`, background: t.bar }}
          />
        </div>
        <span className="text-[10.5px] font-semibold tabular-nums" style={{ color: t.text }}>
          {p.toFixed(0)}%
        </span>
      </div>
    </div>
  )
}
