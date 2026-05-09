"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ShoppingBag,
  TrendingUp,
  Wallet,
  Percent,
  Users,
  Repeat,
  FileText,
} from "lucide-react"

const SANDRA_ID = "4f21084b-dfe9-45f3-be80-935dc1a5e7a5"
const BENJAMIN_ID = "3165fe33-c760-4373-84d0-e1cd14d863b3"

export type Estatus = "pendiente" | "pagada_parcial" | "pagada_total" | "cancelada"

export type VentaRow = {
  id: string
  numero: string
  cotizacion_id: string | null
  cliente_id: string | null
  fecha: string
  total: number | null
  costo_productos: number | null
  costo_envio: number | null
  ganancia: number | null
  cantidad_pagada: number | null
  saldo_pendiente: number | null
  estatus: Estatus
  notas: string | null
  clientes: {
    id: string
    nombre: string
    nombre_negocio: string | null
  } | null
}

export type SocioRow = {
  venta_id: string
  socio_id: string
  monto: number
  pagado: boolean
}

export type Periodicidad = {
  cliente_id: string
  dias_promedio: number | null
}

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
})

const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

const estatusBadge: Record<Estatus, string> = {
  pagada_total: "bg-emerald-100 text-emerald-700",
  pagada_parcial: "bg-amber-100 text-amber-700",
  pendiente: "bg-red-100 text-red-700",
  cancelada: "bg-gray-100 text-gray-600",
}

const estatusLabel: Record<Estatus, string> = {
  pagada_total: "Pagada",
  pagada_parcial: "Parcial",
  pendiente: "Pendiente",
  cancelada: "Cancelada",
}

type EstatusFilter = "todos" | Estatus
type ClienteFilter = "todos" | string

function formatDias(d: number | null): string {
  if (d == null) return "Una sola compra"
  return `Cada ${d} días`
}

function formatMeses(d: number | null): string {
  if (d == null) return "Una sola compra"
  return `Cada ${(d / 30.4).toFixed(1)} meses`
}

export function VentasDashboard({
  ventas,
  socios,
  periodicidad,
  error,
}: {
  ventas: VentaRow[]
  socios: SocioRow[]
  periodicidad: Periodicidad[]
  error: string | null
}) {
  const [estatusFilter, setEstatusFilter] = useState<EstatusFilter>("todos")
  const [clienteFilter, setClienteFilter] = useState<ClienteFilter>("todos")

  const stats = useMemo(() => {
    const total = ventas.reduce((s, v) => s + Number(v.total ?? 0), 0)
    const ganancia = ventas.reduce((s, v) => s + Number(v.ganancia ?? 0), 0)
    const porCobrar = ventas.reduce((s, v) => s + Number(v.saldo_pendiente ?? 0), 0)
    const margen = total > 0 ? (ganancia / total) * 100 : 0
    return { total, ganancia, porCobrar, margen }
  }, [ventas])

  const inversionistas = useMemo(() => {
    const tally = (id: string) => {
      const rows = socios.filter((s) => s.socio_id === id)
      const asignado = rows.reduce((s, x) => s + Number(x.monto ?? 0), 0)
      const cobrado = rows
        .filter((x) => x.pagado)
        .reduce((s, x) => s + Number(x.monto ?? 0), 0)
      return { asignado, cobrado, pendiente: asignado - cobrado }
    }
    return { sandra: tally(SANDRA_ID), benjamin: tally(BENJAMIN_ID) }
  }, [socios])

  const clientesRanking = useMemo(() => {
    type Group = {
      id: string | null
      nombre: string
      total: number
      ordenes: number
      ultimaCompra: string
      fechas: string[]
    }
    const map = new Map<string, Group>()
    for (const v of ventas) {
      if (v.estatus === "cancelada") continue
      const key = v.cliente_id ?? "__sin__"
      const nombre =
        v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? "Sin cliente"
      let g = map.get(key)
      if (!g) {
        g = {
          id: v.cliente_id,
          nombre,
          total: 0,
          ordenes: 0,
          ultimaCompra: v.fecha,
          fechas: [],
        }
        map.set(key, g)
      }
      g.total += Number(v.total ?? 0)
      g.ordenes += 1
      g.fechas.push(v.fecha)
      if (v.fecha > g.ultimaCompra) g.ultimaCompra = v.fecha
    }
    return Array.from(map.values())
      .map((g) => ({
        ...g,
        ticketPromedio: g.ordenes > 0 ? g.total / g.ordenes : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [ventas])

  const recurrencia = useMemo(() => {
    const repeat = clientesRanking.filter((c) => c.ordenes > 1)
    const totalClients = clientesRanking.length
    const repeatRate =
      totalClients > 0 ? (repeat.length / totalClients) * 100 : 0

    const gaps: number[] = []
    for (const c of repeat) {
      const sorted = [...c.fechas].sort()
      for (let i = 1; i < sorted.length; i++) {
        const a = new Date(sorted[i - 1]).getTime()
        const b = new Date(sorted[i]).getTime()
        gaps.push((b - a) / (1000 * 60 * 60 * 24))
      }
    }
    const avgDays =
      gaps.length > 0 ? gaps.reduce((s, x) => s + x, 0) / gaps.length : 0

    return {
      repeatCount: repeat.length,
      totalClients,
      repeatRate,
      avgDays: Math.round(avgDays),
    }
  }, [clientesRanking])

  const periodicidadByCliente = useMemo(
    () => new Map(periodicidad.map((p) => [p.cliente_id, p.dias_promedio])),
    [periodicidad],
  )

  const clienteOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const v of ventas) {
      if (v.cliente_id && !map.has(v.cliente_id)) {
        map.set(
          v.cliente_id,
          v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? v.cliente_id,
        )
      }
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], "es"),
    )
  }, [ventas])

  const filtered = useMemo(() => {
    let list = ventas
    if (estatusFilter !== "todos") {
      list = list.filter((v) => v.estatus === estatusFilter)
    }
    if (clienteFilter !== "todos") {
      list = list.filter((v) => v.cliente_id === clienteFilter)
    }
    return list
  }, [ventas, estatusFilter, clienteFilter])

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingBag className="size-7 text-amber-700" />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Ventas</h1>
            <p className="text-gray-500 text-sm mt-1">
              {ventas.length} ventas · {clienteOptions.length} clientes
            </p>
          </div>
        </div>
        <Link
          href="/ventas/nueva"
          className="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-pink-700"
        >
          Nueva Venta
        </Link>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          icon={ShoppingBag}
          label="Total vendido"
          value={mxn.format(stats.total)}
          tone="text-gray-900"
        />
        <Card
          icon={TrendingUp}
          label="Ganancia total"
          value={mxn.format(stats.ganancia)}
          tone="text-emerald-700"
        />
        <Card
          icon={Wallet}
          label="Por cobrar"
          value={mxn.format(stats.porCobrar)}
          tone={stats.porCobrar > 0 ? "text-red-700" : "text-gray-900"}
        />
        <Card
          icon={Percent}
          label="Margen promedio"
          value={`${stats.margen.toFixed(1)}%`}
          tone="text-blue-700"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <InversionistaCard nombre="Sandra" stats={inversionistas.sandra} />
        <InversionistaCard nombre="Benjamin" stats={inversionistas.benjamin} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-gray-200 bg-white">
          <header className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
            <Users className="size-4 text-gray-500" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
              Top clientes
            </h2>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <Th>Cliente</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Órdenes</Th>
                  <Th align="right">Ticket prom.</Th>
                  <Th align="right">Última compra</Th>
                  <Th align="right">Periodicidad (Días)</Th>
                  <Th align="right">Periodicidad (Mensual)</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clientesRanking.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-8 text-center text-sm text-gray-500"
                    >
                      Sin datos.
                    </td>
                  </tr>
                ) : (
                  clientesRanking.slice(0, 10).map((c) => {
                    const dias = c.id
                      ? (periodicidadByCliente.get(c.id) ?? null)
                      : null
                    return (
                      <tr key={c.id ?? "__sin__"} className="hover:bg-gray-50">
                        <td className="px-5 py-3 text-gray-900">
                          {c.id ? (
                            <Link
                              href={`/clientes/${c.id}`}
                              className="hover:text-pink-700 hover:underline"
                            >
                              {c.nombre}
                            </Link>
                          ) : (
                            c.nombre
                          )}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">
                          {mxn.format(c.total)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-500">
                          {c.ordenes}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-700">
                          {mxn.format(c.ticketPromedio)}
                        </td>
                        <td className="px-5 py-3 text-right text-xs text-gray-500">
                          {fechaFmt.format(new Date(c.ultimaCompra))}
                        </td>
                        <td
                          className={`px-5 py-3 text-right tabular-nums ${
                            dias == null ? "text-gray-400" : "text-gray-700"
                          }`}
                        >
                          {formatDias(dias)}
                        </td>
                        <td
                          className={`px-5 py-3 text-right tabular-nums ${
                            dias == null ? "text-gray-400" : "text-gray-700"
                          }`}
                        >
                          {formatMeses(dias)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Repeat className="size-4 text-gray-500" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
              Recurrencia
            </h2>
          </div>
          <dl className="mt-3 space-y-3 text-sm">
            <DefRow
              label="Clientes recurrentes"
              value={`${recurrencia.repeatCount} de ${recurrencia.totalClients}`}
            />
            <DefRow
              label="Tasa de recurrencia"
              value={`${recurrencia.repeatRate.toFixed(1)}%`}
            />
            <DefRow
              label="Días entre compras"
              value={
                recurrencia.repeatCount > 0
                  ? `${recurrencia.avgDays} días`
                  : "—"
              }
            />
          </dl>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
              Tabla de ventas
            </h2>
            <span className="text-xs text-gray-500">
              {filtered.length}{" "}
              {filtered.length === 1 ? "registro" : "registros"}
              {(estatusFilter !== "todos" || clienteFilter !== "todos") &&
                ` (de ${ventas.length})`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={estatusFilter}
              onChange={(e) =>
                setEstatusFilter(e.target.value as EstatusFilter)
              }
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            >
              <option value="todos">Todos los estatus</option>
              <option value="pagada_total">Pagadas</option>
              <option value="pagada_parcial">Parciales</option>
              <option value="pendiente">Pendientes</option>
            </select>
            <select
              value={clienteFilter}
              onChange={(e) =>
                setClienteFilter(e.target.value as ClienteFilter)
              }
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            >
              <option value="todos">Todos los clientes</option>
              {clienteOptions.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <Th>Orden</Th>
                <Th>Fecha</Th>
                <Th>Cliente</Th>
                <Th align="right">Total</Th>
                <Th align="right">Ganancia</Th>
                <Th>Estatus</Th>
                <Th align="right">Saldo</Th>
                <Th align="right">Cot.</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-12 text-center text-sm text-gray-500"
                  >
                    Sin resultados con esos filtros.
                  </td>
                </tr>
              ) : (
                filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs">
                      <Link
                        href={`/ventas/${v.id}`}
                        className="text-pink-700 hover:underline"
                      >
                        {v.numero}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {fechaFmt.format(new Date(v.fecha))}
                    </td>
                    <td className="px-5 py-3 text-gray-900">
                      {v.clientes?.id ? (
                        <Link
                          href={`/clientes/${v.clientes.id}`}
                          className="hover:text-pink-700 hover:underline"
                        >
                          {v.clientes.nombre_negocio ?? v.clientes.nombre}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">
                      {mxn.format(Number(v.total ?? 0))}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-emerald-700">
                      {mxn.format(Number(v.ganancia ?? 0))}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${estatusBadge[v.estatus]}`}
                      >
                        {estatusLabel[v.estatus]}
                      </span>
                    </td>
                    <td
                      className={`px-5 py-3 text-right tabular-nums ${
                        Number(v.saldo_pendiente ?? 0) > 0
                          ? "text-red-700 font-medium"
                          : "text-gray-500"
                      }`}
                    >
                      {mxn.format(Number(v.saldo_pendiente ?? 0))}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {v.cotizacion_id ? (
                        <Link
                          href={`/cotizaciones/${v.cotizacion_id}`}
                          className="inline-flex items-center gap-1 text-xs text-pink-600 hover:underline"
                        >
                          <FileText className="size-3" />
                          Ver
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
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

function Card({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
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
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>
        {value}
      </div>
    </div>
  )
}

function InversionistaCard({
  nombre,
  stats,
}: {
  nombre: string
  stats: { asignado: number; cobrado: number; pendiente: number }
}) {
  const pct = stats.asignado > 0 ? (stats.cobrado / stats.asignado) * 100 : 0
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{nombre}</h3>
        <span className="text-xs text-gray-500">{pct.toFixed(0)}% cobrado</span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <SubStat
          label="Asignado"
          value={mxn.format(stats.asignado)}
          containerClass="border-gray-100 bg-gray-50"
          labelClass="text-gray-500"
          valueClass="text-gray-900"
        />
        <SubStat
          label="Cobrado"
          value={mxn.format(stats.cobrado)}
          containerClass="border-emerald-100 bg-emerald-50"
          labelClass="text-emerald-700"
          valueClass="text-emerald-800"
        />
        <SubStat
          label="Pendiente"
          value={mxn.format(stats.pendiente)}
          containerClass="border-amber-100 bg-amber-50"
          labelClass="text-amber-700"
          valueClass="text-amber-800"
        />
      </div>
    </div>
  )
}

function SubStat({
  label,
  value,
  containerClass,
  labelClass,
  valueClass,
}: {
  label: string
  value: string
  containerClass: string
  labelClass: string
  valueClass: string
}) {
  return (
    <div className={`rounded-lg border p-3 ${containerClass}`}>
      <div className={`text-xs uppercase tracking-wide ${labelClass}`}>
        {label}
      </div>
      <div
        className={`mt-1 text-base font-semibold tabular-nums ${valueClass}`}
      >
        {value}
      </div>
    </div>
  )
}

function DefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-600">{label}</dt>
      <dd className="font-semibold tabular-nums text-gray-900">{value}</dd>
    </div>
  )
}
