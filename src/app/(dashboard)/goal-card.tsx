"use client"

import { useEffect, useState } from "react"
import { Target, Pencil, Check } from "lucide-react"

/**
 * Meta mensual de ventas con barra de progreso.
 *
 * La meta se edita con el lápiz y se guarda en localStorage (no hay tabla de
 * objetivos en la BD y no la amerita). Default sugerido: el mejor mes de los
 * últimos 12, redondeado hacia arriba a decenas de miles — pasado por el
 * servidor en `metaSugerida`.
 */

const LS_KEY = "pc-meta-mensual-v1"

export function GoalCard({
  ventasMes,
  metaSugerida,
}: {
  ventasMes: number
  metaSugerida: number
}) {
  const [meta, setMeta] = useState(metaSugerida)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  useEffect(() => {
    // Diferido: localStorage solo existe en el cliente y la regla de lint
    // prohibe setState sincrono dentro del efecto.
    const t = setTimeout(() => {
      const stored = Number(localStorage.getItem(LS_KEY))
      if (Number.isFinite(stored) && stored > 0) setMeta(stored)
    }, 0)
    return () => clearTimeout(t)
  }, [])

  function commit() {
    const n = Number(draft.replace(/[^0-9.]/g, ""))
    if (Number.isFinite(n) && n > 0) {
      setMeta(n)
      localStorage.setItem(LS_KEY, String(n))
    }
    setEditing(false)
  }

  const pct = meta > 0 ? Math.min(100, (ventasMes / meta) * 100) : 0
  const falta = Math.max(0, meta - ventasMes)
  const fmt = (n: number) =>
    n.toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    })

  return (
    <div className="pc-kpi-card group">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-500">
          <Target className="size-3.5 text-[#0F766E]" />
          Meta mensual
        </p>
        {editing ? (
          <button
            type="button"
            onClick={commit}
            aria-label="Guardar meta"
            className="rounded-md p-1 text-[#0F766E] transition-colors hover:bg-black/5"
          >
            <Check className="size-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(String(meta))
              setEditing(true)
            }}
            aria-label="Editar meta mensual"
            className="rounded-md p-1 text-gray-300 opacity-0 transition-all group-hover:opacity-100 hover:bg-black/5 hover:text-gray-600 focus-visible:opacity-100"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>

      {editing ? (
        <input
          autoFocus
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          onBlur={commit}
          aria-label="Nueva meta mensual en pesos"
          className="w-full rounded-lg border border-[#0F766E]/30 bg-white px-2 py-1 text-xl font-bold tabular-nums text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
        />
      ) : (
        <p className="text-[26px] font-bold leading-none tracking-[-0.025em] tabular-nums text-gray-900">
          {fmt(meta)}
        </p>
      )}

      <div>
        <div className="h-2 overflow-hidden rounded-full bg-black/[0.05]">
          <div
            className="h-full rounded-full bg-[#0F766E] transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-baseline justify-between text-[11px]">
          <span className="font-semibold tabular-nums text-[#0F766E]">
            {pct.toFixed(0)}%
          </span>
          <span className="text-gray-500">
            {falta > 0 ? `faltan ${fmt(falta)}` : "¡Meta cumplida! 🎉"}
          </span>
        </div>
      </div>
    </div>
  )
}
