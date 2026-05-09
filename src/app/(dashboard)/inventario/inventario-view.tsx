"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Search,
  Package,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Wallet,
  Sparkles,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
} from "lucide-react"
import { ProductDrawer } from "./product-drawer"

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

const categoriaBadge: Record<string, string> = {
  CINTAS: "bg-orange-100 text-orange-700",
  ACTIVADORES: "bg-teal-100 text-teal-700",
  POTENCIADORES: "bg-green-100 text-green-700",
  "EMULSIÓN REVELADORA": "bg-blue-100 text-blue-700",
  AEROGRAFÍA: "bg-purple-100 text-purple-700",
  "ACEITE CORPORAL": "bg-amber-100 text-amber-700",
  "POLVO DE BLANQUEAR": "bg-pink-100 text-pink-700",
  HUMECTANTES: "bg-cyan-100 text-cyan-700",
  EXFOLIANTS: "bg-indigo-100 text-indigo-700",
  "DYE COLOR": "bg-fuchsia-100 text-fuchsia-700",
  SHAMPOO: "bg-sky-100 text-sky-700",
  SOMBRILLA: "bg-slate-100 text-slate-700",
}
function categoriaClass(c: string): string {
  return categoriaBadge[c.toUpperCase()] ?? "bg-gray-100 text-gray-600"
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
  | "stock_actual"
  | "stock_minimo"
  | "precio_publico"
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
  sales,
  error,
}: {
  productos: ProductoEnriquecido[]
  categorias: string[]
  proveedores: string[]
  sales: Record<string, ProductoSales>
  error: string | null
}) {
  const [selectedSku, setSelectedSku] = useState<string | null>(null)
  const selected = useMemo(
    () => productos.find((p) => p.sku === selectedSku) ?? null,
    [productos, selectedSku],
  )
  const [search, setSearch] = useState("")
  const [estatusF, setEstatusF] = useState("")
  const [categoriaF, setCategoriaF] = useState("")
  const [proveedorF, setProveedorF] = useState("")
  const [topSellersOnly, setTopSellersOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("nombre")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

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

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(k)
      setSortDir(k === "nombre" || k === "categoria" ? "asc" : "desc")
    }
  }

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
      agotados,
      criticos,
      sinMovimiento,
    }
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
    <div className="p-8 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <Package className="size-7 text-teal-700" />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Inventario</h1>
            <p className="text-sm text-gray-500 mt-1">
              {productos.length} productos · {categorias.length} categorías
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPIs */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<DollarSign className="size-5 text-teal-600" />}
          iconBg="bg-teal-50"
          label="Valor del inventario"
          value={mxn.format(kpis.valor)}
          sub={`A precio público · ${kpis.totalProds} SKUs`}
        />
        <Kpi
          icon={<Wallet className="size-5 text-blue-600" />}
          iconBg="bg-blue-50"
          label="Capital invertido"
          value={mxn.format(kpis.capital)}
          sub={`Costo promedio derivado de ventas`}
        />
        <Kpi
          icon={<TrendingUp className="size-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
          label="Utilidad potencial"
          value={mxn.format(kpis.utilidadPotencial)}
          sub={
            kpis.valor > 0
              ? `${((kpis.utilidadPotencial / kpis.valor) * 100).toFixed(1)}% margen`
              : "—"
          }
        />
        <Kpi
          icon={<AlertTriangle className="size-5 text-red-600" />}
          iconBg="bg-red-50"
          label="Stock crítico"
          value={`${kpis.agotados + kpis.criticos}`}
          sub={`${kpis.agotados} agotados · ${kpis.criticos} bajos`}
          urgent={kpis.agotados + kpis.criticos > 0}
        />
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
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          <select
            value={estatusF}
            onChange={(e) => setEstatusF(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
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
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
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
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
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
      />

      {/* Table */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <Th>Producto</Th>
                <Th>SKU</Th>
                <SortTh
                  active={sortKey === "categoria"}
                  dir={sortDir}
                  onClick={() => toggleSort("categoria")}
                >
                  Categoría
                </SortTh>
                <SortTh
                  align="right"
                  active={sortKey === "stock_actual"}
                  dir={sortDir}
                  onClick={() => toggleSort("stock_actual")}
                >
                  Stock
                </SortTh>
                <Th align="center">Nivel</Th>
                <SortTh
                  align="right"
                  active={sortKey === "precio_publico"}
                  dir={sortDir}
                  onClick={() => toggleSort("precio_publico")}
                >
                  Precio
                </SortTh>
                <SortTh
                  align="right"
                  active={sortKey === "margen_pct"}
                  dir={sortDir}
                  onClick={() => toggleSort("margen_pct")}
                >
                  Margen
                </SortTh>
                <SortTh
                  align="right"
                  active={sortKey === "valor_inventario"}
                  dir={sortDir}
                  onClick={() => toggleSort("valor_inventario")}
                >
                  Valor
                </SortTh>
                <SortTh
                  align="right"
                  active={sortKey === "unidades_vendidas"}
                  dir={sortDir}
                  onClick={() => toggleSort("unidades_vendidas")}
                >
                  Vendidos
                </SortTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
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
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function ProductRow({
  p,
  isTop,
  onClick,
}: {
  p: ProductoEnriquecido
  isTop: boolean
  onClick: () => void
}) {
  // Stock bar: ratio current/min*2 capped 100%
  const ratio =
    p.stock_minimo > 0
      ? Math.min(100, (p.stock_actual / (p.stock_minimo * 2)) * 100)
      : Math.min(100, p.stock_actual)
  const barColor =
    p.estatus === "agotado"
      ? "bg-red-500"
      : p.estatus === "bajo"
        ? "bg-amber-500"
        : "bg-teal-500"

  const initials =
    p.nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"

  return (
    <tr
      onClick={onClick}
      className="group cursor-pointer transition-colors hover:bg-teal-50/40"
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-3">
          {p.imagen_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.imagen_url}
              alt={p.nombre}
              className="size-10 shrink-0 rounded-lg border border-gray-100 object-cover"
            />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-gradient-to-br from-gray-50 to-gray-100 text-xs font-semibold text-gray-400">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium text-gray-900">
                {p.nombre}
              </span>
              {isTop && (
                <span
                  title="Top vendido"
                  className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700"
                >
                  ⭐ Top
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {p.peso && (
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px]">
                  {p.peso}
                </span>
              )}
              {p.proveedor && (
                <span className="truncate text-[10px]">{p.proveedor}</span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.sku}</td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${categoriaClass(p.categoria)}`}
        >
          {p.categoria}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="font-semibold tabular-nums text-gray-900">
          {p.stock_actual.toLocaleString("es-MX")}
        </div>
        <div className="text-[10px] text-gray-400">
          mín {p.stock_minimo.toLocaleString("es-MX")}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${barColor} transition-all duration-500`}
              style={{ width: `${ratio}%` }}
            />
          </div>
          <span
            className={`text-[10px] font-medium ${
              p.estatus === "agotado"
                ? "text-red-700"
                : p.estatus === "bajo"
                  ? "text-amber-700"
                  : "text-teal-700"
            }`}
          >
            {p.estatus === "agotado"
              ? "Agotado"
              : p.estatus === "bajo"
                ? "Bajo"
                : "OK"}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {p.precio_publico != null ? (
          <span className="font-medium text-gray-900">
            {mxn2.format(p.precio_publico)}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {p.margen_pct != null ? (
          <span
            className={`font-medium ${p.margen_pct >= 50 ? "text-emerald-700" : p.margen_pct >= 30 ? "text-teal-700" : "text-amber-700"}`}
          >
            {p.margen_pct.toFixed(1)}%
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {p.valor_inventario != null ? (
          <span className="font-semibold text-gray-900">
            {mxn.format(p.valor_inventario)}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-700">
        {p.unidades_vendidas > 0 ? p.unidades_vendidas : "—"}
      </td>
    </tr>
  )
}

function Kpi({
  icon,
  iconBg,
  label,
  value,
  sub,
  urgent,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  sub?: string
  urgent?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${urgent ? "border-red-100" : "border-gray-100"}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className={`rounded-xl p-2 ${iconBg}`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold tabular-nums text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{label}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
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
      className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  )
}

function SortTh({
  children,
  active,
  dir,
  onClick,
  align = "left",
}: {
  children: React.ReactNode
  active: boolean
  dir: "asc" | "desc"
  onClick: () => void
  align?: "left" | "right" | "center"
}) {
  return (
    <th
      onClick={onClick}
      className="cursor-pointer select-none px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
      style={{ textAlign: align }}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </span>
    </th>
  )
}
