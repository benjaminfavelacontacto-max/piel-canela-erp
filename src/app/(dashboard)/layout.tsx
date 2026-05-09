import { SidebarNav } from "@/components/sidebar-nav"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 min-h-screen">
      <aside className="w-64 shrink-0 border-r border-zinc-200 bg-white">
        <div className="px-5 py-5 border-b border-zinc-200">
          <h1 className="text-lg font-semibold tracking-tight text-amber-900">
            Piel Canela
          </h1>
          <p className="text-xs text-zinc-500">ERP</p>
        </div>
        <SidebarNav />
      </aside>
      <main className="flex-1 bg-zinc-50">{children}</main>
    </div>
  )
}
