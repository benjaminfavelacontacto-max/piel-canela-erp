import { MessageCircle } from "lucide-react"
import { ThemeSwitch } from "./theme-switch"

/**
 * Layout público del portal de pedidos /order.
 *
 * Aislado del dashboard: no hereda sidebar ni navegación interna. NO incluye
 * <html>/<body> porque el root layout (src/app/layout.tsx) ya los provee.
 * Los colores son tokens `pc-*`, así que sigue el tema Claro / Oscuro.
 */
export default function OrderLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-pc-app text-pc-ink">
      <header className="border-b border-pc-line bg-pc-card">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt="Piel Canela"
            className="size-11 rounded-xl object-contain"
          />
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-pc-ink">
              Piel Canela
            </h1>
            <p className="truncate text-xs text-pc-ink-3">
              Catálogo y pedidos en línea
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="https://wa.me/523332508073"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded-full border border-pc-green-line bg-pc-green-soft px-3 py-1.5 text-xs font-semibold text-pc-green-ink transition-colors hover:opacity-80 sm:flex"
            >
              <MessageCircle className="size-3.5" aria-hidden />
              ¿Dudas? WhatsApp
            </a>
            <a
              href="https://wa.me/523332508073"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Escríbenos por WhatsApp"
              className="flex size-8 items-center justify-center rounded-full border border-pc-green-line bg-pc-green-soft text-pc-green-ink sm:hidden"
            >
              <MessageCircle className="size-4" aria-hidden />
            </a>
            <ThemeSwitch />
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
