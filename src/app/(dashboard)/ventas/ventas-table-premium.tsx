"use client"

import { Fragment, useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnSizingState,
  type ExpandedState,
  type Header,
  type HeaderContext,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquare,
  Pencil,
  Search,
  Sparkles,
  StickyNote,
  Users,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"
import { parseNotas } from "./notas-util"
import { updateVentaSocio } from "./actions"
import type { Estatus, VentaRow, VentaSocioRow } from "./ventas-dashboard"

const SANDRA_ID = "4f21084b-dfe9-45f3-be80-935dc1a5e7a5"
const BENJAMIN_ID = "3165fe33-c760-4373-84d0-e1cd14d863b3"

const mxn = new Intl.NumberFormat("es-MX", {
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

type EnrichedVenta = VentaRow & {
  subtotal: number | null
  descuento: number | null
  costo_productos: number | null
  costo_envio: number | null
  notas: string | null
  sandra_monto: number
  benjamin_monto: number
  vendedor: "Sandra" | "Benjamin" | "Ambos" | "—"
  participacion_pct: number
  capital_recuperado: number
  // ganancia_bruta = subtotal − costo_productos (fórmula del Sheet, computada en JS)
  ganancia_bruta: number
  margen_pct: number      // margen bruto = ganancia_bruta / total
  margen_neto_pct: number // margen neto = utilidad_neta / total
  metodo: string | null
  notas_libre: string
  sin_iva: boolean
}

const ESTATUS_CONF: Record<
  Estatus,
  { label: string; bg: string; text: string; ring: string; dot: string }
> = {
  pagada_total: {
    label: "Pagada",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200/60",
    dot: "bg-emerald-500",
  },
  pagada_parcial: {
    label: "Parcial",
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200/60",
    dot: "bg-amber-500",
  },
  pendiente: {
    label: "Pendiente",
    bg: "bg-rose-50",
    text: "text-rose-700",
    ring: "ring-rose-200/60",
    dot: "bg-rose-500",
  },
  cancelada: {
    label: "Cancelada",
    bg: "bg-gray-100",
    text: "text-gray-600",
    ring: "ring-gray-200",
    dot: "bg-gray-400",
  },
}

function StatusBadge({ estatus }: { estatus: Estatus }) {
  const c = ESTATUS_CONF[estatus]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${c.bg} ${c.text} px-2 py-0.5 text-xs font-medium ring-1 ${c.ring}`}
    >
      <span className={`size-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

function VendorPill({ v }: { v: EnrichedVenta["vendedor"] }) {
  if (v === "—")
    return <span className="text-xs text-gray-300">—</span>
  // Pills neutros — el nombre diferencia, no el color
  const styles: Record<"Sandra" | "Benjamin" | "Ambos", string> = {
    Sandra: "bg-[#F3F5F7] text-gray-700 ring-[#E7EAF0]",
    Benjamin: "bg-[#F3F5F7] text-gray-700 ring-[#E7EAF0]",
    Ambos: "bg-[#DFF7F4] text-[#0F766E] ring-emerald-200/60",
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${styles[v]}`}
    >
      {v}
    </span>
  )
}

function NotaCell({
  libre,
  onExpand,
  expanded,
}: {
  libre: string
  onExpand: () => void
  expanded: boolean
}) {
  if (!libre) return <span className="text-xs text-gray-300">—</span>
  // Preview: primer línea + truncado si muy largo
  const preview = libre.split("\n")[0]
  const long = libre.length > 40 || libre.includes("\n")
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onExpand()
      }}
      className="group flex max-w-[180px] items-start gap-1.5 text-left"
      title="Click para expandir"
    >
      <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
      <span className="truncate text-xs text-gray-700 group-hover:text-amber-700">
        {preview}
      </span>
      {long && (
        <ChevronDown
          className={`mt-0.5 size-3 shrink-0 text-gray-400 transition group-hover:text-amber-600 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      )}
    </button>
  )
}

function EditableMonto({
  ventaId,
  socioId,
  monto,
  textColor,
  bgColor,
}: {
  ventaId: string
  socioId: string
  monto: number
  textColor: string
  bgColor: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(monto.toString())
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setDraft(monto.toString())
  }, [monto])

  function commit() {
    setEditing(false)
    const parsed = Number(draft.replace(/,/g, ""))
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Monto inválido")
      setDraft(monto.toString())
      return
    }
    if (Math.abs(parsed - monto) < 0.005) return // sin cambio
    startTransition(async () => {
      const result = await updateVentaSocio(ventaId, socioId, parsed)
      if (!result.ok) {
        toast.error(result.error || "Error al actualizar")
        setDraft(monto.toString())
        return
      }
      toast.success("Reparto actualizado")
      router.refresh()
    })
  }

  if (editing) {
    return (
      <input
        type="number"
        step="0.01"
        min="0"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") {
            setEditing(false)
            setDraft(monto.toString())
          }
        }}
        className={`w-24 rounded-md border-2 ${textColor} bg-white px-1.5 py-0.5 text-right text-xs font-semibold tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1`}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
      className={`group inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums transition hover:${bgColor} ${
        pending ? "opacity-50" : ""
      } ${monto > 0 ? textColor : "text-gray-300"}`}
      title="Click para editar"
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : monto > 0 ? (
        <>
          <span>{mxn.format(monto)}</span>
          <Pencil className="size-2.5 opacity-0 transition group-hover:opacity-60" />
        </>
      ) : (
        <>
          <span className="italic">— editar</span>
          <Pencil className="size-2.5 opacity-30 transition group-hover:opacity-100" />
        </>
      )}
    </button>
  )
}

function HeaderCell({
  label,
  ctx,
  align = "left",
}: {
  label: string
  ctx: HeaderContext<EnrichedVenta, unknown>
  align?: "left" | "right" | "center"
}) {
  const column = ctx.column
  const header = ctx.header as Header<EnrichedVenta, unknown>
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
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none bg-transparent hover:bg-gray-300"
        />
      )}
    </div>
  )
}

export function VentasTablePremium({
  ventas,
  venta_socios,
  onRowClick,
}: {
  ventas: VentaRow[]
  venta_socios: VentaSocioRow[]
  onRowClick?: (v: EnrichedVenta) => void
}) {
  // ─── Enrich ventas with socio data ───────────────────────────────
  const data: EnrichedVenta[] = useMemo(() => {
    const socioByVenta = new Map<string, VentaSocioRow[]>()
    for (const vs of venta_socios) {
      const arr = socioByVenta.get(vs.venta_id) ?? []
      arr.push(vs)
      socioByVenta.set(vs.venta_id, arr)
    }
    return ventas.map((v) => {
      const total = Number(v.total ?? 0)
      const subtotal = Number(v.subtotal ?? 0)
      const costoProd = Number(v.costo_productos ?? 0)
      // Ganancia bruta = fórmula Sheet (subtotal − costo_productos). Computada en JS
      // porque BD.ganancia es GENERATED con fórmula distinta (= utilidad_neta).
      const gananciaBruta = subtotal - costoProd
      const items = socioByVenta.get(v.id) ?? []
      const sandra = items
        .filter((x) => x.socio_id === SANDRA_ID)
        .reduce((s, x) => s + Number(x.monto ?? 0), 0)
      const benjamin = items
        .filter((x) => x.socio_id === BENJAMIN_ID)
        .reduce((s, x) => s + Number(x.monto ?? 0), 0)
      const recuperado = items
        .filter((x) => x.pagado)
        .reduce((s, x) => s + Number(x.monto ?? 0), 0)
      let vendedor: EnrichedVenta["vendedor"] = "—"
      if (sandra > 0 && benjamin > 0)
        vendedor = sandra === benjamin ? "Ambos" : sandra > benjamin ? "Sandra" : "Benjamin"
      else if (sandra > 0) vendedor = "Sandra"
      else if (benjamin > 0) vendedor = "Benjamin"
      const top = Math.max(sandra, benjamin)
      const participacion = total > 0 ? (top / total) * 100 : 0
      const margen = total > 0 ? (gananciaBruta / total) * 100 : 0
      const utilNeta = Number(v.utilidad_neta ?? 0)
      const margenNeto = total > 0 ? (utilNeta / total) * 100 : 0
      const { metodo, notas } = parseNotas(v.notas ?? null)
      return {
        ...v,
        sandra_monto: sandra,
        benjamin_monto: benjamin,
        vendedor,
        participacion_pct: participacion,
        capital_recuperado: recuperado,
        ganancia_bruta: gananciaBruta,
        margen_pct: margen,
        margen_neto_pct: margenNeto,
        metodo,
        notas_libre: notas,
        sin_iva: Number(v.iva ?? 0) === 0 && total > 0,
      }
    })
  }, [ventas, venta_socios])

  const [sorting, setSorting] = useState<SortingState>([{ id: "fecha", desc: true }])
  const [globalFilter, setGlobalFilter] = useState("")
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  // Default: solo columnas esenciales visibles (Fecha, Número, Cliente, Total,
  // Estatus, Notas, Sandra, Benjamin). El resto togglable desde el menú.
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    participacion_pct: false,
    capital_recuperado: false,
    margen_pct: false,
    margen_neto_pct: false,
    metodo: false,
    vendedor: false,
    descuento: false,
    costo_productos: false,
    costo_envio: false,
    ganancia_bruta: false,
    utilidad_neta: false,
    subtotal: false,
    iva: false,
  })
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [showColumnMenu, setShowColumnMenu] = useState(false)

  const columns: ColumnDef<EnrichedVenta>[] = useMemo(
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
            title={row.getIsExpanded() ? "Colapsar" : "Expandir"}
          >
            <ChevronDown
              className={`size-3.5 transition-transform ${
                row.getIsExpanded() ? "rotate-180" : ""
              }`}
            />
          </button>
        ),
        enableSorting: false,
        enableResizing: false,
        size: 40,
      },
      {
        accessorKey: "fecha",
        header: (ctx) => <HeaderCell label="Fecha" ctx={ctx} />,
        cell: ({ getValue }) => (
          <span className="text-xs font-medium text-gray-700 tabular-nums">
            {fechaFmt.format(new Date(getValue() as string))}
          </span>
        ),
        size: 120,
        minSize: 100,
      },
      {
        accessorKey: "numero",
        header: (ctx) => <HeaderCell label="Número" ctx={ctx} />,
        cell: ({ getValue, row }) => (
          <Link
            href={`/ventas/${row.original.id}`}
            className="font-mono text-xs text-[#0F766E] transition hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {getValue() as string}
          </Link>
        ),
        size: 200,
        minSize: 140,
      },
      {
        id: "cliente",
        accessorFn: (v) => v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? "—",
        header: (ctx) => <HeaderCell label="Cliente" ctx={ctx} />,
        cell: ({ getValue }) => (
          <span className="text-sm font-medium text-gray-900">
            {getValue() as string}
          </span>
        ),
        size: 200,
      },
      {
        accessorKey: "vendedor",
        header: (ctx) => <HeaderCell label="Vendedor" ctx={ctx} />,
        cell: ({ getValue }) => <VendorPill v={getValue() as EnrichedVenta["vendedor"]} />,
        size: 110,
      },
      // ─── Cobro: Subtotal · IVA · Descuento · Total (adyacentes) ───
      {
        accessorKey: "subtotal",
        header: (ctx) => <HeaderCell label="Subtotal" ctx={ctx} align="right" />,
        cell: ({ getValue }) => (
          <span className="text-xs tabular-nums text-gray-500">
            {mxn.format(Number(getValue() ?? 0))}
          </span>
        ),
        size: 120,
      },
      {
        accessorKey: "iva",
        header: (ctx) => <HeaderCell label="IVA" ctx={ctx} align="right" />,
        cell: ({ getValue, row }) => {
          const v = Number(getValue() ?? 0)
          const total = Number(row.original.total ?? 0)
          if (v > 0) {
            return (
              <span
                className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-teal-200/60 tabular-nums"
                title={`IVA 16% sobre subtotal ${mxn.format(Number(row.original.subtotal ?? 0))}`}
              >
                + {mxn.format(v)}
              </span>
            )
          }
          if (total > 0) {
            return (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200/60"
                title="Esta venta no incluye IVA — total = subtotal − descuento"
              >
                Sin IVA
              </span>
            )
          }
          return <span className="text-xs text-gray-300">—</span>
        },
        size: 110,
      },
      {
        accessorKey: "descuento",
        header: (ctx) => <HeaderCell label="Descuento" ctx={ctx} align="right" />,
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
        size: 110,
      },
      {
        accessorKey: "total",
        header: (ctx) => <HeaderCell label="Total" ctx={ctx} align="right" />,
        cell: ({ getValue, row }) => {
          const total = Number(getValue() ?? 0)
          const sub = Number(row.original.subtotal ?? 0)
          const iva = Number(row.original.iva ?? 0)
          const desc = Number(row.original.descuento ?? 0)
          const expected = sub + iva - desc
          const drift = Math.abs(total - expected)
          const inconsistent = drift > 0.05
          const sinIva = iva === 0 && total > 0
          const tooltip = inconsistent
            ? `⚠ Inconsistencia: total=${mxn.format(total)} pero subtotal+iva−desc=${mxn.format(expected)} (Δ ${mxn.format(drift)})`
            : `Total final = Subtotal ${mxn.format(sub)}${iva > 0 ? ` + IVA ${mxn.format(iva)}` : sinIva ? " (sin IVA)" : ""}${desc > 0 ? ` − Desc ${mxn.format(desc)}` : ""}`
          return (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-bold tabular-nums ${
                inconsistent
                  ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200/60"
                  : "text-gray-900"
              }`}
              title={tooltip}
            >
              {mxn.format(total)}
              {inconsistent && (
                <AlertTriangle className="size-3 text-rose-600" />
              )}
            </span>
          )
        },
        size: 140,
      },
      // ─── Costos ───
      {
        accessorKey: "costo_productos",
        header: (ctx) => <HeaderCell label="Costo prods." ctx={ctx} align="right" />,
        cell: ({ getValue }) => (
          <span className="text-xs tabular-nums text-gray-600">
            {mxn.format(Number(getValue() ?? 0))}
          </span>
        ),
        size: 120,
      },
      {
        accessorKey: "costo_envio",
        header: (ctx) => <HeaderCell label="Envío" ctx={ctx} align="right" />,
        cell: ({ getValue }) => {
          const v = Number(getValue() ?? 0)
          return v > 0 ? (
            <span className="text-xs tabular-nums text-amber-700">
              {mxn.format(v)}
            </span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )
        },
        size: 100,
      },
      // ─── Utilidad ───
      {
        accessorKey: "ganancia_bruta",
        header: (ctx) => <HeaderCell label="Utilidad bruta" ctx={ctx} align="right" />,
        cell: ({ getValue }) => (
          <span className="text-xs font-semibold text-emerald-600 tabular-nums">
            {mxn.format(Number(getValue() ?? 0))}
          </span>
        ),
        size: 130,
      },
      {
        accessorKey: "utilidad_neta",
        header: (ctx) => <HeaderCell label="Utilidad neta" ctx={ctx} align="right" />,
        cell: ({ getValue }) => {
          const v = Number(getValue() ?? 0)
          const tone = v >= 0 ? "text-emerald-700" : "text-rose-700"
          return (
            <span className={`text-sm font-bold tabular-nums ${tone}`}>
              {mxn.format(v)}
            </span>
          )
        },
        size: 140,
      },
      {
        accessorKey: "margen_neto_pct",
        header: (ctx) => <HeaderCell label="Margen neto" ctx={ctx} align="right" />,
        cell: ({ getValue }) => {
          const v = Number(getValue() ?? 0)
          const tone =
            v >= 50
              ? "text-emerald-700 bg-emerald-50 ring-emerald-200/60"
              : v >= 20
                ? "text-amber-700 bg-amber-50 ring-amber-200/60"
                : "text-rose-700 bg-rose-50 ring-rose-200/60"
          return (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 tabular-nums ${tone}`}>
              {v.toFixed(1)}%
            </span>
          )
        },
        size: 110,
      },
      {
        accessorKey: "estatus",
        header: (ctx) => <HeaderCell label="Estado" ctx={ctx} />,
        cell: ({ getValue }) => <StatusBadge estatus={getValue() as Estatus} />,
        size: 110,
      },
      {
        id: "notas_libre",
        accessorFn: (v) => v.notas_libre,
        header: (ctx) => <HeaderCell label="Notas" ctx={ctx} />,
        cell: ({ row }) => (
          <NotaCell
            libre={row.original.notas_libre}
            expanded={row.getIsExpanded()}
            onExpand={() => row.toggleExpanded()}
          />
        ),
        enableSorting: false,
        size: 200,
      },
      {
        accessorKey: "sandra_monto",
        header: (ctx) => <HeaderCell label="Sandra" ctx={ctx} align="right" />,
        cell: ({ getValue, row }) => (
          <div className="flex justify-end">
            <EditableMonto
              ventaId={row.original.id}
              socioId={SANDRA_ID}
              monto={Number(getValue() ?? 0)}
              textColor="text-gray-900"
              bgColor="bg-[#F3F5F7]"
            />
          </div>
        ),
        size: 130,
      },
      {
        accessorKey: "benjamin_monto",
        header: (ctx) => <HeaderCell label="Benjamin" ctx={ctx} align="right" />,
        cell: ({ getValue, row }) => (
          <div className="flex justify-end">
            <EditableMonto
              ventaId={row.original.id}
              socioId={BENJAMIN_ID}
              monto={Number(getValue() ?? 0)}
              textColor="text-teal-700"
              bgColor="bg-teal-50"
            />
          </div>
        ),
        size: 130,
      },
      {
        accessorKey: "participacion_pct",
        header: (ctx) => <HeaderCell label="% Participa." ctx={ctx} align="right" />,
        cell: ({ getValue }) => {
          const v = Number(getValue() ?? 0)
          return (
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs tabular-nums text-gray-700">{v.toFixed(0)}%</span>
              <div className="h-1 w-10 rounded-full bg-gray-100">
                <div className="h-1 rounded-full bg-[#0F766E]" style={{ width: `${Math.min(100, v)}%` }} />
              </div>
            </div>
          )
        },
        size: 120,
      },
      {
        accessorKey: "capital_recuperado",
        header: (ctx) => <HeaderCell label="Recuperado" ctx={ctx} align="right" />,
        cell: ({ getValue, row }) => {
          const v = Number(getValue() ?? 0)
          const total = Number(row.original.total ?? 0)
          const pct = total > 0 ? (v / total) * 100 : 0
          return (
            <div className="text-right">
              <div className="text-xs font-semibold text-gray-900 tabular-nums">
                {mxn.format(v)}
              </div>
              <div className="text-[10px] text-gray-500 tabular-nums">{pct.toFixed(0)}%</div>
            </div>
          )
        },
        size: 120,
      },
      {
        accessorKey: "margen_pct",
        header: (ctx) => <HeaderCell label="Margen bruto" ctx={ctx} align="right" />,
        cell: ({ getValue }) => {
          const v = Number(getValue() ?? 0)
          const tone =
            v >= 60
              ? "text-emerald-700 bg-emerald-50 ring-emerald-200/60"
              : v >= 35
                ? "text-amber-700 bg-amber-50 ring-amber-200/60"
                : "text-rose-700 bg-rose-50 ring-rose-200/60"
          return (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 tabular-nums ${tone}`}>
              {v.toFixed(1)}%
            </span>
          )
        },
        size: 100,
      },
      {
        accessorKey: "metodo",
        header: (ctx) => <HeaderCell label="Método" ctx={ctx} />,
        cell: ({ getValue }) => {
          const v = getValue() as string | null
          return v ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
              <Wallet className="size-3" />
              {v}
            </span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )
        },
        size: 120,
      },
      {
        id: "acciones",
        header: () => <div className="text-right text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">Ver</div>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1.5">
            {row.original.cotizacion_id && (
              <Link
                href={`/cotizaciones/${row.original.cotizacion_id}`}
                onClick={(e) => e.stopPropagation()}
                className="rounded-md p-1 text-gray-400 transition hover:bg-[#F3F5F7] hover:text-gray-700"
                title="Ver cotización"
              >
                <FileText className="size-3.5" />
              </Link>
            )}
            <Link
              href={`/ventas/${row.original.id}`}
              onClick={(e) => e.stopPropagation()}
              className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              title="Ver detalle"
            >
              <ExternalLink className="size-3.5" />
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
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      columnFilters,
      columnVisibility,
      columnSizing,
      expanded,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    onExpandedChange: setExpanded,
    enableColumnResizing: true,
    enableExpanding: true,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    initialState: { pagination: { pageSize: 25 } },
    globalFilterFn: (row, _id, value) => {
      const q = String(value).toLowerCase().trim()
      if (!q) return true
      const v = row.original
      const cli = v.clientes?.nombre_negocio ?? v.clientes?.nombre ?? ""
      return (
        v.numero.toLowerCase().includes(q) ||
        cli.toLowerCase().includes(q) ||
        (v.notas_libre ?? "").toLowerCase().includes(q) ||
        (v.metodo ?? "").toLowerCase().includes(q)
      )
    },
  })

  const totalPages = table.getPageCount()
  const pageIdx = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const filteredCount = table.getFilteredRowModel().rows.length

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* Toolbar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF1F4] bg-white px-5 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[#0F766E]" />
          <h2 className="text-sm font-semibold text-gray-900">
            Registros de venta
          </h2>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 tabular-nums">
            {filteredCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Buscar cliente, número, nota, método…"
              className="h-8 w-72 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-700 placeholder:text-gray-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100"
            />
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
                  <div className="border-b border-[rgba(15,23,42,0.04)] px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
                    Mostrar columnas
                  </div>
                  <ul className="max-h-72 overflow-y-auto py-1">
                    {table.getAllLeafColumns().map((col) => {
                      if (col.id === "acciones") return null
                      const def = col.columnDef
                      const label =
                        typeof def.header === "string"
                          ? def.header
                          : col.id.replace(/_/g, " ")
                      return (
                        <li key={col.id}>
                          <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                            <input
                              type="checkbox"
                              checked={col.getIsVisible()}
                              onChange={col.getToggleVisibilityHandler()}
                              className="size-3.5 accent-pink-600"
                            />
                            <span className="capitalize">{label}</span>
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

      {/* Table */}
      <div className="relative max-w-full overflow-auto">
        <table
          className="w-full text-sm"
          style={{ width: table.getTotalSize(), minWidth: "100%" }}
        >
          <thead className="sticky top-0 z-10 bg-[#F9FAFB] backdrop-blur-sm">
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
                  Sin resultados.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, i) => (
                <Fragment key={row.id}>
                  <tr
                    onClick={() => onRowClick?.(row.original)}
                    className={`group border-b border-[rgba(15,23,42,0.04)] transition-colors ${onRowClick ? "cursor-pointer" : ""} hover:bg-[rgba(15,118,110,0.03)]`}
                  >
                    {row.getVisibleCells().map((cell, idx) => {
                      const isFirst = idx === 0
                      return (
                        <td
                          key={cell.id}
                          style={{ width: cell.column.getSize() }}
                          className={`px-4 py-3 align-middle ${isFirst ? "sticky left-0 z-[1] bg-white group-hover:bg-[rgba(15,118,110,0.03)] shadow-[1px_0_0_0_#e5e7eb]" : ""}`}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      )
                    })}
                  </tr>
                  {row.getIsExpanded() && (
                    <tr className="border-b border-gray-200 bg-gradient-to-r from-amber-50/40 via-pink-50/20 to-teal-50/30">
                      <td
                        colSpan={row.getVisibleCells().length}
                        className="px-6 py-4"
                      >
                        <ExpandedRow venta={row.original} />
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
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gradient-to-r from-white to-gray-50/50 px-5 py-3 text-xs">
        <div className="flex items-center gap-2 text-gray-600">
          <span>
            {pageIdx * pageSize + 1}–
            {Math.min((pageIdx + 1) * pageSize, filteredCount)} de{" "}
            <strong className="tabular-nums text-gray-900">{filteredCount}</strong>
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
            <strong className="text-gray-900">{Math.max(1, totalPages)}</strong>
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
  )
}

function ExpandedRow({ venta }: { venta: EnrichedVenta }) {
  const total = Number(venta.total ?? 0)
  const sandra = Number(venta.sandra_monto ?? 0)
  const benjamin = Number(venta.benjamin_monto ?? 0)
  const sumSocios = sandra + benjamin
  const restante = total - sumSocios
  const cuadra = Math.abs(restante) < 0.05
  const utilNeta = Number(venta.utilidad_neta ?? 0)
  // Utilidad estimada por socio (proporcional al monto)
  const sandraUtil = sumSocios > 0 ? (sandra / sumSocios) * utilNeta : 0
  const benjaminUtil = sumSocios > 0 ? (benjamin / sumSocios) * utilNeta : 0
  const sandraPct = total > 0 ? (sandra / total) * 100 : 0
  const benjaminPct = total > 0 ? (benjamin / total) * 100 : 0
  const sandraCobr = venta.capital_recuperado * (sumSocios > 0 ? sandra / sumSocios : 0)
  const benjaminCobr = venta.capital_recuperado * (sumSocios > 0 ? benjamin / sumSocios : 0)

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Notas completas */}
      <div className="rounded-xl border border-amber-200/60 bg-white/80 p-4 shadow-sm backdrop-blur lg:col-span-1">
        <header className="mb-2 flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-amber-100 text-amber-700">
            <StickyNote className="size-3.5" />
          </span>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
            Notas completas
          </h4>
        </header>
        {venta.notas_libre ? (
          <p className="whitespace-pre-wrap rounded-lg bg-amber-50/60 p-3 text-xs leading-relaxed text-gray-800">
            {venta.notas_libre}
          </p>
        ) : (
          <p className="text-xs italic text-gray-400">Sin notas registradas.</p>
        )}
        {venta.metodo && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-[10.5px] font-medium text-gray-700">
            <Wallet className="size-3" />
            Método: <strong>{venta.metodo}</strong>
          </div>
        )}
      </div>

      {/* Reparto socios detalle */}
      <div className="rounded-xl border border-[#E7EAF0] bg-white p-4 shadow-sm lg:col-span-2">
        <header className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-[#F3F5F7] text-gray-600">
              <Users className="size-3.5" />
            </span>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">
              Reparto socios — editable inline
            </h4>
          </div>
          {cuadra ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 ring-1 ring-emerald-200/60">
              <CheckCircle2 className="size-2.5" />
              Cuadra al centavo
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${
                restante > 0
                  ? "bg-amber-50 text-amber-700 ring-amber-200/60"
                  : "bg-rose-50 text-rose-700 ring-rose-200/60"
              }`}
            >
              <AlertTriangle className="size-2.5" />
              Restante {mxn.format(restante)}
            </span>
          )}
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <SocioCard
            nombre="Sandra"
            ventaId={venta.id}
            socioId={SANDRA_ID}
            monto={sandra}
            pct={sandraPct}
            utilidad={sandraUtil}
            cobrado={sandraCobr}
            color="pink"
          />
          <SocioCard
            nombre="Benjamin"
            ventaId={venta.id}
            socioId={BENJAMIN_ID}
            monto={benjamin}
            pct={benjaminPct}
            utilidad={benjaminUtil}
            cobrado={benjaminCobr}
            color="teal"
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-gray-50/80 p-2 text-center text-[10.5px]">
          <div>
            <div className="font-semibold uppercase tracking-wider text-gray-500">
              Total venta
            </div>
            <div className="mt-0.5 font-bold text-gray-900 tabular-nums">
              {mxn.format(total)}
            </div>
          </div>
          <div>
            <div className="font-semibold uppercase tracking-wider text-gray-500">
              Suma socios
            </div>
            <div
              className={`mt-0.5 font-bold tabular-nums ${cuadra ? "text-emerald-700" : "text-amber-700"}`}
            >
              {mxn.format(sumSocios)}
            </div>
          </div>
          <div>
            <div className="font-semibold uppercase tracking-wider text-gray-500">
              Utilidad neta
            </div>
            <div className="mt-0.5 font-bold tabular-nums text-emerald-700">
              {mxn.format(utilNeta)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SocioCard({
  nombre,
  ventaId,
  socioId,
  monto,
  pct,
  utilidad,
  cobrado,
  color,
}: {
  nombre: string
  ventaId: string
  socioId: string
  monto: number
  pct: number
  utilidad: number
  cobrado: number
  color: "pink" | "teal"
}) {
  // Paleta neutra — el nombre del socio diferencia, no el color
  const cfg = {
    pink: {
      ring: "ring-[#E7EAF0]",
      bg: "bg-white",
      text: "text-gray-900",
      bar: "bg-[#0F766E]",
      bgClass: "bg-[#F3F5F7]",
    },
    teal: {
      ring: "ring-[#E7EAF0]",
      bg: "bg-white",
      text: "text-gray-900",
      bar: "bg-[#0F766E]",
      bgClass: "bg-[#F3F5F7]",
    },
  }[color]
  return (
    <div
      className={`rounded-lg ${cfg.bg} p-3 ring-1 ${cfg.ring}`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold ${cfg.text}`}>{nombre}</span>
        <EditableMonto
          ventaId={ventaId}
          socioId={socioId}
          monto={monto}
          textColor={cfg.text}
          bgColor={cfg.bgClass}
        />
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/70">
        <div
          className={`h-full rounded-full ${cfg.bar} transition-all`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px]">
        <Mini label="Particip." value={`${pct.toFixed(1)}%`} />
        <Mini label="Cobrado" value={mxn.format(cobrado)} />
        <Mini label="Utilidad" value={mxn.format(utilidad)} accent={cfg.text} />
      </div>
    </div>
  )
}

function Mini({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="rounded-md bg-white/70 px-1 py-0.5">
      <div className="text-[8.5px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div
        className={`text-[10px] font-semibold tabular-nums ${accent ?? "text-gray-900"}`}
      >
        {value}
      </div>
    </div>
  )
}

export type { EnrichedVenta }
