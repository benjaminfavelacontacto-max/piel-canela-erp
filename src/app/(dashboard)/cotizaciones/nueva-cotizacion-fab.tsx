"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { FileText, Plus, Zap } from "lucide-react"

/**
 * Botón flotante ÚNICO de la pantalla de Cotizaciones en móvil: «+ Nueva cotización».
 * Abre un menú con los dos flujos que ya existen (rápida y completa) en vez de repetir un
 * botón por cada uno. Vive justo encima de la barra inferior (`--pc-nav-total`, que ya incluye
 * el área segura del iPhone), alineado a la derecha.
 *
 * Mientras se hace scroll se encoge a un círculo con «+» (no tapa el contenido) y vuelve a su
 * forma completa cuando el scroll se detiene. Con «reducir movimiento» solo cambia de forma, sin deslizarse.
 */
export function NuevaCotizacionFab() {
  const [abierto, setAbierto] = useState(false)
  const [compacto, setCompacto] = useState(false)
  const reposo = useRef<ReturnType<typeof setTimeout> | null>(null)

  // El scroll vive en el <main> del dashboard (único contenedor de scroll de la pantalla).
  useEffect(() => {
    const main = document.querySelector("main")
    if (!main) return
    let ultimo = main.scrollTop
    const alScroll = () => {
      const y = main.scrollTop
      if (Math.abs(y - ultimo) > 6) {
        setCompacto(true)
        if (reposo.current) clearTimeout(reposo.current)
        reposo.current = setTimeout(() => setCompacto(false), 650)
      }
      ultimo = y
    }
    main.addEventListener("scroll", alScroll, { passive: true })
    return () => {
      main.removeEventListener("scroll", alScroll)
      if (reposo.current) clearTimeout(reposo.current)
    }
  }, [])

  useEffect(() => {
    if (!abierto) return
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false)
    window.addEventListener("keydown", tecla)
    return () => window.removeEventListener("keydown", tecla)
  }, [abierto])

  const encogido = compacto && !abierto

  return (
    <div className="md:hidden">
      {/* Capa para cerrar al tocar fuera (sin oscurecer: no es un modal) */}
      {abierto && (
        <button
          type="button"
          aria-label="Cerrar menú"
          tabIndex={-1}
          onClick={() => setAbierto(false)}
          className="fixed inset-0 z-30 cursor-default"
        />
      )}

      <div className="pc-bottom-safe fixed right-4 z-30 flex flex-col items-end gap-2">
        {abierto && (
          <div
            role="menu"
            aria-label="Nueva cotización"
            className="w-[232px] origin-bottom-right overflow-hidden rounded-2xl border border-pc-line bg-pc-card p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.22)] animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"
          >
            <Link
              role="menuitem"
              href="/cotizaciones/rapida"
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-gray-900 transition-colors duration-150 active:bg-pc-tint"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-pc-teal-soft text-pc-teal-ink">
                <Zap className="size-4" strokeWidth={2.25} />
              </span>
              <span className="flex flex-col leading-tight">
                Cotización rápida
                <span className="text-[11px] font-normal text-pc-ink-3">Con el cliente enfrente</span>
              </span>
            </Link>
            <Link
              role="menuitem"
              href="/cotizaciones/nueva"
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-gray-900 transition-colors duration-150 active:bg-pc-tint"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-pc-tint text-pc-ink-2">
                <FileText className="size-4" strokeWidth={2.25} />
              </span>
              <span className="flex flex-col leading-tight">
                Cotización completa
                <span className="text-[11px] font-normal text-pc-ink-3">Todos los campos</span>
              </span>
            </Link>
          </div>
        )}

        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-haspopup="menu"
          aria-expanded={abierto}
          aria-label="Nueva cotización"
          className="inline-flex h-12 items-center rounded-full bg-pc-teal text-white shadow-[0_8px_22px_rgba(15,118,110,0.35)] transition-[padding,transform,background-color] duration-200 ease-out active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
          style={{ paddingLeft: 14, paddingRight: encogido ? 14 : 18 }}
        >
          <Plus
            className={"size-5 shrink-0 transition-transform duration-200 motion-reduce:transition-none " + (abierto ? "rotate-45" : "")}
            strokeWidth={2.5}
          />
          <span
            className="overflow-hidden whitespace-nowrap text-sm font-semibold transition-[max-width,opacity,margin] duration-200 ease-out motion-reduce:transition-none"
            style={{ maxWidth: encogido ? 0 : 150, opacity: encogido ? 0 : 1, marginLeft: encogido ? 0 : 8 }}
          >
            Nueva cotización
          </span>
        </button>
      </div>
    </div>
  )
}
