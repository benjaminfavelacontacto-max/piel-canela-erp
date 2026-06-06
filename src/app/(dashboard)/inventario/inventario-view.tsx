"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
  Search,
  Package,
  Sparkles,
  RefreshCw,
  X,
  Pencil,
  Plus,
} from "lucide-react"
import { ProductDrawer } from "./product-drawer"
import { ProductEditModal } from "./product-edit-modal"
import { ProductCreateModal, type Opcion } from "./product-create-modal"
import { PageHeader } from "@/components/page-header"
import { InventoryStats } from "./inventory-stats"
import { actualizarTipoCambio } from "./actions"
import { ImageUpload } from "./image-upload"

export type ProductoSales = {
  ventas: Array<{
    venta_id: string
    venta_numero: string
    fecha: string
    cliente: string | null
    cantidad: number
    precio_unitario: number
    subtotal: number
  }>
  monthly: Array<{ mes: string; cantidad: number; revenue: number }>
}

export type ProductoEnriquecido = {
  id: string
  sku: string
  nombre: string
  nombre_display: string | null
  peso: string | null
  imagen_url: string | null
  categoria: string
  proveedor: string | null
  precio_publico: number | null
  costo_unitario_prom: number | null
  stock_actual: number
  stock_minimo: number
  estatus: "ok" | "bajo" | "agotado"
  unidades_vendidas: number
  valor_inventario: number | null
  capital_invertido: number | null
  margen_pct: number | null
  // Campos USD/MXN desde vista_inventario
  precio_usd: number | null
  precio_mxn_calculado: number | null
  costo_envio_usd: number | null
  costo_envio_mxn: number | null
  costo_total_usd: number | null
  costo_total_mxn: number | null
  tipo_cambio: number | null
  profit_unitario: number | null
  updated_at: string | null
  activo: boolean
}

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const mxn2 = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const categoriaBadgeColor: Record<string, string> = {
  ACTIVADORES: "bg-teal-100 text-teal-700",
  POTENCIADORES: "bg-emerald-100 text-emerald-700",
  CINTAS: "bg-orange-100 text-orange-700",
  "EMULSIÓN REVELADORA": "bg-blue-100 text-blue-700",
  "POLVO DE BLANQUEAR": "bg-purple-100 text-purple-700",
  EXFOLIANTS: "bg-[#DFF7F4] text-[#0F766E]",
  HUMECTANTES: "bg-indigo-100 text-indigo-700",
  "ACEITE CORPORAL": "bg-amber-100 text-amber-700",
  AEROGRAFÍA: "bg-red-100 text-red-700",
  "DYE COLOR": "bg-cyan-100 text-cyan-700",
  OTROS: "bg-gray-100 text-gray-600",
}
function categoriaClass(c: string): string {
  return categoriaBadgeColor[c.toUpperCase()] ?? "bg-gray-100 text-gray-600"
}

const CATEGORIA_COLOR: Record<string, { bg: string; text: string }> = {
  ACTIVADORES: { bg: "rgba(15,118,110,0.10)", text: "#0F766E" },
  POTENCIADORES: { bg: "rgba(5,150,105,0.10)", text: "#047857" },
  CINTAS: { bg: "rgba(217,119,6,0.10)", text: "#B45309" },
  "EMULSIÓN REVELADORA": { bg: "rgba(37,99,235,0.10)", text: "#1D4ED8" },
  "POLVO DE BLANQUEAR": { bg: "rgba(147,51,234,0.10)", text: "#7E22CE" },
  EXFOLIANTS: { bg: "rgba(15,118,110,0.08)", text: "#0F766E" },
  HUMECTANTES: { bg: "rgba(99,102,241,0.10)", text: "#4F46E5" },
  "ACEITE CORPORAL": { bg: "rgba(217,119,6,0.10)", text: "#B45309" },
  AEROGRAFÍA: { bg: "rgba(220,38,38,0.10)", text: "#B91C1C" },
  "DYE COLOR": { bg: "rgba(8,145,178,0.10)", text: "#0E7490" },
  SHAMPOO: { bg: "rgba(220,38,127,0.10)", text: "#BE185D" },
  OTROS: { bg: "rgba(100,116,139,0.10)", text: "#475569" },
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
}

function fuzzyMatch(q: string, p: ProductoEnriquecido): boolean {
  if (!q) return true
  const qn = norm(q.trim())
  if (!qn) return true
  const haystacks = [
    p.sku,
    p.nombre,
    p.nombre_display ?? "",
    p.categoria,
    p.proveedor ?? "",
  ]
    .map(norm)
    .join(" ")
  // todos los tokens del query deben aparecer (orden libre)
  return qn.split(/\s+/).every((tok) => haystacks.includes(tok))
}

type SortKey =
  | "nombre"
  | "categoria"
  | "peso"
  | "sku"
  | "stock_actual"
  | "stock_minimo"
  | "precio_publico"
  | "precio_usd"
  | "precio_mxn_calculado"
  | "costo_total_usd"
  | "costo_total_mxn"
  | "profit_unitario"
  | "valor_inventario"
  | "unidades_vendidas"
  | "margen_pct"
type SortDir = "asc" | "desc"

const ESTATUS_OPTIONS = [
  { value: "", label: "Todos los estatus" },
  { value: "ok", label: "Con stock" },
  { value: "bajo", label: "Stock bajo" },
  { value: "agotado", label: "Agotados" },
] as const

export function InventarioView({
  productos,
  categorias,
  proveedores,
  categoriaOptions,
  proveedorOptions,
  sales,
  error,
  initialSku = null,
}: {
  productos: ProductoEnriquecido[]
  categorias: string[]
  proveedores: string[]
  categoriaOptions: Opcion[]
  proveedorOptions: Opcion[]
  sales: Record<string, ProductoSales>
  error: string | null
  initialSku?: string | null
}) {
  // Deep-link: ?producto=<sku> abre el drawer de ese producto al entrar
  const [selectedSku, setSelectedSku] = useState<string | null>(initialSku)
  const selected = useMemo(
    () => productos.find((p) => p.sku === selectedSku) ?? null,
    [productos, selectedSku],
  )
  const [editSku, setEditSku] = useState<string | null>(null)
  const editing = useMemo(
    () => productos.find((p) => p.sku === editSku) ?? null,
    [productos, editSku],
  )
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [estatusF, setEstatusF] = useState("")
  const [categoriaF, setCategoriaF] = useState("")
  const [proveedorF, setProveedorF] = useState("")
  const [topSellersOnly, setTopSellersOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("nombre")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  // ── Anchos manuales de columna (persistidos en localStorage) ──
  const DEFAULT_COL_WIDTHS = [50, 100, 55, 160, 110, 100, 75, 90, 70, 85, 90, 80, 90, 90, 55, 96]
  const COL_WIDTHS_KEY = "inventario-col-widths-v2"
  const MIN_COL_WIDTH = 40
  const [colWidths, setColWidths] = useState<number[]>(DEFAULT_COL_WIDTHS)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COL_WIDTHS_KEY)
      if (!raw) return
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length === DEFAULT_COL_WIDTHS.length) {
        setColWidths(arr.map((n) => Math.max(MIN_COL_WIDTH, Number(n) || 0)))
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const persistColWidths = (next: number[]) => {
    setColWidths(next)
    try { localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(next)) } catch {}
  }
  const setColWidth = (i: number, w: number) => {
    const next = [...colWidths]
    next[i] = Math.max(MIN_COL_WIDTH, w)
    persistColWidths(next)
  }
  const resetColWidth = (i: number) => {
    const next = [...colWidths]
    next[i] = DEFAULT_COL_WIDTHS[i]
    persistColWidths(next)
  }
  const tableRef = useRef<HTMLElement>(null)
  const handleCategoriaClick = (cat: string, isActive: boolean) => {
    setCategoriaF(isActive ? "" : cat)
    if (!isActive) {
      // Si seleccionas una categoría, scroll a la tabla
      setTimeout(() => {
        tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 100)
    }
  }
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(k)
      // Default: numeric desc, alpha asc
      setSortDir(
        ["nombre", "categoria", "peso", "sku"].includes(k) ? "asc" : "desc",
      )
    }
  }

  // Top sellers IDs (top 20 by unidades_vendidas)
  const topSellersSet = useMemo(() => {
    const sorted = [...productos]
      .filter((p) => p.unidades_vendidas > 0)
      .sort((a, b) => b.unidades_vendidas - a.unidades_vendidas)
      .slice(0, 20)
    return new Set(sorted.map((p) => p.sku))
  }, [productos])

  const filtered = useMemo(() => {
    let list = productos
    if (search) list = list.filter((p) => fuzzyMatch(search, p))
    if (estatusF) list = list.filter((p) => p.estatus === estatusF)
    if (categoriaF) list = list.filter((p) => p.categoria === categoriaF)
    if (proveedorF) list = list.filter((p) => p.proveedor === proveedorF)
    if (topSellersOnly) list = list.filter((p) => topSellersSet.has(p.sku))
    return list
  }, [
    productos,
    search,
    estatusF,
    categoriaF,
    proveedorF,
    topSellersOnly,
    topSellersSet,
  ])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      const av = a[sortKey] as number | string | null
      const bv = b[sortKey] as number | string | null
      const aN = av == null ? -Infinity : typeof av === "number" ? av : 0
      const bN = bv == null ? -Infinity : typeof bv === "number" ? bv : 0
      if (typeof av === "string" && typeof bv === "string") {
        const cmp = av.localeCompare(bv, "es")
        return sortDir === "asc" ? cmp : -cmp
      }
      return sortDir === "asc" ? aN - bN : bN - aN
    })
    return copy
  }, [filtered, sortKey, sortDir])

  // KPIs
  const kpis = useMemo(() => {
    const totalProds = productos.length
    const valor = productos.reduce(
      (s, p) => s + (p.valor_inventario ?? 0),
      0,
    )
    const capital = productos.reduce(
      (s, p) => s + (p.capital_invertido ?? 0),
      0,
    )
    const utilidadPotencial = valor - capital
    const itemsDisponibles = productos.reduce(
      (s, p) => s + (p.stock_actual ?? 0),
      0,
    )
    const skusConStock = productos.filter((p) => p.stock_actual > 0).length
    const itemsCintas = productos.reduce(
      (s, p) =>
        s + (p.categoria.toUpperCase() === "CINTAS" ? p.stock_actual ?? 0 : 0),
      0,
    )
    const itemsOtros = itemsDisponibles - itemsCintas
    const agotados = productos.filter((p) => p.estatus === "agotado").length
    const criticos = productos.filter((p) => p.estatus === "bajo").length
    const sinMovimiento = productos.filter(
      (p) => p.unidades_vendidas === 0,
    ).length
    return {
      totalProds,
      valor,
      capital,
      utilidadPotencial,
      itemsDisponibles,
      skusConStock,
      itemsCintas,
      itemsOtros,
      agotados,
      criticos,
      sinMovimiento,
    }
  }, [productos])

  // Sumatorias para tfoot (basadas en filas filtradas+ordenadas)
  const totals = useMemo(() => {
    let stock = 0,
      ventas = 0,
      costoUSD = 0,
      costoMXN = 0,
      costoEnvUSD = 0,
      costoEnvMXN = 0,
      profitTotal = 0
    for (const p of filtered) {
      const s = p.stock_actual ?? 0
      const tc = p.tipo_cambio ?? 20.7
      const pUsd = p.precio_usd ?? 0
      stock += s
      ventas += p.unidades_vendidas ?? 0
      costoUSD += pUsd * s
      costoMXN += pUsd * tc * s
      costoEnvUSD += (p.costo_total_usd ?? 0) * s
      costoEnvMXN += (p.costo_total_mxn ?? 0) * s
      profitTotal += (p.profit_unitario ?? 0) * s
    }
    return { stock, ventas, costoUSD, costoMXN, costoEnvUSD, costoEnvMXN, profitTotal }
  }, [filtered])

  // Categorías con conteo de SKUs (top primero)
  const categoriasConteo = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of productos) {
      const k = (p.categoria ?? "OTROS").toUpperCase()
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([nombre, count]) => ({ nombre, count }))
      .sort((a, b) => b.count - a.count)
  }, [productos])

  // Dashboard por tipo: stock + SKUs + costo invertido + profit por categoría
  const stockPorCategoria = useMemo(() => {
    type Agg = {
      categoria: string
      totalSKUs: number
      skusConStock: number
      stockTotal: number
      costoMXN: number
      profitTotal: number
      vendidas: number
    }
    const map = new Map<string, Agg>()
    for (const p of productos) {
      const k = (p.categoria ?? "OTROS").toUpperCase()
      const a = map.get(k) ?? {
        categoria: k,
        totalSKUs: 0,
        skusConStock: 0,
        stockTotal: 0,
        costoMXN: 0,
        profitTotal: 0,
        vendidas: 0,
      }
      const stock = p.stock_actual ?? 0
      a.totalSKUs += 1
      if (stock > 0) a.skusConStock += 1
      a.stockTotal += stock
      a.costoMXN += (p.costo_total_mxn ?? 0) * stock
      a.profitTotal += (p.profit_unitario ?? 0) * stock
      a.vendidas += p.unidades_vendidas ?? 0
      map.set(k, a)
    }
    return Array.from(map.values()).sort((a, b) => b.stockTotal - a.stockTotal)
  }, [productos])

  function clearFilters() {
    setSearch("")
    setEstatusF("")
    setCategoriaF("")
    setProveedorF("")
    setTopSellersOnly(false)
  }
  const hasFilters =
    !!search ||
    !!estatusF ||
    !!categoriaF ||
    !!proveedorF ||
    topSellersOnly

  // Tipo de cambio vigente (usar el valor más reciente entre los productos)
  const tcVigente = useMemo(() => {
    const valores = productos
      .map((p) => p.tipo_cambio)
      .filter((v): v is number => v != null && v > 0)
    if (valores.length === 0) return 20.7
    // mediana para resistir outliers
    const sorted = [...valores].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }, [productos])

  // Esc clears search focus
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (document.activeElement instanceof HTMLInputElement) {
          ;(document.activeElement as HTMLInputElement).blur()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="space-y-6" style={{ padding: "28px 32px" }}>
      <PageHeader
        title="Inventario"
        subtitle={`${productos.length} productos · ${categorias.length} categorías`}
        icon={<Package className="size-5" />}
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F766E] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0c635c]"
          >
            <Plus className="size-4" />
            Nuevo producto
          </button>
        }
      />

      <InventoryStats
        totalProductos={kpis.totalProds}
        totalSkus={kpis.skusConStock}
        valorInventario={kpis.valor}
        capitalInvertido={kpis.capital}
        utilidadPotencial={kpis.utilidadPotencial}
        margenPct={
          kpis.valor > 0 ? (kpis.utilidadPotencial / kpis.valor) * 100 : 0
        }
        stockCritico={kpis.agotados + kpis.criticos}
        agotados={kpis.agotados}
        stockBajo={kpis.criticos}
        categorias={categoriasConteo}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Dashboard por tipo: stock por categoría */}
      <section
        className="rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white p-5 shadow-sm"
        style={{ marginTop: 32 }}
      >
        <div
          className="flex flex-wrap items-end justify-between gap-2"
          style={{ marginBottom: 16 }}
        >
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[#0F172A]">
              Stock por categoría
            </h2>
            <p className="text-[11.5px] text-[#64748B]">
              Click en una categoría para filtrar la tabla · {stockPorCategoria.length} categorías
            </p>
          </div>
          {categoriaF && (
            <button
              type="button"
              onClick={() => setCategoriaF("")}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11.5px] font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900"
            >
              ✕ Quitar filtro: {categoriaF}
            </button>
          )}
        </div>
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          style={{ marginTop: 16 }}
        >
          {stockPorCategoria.map((c) => {
            const isActive = categoriaF === c.categoria
            const palette = CATEGORIA_COLOR[c.categoria] ?? CATEGORIA_COLOR.OTROS
            const pctSkusConStock =
              c.totalSKUs > 0 ? (c.skusConStock / c.totalSKUs) * 100 : 0
            return (
              <button
                key={c.categoria}
                type="button"
                onClick={() => handleCategoriaClick(c.categoria, isActive)}
                className="group rounded-xl border bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
                style={{
                  borderColor: isActive ? palette.text : "rgba(15,23,42,0.06)",
                  boxShadow: isActive
                    ? `0 0 0 2px ${palette.bg}, 0 4px 12px rgba(15,23,42,0.04)`
                    : "0 1px 2px rgba(15,23,42,0.03)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em]"
                    style={{
                      background: palette.bg,
                      color: palette.text,
                    }}
                  >
                    {c.categoria.length > 13
                      ? c.categoria.slice(0, 12) + "…"
                      : c.categoria}
                  </span>
                  <span className="text-[10px] text-gray-400 tabular-nums">
                    {c.skusConStock}/{c.totalSKUs} SKUs
                  </span>
                </div>
                <p
                  className="mt-2 text-[26px] font-bold leading-none tracking-[-0.025em] tabular-nums"
                  style={{
                    color: c.stockTotal > 0 ? "#0F172A" : "#94A3B8",
                  }}
                >
                  {c.stockTotal.toLocaleString("es-MX")}
                </p>
                <p className="mt-1 text-[10.5px] text-[#64748B]">unidades en stock</p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pctSkusConStock}%`,
                      background: palette.text,
                    }}
                  />
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="text-[10px] text-gray-400">invertido</span>
                  <span className="text-[11px] font-semibold tabular-nums text-gray-700">
                    {mxn.format(c.costoMXN)}
                  </span>
                </div>
                {c.profitTotal > 0 && (
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <span className="text-[10px] text-gray-400">profit pot.</span>
                    <span className="text-[11px] font-semibold tabular-nums text-emerald-700">
                      {mxn.format(c.profitTotal)}
                    </span>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* Search + filters */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por SKU, nombre, categoría…"
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
            />
          </div>
          <select
            value={estatusF}
            onChange={(e) => setEstatusF(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
          >
            {ESTATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={categoriaF}
            onChange={(e) => setCategoriaF(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={proveedorF}
            onChange={(e) => setProveedorF(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
            disabled={proveedores.length === 0}
          >
            <option value="">Todos los proveedores</option>
            {proveedores.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setTopSellersOnly((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
              topSellersOnly
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Sparkles className="size-4" />
            Más vendidos
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs text-gray-500 hover:text-gray-700"
            >
              <X className="size-3" />
              Limpiar
            </button>
          )}
          <span className="ml-auto text-xs text-gray-500">
            {sorted.length} de {productos.length}
          </span>
        </div>
      </section>

      <ProductDrawer
        producto={selected}
        sales={selected ? sales[selected.sku] : undefined}
        onClose={() => setSelectedSku(null)}
        onEdit={() => {
          if (selected) {
            setEditSku(selected.sku)
            setSelectedSku(null)
          }
        }}
      />

      <ProductEditModal
        key={editing?.id ?? "closed"}
        producto={editing}
        onClose={() => setEditSku(null)}
      />

      {createOpen && (
        <ProductCreateModal
          onClose={() => setCreateOpen(false)}
          categoriaOptions={categoriaOptions}
          proveedorOptions={proveedorOptions}
          defaultTc={tcVigente}
        />
      )}

      {/* Tipo de cambio note */}
      <TipoCambioNote tc={tcVigente} />

      {/* Table */}
      <section
        ref={tableRef}
        className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden scroll-mt-6"
      >
        {categoriaF && (
          <div
            className="flex items-center justify-between gap-2 border-b border-gray-100 px-5 py-3"
            style={{
              background:
                (CATEGORIA_COLOR[categoriaF] ?? CATEGORIA_COLOR.OTROS).bg,
            }}
          >
            <p
              className="text-[12px] font-medium tabular-nums"
              style={{
                color:
                  (CATEGORIA_COLOR[categoriaF] ?? CATEGORIA_COLOR.OTROS).text,
              }}
            >
              Filtrando: <span className="font-bold">{categoriaF}</span>
              <span className="ml-2 text-[11px] font-normal opacity-70">
                · {sorted.length} de {productos.length} productos
              </span>
            </p>
            <button
              type="button"
              onClick={() => setCategoriaF("")}
              className="rounded-md bg-white/70 px-2.5 py-1 text-[11px] font-medium text-gray-700 transition-colors hover:bg-white"
            >
              ✕ Quitar filtro
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table
            className="border-collapse"
            style={{ minWidth: "1400px", width: "max-content" }}
          >
            <colgroup>
              {colWidths.map((w, i) => (
                <col key={i} style={{ width: `${w}px` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-[#EEF1F4] bg-[#F9FAFB]">
                <th className="py-3 px-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider relative">
                  Foto
                  <ResizeHandle colIndex={0} setColWidth={setColWidth} resetColWidth={resetColWidth} />
                </th>
                <SortableTh align="left" k="categoria" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} colIndex={1} setColWidth={setColWidth} resetColWidth={resetColWidth}>Cat.</SortableTh>
                <SortableTh align="left" k="peso" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} colIndex={2} setColWidth={setColWidth} resetColWidth={resetColWidth}>Peso</SortableTh>
                <SortableTh align="left" k="nombre" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} colIndex={3} setColWidth={setColWidth} resetColWidth={resetColWidth}>Producto</SortableTh>
                <SortableTh align="left" k="sku" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} colIndex={4} setColWidth={setColWidth} resetColWidth={resetColWidth}>SKU</SortableTh>
                <SortableTh align="right" k="precio_publico" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} colIndex={5} setColWidth={setColWidth} resetColWidth={resetColWidth}>P. Público</SortableTh>
                <SortableTh align="right" k="precio_usd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} colIndex={6} setColWidth={setColWidth} resetColWidth={resetColWidth}>USD</SortableTh>
                <SortableTh align="right" k="precio_mxn_calculado" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} colIndex={7} setColWidth={setColWidth} resetColWidth={resetColWidth}>MXN calc.</SortableTh>
                <SortableTh align="center" k="stock_actual" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} colIndex={8} setColWidth={setColWidth} resetColWidth={resetColWidth}>Stock</SortableTh>
                <SortableTh align="right" k="precio_usd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} colIndex={9} setColWidth={setColWidth} resetColWidth={resetColWidth}>Costo USD</SortableTh>
                <SortableTh align="right" k="precio_mxn_calculado" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} colIndex={10} setColWidth={setColWidth} resetColWidth={resetColWidth}>Costo MXN</SortableTh>
                <SortableTh align="right" k="costo_total_usd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} colIndex={11} setColWidth={setColWidth} resetColWidth={resetColWidth}>+Env USD</SortableTh>
                <SortableTh align="right" k="costo_total_mxn" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} colIndex={12} setColWidth={setColWidth} resetColWidth={resetColWidth}>+Env MXN</SortableTh>
                <SortableTh align="right" k="profit_unitario" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} colIndex={13} setColWidth={setColWidth} resetColWidth={resetColWidth}>Profit</SortableTh>
                <SortableTh align="center" k="unidades_vendidas" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} colIndex={14} setColWidth={setColWidth} resetColWidth={resetColWidth}>Vend.</SortableTh>
                <th className="py-3 px-2 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider relative">
                  Estatus
                  <ResizeHandle colIndex={15} setColWidth={setColWidth} resetColWidth={resetColWidth} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={16}
                    className="px-5 py-12 text-center text-sm text-gray-500"
                  >
                    Sin resultados con esos filtros.
                  </td>
                </tr>
              ) : (
                sorted.map((p) => (
                  <ProductRow
                    key={p.sku}
                    p={p}
                    isTop={topSellersSet.has(p.sku)}
                    onClick={() => setSelectedSku(p.sku)}
                    onEdit={() => setEditSku(p.sku)}
                  />
                ))
              )}
            </tbody>
            {sorted.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[#EEF1F4] bg-[#F9FAFB]">
                  <td colSpan={5} className="py-3 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                    Totales · {filtered.length} SKUs
                  </td>
                  <td className="py-3 px-2 text-right text-[10px] text-gray-400">—</td>
                  <td className="py-3 px-2 text-right text-[10px] text-gray-400">—</td>
                  <td className="py-3 px-2 text-right text-[10px] text-gray-400">—</td>
                  <td className="py-3 px-2 text-center text-xs font-bold text-gray-900 tabular-nums">
                    {totals.stock.toLocaleString("es-MX")}
                  </td>
                  <td className="py-3 px-2 text-right text-xs font-semibold text-gray-700 tabular-nums whitespace-nowrap">
                    ${totals.costoUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-3 px-2 text-right text-xs font-semibold text-gray-700 tabular-nums whitespace-nowrap">
                    {mxn2.format(totals.costoMXN)}
                  </td>
                  <td className="py-3 px-2 text-right text-xs font-semibold text-orange-600 tabular-nums whitespace-nowrap">
                    ${totals.costoEnvUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-3 px-2 text-right text-xs font-semibold text-orange-700 tabular-nums whitespace-nowrap">
                    {mxn2.format(totals.costoEnvMXN)}
                  </td>
                  <td className="py-3 px-2 text-right text-xs font-bold text-emerald-600 tabular-nums whitespace-nowrap">
                    {mxn2.format(totals.profitTotal)}
                  </td>
                  <td className="py-3 px-2 text-center text-xs font-bold text-gray-900 tabular-nums">
                    {totals.ventas.toLocaleString("es-MX")}
                  </td>
                  <td className="py-3 px-2"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  )
}

function SortableTh({
  children,
  k,
  align,
  sortKey,
  sortDir,
  onSort,
  colIndex,
  setColWidth,
  resetColWidth,
}: {
  children: React.ReactNode
  k: SortKey
  align: "left" | "right" | "center"
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  colIndex: number
  setColWidth: (i: number, w: number) => void
  resetColWidth: (i: number) => void
}) {
  const active = sortKey === k
  const arrow = !active ? "" : sortDir === "asc" ? " ▲" : " ▼"
  const justify =
    align === "right"
      ? "justify-end"
      : align === "center"
        ? "justify-center"
        : "justify-start"
  return (
    <th
      onClick={() => onSort(k)}
      className={`py-3 px-2 text-${align} text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none transition-colors relative ${active ? "text-emerald-700" : "text-gray-500 hover:text-gray-900"}`}
    >
      <span className={`inline-flex items-center gap-1 ${justify}`}>
        {children}
        <span className="text-[8px] tabular-nums">{arrow}</span>
      </span>
      <ResizeHandle colIndex={colIndex} setColWidth={setColWidth} resetColWidth={resetColWidth} />
    </th>
  )
}

function ResizeHandle({
  colIndex,
  setColWidth,
  resetColWidth,
}: {
  colIndex: number
  setColWidth: (i: number, w: number) => void
  resetColWidth: (i: number) => void
}) {
  const [active, setActive] = useState(false)
  const startXRef = useRef(0)
  const startWRef = useRef(0)

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const th = (e.currentTarget as HTMLElement).parentElement as HTMLElement | null
    if (!th) return
    startXRef.current = e.clientX
    startWRef.current = th.getBoundingClientRect().width
    setActive(true)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    const onMove = (ev: MouseEvent) => {
      const next = startWRef.current + (ev.clientX - startXRef.current)
      setColWidth(colIndex, next)
    }
    const onUp = () => {
      setActive(false)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      title="Arrastra para redimensionar · Doble click para resetear"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={onMouseDown}
      onDoubleClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        resetColWidth(colIndex)
      }}
      className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize transition-colors hover:bg-emerald-400/60"
      style={{ background: active ? "rgba(5,150,105,0.7)" : undefined }}
    />
  )
}

function ProductRow({
  p,
  isTop: _isTop,
  onClick,
  onEdit,
}: {
  p: ProductoEnriquecido
  isTop: boolean
  onClick: () => void
  onEdit: () => void
}) {
  void _isTop
  const tc = p.tipo_cambio ?? 20.7
  const precioUsd = p.precio_usd ?? 0
  const costoMxnCalc = precioUsd * tc
  const catShort =
    p.categoria.length > 10 ? p.categoria.slice(0, 10) + "…" : p.categoria
  const estatusBadge =
    p.stock_actual <= 0
      ? "bg-red-100 text-red-600"
      : p.stock_actual <= p.stock_minimo
        ? "bg-amber-100 text-amber-600"
        : "bg-green-100 text-green-600"
  const estatusLabel =
    p.stock_actual <= 0
      ? "Agotado"
      : p.stock_actual <= p.stock_minimo
        ? "Bajo"
        : "Ok"
  const stockColor =
    p.stock_actual <= 0
      ? "text-red-500"
      : p.stock_actual <= p.stock_minimo
        ? "text-amber-500"
        : "text-gray-700"

  return (
    <tr
      onClick={onClick}
      className="border-b border-gray-50 cursor-pointer hover:bg-gray-50/50 transition-colors"
    >
      {/* Foto — upload con drag & drop */}
      <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}>
        <ImageUpload
          productoId={p.id}
          productoNombre={p.nombre_display ?? p.nombre}
          productoSku={p.sku}
          imagenActual={p.imagen_url}
        />
      </td>

      {/* Categoría */}
      <td className="py-2 px-2">
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold whitespace-nowrap ${categoriaClass(p.categoria)}`}
          title={p.categoria}
        >
          {catShort}
        </span>
      </td>

      {/* Peso */}
      <td className="py-2 px-2 text-xs text-gray-500 whitespace-nowrap">
        {p.peso ?? "—"}
      </td>

      {/* Producto */}
      <td className="py-2 px-2" style={{ maxWidth: "160px" }}>
        <p
          className="text-xs font-medium text-gray-900 truncate"
          title={p.nombre_display ?? p.nombre}
        >
          {p.nombre_display ?? p.nombre}
        </p>
      </td>

      {/* SKU */}
      <td className="py-2 px-2" style={{ whiteSpace: "nowrap" }}>
        <code className="text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded whitespace-nowrap">
          {p.sku}
        </code>
      </td>

      {/* Precio Público */}
      <td className="py-2 px-2 text-right text-xs font-semibold text-gray-900 whitespace-nowrap">
        {p.precio_publico != null ? mxn2.format(p.precio_publico) : "—"}
      </td>

      {/* Precio USD */}
      <td className="py-2 px-2 text-right text-xs text-blue-600 font-medium whitespace-nowrap">
        {precioUsd > 0 ? `$${precioUsd.toFixed(2)}` : "—"}
      </td>

      {/* Precio MXN calculado */}
      <td className="py-2 px-2 text-right text-xs text-gray-500 whitespace-nowrap">
        {p.precio_mxn_calculado != null && p.precio_mxn_calculado > 0
          ? mxn2.format(p.precio_mxn_calculado)
          : "—"}
      </td>

      {/* Stock */}
      <td className="py-2 px-2 text-center">
        <span className={`text-xs font-bold ${stockColor}`}>
          {p.stock_actual}
        </span>
        <span className="block text-[9px] text-gray-400">
          mín {p.stock_minimo}
        </span>
      </td>

      {/* Costo USD (precio_usd solamente) */}
      <td className="py-2 px-2 text-right text-xs text-gray-600 whitespace-nowrap">
        {precioUsd > 0 ? `$${precioUsd.toFixed(2)}` : "—"}
      </td>

      {/* Costo MXN */}
      <td className="py-2 px-2 text-right text-xs text-gray-600 whitespace-nowrap">
        {precioUsd > 0 ? mxn2.format(costoMxnCalc) : "—"}
      </td>

      {/* P.Unit + Envío USD */}
      <td className="py-2 px-2 text-right text-xs text-orange-600 font-medium whitespace-nowrap">
        {p.costo_total_usd != null && p.costo_total_usd > 0
          ? `$${p.costo_total_usd.toFixed(2)}`
          : "—"}
      </td>

      {/* P.Unit + Envío MXN */}
      <td className="py-2 px-2 text-right text-xs text-orange-700 whitespace-nowrap">
        {p.costo_total_mxn != null && p.costo_total_mxn > 0
          ? mxn2.format(p.costo_total_mxn)
          : "—"}
      </td>

      {/* Profit */}
      <td className="py-2 px-2 text-right text-xs font-bold text-emerald-600 whitespace-nowrap">
        {p.profit_unitario != null && p.profit_unitario !== 0
          ? mxn2.format(p.profit_unitario)
          : "—"}
      </td>

      {/* Unidades vendidas */}
      <td className="py-2 px-2 text-center text-xs text-gray-700 font-medium">
        {p.unidades_vendidas || 0}
      </td>

      {/* Estatus + Editar */}
      <td className="py-2 px-2">
        <div className="flex items-center justify-center gap-1.5">
          <span
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${estatusBadge}`}
          >
            {estatusLabel}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            title="Editar producto"
            aria-label="Editar producto"
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function TipoCambioNote({ tc }: { tc: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-2.5 text-xs">
      <div className="flex items-center gap-2 text-blue-900">
        <span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold">
          TC referencial
        </span>
        <span className="text-gray-700">
          ${tc.toFixed(2)} <span className="text-gray-500">MXN/USD</span>
        </span>
        <span className="hidden text-gray-400 md:inline">
          · costo MXN = costo USD × TC
        </span>
      </div>
      <ActualizarTCButton tcActual={tc} />
    </div>
  )
}

function ActualizarTCButton({ tcActual }: { tcActual: number }) {
  const [pending, startTransition] = useTransition()

  function onClick() {
    const raw = window.prompt(
      "Nuevo tipo de cambio (MXN por USD):",
      tcActual.toFixed(2),
    )
    if (raw == null) return
    const num = Number(raw.replace(/,/g, "."))
    if (!Number.isFinite(num) || num <= 0) {
      alert("Valor inválido. Debe ser un número positivo.")
      return
    }
    startTransition(async () => {
      const res = await actualizarTipoCambio(num)
      if (!res.ok) alert(`Error al actualizar: ${res.error}`)
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-50"
    >
      <RefreshCw className={`size-3 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Actualizando…" : "Actualizar TC"}
    </button>
  )
}
