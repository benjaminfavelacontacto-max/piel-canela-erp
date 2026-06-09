"use client"

import { Fragment, useId, useMemo, useState, useTransition } from "react"
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
  Pencil,
  Phone,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
} from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { ClienteDrawer } from "./cliente-drawer"
import { ClienteDeleteDialog, type DeleteTarget } from "./cliente-delete-dialog"
import { RecurrenciaAnalytics } from "./recurrencia-analytics"
import { EstimadoIngresos } from "./estimado-ingresos"
import {
  predecirCompra,
  calcularGlobalFrecuencia,
  type PrediccionResult,
} from "./lib-prediccion"
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
  /** Ventas totales incluyendo canceladas (para decidir si se puede borrar). */
  ventas_total_count: number
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

// ─── Filtros inteligentes (basados en la predicción de compra) ───────
type PredFilterKey = "todos" | "semana" | "alta_prob" | "riesgo"

const PRED_FILTERS: { key: PredFilterKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "semana", label: "Compra esta semana" },
  { key: "alta_prob", label: "Alta probabilidad" },
  { key: "riesgo", label: "En riesgo" },
]

function matchesPredFilter(
  pred: PrediccionResult | undefined,
  f: PredFilterKey,
): boolean {
  if (f === "todos") return true
  if (!pred || pred.metodo === "insufficient") return false
  const dias = pred.diasParaProxima
  switch (f) {
    case "semana":
      return dias !== null && dias >= -3 && dias <= 7
    case "alta_prob":
      return pred.probabilidadProx60 >= 0.6
    case "riesgo":
      return pred.riesgoAbandono >= 0.6
    default:
      return true
  }
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
      const vsAll = ventasByCliente.get(c.id) ?? []
      const vs = vsAll.filter((v) => v.estatus !== "cancelada")
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
        ventas_total_count: vsAll.length,
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

  // ─── Predicción de compra por cliente (CDF empírica + bell + global) ──
  //     Reusa lib-prediccion. Alimenta columnas, filtros y KPI proyectado.
  const predByCliente = useMemo(() => {
    const globalFreq = calcularGlobalFrecuencia(enriched)
    const m = new Map<string, PrediccionResult>()
    for (const c of enriched) {
      m.set(c.id, predecirCompra(c, ventas, today, globalFreq))
    }
    return m
  }, [enriched, ventas, today])

  const predCounts = useMemo(() => {
    const count = (f: PredFilterKey) =>
      enriched.filter((c) => matchesPredFilter(predByCliente.get(c.id), f)).length
    return {
      todos: enriched.length,
      semana: count("semana"),
      alta_prob: count("alta_prob"),
      riesgo: count("riesgo"),
    } as Record<PredFilterKey, number>
  }, [enriched, predByCliente])

  // Revenue proyectado a 7 días (próxima compra inminente × probabilidad)
  const revenue7d = useMemo(() => {
    let s = 0
    for (const c of enriched) {
      const p = predByCliente.get(c.id)
      if (
        p &&
        p.diasParaProxima !== null &&
        p.diasParaProxima >= 0 &&
        p.diasParaProxima <= 7 &&
        p.probabilidadProx60 >= 0.5
      ) {
        s += p.ingresoEstimadoProx
      }
    }
    return s
  }, [enriched, predByCliente])

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
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)

  // ─── Filtros ──────────────────────────────────────────────────────
  const [globalFilter, setGlobalFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState<"todos" | ClienteStatus>(
    "todos",
  )
  const [tipoFilter, setTipoFilter] = useState<string>("todos")
  const [predFilter, setPredFilter] = useState<PredFilterKey>("todos")

  const filtered = useMemo(() => {
    let list = enriched
    if (statusFilter !== "todos") {
      list = list.filter((c) => c.status === statusFilter)
    }
    if (tipoFilter !== "todos") {
      list = list.filter((c) => c.tipo === tipoFilter)
    }
    if (predFilter !== "todos") {
      list = list.filter((c) =>
        matchesPredFilter(predByCliente.get(c.id), predFilter),
      )
    }
    return list
  }, [enriched, statusFilter, tipoFilter, predFilter, predByCliente])

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
      {
        id: "prox_compra",
        accessorFn: (c) => predByCliente.get(c.id)?.diasParaProxima ?? 99999,
        header: (ctx) => (
          <HeaderCell label="Próxima compra" ctx={ctx} align="center" />
        ),
        meta: { align: "center" },
        size: 150,
        cell: ({ row }) => {
          const p = predByCliente.get(row.original.id)
          if (!p || p.metodo === "insufficient" || !p.fechaProxima) {
            return <span className="text-[11px] text-gray-300">—</span>
          }
          const dias = p.diasParaProxima ?? 0
          const rel =
            dias === 0 ? "hoy" : dias < 0 ? `hace ${-dias}d` : `en ${dias}d`
          const color =
            dias < -7
              ? "#B91C1C"
              : dias < 0
                ? "#B45309"
                : dias <= 14
                  ? "#047857"
                  : "#475569"
          const accion =
            p.riesgoAbandono >= 0.6
              ? "Contactar"
              : dias >= -3 && dias <= 14
                ? "Preparar"
                : null
          return (
            <div className="text-center leading-tight">
              <div
                className="text-[12px] font-semibold tabular-nums"
                style={{ color }}
              >
                {fechaFmt.format(p.fechaProxima)}
              </div>
              <div className="text-[10px] text-gray-400">
                {rel}
                {accion ? (
                  <span className="font-semibold" style={{ color }}>
                    {" · "}
                    {accion}
                  </span>
                ) : null}
              </div>
            </div>
          )
        },
      },
      {
        id: "probabilidad",
        accessorFn: (c) => predByCliente.get(c.id)?.probabilidadProx60 ?? -1,
        header: (ctx) => <HeaderCell label="Prob. 60d" ctx={ctx} align="center" />,
        meta: { align: "center" },
        size: 120,
        cell: ({ row }) => {
          const p = predByCliente.get(row.original.id)
          if (!p || p.metodo === "insufficient") {
            return <span className="text-[11px] text-gray-300">—</span>
          }
          const pct = Math.round(p.probabilidadProx60 * 100)
          const color =
            pct >= 60 ? "#047857" : pct >= 30 ? "#B45309" : "#94A3B8"
          return (
            <div className="mx-auto flex w-20 flex-col items-center gap-1">
              <span
                className="text-[12px] font-bold tabular-nums"
                style={{ color }}
              >
                {pct}%
              </span>
              <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
            </div>
          )
        },
      },
      {
        id: "revenue_esp",
        accessorFn: (c) => predByCliente.get(c.id)?.ingresoEstimadoProx ?? 0,
        header: (ctx) => (
          <HeaderCell label="Revenue esp." ctx={ctx} align="right" />
        ),
        meta: { align: "right" },
        size: 120,
        cell: ({ row }) => {
          const p = predByCliente.get(row.original.id)
          if (!p || p.metodo === "insufficient" || p.ingresoEstimadoProx <= 0) {
            return <span className="text-[11px] text-gray-300">—</span>
          }
          return (
            <span className="text-[12.5px] font-semibold tabular-nums text-gray-800">
              {mxn.format(p.ingresoEstimadoProx)}
            </span>
          )
        },
      },
      {
        id: "acciones",
        header: () => (
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
            Acciones
          </span>
        ),
        meta: { align: "right" },
        enableSorting: false,
        enableHiding: false,
        size: 88,
        cell: ({ row }) => {
          const c = row.original
          return (
            <div
              className="flex items-center justify-end gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Link
                href={`/clientes/${c.id}/editar`}
                title="Editar cliente"
                className="inline-flex size-7 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <Pencil className="size-3.5" />
              </Link>
              <button
                type="button"
                title="Eliminar cliente"
                onClick={() =>
                  setDeleteTarget({
                    id: c.id,
                    nombre: c.nombre_negocio ?? c.nombre,
                    ventas: c.ventas_total_count,
                    cotizaciones: c.cotizaciones_count,
                  })
                }
                className="inline-flex size-7 items-center justify-center rounded-md text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )
        },
      },
    ],
    [predByCliente],
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
    <div className="p-6 space-y-6">
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

        const mejorDisplay = kpis.mejor
          ? kpis.mejor.nombre_negocio ?? kpis.mejor.nombre
          : "—"
        return (
          <>
            <PageHeader
              title="Clientes"
              subtitle="Base de clientes · LTV y patrones de recompra"
              kpis={[
                {
                  label: "Total clientes",
                  value: kpis.total.toString(),
                  sub: `${cur?.nuevos ?? 0} nuevos este mes`,
                  trend: {
                    value: `${dActivos >= 0 ? "+" : ""}${dActivos.toFixed(1)}%`,
                    positive: dActivos >= 0,
                  },
                  sparkline: monthlyKpi.map((m) => m.activosCum),
                },
                {
                  label: "Recurrentes",
                  value: kpis.recurrentes.toString(),
                  sub: "≥3 compras",
                  trend: {
                    value: `${dNuevos >= 0 ? "+" : ""}${dNuevos.toFixed(1)}%`,
                    positive: dNuevos >= 0,
                  },
                  sparkline: monthlyKpi.map((m) => m.nuevos),
                },
                {
                  label: "LTV total",
                  value: mxn.format(kpis.ltvTotal),
                  sub: `${mxn.format(cur?.ltvGanado ?? 0)} este mes`,
                  trend: {
                    value: `${dLtv >= 0 ? "+" : ""}${dLtv.toFixed(1)}%`,
                    positive: dLtv >= 0,
                  },
                  sparkline: monthlyKpi.map((m) => m.ltvGanado),
                },
                {
                  label: "Mejor cliente",
                  value: mejorDisplay,
                  sub: kpis.mejor
                    ? `${mxn.format(kpis.mejor.ltv)} · ${concentrado.toFixed(0)}% revenue`
                    : "Sin ventas",
                },
              ]}
              actions={
                <Link href="/clientes/nuevo" className="pc-btn-primary">
                  <UserPlus className="size-4" strokeWidth={1.75} />
                  Nuevo cliente
                </Link>
              }
            />

            <div className="space-y-4">

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

            {/* Insights pills — contenedor unificado editorial */}
            <section
              className="flex flex-wrap gap-2"
              style={{
                padding: "10px 12px",
                background: "#f8fafc",
                borderRadius: "12px",
              }}
            >
              {revenue7d > 0 && (
                <InsightPill tone="violet">
                  Revenue proyectado 7d:{" "}
                  <span className="font-semibold">{mxn.format(revenue7d)}</span>
                </InsightPill>
              )}
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
            </div>
          </>
        )
      })()}

      <div className="space-y-4">
        {/* Estimado de ingresos predictivo */}
        <EstimadoIngresos clientes={enriched} ventas={ventas} />

        {/* Predicción de compras: fusionada en la tabla unificada de abajo
            (columnas Próxima compra · Prob. 60d · Revenue esp. + filtros). */}

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
                        if (col.id === "expander" || col.id === "acciones")
                          return null
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

        {/* Filtros inteligentes de predicción */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[rgba(15,23,42,0.04)] bg-[#FBFCFD] px-5 py-2">
          <span className="mr-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            <Sparkles className="size-3 text-[#4F46E5]" />
            Predicción
          </span>
          {PRED_FILTERS.map((f) => {
            const active = predFilter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setPredFilter(f.key)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-all"
                style={{
                  background: active ? "rgba(99,102,241,0.10)" : "white",
                  color: active ? "#4F46E5" : "#64748B",
                  border: `1px solid ${active ? "rgba(99,102,241,0.30)" : "rgba(15,23,42,0.08)"}`,
                }}
              >
                {f.label}
                <span
                  className="rounded-full px-1.5 py-px text-[9px] font-bold tabular-nums"
                  style={{
                    background: active
                      ? "rgba(99,102,241,0.20)"
                      : "rgba(15,23,42,0.06)",
                    color: active ? "#4F46E5" : "#94A3B8",
                  }}
                >
                  {predCounts[f.key]}
                </span>
              </button>
            )
          })}
        </div>

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
      </div>

      {/* Drawer */}
      <ClienteDrawer
        cliente={selectedCliente}
        open={selectedCliente !== null}
        onClose={() => setSelectedCliente(null)}
        ventas={ventas}
        cotizaciones={cotizaciones}
        venta_items={venta_items}
        onDelete={(c) => {
          setSelectedCliente(null)
          setDeleteTarget({
            id: c.id,
            nombre: c.nombre_negocio ?? c.nombre,
            ventas: c.ventas_total_count,
            cotizaciones: c.cotizaciones_count,
          })
        }}
      />

      {/* Diálogo de borrado con advertencia */}
      <ClienteDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

/**
 * Micro-sparkline individual con área degradada — Lujo Silencioso.
 * Línea fina (1.5px) + gradiente vertical 25%→0% para profundidad atmosférica.
 */
function MicroSpark({
  points,
  dark = false,
  color,
}: {
  points: number[]
  dark?: boolean
  color?: string
}) {
  if (points.length < 2) return null
  const w = 64
  const h = 28
  const pad = 3
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const pts = points.map((v, i) => ({
    x: (i / (points.length - 1)) * w,
    y: h - pad - ((v - min) / range) * (h - pad * 2),
  }))
  const linePath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ")
  const areaPath = [
    ...pts.map(
      (p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
    ),
    `L ${w} ${h}`,
    "L 0 " + h,
    "Z",
  ].join(" ")
  const stroke = color ?? (dark ? "rgba(255,255,255,0.5)" : "#0F766E")
  const gradId = useId().replace(/:/g, "")
  return (
    <svg
      className="pointer-events-none absolute bottom-0 right-3"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={`spark-${gradId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.2} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Métrica del hero — glass card sobre dark banner ("Lujo Silencioso").
 * - Background rgba(255,255,255,0.08) + backdrop-blur 12px + border 12% white
 * - Texto blanco con jerarquía de opacity (label 0.5, sub 0.35)
 * - Hover: bg 0.12, ligero translateY
 * - Sparkline atmosférica al fondo (white/40)
 */
function HeroMetric({
  label,
  value,
  trend,
  sub,
  truncate,
  sparkline,
  sparkColor,
}: {
  label: string
  value: string
  trend?: number
  sub?: string
  truncate?: boolean
  sparkline?: number[]
  sparkColor?: string
}) {
  return (
    <div
      className="group relative overflow-hidden transition-all duration-180 hover:-translate-y-0.5"
      style={{
        background: "rgba(255,255,255,0.03)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
        borderRadius: "16px",
        padding: "16px",
      }}
    >
      <div className="relative">
        <p
          className="text-[10px] font-medium uppercase mb-3"
          style={{
            color: "rgba(255,255,255,0.5)",
            letterSpacing: "0.14em",
          }}
        >
          {label}
        </p>
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={`text-[26px] font-medium leading-none tracking-[-0.03em] tabular-nums text-white ${truncate ? "truncate" : ""}`}
            title={truncate ? value : undefined}
            style={{ fontFeatureSettings: '"tnum" 1, "ss01" 1' }}
          >
            {value}
          </p>
          {trend !== undefined && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold tabular-nums"
              style={{
                color:
                  trend >= 0
                    ? "rgba(167,243,208,0.95)"
                    : "rgba(252,165,165,0.95)",
              }}
            >
              <span aria-hidden className="text-[7px]">
                {trend >= 0 ? "▲" : "▼"}
              </span>
              {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
        {sub && (
          <p
            className="mt-1.5 text-[10.5px] leading-tight"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            {sub}
          </p>
        )}
        {sparkline && <MicroSpark points={sparkline} dark color={sparkColor} />}
      </div>
    </div>
  )
}

/**
 * Mejor cliente — glass card sobre dark banner con avatar + Top badge champagne
 * (#C5A47E) + % revenue. Estilo "Lujo Silencioso".
 */
function BestClienteMetric({
  cliente,
  pctRevenue,
}: {
  cliente: EnrichedCliente | null
  pctRevenue: number
}) {
  const glassStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.03)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
    borderRadius: "16px",
    padding: "16px",
  }
  if (!cliente) {
    return (
      <div
        className="group relative overflow-hidden"
        style={glassStyle}
      >
        <p
          className="text-[10px] font-medium uppercase mb-3"
          style={{
            color: "rgba(255,255,255,0.5)",
            letterSpacing: "0.14em",
          }}
        >
          Mejor cliente
        </p>
        <p
          className="text-[18px] font-medium leading-none tracking-[-0.025em]"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
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
      className="group relative overflow-hidden transition-all duration-180 hover:-translate-y-0.5"
      style={glassStyle}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <p
          className="text-[10px] font-medium uppercase"
          style={{
            color: "rgba(255,255,255,0.5)",
            letterSpacing: "0.14em",
          }}
        >
          Mejor cliente
        </p>
        {isTop && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
            title="Top cliente — concentra >25% del LTV"
            style={{
              background: "rgba(197,164,126,0.18)",
              color: "#C5A47E",
              border: "1px solid rgba(197,164,126,0.3)",
            }}
          >
            ★ Top
          </span>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{
            background:
              "linear-gradient(135deg, #C5A47E 0%, #A8895F 100%)",
            boxShadow:
              "0 1px 2px rgba(197,164,126,0.3), 0 4px 12px rgba(197,164,126,0.15)",
          }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[14px] font-medium leading-tight tracking-[-0.02em] text-white"
            title={display}
          >
            {display}
          </p>
          <p
            className="text-[11px] tabular-nums"
            style={{
              color: "rgba(255,255,255,0.55)",
              fontFeatureSettings: '"tnum" 1',
            }}
          >
            {mxn.format(cliente.ltv)}
            {pctRevenue > 0 && (
              <>
                <span
                  className="mx-1"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                >
                  ·
                </span>
                <span
                  className="font-semibold"
                  style={{ color: "#C5A47E" }}
                >
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
