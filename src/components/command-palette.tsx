"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  FileText,
  Home,
  Gauge,
  LayoutDashboard,
  Loader2,
  Package,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react"
import { buscarGlobal, type ResultadoBusqueda } from "./command-palette-actions"

type Item = {
  key: string
  titulo: string
  subtitulo?: string
  href: string
  icon: LucideIcon
  grupo: string
}

const ACCIONES: Item[] = [
  { key: "a-venta", titulo: "Nueva venta", href: "/ventas/nueva", icon: Plus, grupo: "Acciones rápidas" },
  { key: "a-cot", titulo: "Nueva cotización", href: "/cotizaciones/nueva", icon: Plus, grupo: "Acciones rápidas" },
  { key: "a-cli", titulo: "Nuevo cliente", href: "/clientes/nuevo", icon: Plus, grupo: "Acciones rápidas" },
  { key: "a-ped", titulo: "Nuevo pedido de compra", href: "/pedidos/nuevo", icon: Plus, grupo: "Acciones rápidas" },
  { key: "a-rep", titulo: "Reporte mensual (imprimir / PDF)", href: "/finanzas/reporte", icon: FileText, grupo: "Acciones rápidas" },
]
const SECCIONES: Item[] = [
  { key: "s-dash", titulo: "Dashboard", href: "/", icon: LayoutDashboard, grupo: "Ir a" },
  { key: "s-pan", titulo: "Panorama del negocio", href: "/panorama", icon: Gauge, grupo: "Ir a" },
  { key: "s-ven", titulo: "Ventas", href: "/ventas", icon: ShoppingBag, grupo: "Ir a" },
  { key: "s-cot", titulo: "Cotizaciones", href: "/cotizaciones", icon: FileText, grupo: "Ir a" },
  { key: "s-inv", titulo: "Inventario", href: "/inventario", icon: Package, grupo: "Ir a" },
  { key: "s-cli", titulo: "Clientes", href: "/clientes", icon: Users, grupo: "Ir a" },
  { key: "s-ped", titulo: "Pedidos de compra", href: "/pedidos", icon: ShoppingCart, grupo: "Ir a" },
  { key: "s-fin", titulo: "Finanzas", href: "/finanzas", icon: TrendingUp, grupo: "Ir a" },
  { key: "s-pc", titulo: "Piel Canela (salidas)", href: "/piel-canela", icon: Home, grupo: "Ir a" },
]

const ICONO: Record<ResultadoBusqueda["tipo"], LucideIcon> = {
  cliente: Users,
  producto: Package,
  venta: ShoppingBag,
  cotizacion: FileText,
}
const GRUPO: Record<ResultadoBusqueda["tipo"], string> = {
  cliente: "Clientes",
  producto: "Productos",
  venta: "Ventas",
  cotizacion: "Cotizaciones",
}

export const OPEN_PALETTE_EVENT = "pc:open-palette"

/**
 * Paleta de comandos (⌘K / Ctrl+K / "/"): busca clientes, productos, ventas y
 * cotizaciones y salta a acciones y secciones. Pantalla completa en móvil.
 */
export function CommandPalette() {
  const router = useRouter()
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [remotos, setRemotos] = useState<{ q: string; items: Item[] }>({ q: "", items: [] })
  const [buscando, setBuscando] = useState(false)
  const [activo, setActivo] = useState(0)

  const cerrar = useCallback(() => {
    setOpen(false)
    setQ("")
    setActivo(0)
  }, [])

  // Atajos globales + evento para botones de apertura
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = document.activeElement as HTMLElement | null
        const escribiendo =
          el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)
        if (!escribiendo) {
          e.preventDefault()
          setOpen(true)
        }
      }
    }
    const abrir = () => setOpen(true)
    window.addEventListener("keydown", onKey)
    window.addEventListener(OPEN_PALETTE_EVENT, abrir)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener(OPEN_PALETTE_EVENT, abrir)
    }
  }, [])

  // Foco + bloqueo de scroll al abrir
  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Búsqueda remota con debounce (las respuestas viejas se descartan)
  useEffect(() => {
    const consulta = q.trim()
    if (!open || consulta.length < 2) return
    let cancelado = false
    const t = setTimeout(async () => {
      setBuscando(true)
      try {
        const res = await buscarGlobal(consulta)
        if (cancelado) return
        setRemotos({
          q: consulta,
          items: res.map((r) => ({
            key: `${r.tipo}-${r.id}`,
            titulo: r.titulo,
            subtitulo: r.subtitulo,
            href: r.href,
            icon: ICONO[r.tipo],
            grupo: GRUPO[r.tipo],
          })),
        })
      } catch {
        if (!cancelado) setRemotos({ q: consulta, items: [] })
      } finally {
        if (!cancelado) setBuscando(false)
      }
    }, 200)
    return () => {
      cancelado = true
      clearTimeout(t)
    }
  }, [q, open])

  const items: Item[] = useMemo(() => {
    const consulta = q.trim().toLowerCase()
    if (consulta.length < 2) return [...ACCIONES, ...SECCIONES]
    const locales = [...ACCIONES, ...SECCIONES].filter((i) =>
      i.titulo.toLowerCase().includes(consulta),
    )
    const rem = remotos.q === q.trim() ? remotos.items : []
    return [...rem, ...locales]
  }, [q, remotos])

  function ir(item: Item) {
    cerrar()
    router.push(item.href)
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault()
      cerrar()
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      setActivo((a) => Math.min(items.length - 1, a + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActivo((a) => Math.max(0, a - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const it = items[activo]
      if (it) ir(it)
    }
  }

  // Mantener visible el elemento activo
  useEffect(() => {
    document.getElementById(`${listId}-${activo}`)?.scrollIntoView({ block: "nearest" })
  }, [activo, listId])

  if (!open) return null

  let grupoPrevio = ""
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center md:p-4 md:pt-[12vh]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={cerrar} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar y navegar"
        className="relative flex max-h-dvh w-full flex-col overflow-hidden bg-white shadow-2xl md:max-h-[70vh] md:max-w-xl md:rounded-2xl"
      >
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 pt-[max(0.25rem,var(--pc-safe-top))] md:pt-0">
          <Search className="size-4 shrink-0 text-gray-400" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="go"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items[activo] ? `${listId}-${activo}` : undefined}
            autoComplete="off"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setActivo(0)
            }}
            onKeyDown={onInputKey}
            placeholder="Buscar cliente, producto, folio…"
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-gray-900 placeholder:text-gray-500 focus:outline-none"
          />
          {buscando && <Loader2 className="size-4 animate-spin text-gray-400" aria-label="Buscando" />}
          <button
            type="button"
            onClick={cerrar}
            className="h-9 shrink-0 rounded-lg border border-gray-200 px-2.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
          >
            Esc
          </button>
        </div>

        <ul id={listId} role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1.5">
          {items.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-gray-500">
              {buscando ? "Buscando…" : `Sin resultados para “${q.trim()}”`}
            </li>
          )}
          {items.map((it, i) => {
            const mostrarGrupo = it.grupo !== grupoPrevio
            grupoPrevio = it.grupo
            const Icono = it.icon
            return (
              <li key={it.key} role="presentation">
                {mostrarGrupo && (
                  <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    {it.grupo}
                  </p>
                )}
                <button
                  type="button"
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === activo}
                  onMouseMove={() => setActivo(i)}
                  onClick={() => ir(it)}
                  className={`flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left ${
                    i === activo ? "bg-[#0F766E]/[0.07]" : ""
                  }`}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                      i === activo ? "bg-[#0F766E] text-white" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    <Icono className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{it.titulo}</span>
                    {it.subtitulo && (
                      <span className="block truncate text-xs text-gray-500">{it.subtitulo}</span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <p className="hidden border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500 md:block">
          ↑↓ para moverte · Enter para abrir · Esc para cerrar · <kbd className="font-sans">/</kbd> o <kbd className="font-sans">⌘K</kbd> para buscar desde cualquier pantalla
        </p>
      </div>
    </div>
  )
}
