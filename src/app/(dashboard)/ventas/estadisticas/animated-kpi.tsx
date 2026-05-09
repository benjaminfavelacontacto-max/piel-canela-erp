"use client"

import { useEffect, useState } from "react"

const mxn0 = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

function formatValue(n: number, style: "integer" | "currency"): string {
  if (style === "currency") return mxn0.format(n)
  return Math.floor(n).toLocaleString("es-MX")
}

export function AnimatedKpi({
  icon,
  label,
  value,
  formatStyle,
  subtitle,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  formatStyle: "integer" | "currency"
  subtitle?: string
  tone: string
}) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const start = 0
    const end = value
    const duration = 1000
    const startTime = performance.now()
    let raf = 0
    const update = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(start + (end - start) * eased)
      if (progress < 1) raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [value])

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 transition-all duration-300 ease-in-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-lg">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </span>
        {icon}
      </div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>
        {formatValue(display, formatStyle)}
      </div>
      {subtitle && <div className="mt-1 text-xs text-gray-500">{subtitle}</div>}
    </div>
  )
}

export function StaticKpi({
  icon,
  label,
  value,
  subtitle,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  subtitle?: string
  tone: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 transition-all duration-300 ease-in-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-lg">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </span>
        {icon}
      </div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>
        {value}
      </div>
      {subtitle && <div className="mt-1 text-xs text-gray-500">{subtitle}</div>}
    </div>
  )
}
