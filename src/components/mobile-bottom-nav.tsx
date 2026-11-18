"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  FileText,
  MoreHorizontal,
  Package,
  ShoppingBag,
  Sparkles,
  Users,
} from "lucide-react"
import { OPEN_ASISTENTE_EVENT } from "@/lib/asistente/eventos"

const TABS = [
  { href: "/ventas", label: "Ventas", icon: ShoppingBag },
  { href: "/cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/inventario", label: "Inventario", icon: Package },
  { href: "/clientes", label: "Clientes", icon: Users },
] as const

// Cada acceso ocupa una de 6 columnas IGUALES: ícono (22 px) arriba y etiqueta abajo, siempre a la misma altura.
const ITEM =
  "relative flex h-full w-full flex-col items-center justify-center gap-[3px] whitespace-nowrap text-[10.5px] font-medium leading-none max-[359px]:text-[9px] max-[359px]:tracking-tighter transition-[color,background-color,transform] duration-150 active:scale-[0.96] active:bg-pc-tint motion-reduce:transition-none motion-reduce:active:scale-100"

/**
 * Barra de navegación inferior (solo móvil, < md). Seis columnas iguales: las 4 secciones de
 * uso diario, el Asistente con IA (entre Cotizaciones e Inventario) y "Más", que abre el menú
 * lateral con el resto. Alto fijo `--pc-nav-h` + el área segura del iPhone (`--pc-nav-total`).
 */
export function MobileBottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname()
  const inTabs = TABS.some((t) => pathname.startsWith(t.href))

  const indicador = (
    <span
      aria-hidden
      className="absolute inset-x-5 top-0 h-0.5 rounded-b-full"
      style={{ background: "var(--pc-accent)" }}
    />
  )

  return (
    <nav
      aria-label="Navegación inferior"
      className="fixed inset-x-0 bottom-0 z-30 md:hidden print:hidden"
      style={{
        // Fondo sólido (sin backdrop-filter: repintaría en cada frame del scroll) con un filete
        // y una sombra suave hacia arriba que lo separan del contenido sin añadir color nuevo.
        background: "var(--pc-bg-card)",
        borderTop: "1px solid var(--pc-hair)",
        boxShadow: "0 -10px 24px -14px rgba(0,0,0,0.28)",
        paddingBottom: "var(--pc-safe-bottom)",
        paddingLeft: "var(--pc-safe-left)",
        paddingRight: "var(--pc-safe-right)",
      }}
    >
      <ul className="mx-auto grid h-[var(--pc-nav-h)] max-w-xl grid-cols-6 items-stretch">
        {TABS.map(({ href, label, icon: Icon }, i) => {
          const active = pathname.startsWith(href)
          return (
            <li key={href} className="contents">
              {i === 2 && (
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new Event(OPEN_ASISTENTE_EVENT))}
                    aria-label="Abrir asistente con IA"
                    className={ITEM + " text-pc-ink-3"}
                  >
                    <span
                      className="pc-ai-orb flex size-[22px] items-center justify-center text-white"
                      style={{ boxShadow: "0 3px 10px rgba(20,184,166,0.35)" }}
                      aria-hidden
                    >
                      <Sparkles className="size-[12px]" strokeWidth={2.4} />
                    </span>
                    <span>Asistente</span>
                  </button>
                </div>
              )}
              <div className="min-w-0">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={ITEM}
                  style={{ color: active ? "var(--pc-accent-ink)" : "var(--pc-text-secondary)" }}
                >
                  {active && indicador}
                  <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  <span className={active ? "font-semibold" : ""}>{label}</span>
                </Link>
              </div>
            </li>
          )
        })}
        <li className="min-w-0">
          <button
            type="button"
            onClick={onMore}
            aria-label="Más secciones"
            className={ITEM}
            style={{ color: !inTabs ? "var(--pc-accent-ink)" : "var(--pc-text-secondary)" }}
          >
            {!inTabs && indicador}
            <MoreHorizontal className="size-[22px]" strokeWidth={!inTabs ? 2.25 : 1.75} aria-hidden />
            <span className={!inTabs ? "font-semibold" : ""}>Más</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
