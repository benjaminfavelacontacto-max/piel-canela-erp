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
  /** Hero KPI dominante — span 2 columnas + número más grande */
  featured?: boolean
  /** Mini-insights: chips tonales con label + value, renderizados debajo del número */
  breakdown?: Array<{
    label: string
    value: string
    /** Tono del chip — afecta bg/border/texto. Default: slate */
    tone?: "slate" | "amber" | "emerald" | "violet" | "rose" | "teal"
  }>
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
  const hasFeatured = kpis?.some((k) => k.featured) ?? false
  const kpisGrid = hasFeatured
    ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-5"
    : kpis && kpis.length > 0
      ? COLS_CLASS[kpis.length] ?? "grid-cols-2 md:grid-cols-4"
      : ""

  return (
    <header className="mb-6">
      {/* Breadcrumb */}
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="mb-2 flex items-center gap-1.5 text-xs text-gray-400">
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
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-gray-900">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      {/* KPIs (cards blancas, denso premium) */}
      {kpis && kpis.length > 0 && (
        <div className={`mt-4 grid gap-3 ${kpisGrid}`}>
          {kpis.map((kpi, i) => (
            <KpiCard key={`${kpi.label}-${i}`} kpi={kpi} />
          ))}
        </div>
      )}
    </header>
  )
}

function KpiCard({ kpi }: { kpi: PageHeaderKpi }) {
  const featured = kpi.featured
  return (
    <div
      className={`pc-kpi-card group ${featured ? "lg:col-span-2" : ""}`}
      style={
        featured
          ? {
              boxShadow:
                "0 1px 2px rgba(15,23,42,0.03), 0 8px 24px rgba(15,23,42,0.02)",
            }
          : undefined
      }
    >
      {/* Top row — label + trend pill */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
          {kpi.label}
        </p>
        {kpi.trend && (
          <span
            className={`inline-flex items-center gap-0.5 text-[10.5px] font-semibold tabular-nums ${
              kpi.trend.positive ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            <span aria-hidden className="text-[8px]">
              {kpi.trend.positive ? "▲" : "▼"}
            </span>
            {kpi.trend.value}
          </span>
        )}
      </div>

      {/* Middle row — big number + sparkline al lado */}
      <div className="flex items-end justify-between gap-3">
        <p
          className={`${featured ? "text-[34px]" : "text-[26px]"} font-bold leading-none tracking-[-0.03em] tabular-nums ${kpi.color ?? "text-[#0F172A]"}`}
          style={{ fontFeatureSettings: '"tnum" 1, "ss01" 1' }}
        >
          {kpi.value}
        </p>
        {kpi.sparkline && kpi.sparkline.length > 1 && (
          <Sparkline points={kpi.sparkline} />
        )}
      </div>

      {/* Breakdown chips — mini-insights tonales */}
      {kpi.breakdown && kpi.breakdown.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {kpi.breakdown.map((b, i) => (
            <BreakdownChip key={`${b.label}-${i}`} item={b} />
          ))}
        </div>
      )}

      {/* Sub — metadata secundaria, compacta */}
      {kpi.sub && (
        <p className="mt-auto text-[11px] leading-tight text-[#64748B]">
          {kpi.sub}
        </p>
      )}
    </div>
  )
}

const BREAKDOWN_TONES: Record<
  NonNullable<NonNullable<PageHeaderKpi["breakdown"]>[number]["tone"]>,
  { bg: string; border: string; text: string; dot: string }
> = {
  slate: {
    bg: "rgba(100,116,139,0.06)",
    border: "rgba(100,116,139,0.14)",
    text: "#475569",
    dot: "#94A3B8",
  },
  amber: {
    bg: "rgba(217,119,6,0.07)",
    border: "rgba(217,119,6,0.18)",
    text: "#B45309",
    dot: "#D97706",
  },
  emerald: {
    bg: "rgba(5,150,105,0.07)",
    border: "rgba(5,150,105,0.18)",
    text: "#047857",
    dot: "#059669",
  },
  teal: {
    bg: "rgba(15,118,110,0.07)",
    border: "rgba(15,118,110,0.18)",
    text: "#0F766E",
    dot: "#0F766E",
  },
  violet: {
    bg: "rgba(139,92,246,0.07)",
    border: "rgba(139,92,246,0.18)",
    text: "#7C3AED",
    dot: "#8B5CF6",
  },
  rose: {
    bg: "rgba(220,38,38,0.07)",
    border: "rgba(220,38,38,0.18)",
    text: "#B91C1C",
    dot: "#DC2626",
  },
}

function BreakdownChip({
  item,
}: {
  item: NonNullable<PageHeaderKpi["breakdown"]>[number]
}) {
  const tone = BREAKDOWN_TONES[item.tone ?? "slate"]
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums"
      style={{
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        color: tone.text,
        fontFeatureSettings: '"tnum" 1',
      }}
    >
      <span
        aria-hidden
        className="size-1 rounded-full"
        style={{ background: tone.dot }}
      />
      <span style={{ opacity: 0.78 }}>{item.label}</span>
      <span className="font-semibold">{item.value}</span>
    </span>
  )
}

function Sparkline({ points }: { points: number[] }) {
  const w = 80
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
      className="shrink-0 transition-opacity duration-180 group-hover:opacity-100"
      style={{ opacity: 0.45, transform: "scale(0.92)", transformOrigin: "right center" }}
      aria-hidden
    >
      <path
        d={`${path} L ${w} ${h} L 0 ${h} Z`}
        fill={stroke}
        fillOpacity="0.05"
      />
      <path
        d={path}
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
