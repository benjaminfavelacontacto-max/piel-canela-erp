import { SidebarNav } from "@/components/sidebar-nav"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F8FA]">
      <aside className="w-60 shrink-0 border-r border-[#E7EAF0] bg-[#FBFCFD]">
        <div className="border-b border-[#EEF1F4] px-5 py-5">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Piel Canela"
              width={36}
              height={36}
              className="size-9 rounded-lg object-contain shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-[13.5px] font-semibold tracking-tight text-gray-900 truncate">
                Piel Canela
              </h1>
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
                ERP · CRM
              </p>
            </div>
          </div>
        </div>
        <SidebarNav />
      </aside>
      <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
        {children}
      </main>
    </div>
  )
}
