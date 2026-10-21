"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * Monta `children` solo cuando el bloque está cerca del viewport.
 * Combinado con `next/dynamic`, evita descargar librerías pesadas (Recharts)
 * hasta que el usuario realmente se acerca a la gráfica — clave en móvil,
 * donde las gráficas quedan debajo de la lista.
 *
 * `minHeight` reserva el espacio para que la página no "salte" al montar.
 */
export function LazyOnView({
  children,
  minHeight,
  rootMargin = "400px",
  className,
}: {
  children: ReactNode
  minHeight: number
  rootMargin?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visible) return
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible, rootMargin])

  return (
    <div ref={ref} className={className} style={visible ? undefined : { minHeight }}>
      {visible ? children : null}
    </div>
  )
}

/** Placeholder animado con la altura de la gráfica (para `loading` de next/dynamic). */
export function ChartSkeleton({ height }: { height: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-xl bg-gray-100/80"
      style={{ height }}
      aria-hidden
    />
  )
}
