import type { ReactNode } from "react"

/**
 * Tarjeta de fila para listas en móvil (reemplaza la fila de tabla en < md).
 * Layout: [leading] título ........ monto
 *                   meta
 *                   footer ........ acciones
 * Tocar la tarjeta ejecuta `onOpen`; los controles internos (selects, menús)
 * deben frenar la propagación del click (el slot `actions` ya lo hace).
 */
export function ListCard({
  onOpen,
  ariaLabel,
  leading,
  title,
  badge,
  amount,
  amountClassName = "text-gray-900",
  meta,
  footer,
  actions,
}: {
  onOpen: () => void
  ariaLabel: string
  leading?: ReactNode
  title: ReactNode
  /** Chip junto al título (p. ej. "🏠 Interno") */
  badge?: ReactNode
  amount?: ReactNode
  amountClassName?: string
  meta?: ReactNode
  footer?: ReactNode
  actions?: ReactNode
}) {
  return (
    <article
      className="relative flex gap-3 rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors focus-within:ring-2 focus-within:ring-[#0F766E]/30 active:bg-[#F9FAFB]"
    >
      {leading}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            {/* Botón "estirado": su ::after cubre toda la tarjeta, así la tarjeta entera
                abre el detalle sin anidar controles dentro de un role=button (a11y).
                Los controles internos (selects, menús) van `relative` y quedan encima. */}
            <button
              type="button"
              onClick={onOpen}
              aria-label={ariaLabel}
              className="min-w-0 cursor-pointer text-left focus-visible:outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']"
            >
              <span className="line-clamp-2 break-words text-[15px] font-semibold leading-tight text-gray-900">
                {title}
              </span>
            </button>
            {badge}
          </div>
          {amount != null && (
            <p
              className={`shrink-0 text-base font-bold tabular-nums tracking-tight ${amountClassName}`}
            >
              {amount}
            </p>
          )}
        </div>
        {meta && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
            {meta}
          </div>
        )}
        {(footer || actions) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {footer}
            {actions && <div className="relative ml-auto">{actions}</div>}
          </div>
        )}
      </div>
    </article>
  )
}

/** Contenedor de tarjetas: solo móvil, con el fondo gris de las listas. */
export function ListCardGroup({
  empty,
  children,
}: {
  /** Mensaje cuando no hay filas (si se pasa y no hay hijos) */
  empty?: string
  children: ReactNode
}) {
  return (
    <div className="pc-stagger space-y-2.5 bg-[#F9FAFB] p-3 md:hidden">
      {children}
      {empty && (
        <p className="py-10 text-center text-sm text-gray-500">{empty}</p>
      )}
    </div>
  )
}
