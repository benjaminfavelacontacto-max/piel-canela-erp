import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getInternalClienteIds } from "@/lib/internal-clientes"
import { buildProductoImageUrl } from "@/lib/storage-images"
import {
  Home,
  Coins,
  Tag,
  TrendingDown,
  Package,
  Boxes,
  type LucideIcon,
} from "lucide-react"

const mxn = (v: number) =>
  (Number(v) || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  })

type ItemRow = {
  venta_id: string
  cantidad: number
  costo_unitario: number
  precio_unitario: number
  productos: {
    sku: string | null
    nombre: string
    nombre_display: string | null
    imagen_url: string | null
  } | null
}

export default async function PielCanelaPage() {
  const supabase = await createClient()
  const internalIds = [...(await getInternalClienteIds())]

  const { data: ventasData } = internalIds.length
    ? await supabase
        .from("ventas")
        .select("id, numero, fecha")
        .in("cliente_id", internalIds)
    : { data: [] }
  const ventas = (ventasData ?? []) as { id: string; numero: string; fecha: string }[]
  const ventaById = new Map(ventas.map((v) => [v.id, v]))
  const ventaIds = ventas.map((v) => v.id)

  const { data: itemsData } = ventaIds.length
    ? await supabase
        .from("venta_items")
        .select(
          "venta_id, cantidad, costo_unitario, precio_unitario, productos(sku, nombre, nombre_display, imagen_url)",
        )
        .in("venta_id", ventaIds)
    : { data: [] }
  const items = (itemsData ?? []) as unknown as ItemRow[]

  // Agregado por producto
  type Agg = {
    sku: string
    nombre: string
    imagen: string | null
    unidades: number
    costo: number
    publico: number
  }
  const byProd = new Map<string, Agg>()
  let totU = 0
  let totCosto = 0
  let totPub = 0
  for (const it of items) {
    const p = it.productos
    const sku = p?.sku ?? "?"
    const cant = Number(it.cantidad) || 0
    const costo = Number(it.costo_unitario) * cant
    const pub = Number(it.precio_unitario) * cant
    totU += cant
    totCosto += costo
    totPub += pub
    const cur =
      byProd.get(sku) ??
      {
        sku,
        nombre: p?.nombre_display ?? p?.nombre ?? sku,
        imagen: p?.imagen_url ?? null,
        unidades: 0,
        costo: 0,
        publico: 0,
      }
    cur.unidades += cant
    cur.costo += costo
    cur.publico += pub
    byProd.set(sku, cur)
  }
  const productos = [...byProd.values()].sort((a, b) => b.publico - a.publico)
  const gananciaNoRealizada = totPub - totCosto

  // Agregado por salida (venta interna)
  const byTake = new Map<
    string,
    { numero: string; fecha: string; unidades: number; costo: number; publico: number }
  >()
  for (const it of items) {
    const v = ventaById.get(it.venta_id)
    if (!v) continue
    const cant = Number(it.cantidad) || 0
    const cur =
      byTake.get(it.venta_id) ??
      { numero: v.numero, fecha: v.fecha, unidades: 0, costo: 0, publico: 0 }
    cur.unidades += cant
    cur.costo += Number(it.costo_unitario) * cant
    cur.publico += Number(it.precio_unitario) * cant
    byTake.set(it.venta_id, cur)
  }
  const takes = [...byTake.values()].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-[28px] font-bold leading-tight tracking-[-0.03em] text-gray-900">
          <Home className="size-6 text-[#8B5CF6]" />
          Piel Canela — Productos para terraza
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-gray-500">
          Todo lo que la socia se ha llevado a su spa (consumo interno). No cuenta en
          ventas ni ROI — aquí ves el costo real y el dinero que se deja de ganar por
          no venderlo.
        </p>
      </div>

      {/* Hero — dinero que se deja de ganar */}
      <section
        className="relative overflow-hidden rounded-2xl p-6 shadow-sm"
        style={{ background: "linear-gradient(120deg, #2A244A 0%, #1E1A33 100%)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/55">
              <TrendingDown className="size-3.5" />
              Ganancia no realizada — dinero que se deja de ganar
            </p>
            <p className="mt-2 text-[42px] font-bold leading-none tracking-[-0.03em] tabular-nums text-white">
              {mxn(gananciaNoRealizada)}
            </p>
            <p className="mt-2.5 text-[12px] text-white/55">
              Valor público {mxn(totPub)}
              <span className="mx-1.5 text-white/25">−</span>costo real {mxn(totCosto)}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right backdrop-blur">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/45">
              Se ha llevado
            </p>
            <p className="mt-1 text-[22px] font-bold tabular-nums text-white">
              {totU} <span className="text-[13px] font-medium text-white/50">u</span>
            </p>
            <p className="mt-0.5 text-[10.5px] text-white/45">
              {productos.length} productos · {takes.length} salidas
            </p>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          icon={Coins}
          tone="amber"
          label="Costo real"
          value={mxn(totCosto)}
          sub="lo que costó comprarlo (inversión consumida)"
        />
        <Kpi
          icon={Tag}
          tone="indigo"
          label="Valor a precio público"
          value={mxn(totPub)}
          sub="lo que valdría vendido al público"
        />
        <Kpi
          icon={TrendingDown}
          tone="rose"
          label="Ganancia no realizada"
          value={mxn(gananciaNoRealizada)}
          sub="dinero que se deja de ganar por no venderlo"
          strong
        />
      </section>

      {/* Productos llevados */}
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <header className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
          <Package className="size-4 text-gray-400" strokeWidth={1.75} />
          <h2 className="text-[13px] font-semibold text-gray-900">Productos llevados</h2>
          <span className="text-[11px] text-gray-400">{productos.length} SKUs · {totU} u</span>
        </header>
        {productos.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">
            Piel Canela no ha registrado consumo interno todavía.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-gray-50 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                  <th className="px-3 py-2.5 text-left">Producto</th>
                  <th className="px-3 py-2.5 text-right">Unidades</th>
                  <th className="px-3 py-2.5 text-right">Costo real</th>
                  <th className="px-3 py-2.5 text-right">Valor público</th>
                  <th className="px-3 py-2.5 text-right">No realizada</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.sku} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/inventario?producto=${encodeURIComponent(p.sku)}`}
                        className="group/prod flex items-center gap-2.5"
                        title="Ver detalle del producto"
                      >
                        {p.imagen ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={buildProductoImageUrl(p.imagen) ?? ""}
                            alt={p.nombre}
                            className="size-9 rounded-lg border border-gray-100 object-cover"
                          />
                        ) : (
                          <div className="flex size-9 items-center justify-center rounded-lg border border-gray-100 bg-gray-50 text-gray-300">
                            <Package className="size-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 group-hover/prod:text-[#7C3AED] group-hover/prod:underline">
                            {p.nombre}
                          </p>
                          <p className="text-[10px] text-gray-400">{p.sku}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                      {p.unidades}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">
                      {mxn(p.costo)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-indigo-700">
                      {mxn(p.publico)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-rose-700">
                      {mxn(p.publico - p.costo)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 text-[12px] font-bold text-gray-900">
                  <td className="px-3 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{totU}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">{mxn(totCosto)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-indigo-700">{mxn(totPub)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-rose-700">{mxn(gananciaNoRealizada)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Salidas (cada vez que se llevó producto) */}
      {takes.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <header className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
            <Boxes className="size-4 text-gray-400" strokeWidth={1.75} />
            <h2 className="text-[13px] font-semibold text-gray-900">Salidas</h2>
            <span className="text-[11px] text-gray-400">{takes.length} veces</span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-gray-50 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                  <th className="px-3 py-2.5 text-left">Fecha</th>
                  <th className="px-3 py-2.5 text-left">Folio</th>
                  <th className="px-3 py-2.5 text-right">Unidades</th>
                  <th className="px-3 py-2.5 text-right">Costo real</th>
                  <th className="px-3 py-2.5 text-right">Valor público</th>
                </tr>
              </thead>
              <tbody>
                {takes.map((t) => (
                  <tr key={t.numero} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-2.5 text-gray-700">
                      {new Date(t.fecha).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-gray-500">{t.numero}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">{t.unidades}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">{mxn(t.costo)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-indigo-700">{mxn(t.publico)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

const TONES: Record<
  "amber" | "indigo" | "rose",
  { bg: string; border: string; text: string }
> = {
  amber: { bg: "rgba(217,119,6,0.06)", border: "rgba(217,119,6,0.18)", text: "#B45309" },
  indigo: { bg: "rgba(99,102,241,0.06)", border: "rgba(99,102,241,0.18)", text: "#4F46E5" },
  rose: { bg: "rgba(220,38,38,0.06)", border: "rgba(220,38,38,0.18)", text: "#B91C1C" },
}

function Kpi({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  strong,
}: {
  icon: LucideIcon
  tone: keyof typeof TONES
  label: string
  value: string
  sub?: string
  strong?: boolean
}) {
  const t = TONES[tone]
  return (
    <div
      className="rounded-2xl border bg-white p-4 shadow-sm"
      style={{ borderColor: t.border, background: strong ? t.bg : undefined }}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5" style={{ color: t.text }} />
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: t.text }}>
          {label}
        </p>
      </div>
      <p className="mt-2 text-[26px] font-bold leading-none tracking-[-0.03em] tabular-nums text-gray-900">
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[11px] text-gray-400">{sub}</p>}
    </div>
  )
}
