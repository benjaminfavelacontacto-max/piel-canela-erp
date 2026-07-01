import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const mxnFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

export function formatMXN(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "$0"
  return mxnFormatter.format(value)
}

const mxnFormatter2 = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Moneda MXN con 2 decimales fijos ($1,234.50). Tolera null/undefined. */
export function formatMXN2(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "$0.00"
  return mxnFormatter2.format(value)
}

/** Formato compacto: $1.5M, $250k, $750. Útil para KPIs en headers. */
export function formatMXNshort(value: number | null | undefined): string {
  const v = Number(value ?? 0)
  if (!Number.isFinite(v)) return "$0"
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`
  return `$${Math.round(v)}`
}
