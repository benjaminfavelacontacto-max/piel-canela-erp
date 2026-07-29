"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, FileText, ShoppingBag, Users, Package } from "lucide-react"

/**
 * Buscador global del dashboard (⌘K / Ctrl+K).
 *
 * Recibe un índice compacto pre-cargado por el servidor (clientes, productos,
 * ventas y cotizaciones) y filtra en el cliente — cero requests al teclear.
 * El popover de resultados es glass (regla: glassmorphism solo en overlays).
 */

export type SearchItem = {
  tipo: "cliente" | "producto" | "venta" | "cotizacion"
  label: string
  sub: string | null
  href: string
}

const TIPO_META: Record<
  SearchItem["tipo"],
  { icon: React.ComponentType<{ className?: string }>; badge: string }
> = {
  cliente: { icon: Users, badge: "Cliente" },
  producto: { icon: Package, badge: "Producto" },
  venta: { icon: ShoppingBag, badge: "Venta" },
  cotizacion: { icon: FileText, badge: "Cotización" },
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")

export function GlobalSearch({ items }: { items: SearchItem[] }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(0)

  // ⌘K / Ctrl+K enfoca el buscador desde cualquier parte del dashboard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const results = useMemo(() => {
    const q = norm(query.trim())
    if (q.length < 2) return []
    return items
      .filter((it) => norm(`${it.label} ${it.sub ?? ""}`).includes(q))
      .slice(0, 8)
  }, [query, items])

  function go(item: SearchItem) {
    setOpen(false)
    setQuery("")
    router.push(item.href)
  }

  return (
    <div className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-label="Buscar clientes, productos, ventas y cotizaciones"
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setSel(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setSel((s) => Math.min(s + 1, results.length - 1))
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setSel((s) => Math.max(s - 1, 0))
          } else if (e.key === "Enter" && results[sel]) {
            e.preventDefault()
            go(results[sel])
          }
        }}
        placeholder="Buscar…"
        className="h-10 w-full rounded-xl border border-black/5 bg-white pl-9 pr-12 text-sm text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.03)] transition-all duration-150 placeholder:text-gray-400 hover:border-black/10 focus:border-[#0F766E]/40 focus:outline-none focus:ring-2 focus:ring-[#0F766E]/15"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-black/5 bg-[#FAFAFA] px-1.5 py-0.5 font-sans text-[10px] font-medium text-gray-400 sm:block">
        ⌘K
      </kbd>

      {open && results.length > 0 && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          {/* Popover glass — único lugar del buscador con blur */}
          <ul className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-2xl border border-white/70 bg-white/85 py-1.5 shadow-[0_24px_48px_rgba(15,23,42,0.16)] backdrop-blur-2xl backdrop-saturate-150">
            {results.map((r, i) => {
              const M = TIPO_META[r.tipo]
              const Icon = M.icon
              return (
                <li key={`${r.tipo}-${r.href}-${i}`}>
                  <button
                    type="button"
                    onClick={() => go(r)}
                    onMouseEnter={() => setSel(i)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-100 ${
                      i === sel ? "bg-[#0F766E]/[0.07]" : ""
                    }`}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#F5F7F6] text-gray-500">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-gray-900">
                        {r.label}
                      </span>
                      {r.sub && (
                        <span className="block truncate text-[11px] text-gray-500">
                          {r.sub}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 rounded-md bg-[#FAFAFA] px-1.5 py-0.5 text-[10px] font-medium text-gray-400 ring-1 ring-black/5">
                      {M.badge}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
