"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type Header,
  type HeaderContext,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
} from "lucide-react"
import { cambiarEstatusCotizacion } from "./actions"

export type Estatus =
  | "borrador"
  | "enviada"
  | "aceptada"
  | "rechazada"
  | "vencida"

export type CotizacionRow = {
  id: string
  numero: string
  fecha: string
  valida_hasta: string | null
  subtotal: number | null
  descuento: number | null
  iva: number | null
  total: number | null
  costo_productos: number | null
  costo_envio: number | null
  utilidad_neta: number | null
  estatus: Estatus
  cliente_id: string | null
  notas: string | null
  clientes: {
    id: string
    nombre: string
    nombre_negocio: string | null
    rfc: string | null
    ciudad: string | null
    vendedor_socio_id: string | null
  } | null
}

export type ClienteOption = {
  id: string
  nombre: string
  nombre_negocio: string | null
}

export type CotItemRow = {
  cotizacion_id: string
  cantidad: number
  precio_unitario: number
  productos: { id: string; sku: string | null; nombre: string } | null
}

export type KpisGlobales = {
  totalCotizaciones: number
  convertidas: number
  enProceso: number
  totalValor: number
  porVencer: number
}

export type EnrichedCot = CotizacionRow & {
  itemsCount: number
  piezasTotal: number
  margenNetoPct: number
  productNames: string
}

const ESTATUS_OPTIONS: { value: Estatus; label: string }[] = [
  { value: "borrador", label: "Borrador" },
  { value: "enviada", label: "Enviada" },
  { value: "aceptada", label: "Aceptada" },
  { value: "rechazada", label: "Rechazada" },
  { value: "vencida", label: "Vencida" },
]

const ESTATUS_CONF: Record<
  Estatus,
  { label: string; bg: string; text: string; ring: string }
> = {
  borrador: {
    label: "Borrador",
    bg: "bg-gray-100",
    text: "text-gray-700",
    ring: "ring-gray-200",
  },
  enviada: {
    label: "Enviada",
    bg: "bg-blue-50",
    text: "text-blue-700",
    ring: "ring-blue-200/60",
  },
  aceptada: {
    label: "Aceptada",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200/60",
  },
  rechazada: {
    label: "Rechazada",
    bg: "bg-rose-50",
    text: "text-rose-700",
    ring: "ring-rose-200/60",
  },
  vencida: {
    label: "Vencida",
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200/60",
  },
}

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})
const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

function HeaderCell({
  label,
  ctx,
  align = "left",
}: {
  label: string
  ctx: HeaderContext<EnrichedCot, unknown>
  align?: "left" | "right" | "center"
}) {
  const column = ctx.column
  const header = ctx.header as Header<EnrichedCot, unknown>
  const sorted = column.getIsSorted()
  const canSort = column.getCanSort()
  return (
    <div
      className={`group relative flex h-full items-center gap-1.5 select-none ${align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"}`}
    >
      <button
        type="button"
        onClick={() => canSort && column.toggleSorting(sorted === "asc")}
        className={`inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500 ${canSort ? "cursor-pointer hover:text-gray-900" : "cursor-default"}`}
      >
        <span>{label}</span>
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
      {column.getCanResize() && (
        <div
          onMouseDown={header.getResizeHandler() as React.MouseEventHandler}
          onTouchStart={header.getResizeHandler() as React.TouchEventHandler}
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none bg-transparent hover:bg-teal-300/60"
        />
      )}
    </div>
  )
}

function StatusCell({
  cotId,
  estatus,
}: {
  cotId: string
  estatus: Estatus
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [val, setVal] = useState<Estatus>(estatus)

  useEffect(() => setVal(estatus), [estatus])

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    e.stopPropagation()
    const nuevo = e.target.value as Estatus
    if (nuevo === val) return
    const previo = val
    setVal(nuevo)
    startTransition(async () => {
      const result = await cambiarEstatusCotizacion(cotId, nuevo)
      if (!result.ok) {
        setVal(previo)
        toast.error(result.error || "No se pudo cambiar")
        return
      }
      toast.success("Estatus actualizado")
      router.refresh()
    })
  }

  const conf = ESTATUS_CONF[val]
  return (
    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <select
        value={val}
        onChange={handleChange}
        disabled={pending}
        className={`cursor-pointer appearance-none rounded-full border-0 px-2.5 py-1 pr-6 text-[11px] font-medium ring-1 transition focus:outline-none focus:ring-2 focus:ring-offset-1 ${conf.bg} ${conf.text} ${conf.ring} ${pending ? "opacity-60" : "hover:shadow-sm"}`}
      >
        {ESTATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-current opacity-60">
        {pending ? (
          <Loader2 className="size-2.5 animate-spin" />
        ) : (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
            <path d="M4 6L0.5 1.5h7z" />
          </svg>
        )}
      </span>
    </div>
  )
}

export function CotizacionesList({
  cotizaciones,
  clientes,
  items,
  kpis,
  error,
}: {
  cotizaciones: CotizacionRow[]
  clientes: ClienteOption[]
  items: CotItemRow[]
  kpis: KpisGlobales
  error: string | null
}) {
  const router = useRouter()

  // Enrichment con conteos por cotización
  const data: EnrichedCot[] = useMemo(() => {
    const itemsByCotId = new Map<string, CotItemRow[]>()
    for (const it of items) {
      const arr = itemsByCotId.get(it.cotizacion_id) ?? []
      arr.push(it)
      itemsByCotId.set(it.cotizacion_id, arr)
    }
    return cotizaciones.map((c) => {
      const its = itemsByCotId.get(c.id) ?? []
      const piezas = its.reduce((s, x) => s + Number(x.cantidad ?? 0), 0)
      const productNames = its
        .map((x) => `${x.productos?.nombre ?? ""} ${x.productos?.sku ?? ""}`)
        .join(" ")
        .toLowerCase()
      const total = Number(c.total ?? 0)
      const utilNeta = Number(c.utilidad_neta ?? 0)
      const margen = total > 0 ? (utilNeta / total) * 100 : 0
      return {
        ...c,
        itemsCount: its.length,
        piezasTotal: piezas,
        margenNetoPct: margen,
        productNames,
      }
    })
  }, [cotizaciones, items])

  // Filtros
  const [globalFilter, setGlobalFilter] = useState("")
  const [estatusFiltro, setEstatusFiltro] = useState<"todos" | Estatus>("todos")
  const [clienteFiltro, setClienteFiltro] = useState<string>("todos")
  const [productoQuery, setProductoQuery] = useState("")
  const [fechaDesde, setFechaDesde] = useState("")
  const [fechaHasta, setFechaHasta] = useState("")
  const [montoMin, setMontoMin] = useState("")
  const [montoMax, setMontoMax] = useState("")

  const filtered = useMemo(() => {
    let list = data
    if (estatusFiltro !== "todos") {
      list = list.filter((c) => c.estatus === estatusFiltro)
    }
    if (clienteFiltro !== "todos") {
      list = list.filter((c) => c.cliente_id === clienteFiltro)
    }
    if (fechaDesde) list = list.filter((c) => c.fecha >= fechaDesde)
    if (fechaHasta) list = list.filter((c) => c.fecha <= fechaHasta)
    const min = Number(montoMin)
    const max = Number(montoMax)
    if (montoMin && Number.isFinite(min)) {
      list = list.filter((c) => Number(c.total ?? 0) >= min)
    }
    if (montoMax && Number.isFinite(max)) {
      list = list.filter((c) => Number(c.total ?? 0) <= max)
    }
    if (productoQuery.trim()) {
      const q = productoQuery.trim().toLowerCase()
      list = list.filter((c) => c.productNames.includes(q))
    }
    return list
  }, [
    data,
    estatusFiltro,
    clienteFiltro,
    fechaDesde,
    fechaHasta,
    montoMin,
    montoMax,
    productoQuery,
  ])

  const activeFilters = [
    !!globalFilter,
    estatusFiltro !== "todos",
    clienteFiltro !== "todos",
    !!fechaDesde || !!fechaHasta,
    !!montoMin || !!montoMax,
    !!productoQuery.trim(),
  ].filter(Boolean).length

  // TanStack Table state
  const [sorting, setSorting] = useState<SortingState>([
    { id: "fecha", desc: true },
  ])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    valida_hasta: false,
    subtotal: false,
    iva: false,
    descuento: false,
    itemsCount: false,
    piezasTotal: false,
    margenNetoPct: false,
    rfc: false,
    ciudad: false,
  })
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)

  const columns: ColumnDef<EnrichedCot>[] = useMemo(
    () => [
      {
        accessorKey: "fecha",
        header: (ctx) => <HeaderCell label="Fecha" ctx={ctx} />,
        cell: ({ getValue }) => (
          <span className="text-xs font-medium text-gray-700 tabular-nums">
            {fechaFmt.format(new Date(getValue() as string))}
          </span>
        ),
        size: 120,
      },
      {
        accessorKey: "valida_hasta",
        header: (ctx) => <HeaderCell label="Vigente" ctx={ctx} />,
        cell: ({ getValue }) => {
          const v = getValue() as string | null
          if (!v) return <span className="text-xs text-gray-300">—</span>
          const d = new Date(v)
          const dias = Math.round(
            (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
          )
          const tone =
            dias < 0
              ? "text-rose-700"
              : dias < 7
                ? "text-amber-700"
                : "text-gray-700"
          return (
            <div className="text-xs">
              <div className="tabular-nums text-gray-700">
                {fechaFmt.format(d)}
              </div>
              <div className={`text-[10px] ${tone}`}>
                {dias < 0 ? `Vencida ${-dias}d` : `${dias}d restantes`}
              </div>
            </div>
          )
        },
        size: 130,
      },
      {
        accessorKey: "numero",
        header: (ctx) => <HeaderCell label="Número" ctx={ctx} />,
        cell: ({ getValue, row }) => (
          <Link
            href={`/cotizaciones/${row.original.id}`}
            className="font-mono text-xs text-teal-700 transition hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {getValue() as string}
          </Link>
        ),
        size: 200,
      },
      {
        id: "cliente",
        accessorFn: (c) =>
          c.clientes?.nombre_negocio ?? c.clientes?.nombre ?? "—",
        header: (ctx) => <HeaderCell label="Cliente" ctx={ctx} />,
        cell: ({ row }) => {
          const c = row.original.clientes
          if (!c) return <span className="text-xs text-gray-300">—</span>
          return (
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-gray-900">
                {c.nombre_negocio ?? c.nombre}
              </div>
              {c.nombre_negocio && (
                <div className="truncate text-[10px] text-gray-500">
                  {c.nombre}
                </div>
              )}
            </div>
          )
        },
        size: 220,
      },
      {
        id: "rfc",
        accessorFn: (c) => c.clientes?.rfc ?? "",
        header: (ctx) => <HeaderCell label="RFC" ctx={ctx} />,
        cell: ({ getValue }) => {
          const v = getValue() as string
          return v ? (
            <span className="font-mono text-[11px] tabular-nums text-gray-700">
              {v}
            </span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )
        },
        size: 120,
      },
      {
        id: "ciudad",
        accessorFn: (c) => c.clientes?.ciudad ?? "",
        header: (ctx) => <HeaderCell label="Ciudad" ctx={ctx} />,
        cell: ({ getValue }) => {
          const v = getValue() as string
          return v ? (
            <span className="text-xs text-gray-700">{v}</span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )
        },
        size: 130,
      },
      {
        accessorKey: "itemsCount",
        header: (ctx) => <HeaderCell label="# Ítems" ctx={ctx} align="right" />,
        cell: ({ getValue }) => (
          <span className="inline-flex items-center justify-center rounded-md bg-teal-50 px-1.5 py-0.5 text-xs font-semibold text-teal-700 tabular-nums">
            {Number(getValue() ?? 0)}
          </span>
        ),
        size: 90,
      },
      {
        accessorKey: "piezasTotal",
        header: (ctx) => <HeaderCell label="Piezas" ctx={ctx} align="right" />,
        cell: ({ getValue }) => (
          <span className="text-xs tabular-nums text-gray-700">
            {Number(getValue() ?? 0)}
          </span>
        ),
        size: 90,
      },
      {
        accessorKey: "subtotal",
        header: (ctx) => (
          <HeaderCell label="Subtotal" ctx={ctx} align="right" />
        ),
        cell: ({ getValue }) => (
          <span className="text-xs tabular-nums text-gray-500">
            {mxn.format(Number(getValue() ?? 0))}
          </span>
        ),
        size: 110,
      },
      {
        accessorKey: "descuento",
        header: (ctx) => <HeaderCell label="Desc." ctx={ctx} align="right" />,
        cell: ({ getValue }) => {
          const v = Number(getValue() ?? 0)
          return v > 0 ? (
            <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 tabular-nums">
              − {mxn.format(v)}
            </span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )
        },
        size: 100,
      },
      {
        accessorKey: "iva",
        header: (ctx) => <HeaderCell label="IVA" ctx={ctx} align="right" />,
        cell: ({ getValue, row }) => {
          const v = Number(getValue() ?? 0)
          const total = Number(row.original.total ?? 0)
          if (v > 0)
            return (
              <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-teal-200/60 tabular-nums">
                + {mxn.format(v)}
              </span>
            )
          if (total > 0)
            return (
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200/60">
                Sin IVA
              </span>
            )
          return <span className="text-xs text-gray-300">—</span>
        },
        size: 110,
      },
      {
        accessorKey: "total",
        header: (ctx) => <HeaderCell label="Total" ctx={ctx} align="right" />,
        cell: ({ getValue }) => (
          <span className="text-sm font-bold text-teal-800 tabular-nums">
            {mxn.format(Number(getValue() ?? 0))}
          </span>
        ),
        size: 130,
      },
      {
        accessorKey: "margenNetoPct",
        header: (ctx) => (
          <HeaderCell label="Margen neto" ctx={ctx} align="right" />
        ),
        cell: ({ getValue }) => {
          const v = Number(getValue() ?? 0)
          const tone =
            v >= 50
              ? "text-emerald-700 bg-emerald-50 ring-emerald-200/60"
              : v >= 20
                ? "text-amber-700 bg-amber-50 ring-amber-200/60"
                : "text-rose-700 bg-rose-50 ring-rose-200/60"
          return (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 tabular-nums ${tone}`}
            >
              {v.toFixed(1)}%
            </span>
          )
        },
        size: 110,
      },
      {
        accessorKey: "estatus",
        header: (ctx) => <HeaderCell label="Estatus" ctx={ctx} />,
        cell: ({ getValue, row }) => (
          <StatusCell
            cotId={row.original.id}
            estatus={getValue() as Estatus}
          />
        ),
        size: 130,
      },
      {
        id: "acciones",
        header: () => (
          <div className="text-right text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
            Acciones
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Link
              href={`/cotizaciones/${row.original.id}`}
              onClick={(e) => e.stopPropagation()}
              className="rounded-md p-1 text-gray-400 transition hover:bg-teal-50 hover:text-teal-700"
              title="Ver"
            >
              <ExternalLink className="size-3.5" />
            </Link>
            <Link
              href={`/cotizaciones/${row.original.id}/editar`}
              onClick={(e) => e.stopPropagation()}
              className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              title="Editar"
            >
              <Pencil className="size-3.5" />
            </Link>
          </div>
        ),
        enableSorting: false,
        enableResizing: false,
        size: 80,
      },
    ],
    [],
  )

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter, columnVisibility, columnSizing },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
    globalFilterFn: (row, _id, value) => {
      const q = String(value).toLowerCase().trim()
      if (!q) return true
      const v = row.original
      const cli =
        v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? ""
      return (
        v.numero.toLowerCase().includes(q) ||
        cli.toLowerCase().includes(q) ||
        (v.clientes?.rfc ?? "").toLowerCase().includes(q) ||
        (v.clientes?.ciudad ?? "").toLowerCase().includes(q) ||
        v.productNames.includes(q)
      )
    },
  })

  const pageIdx = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalPages = table.getPageCount()
  const filteredCount = table.getFilteredRowModel().rows.length

  return (
    <div className="space-y-5 p-8">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="size-7 text-teal-700" />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Cotizaciones
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {kpis.totalCotizaciones} cotizaciones · {kpis.convertidas}{" "}
              convertidas · {kpis.enProceso} en proceso
            </p>
          </div>
        </div>
        <Link
          href="/cotizaciones/nueva"
          className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700"
        >
          <Plus className="size-4" />
          Nueva cotización
        </Link>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPIs globales (queries reales, NO filtrados) */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Total valor"
          value={mxn.format(kpis.totalValor)}
          sub={`${kpis.totalCotizaciones} cotizaciones`}
          accent="text-teal-700"
          gradient="from-teal-50 via-white to-cyan-50/50"
          ring="ring-teal-100"
        />
        <Kpi
          label="Convertidas"
          value={kpis.convertidas.toString()}
          sub="Con venta registrada"
          accent="text-emerald-700"
          gradient="from-emerald-50 via-white to-teal-50/50"
          ring="ring-emerald-100"
        />
        <Kpi
          label="En proceso"
          value={kpis.enProceso.toString()}
          sub="Sin venta aún"
          accent="text-blue-700"
          gradient="from-blue-50 via-white to-indigo-50/50"
          ring="ring-blue-100"
        />
        <Kpi
          label="Por vencer (<7d)"
          value={kpis.porVencer.toString()}
          sub="Requieren follow-up"
          accent="text-amber-700"
          gradient="from-amber-50 via-white to-orange-50/50"
          ring="ring-amber-100"
        />
      </section>

      {/* Filtros */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-md bg-teal-50 text-teal-700">
              <Sparkles className="size-3.5" />
            </span>
            <h2 className="text-sm font-semibold text-gray-900">Filtros</h2>
            {activeFilters > 0 && (
              <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-teal-700">
                {activeFilters} activos
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] tabular-nums text-gray-500">
              Mostrando{" "}
              <strong className="text-gray-900">{filtered.length}</strong> de{" "}
              {cotizaciones.length}
            </span>
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((s) => !s)}
              className="text-[11px] font-medium text-teal-700 hover:text-teal-900"
            >
              {showAdvancedFilters ? "Ocultar avanzados" : "Avanzados"}
            </button>
            {activeFilters > 0 && (
              <button
                type="button"
                onClick={() => {
                  setGlobalFilter("")
                  setEstatusFiltro("todos")
                  setClienteFiltro("todos")
                  setProductoQuery("")
                  setFechaDesde("")
                  setFechaHasta("")
                  setMontoMin("")
                  setMontoMax("")
                }}
                className="text-[11px] font-medium text-rose-600 hover:text-rose-800"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="relative sm:col-span-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Buscar número, cliente, RFC, ciudad, producto…"
                className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-700 placeholder:text-gray-400 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <select
              value={estatusFiltro}
              onChange={(e) =>
                setEstatusFiltro(e.target.value as "todos" | Estatus)
              }
              className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-700 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
            >
              <option value="todos">Todos los estatus</option>
              {ESTATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={clienteFiltro}
              onChange={(e) => setClienteFiltro(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-700 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
            >
              <option value="todos">Todos los clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre_negocio ?? c.nombre}
                </option>
              ))}
            </select>
          </div>

          {showAdvancedFilters && (
            <div className="grid grid-cols-1 gap-3 border-t border-gray-100 pt-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Producto contiene
                </label>
                <input
                  type="text"
                  value={productoQuery}
                  onChange={(e) => setProductoQuery(e.target.value)}
                  placeholder="ej. Activador, CN-FUC…"
                  className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 placeholder:text-gray-400 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Desde
                </label>
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Hasta
                </label>
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Monto $
                </label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    placeholder="min"
                    value={montoMin}
                    onChange={(e) => setMontoMin(e.target.value)}
                    className="h-8 w-1/2 rounded-lg border border-gray-200 bg-white px-2 text-xs tabular-nums focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                  <input
                    type="number"
                    placeholder="max"
                    value={montoMax}
                    onChange={(e) => setMontoMax(e.target.value)}
                    className="h-8 w-1/2 rounded-lg border border-gray-200 bg-white px-2 text-xs tabular-nums focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Tabla */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-white to-gray-50/50 px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-teal-600" />
            <h2 className="text-sm font-semibold text-gray-900">
              Cotizaciones
            </h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 tabular-nums">
              {filteredCount}
            </span>
          </div>
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
                      if (col.id === "acciones") return null
                      return (
                        <li key={col.id}>
                          <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                            <input
                              type="checkbox"
                              checked={col.getIsVisible()}
                              onChange={col.getToggleVisibilityHandler()}
                              className="size-3.5 accent-teal-600"
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
        </header>

        <div className="relative max-w-full overflow-auto">
          <table
            className="w-full text-sm"
            style={{ width: table.getTotalSize(), minWidth: "100%" }}
          >
            <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-gray-200">
                  {hg.headers.map((h, idx) => {
                    const isFirst = idx === 0
                    return (
                      <th
                        key={h.id}
                        style={{ width: h.getSize() }}
                        className={`relative h-10 px-4 text-left font-medium ${isFirst ? "sticky left-0 z-20 bg-gray-50/95 shadow-[1px_0_0_0_#e5e7eb]" : ""}`}
                      >
                        {h.isPlaceholder
                          ? null
                          : flexRender(
                              h.column.columnDef.header,
                              h.getContext(),
                            )}
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
                    Sin cotizaciones con esos filtros.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row, i) => (
                  <tr
                    key={row.id}
                    onClick={() =>
                      router.push(`/cotizaciones/${row.original.id}`)
                    }
                    className={`group cursor-pointer border-b border-gray-100 transition-colors hover:bg-teal-50/40 ${i % 2 === 1 ? "bg-gray-50/30" : ""}`}
                  >
                    {row.getVisibleCells().map((cell, idx) => {
                      const isFirst = idx === 0
                      return (
                        <td
                          key={cell.id}
                          style={{ width: cell.column.getSize() }}
                          className={`px-4 py-3 align-middle ${isFirst ? "sticky left-0 z-[1] bg-white group-hover:bg-teal-50/60 shadow-[1px_0_0_0_#e5e7eb]" : ""}`}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gradient-to-r from-white to-gray-50/50 px-5 py-3 text-xs">
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
  )
}

function Kpi({
  label,
  value,
  sub,
  accent,
  gradient,
  ring,
}: {
  label: string
  value: string
  sub?: string
  accent: string
  gradient: string
  ring: string
}) {
  return (
    <article
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-4 ring-1 ${ring} shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className={`mt-2 text-xl font-bold tabular-nums ${accent}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-gray-600">{sub}</div>}
    </article>
  )
}
