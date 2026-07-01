"use client"

import { useEffect, useMemo } from "react"
import Link from "next/link"
import {
  Calendar,
  CircleDollarSign,
  Clock,
  ExternalLink,
  FileText,
  Package,
  Pencil,
  Receipt,
  ShieldCheck,
  StickyNote,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react"
import type {
  VentaItemRow,
  VentaRow,
  VentaSocioRow,
  VistaStockRow,
} from "./ventas-dashboard"
import type { EnrichedVenta } from "./ventas-table-premium"
import { formatMXN2 } from "@/lib/utils"

const SANDRA_ID = "4f21084b-dfe9-45f3-be80-935dc1a5e7a5"
const BENJAMIN_ID = "3165fe33-c760-4373-84d0-e1cd14d863b3"
const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
})
const datetimeFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

const STATUS_COLORS: Record<
  VentaRow["estatus"],
  { bg: string; text: string; ring: string; label: string }
> = {
  pagada_total: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-700",
    ring: "ring-emerald-500/30",
    label: "Pagada",
  },
  pagada_parcial: {
    bg: "bg-amber-500/10",
    text: "text-amber-700",
    ring: "ring-amber-500/30",
    label: "Parcial",
  },
  pendiente: {
    bg: "bg-rose-500/10",
    text: "text-rose-700",
    ring: "ring-rose-500/30",
    label: "Pendiente",
  },
  cancelada: {
    bg: "bg-gray-500/10",
    text: "text-gray-600",
    ring: "ring-gray-400/30",
    label: "Cancelada",
  },
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

export function VentaDrawer({
  venta,
  open,
  onClose,
  venta_items,
  venta_socios,
  stockBySku,
}: {
  venta: EnrichedVenta | null
  open: boolean
  onClose: () => void
  venta_items: VentaItemRow[]
  venta_socios: VentaSocioRow[]
  stockBySku: Map<string, VistaStockRow>
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

  const items = useMemo(() => {
    if (!venta) return []
    return venta_items.filter((it) => it.venta_id === venta.id)
  }, [venta, venta_items])

  const sociosRows = useMemo(() => {
    if (!venta) return []
    return venta_socios.filter((vs) => vs.venta_id === venta.id)
  }, [venta, venta_socios])

  if (!venta) return null

  const cliente =
    venta.clientes?.nombre_negocio ?? venta.clientes?.nombre ?? "Sin cliente"
  const total = Number(venta.total ?? 0)
  const subtotal = Number(venta.subtotal ?? 0)
  const iva = Number(venta.iva ?? 0)
  const descuento = Number(venta.descuento ?? 0)
  const costoProductos = Number(venta.costo_productos ?? 0)
  const costoEnvio = Number(venta.costo_envio ?? 0)
  // Ganancia BRUTA = subtotal − costo_productos (fórmula Sheet, computada en JS)
  const ganancia = subtotal - costoProductos
  const margen = total > 0 ? (ganancia / total) * 100 : 0
  // Utilidad neta = subtotal − descuento − costo_productos − costo_envio
  // Preferir el valor GENERATED de BD si viene; fallback al cálculo.
  const utilidadNeta =
    venta.utilidad_neta != null
      ? Number(venta.utilidad_neta)
      : subtotal - descuento - costoProductos - costoEnvio
  const margenNeto = total > 0 ? (utilidadNeta / total) * 100 : 0
  const cantPagada = Number(venta.cantidad_pagada ?? 0)
  const saldo = Number(venta.saldo_pendiente ?? 0)
  const progresoPago = total > 0 ? Math.min(100, (cantPagada / total) * 100) : 0
  const sandraVS = sociosRows.find((s) => s.socio_id === SANDRA_ID)
  const benjaminVS = sociosRows.find((s) => s.socio_id === BENJAMIN_ID)
  const statusConf = STATUS_COLORS[venta.estatus]

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      {/* Panel */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de venta ${venta.numero}`}
      >
        {/* Hero / Header */}
        <header className="relative border-b border-gray-100 bg-gradient-to-br from-pink-50 via-white to-teal-50/40 px-6 pb-5 pt-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 transition hover:bg-white hover:text-gray-700"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-medium tracking-wide text-gray-500">
                {venta.numero}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ${statusConf.bg} ${statusConf.text} ${statusConf.ring}`}
              >
                {statusConf.label}
              </span>
              {venta.sin_iva && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-medium text-blue-700 ring-1 ring-blue-200/60">
                  📝 sin IVA
                </span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{cliente}</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                <Calendar className="size-3" />
                {fechaFmt.format(new Date(venta.fecha))}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat label="Total" value={formatMXN2(total)} accent="text-gray-900" />
              <Stat
                label="Utilidad"
                value={formatMXN2(ganancia)}
                accent="text-emerald-700"
                sub={`${margen.toFixed(1)}% margen`}
              />
              <Stat
                label="Cobrado"
                value={formatMXN2(cantPagada)}
                accent="text-[#0F766E]"
                sub={`${progresoPago.toFixed(0)}%`}
              />
            </div>
          </div>
          {/* Quick actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              href={`/ventas/${venta.id}/editar`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-50"
            >
              <Pencil className="size-3" />
              Editar
            </Link>
            <Link
              href={`/ventas/${venta.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-50"
            >
              <ExternalLink className="size-3" />
              Detalle completo
            </Link>
            {venta.cotizacion_id && (
              <Link
                href={`/cotizaciones/${venta.cotizacion_id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-pink-200 bg-[#F9FAFB] px-2.5 py-1.5 text-xs font-medium text-[#0F766E] transition hover:bg-[#DFF7F4]"
              >
                <FileText className="size-3" />
                Cotización origen
              </Link>
            )}
          </div>
        </header>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto">
          {/* Reparto socios */}
          <Section icon={Users} title="Reparto socios">
            {sociosRows.length === 0 ? (
              <p className="text-xs text-gray-400">Sin reparto definido.</p>
            ) : (
              <div className="space-y-3">
                {sandraVS && (
                  <SocioBar
                    nombre="Sandra"
                    monto={Number(sandraVS.monto ?? 0)}
                    pagado={!!sandraVS.pagado}
                    total={total}
                    color="from-pink-500 to-pink-600"
                    bg="bg-[#F9FAFB]"
                    text="text-[#0F766E]"
                  />
                )}
                {benjaminVS && (
                  <SocioBar
                    nombre="Benjamin"
                    monto={Number(benjaminVS.monto ?? 0)}
                    pagado={!!benjaminVS.pagado}
                    total={total}
                    color="from-teal-500 to-teal-600"
                    bg="bg-teal-50"
                    text="text-teal-700"
                  />
                )}
              </div>
            )}
          </Section>

          {/* Pagos */}
          <Section icon={Wallet} title="Pagos">
            <div className="rounded-xl bg-gray-50/80 p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-gray-600">
                  {formatMXN2(cantPagada)}{" "}
                  <span className="text-gray-400">
                    de {formatMXN2(total)}
                  </span>
                </span>
                <span className="font-semibold tabular-nums text-gray-700">
                  {progresoPago.toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
                  style={{ width: `${progresoPago}%` }}
                />
              </div>
              {saldo > 0 && (
                <div className="mt-2 text-[11px] text-rose-600">
                  Saldo pendiente: {formatMXN2(saldo)}
                </div>
              )}
              {venta.metodo && (
                <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[10.5px] font-medium text-gray-700">
                  Método: <strong>{venta.metodo}</strong>
                </div>
              )}
            </div>
          </Section>

          {/* Productos */}
          <Section
            icon={Package}
            title={`Productos (${items.length})`}
            right={
              <span className="text-[11px] tabular-nums text-gray-500">
                {formatMXN2(subtotal)}
              </span>
            }
          >
            {items.length === 0 ? (
              <p className="text-xs text-gray-400">Sin productos en esta venta.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((it, i) => {
                  const sku = it.productos?.sku ?? null
                  const stock = sku ? stockBySku.get(sku) : null
                  const stockColor =
                    stock?.estatus === "agotado"
                      ? "text-rose-600 bg-rose-50"
                      : stock?.estatus === "bajo"
                        ? "text-amber-600 bg-amber-50"
                        : "text-emerald-600 bg-emerald-50"
                  return (
                    <li
                      key={i}
                      className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-2.5 transition hover:border-gray-200"
                    >
                      <div className="size-10 shrink-0 overflow-hidden rounded-md bg-gray-100">
                        {it.productos?.imagen_url && (
                          <img
                            src={it.productos.imagen_url}
                            alt=""
                            className="size-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-gray-900">
                          {it.productos?.nombre ?? "—"}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
                          {sku && (
                            <span className="font-mono">{sku}</span>
                          )}
                          {it.productos?.peso && <span>· {it.productos.peso}</span>}
                          {stock && (
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${stockColor}`}
                            >
                              Stock: {stock.stock_actual ?? 0}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-semibold tabular-nums text-gray-900">
                          {formatMXN2(Number(it.subtotal ?? 0))}
                        </div>
                        <div className="text-[10px] text-gray-500 tabular-nums">
                          {Number(it.cantidad ?? 0)} × {formatMXN2(Number(it.precio_unitario ?? 0))}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          {/* Resumen financiero */}
          <Section icon={CircleDollarSign} title="Resumen financiero">
            {/* Bloque 1: Cobro */}
            <div className="rounded-lg border border-gray-100 bg-white p-3 mb-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Cobro
              </div>
              <dl className="grid grid-cols-2 gap-1.5 text-xs">
                <DetailLine label="Subtotal" value={formatMXN2(subtotal)} />
                <DetailLine
                  label="Descuento"
                  value={descuento > 0 ? `− ${formatMXN2(descuento)}` : "$0.00"}
                  accent={descuento > 0 ? "text-rose-600" : ""}
                />
                <DetailLine
                  label="IVA"
                  value={iva > 0 ? formatMXN2(iva) : "Sin IVA"}
                  accent={iva > 0 ? "text-teal-700" : "text-blue-600"}
                />
                <DetailLine label="Total" value={formatMXN2(total)} bold />
              </dl>
            </div>

            {/* Bloque 2: Costos */}
            <div className="rounded-lg border border-gray-100 bg-white p-3 mb-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Costos
              </div>
              <dl className="grid grid-cols-2 gap-1.5 text-xs">
                <DetailLine
                  label="Productos"
                  value={formatMXN2(costoProductos)}
                />
                <DetailLine
                  label="Envío"
                  value={costoEnvio > 0 ? formatMXN2(costoEnvio) : "—"}
                  accent={costoEnvio > 0 ? "text-amber-700" : ""}
                />
                <DetailLine
                  label="Total costos"
                  value={formatMXN2(costoProductos + costoEnvio)}
                  bold
                />
              </dl>
            </div>

            {/* Bloque 3: Utilidad */}
            <div className="rounded-lg border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-white p-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                Utilidad
              </div>
              <dl className="grid grid-cols-2 gap-1.5 text-xs">
                <DetailLine
                  label="Bruta (Sheet)"
                  value={formatMXN2(ganancia)}
                  accent="text-emerald-600"
                />
                <DetailLine
                  label={`Margen bruto`}
                  value={`${margen.toFixed(1)}%`}
                  accent={
                    margen >= 60
                      ? "text-emerald-700"
                      : margen >= 35
                        ? "text-amber-700"
                        : "text-rose-700"
                  }
                />
                <DetailLine
                  label="NETA real"
                  value={formatMXN2(utilidadNeta)}
                  accent={
                    utilidadNeta >= 0 ? "text-emerald-700" : "text-rose-700"
                  }
                  bold
                />
                <DetailLine
                  label="Margen neto"
                  value={`${margenNeto.toFixed(1)}%`}
                  accent={
                    margenNeto >= 50
                      ? "text-emerald-700"
                      : margenNeto >= 20
                        ? "text-amber-700"
                        : "text-rose-700"
                  }
                  bold
                />
              </dl>
              <p className="mt-2 text-[10px] text-gray-500 leading-relaxed">
                Neta = Subtotal − Descuento − Costo prods − Costo envío
              </p>
            </div>
          </Section>

          {/* Notas */}
          {(venta.notas_libre || venta.metodo) && (
            <Section icon={StickyNote} title="Notas">
              {venta.metodo && (
                <div className="mb-2 inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-[11px]">
                  <Wallet className="size-3 text-gray-500" />
                  <strong className="text-gray-700">{venta.metodo}</strong>
                </div>
              )}
              {venta.notas_libre ? (
                <p className="whitespace-pre-wrap rounded-lg border border-amber-200/60 bg-amber-50/60 p-3 text-xs leading-relaxed text-gray-700">
                  {venta.notas_libre}
                </p>
              ) : null}
            </Section>
          )}

          {/* Cotización origen */}
          {venta.cotizacion_id && (
            <Section icon={FileText} title="Cotización origen">
              <Link
                href={`/cotizaciones/${venta.cotizacion_id}`}
                className="group flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 transition hover:border-pink-300 hover:shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-md bg-[#F9FAFB] text-[#0F766E]">
                    <FileText className="size-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-900">
                      Ver cotización
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Documento PDF disponible
                    </div>
                  </div>
                </div>
                <ExternalLink className="size-3.5 text-gray-400 transition group-hover:text-[#0F766E]" />
              </Link>
            </Section>
          )}

          {/* Timeline (limited info — solo creación + estatus) */}
          <Section icon={Clock} title="Timeline">
            <ol className="relative space-y-3 border-l border-gray-200 pl-4">
              <TimelineItem
                date={venta.fecha}
                label="Venta registrada"
                tone="emerald"
              />
              {cantPagada > 0 && (
                <TimelineItem
                  date={venta.fecha}
                  label={`Pago recibido: ${formatMXN2(cantPagada)}`}
                  tone="teal"
                />
              )}
              {saldo > 0 && (
                <TimelineItem
                  date={null}
                  label={`Saldo pendiente: ${formatMXN2(saldo)}`}
                  tone="amber"
                />
              )}
            </ol>
          </Section>

          {/* Insights / Performance */}
          <Section icon={TrendingUp} title="Performance">
            <div className="grid grid-cols-2 gap-2">
              <InsightCard
                label="Ticket"
                value={formatMXN2(total)}
                hint="Valor de la orden"
              />
              <InsightCard
                label="Productos"
                value={`${items.length}`}
                hint={`${items.reduce((s, x) => s + Number(x.cantidad ?? 0), 0)} unidades`}
              />
              <InsightCard
                label="Utilidad"
                value={formatMXN2(ganancia)}
                hint={`${margen.toFixed(1)}% sobre total`}
                tone="emerald"
              />
              <InsightCard
                label="Por cobrar"
                value={formatMXN2(saldo)}
                hint={
                  saldo > 0
                    ? `${(100 - progresoPago).toFixed(0)}% pendiente`
                    : "Cobrado al 100%"
                }
                tone={saldo > 0 ? "rose" : "emerald"}
              />
            </div>
          </Section>

          {/* Footer space */}
          <div className="h-6" />
        </div>
      </aside>
    </>
  )
}

function Stat({
  label,
  value,
  accent,
  sub,
}: {
  label: string
  value: string
  accent: string
  sub?: string
}) {
  return (
    <div className="rounded-lg bg-white/70 p-2 ring-1 ring-gray-200/60 backdrop-blur">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${accent}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-gray-500">{sub}</div>}
    </div>
  )
}

function SocioBar({
  nombre,
  monto,
  pagado,
  total,
  color,
  bg,
  text,
}: {
  nombre: string
  monto: number
  pagado: boolean
  total: number
  color: string
  bg: string
  text: string
}) {
  const pct = total > 0 ? (monto / total) * 100 : 0
  return (
    <div className={`rounded-lg ${bg} p-3`}>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-bold ${text}`}>{nombre}</span>
          {pagado && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-white px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <ShieldCheck className="size-2.5" />
              Cobrado
            </span>
          )}
        </div>
        <span className={`text-sm font-bold tabular-nums ${text}`}>
          {formatMXN2(monto)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-gray-500">
        <span>{pct.toFixed(1)}% del total</span>
      </div>
    </div>
  )
}

function DetailLine({
  label,
  value,
  accent,
  bold,
}: {
  label: string
  value: string
  accent?: string
  bold?: boolean
}) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd
        className={`text-right tabular-nums ${accent ?? "text-gray-900"} ${bold ? "font-semibold" : ""}`}
      >
        {value}
      </dd>
    </>
  )
}

function TimelineItem({
  date,
  label,
  tone,
}: {
  date: string | null
  label: string
  tone: "emerald" | "teal" | "amber" | "rose"
}) {
  const dotColor: Record<typeof tone, string> = {
    emerald: "bg-emerald-500",
    teal: "bg-teal-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  }
  return (
    <li className="relative">
      <span
        className={`absolute -left-[21px] top-1 size-2 rounded-full ring-2 ring-white ${dotColor[tone]}`}
      />
      <div className="text-xs font-medium text-gray-800">{label}</div>
      {date && (
        <div className="text-[10px] text-gray-500">
          {datetimeFmt.format(new Date(date))}
        </div>
      )}
    </li>
  )
}

function InsightCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: "emerald" | "rose"
}) {
  const accent =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "rose"
        ? "text-rose-700"
        : "text-gray-900"
  return (
    <div className="rounded-lg border border-gray-100 bg-gradient-to-br from-white to-gray-50/50 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className={`mt-1 text-base font-bold tabular-nums ${accent}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-gray-500">{hint}</div>}
    </div>
  )
}

// Re-export Receipt to avoid unused warning if needed
export { Receipt }
