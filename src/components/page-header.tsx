import type { ReactNode } from "react"
import Link from "next/link"

export interface PageHeaderKpi {
  label: string
  value: string
  sub?: string
  /** Color del valor para casos especiales. Default: text-gray-900 */
  color?: string
  /** Tendencia con flecha (ej. "+18%") */
  trend?: { value: string; positive: boolean }
  /** Sparkline opcional — array de puntos normalizados (cualquier escala) */
  sparkline?: number[]
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** ⚠ Deprecado: ignorado. */
  icon?: ReactNode
  /** ⚠ Deprecado: ignorado. */
  gradient?: string
  kpis?: PageHeaderKpi[]
  actions?: ReactNode
  breadcrumb?: { label: string; href: string }[]
}

const COLS_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 md:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
}

/**
 * Header neutro estilo enterprise (Linear / Stripe / Mercury / Attio).
 * Sin gradientes ni iconos coloridos por módulo: el color comunica, no decora.
 * KPIs admiten trend (delta %) y sparkline (mini-chart).
 */
export function PageHeader({
  title,
  subtitle,
  kpis,
  actions,
  breadcrumb,
}: PageHeaderProps) {
  const kpisGrid =
    kpis && kpis.length > 0
      ? COLS_CLASS[kpis.length] ?? "grid-cols-2 md:grid-cols-4"
      : ""

  return (
    <header className="mb-8">
      {/* Breadcrumb */}
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-gray-400">
          {breadcrumb.map((b, i) => (
            <span key={`${b.href}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-gray-300">/</span>}
              <Link
                href={b.href}
                className="transition-colors hover:text-gray-700"
              >
                {b.label}
              </Link>
            </span>
          ))}
        </nav>
      )}

      {/* Title row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[32px] font-bold leading-tight tracking-[-0.03em] text-gray-900">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      {/* KPIs (cards blancas, color solo en trends) */}
      {kpis && kpis.length > 0 && (
        <div className={`mt-6 grid gap-4 ${kpisGrid}`}>
          {kpis.map((kpi, i) => (
            <KpiCard key={`${kpi.label}-${i}`} kpi={kpi} />
          ))}
        </div>
      )}
    </header>
  )
}

function KpiCard({ kpi }: { kpi: PageHeaderKpi }) {
  return (
    <div
      className="group rounded-2xl border bg-white p-5 transition-all duration-180"
      style={{
        borderColor: "rgba(15,23,42,0.06)",
        boxShadow: "0 1px 2px rgba(15,23,42,0.03)",
        transitionTimingFunction: "cubic-bezier(0.4,0,0.2,1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow =
          "0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.04)"
        e.currentTarget.style.transform = "translateY(-1px)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 1px 2px rgba(15,23,42,0.03)"
        e.currentTarget.style.transform = ""
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
          {kpi.label}
        </p>
        {kpi.trend && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${
              kpi.trend.positive
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700"
            }`}
          >
            <span aria-hidden>{kpi.trend.positive ? "▲" : "▼"}</span>
            {kpi.trend.value}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p
          className={`text-[28px] font-bold leading-none tracking-[-0.025em] tabular-nums ${kpi.color ?? "text-gray-900"}`}
        >
          {kpi.value}
        </p>
        {kpi.sparkline && kpi.sparkline.length > 1 && (
          <Sparkline points={kpi.sparkline} />
        )}
      </div>
      {kpi.sub && (
        <p className="mt-1.5 text-xs text-gray-400">{kpi.sub}</p>
      )}
    </div>
  )
}

function Sparkline({ points }: { points: number[] }) {
  const w = 64
  const h = 24
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const step = points.length > 1 ? w / (points.length - 1) : 0
  const path = points
    .map((v, i) => {
      const x = i * step
      const y = h - ((v - min) / range) * h
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(" ")
  // Línea con sutil área bajo la curva
  const last = points[points.length - 1]
  const first = points[0]
  const positive = last >= first
  const stroke = positive ? "#0F766E" : "#94A3B8"
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      className="shrink-0 opacity-90 transition-opacity group-hover:opacity-100"
      aria-hidden
    >
      <path
        d={`${path} L ${w} ${h} L 0 ${h} Z`}
        fill={stroke}
        fillOpacity="0.08"
      />
      <path
        d={path}
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
