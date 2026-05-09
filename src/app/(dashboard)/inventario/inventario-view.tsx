"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import {
  Search,
  Package,
  Sparkles,
  RefreshCw,
  X,
} from "lucide-react"
import { ProductDrawer } from "./product-drawer"
import { PageHeader } from "@/components/page-header"
import { actualizarTipoCambio } from "./actions"

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
  const sortKey: SortKey = "nombre"
  const sortDir: SortDir = "asc"

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
    <div className="p-8 space-y-8">
      <PageHeader
        title="Inventario"
        subtitle={`${productos.length} productos · ${categorias.length} categorías`}
        icon={<Package className="size-5" />}
        kpis={[
          {
            label: "Valor inventario",
            value: mxn.format(kpis.valor),
            sub: `${kpis.totalProds} SKUs activos`,
          },
          {
            label: "Capital invertido",
            value: mxn.format(kpis.capital),
            sub: "costo prom. de ventas",
          },
          {
            label: "Utilidad potencial",
            value: mxn.format(kpis.utilidadPotencial),
            sub:
              kpis.valor > 0
                ? `${((kpis.utilidadPotencial / kpis.valor) * 100).toFixed(1)}% margen`
                : "—",
            color: "text-emerald-300",
          },
          {
            label: "Stock crítico",
            value: `${kpis.agotados + kpis.criticos}`,
            sub: `${kpis.agotados} agotados · ${kpis.criticos} bajos`,
            color:
              kpis.agotados + kpis.criticos > 0
                ? "text-red-300"
                : "text-emerald-300",
          },
        ]}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

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
      />

      {/* Tipo de cambio note */}
      <TipoCambioNote tc={tcVigente} />

      {/* Table */}
      <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: "1200px" }}>
            <thead>
              <tr className="border-b border-gray-100">
                <th className="py-3 px-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-[50px]">
                  Foto
                </th>
                <th className="py-3 px-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-[90px]">
                  Cat.
                </th>
                <th className="py-3 px-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-[60px]">
                  Peso
                </th>
                <th className="py-3 px-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  Producto
                </th>
                <th className="py-3 px-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-[100px]">
                  SKU
                </th>
                <th className="py-3 px-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-[90px]">
                  P. Público
                </th>
                <th className="py-3 px-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-[70px]">
                  USD
                </th>
                <th className="py-3 px-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-[80px]">
                  MXN calc.
                </th>
                <th className="py-3 px-2 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-[60px]">
                  Stock
                </th>
                <th className="py-3 px-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-[80px]">
                  Costo USD
                </th>
                <th className="py-3 px-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-[80px]">
                  Costo MXN
                </th>
                <th className="py-3 px-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-[70px]">
                  +Env USD
                </th>
                <th className="py-3 px-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-[80px]">
                  +Env MXN
                </th>
                <th className="py-3 px-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-[80px]">
                  Profit
                </th>
                <th className="py-3 px-2 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-[55px]">
                  Vend.
                </th>
                <th className="py-3 px-2 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-[70px]">
                  Estatus
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
  isTop: _isTop,
  onClick,
}: {
  p: ProductoEnriquecido
  isTop: boolean
  onClick: () => void
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
      {/* Foto */}
      <td className="py-2 px-2">
        {p.imagen_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.imagen_url}
            alt=""
            className="w-8 h-8 rounded-lg object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-400">
            {p.sku?.slice(0, 2)}
          </div>
        )}
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
      <td className="py-2 px-2">
        <p
          className="text-xs font-medium text-gray-900 truncate max-w-[160px]"
          title={p.nombre_display ?? p.nombre}
        >
          {p.nombre_display ?? p.nombre}
        </p>
      </td>

      {/* SKU */}
      <td className="py-2 px-2">
        <code className="text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">
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

      {/* Estatus */}
      <td className="py-2 px-2 text-center">
        <span
          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${estatusBadge}`}
        >
          {estatusLabel}
        </span>
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
