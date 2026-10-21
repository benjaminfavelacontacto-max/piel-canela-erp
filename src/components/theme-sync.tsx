"use client"

import { useEffect } from "react"
import { THEME_EVENT, THEME_KEY, paintTheme, readThemePref, resolveTheme } from "@/lib/theme"

/**
 * Mantiene el tema coherente después de la carga:
 *  · pinta el color de la barra del navegador (el <meta> aún no existía en el script de <head>),
 *  · sigue al sistema cuando la preferencia es "Sistema",
 *  · sincroniza pestañas,
 *  · imprime SIEMPRE en claro (reporte mensual / PDF): quita `dark` mientras dura la impresión.
 */
export function ThemeSync() {
  useEffect(() => {
    const sync = () => paintTheme(resolveTheme(readThemePref()))
    sync()

    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onSystem = () => {
      if (readThemePref() === "system") sync()
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) sync()
    }
    const onBeforePrint = () => document.documentElement.classList.remove("dark")

    mq.addEventListener("change", onSystem)
    window.addEventListener("storage", onStorage)
    window.addEventListener(THEME_EVENT, sync)
    window.addEventListener("beforeprint", onBeforePrint)
    window.addEventListener("afterprint", sync)
    return () => {
      mq.removeEventListener("change", onSystem)
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(THEME_EVENT, sync)
      window.removeEventListener("beforeprint", onBeforePrint)
      window.removeEventListener("afterprint", sync)
    }
  }, [])

  return null
}
