"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

const PRESETS = [
  { key: "mes", label: "Este mes" },
  { key: "trimestre", label: "Trimestre" },
  { key: "year", label: "Este año" },
  { key: "todo", label: "Todo" },
] as const

type PresetKey = (typeof PRESETS)[number]["key"]

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function presetRange(key: PresetKey): { desde: string; hasta: string } | null {
  const today = new Date()
  const hasta = isoDate(today)
  if (key === "mes") {
    return {
      desde: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      hasta,
    }
  }
  if (key === "trimestre") {
    const q = Math.floor(today.getMonth() / 3)
    return {
      desde: isoDate(new Date(today.getFullYear(), q * 3, 1)),
      hasta,
    }
  }
  if (key === "year") {
    return {
      desde: isoDate(new Date(today.getFullYear(), 0, 1)),
      hasta,
    }
  }
  return null
}

export function PeriodoTabs() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const currentDesde = sp.get("desde")
  const currentHasta = sp.get("hasta")

  function isActive(key: PresetKey): boolean {
    if (key === "todo") return !currentDesde && !currentHasta
    const r = presetRange(key)
    if (!r) return false
    return r.desde === currentDesde && r.hasta === currentHasta
  }

  function selectPreset(key: PresetKey) {
    const r = presetRange(key)
    if (!r) {
      router.push(pathname)
      return
    }
    const params = new URLSearchParams()
    params.set("desde", r.desde)
    params.set("hasta", r.hasta)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <nav className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => {
        const active = isActive(p.key)
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => selectPreset(p.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-pink-600 text-white"
                : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {p.label}
          </button>
        )
      })}
      {currentDesde && currentHasta && (
        <span className="text-xs text-gray-500 ml-2">
          {currentDesde} → {currentHasta}
        </span>
      )}
    </nav>
  )
}
