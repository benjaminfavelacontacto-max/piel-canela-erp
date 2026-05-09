/**
 * Layout público del portal de pedidos /order.
 *
 * Aislado del dashboard: no hereda sidebar ni navegación interna. NO incluye
 * <html>/<body> porque el root layout (src/app/layout.tsx) ya los provee.
 */
export default function OrderLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      <header className="sticky top-0 z-50 border-b border-[rgba(15,23,42,0.06)] bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Piel Canela"
            className="size-10 rounded-xl object-contain"
          />
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-gray-900">
              Piel Canela
            </h1>
            <p className="text-[11px] text-gray-500">
              Spa &amp; Bronceado · Catálogo de productos
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[10px] uppercase tracking-wider text-gray-400">
              ¿Dudas?
            </p>
            <a
              href="https://wa.me/523332508073"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-emerald-600 hover:underline"
            >
              WhatsApp →
            </a>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
