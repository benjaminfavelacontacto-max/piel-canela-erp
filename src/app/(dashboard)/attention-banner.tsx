import Link from "next/link"
import { formatMXN } from "@/lib/utils"

/**
 * Resumen 🔴/🟠 de "qué necesita atención", pensado para leerse en 2
 * segundos. No sustituye los paneles con detalle de abajo (stock bajo /
 * cotizaciones por vencer / pagos pendientes) — los resume. Reutiliza los
 * mismos contadores que ya se calculan en page.tsx, cero cálculos nuevos.
 */

type Item = {
  tone: "danger" | "warning"
  texto: string
  href: string
  label: string
}

export function AttentionBanner({
  pagosPendTotal,
  pagosPendCount,
  agotadosCount,
  stockBajoCount,
  cotPorVencerCount,
}: {
  pagosPendTotal: number
  pagosPendCount: number
  agotadosCount: number
  stockBajoCount: number
  cotPorVencerCount: number
}) {
  const items: Item[] = []

  if (pagosPendTotal > 0) {
    items.push({
      tone: "danger",
      texto: `${pagosPendCount} venta${pagosPendCount === 1 ? "" : "s"} con saldo pendiente — ${formatMXN(pagosPendTotal)}`,
      href: "/ventas",
      label: "Ver cuentas por cobrar",
    })
  }
  if (agotadosCount > 0) {
    items.push({
      tone: "danger",
      texto: `${agotadosCount} producto${agotadosCount === 1 ? "" : "s"} agotado${agotadosCount === 1 ? "" : "s"}`,
      href: "/inventario",
      label: "Ver inventario",
    })
  }
  if (stockBajoCount > 0) {
    items.push({
      tone: "warning",
      texto: `${stockBajoCount} producto${stockBajoCount === 1 ? "" : "s"} con stock bajo`,
      href: "/inventario",
      label: "Ver inventario",
    })
  }
  if (cotPorVencerCount > 0) {
    items.push({
      tone: "warning",
      texto: `${cotPorVencerCount} cotización${cotPorVencerCount === 1 ? "" : "es"} por vencer en ≤3 días`,
      href: "/cotizaciones",
      label: "Ver cotizaciones",
    })
  }

  if (items.length === 0) {
    return (
      <div className="pc-card flex items-center gap-2 !py-4">
        <span aria-hidden>🟢</span>
        <p className="text-sm text-gray-600">
          Todo está en orden — por ahora no hay pendientes críticos.
        </p>
      </div>
    )
  }

  return (
    <div className="pc-card !py-4">
      <ul className="divide-y divide-gray-100">
        {items.map((it) => (
          <li
            key={it.href + it.texto}
            className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
          >
            <p className="flex items-center gap-2 text-sm text-gray-800">
              <span aria-hidden>{it.tone === "danger" ? "🔴" : "🟠"}</span>
              {it.texto}
            </p>
            <Link
              href={it.href}
              className="text-xs font-medium text-[#0F766E] hover:underline"
            >
              {it.label} →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
