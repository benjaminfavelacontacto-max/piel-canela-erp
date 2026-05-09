"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

const PRESETS = [
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "90d", label: "90 días" },
  { key: "1a", label: "1 año" },
  { key: "todo", label: "Todo" },
] as const

type PresetKey = (typeof PRESETS)[number]["key"]

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function presetRange(key: PresetKey): { desde: string; hasta: string } | null {
  const today = new Date()
  const hasta = isoDate(today)
  const back = (days: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() - days)
    return isoDate(d)
  }
  if (key === "7d") return { desde: back(7), hasta }
  if (key === "30d") return { desde: back(30), hasta }
  if (key === "90d") return { desde: back(90), hasta }
  if (key === "1a") return { desde: back(365), hasta }
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
    <div className="inline-flex items-center gap-1 rounded-xl bg-gray-100 p-1">
      {PRESETS.map((p) => {
        const active = isActive(p.key)
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => selectPreset(p.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
              active
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}
