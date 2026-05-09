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
    <nav className="flex flex-col gap-0.5 px-3 py-4">
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium",
              "transition-all duration-180 ease-[cubic-bezier(.4,0,.2,1)]",
              active
                ? "text-[#0F766E]"
                : "text-gray-600 hover:bg-[rgba(15,23,42,.04)] hover:text-gray-900",
            )}
            style={
              active
                ? {
                    background:
                      "linear-gradient(90deg, rgba(15,118,110,.12), rgba(15,118,110,.04))",
                  }
                : undefined
            }
          >
            <Icon
              className={cn(
                "size-[18px] shrink-0 transition-colors duration-180",
                active
                  ? "text-[#0F766E]"
                  : "text-gray-400 group-hover:text-gray-700",
              )}
            />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
