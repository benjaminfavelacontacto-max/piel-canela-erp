import { SidebarNav } from "@/components/sidebar-nav"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 shrink-0 border-r border-zinc-200 bg-white">
        <div className="relative overflow-hidden border-b border-zinc-200 bg-gradient-to-br from-pink-50/60 via-white to-teal-50/40 px-4 py-4">
          {/* Decorative glow */}
          <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-gradient-to-br from-pink-200/40 to-teal-200/40 blur-2xl" />
          <div className="relative flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Piel Canela"
              width={56}
              height={56}
              className="size-14 rounded-xl object-contain shadow-md ring-2 ring-white shrink-0"
            />
            <div className="min-w-0">
              <h1 className="bg-gradient-to-r from-pink-700 via-rose-600 to-teal-700 bg-clip-text text-sm font-bold tracking-tight text-transparent truncate">
                Piel Canela
              </h1>
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                ERP · CRM
              </p>
            </div>
          </div>
        </div>
        <SidebarNav />
      </aside>
      <main className="flex-1 overflow-y-auto overflow-x-hidden bg-zinc-50 min-w-0">
        {children}
      </main>
    </div>
  )
}
