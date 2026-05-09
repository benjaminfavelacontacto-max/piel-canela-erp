"use client"

import { Fragment, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ExpandedState,
  type HeaderContext,
  type RowData,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"

// Module augmentation: agregamos `align` al meta de cada columna
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: "left" | "right" | "center"
  }
}
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Mail,
  MapPin,
  Phone,
  Search,
  Sparkles,
  UserPlus,
} from "lucide-react"
import { ClienteDrawer } from "./cliente-drawer"
import { RecurrenciaAnalytics } from "./recurrencia-analytics"
import { EstimadoIngresos } from "./estimado-ingresos"
import { PrediccionCompras } from "./prediccion-compras"
import { TIPOS_CLIENTE, getTipoConf } from "./tipos-cliente"
import { actualizarTipoCliente } from "./actions"

// ─── Types compartidos ──────────────────────────────────────────────

export type ClienteRow = {
  id: string
  nombre: string
  nombre_negocio: string | null
  tipo: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  colonia: string | null
  codigo_postal: string | null
  ciudad: string | null
  estado: string | null
  pais: string | null
  rfc: string | null
  redes_sociales: Record<string, string> | null
  vendedor_socio_id: string | null
  metodo_pago_pref: string | null
  notas: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

export type VentaSummaryRow = {
  id: string
  numero: string
  cliente_id: string | null
  fecha: string
  total: number | null
  iva: number | null
  descuento: number | null
  costo_productos: number | null
  costo_envio: number | null
  utilidad_neta: number | null
  cantidad_pagada: number | null
  saldo_pendiente: number | null
  estatus: string
}

export type CotizacionSummaryRow = {
  id: string
  numero: string
  cliente_id: string | null
  fecha: string
  total: number | null
  estatus: string
}

export type VentaItemSummary = {
  venta_id: string
  cantidad: number
  precio_unitario: number
  productos: { id: string; nombre: string; sku: string | null } | null
}

export type SocioBasic = { id: string; nombre: string }

export type EnrichedCliente = ClienteRow & {
  ventas_count: number
  cotizaciones_count: number
  ltv: number
  utilidad_total: number
  saldo_total: number
  ultimo_pedido: string | null
  primer_pedido: string | null
  ticket_promedio: number
  frecuencia_dias: number | null
  dias_sin_compra: number | null
  status: ClienteStatus
  vendedor_nombre: string | null
}

type ClienteStatus =
  | "prospecto"
  | "recurrente"
  | "activo"
  | "nuevo"
  | "inactivo"
  | "sin_actividad"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})
const mxn2 = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

// Paleta enterprise reducida: 3 tonos semánticos (success / warning / neutral)
// El label diferencia los estados, no el color.
const STATUS_CONF: Record<
  ClienteStatus,
  { label: string; bg: string; text: string; ring: string; dot: string }
> = {
  // ─── Activos / saludables → emerald soft ───
  recurrente: {
    label: "Recurrente",
    bg: "bg-[#D1FAE5]",
    text: "text-[#059669]",
    ring: "ring-emerald-200/50",
    dot: "bg-[#059669]",
  },
  activo: {
    label: "Activo",
    bg: "bg-[#DFF7F4]",
    text: "text-[#0F766E]",
    ring: "ring-teal-200/50",
    dot: "bg-[#0F766E]",
  },
  nuevo: {
    label: "Nuevo",
    bg: "bg-[#DBEAFE]",
    text: "text-[#2563EB]",
    ring: "ring-blue-200/50",
    dot: "bg-[#2563EB]",
  },
  // ─── Atención → amber soft ───
  inactivo: {
    label: "Inactivo",
    bg: "bg-[#FEF3C7]",
    text: "text-[#D97706]",
    ring: "ring-amber-200/50",
    dot: "bg-[#D97706]",
  },
  // ─── Neutral / sin actividad → gray ───
  prospecto: {
    label: "Prospecto",
    bg: "bg-[#F3F5F7]",
    text: "text-gray-600",
    ring: "ring-gray-200",
    dot: "bg-gray-400",
  },
  sin_actividad: {
    label: "Sin ventas",
    bg: "bg-[#F3F5F7]",
    text: "text-gray-500",
    ring: "ring-gray-200",
    dot: "bg-gray-300",
  },
}

function StatusPill({ status }: { status: ClienteStatus }) {
  const c = STATUS_CONF[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${c.bg} ${c.text} px-2 py-0.5 text-xs font-medium ring-1 ${c.ring}`}
    >
      <span className={`size-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

function Avatar({ nombre }: { nombre: string }) {
  const initials = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("")
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F3F5F7] text-[11px] font-semibold text-gray-700 ring-1 ring-[#E7EAF0]">
      {initials || "?"}
    </div>
  )
}

function HeaderCell({
  label,
  ctx,
  align = "left",
}: {
  label: string
  ctx: HeaderContext<EnrichedCliente, unknown>
  align?: "left" | "right" | "center"
}) {
  const column = ctx.column
  const sorted = column.getIsSorted()
  const canSort = column.getCanSort()
  return (
    <button
      type="button"
      onClick={() => canSort && column.toggleSorting(sorted === "asc")}
      className={`group flex h-full w-full items-center gap-1 select-none ${align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"} ${canSort ? "cursor-pointer hover:text-gray-900" : "cursor-default"}`}
    >
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </span>
      {canSort && (
        <span className="text-gray-400">
          {sorted === "asc" ? (
            <ArrowUp className="size-3" />
          ) : sorted === "desc" ? (
            <ArrowDown className="size-3" />
          ) : (
            <ArrowUpDown className="size-3 opacity-0 transition group-hover:opacity-100" />
          )}
        </span>
      )}
    </button>
  )
}

export function ClientesDashboard({
  clientes,
  ventas,
  cotizaciones,
  venta_items,
  socios,
  error,
}: {
  clientes: ClienteRow[]
  ventas: VentaSummaryRow[]
  cotizaciones: CotizacionSummaryRow[]
  venta_items: VentaItemSummary[]
  socios: SocioBasic[]
  error: string | null
}) {
  const today = useMemo(() => new Date(), [])
  const sociosMap = useMemo(
    () => new Map(socios.map((s) => [s.id, s.nombre])),
    [socios],
  )

  // ─── Enrich clientes con métricas derivadas ───────────────────────
  const enriched: EnrichedCliente[] = useMemo(() => {
    const ventasByCliente = new Map<string, VentaSummaryRow[]>()
    for (const v of ventas) {
      if (!v.cliente_id) continue
      const arr = ventasByCliente.get(v.cliente_id) ?? []
      arr.push(v)
      ventasByCliente.set(v.cliente_id, arr)
    }
    const cotsByCliente = new Map<string, CotizacionSummaryRow[]>()
    for (const c of cotizaciones) {
      if (!c.cliente_id) continue
      const arr = cotsByCliente.get(c.cliente_id) ?? []
      arr.push(c)
      cotsByCliente.set(c.cliente_id, arr)
    }

    return clientes.map((c) => {
      const vs = (ventasByCliente.get(c.id) ?? []).filter(
        (v) => v.estatus !== "cancelada",
      )
      const cots = cotsByCliente.get(c.id) ?? []
      const ltv = vs.reduce((s, v) => s + Number(v.total ?? 0), 0)
      const utilidad = vs.reduce(
        (s, v) => s + Number(v.utilidad_neta ?? 0),
        0,
      )
      const saldo = vs.reduce(
        (s, v) => s + Number(v.saldo_pendiente ?? 0),
        0,
      )
      const fechas = vs.map((v) => v.fecha).sort()
      const primer = fechas[0] ?? null
      const ultimo = fechas[fechas.length - 1] ?? null
      const ticket = vs.length > 0 ? ltv / vs.length : 0
      // Frecuencia: promedio de gaps entre compras consecutivas
      let frecuencia: number | null = null
      if (fechas.length >= 2) {
        const gaps: number[] = []
        for (let i = 1; i < fechas.length; i++) {
          const a = new Date(fechas[i - 1]).getTime()
          const b = new Date(fechas[i]).getTime()
          gaps.push((b - a) / (1000 * 60 * 60 * 24))
        }
        frecuencia = gaps.reduce((s, x) => s + x, 0) / gaps.length
      }
      const diasSinCompra = ultimo
        ? Math.floor(
            (today.getTime() - new Date(ultimo).getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : null

      // Status
      let status: ClienteStatus = "sin_actividad"
      if (c.tipo === "prospecto") status = "prospecto"
      else if (vs.length === 0) status = "sin_actividad"
      else if (diasSinCompra !== null && diasSinCompra > 90) status = "inactivo"
      else if (vs.length >= 3) status = "recurrente"
      else if (vs.length === 1 && diasSinCompra !== null && diasSinCompra <= 30)
        status = "nuevo"
      else status = "activo"

      return {
        ...c,
        ventas_count: vs.length,
        cotizaciones_count: cots.length,
        ltv,
        utilidad_total: utilidad,
        saldo_total: saldo,
        ultimo_pedido: ultimo,
        primer_pedido: primer,
        ticket_promedio: ticket,
        frecuencia_dias: frecuencia,
        dias_sin_compra: diasSinCompra,
        status,
        vendedor_nombre: c.vendedor_socio_id
          ? sociosMap.get(c.vendedor_socio_id) ?? null
          : null,
      }
    })
  }, [clientes, ventas, cotizaciones, today, sociosMap])

  // ─── KPIs básicos (F3 los amplía) ─────────────────────────────────
  const kpis = useMemo(() => {
    const total = enriched.length
    const activos = enriched.filter(
      (c) => c.status === "activo" || c.status === "recurrente" || c.status === "nuevo",
    ).length
    const recurrentes = enriched.filter((c) => c.status === "recurrente").length
    const inactivos = enriched.filter((c) => c.status === "inactivo").length
    const ltvTotal = enriched.reduce((s, c) => s + c.ltv, 0)
    const ticketProm =
      enriched.reduce((s, c) => s + c.ticket_promedio, 0) /
      Math.max(1, enriched.filter((c) => c.ventas_count > 0).length)
    const mejor = [...enriched]
      .filter((c) => c.ventas_count > 0)
      .sort((a, b) => b.ltv - a.ltv)[0]
    const saldoTotal = enriched.reduce((s, c) => s + c.saldo_total, 0)
    return {
      total,
      activos,
      recurrentes,
      inactivos,
      ltvTotal,
      ticketProm,
      mejor,
      saldoTotal,
    }
  }, [enriched])

  // ─── Series mensuales para sparklines KPI ──────────────────────────
  const monthlyKpi = useMemo(() => {
    const months: {
      key: string
      nuevos: number
      ltvGanado: number
      activosCum: number
    }[] = []
    const now = today
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      months.push({ key, nuevos: 0, ltvGanado: 0, activosCum: 0 })
    }
    const idx = new Map(months.map((m, i) => [m.key, i]))
    // Nuevos clientes por mes (primer_pedido cae en ese mes)
    for (const c of enriched) {
      if (!c.primer_pedido) continue
      const k = c.primer_pedido.slice(0, 7)
      const i = idx.get(k)
      if (i !== undefined) months[i].nuevos += 1
    }
    // LTV ganado por mes (suma ventas en ese mes)
    for (const v of ventas) {
      const k = v.fecha.slice(0, 7)
      const i = idx.get(k)
      if (i !== undefined) months[i].ltvGanado += Number(v.total ?? 0)
    }
    // Activos acumulados (clientes con ≥1 venta hasta ese mes)
    const ventasByCli = new Map<string, string[]>()
    for (const v of ventas) {
      if (!v.cliente_id) continue
      const arr = ventasByCli.get(v.cliente_id) ?? []
      arr.push(v.fecha)
      ventasByCli.set(v.cliente_id, arr)
    }
    for (let i = 0; i < months.length; i++) {
      const m = months[i]
      const cutoff = m.key + "-31"
      let count = 0
      for (const [, fechas] of ventasByCli) {
        if (fechas.some((f) => f.slice(0, 7) <= m.key && f <= cutoff)) count++
      }
      m.activosCum = count
    }
    return months
  }, [enriched, ventas, today])

  // ─── Drawer state ─────────────────────────────────────────────────
  const [selectedCliente, setSelectedCliente] = useState<EnrichedCliente | null>(
    null,
  )

  // ─── Filtros ──────────────────────────────────────────────────────
  const [globalFilter, setGlobalFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState<"todos" | ClienteStatus>(
    "todos",
  )
  const [tipoFilter, setTipoFilter] = useState<string>("todos")

  const filtered = useMemo(() => {
    let list = enriched
    if (statusFilter !== "todos") {
      list = list.filter((c) => c.status === statusFilter)
    }
    if (tipoFilter !== "todos") {
      list = list.filter((c) => c.tipo === tipoFilter)
    }
    return list
  }, [enriched, statusFilter, tipoFilter])

  // ─── TanStack Table ────────────────────────────────────────────────
  const [sorting, setSorting] = useState<SortingState>([
    { id: "ltv", desc: true },
  ])
  // Default: Avatar+Cliente, Tipo, Estatus, # Ventas, LTV, Acciones.
  // Resto togglable.
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    rfc: false,
    ciudad: false,
    pais: false,
    primer_pedido: false,
    cotizaciones_count: false,
    saldo_total: false,
    vendedor_nombre: false,
    metodo_pago_pref: false,
    contacto: false,
    ticket_promedio: false,
    utilidad_total: false,
    ultimo_pedido: false,
    frecuencia_dias: false,
  })
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [showColumnMenu, setShowColumnMenu] = useState(false)

  const columns: ColumnDef<EnrichedCliente>[] = useMemo(
    () => [
      {
        id: "expander",
        header: () => null,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              row.toggleExpanded()
            }}
            className="flex size-6 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <ChevronDown
              className={`size-3.5 transition-transform ${
                row.getIsExpanded() ? "rotate-180" : ""
              }`}
            />
          </button>
        ),
        enableSorting: false,
        size: 40,
      },
      {
        id: "cliente",
        accessorFn: (c) => c.nombre_negocio ?? c.nombre,
        header: (ctx) => <HeaderCell label="Cliente" ctx={ctx} />,
        cell: ({ row }) => {
          const c = row.original
          const display = c.nombre_negocio ?? c.nombre
          const sub = c.nombre_negocio ? c.nombre : null
          return (
            <div className="flex items-center gap-2.5">
              <Avatar nombre={display} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-gray-900">
                  {display}
                </div>
                {sub && (
                  <div className="truncate text-[11px] text-gray-500">
                    {sub}
                  </div>
                )}
              </div>
            </div>
          )
        },
        size: 240,
      },
      {
        accessorKey: "tipo",
        header: (ctx) => <HeaderCell label="Tipo" ctx={ctx} />,
        cell: ({ getValue, row }) => (
          <TipoCell
            clienteId={row.original.id}
            tipoActual={(getValue() as string) ?? "particular"}
          />
        ),
        size: 130,
      },
      {
        accessorKey: "status",
        header: (ctx) => <HeaderCell label="Estatus" ctx={ctx} />,
        cell: ({ getValue }) => <StatusPill status={getValue() as ClienteStatus} />,
        size: 110,
      },
      {
        id: "contacto",
        header: () => (
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
            Contacto
          </span>
        ),
        cell: ({ row }) => {
          const c = row.original
          return (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              {c.telefono && (
                <span
                  className="inline-flex items-center gap-1"
                  title={c.telefono}
                >
                  <Phone className="size-3 text-gray-400" />
                  <span className="tabular-nums">{c.telefono}</span>
                </span>
              )}
              {c.email && (
                <span
                  className="inline-flex items-center gap-1 truncate"
                  title={c.email}
                >
                  <Mail className="size-3 text-gray-400" />
                  <span className="max-w-[120px] truncate">{c.email}</span>
                </span>
              )}
              {!c.telefono && !c.email && (
                <span className="text-gray-300">—</span>
              )}
            </div>
          )
        },
        size: 220,
        enableSorting: false,
      },
      {
        accessorKey: "ciudad",
        header: (ctx) => <HeaderCell label="Ciudad" ctx={ctx} />,
        cell: ({ row }) => {
          const c = row.original
          if (!c.ciudad) return <span className="text-xs text-gray-300">—</span>
          return (
            <span className="inline-flex items-center gap-1 text-xs text-gray-700">
              <MapPin className="size-3 text-gray-400" />
              {c.ciudad}
              {c.estado && (
                <span className="text-gray-400">· {c.estado}</span>
              )}
            </span>
          )
        },
        size: 160,
      },
      {
        accessorKey: "rfc",
        header: (ctx) => <HeaderCell label="RFC" ctx={ctx} />,
        cell: ({ getValue }) => {
          const v = getValue() as string | null
          return v ? (
            <span className="font-mono text-[11px] tabular-nums text-gray-700">
              {v}
            </span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )
        },
        size: 130,
      },
      {
        accessorKey: "ventas_count",
        meta: { align: "center" },
        header: (ctx) => <HeaderCell label="# Ventas" ctx={ctx} align="center" />,
        cell: ({ getValue }) => {
          const v = Number(getValue() ?? 0)
          return (
            <span
              className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                v >= 5
                  ? "bg-emerald-100 text-emerald-700"
                  : v >= 2
                    ? "bg-teal-50 text-teal-700"
                    : v === 1
                      ? "bg-[#F9FAFB] text-[#0F766E]"
                      : "bg-gray-50 text-gray-400"
              }`}
            >
              {v}
            </span>
          )
        },
        size: 90,
      },
      {
        accessorKey: "cotizaciones_count",
        meta: { align: "right" },
        header: (ctx) => <HeaderCell label="# Cotiz." ctx={ctx} align="right" />,
        cell: ({ getValue }) => {
          const v = Number(getValue() ?? 0)
          return v > 0 ? (
            <span className="text-xs tabular-nums text-gray-700">{v}</span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )
        },
        size: 90,
      },
      {
        accessorKey: "ltv",
        meta: { align: "right" },
        header: (ctx) => (
          <HeaderCell label="LTV (Total)" ctx={ctx} align="right" />
        ),
        cell: ({ getValue }) => {
          const v = Number(getValue() ?? 0)
          return v > 0 ? (
            <span className="text-sm font-bold tabular-nums text-gray-900">
              {mxn.format(v)}
            </span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )
        },
        size: 130,
      },
      {
        accessorKey: "ticket_promedio",
        meta: { align: "right" },
        header: (ctx) => (
          <HeaderCell label="Ticket prom." ctx={ctx} align="right" />
        ),
        cell: ({ getValue }) => {
          const v = Number(getValue() ?? 0)
          return v > 0 ? (
            <span className="text-xs tabular-nums text-gray-600">
              {mxn.format(v)}
            </span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )
        },
        size: 120,
      },
      {
        accessorKey: "utilidad_total",
        meta: { align: "right" },
        header: (ctx) => (
          <HeaderCell label="Utilidad" ctx={ctx} align="right" />
        ),
        cell: ({ getValue }) => {
          const v = Number(getValue() ?? 0)
          return v > 0 ? (
            <span className="text-xs font-semibold tabular-nums text-emerald-700">
              {mxn.format(v)}
            </span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )
        },
        size: 120,
      },
      {
        accessorKey: "saldo_total",
        meta: { align: "right" },
        header: (ctx) => <HeaderCell label="Saldo" ctx={ctx} align="right" />,
        cell: ({ getValue }) => {
          const v = Number(getValue() ?? 0)
          return v > 0 ? (
            <span className="inline-flex items-center rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-semibold text-rose-700 tabular-nums">
              {mxn.format(v)}
            </span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )
        },
        size: 110,
      },
      {
        accessorKey: "ultimo_pedido",
        meta: { align: "right" },
        header: (ctx) => (
          <HeaderCell label="Última compra" ctx={ctx} align="right" />
        ),
        cell: ({ row }) => {
          const c = row.original
          if (!c.ultimo_pedido) {
            return <span className="text-xs text-gray-300">—</span>
          }
          const dias = c.dias_sin_compra ?? 0
          const tone =
            dias < 30
              ? "text-emerald-700"
              : dias < 90
                ? "text-amber-700"
                : "text-rose-700"
          return (
            <div className="text-right">
              <div className="text-xs tabular-nums text-gray-700">
                {fechaFmt.format(new Date(c.ultimo_pedido))}
              </div>
              <div className={`text-[10px] ${tone}`}>
                hace {dias}d
              </div>
            </div>
          )
        },
        size: 130,
      },
      {
        accessorKey: "primer_pedido",
        meta: { align: "right" },
        header: (ctx) => (
          <HeaderCell label="Primera compra" ctx={ctx} align="right" />
        ),
        cell: ({ getValue }) => {
          const v = getValue() as string | null
          return v ? (
            <span className="text-xs tabular-nums text-gray-600">
              {fechaFmt.format(new Date(v))}
            </span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )
        },
        size: 120,
      },
      {
        accessorKey: "frecuencia_dias",
        meta: { align: "right" },
        header: (ctx) => (
          <HeaderCell label="Frec. (días)" ctx={ctx} align="right" />
        ),
        cell: ({ getValue }) => {
          const v = getValue() as number | null
          return v !== null ? (
            <span className="inline-flex items-center rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-violet-700">
              {Math.round(v)}d
            </span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )
        },
        size: 100,
      },
      {
        accessorKey: "vendedor_nombre",
        header: (ctx) => <HeaderCell label="Vendedor" ctx={ctx} />,
        cell: ({ getValue }) => {
          const v = getValue() as string | null
          return v ? (
            <span className="text-xs text-gray-700">{v}</span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )
        },
        size: 110,
      },
      {
        accessorKey: "metodo_pago_pref",
        header: (ctx) => <HeaderCell label="Método pago" ctx={ctx} />,
        cell: ({ getValue }) => {
          const v = getValue() as string | null
          return v ? (
            <span className="text-xs text-gray-700">{v}</span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )
        },
        size: 110,
      },
    ],
    [],
  )

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter, columnVisibility, expanded },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: setExpanded,
    enableExpanding: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    initialState: { pagination: { pageSize: 25 } },
    globalFilterFn: (row, _id, value) => {
      const q = String(value).toLowerCase().trim()
      if (!q) return true
      const c = row.original
      return (
        c.nombre.toLowerCase().includes(q) ||
        (c.nombre_negocio ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.telefono ?? "").toLowerCase().includes(q) ||
        (c.rfc ?? "").toLowerCase().includes(q) ||
        (c.ciudad ?? "").toLowerCase().includes(q) ||
        (c.estado ?? "").toLowerCase().includes(q)
      )
    },
  })

  const pageIdx = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalPages = table.getPageCount()
  const filteredCount = table.getFilteredRowModel().rows.length

  return (
    <div className="p-6 space-y-4">
      {/* ─── Header ejecutivo (custom) ─── */}
      {(() => {
        const len = monthlyKpi.length
        const cur = monthlyKpi[len - 1]
        const prev = monthlyKpi[len - 2]
        const pct = (a: number, b: number) =>
          b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100
        const dActivos = cur && prev ? pct(cur.activosCum, prev.activosCum) : 0
        const dNuevos = cur && prev ? pct(cur.nuevos, prev.nuevos) : 0
        const dLtv = cur && prev ? pct(cur.ltvGanado, prev.ltvGanado) : 0
        // % revenue concentrado en mejor cliente
        const concentrado =
          kpis.ltvTotal > 0 && kpis.mejor
            ? (kpis.mejor.ltv / kpis.ltvTotal) * 100
            : 0
        const mejorMes = monthlyKpi.reduce(
          (best, m) =>
            m.ltvGanado > (best?.ltvGanado ?? 0) ? m : best,
          monthlyKpi[0],
        )
        const mejorMesLabel = mejorMes
          ? new Date(mejorMes.key + "-01").toLocaleDateString("es-MX", {
              month: "short",
              year: "2-digit",
            })
          : "—"
        const trimChange = dLtv

        return (
          <>
            {/* Title row */}
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-[#0F172A]">
                  Clientes
                </h1>
                <p
                  className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-[#64748B] tabular-nums"
                  style={{ letterSpacing: "-0.005em" }}
                >
                  <span>
                    <span className="font-semibold text-[#0F172A]">
                      {kpis.total}
                    </span>{" "}
                    clientes
                  </span>
                  <span className="text-gray-300">·</span>
                  <span>
                    <span className="font-semibold text-[#0F172A]">
                      {kpis.activos}
                    </span>{" "}
                    activos
                  </span>
                  <span className="text-gray-300">·</span>
                  <span>
                    <span className="font-semibold text-[#0F172A]">
                      {mxn.format(kpis.ltvTotal)}
                    </span>{" "}
                    LTV
                  </span>
                  <span className="text-gray-300">·</span>
                  <span
                    className={
                      trimChange >= 0
                        ? "font-semibold text-emerald-600"
                        : "font-semibold text-rose-600"
                    }
                  >
                    {trimChange >= 0 ? "+" : ""}
                    {trimChange.toFixed(1)}% este mes
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(15,23,42,0.06)] bg-white/70 px-2.5 py-1 text-[11px] font-medium text-[#64748B] backdrop-blur">
                  Últimos 12 meses
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(15,23,42,0.06)] bg-white/70 px-2.5 py-1 text-[11px] font-medium text-[#64748B] backdrop-blur">
                  <span className="relative flex size-1.5">
                    <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative size-1.5 rounded-full bg-emerald-500" />
                  </span>
                  Live
                </span>
                <Link
                  href="/clientes/nuevo"
                  className="inline-flex h-[36px] items-center gap-2 rounded-[12px] bg-[#0F766E] px-4 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#115E59]"
                >
                  <UserPlus className="size-4" strokeWidth={1.75} />
                  Nuevo cliente
                </Link>
              </div>
            </header>

            {/* Hero strip — superficie glass única con divisores invisibles */}
            <section
              className="relative grid grid-cols-2 overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.05)] lg:grid-cols-4"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.78), rgba(255,255,255,0.62))",
                backdropFilter: "blur(18px)",
                WebkitBackdropFilter: "blur(18px)",
                boxShadow:
                  "0 1px 2px rgba(15,23,42,0.03), 0 8px 24px rgba(15,23,42,0.02)",
              }}
            >
              <HeroMetric
                label="Total clientes"
                value={kpis.total.toString()}
                trend={dActivos}
                sub={`${cur?.nuevos ?? 0} nuevos este mes`}
                sparkline={monthlyKpi.map((m) => m.activosCum)}
              />
              <HeroMetric
                label="Recurrentes"
                value={kpis.recurrentes.toString()}
                trend={dNuevos}
                sub="≥3 compras"
                sparkline={monthlyKpi.map((m) => m.nuevos)}
              />
              <HeroMetric
                label="LTV total"
                value={mxn.format(kpis.ltvTotal)}
                trend={dLtv}
                sub={`${mxn.format(cur?.ltvGanado ?? 0)} este mes`}
                sparkline={monthlyKpi.map((m) => m.ltvGanado)}
              />
              <BestClienteMetric
                cliente={kpis.mejor ?? null}
                pctRevenue={concentrado}
              />
            </section>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Split panel — Activos / Saldo (compacto horizontal) */}
            <section
              className="grid grid-cols-1 overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.05)] bg-white sm:grid-cols-2"
              style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.03)" }}
            >
              <SplitMetric
                label="Activos"
                value={kpis.activos.toString()}
                sub={`${kpis.recurrentes} recurrentes`}
                accent="emerald"
                progress={
                  kpis.total > 0
                    ? (kpis.activos / kpis.total) * 100
                    : 0
                }
              />
              <SplitMetric
                label="Saldo pendiente"
                value={mxn.format(kpis.saldoTotal)}
                sub={`${kpis.inactivos} inactivos`}
                accent={kpis.saldoTotal > 0 ? "rose" : "neutral"}
                progress={
                  kpis.ltvTotal > 0
                    ? (kpis.saldoTotal / kpis.ltvTotal) * 100
                    : 0
                }
              />
            </section>

            {/* Insights pills — mini-badges editoriales */}
            <section className="flex flex-wrap gap-2">
              {kpis.mejor && concentrado > 30 && (
                <InsightPill tone="amber">
                  <span className="font-semibold">{kpis.mejor.nombre_negocio ?? kpis.mejor.nombre}</span>{" "}
                  genera {concentrado.toFixed(0)}% del revenue
                </InsightPill>
              )}
              {kpis.inactivos > 0 && (
                <InsightPill tone="rose">
                  {kpis.inactivos}{" "}
                  {kpis.inactivos === 1
                    ? "cliente podría abandonar"
                    : "clientes podrían abandonar"}
                </InsightPill>
              )}
              {mejorMes && mejorMes.ltvGanado > 0 && (
                <InsightPill tone="violet">
                  Mejor mes histórico: <span className="font-semibold">{mejorMesLabel}</span>{" "}
                  · {mxn.format(mejorMes.ltvGanado)}
                </InsightPill>
              )}
              {dLtv >= 8 && (
                <InsightPill tone="emerald">
                  LTV creció {dLtv.toFixed(1)}% vs mes anterior
                </InsightPill>
              )}
              {(cur?.nuevos ?? 0) > 0 && (
                <InsightPill tone="emerald">
                  {cur?.nuevos} {cur?.nuevos === 1 ? "cliente nuevo" : "clientes nuevos"} este mes
                </InsightPill>
              )}
            </section>
          </>
        )
      })()}

      {/* Estimado de ingresos predictivo */}
      <EstimadoIngresos clientes={enriched} ventas={ventas} />

      {/* Predicción de compras por cliente (CDF empírica + bell + seasonality) */}
      <PrediccionCompras
        clientes={enriched}
        ventas={ventas}
        onClienteClick={setSelectedCliente}
      />

      {/* Recurrencia analytics con heatmap interactivo */}
      <RecurrenciaAnalytics
        clientes={enriched}
        ventas={ventas}
        cotizaciones={cotizaciones}
        venta_items={venta_items}
      />

      {/* Tabla */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {/* Toolbar */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(15,23,42,0.04)] bg-gradient-to-r from-white to-gray-50/50 px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[#0F766E]" />
            <h2 className="text-sm font-semibold text-gray-900">
              Base de clientes
            </h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 tabular-nums">
              {filteredCount}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Buscar nombre, negocio, RFC, email, ciudad…"
                className="h-10 w-72 rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#DFF7F4]"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "todos" | ClienteStatus)
              }
              className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#DFF7F4]"
            >
              <option value="todos">Todos los estatus</option>
              <option value="activo">Activos</option>
              <option value="recurrente">Recurrentes</option>
              <option value="nuevo">Nuevos</option>
              <option value="inactivo">Inactivos</option>
              <option value="prospecto">Prospectos</option>
              <option value="sin_actividad">Sin ventas</option>
            </select>
            <select
              value={tipoFilter}
              onChange={(e) => setTipoFilter(e.target.value)}
              className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#DFF7F4]"
            >
              <option value="todos">Todos los tipos</option>
              {TIPOS_CLIENTE.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColumnMenu((s) => !s)}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
              >
                <Columns3 className="size-4" />
                Columnas
              </button>
              {showColumnMenu && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setShowColumnMenu(false)}
                  />
                  <div className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                    <div className="border-b border-[rgba(15,23,42,0.04)] px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
                      Mostrar columnas
                    </div>
                    <ul className="max-h-72 overflow-y-auto py-1">
                      {table.getAllLeafColumns().map((col) => {
                        if (col.id === "expander") return null
                        return (
                          <li key={col.id}>
                            <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                              <input
                                type="checkbox"
                                checked={col.getIsVisible()}
                                onChange={col.getToggleVisibilityHandler()}
                                className="size-3.5 accent-[#0F766E]"
                              />
                              <span className="capitalize">
                                {col.id.replace(/_/g, " ")}
                              </span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Body */}
        <div className="relative max-w-full overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[#F9FAFB] backdrop-blur-sm">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-gray-200">
                  {hg.headers.map((h, idx) => {
                    const isFirst = idx === 0
                    const align = h.column.columnDef.meta?.align
                    const alignClass =
                      align === "right"
                        ? "text-right"
                        : align === "center"
                          ? "text-center"
                          : "text-left"
                    return (
                      <th
                        key={h.id}
                        style={{ width: h.getSize() }}
                        className={`relative h-10 px-4 font-medium ${alignClass} ${isFirst ? "sticky left-0 z-20 bg-gray-50/95" : ""}`}
                      >
                        {h.isPlaceholder
                          ? null
                          : flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="h-32 text-center text-sm text-gray-500"
                  >
                    Sin clientes con esos filtros.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row, i) => (
                  <Fragment key={row.id}>
                    <tr
                      onClick={() => setSelectedCliente(row.original)}
                      className={`group border-b border-[rgba(15,23,42,0.04)] cursor-pointer transition-colors hover:bg-[#F9FAFB]/40 ${i % 2 === 1 ? "bg-gray-50/30" : ""}`}
                    >
                      {row.getVisibleCells().map((cell, idx) => {
                        const isFirst = idx === 0
                        const align = cell.column.columnDef.meta?.align
                        const alignClass =
                          align === "right"
                            ? "text-right"
                            : align === "center"
                              ? "text-center"
                              : "text-left"
                        return (
                          <td
                            key={cell.id}
                            style={{ width: cell.column.getSize() }}
                            className={`px-4 py-3 align-middle ${alignClass} ${isFirst ? "sticky left-0 z-[1] bg-white group-hover:bg-[#F9FAFB]/60" : ""}`}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        )
                      })}
                    </tr>
                    {row.getIsExpanded() && (
                      <tr className="border-b border-gray-200 bg-gradient-to-r from-white/30 via-white to-white">
                        <td
                          colSpan={row.getVisibleCells().length}
                          className="px-6 py-4"
                        >
                          <ExpandedClienteRow cliente={row.original} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 text-xs">
          <div className="flex items-center gap-2 text-gray-600">
            <span>
              {pageIdx * pageSize + 1}–
              {Math.min((pageIdx + 1) * pageSize, filteredCount)} de{" "}
              <strong className="tabular-nums text-gray-900">
                {filteredCount}
              </strong>
            </span>
            <select
              value={pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="h-7 rounded-md border border-gray-200 bg-white px-2 text-[11px] text-gray-700 focus:outline-none"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} por página
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-3" />
              Anterior
            </button>
            <span className="px-1 tabular-nums text-gray-600">
              Página{" "}
              <strong className="text-gray-900">{pageIdx + 1}</strong> de{" "}
              <strong className="text-gray-900">
                {Math.max(1, totalPages)}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente
              <ChevronRight className="size-3" />
            </button>
          </div>
        </footer>
      </section>

      {/* Drawer */}
      <ClienteDrawer
        cliente={selectedCliente}
        open={selectedCliente !== null}
        onClose={() => setSelectedCliente(null)}
        ventas={ventas}
        cotizaciones={cotizaciones}
        venta_items={venta_items}
      />
    </div>
  )
}

/** Micro-sparkline individual — solo detrás del número, ultra-tenue */
function MicroSpark({ points }: { points: number[] }) {
  if (points.length < 2) return null
  const w = 80
  const h = 22
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const step = w / (points.length - 1)
  const path = points
    .map((v, i) => {
      const x = i * step
      const y = h - ((v - min) / range) * h
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(" ")
  return (
    <svg
      className="pointer-events-none absolute -bottom-0.5 right-3 transition-opacity duration-180 group-hover:opacity-100"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      aria-hidden
      style={{ opacity: 0.55 }}
    >
      <path
        d={path}
        stroke="#0F766E"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
    </svg>
  )
}

/**
 * Métrica del hero strip premium.
 * - Surface glass única (no cards visibles)
 * - Micro-sparkline solo detrás del número (top-right del bloque)
 * - Hover glow sutil + translateY
 * - Tipografía: label tracking 0.12em opacity baja, número 28px font-700
 */
function HeroMetric({
  label,
  value,
  trend,
  sub,
  truncate,
  sparkline,
}: {
  label: string
  value: string
  trend?: number
  sub?: string
  truncate?: boolean
  sparkline?: number[]
}) {
  return (
    <div
      className="group relative overflow-hidden px-6 py-4 transition-all duration-180 hover:bg-[rgba(255,255,255,0.55)]"
      style={{
        boxShadow: "inset 1px 0 0 0 rgba(255,255,255,0.5)",
      }}
    >
      <div className="relative">
        <p
          className="text-[9.5px] font-semibold uppercase text-[#64748B]/70"
          style={{ letterSpacing: "0.14em" }}
        >
          {label}
        </p>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <p
            className={`text-[28px] font-semibold leading-none tracking-[-0.035em] tabular-nums text-[#0F172A] ${truncate ? "truncate" : ""}`}
            title={truncate ? value : undefined}
            style={{ fontFeatureSettings: '"tnum" 1, "ss01" 1' }}
          >
            {value}
          </p>
          {trend !== undefined && (
            <span
              className={`inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold tabular-nums ${
                trend >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              <span aria-hidden className="text-[7px]">
                {trend >= 0 ? "▲" : "▼"}
              </span>
              {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
        {sub && (
          <p className="mt-1 text-[10.5px] leading-tight text-[#64748B]/80">
            {sub}
          </p>
        )}
        {sparkline && <MicroSpark points={sparkline} />}
      </div>
    </div>
  )
}

/**
 * Mejor cliente — celda especial del hero strip con avatar + Top badge
 * + % revenue. Más editorial que un HeroMetric genérico.
 */
function BestClienteMetric({
  cliente,
  pctRevenue,
}: {
  cliente: EnrichedCliente | null
  pctRevenue: number
}) {
  if (!cliente) {
    return (
      <div
        className="group relative overflow-hidden px-6 py-4 transition-all duration-180"
        style={{ boxShadow: "inset 1px 0 0 0 rgba(255,255,255,0.5)" }}
      >
        <p
          className="text-[9.5px] font-semibold uppercase text-[#64748B]/70"
          style={{ letterSpacing: "0.14em" }}
        >
          Mejor cliente
        </p>
        <p className="mt-1.5 text-[18px] font-semibold leading-none tracking-[-0.025em] text-[#94A3B8]">
          Sin ventas
        </p>
      </div>
    )
  }
  const display = cliente.nombre_negocio ?? cliente.nombre
  const initials =
    display
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  const isTop = pctRevenue >= 25
  return (
    <div
      className="group relative overflow-hidden px-6 py-4 transition-all duration-180 hover:bg-[rgba(255,255,255,0.55)]"
      style={{ boxShadow: "inset 1px 0 0 0 rgba(255,255,255,0.5)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className="text-[9.5px] font-semibold uppercase text-[#64748B]/70"
          style={{ letterSpacing: "0.14em" }}
        >
          Mejor cliente
        </p>
        {isTop && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-200/50"
            title="Top cliente — concentra >25% del LTV"
          >
            ★ Top
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm ring-2 ring-white"
          style={{
            background:
              "linear-gradient(135deg, #0F766E 0%, #115E59 100%)",
          }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[14px] font-semibold leading-tight tracking-[-0.02em] text-[#0F172A]"
            title={display}
          >
            {display}
          </p>
          <p
            className="text-[11px] tabular-nums text-[#64748B]"
            style={{ fontFeatureSettings: '"tnum" 1' }}
          >
            {mxn.format(cliente.ltv)}
            {pctRevenue > 0 && (
              <>
                <span className="mx-1 text-gray-300">·</span>
                <span className="font-semibold text-[#0F766E]">
                  {pctRevenue.toFixed(0)}%
                </span>{" "}
                revenue
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Split panel — KPI rail compacto.
 * Label + value + sub inline + thin progress (max width 80px).
 * No fluff. Una fila por métrica.
 */
function SplitMetric({
  label,
  value,
  sub,
  accent,
  progress,
}: {
  label: string
  value: string
  sub?: string
  accent: "emerald" | "rose" | "neutral"
  progress?: number
}) {
  const valueColor =
    accent === "emerald"
      ? "text-emerald-700"
      : accent === "rose"
        ? "text-rose-600"
        : "text-[#0F172A]"
  const barColor =
    accent === "emerald"
      ? "bg-emerald-500"
      : accent === "rose"
        ? "bg-rose-500"
        : "bg-gray-400"
  const tintBg =
    accent === "emerald"
      ? "bg-gradient-to-r from-emerald-50/30 via-transparent to-transparent"
      : accent === "rose"
        ? "bg-gradient-to-r from-rose-50/30 via-transparent to-transparent"
        : ""
  const pct = Math.max(0, Math.min(100, progress ?? 0))
  return (
    <div
      className={`relative px-5 py-3 transition-colors duration-180 ${tintBg}`}
      style={{ boxShadow: "inset 1px 0 0 0 rgba(15,23,42,0.04)" }}
    >
      <p
        className="text-[9.5px] font-semibold uppercase text-[#64748B]/70"
        style={{ letterSpacing: "0.14em" }}
      >
        {label}
      </p>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <p
          className={`text-[19px] font-semibold leading-none tracking-[-0.03em] tabular-nums ${valueColor}`}
          style={{ fontFeatureSettings: '"tnum" 1' }}
        >
          {value}
        </p>
        {sub && (
          <p className="text-[10.5px] tabular-nums text-[#94A3B8]">{sub}</p>
        )}
      </div>
      {progress !== undefined && (
        <div className="mt-2 h-[3px] w-20 overflow-hidden rounded-full bg-[rgba(15,23,42,0.04)]">
          <div
            className={`h-[3px] rounded-full ${barColor} transition-all duration-500`}
            style={{ width: `${pct}%`, opacity: 0.7 }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * AI insight pill — apariencia de "AI insight" no badge.
 * Glass + ultra-low padding + hover glow del tono.
 */
function InsightPill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode
  tone?: "emerald" | "amber" | "rose" | "violet" | "neutral"
}) {
  const toneClass =
    tone === "emerald"
      ? "text-[#0F766E]"
      : tone === "amber"
        ? "text-[#B45309]"
        : tone === "rose"
          ? "text-[#B91C1C]"
          : tone === "violet"
            ? "text-[#7C3AED]"
            : "text-[#64748B]"
  const glowRgb =
    tone === "emerald"
      ? "15,118,110"
      : tone === "amber"
        ? "217,119,6"
        : tone === "rose"
          ? "220,38,38"
          : tone === "violet"
            ? "139,92,246"
            : "100,116,139"
  return (
    <span
      className={`group inline-flex items-center gap-1.5 rounded-full bg-white/55 px-2 py-[3px] text-[10px] font-semibold tabular-nums backdrop-blur-md transition-all duration-180 hover:-translate-y-0.5 ${toneClass}`}
      style={{
        boxShadow: `inset 0 0 0 1px rgba(${glowRgb},0.10), 0 1px 2px rgba(15,23,42,0.02)`,
        letterSpacing: "-0.005em",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `inset 0 0 0 1px rgba(${glowRgb},0.18), 0 4px 14px rgba(${glowRgb},0.12)`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `inset 0 0 0 1px rgba(${glowRgb},0.10), 0 1px 2px rgba(15,23,42,0.02)`
      }}
    >
      <span
        aria-hidden
        className="size-1 shrink-0 rounded-full bg-current opacity-50 transition-opacity duration-180 group-hover:opacity-100"
      />
      {children}
    </span>
  )
}

function ExpandedClienteRow({ cliente }: { cliente: EnrichedCliente }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="rounded-xl border border-gray-100 bg-white/80 p-3 shadow-sm">
        <h4 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
          Información
        </h4>
        <dl className="space-y-1.5 text-xs">
          {cliente.direccion && (
            <Row label="Dirección" value={cliente.direccion} />
          )}
          {(cliente.colonia || cliente.codigo_postal) && (
            <Row
              label="Col / CP"
              value={[
                cliente.colonia,
                cliente.codigo_postal ? `C.P. ${cliente.codigo_postal}` : null,
              ]
                .filter(Boolean)
                .join(", ")}
            />
          )}
          {cliente.rfc && <Row label="RFC" value={cliente.rfc} mono />}
          {cliente.notas && (
            <Row label="Notas" value={cliente.notas} multiline />
          )}
          {!cliente.direccion && !cliente.rfc && !cliente.notas && (
            <p className="text-xs italic text-gray-400">
              Sin información adicional registrada.
            </p>
          )}
        </dl>
      </div>
      <div className="rounded-xl border border-gray-100 bg-white/80 p-3 shadow-sm">
        <h4 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
          Métricas
        </h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Mini
            label="Total compras"
            value={mxn2.format(cliente.ltv)}
            tone="text-[#0F766E]"
          />
          <Mini
            label="Utilidad"
            value={mxn2.format(cliente.utilidad_total)}
            tone="text-emerald-700"
          />
          <Mini
            label="Ticket prom."
            value={mxn2.format(cliente.ticket_promedio)}
          />
          <Mini
            label="Saldo"
            value={mxn2.format(cliente.saldo_total)}
            tone={cliente.saldo_total > 0 ? "text-rose-700" : "text-gray-700"}
          />
          <Mini
            label="# Ventas"
            value={cliente.ventas_count.toString()}
            tone="text-teal-700"
          />
          <Mini
            label="# Cotizaciones"
            value={cliente.cotizaciones_count.toString()}
          />
        </div>
      </div>
      <div className="rounded-xl border border-gray-100 bg-white/80 p-3 shadow-sm">
        <h4 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
          Recurrencia
        </h4>
        {cliente.ventas_count > 0 ? (
          <div className="space-y-1.5 text-xs">
            <Row
              label="Primera"
              value={
                cliente.primer_pedido
                  ? fechaFmt.format(new Date(cliente.primer_pedido))
                  : "—"
              }
            />
            <Row
              label="Última"
              value={
                cliente.ultimo_pedido
                  ? fechaFmt.format(new Date(cliente.ultimo_pedido))
                  : "—"
              }
              accent={
                cliente.dias_sin_compra !== null && cliente.dias_sin_compra > 90
                  ? "text-rose-700"
                  : ""
              }
            />
            <Row
              label="Frecuencia"
              value={
                cliente.frecuencia_dias
                  ? `Cada ${Math.round(cliente.frecuencia_dias)} días`
                  : "Una sola compra"
              }
            />
            {cliente.dias_sin_compra !== null && (
              <Row
                label="Días sin compra"
                value={`${cliente.dias_sin_compra}d`}
                accent={
                  cliente.dias_sin_compra > 90
                    ? "text-rose-700"
                    : cliente.dias_sin_compra > 30
                      ? "text-amber-700"
                      : "text-emerald-700"
                }
              />
            )}
          </div>
        ) : (
          <p className="text-xs italic text-gray-400">
            Sin compras registradas aún.
          </p>
        )}
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  accent,
  mono,
  multiline,
}: {
  label: string
  value: string
  accent?: string
  mono?: boolean
  multiline?: boolean
}) {
  return (
    <div className={multiline ? "" : "flex items-center justify-between gap-3"}>
      <dt className="text-gray-500">{label}</dt>
      <dd
        className={`${mono ? "font-mono" : ""} ${accent ?? "text-gray-900"} ${multiline ? "mt-0.5 whitespace-pre-wrap" : "text-right"}`}
      >
        {value}
      </dd>
    </div>
  )
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="rounded-md bg-gray-50 px-2 py-1.5">
      <div className="text-[9.5px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div
        className={`mt-0.5 text-xs font-semibold tabular-nums ${tone ?? "text-gray-900"}`}
      >
        {value}
      </div>
    </div>
  )
}

// ─── TipoCell · edición inline del tipo de cliente ──────────────────

function TipoCell({
  clienteId,
  tipoActual,
}: {
  clienteId: string
  tipoActual: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [tipo, setTipo] = useState(tipoActual)
  const conf = getTipoConf(tipo)

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    e.stopPropagation()
    const nuevo = e.target.value
    if (nuevo === tipo) return
    const previo = tipo
    setTipo(nuevo) // optimistic
    startTransition(async () => {
      const result = await actualizarTipoCliente(clienteId, nuevo)
      if (!result.ok) {
        setTipo(previo) // revertir
        toast.error(result.error || "No se pudo actualizar el tipo")
        return
      }
      toast.success("Tipo actualizado")
      router.refresh()
    })
  }

  return (
    <div
      className="relative inline-block"
      onClick={(e) => e.stopPropagation()}
    >
      <select
        value={tipo}
        onChange={handleChange}
        disabled={pending}
        className={`cursor-pointer appearance-none rounded-full border-0 px-2.5 py-1 pr-6 text-[11px] font-medium uppercase tracking-wide ring-1 transition focus:outline-none focus:ring-2 focus:ring-offset-1 ${conf.bgText} ${pending ? "opacity-60" : "hover:shadow-sm"}`}
        title="Click para cambiar tipo"
      >
        {TIPOS_CLIENTE.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-current opacity-60">
        {pending ? (
          <span className="block size-2.5 animate-spin rounded-full border border-current border-t-transparent" />
        ) : (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
            <path d="M4 6L0.5 1.5h7z" />
          </svg>
        )}
      </span>
    </div>
  )
}
