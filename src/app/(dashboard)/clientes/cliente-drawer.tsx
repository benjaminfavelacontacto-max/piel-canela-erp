"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Brain,
  Building2,
  Calendar,
  CircleDollarSign,
  Clock,
  ExternalLink,
  FileText,
  Hash,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  Receipt,
  ShoppingBag,
  Sparkles,
  StickyNote,
  Target,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react"
import type {
  CotizacionSummaryRow,
  EnrichedCliente,
  VentaItemSummary,
  VentaSummaryRow,
} from "./clientes-dashboard"
import { EmpiricalCDFModel, MES_ABBR } from "./lib-prediccion"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
})
const fechaShort = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "2-digit",
})

const STATUS_COLORS: Record<string, string> = {
  pagada_total: "text-emerald-700 bg-emerald-50 ring-emerald-200/60",
  pagada_parcial: "text-amber-700 bg-amber-50 ring-amber-200/60",
  pendiente: "text-rose-700 bg-rose-50 ring-rose-200/60",
  cancelada: "text-gray-600 bg-gray-100 ring-gray-200",
  borrador: "text-gray-600 bg-gray-50 ring-gray-200",
  enviada: "text-blue-700 bg-blue-50 ring-blue-200/60",
  aceptada: "text-emerald-700 bg-emerald-50 ring-emerald-200/60",
  rechazada: "text-rose-700 bg-rose-50 ring-rose-200/60",
  vencida: "text-gray-500 bg-gray-100 ring-gray-200",
}
const STATUS_LABELS: Record<string, string> = {
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

function Section({
  icon: Icon,
  title,
  right,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-gray-100 px-6 py-5 last:border-b-0">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 text-gray-400" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            {title}
          </h3>
        </div>
        {right}
      </header>
      {children}
    </section>
  )
}

export function ClienteDrawer({
  cliente,
  open,
  onClose,
  ventas,
  cotizaciones,
  venta_items,
}: {
  cliente: EnrichedCliente | null
  open: boolean
  onClose: () => void
  ventas: VentaSummaryRow[]
  cotizaciones: CotizacionSummaryRow[]
  venta_items: VentaItemSummary[]
}) {
  // Body scroll lock
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = "hidden"
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [open])

  // Esc to close
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const ventasCliente = useMemo(() => {
    if (!cliente) return []
    return ventas
      .filter((v) => v.cliente_id === cliente.id)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  }, [cliente, ventas])

  const cotsCliente = useMemo(() => {
    if (!cliente) return []
    return cotizaciones
      .filter((c) => c.cliente_id === cliente.id)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  }, [cliente, cotizaciones])

  const productosTop = useMemo(() => {
    if (!cliente) return []
    const ventaIds = new Set(ventasCliente.map((v) => v.id))
    const map = new Map<
      string,
      { nombre: string; sku: string | null; cantidad: number; revenue: number }
    >()
    for (const it of venta_items) {
      if (!ventaIds.has(it.venta_id)) continue
      const p = it.productos
      if (!p) continue
      const key = p.id
      const cur = map.get(key) ?? {
        nombre: p.nombre,
        sku: p.sku,
        cantidad: 0,
        revenue: 0,
      }
      cur.cantidad += Number(it.cantidad ?? 0)
      cur.revenue +=
        Number(it.cantidad ?? 0) * Number(it.precio_unitario ?? 0)
      map.set(key, cur)
    }
    return Array.from(map.values())
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 8)
  }, [cliente, ventasCliente, venta_items])

  // Timeline mensual de ventas (últimos 12 meses)
  const monthly = useMemo(() => {
    if (!cliente) return []
    const now = new Date()
    const months: { key: string; label: string; total: number; count: number }[] =
      []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      months.push({
        key,
        label: d.toLocaleDateString("es-MX", { month: "short" }).replace(".", ""),
        total: 0,
        count: 0,
      })
    }
    const idx = new Map(months.map((m, i) => [m.key, i]))
    for (const v of ventasCliente) {
      const k = v.fecha.slice(0, 7)
      const i = idx.get(k)
      if (i === undefined) continue
      months[i].total += Number(v.total ?? 0)
      months[i].count += 1
    }
    return months
  }, [cliente, ventasCliente])

  // Predicción cliente (memo)
  const prediccion = useMemo(() => {
    if (!cliente) return null
    const model = new EmpiricalCDFModel(60)
    return model.predict(cliente, ventas, new Date())
  }, [cliente, ventas])

  if (!cliente) return null

  const display = cliente.nombre_negocio ?? cliente.nombre
  const sub = cliente.nombre_negocio ? cliente.nombre : null
  const maxMonth = Math.max(1, ...monthly.map((m) => m.total))

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[600px] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle cliente ${display}`}
      >
        {/* Hero */}
        <header className="relative border-b border-gray-100 bg-gradient-to-br from-pink-50 via-white to-teal-50/40 px-6 pb-5 pt-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 transition hover:bg-white hover:text-gray-700"
          >
            <X className="size-4" />
          </button>
          <div className="flex items-start gap-3">
            <Avatar nombre={display} size={56} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-bold text-gray-900">
                {display}
              </h2>
              {sub && (
                <p className="mt-0.5 truncate text-xs text-gray-500">{sub}</p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {cliente.tipo && (
                  <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-gray-700">
                    {cliente.tipo}
                  </span>
                )}
                {cliente.rfc && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-blue-700">
                    <Hash className="size-2.5" />
                    {cliente.rfc}
                  </span>
                )}
                {cliente.ciudad && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-medium text-violet-700">
                    <MapPin className="size-2.5" />
                    {cliente.ciudad}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat
              label="LTV"
              value={mxn.format(cliente.ltv)}
              accent="text-pink-700"
            />
            <Stat
              label="Utilidad"
              value={mxn.format(cliente.utilidad_total)}
              accent="text-emerald-700"
            />
            <Stat
              label="Ticket prom."
              value={mxn.format(cliente.ticket_promedio)}
              accent="text-violet-700"
            />
          </div>
          {/* Quick actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              href={`/clientes/${cliente.id}/editar`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-50"
            >
              <Pencil className="size-3" />
              Editar
            </Link>
            <Link
              href={`/cotizaciones/nueva?cliente=${cliente.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-pink-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-pink-700"
            >
              <FileText className="size-3" />
              Nueva cotización
            </Link>
            {cliente.telefono && (
              <a
                href={`tel:${cliente.telefono}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-50"
              >
                <Phone className="size-3" />
                Llamar
              </a>
            )}
            {cliente.email && (
              <a
                href={`mailto:${cliente.email}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-50"
              >
                <Mail className="size-3" />
                Email
              </a>
            )}
          </div>
        </header>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto">
          {/* Contacto */}
          <Section icon={Building2} title="Contacto y datos">
            <dl className="grid grid-cols-1 gap-2 text-xs">
              {cliente.telefono && (
                <DLine icon={Phone} label="Teléfono" value={cliente.telefono} />
              )}
              {cliente.email && (
                <DLine icon={Mail} label="Email" value={cliente.email} />
              )}
              {cliente.direccion && (
                <DLine
                  icon={MapPin}
                  label="Dirección"
                  value={`${cliente.direccion}${cliente.ciudad ? `, ${cliente.ciudad}` : ""}${cliente.estado ? `, ${cliente.estado}` : ""}`}
                />
              )}
              {cliente.metodo_pago_pref && (
                <DLine
                  icon={Wallet}
                  label="Método pago pref."
                  value={cliente.metodo_pago_pref}
                />
              )}
              {cliente.vendedor_nombre && (
                <DLine
                  icon={Users}
                  label="Vendedor asignado"
                  value={cliente.vendedor_nombre}
                />
              )}
            </dl>
          </Section>

          {/* Recurrencia */}
          <Section icon={Sparkles} title="Recurrencia">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <RecurMini
                label="# Compras"
                value={cliente.ventas_count.toString()}
                accent="text-pink-700"
              />
              <RecurMini
                label="Frec."
                value={
                  cliente.frecuencia_dias
                    ? `${Math.round(cliente.frecuencia_dias)}d`
                    : "—"
                }
                accent="text-violet-700"
              />
              <RecurMini
                label="Última"
                value={
                  cliente.dias_sin_compra !== null
                    ? `hace ${cliente.dias_sin_compra}d`
                    : "—"
                }
                accent={
                  cliente.dias_sin_compra !== null &&
                  cliente.dias_sin_compra > 90
                    ? "text-rose-700"
                    : cliente.dias_sin_compra !== null &&
                        cliente.dias_sin_compra > 30
                      ? "text-amber-700"
                      : "text-emerald-700"
                }
              />
              <RecurMini
                label="Saldo"
                value={mxn.format(cliente.saldo_total)}
                accent={
                  cliente.saldo_total > 0 ? "text-rose-700" : "text-gray-700"
                }
              />
            </div>
            {/* Mini barras 12 meses */}
            {cliente.ventas_count > 0 && (
              <div className="mt-3 rounded-xl border border-gray-100 bg-white/80 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
                    Compras últimos 12 meses
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {ventasCliente.length} ventas totales
                  </span>
                </div>
                <div className="flex h-16 items-end gap-1">
                  {monthly.map((m) => {
                    const h =
                      m.total > 0 ? Math.max(8, (m.total / maxMonth) * 56) : 2
                    return (
                      <div
                        key={m.key}
                        className="flex flex-1 flex-col items-center gap-1"
                        title={`${m.label}: ${mxn.format(m.total)} (${m.count})`}
                      >
                        <div
                          className={`w-full rounded-t ${m.total > 0 ? "bg-gradient-to-t from-pink-400 to-pink-600" : "bg-gray-100"}`}
                          style={{ height: `${h}px` }}
                        />
                        <span className="text-[8.5px] uppercase text-gray-400">
                          {m.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </Section>

          {/* Productos top */}
          {productosTop.length > 0 && (
            <Section
              icon={Package}
              title={`Productos favoritos (${productosTop.length})`}
            >
              <ul className="space-y-1.5">
                {productosTop.map((p, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-gray-100 bg-white p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-gray-900">
                        {p.nombre}
                      </div>
                      {p.sku && (
                        <div className="font-mono text-[10px] text-gray-500">
                          {p.sku}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold tabular-nums text-pink-700">
                        {p.cantidad} und
                      </div>
                      <div className="text-[10px] tabular-nums text-gray-500">
                        {mxn.format(p.revenue)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Historial ventas */}
          <Section
            icon={ShoppingBag}
            title={`Ventas (${ventasCliente.length})`}
          >
            {ventasCliente.length === 0 ? (
              <p className="text-xs italic text-gray-400">
                Sin ventas registradas.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {ventasCliente.slice(0, 12).map((v) => {
                  const status = STATUS_COLORS[v.estatus] ?? STATUS_COLORS.pendiente
                  return (
                    <li
                      key={v.id}
                      className="flex items-center justify-between rounded-lg border border-gray-100 bg-white p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/ventas/${v.id}`}
                          className="block truncate font-mono text-xs text-pink-700 hover:underline"
                        >
                          {v.numero}
                        </Link>
                        <div className="text-[10px] text-gray-500">
                          {fechaShort.format(new Date(v.fecha))}
                          {v.iva && Number(v.iva) === 0 && (
                            <span className="ml-1.5 inline-flex rounded-sm bg-blue-50 px-1 text-[9px] text-blue-700">
                              sin IVA
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold tabular-nums text-gray-900">
                          {mxn.format(Number(v.total ?? 0))}
                        </div>
                        <span
                          className={`mt-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-medium ring-1 ${status}`}
                        >
                          {STATUS_LABELS[v.estatus] ?? v.estatus}
                        </span>
                      </div>
                    </li>
                  )
                })}
                {ventasCliente.length > 12 && (
                  <li className="text-center text-[10px] italic text-gray-400">
                    + {ventasCliente.length - 12} ventas más en historial completo
                  </li>
                )}
              </ul>
            )}
          </Section>

          {/* Cotizaciones */}
          <Section
            icon={FileText}
            title={`Cotizaciones (${cotsCliente.length})`}
          >
            {cotsCliente.length === 0 ? (
              <p className="text-xs italic text-gray-400">Sin cotizaciones.</p>
            ) : (
              <ul className="space-y-1.5">
                {cotsCliente.slice(0, 8).map((c) => {
                  const status = STATUS_COLORS[c.estatus] ?? STATUS_COLORS.borrador
                  return (
                    <li
                      key={c.id}
                      className="flex items-center justify-between rounded-lg border border-gray-100 bg-white p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/cotizaciones/${c.id}`}
                          className="block truncate font-mono text-xs text-teal-700 hover:underline"
                        >
                          {c.numero}
                        </Link>
                        <div className="text-[10px] text-gray-500">
                          {fechaShort.format(new Date(c.fecha))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold tabular-nums text-gray-900">
                          {mxn.format(Number(c.total ?? 0))}
                        </div>
                        <span
                          className={`mt-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-medium ring-1 ${status}`}
                        >
                          {STATUS_LABELS[c.estatus] ?? c.estatus}
                        </span>
                      </div>
                    </li>
                  )
                })}
                {cotsCliente.length > 8 && (
                  <li className="text-center text-[10px] italic text-gray-400">
                    + {cotsCliente.length - 8} cotizaciones más
                  </li>
                )}
              </ul>
            )}
          </Section>

          {/* Timeline */}
          <Section icon={Clock} title="Timeline reciente">
            <ol className="relative space-y-3 border-l border-gray-200 pl-4">
              {ventasCliente.slice(0, 5).map((v) => (
                <TimelineItem
                  key={v.id}
                  date={v.fecha}
                  label={`Venta ${v.numero} · ${mxn.format(Number(v.total ?? 0))}`}
                  tone="emerald"
                  href={`/ventas/${v.id}`}
                />
              ))}
              {cliente.created_at && (
                <TimelineItem
                  date={cliente.created_at}
                  label="Cliente creado"
                  tone="violet"
                />
              )}
            </ol>
          </Section>

          {/* Predicción de compras (AI / CDF empírica) */}
          {prediccion && prediccion.metodo !== "insufficient" && (
            <Section icon={Brain} title="Predicción de compras">
              <div className="space-y-3">
                {/* Próxima compra estimada */}
                <div className="rounded-xl border border-violet-200/60 bg-gradient-to-br from-violet-50/70 to-pink-50/40 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-700">
                        Próxima compra esperada
                      </div>
                      <div className="mt-0.5 text-base font-bold text-gray-900">
                        {prediccion.fechaProxima
                          ? prediccion.fechaProxima.toLocaleDateString(
                              "es-MX",
                              { day: "2-digit", month: "long", year: "numeric" },
                            )
                          : "—"}
                        {prediccion.diasParaProxima !== null && (
                          <span className="ml-2 text-[11px] font-normal text-gray-500">
                            (
                            {prediccion.diasParaProxima > 0
                              ? `en ${prediccion.diasParaProxima}d`
                              : `hace ${Math.abs(prediccion.diasParaProxima)}d`}
                            )
                          </span>
                        )}
                      </div>
                      {prediccion.ventanaInicio && prediccion.ventanaFin && (
                        <div className="mt-0.5 text-[10px] text-gray-500">
                          Ventana:{" "}
                          {prediccion.ventanaInicio.toLocaleDateString(
                            "es-MX",
                            { day: "2-digit", month: "short" },
                          )}{" "}
                          –{" "}
                          {prediccion.ventanaFin.toLocaleDateString("es-MX", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </div>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        prediccion.confianza === "alta"
                          ? "bg-emerald-100 text-emerald-700"
                          : prediccion.confianza === "media"
                            ? "bg-amber-100 text-amber-700"
                            : prediccion.confianza === "baja"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {prediccion.confianza}
                    </span>
                  </div>
                </div>

                {/* 4 stats predictivos */}
                <div className="grid grid-cols-2 gap-2">
                  <PredCard
                    icon={<Target className="size-3.5" />}
                    label="Prob. 30d"
                    value={`${(prediccion.probabilidadProx30 * 100).toFixed(0)}%`}
                    accent="text-pink-700"
                  />
                  <PredCard
                    icon={<Target className="size-3.5" />}
                    label="Prob. 60d"
                    value={`${(prediccion.probabilidadProx60 * 100).toFixed(0)}%`}
                    accent="text-pink-700"
                  />
                  <PredCard
                    icon={<TrendingUp className="size-3.5" />}
                    label="Ticket esperado"
                    value={mxn.format(prediccion.ingresoEstimadoProx)}
                    accent="text-emerald-700"
                  />
                  <PredCard
                    icon={
                      prediccion.riesgoAbandono > 0.5 ? (
                        <AlertTriangle className="size-3.5" />
                      ) : (
                        <Sparkles className="size-3.5" />
                      )
                    }
                    label="Riesgo abandono"
                    value={`${(prediccion.riesgoAbandono * 100).toFixed(0)}%`}
                    accent={
                      prediccion.riesgoAbandono > 0.6
                        ? "text-rose-700"
                        : prediccion.riesgoAbandono > 0.3
                          ? "text-amber-700"
                          : "text-emerald-700"
                    }
                  />
                </div>

                {/* Valor futuro 12m */}
                <div className="rounded-lg bg-gradient-to-r from-emerald-50/70 to-teal-50/50 p-2.5 ring-1 ring-emerald-200/40">
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-emerald-700">
                      Valor futuro estimado · 12 meses
                    </span>
                    <span className="text-base font-bold tabular-nums text-emerald-700">
                      {mxn.format(prediccion.valorFuturo12m)}
                    </span>
                  </div>
                </div>

                {/* Seasonality / patrón mensual */}
                {prediccion.seasonality.some((s) => s > 0) && (
                  <div className="rounded-xl border border-gray-100 bg-white p-3">
                    <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
                      Estacionalidad de compra
                    </div>
                    <div className="flex h-12 items-end gap-0.5">
                      {prediccion.seasonality.map((s, i) => (
                        <div
                          key={i}
                          className="flex flex-1 flex-col items-center gap-0.5"
                          title={`${MES_ABBR[i]}: ${(s * 100).toFixed(0)}%`}
                        >
                          <div
                            className={`w-full rounded-t ${
                              s > 0
                                ? "bg-gradient-to-t from-pink-400 to-pink-600"
                                : "bg-gray-100"
                            }`}
                            style={{
                              height: `${Math.max(2, s * 36)}px`,
                            }}
                          />
                          <span className="text-[8px] uppercase text-gray-400">
                            {MES_ABBR[i].slice(0, 1)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-1 text-[9.5px] text-gray-400">
                      Distribución de compras por mes-del-año (histórico)
                    </p>
                  </div>
                )}

                {/* Probabilidad mes a mes (próximos 6) */}
                {prediccion.probMesesFuturos.some((p) => p > 0.05) && (
                  <div className="rounded-xl border border-violet-200/60 bg-gradient-to-r from-violet-50/30 to-white p-3">
                    <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-violet-700">
                      Prob. de compra · próximos 6 meses
                    </div>
                    <div className="space-y-1">
                      {prediccion.probMesesFuturos.map((p, i) => {
                        const d = new Date()
                        d.setMonth(d.getMonth() + i)
                        const label = `${MES_ABBR[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
                        return (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-[10.5px]"
                          >
                            <span className="w-12 shrink-0 font-medium text-gray-700">
                              {label}
                            </span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                              <div
                                className="h-full bg-gradient-to-r from-violet-400 to-pink-500"
                                style={{ width: `${Math.min(100, p * 100)}%` }}
                              />
                            </div>
                            <span className="w-10 shrink-0 text-right tabular-nums text-gray-700">
                              {(p * 100).toFixed(0)}%
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <p className="text-[9.5px] italic text-gray-400">
                  Modelo: <strong className="font-semibold not-italic text-gray-500">{prediccion.metodo}</strong>{" "}
                  · {cliente.ventas_count} datos históricos
                </p>
              </div>
            </Section>
          )}

          {/* Notas */}
          {cliente.notas && (
            <Section icon={StickyNote} title="Notas">
              <p className="whitespace-pre-wrap rounded-lg border border-amber-200/60 bg-amber-50/60 p-3 text-xs leading-relaxed text-gray-700">
                {cliente.notas}
              </p>
            </Section>
          )}

          <div className="h-6" />
        </div>
      </aside>
    </>
  )
}

function Avatar({ nombre, size = 32 }: { nombre: string; size?: number }) {
  const initials = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("")
  const palette = [
    "from-pink-500 to-rose-500",
    "from-teal-500 to-cyan-500",
    "from-violet-500 to-purple-500",
    "from-amber-500 to-orange-500",
    "from-emerald-500 to-teal-500",
    "from-blue-500 to-indigo-500",
  ]
  let hash = 0
  for (const ch of nombre) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  const grad = palette[Math.abs(hash) % palette.length]
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${grad} font-bold text-white shadow-sm ring-2 ring-white`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials || "?"}
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: string
}) {
  return (
    <div className="rounded-lg bg-white/70 p-2 ring-1 ring-gray-200/60 backdrop-blur">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-bold tabular-nums ${accent}`}>
        {value}
      </div>
    </div>
  )
}

function DLine({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-gray-400" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-gray-500">
          {label}
        </div>
        <div className="text-xs text-gray-800">{value}</div>
      </div>
    </div>
  )
}

function RecurMini({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: string
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-2">
      <div className="text-[9.5px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-bold tabular-nums ${accent}`}>
        {value}
      </div>
    </div>
  )
}

function PredCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent: string
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-2">
      <div className={`flex items-center gap-1 ${accent}`}>
        {icon}
        <span className="text-[9.5px] uppercase tracking-wide text-gray-500">
          {label}
        </span>
      </div>
      <div className={`mt-0.5 text-sm font-bold tabular-nums ${accent}`}>
        {value}
      </div>
    </div>
  )
}

function TimelineItem({
  date,
  label,
  tone,
  href,
}: {
  date: string | null
  label: string
  tone: "emerald" | "teal" | "amber" | "rose" | "violet"
  href?: string
}) {
  const dotColor: Record<typeof tone, string> = {
    emerald: "bg-emerald-500",
    teal: "bg-teal-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    violet: "bg-violet-500",
  }
  const Wrap = href
    ? ({ children }: { children: React.ReactNode }) => (
        <Link href={href} className="block hover:bg-gray-50 rounded">
          {children}
        </Link>
      )
    : ({ children }: { children: React.ReactNode }) => <>{children}</>
  return (
    <li className="relative">
      <span
        className={`absolute -left-[21px] top-1 size-2 rounded-full ring-2 ring-white ${dotColor[tone]}`}
      />
      <Wrap>
        <div className="flex items-center gap-1 text-xs font-medium text-gray-800">
          {label}
          {href && <ExternalLink className="size-2.5 text-gray-400" />}
        </div>
        {date && (
          <div className="text-[10px] text-gray-500">
            {fechaShort.format(new Date(date))}
          </div>
        )}
      </Wrap>
    </li>
  )
}
