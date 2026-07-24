"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
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
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  Sparkles,
  Target,
  Trash2,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { cambiarEstatusCotizacion, eliminarCotizacion } from "./actions"
import { PageHeader } from "@/components/page-header"
import { formatMXN } from "@/lib/utils"
import { parseFecha } from "@/lib/fecha"

import {
  calcularProbabilidad,
  classifyEstadoComercial,
  type ClienteHist,
  type ProbResult,
} from "./lib-cotizacion-prob"

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
  created_at: string | null
  updated_at: string | null
  clientes: {
    id: string
    nombre: string
    nombre_negocio: string | null
    rfc: string | null
    ciudad: string | null
    vendedor_socio_id: string | null
    is_internal?: boolean | null
  } | null
}

export type VentaSummary = {
  id: string
  fecha: string
  total: number
  cotizacion_id: string | null
  cliente_id: string | null
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
  activas: number
  perdidas: number
  valorConvertido: number
  pipelinePotencial: number
  pendienteConvertir: number
  tasaConversion: number
  tiempoPromCierreDias: number
  ticketProm: number
  utilidadEstimada: number
}

export type EnrichedCot = CotizacionRow & {
  itemsCount: number
  piezasTotal: number
  margenNetoPct: number
  productNames: string
  esConvertida: boolean
  estadoComercial: ReturnType<typeof classifyEstadoComercial>
  prob: ProbResult
  ultimaActividadISO: string
}

const ESTATUS_OPTIONS: { value: Estatus; label: string }[] = [
  { value: "borrador", label: "Borrador" },
  { value: "enviada", label: "Enviada" },
  { value: "aceptada", label: "Aceptada" },
  { value: "rechazada", label: "Rechazada" },
  { value: "vencida", label: "Vencida" },
]

// Paleta diferenciada — cada estatus usa una familia de color distinta
// con dot indicator visible, mismo nivel de saturación, premium soft.
const ESTATUS_CONF: Record<
  Estatus,
  { label: string; bg: string; text: string; ring: string; dot: string }
> = {
  borrador: {
    label: "Borrador",
    bg: "bg-[#F1F5F9]", // slate-100
    text: "text-[#475569]", // slate-600
    ring: "ring-[#E2E8F0]",
    dot: "bg-[#94A3B8]", // slate-400
  },
  enviada: {
    label: "Enviada",
    bg: "bg-[#DBEAFE]", // blue-100
    text: "text-[#1D4ED8]", // blue-700
    ring: "ring-[#BFDBFE]",
    dot: "bg-[#3B82F6]", // blue-500
  },
  aceptada: {
    label: "Aceptada",
    bg: "bg-[#D1FAE5]", // emerald-100
    text: "text-[#047857]", // emerald-700
    ring: "ring-[#A7F3D0]",
    dot: "bg-[#10B981]", // emerald-500
  },
  rechazada: {
    label: "Rechazada",
    bg: "bg-[#FEE2E2]", // red-100
    text: "text-[#B91C1C]", // red-700
    ring: "ring-[#FECACA]",
    dot: "bg-[#EF4444]", // red-500
  },
  vencida: {
    label: "Vencida",
    bg: "bg-[#FEF3C7]", // amber-100
    text: "text-[#B45309]", // amber-700
    ring: "ring-[#FDE68A]",
    dot: "bg-[#F59E0B]", // amber-500
  },
}

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
        title="Cambiar estatus"
        aria-label="Cambiar estatus de la cotización"
        className={`cursor-pointer appearance-none rounded-full border-0 py-1 pl-5 pr-7 text-[11px] font-semibold tabular-nums ring-1 transition-all duration-180 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#0F766E]/30 ${conf.bg} ${conf.text} ${conf.ring} ${pending ? "opacity-60" : "hover:-translate-y-0.5 hover:shadow-[0_2px_6px_rgba(15,23,42,0.06)]"}`}
      >
        {ESTATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {/* Dot indicator (izquierda) */}
      <span
        className={`pointer-events-none absolute left-2 top-1/2 size-1.5 -translate-y-1/2 rounded-full ${conf.dot}`}
        aria-hidden
      />
      {/* Chevron (derecha) — más visible para que se vea editable */}
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-current opacity-70">
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3.5L4.5 6L7 3.5" />
          </svg>
        )}
      </span>
    </div>
  )
}

/**
 * Botones de acción rápida por fila.
 * - Ver / Editar: siempre visibles
 * - "Marcar Enviada": solo si estatus = borrador
 * - "Marcar Vendida" (= aceptada): si está enviada y NO tiene venta
 * - Pill "Con venta": cuando esConvertida (ya tiene venta vinculada)
 */
/**
 * Cluster minimalista de acciones por fila (Linear / Attio / Notion-style).
 * - Default: invisible (opacity-0)
 * - Aparece on row-hover (group-hover) y on focus-within (a11y)
 * - 3 íconos compactos: ↗ Ver · ✎ Editar · ⋯ Menu
 * - El menú tiene: Marcar enviada / vendida / Eliminar (condicionales)
 * - Si la cotización ya tiene venta (esConvertida), reemplaza todo
 *   el cluster por un indicador "Vendida" sutil (siempre visible).
 */
function ActionsCell({ cot }: { cot: EnrichedCot }) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Cerrar menú al click fuera
  useEffect(() => {
    if (!menuOpen) return
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [menuOpen])

  async function cambiar(nuevo: Estatus) {
    setPending(nuevo)
    const result = await cambiarEstatusCotizacion(cot.id, nuevo)
    setPending(null)
    if (!result.ok) {
      toast.error(result.error || "No se pudo cambiar")
      return
    }
    toast.success(
      nuevo === "enviada" ? "Marcada como enviada" : "Marcada como vendida",
    )
    router.refresh()
  }

  async function handleEliminar() {
    setPending("eliminar")
    const result = await eliminarCotizacion(cot.id)
    setPending(null)
    if (!result.ok) {
      toast.error(result.error || "No se pudo eliminar")
      return
    }
    toast.success("Cotización eliminada")
    setConfirmarEliminar(false)
    router.refresh()
  }

  const canSend = cot.estatus === "borrador"
  const canSell = cot.estatus === "borrador" || cot.estatus === "enviada"

  return (
    <>
      <div
        className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-180 group-hover:opacity-100 group-focus-within:opacity-100 [data-state=open]:opacity-100"
        data-state={menuOpen ? "open" : "closed"}
      >
        <Link
          href={`/cotizaciones/${cot.id}`}
          onClick={(e) => e.stopPropagation()}
          className="rounded-md p-1.5 text-gray-400 transition-all duration-180 hover:bg-[#F3F5F7] hover:text-gray-700"
          title="Ver detalle"
          aria-label="Ver detalle"
        >
          <ExternalLink className="size-4" strokeWidth={1.8} />
        </Link>
        <Link
          href={`/cotizaciones/${cot.id}/editar`}
          onClick={(e) => e.stopPropagation()}
          className="rounded-md p-1.5 text-gray-400 transition-all duration-180 hover:bg-[#F3F5F7] hover:text-gray-700"
          title="Editar"
          aria-label="Editar"
        >
          <Pencil className="size-4" strokeWidth={1.8} />
        </Link>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((o) => !o)
            }}
            className={`rounded-md p-1.5 text-gray-400 transition-all duration-180 hover:bg-[#F3F5F7] hover:text-gray-700 ${menuOpen ? "bg-[#F3F5F7] text-gray-700" : ""}`}
            title="Más acciones"
            aria-label="Más acciones"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.8} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-[rgba(15,23,42,0.06)] bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.10),0_2px_4px_rgba(15,23,42,0.04)]"
              onClick={(e) => e.stopPropagation()}
            >
              {canSend && (
                <ActionMenuItem
                  icon={<Send className="size-3.5" strokeWidth={1.8} />}
                  loading={pending === "enviada"}
                  onClick={() => {
                    setMenuOpen(false)
                    void cambiar("enviada")
                  }}
                >
                  Marcar enviada
                </ActionMenuItem>
              )}
              {canSell && (
                <ActionMenuItem
                  icon={<CheckCircle2 className="size-3.5" strokeWidth={1.8} />}
                  loading={pending === "aceptada"}
                  onClick={() => {
                    setMenuOpen(false)
                    void cambiar("aceptada")
                  }}
                >
                  Marcar vendida
                </ActionMenuItem>
              )}
              {(canSend || canSell) && (
                <div className="my-1 h-px bg-[rgba(15,23,42,0.04)]" />
              )}
              <ActionMenuItem
                icon={<Trash2 className="size-3.5" strokeWidth={1.8} />}
                tone="danger"
                onClick={() => {
                  setMenuOpen(false)
                  setConfirmarEliminar(true)
                }}
              >
                Eliminar
              </ActionMenuItem>
            </div>
          )}
        </div>
      </div>

      {confirmarEliminar && (
        <ConfirmDeleteModal
          numero={cot.numero}
          loading={pending === "eliminar"}
          onCancel={() => setConfirmarEliminar(false)}
          onConfirm={handleEliminar}
        />
      )}
    </>
  )
}

function ActionMenuItem({
  icon,
  children,
  loading,
  tone = "default",
  onClick,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  loading?: boolean
  tone?: "default" | "danger"
  onClick: () => void
}) {
  const toneClass =
    tone === "danger"
      ? "text-rose-600 hover:bg-rose-50"
      : "text-gray-700 hover:bg-[#F3F5F7]"
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={loading}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium transition-colors ${toneClass} disabled:opacity-50`}
    >
      <span className="text-gray-400">{icon}</span>
      <span className="flex-1">{children}</span>
      {loading && <Loader2 className="size-3 animate-spin text-gray-400" />}
    </button>
  )
}

function ConfirmDeleteModal({
  numero,
  loading,
  onCancel,
  onConfirm,
}: {
  numero: string
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white p-6 shadow-[0_24px_48px_rgba(15,23,42,0.16)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-rose-50">
          <Trash2 className="size-6 text-rose-500" />
        </div>
        <h3 className="mb-1 text-center text-base font-bold text-gray-900">
          ¿Eliminar cotización?
        </h3>
        <p className="mb-1 text-center font-mono text-sm font-semibold text-gray-700">
          {numero}
        </p>
        <p className="mb-5 text-center text-xs text-gray-400">
          Esta acción no se puede deshacer. Se eliminarán también todos sus
          productos.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-[rgba(15,23,42,0.06)] py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-[#F9FAFB]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <>
                <div className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Eliminando…
              </>
            ) : (
              <>
                <Trash2 className="size-3.5" />
                Eliminar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export function CotizacionesList({
  cotizaciones,
  clientes,
  items,
  ventas,
  kpis,
  error,
}: {
  cotizaciones: CotizacionRow[]
  clientes: ClienteOption[]
  items: CotItemRow[]
  ventas: VentaSummary[]
  kpis: KpisGlobales
  error: string | null
}) {
  const router = useRouter()
  const today = useMemo(() => new Date(), [])

  // ─── Historiales por cliente para probabilidad ────────────────
  const clienteHistMap = useMemo(() => {
    const map = new Map<string, ClienteHist>()
    const cotIdsConVenta = new Set(
      ventas.map((v) => v.cotizacion_id).filter((x): x is string => !!x),
    )
    // Inicializar
    for (const c of cotizaciones) {
      if (!c.cliente_id) continue
      const cur = map.get(c.cliente_id) ?? {
        ventasCount: 0,
        cotsCount: 0,
        cotsConvertidasCount: 0,
      }
      cur.cotsCount += 1
      if (cotIdsConVenta.has(c.id)) cur.cotsConvertidasCount += 1
      map.set(c.cliente_id, cur)
    }
    for (const v of ventas) {
      if (!v.cliente_id) continue
      const cur = map.get(v.cliente_id) ?? {
        ventasCount: 0,
        cotsCount: 0,
        cotsConvertidasCount: 0,
      }
      cur.ventasCount += 1
      map.set(v.cliente_id, cur)
    }
    return map
  }, [cotizaciones, ventas])

  const cotIdsConVenta = useMemo(
    () =>
      new Set(
        ventas.map((v) => v.cotizacion_id).filter((x): x is string => !!x),
      ),
    [ventas],
  )

  // ─── Enrichment con conteos + probabilidad + estado comercial ───
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
      const esConvertida = cotIdsConVenta.has(c.id)
      const cliHist = c.cliente_id
        ? (clienteHistMap.get(c.cliente_id) ?? null)
        : null
      const prob = calcularProbabilidad(c, today, cliHist, esConvertida)
      const estadoComercial = classifyEstadoComercial(
        c.estatus,
        esConvertida,
        prob.diasParaVencer,
      )
      const ultimaActividadISO = c.updated_at ?? c.created_at ?? c.fecha
      return {
        ...c,
        itemsCount: its.length,
        piezasTotal: piezas,
        margenNetoPct: margen,
        productNames,
        esConvertida,
        estadoComercial,
        prob,
        ultimaActividadISO,
      }
    })
  }, [cotizaciones, items, cotIdsConVenta, clienteHistMap, today])

  // ─── Series mensuales para charts ────────────────────────────────
  const monthlySeries = useMemo(() => {
    const months: {
      key: string
      label: string
      conversiones: number
      valorConvertido: number
      cotsCreadas: number
      pipelineCreado: number
    }[] = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
      months.push({
        key,
        label: `${meses[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        conversiones: 0,
        valorConvertido: 0,
        cotsCreadas: 0,
        pipelineCreado: 0,
      })
    }
    const idx = new Map(months.map((m, i) => [m.key, i]))
    for (const v of ventas) {
      const k = v.fecha.slice(0, 7)
      const i = idx.get(k)
      if (i === undefined) continue
      months[i].conversiones += 1
      months[i].valorConvertido += v.total
    }
    for (const c of cotizaciones) {
      const k = c.fecha.slice(0, 7)
      const i = idx.get(k)
      if (i === undefined) continue
      months[i].cotsCreadas += 1
      months[i].pipelineCreado += Number(c.total ?? 0)
    }
    return months
  }, [ventas, cotizaciones])

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
  // Default: Fecha, Número, Cliente, Total, Estado, Estatus BD, Acciones.
  // Resto togglable desde menú "Columnas".
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
    ultimaActividad: false,
    diasAbierta: false,
    probabilidad: false,
    estatus: false, // BD original — uso estadoComercial computado
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
            {fechaFmt.format(parseFecha(getValue() as string))}
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
              ? "text-[#DC2626]"
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
        cell: ({ getValue, row }) => {
          const numero = getValue() as string
          const isPortal = numero.includes("-P-Portal")
          return (
            <div className="flex items-center gap-1.5">
              <Link
                href={`/cotizaciones/${row.original.id}`}
                className="font-mono text-xs text-teal-700 transition hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {numero}
              </Link>
              {isPortal && (
                <span
                  className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-700"
                  title="Pedido recibido desde el portal público /order"
                >
                  Portal
                </span>
              )}
            </div>
          )
        },
        size: 220,
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
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-gray-900">
                  {c.nombre_negocio ?? c.nombre}
                </span>
                {c.is_internal && (
                  <span
                    className="shrink-0 rounded-full bg-gray-200 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-gray-700"
                    title="Movimiento interno — no cuenta en KPIs financieros"
                  >
                    🏠 Interno
                  </span>
                )}
              </div>
              {c.nombre_negocio && (
                <div className="truncate text-[10px] text-gray-500">
                  {c.nombre}
                </div>
              )}
            </div>
          )
        },
        size: 240,
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
            {formatMXN(Number(getValue() ?? 0))}
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
            <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-[#DC2626] tabular-nums">
              − {formatMXN(v)}
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
                + {formatMXN(v)}
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
            {formatMXN(Number(getValue() ?? 0))}
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
                : "text-[#DC2626] bg-rose-50 ring-rose-200/60"
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
        id: "estadoComercial",
        accessorFn: (c) => c.estadoComercial,
        header: (ctx) => <HeaderCell label="Estado" ctx={ctx} />,
        // Vendida (con venta vinculada) → badge fijo. Resto → dropdown editable.
        cell: ({ row }) =>
          row.original.esConvertida ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200/60"
              title="Cotización vendida (tiene venta vinculada). Para revertirla, abre el detalle."
            >
              <CheckCircle2 className="size-3" strokeWidth={2.25} />
              Vendida
            </span>
          ) : (
            <StatusCell cotId={row.original.id} estatus={row.original.estatus} />
          ),
        size: 150,
      },
      {
        id: "probabilidad",
        accessorFn: (c) => c.prob.score,
        header: (ctx) => <HeaderCell label="Probabilidad" ctx={ctx} align="right" />,
        cell: ({ row }) => <ProbabilidadCell prob={row.original.prob} />,
        size: 130,
      },
      {
        id: "diasAbierta",
        accessorFn: (c) => c.prob.diasAbierta,
        header: (ctx) => <HeaderCell label="Días abierta" ctx={ctx} align="right" />,
        cell: ({ row }) => {
          const d = row.original.prob.diasAbierta
          const tone =
            d < 7
              ? "text-emerald-700"
              : d < 21
                ? "text-amber-700"
                : "text-[#DC2626]"
          return (
            <span className={`text-xs font-medium tabular-nums ${tone}`}>
              {d}d
            </span>
          )
        },
        size: 100,
      },
      {
        id: "ultimaActividad",
        accessorFn: (c) => c.ultimaActividadISO,
        header: (ctx) => (
          <HeaderCell label="Última actividad" ctx={ctx} align="right" />
        ),
        cell: ({ row }) => (
          <span className="text-[10.5px] text-gray-500 tabular-nums">
            {fechaFmt.format(parseFecha(row.original.ultimaActividadISO))}
          </span>
        ),
        size: 130,
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
          <ActionsCell cot={row.original} />
        ),
        enableSorting: false,
        enableResizing: false,
        size: 100,
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

  // Trends mes actual vs mes anterior (último vs penúltimo mes de monthlySeries)
  const len = monthlySeries.length
  const cur = monthlySeries[len - 1]
  const prev = monthlySeries[len - 2]
  const pct = (a: number, b: number) =>
    b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100
  const dValor = cur && prev ? pct(cur.valorConvertido, prev.valorConvertido) : 0
  const dConv = cur && prev ? pct(cur.conversiones, prev.conversiones) : 0
  const ticketCurr = cur && cur.conversiones > 0 ? cur.valorConvertido / cur.conversiones : 0
  const ticketPrev = prev && prev.conversiones > 0 ? prev.valorConvertido / prev.conversiones : 0
  const dTicket = pct(ticketCurr, ticketPrev)

  return (
    <div className="space-y-8 p-8">
      <PageHeader
        title="Cotizaciones"
        subtitle={`${kpis.totalCotizaciones} cotizaciones · ${kpis.convertidas} convertidas · ${kpis.activas} activas · ${kpis.perdidas} perdidas`}
        kpis={[
          {
            label: "Valor convertido",
            value: formatMXN(kpis.valorConvertido),
            sub: `Cobrado en ${kpis.convertidas} ventas`,
            trend: {
              value: `${dValor >= 0 ? "+" : ""}${dValor.toFixed(1)}%`,
              positive: dValor >= 0,
            },
            sparkline: monthlySeries.map((m) => m.valorConvertido),
          },
          {
            label: "Tasa conversión",
            value: `${kpis.tasaConversion.toFixed(1)}%`,
            sub: "del total enviado",
            trend: {
              value: `${dConv >= 0 ? "+" : ""}${dConv.toFixed(1)}%`,
              positive: dConv >= 0,
            },
            sparkline: monthlySeries.map((m) => m.conversiones),
          },
          {
            label: "Tiempo cierre",
            value: `${Math.round(kpis.tiempoPromCierreDias)}d`,
            sub: "promedio",
          },
          {
            label: "Ticket promedio",
            value: formatMXN(kpis.ticketProm),
            sub: "por cotización convertida",
            trend: {
              value: `${dTicket >= 0 ? "+" : ""}${dTicket.toFixed(1)}%`,
              positive: dTicket >= 0,
            },
            sparkline: monthlySeries.map((m) =>
              m.conversiones > 0 ? m.valorConvertido / m.conversiones : 0,
            ),
          },
        ]}
        actions={
          <Link
            href="/cotizaciones/nueva"
            className="inline-flex items-center gap-2 rounded-[14px] bg-[#0F766E] px-[18px] py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#115E59]"
          >
            <Plus className="size-4" />
            Nueva cotización
          </Link>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPIs secundarios — pipeline, oportunidades, perdidas */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          label="Pipeline potencial"
          value={formatMXN(kpis.pipelinePotencial)}
          sub={`${kpis.activas} cotizaciones activas`}
          icon={<Target className="size-4" />}
        />
        <Kpi
          label="Pendiente de convertir"
          value={formatMXN(kpis.pendienteConvertir)}
          sub="Enviadas vigentes en seguimiento"
          icon={<Wallet className="size-4" />}
        />
        <Kpi
          label="Convertidas"
          value={kpis.convertidas.toString()}
          sub={`${kpis.totalCotizaciones} cotizaciones totales`}
          icon={<Zap className="size-4" />}
        />
        <Kpi
          label="Perdidas"
          value={kpis.perdidas.toString()}
          sub="Rechazadas o vencidas"
          accent="danger"
          icon={<XCircle className="size-4" />}
        />
      </section>

      {/* Charts: conversiones por mes + valor convertido vs pipeline */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <header className="mb-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Conversiones por mes
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-500">
              # de ventas cerradas vs cotizaciones creadas
            </p>
          </header>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={monthlySeries}
              margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
              barCategoryGap="32%"
            >
              <defs>
                <linearGradient id="cotsBarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0F766E" stopOpacity={0.92} />
                  <stop offset="100%" stopColor="#0F766E" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
              <Tooltip
                cursor={{ fill: "rgba(15,118,110,0.04)" }}
                contentStyle={{
                  border: "1px solid rgba(15,23,42,0.06)",
                  borderRadius: 12,
                  fontSize: 12,
                  boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar dataKey="cotsCreadas" name="Cotizaciones creadas" fill="#CBD5E1" radius={[12, 12, 4, 4]} barSize={22} opacity={0.92} />
              <Bar dataKey="conversiones" name="Convertidas en venta" fill="url(#cotsBarGradient)" radius={[12, 12, 4, 4]} barSize={22} opacity={0.92} />
            </BarChart>
          </ResponsiveContainer>
        </article>
        <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <header className="mb-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Valor convertido vs Pipeline
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-500">
              MXN cobrado real (verde) y en cotizaciones (línea)
            </p>
          </header>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart
              data={monthlySeries}
              margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="gradValorConvertido" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0F766E" stopOpacity={0.92} />
                  <stop offset="100%" stopColor="#0F766E" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
                }
                width={50}
              />
              <Tooltip
                cursor={{ fill: "rgba(15,118,110,0.04)" }}
                contentStyle={{
                  border: "1px solid rgba(15,23,42,0.06)",
                  borderRadius: 12,
                  fontSize: 12,
                  boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
                }}
                formatter={(v) =>
                  typeof v === "number" ? formatMXN(v) : String(v)
                }
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar
                dataKey="valorConvertido"
                name="Valor convertido"
                fill="url(#gradValorConvertido)"
                radius={[12, 12, 4, 4]}
                barSize={22}
                opacity={0.92}
              />
              <Line
                type="monotone"
                dataKey="pipelineCreado"
                name="Pipeline creado"
                stroke="#94A3B8"
                strokeWidth={2.2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </article>
      </section>

      {/* Filtros */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.04)] px-5 py-3">
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
                className="text-[11px] font-medium text-[#DC2626] hover:text-rose-800"
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
                className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-700 placeholder:text-gray-400 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#DFF7F4]"
              />
            </div>
            <select
              value={estatusFiltro}
              onChange={(e) =>
                setEstatusFiltro(e.target.value as "todos" | Estatus)
              }
              className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-700 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#DFF7F4]"
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
              className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-700 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#DFF7F4]"
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
                  className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 placeholder:text-gray-400 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#DFF7F4]"
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
                  className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#DFF7F4]"
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
                  className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#DFF7F4]"
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
                    className="h-8 w-1/2 rounded-lg border border-gray-200 bg-white px-2 text-xs tabular-nums focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#DFF7F4]"
                  />
                  <input
                    type="number"
                    placeholder="max"
                    value={montoMax}
                    onChange={(e) => setMontoMax(e.target.value)}
                    className="h-8 w-1/2 rounded-lg border border-gray-200 bg-white px-2 text-xs tabular-nums focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#DFF7F4]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Tabla */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-[rgba(15,23,42,0.04)] bg-gradient-to-r from-white to-gray-50/50 px-5 py-3">
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
                  <div className="border-b border-[rgba(15,23,42,0.04)] px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
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
                    className={`group cursor-pointer border-b border-[rgba(15,23,42,0.04)] transition-colors hover:bg-[rgba(15,118,110,0.03)]`}
                  >
                    {row.getVisibleCells().map((cell, idx) => {
                      const isFirst = idx === 0
                      return (
                        <td
                          key={cell.id}
                          style={{ width: cell.column.getSize() }}
                          className={`px-4 py-3 align-middle ${isFirst ? "sticky left-0 z-[1] bg-white group-hover:bg-[rgba(15,118,110,0.03)] shadow-[1px_0_0_0_#e5e7eb]" : ""}`}
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
  accent = "neutral",
  icon,
}: {
  label: string
  value: string
  sub?: string
  accent?: "neutral" | "danger"
  icon?: React.ReactNode
}) {
  const valueColor = accent === "danger" ? "text-[#DC2626]" : "text-gray-900"
  const iconColor = accent === "danger" ? "text-[#DC2626]" : "text-gray-400"
  return (
    <article className="rounded-2xl border border-[#E7EAF0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-1.5 text-gray-500">
        <span className={iconColor}>{icon}</span>
        <span className="text-[11px] font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums tracking-[-0.02em] ${valueColor}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-gray-500">{sub}</div>}
    </article>
  )
}

function ProbabilidadCell({ prob }: { prob: ProbResult }) {
  const { score, label } = prob
  if (label === "convertida")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
        ✓ 100%
      </span>
    )
  if (label === "perdida")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-[#DC2626]">
        Perdida
      </span>
    )
  const tone =
    label === "alta"
      ? "bg-emerald-100 text-emerald-700"
      : label === "media"
        ? "bg-amber-100 text-amber-700"
        : "bg-gray-100 text-gray-600"
  return (
    <div className="flex items-center justify-end gap-2">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${tone}`}
      >
        {label}
      </span>
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full ${
            label === "alta"
              ? "bg-emerald-500"
              : label === "media"
                ? "bg-amber-500"
                : "bg-gray-400"
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="w-7 text-right text-[10.5px] font-semibold tabular-nums text-gray-700">
        {score}
      </span>
    </div>
  )
}
