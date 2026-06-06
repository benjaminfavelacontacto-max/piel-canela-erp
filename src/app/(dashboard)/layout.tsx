"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"
import { SidebarNav } from "@/components/sidebar-nav"
import { NotificationBell } from "@/components/notifications"
import { LogoutButton } from "@/components/logout-button"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

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
    <div className="glass-app-bg flex h-screen overflow-hidden">
      {/* ─── Hamburger móvil — visible solo en < md ─── */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú"
        className="fixed left-3 top-3 z-30 flex size-9 items-center justify-center rounded-xl md:hidden"
        style={{
          background: "rgba(255,255,255,0.85)",
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          color: "#0F172A",
        }}
      >
        <Menu className="size-4" strokeWidth={2} />
      </button>

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
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] shrink-0 flex-col transition-transform duration-300 md:relative md:z-auto md:w-[224px] md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        style={{
          borderRight: "1px solid rgba(0,0,0,0.06)",
          background: "rgba(240,244,240,0.95)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
        }}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl"
              style={{
                background: "rgba(255,255,255,0.8)",
                boxShadow:
                  "0 2px 8px rgba(0,0,0,0.1), 0 1px 0 rgba(255,255,255,0.9) inset",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
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
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
        {/* Footer glass: avatar + campana */}
        <div
          className="mx-3 mb-4 flex items-center justify-between gap-2 rounded-2xl px-3 py-3"
          style={{
            background: "rgba(255,255,255,0.6)",
            border: "1px solid rgba(255,255,255,0.7)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
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
        className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden"
        style={{ background: "transparent" }}
      >
        {/* Padding-top extra en móvil para que el contenido no quede debajo del hamburger */}
        <div className="pt-12 md:pt-0">{children}</div>
      </main>
    </div>
  )
}
