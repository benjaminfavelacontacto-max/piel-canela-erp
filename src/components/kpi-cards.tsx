"use client"

import { useState } from "react"
import { HelpCircle, AlertTriangle } from "lucide-react"

/**
 * Tarjetas de KPI con un (?) que explica de dónde sale cada número.
 *
 * Solo presentación: cada pantalla arma sus propias tarjetas con su
 * matemática (ver `venta-kpis.tsx` y `cotizacion-kpis.tsx`). La ayuda se
 * escribe con los importes REALES del documento — nunca una fórmula genérica —
 * y las inconsistencias se marcan con `alerta` en vez de esconderse.
 *
 * Estética limpia (Linear/Stripe): tarjeta sólida con borde suave y sombra
 * casi imperceptible; el glass queda SOLO en el popover del (?) — regla del
 * design system: glassmorphism únicamente en menús/popovers/modales.
 *
 * El popover usa el patrón de capa-para-cerrar (mismo que el selector de
 * cliente de cotizaciones): sin efectos ni listeners globales.
 */

export type KpiFila = { texto: string; valor?: string; alerta?: boolean }

/** Tono semántico: pinta el chip del icono y el número a juego. */
export type KpiTone =
  | "neutral"
  | "teal"
  | "emerald"
  | "rose"
  | "amber"
  | "blue"
  | "fuchsia"

const TONE: Record<
  KpiTone,
  { value: string; icon: string; chip: string }
> = {
  neutral: { value: "text-gray-900", icon: "text-gray-500", chip: "bg-gray-100" },
  teal: { value: "text-[#0F766E]", icon: "text-[#0F766E]", chip: "bg-[#DFF7F4]" },
  emerald: { value: "text-emerald-700", icon: "text-emerald-700", chip: "bg-emerald-50" },
  rose: { value: "text-rose-700", icon: "text-rose-600", chip: "bg-rose-50" },
  amber: { value: "text-amber-700", icon: "text-amber-600", chip: "bg-amber-50" },
  blue: { value: "text-blue-700", icon: "text-blue-600", chip: "bg-blue-50" },
  fuchsia: { value: "text-fuchsia-700", icon: "text-fuchsia-600", chip: "bg-fuchsia-50" },
}

export type KpiCard = {
  id: string
  label: string
  value: string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  tone: KpiTone
  /** true → el número queda oscuro neutro aunque el chip lleve color. */
  valorNeutro?: boolean
  ayuda: {
    /** Una línea: qué significa el número en lenguaje llano. */
    que: string
    /** La cuenta, renglón por renglón, con los importes de este documento. */
    filas: KpiFila[]
    /** De qué columna/tabla sale el dato y quién lo calcula. */
    fuente: string
  }
}

export function KpiCards({ cards }: { cards: KpiCard[] }) {
  const [abierto, setAbierto] = useState<string | null>(null)

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon
        const t = TONE[c.tone]
        const open = abierto === c.id
        return (
          <div
            key={c.id}
            className="relative rounded-2xl border border-black/5 bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-px hover:border-[rgba(15,118,110,0.22)] hover:shadow-[0_4px_14px_rgba(15,23,42,0.05)] sm:p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${t.chip}`}
              >
                <Icon className={`size-4 ${t.icon}`} />
              </span>
              <button
                type="button"
                onClick={() => setAbierto(open ? null : c.id)}
                aria-expanded={open}
                aria-label={`¿De dónde sale ${c.label}?`}
                title="¿De dónde sale este número?"
                className={`-mr-1 -mt-1 rounded-full p-1 transition-colors ${
                  open
                    ? "bg-[#0F766E] text-white"
                    : "text-gray-300 hover:bg-gray-100 hover:text-[#0F766E]"
                }`}
              >
                <HelpCircle className="size-4" />
              </button>
            </div>

            <div className="mt-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              {c.label}
            </div>
            <div
              className={`mt-0.5 truncate text-lg font-bold tabular-nums leading-tight sm:text-xl ${
                c.valorNeutro ? "text-gray-900" : t.value
              }`}
            >
              {c.value}
            </div>
            {c.sub && (
              <div className="mt-0.5 truncate text-[11px] text-gray-500" title={c.sub}>
                {c.sub}
              </div>
            )}

            {open && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setAbierto(null)}
                />
                <div className="absolute left-0 right-0 top-[calc(100%-6px)] z-30 rounded-2xl border border-white/70 bg-white/85 p-3.5 shadow-[0_24px_48px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl backdrop-saturate-150 sm:left-auto sm:w-[21rem]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex size-6 items-center justify-center rounded-lg ${t.chip}`}
                    >
                      <Icon className={`size-3.5 ${t.icon}`} />
                    </span>
                    <p className="text-xs font-semibold text-gray-900">
                      {c.label}
                    </p>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-snug text-gray-600">
                    {c.ayuda.que}
                  </p>
                  <ul className="mt-2 space-y-1.5 rounded-xl bg-[#FAFAFA] p-2.5 ring-1 ring-inset ring-black/5">
                    {c.ayuda.filas.map((f, i) => (
                      <li
                        key={i}
                        className={`flex items-start justify-between gap-2 text-[11px] ${
                          f.alerta ? "text-amber-700" : "text-gray-700"
                        }`}
                      >
                        <span className="flex-1 leading-snug">
                          {f.alerta && (
                            <AlertTriangle className="mr-1 inline size-3 -translate-y-px" />
                          )}
                          {f.texto}
                        </span>
                        {f.valor && (
                          <span className="shrink-0 font-semibold tabular-nums">
                            {f.valor}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[10.5px] leading-snug text-gray-400">
                    {c.ayuda.fuente}
                  </p>
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Utilidades compartidas por las pantallas que arman tarjetas. */
export const round2 = (n: number) => Math.round(n * 100) / 100
/** Tolerancia de un centavo: los importes vienen de columnas numeric. */
export const casiIgual = (a: number, b: number) => Math.abs(a - b) < 0.02
