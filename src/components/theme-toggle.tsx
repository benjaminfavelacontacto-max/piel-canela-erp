"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { useThemePref } from "@/lib/use-theme"
import type { ThemePref } from "@/lib/theme"

const OPCIONES: { valor: ThemePref; label: string; icon: typeof Sun }[] = [
  { valor: "light", label: "Claro", icon: Sun },
  { valor: "dark", label: "Oscuro", icon: Moon },
  { valor: "system", label: "Sistema", icon: Monitor },
]

/** Selector compacto Claro / Oscuro / Sistema (grupo de opciones, accesible por teclado). */
export function ThemeToggle() {
  const [pref, setPref] = useThemePref()

  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <span id="theme-label" className="text-[11px] font-medium uppercase tracking-[0.1em] text-pc-ink-4">
        Tema
      </span>
      <div
        role="radiogroup"
        aria-labelledby="theme-label"
        className="flex items-center gap-0.5 rounded-full bg-pc-tint p-0.5"
      >
        {OPCIONES.map(({ valor, label, icon: Icon }) => {
          const activo = pref === valor
          return (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={activo}
              aria-label={label}
              title={label}
              onClick={() => setPref(valor)}
              className={`flex size-7 items-center justify-center rounded-full transition-colors md:size-6 ${
                activo
                  ? "bg-pc-card text-pc-teal-ink shadow-sm"
                  : "text-pc-ink-3 hover:text-pc-ink"
              }`}
            >
              <Icon className="size-3.5" strokeWidth={activo ? 2.25 : 1.75} aria-hidden />
            </button>
          )
        })}
      </div>
    </div>
  )
}
