"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { useResolvedTheme, useThemePref } from "@/lib/use-theme"
import { applyTheme, type ThemePref } from "@/lib/theme"

const OPCIONES: { valor: ThemePref; label: string; icon: typeof Sun }[] = [
  { valor: "light", label: "Claro", icon: Sun },
  { valor: "dark", label: "Oscuro", icon: Moon },
  { valor: "system", label: "Automático", icon: Monitor },
]

/**
 * Selector de tema del portal público.
 * - Móvil: un solo botón con texto ("Oscuro" / "Claro") que alterna al instante.
 * - Tablet/escritorio: Claro / Oscuro / Automático.
 */
export function ThemeSwitch() {
  const [pref, setPref] = useThemePref()
  const resolved = useResolvedTheme()
  const esOscuro = resolved === "dark"

  return (
    <>
      <button
        type="button"
        onClick={() => applyTheme(esOscuro ? "light" : "dark")}
        aria-label={esOscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
        className="flex items-center gap-1.5 rounded-full border border-pc-line bg-pc-card px-3 py-2 text-xs font-semibold text-pc-ink transition-colors hover:bg-pc-hover sm:hidden"
      >
        {esOscuro ? (
          <Sun className="size-4 text-pc-amber-ink" aria-hidden />
        ) : (
          <Moon className="size-4 text-pc-teal-ink" aria-hidden />
        )}
        {esOscuro ? "Claro" : "Oscuro"}
      </button>

      <div
        role="radiogroup"
        aria-label="Tema de la página"
        className="hidden items-center gap-0.5 rounded-full border border-pc-line bg-pc-card p-0.5 sm:flex"
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
              className={`flex size-8 items-center justify-center rounded-full transition-colors ${
                activo
                  ? "bg-pc-teal text-white shadow-sm"
                  : "text-pc-ink-3 hover:bg-pc-hover hover:text-pc-ink"
              }`}
            >
              <Icon className="size-4" strokeWidth={activo ? 2.25 : 1.75} aria-hidden />
            </button>
          )
        })}
      </div>
    </>
  )
}
