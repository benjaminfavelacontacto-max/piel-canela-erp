"use client"

import { useActionState } from "react"
import { login, type LoginState } from "./actions"

const initialState: LoginState = {}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState)

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        background: "linear-gradient(135deg, #1E1A33 0%, #2A244A 100%)",
      }}
    >
      <div
        className="w-full max-w-[380px] rounded-3xl px-7 py-9"
        style={{
          background: "rgba(255,255,255,0.04)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
        }}
      >
        {/* Logo + marca */}
        <div className="mb-7 flex flex-col items-center text-center">
          <div
            className="mb-4 flex size-14 items-center justify-center overflow-hidden rounded-2xl"
            style={{
              background: "rgba(255,255,255,0.9)",
              boxShadow: "0 6px 20px rgba(139,92,246,0.25)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Piel Canela"
              className="size-10 object-contain"
            />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-white">
            Piel Canela ERP
          </h1>
          <p
            className="mt-1 text-[11px] font-medium uppercase"
            style={{ color: "rgba(233,213,255,0.55)", letterSpacing: "0.14em" }}
          >
            Acceso privado
          </p>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="password"
              className="text-[12px] font-medium"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoFocus
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.border = "1px solid #8B5CF6"
                e.currentTarget.style.boxShadow =
                  "0 0 0 3px rgba(139,92,246,0.18)"
              }}
              onBlur={(e) => {
                e.currentTarget.style.border = "1px solid rgba(255,255,255,0.12)"
                e.currentTarget.style.boxShadow = "none"
              }}
            />
          </div>

          {state.error && (
            <p
              className="rounded-lg px-3 py-2 text-[12px] font-medium"
              style={{
                background: "rgba(185,28,28,0.14)",
                border: "1px solid rgba(248,113,113,0.3)",
                color: "#FCA5A5",
              }}
            >
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all disabled:opacity-60"
            style={{
              background: "#8B5CF6",
              boxShadow: "0 6px 18px rgba(139,92,246,0.35)",
            }}
            onMouseEnter={(e) => {
              if (!pending) e.currentTarget.style.background = "#7C3AED"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#8B5CF6"
            }}
          >
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p
          className="mt-6 text-center text-[10.5px]"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          Solo personal autorizado · Sandra &amp; Benjamín
        </p>
      </div>
    </div>
  )
}
