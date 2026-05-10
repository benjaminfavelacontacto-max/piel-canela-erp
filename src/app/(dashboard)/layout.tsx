import { SidebarNav } from "@/components/sidebar-nav"
import { NotificationBell } from "@/components/notifications"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="glass-app-bg flex h-screen overflow-hidden">
      <aside
        className="flex w-[224px] shrink-0 flex-col"
        style={{
          borderRight: "1px solid rgba(0,0,0,0.06)",
          background: "rgba(240,244,240,0.7)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
        }}
      >
        <div className="px-5 py-5">
          <div className="flex items-center gap-3">
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
          <NotificationBell />
        </div>
      </aside>
      <main
        className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden"
        style={{ background: "transparent" }}
      >
        {children}
      </main>
    </div>
  )
}
