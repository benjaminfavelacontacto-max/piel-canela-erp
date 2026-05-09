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
import { cn } from "@/lib/utils"

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
    <nav className="flex flex-col gap-0.5 px-2.5 py-4">
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-[13px] font-medium",
              "transition-all duration-180 ease-[cubic-bezier(.4,0,.2,1)]",
              active
                ? "pc-sidebar-active"
                : "border border-transparent text-gray-600 hover:bg-[rgba(15,23,42,.04)] hover:text-gray-900",
            )}
          >
            {/* Accent line izquierda — solo en activo (Linear-style) */}
            {active && (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[#0F766E]"
                style={{ boxShadow: "0 0 12px rgba(15,118,110,0.35)" }}
              />
            )}
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors duration-180",
                active
                  ? "text-[#0F766E]"
                  : "text-gray-400 group-hover:text-gray-700",
              )}
              strokeWidth={active ? 2.25 : 1.75}
            />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
