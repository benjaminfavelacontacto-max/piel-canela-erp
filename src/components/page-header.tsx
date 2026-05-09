import type { ReactNode } from "react"
import Link from "next/link"

export interface PageHeaderKpi {
  label: string
  value: string
  sub?: string
  color?: string
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  /** Tailwind className para el gradiente. Si no se pasa, usa el default verde profundo. */
  gradient?: string
  kpis?: PageHeaderKpi[]
  actions?: ReactNode
  breadcrumb?: { label: string; href: string }[]
}

const DEFAULT_GRADIENT =
  "bg-gradient-to-br from-[#0f2d0f] via-[#1a4a1a] to-[#0d3b2e]"

// Tailwind requiere class names estáticos para JIT; map manual por count.
const COLS_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
}

export function PageHeader({
  title,
  subtitle,
  icon,
  gradient,
  kpis,
  actions,
  breadcrumb,
}: PageHeaderProps) {
  const kpisGrid = kpis && kpis.length > 0 ? COLS_CLASS[kpis.length] ?? "grid-cols-2 md:grid-cols-4" : ""
  return (
    <div
      className={`${gradient || DEFAULT_GRADIENT} relative mb-4 overflow-hidden rounded-2xl p-5 text-white shadow-lg`}
    >
      {/* Subtle decorative glow */}
      <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-8 size-32 rounded-full bg-white/5 blur-3xl" />

      <div className="relative">
        {/* Breadcrumb */}
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="mb-2 flex items-center gap-1.5 text-[11px] text-white/50">
            {breadcrumb.map((b, i) => (
              <span key={`${b.href}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-white/30">/</span>}
                <Link
                  href={b.href}
                  className="transition-colors hover:text-white"
                >
                  {b.label}
                </Link>
              </span>
            ))}
          </nav>
        )}

        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-white shadow-inner backdrop-blur-sm">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight tracking-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-0.5 text-sm text-white/65">{subtitle}</p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>

        {/* KPIs inline */}
        {kpis && kpis.length > 0 && (
          <div className={`mt-4 grid gap-3 ${kpisGrid}`}>
            {kpis.map((kpi, i) => (
              <div
                key={`${kpi.label}-${i}`}
                className="rounded-xl bg-white/10 p-3 ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-white/15"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">
                  {kpi.label}
                </p>
                <p
                  className={`mt-1 text-xl font-bold tabular-nums leading-tight ${kpi.color ?? "text-white"}`}
                >
                  {kpi.value}
                </p>
                {kpi.sub && (
                  <p className="mt-0.5 text-[11px] text-white/50">{kpi.sub}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
