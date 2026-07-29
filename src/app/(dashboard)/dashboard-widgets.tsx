"use client"

import { useEffect, useState } from "react"
import { GripVertical } from "lucide-react"

/**
 * Dashboard modular: las secciones grandes se pueden reordenar arrastrando
 * el asa (⋮⋮) y el orden se guarda solo en localStorage.
 *
 * Las secciones llegan del SERVIDOR como ReactNodes (server components
 * completos con sus datos); este componente solo decide el orden — cero
 * re-fetching. El hero, las acciones rápidas y los KPIs quedan fuera a
 * propósito: la jerarquía superior es fija (regla 1), lo modular es el resto.
 */

const LS_KEY = "pc-dash-layout-v2"

export type WidgetSlot = { id: string; nombre: string; node: React.ReactNode }

export function DashboardWidgets({ slots }: { slots: WidgetSlot[] }) {
  const ids = slots.map((s) => s.id)
  const [order, setOrder] = useState<string[]>(ids)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  // Cargar orden guardado (ignorando ids que ya no existan y sumando nuevos).
  useEffect(() => {
    // Diferido: localStorage solo existe en el cliente y la regla de lint
    // prohibe setState sincrono dentro del efecto.
    const t = setTimeout(() => {
      try {
        const stored = JSON.parse(
          localStorage.getItem(LS_KEY) ?? "[]",
        ) as string[]
        if (Array.isArray(stored) && stored.length > 0) {
          const valid = stored.filter((id) => ids.includes(id))
          const missing = ids.filter((id) => !valid.includes(id))
          if (valid.length > 0) setOrder([...valid, ...missing])
        }
      } catch {
        // localStorage corrupto → orden default
      }
    }, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function drop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      setOverId(null)
      return
    }
    setOrder((prev) => {
      const next = prev.filter((id) => id !== dragId)
      next.splice(next.indexOf(targetId), 0, dragId)
      localStorage.setItem(LS_KEY, JSON.stringify(next))
      return next
    })
    setDragId(null)
    setOverId(null)
  }

  const byId = new Map(slots.map((s) => [s.id, s]))

  return (
    <div className="space-y-6 md:space-y-8">
      {order.map((id) => {
        const slot = byId.get(id)
        if (!slot) return null
        const dragging = dragId === id
        const over = overId === id && dragId !== id
        return (
          <section
            key={id}
            aria-label={slot.nombre}
            onDragOver={(e) => {
              if (dragId) {
                e.preventDefault()
                setOverId(id)
              }
            }}
            onDrop={() => drop(id)}
            className={`group/widget relative transition-all duration-150 ${
              dragging ? "opacity-40" : ""
            } ${over ? "translate-y-1" : ""}`}
          >
            {/* Asa de arrastre — aparece al pasar el mouse */}
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                setDragId(id)
                e.dataTransfer.effectAllowed = "move"
              }}
              onDragEnd={() => {
                setDragId(null)
                setOverId(null)
              }}
              aria-label={`Reordenar sección ${slot.nombre}`}
              title="Arrastra para reordenar"
              className="absolute -left-1 top-3 z-10 hidden cursor-grab rounded-md p-1 text-gray-300 opacity-0 transition-opacity duration-150 hover:bg-black/5 hover:text-gray-500 active:cursor-grabbing group-hover/widget:opacity-100 md:block"
            >
              <GripVertical className="size-4" />
            </button>
            {over && (
              <div className="absolute -top-3 left-0 right-0 h-0.5 rounded-full bg-[#0F766E]/40" />
            )}
            {slot.node}
          </section>
        )
      })}
    </div>
  )
}
