"use client"

import { useId, useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

export type PanelPlegable = {
  id: string
  titulo: string
  /** Título corto para pantallas angostas (iPhone). */
  corto?: string
  icono: ReactNode
  /** Dato corto junto al título (solo ≥ sm). */
  resumen?: ReactNode
  contenido: ReactNode
}

/**
 * Una sola barra delgada con un botón por panel; el panel elegido se despliega
 * debajo, a todo el ancho. Cerrado por defecto: no le quita la primera vista a lo
 * importante (en Inventario, la tabla con las fotos). Abre uno a la vez.
 *
 * El contenido se monta la primera vez que se abre y, cerrado, queda `inert`
 * (sin foco ni lector de pantalla).
 */
export function PanelesPlegables({ paneles, className = "" }: { paneles: PanelPlegable[]; className?: string }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const [montados, setMontados] = useState<ReadonlySet<string>>(new Set())
  const base = useId()

  function alternar(id: string) {
    setMontados((s) => new Set(s).add(id))
    setAbierto((a) => (a === id ? null : id))
  }

  return (
    <section className={`overflow-hidden rounded-2xl border border-pc-line bg-pc-card shadow-sm ${className}`}>
      <div className="flex divide-x divide-pc-line-soft">
        {paneles.map((p) => {
          const open = abierto === p.id
          return (
            <h2 key={p.id} className="m-0 min-w-0 flex-1">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`${base}-${p.id}`}
                onClick={() => alternar(p.id)}
                className={`pc-tap flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-pc-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pc-teal md:gap-3 md:px-4 ${
                  open ? "bg-pc-subtle shadow-[inset_0_-2px_0_var(--pc-accent)]" : ""
                }`}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-pc-teal-soft text-pc-teal-ink max-[400px]:hidden">
                  {p.icono}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em] text-pc-ink">
                  <span className="md:hidden">{p.corto ?? p.titulo}</span>
                  <span className="hidden md:inline">{p.titulo}</span>
                </span>
                {p.resumen && (
                  <span className="hidden shrink-0 text-[11.5px] font-semibold tabular-nums text-pc-ink-2 sm:block">
                    {p.resumen}
                  </span>
                )}
                <ChevronDown
                  className={`size-4 shrink-0 text-pc-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
            </h2>
          )
        })}
      </div>
      {paneles.map((p) => {
        const open = abierto === p.id
        return (
          <div
            key={p.id}
            id={`${base}-${p.id}`}
            inert={!open}
            className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
          >
            <div className="min-h-0 overflow-hidden">
              {montados.has(p.id) && (
                <div className="border-t border-pc-line-soft px-4 pb-4 pt-4 md:px-5 md:pb-5">{p.contenido}</div>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}
