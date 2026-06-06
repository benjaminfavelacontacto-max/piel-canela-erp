"use client"

import { LogOut } from "lucide-react"
import { logout } from "@/app/login/actions"

export function LogoutButton() {
  return (
    <form action={logout} className="contents">
      <button
        type="submit"
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-black/5 hover:text-rose-600"
      >
        <LogOut className="size-4" strokeWidth={1.75} />
      </button>
    </form>
  )
}
