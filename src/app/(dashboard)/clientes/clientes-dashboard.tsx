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
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Crown,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react"
import { ClienteDrawer } from "./cliente-drawer"
import { RecurrenciaAnalytics } from "./recurrencia-analytics"
import { EstimadoIngresos } from "./estimado-ingresos"
import { PrediccionCompras } from "./prediccion-compras"
import { TIPOS_CLIENTE, getTipoConf } from "./tipos-cliente"
import { actualizarTipoCliente } from "./actions"
import { PageHeader } from "@/components/page-header"

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

const STATUS_CONF: Record<
  ClienteStatus,
  { label: string; bg: string; text: string; ring: string; dot: string }
> = {
  prospecto: {
    label: "Prospecto",
    bg: "bg-violet-50",
    text: "text-violet-700",
    ring: "ring-violet-200/60",
    dot: "bg-violet-500",
  },
  recurrente: {
    label: "Recurrente",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200/60",
    dot: "bg-emerald-500",
  },
  activo: {
    label: "Activo",
    bg: "bg-teal-50",
    text: "text-teal-700",
    ring: "ring-teal-200/60",
    dot: "bg-teal-500",
  },
  nuevo: {
    label: "Nuevo",
    bg: "bg-pink-50",
    text: "text-pink-700",
    ring: "ring-pink-200/60",
    dot: "bg-pink-500",
  },
  inactivo: {
    label: "Inactivo",
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200/60",
    dot: "bg-amber-500",
  },
  sin_actividad: {
    label: "Sin ventas",
    bg: "bg-gray-100",
    text: "text-gray-600",
    ring: "ring-gray-200",
    dot: "bg-gray-400",
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
  // Color determinista por hash del nombre
  const palette = [
    "from-pink-500 to-rose-500",
    "from-teal-500 to-cyan-500",
    "from-violet-500 to-purple-500",
    "from-amber-500 to-orange-500",
    "from-emerald-500 to-teal-500",
    "from-blue-500 to-indigo-500",
    "from-rose-500 to-pink-500",
  ]
  let hash = 0
  for (const ch of nombre) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  const grad = palette[Math.abs(hash) % palette.length]
  return (
    <div
      className={`flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${grad} text-[11px] font-bold text-white shadow-sm ring-2 ring-white`}
    >
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
        header: (ctx) => <HeaderCell label="# Ventas" ctx={ctx} align="right" />,
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
                      ? "bg-pink-50 text-pink-700"
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
    <div className="p-4 space-y-4">
      <PageHeader
        title="Clientes"
        subtitle={`Base de ${kpis.total} clientes · ${kpis.activos} activos`}
        icon={<Users className="size-5" />}
        gradient="bg-gradient-to-br from-[#4a1a3a] via-[#5a1f47] to-[#3b0f2d]"
        kpis={[
          {
            label: "Total clientes",
            value: kpis.total.toString(),
            sub: "en base de datos",
          },
          {
            label: "Recurrentes",
            value: kpis.recurrentes.toString(),
            sub: "≥3 compras",
            color: "text-pink-300",
          },
          {
            label: "LTV total",
            value: mxn.format(kpis.ltvTotal),
            sub: `Ticket prom. ${mxn.format(kpis.ticketProm)}`,
          },
          {
            label: "Mejor cliente",
            value:
              (
                kpis.mejor?.nombre_negocio ??
                kpis.mejor?.nombre ??
                "—"
              ).slice(0, 18),
            sub: kpis.mejor ? mxn.format(kpis.mejor.ltv) : "",
            color: "text-amber-300",
          },
        ]}
        actions={
          <Link
            href="/clientes/nuevo"
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-medium text-[#4a1a3a] transition-all hover:bg-white/90"
          >
            <UserPlus className="size-4" />
            Nuevo cliente
          </Link>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPIs secundarios — saldo + inactivos */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-2">
        <Kpi
          icon={<Sparkles className="size-4" />}
          label="Activos"
          value={kpis.activos.toString()}
          sub={`${kpis.recurrentes} recurrentes`}
          accent="text-emerald-700"
          gradient="from-emerald-50 via-white to-teal-50/50"
          ring="ring-emerald-100"
        />
        <Kpi
          icon={<Building2 className="size-4" />}
          label="Saldo pendiente"
          value={mxn.format(kpis.saldoTotal)}
          sub={`${kpis.inactivos} inactivos`}
          accent={kpis.saldoTotal > 0 ? "text-rose-700" : "text-gray-700"}
          gradient="from-rose-50 via-white to-pink-50/50"
          ring="ring-rose-100"
        />
      </section>

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
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-white to-gray-50/50 px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-pink-600" />
            <h2 className="text-sm font-semibold text-gray-900">
              Base de clientes
            </h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 tabular-nums">
              {filteredCount}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Buscar nombre, negocio, RFC, email, ciudad…"
                className="h-8 w-72 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-700 placeholder:text-gray-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "todos" | ClienteStatus)
              }
              className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100"
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
              className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100"
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
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
              >
                <Columns3 className="size-3.5" />
                Columnas
              </button>
              {showColumnMenu && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setShowColumnMenu(false)}
                  />
                  <div className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                    <div className="border-b border-gray-100 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
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
                                className="size-3.5 accent-pink-600"
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
            <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-gray-200">
                  {hg.headers.map((h, idx) => {
                    const isFirst = idx === 0
                    return (
                      <th
                        key={h.id}
                        style={{ width: h.getSize() }}
                        className={`relative h-10 px-4 text-left font-medium ${isFirst ? "sticky left-0 z-20 bg-gray-50/95" : ""}`}
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
                      className={`group border-b border-gray-100 cursor-pointer transition-colors hover:bg-pink-50/40 ${i % 2 === 1 ? "bg-gray-50/30" : ""}`}
                    >
                      {row.getVisibleCells().map((cell, idx) => {
                        const isFirst = idx === 0
                        return (
                          <td
                            key={cell.id}
                            style={{ width: cell.column.getSize() }}
                            className={`px-4 py-3 align-middle ${isFirst ? "sticky left-0 z-[1] bg-white group-hover:bg-pink-50/60" : ""}`}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        )
                      })}
                    </tr>
                    {row.getIsExpanded() && (
                      <tr className="border-b border-gray-200 bg-gradient-to-r from-pink-50/30 via-white to-teal-50/30">
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

function Kpi({
  icon,
  label,
  value,
  sub,
  accent,
  gradient,
  ring,
  truncate,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  accent: string
  gradient: string
  ring: string
  truncate?: boolean
}) {
  return (
    <article
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-4 ring-1 ${ring} shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      <header className={`flex items-center gap-1.5 ${accent}`}>
        {icon}
        <span className="text-[10.5px] font-semibold uppercase tracking-wider">
          {label}
        </span>
      </header>
      <div
        className={`mt-2 text-xl font-bold tabular-nums ${accent} ${truncate ? "truncate" : ""}`}
        title={truncate ? value : undefined}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-gray-600">{sub}</div>}
    </article>
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
            tone="text-pink-700"
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
