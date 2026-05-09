import type { ReactNode } from "react"
import Link from "next/link"

export interface PageHeaderKpi {
  label: string
  value: string
  sub?: string
  /** Color del valor para casos especiales (ej. trends rojos). Default: text-gray-900 */
  color?: string
  /** Tendencia opcional con flecha (ej. "+12%") */
  trend?: { value: string; positive: boolean }
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** ⚠ Deprecado: el sistema ya no usa gradientes por módulo. Se ignora. */
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
 * Header neutro estilo enterprise (Linear / Stripe / Mercury).
 * Sin gradientes ni iconos coloridos por módulo: el color comunica, no decora.
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

      {/* KPIs (cards blancas neutras, color solo en trends) */}
      {kpis && kpis.length > 0 && (
        <div className={`mt-6 grid gap-4 ${kpisGrid}`}>
          {kpis.map((kpi, i) => (
            <div
              key={`${kpi.label}-${i}`}
              className="rounded-2xl border border-[#E7EAF0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            >
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                {kpi.label}
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <p
                  className={`text-[28px] font-bold leading-none tracking-[-0.02em] tabular-nums ${kpi.color ?? "text-gray-900"}`}
                >
                  {kpi.value}
                </p>
                {kpi.trend && (
                  <span
                    className={`text-xs font-medium ${
                      kpi.trend.positive
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {kpi.trend.positive ? "▲" : "▼"} {kpi.trend.value}
                  </span>
                )}
              </div>
              {kpi.sub && (
                <p className="mt-1.5 text-xs text-gray-400">{kpi.sub}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </header>
  )
}
