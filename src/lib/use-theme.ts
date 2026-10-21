"use client"

import { useCallback, useEffect, useState } from "react"
import {
  THEME_EVENT,
  THEME_KEY,
  applyTheme,
  readThemePref,
  type ResolvedTheme,
  type ThemePref,
} from "@/lib/theme"

/** Preferencia elegida (Claro/Oscuro/Sistema) + setter. Se sincroniza entre pestañas. */
export function useThemePref() {
  // "light" en SSR y primer render (igual que el servidor); se corrige al montar.
  const [pref, setPref] = useState<ThemePref>("light")

  useEffect(() => {
    const sync = () => setPref(readThemePref())
    sync()
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) sync()
    }
    window.addEventListener(THEME_EVENT, sync)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(THEME_EVENT, sync)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  const set = useCallback((next: ThemePref) => applyTheme(next), [])
  return [pref, set] as const
}

/** Tema efectivo ("light" | "dark") ya resuelto, para librerías que lo piden (sonner). */
export function useResolvedTheme(): ResolvedTheme {
  const [resolved, setResolved] = useState<ResolvedTheme>("light")

  useEffect(() => {
    const read = () =>
      setResolved(document.documentElement.classList.contains("dark") ? "dark" : "light")
    read()
    window.addEventListener(THEME_EVENT, read)
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    mq.addEventListener("change", read)
    return () => {
      window.removeEventListener(THEME_EVENT, read)
      mq.removeEventListener("change", read)
    }
  }, [])

  return resolved
}
