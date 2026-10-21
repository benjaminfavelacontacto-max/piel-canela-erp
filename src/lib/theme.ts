/**
 * Tema Claro / Oscuro / Sistema.
 *
 * La preferencia vive en localStorage ("pc-theme") y se aplica con la clase
 * `dark` en <html> (ver globals.css → `:root.dark`). Por defecto: Claro.
 * Módulo puro (sin "use client"): lo importan el layout del servidor (para el
 * script anti-parpadeo) y los componentes del cliente.
 */
export type ThemePref = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

export const THEME_KEY = "pc-theme"
export const THEME_EVENT = "pc-theme-change"
/** Color de la barra del navegador / PWA según el tema. */
export const THEME_COLOR: Record<ResolvedTheme, string> = { light: "#F5F7F6", dark: "#0C1012" }

/**
 * Se ejecuta en <head> ANTES de pintar: evita el destello blanco al abrir en
 * oscuro. Debe ser autosuficiente (no importa nada) y tolerar localStorage bloqueado.
 */
export const themeInitScript = `(function(){try{var p=localStorage.getItem('${THEME_KEY}');var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === "dark" || v === "system" || v === "light" ? v : "light"
  } catch {
    return "light"
  }
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }
  return pref
}

/** Pone la clase, el color de la barra del navegador y avisa a quien escuche. */
export function paintTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.classList.toggle("dark", resolved === "dark")
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute("content", THEME_COLOR[resolved])
}

/** Guarda la preferencia y la aplica. */
export function applyTheme(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_KEY, pref)
  } catch {
    /* sin almacenamiento: se aplica solo en esta sesión */
  }
  paintTheme(resolveTheme(pref))
  window.dispatchEvent(new Event(THEME_EVENT))
}
