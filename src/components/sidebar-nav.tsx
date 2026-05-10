"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Package,
  FileText,
  ShoppingBag,
  Users,
  TrendingUp,
} from "lucide-react"

const items = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventario", label: "Inventario", icon: Package },
  { href: "/cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/ventas", label: "Ventas", icon: ShoppingBag },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/finanzas", label: "Finanzas", icon: TrendingUp },
]

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-0.5 px-3 py-3">
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200"
            style={{
              background: active ? "rgba(255,255,255,0.85)" : "transparent",
              color: active ? "#1E1A33" : "rgba(0,0,0,0.55)",
              fontWeight: active ? 600 : 400,
              letterSpacing: active ? "-0.01em" : "0",
              boxShadow: active
                ? "0 2px 8px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.9) inset"
                : "none",
            }}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.background = "rgba(255,255,255,0.45)"
                e.currentTarget.style.color = "#0F172A"
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.background = "transparent"
                e.currentTarget.style.color = "rgba(0,0,0,0.55)"
              }
            }}
          >
            {active && (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full"
                style={{ background: "#8B5CF6" }}
              />
            )}
            <Icon
              className="size-4 shrink-0 transition-all"
              strokeWidth={active ? 2 : 1.75}
              style={{
                color: active ? "#8B5CF6" : "rgba(0,0,0,0.4)",
                filter: active
                  ? "drop-shadow(0 0 6px rgba(139,92,246,0.4))"
                  : "none",
              }}
            />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
