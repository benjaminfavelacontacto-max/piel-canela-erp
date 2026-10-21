"use client"

import { useRef, useState } from "react"

/**
 * Estado de arrastre para "bottom sheets" móviles: el usuario arrastra el asa
 * hacia abajo y, pasado el umbral, se cierra. Úsalo con <SheetHandle />.
 */
export function useSheetDrag(onClose: () => void, threshold = 90) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<number | null>(null)

  const handleProps = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      start.current = e.clientY
      setDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (start.current === null) return
      setDragY(Math.max(0, e.clientY - start.current))
    },
    onPointerUp: () => {
      const closeIt = dragY > threshold
      start.current = null
      setDragging(false)
      setDragY(0)
      if (closeIt) onClose()
    },
    onPointerCancel: () => {
      start.current = null
      setDragging(false)
      setDragY(0)
    },
  }

  return {
    dragging,
    /** style inline para el panel mientras se arrastra */
    style: dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined,
    handleProps,
  }
}

/** Asa visual de la hoja (solo visible < md). */
export function SheetHandle(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-t-3xl bg-pink-50 md:hidden"
      aria-hidden
    >
      <span className="h-1.5 w-10 rounded-full bg-gray-300" />
    </div>
  )
}

/**
 * Clases del panel: hoja desde abajo en móvil, panel lateral derecho en md+.
 * `maxW` = ancho máximo del panel lateral (clase tailwind md:max-w-[..]).
 */
export function sheetClass({
  open,
  dragging,
  maxW,
}: {
  open: boolean
  dragging: boolean
  maxW: string
}) {
  return `fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl bg-white shadow-2xl ease-out md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:w-full ${maxW} md:rounded-none ${dragging ? "" : "transition-transform duration-300"} ${open ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-x-full md:translate-y-0"}`
}
