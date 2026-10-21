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
  ShoppingCart,
  Home,
} from "lucide-react"

const items = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventario", label: "Inventario", icon: Package },
  { href: "/cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/ventas", label: "Ventas", icon: ShoppingBag },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/pedidos", label: "Pedidos", icon: ShoppingCart },
  { href: "/finanzas", label: "Finanzas", icon: TrendingUp },
  { href: "/piel-canela", label: "Piel Canela", icon: Home },
]

/**
 * Sidebar minimal estilo Linear.
 *
 * Activo = barra vertical del acento + fondo apenas perceptible + semibold +
 * icono un punto más grande. Nada de sombras ni glow. Hover: fondo suave y
 * desplazamiento de 1px en 150ms. Todo con clases (sin handlers JS) para que
 * los estados focus/hover queden consistentes y accesibles.
 */
export function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Navegación principal" className="flex flex-col gap-1 px-3 py-2">
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/30 ${
              active
                ? "bg-black/[0.04] font-semibold text-gray-900"
                : "font-normal text-gray-500 hover:translate-x-px hover:bg-black/[0.03] hover:text-gray-900"
            }`}
          >
            {active && (
              <span
                aria-hidden
                className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[#0F766E]"
              />
            )}
            <Icon
              className={`shrink-0 transition-all duration-150 ${
                active
                  ? "size-[18px] text-[#0F766E]"
                  : "size-4 text-gray-400 group-hover:text-gray-600"
              }`}
              strokeWidth={active ? 2 : 1.75}
            />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
