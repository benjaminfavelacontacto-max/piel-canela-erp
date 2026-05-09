import { SidebarNav } from "@/components/sidebar-nav"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 min-h-screen">
      <aside className="w-64 shrink-0 border-r border-zinc-200 bg-white">
        <div className="px-5 py-5 border-b border-zinc-200 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Piel Canela"
            width={56}
            height={56}
            className="w-14 h-14 rounded-lg object-contain shrink-0"
          />
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-teal-700 truncate">
              Piel Canela
            </h1>
            <p className="text-xs text-zinc-500">ERP</p>
          </div>
        </div>
        <SidebarNav />
      </aside>
      <main className="flex-1 bg-zinc-50">{children}</main>
    </div>
  )
}
