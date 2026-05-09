import { SidebarNav } from "@/components/sidebar-nav"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#F6F7F9]">
      <aside
        className="w-60 shrink-0 bg-[#FBFCFD]"
        style={{ borderRight: "1px solid rgba(15,23,42,.06)" }}
      >
        <div
          className="px-5 py-5"
          style={{ borderBottom: "1px solid rgba(15,23,42,.04)" }}
        >
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
