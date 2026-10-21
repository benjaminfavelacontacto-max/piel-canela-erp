"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  FileText,
  MoreHorizontal,
  Package,
  ShoppingBag,
  Users,
} from "lucide-react"

const TABS = [
  { href: "/ventas", label: "Ventas", icon: ShoppingBag },
  { href: "/cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/inventario", label: "Inventario", icon: Package },
  { href: "/clientes", label: "Clientes", icon: Users },
] as const

/**
 * Barra de navegación inferior (solo móvil, < md). Las 4 secciones de uso
 * diario + "Más", que abre el menú lateral con el resto (Inicio, Pedidos,
 * Finanzas, Piel Canela, notificaciones y salir).
 */
export function MobileBottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname()
  const inTabs = TABS.some((t) => pathname.startsWith(t.href))

  return (
    <nav
      aria-label="Navegación inferior"
      className="fixed inset-x-0 bottom-0 z-30 border-t md:hidden print:hidden"
      style={{
        // Fondo casi sólido (sin backdrop-filter): el blur sobre una barra fija
        // vuelve a pintar en cada frame del scroll y se nota en Android de gama media.
        background: "var(--pc-bg-card)",
        borderColor: "var(--pc-border)",
        paddingBottom: "var(--pc-safe-bottom)",
        paddingLeft: "var(--pc-safe-left)",
        paddingRight: "var(--pc-safe-right)",
      }}
    >
      <ul className="mx-auto flex h-[var(--pc-nav-h)] max-w-xl items-stretch">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors active:bg-black/[0.03]"
                style={{ color: active ? "var(--pc-accent-ink)" : "var(--pc-text-secondary)" }}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-5 top-0 h-0.5 rounded-b-full"
                    style={{ background: "var(--pc-accent)" }}
                  />
                )}
                <Icon
                  className="size-[22px]"
                  strokeWidth={active ? 2.25 : 1.75}
                  aria-hidden
                />
                <span className={active ? "font-semibold" : ""}>{label}</span>
              </Link>
            </li>
          )
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={onMore}
            aria-label="Más secciones"
            className="relative flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors active:bg-black/[0.03]"
            style={{ color: !inTabs ? "var(--pc-accent-ink)" : "var(--pc-text-secondary)" }}
          >
            {!inTabs && (
              <span
                aria-hidden
                className="absolute inset-x-5 top-0 h-0.5 rounded-b-full"
                style={{ background: "var(--pc-accent)" }}
              />
            )}
            <MoreHorizontal
              className="size-[22px]"
              strokeWidth={!inTabs ? 2.25 : 1.75}
              aria-hidden
            />
            <span className={!inTabs ? "font-semibold" : ""}>Más</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
