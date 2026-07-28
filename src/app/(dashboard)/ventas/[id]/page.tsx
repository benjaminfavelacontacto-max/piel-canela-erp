import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ShoppingBag, TrendingUp, Wallet, CircleDollarSign, Pencil, Gift } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { buildImageMap, findImageFor } from "@/lib/storage-images"
import { parseNotas } from "../notas-util"
import { formatMXN2 } from "@/lib/utils"
import { resumenRegalos, precioReferencia } from "@/lib/regalos"

import { parseFecha } from "@/lib/fecha"

const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "long",
  year: "numeric",
})

type Estatus = "pendiente" | "pagada_parcial" | "pagada_total" | "cancelada"

const estatusBadge: Record<Estatus, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  pagada_parcial: "bg-blue-100 text-blue-700",
  pagada_total: "bg-teal-100 text-teal-700",
  cancelada: "bg-gray-100 text-gray-600",
}

const estatusLabel: Record<Estatus, string> = {
  pendiente: "Pendiente",
  pagada_parcial: "Parcial",
  pagada_total: "Pagada",
  cancelada: "Cancelada",
}

export default async function VentaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: venta, error } = await supabase
    .from("ventas")
    .select(
      `id, numero, fecha, subtotal, iva, descuento, total, costo_productos, costo_envio,
       ganancia, cantidad_pagada, saldo_pendiente, estatus, notas, inventario_descontado,
       cotizacion_id,
       clientes(id, nombre, nombre_negocio, telefono, email, direccion, ciudad)`,
    )
    .eq("id", id)
    .maybeSingle()

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error.message}
        </div>
      </div>
    )
  }
  if (!venta) notFound()

  const [itemsRes, { data: socioRows }, imageMap] = await Promise.all([
    supabase
      .from("venta_items")
      .select(
        `cantidad, precio_unitario, costo_unitario, subtotal, costo_total, sort_order,
         es_regalo, precio_lista,
         productos(id, sku, nombre, nombre_display, imagen_url, categorias(nombre))`,
      )
      .eq("venta_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("venta_socios")
      .select(
        `monto, concepto, pagado, fecha_pago,
         socios(id, nombre, porcentaje)`,
      )
      .eq("venta_id", id),
    buildImageMap(),
  ])

  // es_regalo / precio_lista llegan con scripts/add-regalos-cotizaciones.sql;
  // sin la migración la venta se muestra igual, solo sin marcas de cortesía.
  let itemRows = itemsRes.data
  if (
    itemsRes.error &&
    /es_regalo|precio_lista/.test(itemsRes.error.message ?? "")
  ) {
    const retry = await supabase
      .from("venta_items")
      .select(
        `cantidad, precio_unitario, costo_unitario, subtotal, costo_total, sort_order,
         productos(id, sku, nombre, nombre_display, imagen_url, categorias(nombre))`,
      )
      .eq("venta_id", id)
      .order("sort_order", { ascending: true })
    itemRows = retry.data as typeof itemRows
  }

  type ItemRow = {
    cantidad: number
    precio_unitario: number
    costo_unitario: number
    subtotal: number
    costo_total: number
    es_regalo?: boolean | null
    precio_lista?: number | null
    productos: {
      id: string
      sku: string | null
      nombre: string
      nombre_display: string | null
      imagen_url: string | null
      categorias: { nombre: string } | null
    } | null
  }

  type SocioRow = {
    monto: number
    concepto: string | null
    pagado: boolean
    fecha_pago: string | null
    socios: { id: string; nombre: string; porcentaje: number } | null
  }

  const items = (itemRows ?? []) as unknown as ItemRow[]
  const socios = (socioRows ?? []) as unknown as SocioRow[]

  type Cliente = {
    id: string
    nombre: string
    nombre_negocio: string | null
    telefono: string | null
    email: string | null
    direccion: string | null
    ciudad: string | null
  }
  const cliente = (venta.clientes as unknown as Cliente | null) ?? null
  const { metodo, notas } = parseNotas(venta.notas)
  const estatus = venta.estatus as Estatus

  // Desglose por categoría
  const desgloseMap = new Map<
    string,
    { unidades: number; subtotal: number }
  >()
  for (const it of items) {
    const cat = it.productos?.categorias?.nombre?.toUpperCase() ?? "OTROS"
    const e = desgloseMap.get(cat) ?? { unidades: 0, subtotal: 0 }
    e.unidades += Number(it.cantidad ?? 0)
    e.subtotal += Number(it.subtotal ?? 0)
    desgloseMap.set(cat, e)
  }
  const desgloseArray = Array.from(desgloseMap.entries())
    .map(([categoria, d]) => ({ categoria, ...d }))
    .sort((a, b) => b.subtotal - a.subtotal)
  const totalUds = desgloseArray.reduce((s, d) => s + d.unidades, 0)

  // Cortesías entregadas en esta venta. Su costo ya está dentro de
  // `costo_productos`, así que `ganancia` (GENERATED) ya lo tiene restado:
  // aquí solo se hace visible cuánto fue.
  const regalos = resumenRegalos(items)

  const COLORES_CAT: Record<string, { bg: string; text: string }> = {
    CINTAS: { bg: "rgba(217,119,6,0.10)", text: "#B45309" },
    ACTIVADORES: { bg: "rgba(15,118,110,0.10)", text: "#0F766E" },
    POTENCIADORES: { bg: "rgba(5,150,105,0.10)", text: "#047857" },
    OXIGENANTES: { bg: "rgba(8,145,178,0.10)", text: "#0E7490" },
    "POLVO DE BLANQUEAR": { bg: "rgba(147,51,234,0.10)", text: "#7E22CE" },
    "EMULSIÓN REVELADORA": { bg: "rgba(37,99,235,0.10)", text: "#1D4ED8" },
    "ACEITE CORPORAL": { bg: "rgba(217,119,6,0.10)", text: "#B45309" },
    EXFOLIANTS: { bg: "rgba(15,118,110,0.08)", text: "#0F766E" },
    HUMECTANTES: { bg: "rgba(99,102,241,0.10)", text: "#4F46E5" },
    "DYE COLOR": { bg: "rgba(8,145,178,0.10)", text: "#0E7490" },
    AEROGRAFÍA: { bg: "rgba(220,38,38,0.10)", text: "#B91C1C" },
    SHAMPOO: { bg: "rgba(220,38,127,0.10)", text: "#BE185D" },
    SOMBRILLA: { bg: "rgba(197,164,126,0.12)", text: "#A8895F" },
    OTROS: { bg: "rgba(100,116,139,0.10)", text: "#475569" },
  }
  const getColorCat = (cat: string) => COLORES_CAT[cat] ?? COLORES_CAT.OTROS

  return (
    <div className="p-4">
      <nav className="mb-4 flex items-center gap-2 text-xs text-gray-500">
        <Link href="/ventas" className="hover:text-gray-900">
          Ventas
        </Link>
        <span>/</span>
        <span className="font-mono text-gray-900">{venta.numero}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/ventas"
            className="text-gray-400 hover:text-gray-600"
            aria-label="Volver"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="font-mono text-2xl font-semibold text-gray-900">
              {venta.numero}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {fechaFmt.format(parseFecha(venta.fecha))}
              {venta.cotizacion_id && (
                <>
                  {" · "}
                  <Link
                    href={`/cotizaciones/${venta.cotizacion_id}`}
                    className="text-[#0F766E] hover:underline"
                  >
                    Ver cotización
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/ventas/${id}/editar`}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#115E59]"
          >
            <Pencil className="size-4" />
            Editar venta
          </Link>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${estatusBadge[estatus]}`}
          >
            {estatusLabel[estatus]}
          </span>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total"
          value={formatMXN2(Number(venta.total ?? 0))}
          icon={ShoppingBag}
          tone="text-gray-900"
        />
        <StatCard
          label="Ganancia"
          value={formatMXN2(Number(venta.ganancia ?? 0))}
          icon={TrendingUp}
          tone="text-emerald-700"
        />
        <StatCard
          label="Pagado"
          value={formatMXN2(Number(venta.cantidad_pagada ?? 0))}
          icon={CircleDollarSign}
          tone="text-blue-700"
        />
        <StatCard
          label="Saldo"
          value={formatMXN2(Number(venta.saldo_pendiente ?? 0))}
          icon={Wallet}
          tone={Number(venta.saldo_pendiente ?? 0) > 0 ? "text-amber-700" : "text-gray-900"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-gray-200 bg-white">
          <header className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Productos
            </h2>
          </header>
          {items.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-500">
              Esta venta no tiene productos asociados.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EEF1F4] bg-[#F9FAFB]">
                  <th className="w-14 px-3 py-2"></th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Producto
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wide text-gray-500">
                    Cant.
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                    P. Unit.
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                    Costo unit.
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((it, i) => {
                  const display = it.productos?.nombre_display ?? it.productos?.nombre ?? "—"
                  const img = findImageFor(display, it.productos?.imagen_url ?? null, imageMap)
                  const regalo = it.es_regalo === true
                  return (
                    <tr
                      key={`${it.productos?.id ?? "row"}-${i}`}
                      className={regalo ? "bg-fuchsia-50/50" : undefined}
                    >
                      <td className="px-3 py-2">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={img}
                            alt={display}
                            className="size-9 rounded border border-gray-200 object-cover"
                          />
                        ) : (
                          <div className="size-9 rounded border border-gray-200 bg-gray-50" />
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-900">
                        <div className="flex items-center gap-1.5 font-medium">
                          {display}
                          {regalo && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fuchsia-700">
                              <Gift className="size-2.5" />
                              Regalo
                            </span>
                          )}
                        </div>
                        {it.productos?.sku && (
                          <div className="font-mono text-xs text-gray-500">
                            {it.productos.sku}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">{it.cantidad}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          regalo ? "text-gray-400 line-through" : ""
                        }`}
                      >
                        {formatMXN2(
                          regalo
                            ? precioReferencia(it)
                            : Number(it.precio_unitario),
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                        {formatMXN2(Number(it.costo_unitario))}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-semibold tabular-nums ${
                          regalo ? "text-fuchsia-600" : ""
                        }`}
                      >
                        {regalo ? "GRATIS" : formatMXN2(Number(it.subtotal))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td colSpan={5} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-gray-500">
                    Subtotal
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMXN2(Number(venta.subtotal ?? 0))}
                  </td>
                </tr>
                {Number(venta.descuento ?? 0) > 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-1 text-right text-xs uppercase tracking-wide text-gray-500">
                      Descuento
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums text-emerald-700">
                      -{formatMXN2(Number(venta.descuento))}
                    </td>
                  </tr>
                )}
                {regalos.lineas > 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-1 text-right text-xs uppercase tracking-wide text-fuchsia-700"
                    >
                      Regalos · {regalos.piezas} pzs (valor{" "}
                      {formatMXN2(regalos.valor)}) — costo que se pierde
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums text-fuchsia-700">
                      −{formatMXN2(regalos.costo)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-1 text-right text-xs uppercase tracking-wide text-gray-500"
                  >
                    IVA real cobrado
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums">
                    {Number(venta.iva ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-teal-200/60">
                        ✓ Con IVA · {formatMXN2(Number(venta.iva))}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        Sin IVA
                      </span>
                    )}
                  </td>
                </tr>
                <tr className="border-t border-gray-200">
                  <td colSpan={5} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-gray-700 font-semibold">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right text-base font-bold tabular-nums">
                    {formatMXN2(Number(venta.total ?? 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Cliente
            </h2>
            <div className="mt-2 text-sm text-gray-900 font-medium">
              {cliente?.nombre_negocio ?? cliente?.nombre ?? "—"}
            </div>
            {cliente?.nombre_negocio && (
              <div className="text-xs text-gray-600">{cliente.nombre}</div>
            )}
            <div className="mt-2 space-y-1 text-xs text-gray-600">
              {cliente?.telefono && <div>Tel: {cliente.telefono}</div>}
              {cliente?.email && <div>{cliente.email}</div>}
              {cliente?.direccion && (
                <div>
                  {cliente.direccion}
                  {cliente.ciudad ? `, ${cliente.ciudad}` : ""}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Pago
            </h2>
            <div className="mt-2 space-y-1 text-sm">
              <Row label="Método" value={metodo ?? "—"} />
              <Row label="Pagado" value={formatMXN2(Number(venta.cantidad_pagada ?? 0))} />
              <Row
                label="Saldo"
                value={formatMXN2(Number(venta.saldo_pendiente ?? 0))}
                valueClass={
                  Number(venta.saldo_pendiente ?? 0) > 0 ? "text-amber-700" : ""
                }
              />
            </div>
          </div>

          {/* DESGLOSE POR TIPO */}
          {desgloseArray.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Tipos de Producto
                </h2>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums text-gray-500"
                  style={{ background: "rgba(15,23,42,0.05)" }}
                >
                  {desgloseArray.length}{" "}
                  {desgloseArray.length === 1 ? "tipo" : "tipos"}
                </span>
              </div>

              <div className="flex flex-col gap-1 px-2 py-2">
                {desgloseArray.map((item) => {
                  const palette = getColorCat(item.categoria)
                  const pct =
                    totalUds > 0
                      ? Math.round((item.unidades / totalUds) * 100)
                      : 0
                  return (
                    <div
                      key={item.categoria}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-gray-50/60"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{
                          background: palette.text,
                          boxShadow: `0 0 6px ${palette.text}50`,
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="truncate text-[11px] font-semibold"
                            style={{
                              color: palette.text,
                              letterSpacing: "0.02em",
                            }}
                            title={item.categoria}
                          >
                            {item.categoria.length > 16
                              ? item.categoria.slice(0, 15) + "…"
                              : item.categoria}
                          </span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="text-[11px] font-bold tabular-nums text-[#0F172A]">
                              {item.unidades}u
                            </span>
                            <span className="text-[9.5px] tabular-nums text-gray-400">
                              {pct}%
                            </span>
                          </div>
                        </div>
                        <div className="mt-1 h-[2px] overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              background: palette.text,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-[10px] tabular-nums text-gray-400">
                          {formatMXN2(item.subtotal)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 px-5 py-2.5">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.10em] text-gray-400">
                  Total unidades
                </span>
                <span className="text-[13px] font-bold tabular-nums text-[#0F172A]">
                  {totalUds}
                </span>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              División de socios
            </h2>
            {socios.length === 0 ? (
              <p className="mt-2 text-xs text-gray-500">Sin socios asignados.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {socios.map((s, i) => (
                  <li key={`${s.socios?.id ?? i}`} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">
                        {s.socios?.nombre ?? "—"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {s.socios?.porcentaje ?? 0}%
                        {" · "}
                        <span className={s.pagado ? "text-emerald-700" : "text-amber-700"}>
                          {s.pagado ? "Pagado" : "Pendiente"}
                        </span>
                      </div>
                    </div>
                    <span className="tabular-nums font-semibold">
                      {formatMXN2(Number(s.monto))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {notas && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Notas
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{notas}</p>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Inventario
            </h2>
            <p className="mt-2 text-sm text-gray-700">
              {venta.inventario_descontado
                ? "Stock descontado."
                : "Stock no descontado todavía."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
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
      <div className={`mt-2 text-xl font-semibold tabular-nums ${tone}`}>
        {value}
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`tabular-nums ${valueClass ?? "text-gray-900"}`}>{value}</span>
    </div>
  )
}
