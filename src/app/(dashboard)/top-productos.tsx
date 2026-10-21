import Link from "next/link"
import { Trophy, CircleDollarSign, Ribbon, ArrowRight } from "lucide-react"
import { formatMXN } from "@/lib/utils"

/**
 * Top productos — qué se mueve más, qué deja más utilidad y qué cintas
 * prefieren las clientas.
 *
 * Presentacional puro: recibe los rankings ya agregados por el servidor
 * (histórico completo de venta_items, sin ventas internas ni canceladas).
 * La utilidad por producto es Σ (precio − costo) × cantidad de sus partidas
 * — los regalos entran con precio $0, así que restan utilidad solos.
 */

export type ProductoRank = {
  nombre: string
  sku: string | null
  imagen: string | null
  /** Piezas vendidas (histórico). */
  piezas: number
  /** Ingresos generados (histórico). */
  ingresos: number
  /** Utilidad: Σ (precio − costo) × cantidad. */
  utilidad: number
  /** % de margen sobre sus ingresos. */
  margen: number
  /** Piezas vendidas este mes (0 si no se movió). */
  piezasMes: number
}

export function TopProductos({
  masVendidos,
  masUtilidad,
  cintasTop,
}: {
  masVendidos: ProductoRank[]
  masUtilidad: ProductoRank[]
  cintasTop: ProductoRank[]
}) {
  return (
    <div>
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-gray-500">
        Top productos
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RankPanel
          icon={<Trophy className="size-4 text-amber-600" />}
          title="Más vendidos"
          sub="Los que más se mueven (piezas, histórico)"
          items={masVendidos}
          metric={(p) => `${p.piezas.toLocaleString("es-MX")} pzs`}
          metricSub={(p) => formatMXN(p.ingresos)}
          barValue={(p) => p.piezas}
          barClass="bg-[#0F766E]"
        />
        <RankPanel
          icon={<CircleDollarSign className="size-4 text-emerald-600" />}
          title="Más utilidad"
          sub="Los que más ganancia dejan"
          items={masUtilidad}
          metric={(p) => formatMXN(p.utilidad)}
          metricSub={(p) =>
            p.margen > 0 ? `${p.margen.toFixed(0)}% margen` : "—"
          }
          barValue={(p) => Math.max(0, p.utilidad)}
          barClass="bg-emerald-500"
        />
        <RankPanel
          icon={<Ribbon className="size-4 text-rose-500" />}
          title="Cintas favoritas"
          sub="Las que más piden las clientas"
          items={cintasTop}
          metric={(p) => `${p.piezas.toLocaleString("es-MX")} pzs`}
          metricSub={(p) => formatMXN(p.ingresos)}
          barValue={(p) => p.piezas}
          barClass="bg-amber-500"
          emptyText="Aún no se venden cintas."
        />
      </div>
    </div>
  )
}

function RankPanel({
  icon,
  title,
  sub,
  items,
  metric,
  metricSub,
  barValue,
  barClass,
  emptyText = "Sin ventas de productos todavía.",
}: {
  icon: React.ReactNode
  title: string
  sub: string
  items: ProductoRank[]
  metric: (p: ProductoRank) => string
  metricSub: (p: ProductoRank) => string
  barValue: (p: ProductoRank) => number
  barClass: string
  emptyText?: string
}) {
  const max = Math.max(...items.map(barValue), 1)
  return (
    <div className="pc-card">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            {icon}
            {title}
          </h3>
          <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>
        </div>
        <Link
          href="/ventas/estadisticas"
          className="inline-flex shrink-0 items-center gap-1 text-xs text-[#0F766E] hover:underline"
        >
          Detalle <ArrowRight className="size-3" />
        </Link>
      </header>
      {items.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">{emptyText}</p>
      ) : (
        <ol className="space-y-1">
          {items.map((p, i) => (
            <li key={p.sku ?? p.nombre}>
              <div className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-gray-50">
                <span
                  aria-hidden
                  className={`w-5 shrink-0 text-center text-[13px] font-bold tabular-nums ${
                    i === 0 ? "text-amber-600" : "text-gray-300"
                  }`}
                >
                  {i + 1}
                </span>
                {p.imagen ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imagen}
                    alt=""
                    className="size-8 shrink-0 rounded-lg border border-black/5 object-cover"
                  />
                ) : (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#F5F7F6] font-mono text-[9px] font-semibold text-gray-400">
                    {(p.sku ?? p.nombre).replace(/[^A-Z0-9]/gi, "").slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[12.5px] font-medium text-gray-900">
                      {p.nombre}
                      {p.piezasMes > 0 && (
                        <span className="ml-1.5 rounded bg-[#DFF7F4] px-1 py-px text-[9px] font-semibold text-[#0F766E]">
                          +{p.piezasMes} este mes
                        </span>
                      )}
                    </p>
                    <span className="shrink-0 text-[12px] font-semibold tabular-nums text-gray-900">
                      {metric(p)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/[0.05]">
                      <div
                        className={`h-full rounded-full ${barClass} transition-all duration-700 ease-out`}
                        style={{
                          width: `${Math.max(4, (barValue(p) / max) * 100)}%`,
                          opacity: 0.75,
                        }}
                      />
                    </div>
                    <span className="shrink-0 text-[10px] tabular-nums text-gray-400">
                      {metricSub(p)}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
