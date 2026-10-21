"use client"

import { useMemo, useState } from "react"
import { Sparkles } from "lucide-react"
import type { ProductoEnriquecido, ProductoSales } from "./inventario-view"
import { CATEGORIA_COLOR } from "./inventario-view"
import { monthSpan, fmtAgotar } from "./product-drawer"

const HORIZONTES = [1, 2, 3] as const

type Fila = {
  producto: ProductoEnriquecido
  ritmoMensual: number
  mesesParaAgotar: number | null
}

/**
 * Ranking de los 20 productos más vendidos (histórico) con ritmo mensual real
 * y pedido sugerido para cubrir los próximos N meses. Reusa exactamente el
 * mismo cálculo de ritmo/agotamiento que el drawer de un solo producto
 * (`monthSpan` / `fmtAgotar` de ./product-drawer) para que ambas vistas
 * siempre cuadren entre sí.
 */
export function SugerenciaPedido({
  productos,
  sales,
}: {
  productos: ProductoEnriquecido[]
  sales: Record<string, ProductoSales>
}) {
  const [horizonte, setHorizonte] = useState<(typeof HORIZONTES)[number]>(2)

  const filas = useMemo<Fila[]>(() => {
    return [...productos]
      .filter((p) => p.unidades_vendidas > 0)
      .sort((a, b) => b.unidades_vendidas - a.unidades_vendidas)
      .slice(0, 20)
      .map((producto) => {
        const monthly = sales[producto.sku]?.monthly ?? []
        const spanMeses =
          monthly.length > 0
            ? monthSpan(monthly[0].mes, monthly[monthly.length - 1].mes)
            : 0
        const ritmoMensual =
          spanMeses > 0 ? producto.unidades_vendidas / spanMeses : 0
        const mesesParaAgotar =
          ritmoMensual > 0 ? producto.stock_actual / ritmoMensual : null
        return { producto, ritmoMensual, mesesParaAgotar }
      })
  }, [productos, sales])

  if (filas.length === 0) return null

  return (
    <section className="rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold tracking-[-0.01em] text-[#0F172A]">
            <Sparkles className="size-4 text-[#0F766E]" />
            Más vendidos · sugerencia de pedido
          </h2>
          <p className="text-[11.5px] text-[#64748B]">
            Top 20 por unidades vendidas (histórico), con el ritmo mensual real de cada uno
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] text-[#64748B]">Cubrir:</span>
          {HORIZONTES.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHorizonte(h)}
              className="rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-colors"
              style={
                horizonte === h
                  ? { background: "#0F766E", color: "white" }
                  : { background: "#F1F5F9", color: "#475569" }
              }
            >
              {h} {h === 1 ? "mes" : "meses"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-[#EEF1F4] text-left">
              <th className="px-2 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-[#64748B]">
                Producto
              </th>
              <th className="px-2 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-[#64748B]">
                Categoría
              </th>
              <th className="px-2 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-[#64748B]">
                Stock
              </th>
              <th className="px-2 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-[#64748B]">
                Vendidas
              </th>
              <th className="px-2 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-[#64748B]">
                Ritmo
              </th>
              <th className="px-2 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-[#64748B]">
                Se agota en
              </th>
              <th className="px-2 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-[#64748B]">
                Pedido sugerido
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {filas.map(({ producto: p, ritmoMensual, mesesParaAgotar }) => {
              const catKey = p.categoria.toUpperCase()
              const palette = CATEGORIA_COLOR[catKey] ?? CATEGORIA_COLOR.OTROS
              const objetivo = Math.max(
                Math.ceil(ritmoMensual * horizonte),
                p.stock_minimo,
              )
              const sugerido = Math.max(0, objetivo - p.stock_actual)
              return (
                <tr key={p.sku} className="hover:bg-gray-50/60">
                  <td className="px-2 py-2.5">
                    <p className="font-medium text-[#0F172A]">
                      {p.nombre_display ?? p.nombre}
                    </p>
                    <p className="font-mono text-[10.5px] text-[#94A3B8]">
                      {p.sku}
                    </p>
                  </td>
                  <td className="px-2 py-2.5">
                    <span
                      className="rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.03em]"
                      style={{ background: palette.bg, color: palette.text }}
                    >
                      {catKey}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-[#334155]">
                    {p.stock_actual.toLocaleString("es-MX")}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-[#334155]">
                    {p.unidades_vendidas.toLocaleString("es-MX")}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-[#64748B]">
                    {ritmoMensual > 0 ? `${ritmoMensual.toFixed(1)} u/mes` : "—"}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-[#64748B]">
                    {fmtAgotar(mesesParaAgotar, p.stock_actual)}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {sugerido > 0 ? (
                      <span className="text-[13.5px] font-bold tabular-nums text-[#0F766E]">
                        {sugerido.toLocaleString("es-MX")}
                      </span>
                    ) : (
                      <span className="text-[12.5px] tabular-nums text-[#94A3B8]">
                        Cubierto
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[10.5px] text-[#94A3B8]">
        Pedido sugerido = ritmo mensual real × meses a cubrir (o el stock
        mínimo del producto, lo que sea mayor) − stock actual.
      </p>
    </section>
  )
}
