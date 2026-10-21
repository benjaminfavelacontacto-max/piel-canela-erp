"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Search, X } from "lucide-react"
import { SidebarNav } from "@/components/sidebar-nav"
import { NotificationBell } from "@/components/notifications"
import { LogoutButton } from "@/components/logout-button"
import { MobileBottomNav } from "@/components/mobile-bottom-nav"
import { CommandPalette, OPEN_PALETTE_EVENT } from "@/components/command-palette"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  // Flujos de captura con su propia barra de acciones fija abajo (cotización rápida / nueva / editar):
  // ahí la barra inferior de navegación estorbaría, así que se oculta y la pantalla usa todo el alto.
  const flujoConBarraPropia = /^\/cotizaciones\/(rapida|nueva)(\/|$)|^\/cotizaciones\/[^/]+\/editar(\/|$)/.test(pathname)

  // Cerrar drawer al cambiar de ruta
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Bloquear scroll del body cuando drawer abierto en móvil
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [mobileOpen])

  return (
    <div className="glass-app-bg flex h-dvh overflow-hidden print:block print:h-auto print:overflow-visible">
      {/* ─── Overlay backdrop móvil ─── */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          aria-hidden="true"
        />
      )}

      {/* ─── Sidebar (drawer en móvil, estático en desktop) ─── */}
      <aside
        className={`print:hidden fixed inset-y-0 left-0 z-50 flex w-[260px] shrink-0 flex-col transition-transform duration-300 md:relative md:z-auto md:w-[224px] md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        style={{
          borderRight: "1px solid rgba(0,0,0,0.05)",
          background: "var(--pc-bg-sidebar)",
        }}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/5 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icons/icon-192.png"
                alt="Piel Canela"
                width={28}
                height={28}
                className="size-7 object-contain"
              />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-[13.5px] font-semibold tracking-tight text-gray-900">
                Piel Canela
              </h1>
              <p
                className="text-[10px] font-medium uppercase"
                style={{
                  color: "rgba(0,0,0,0.35)",
                  letterSpacing: "0.12em",
                }}
              >
                ERP · CRM
              </p>
            </div>
          </div>
          {/* Cerrar drawer (solo móvil) */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
            className="flex size-7 items-center justify-center rounded-lg text-gray-500 hover:bg-black/5 md:hidden"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        {/* Búsqueda global (⌘K) */}
        <div className="px-3">
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false)
              window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))
            }}
            className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-[rgba(15,23,42,0.08)] bg-white/70 px-3 text-sm text-gray-500 transition hover:bg-white md:h-9"
          >
            <Search className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="flex-1 text-left">Buscar…</span>
            <kbd className="hidden rounded-md border border-gray-200 bg-white px-1.5 py-0.5 font-sans text-[10px] font-medium text-gray-500 md:inline">
              ⌘K
            </kbd>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
        {/* Footer glass: avatar + campana */}
        <div
          className="mx-3 mb-4 flex items-center justify-between gap-2 rounded-2xl px-3 py-3"
          style={{
            background: "#FFFFFF",
            border: "1px solid rgba(0,0,0,0.05)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
              style={{
                background: "linear-gradient(135deg, #1B3022, #2D5A43)",
                boxShadow: "0 2px 6px rgba(27,48,34,0.4)",
              }}
            >
              B
            </div>
            <span className="truncate text-xs font-semibold text-gray-800">
              Benjamín
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationBell />
            <LogoutButton />
          </div>
        </div>
      </aside>

      <main
        // tabIndex=0: la región con scroll debe poder enfocarse con teclado (WCAG 2.1.1)
        tabIndex={0}
        className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0F766E]/40 print:overflow-visible"
        style={{ background: "transparent" }}
      >
        {/* Móvil: respeta notch arriba y deja espacio para la barra inferior */}
        <div
          className={`pt-[var(--pc-safe-top)] md:pb-0 md:pt-0 ${
            flujoConBarraPropia ? "" : "pb-[calc(var(--pc-nav-h)+var(--pc-safe-bottom))]"
          }`}
        >
          {children}
        </div>
      </main>

      {!flujoConBarraPropia && <MobileBottomNav onMore={() => setMobileOpen(true)} />}
      <CommandPalette />
    </div>
  )
}
