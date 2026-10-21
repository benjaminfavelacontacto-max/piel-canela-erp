"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, FileText, Zap } from "lucide-react"
import { AnimatedNumber } from "./ventas/estadisticas/animated-number"
import { GlobalSearch, type SearchItem } from "./global-search"

/**
 * Hero del dashboard — resumen ejecutivo (nivel 1 de la jerarquía).
 *
 * Izquierda: saludo, lectura del negocio en una frase, ventas del mes con
 * contador animado, comparativa visual este-mes-vs-anterior (barras, no solo
 * texto) y ventas de hoy. Derecha: buscador global (⌘K), acciones primarias
 * y el indicador "en vivo" — la página se refresca sola cada 60s con
 * router.refresh() y el contador de segundos se reinicia.
 */

export type HeroProps = {
  nombre: string
  fechaLarga: string
  ventasHoy: number
  ordenesHoy: number
  ventasMes: number
  ventasMesAnt: number
  cambioVentas: number
  ordenesMes: number
  estado: { nivel: string; emoji: string }
  searchItems: SearchItem[]
}

function saludoPorHora(h: number): string {
  if (h < 12) return "Buenos días"
  if (h < 18) return "Buenas tardes"
  return "Buenas noches"
}

function fraseDelDia(cambio: number, ventasHoy: number): string {
  if (ventasHoy > 0) return "Hoy ya hay ventas registradas."
  if (cambio >= 15) return "Tu negocio está creciendo fuerte este mes."
  if (cambio >= 0) return "Tu negocio va en buen camino este mes."
  return "Este mes va por debajo del anterior — hay que empujar."
}

export function DashboardHero(p: HeroProps) {
  const router = useRouter()
  const [seg, setSeg] = useState(0)
  const [hora, setHora] = useState<number | null>(null)

  // Reloj del indicador "en vivo" + auto-refresh de datos cada 60s.
  useEffect(() => {
    // Diferido: la hora local solo existe en el cliente; se aplica en el
    // siguiente tick para no hacer setState sincrono dentro del efecto.
    const horaT = setTimeout(() => setHora(new Date().getHours()), 0)
    const tick = setInterval(() => {
      setSeg((s) => {
        if (s + 1 >= 60) {
          router.refresh()
          return 0
        }
        return s + 1
      })
    }, 1000)
    return () => {
      clearTimeout(horaT)
      clearInterval(tick)
    }
  }, [router])

  const positivo = p.cambioVentas >= 0
  const maxBar = Math.max(p.ventasMes, p.ventasMesAnt, 1)
  const fmt = (n: number) =>
    n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })

  return (
    <section
      className="pc-enter relative overflow-hidden rounded-3xl border border-black/5 p-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)] md:p-8"
      style={{
        // Gradiente muy sutil — solo aquí y en el botón primario (regla 23)
        background:
          "linear-gradient(135deg, #FFFFFF 0%, #FAFDFB 55%, rgba(15,118,110,0.05) 100%)",
      }}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        {/* ─── Izquierda: saludo + número del mes ─── */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[26px] font-bold leading-tight tracking-[-0.03em] text-gray-900">
              {hora == null ? "Hola" : saludoPorHora(hora)}, {p.nombre}{" "}
              <span aria-hidden>👋</span>
            </h1>
            <span
              className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-gray-700 ring-1 ring-black/5"
              title="Estado general del negocio"
            >
              {p.estado.emoji} {p.estado.nivel}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            {p.fechaLarga} · {fraseDelDia(p.cambioVentas, p.ventasHoy)}
          </p>

          <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                Ventas del mes
              </p>
              <p className="mt-1 text-[38px] font-bold leading-none tracking-[-0.03em] tabular-nums text-gray-900">
                <AnimatedNumber value={p.ventasMes} prefix="$" duration={900} />
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[12px]">
                <span
                  className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${
                    positivo ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  <span aria-hidden className="text-[9px]">
                    {positivo ? "▲" : "▼"}
                  </span>
                  {positivo ? "+" : ""}
                  {p.cambioVentas.toFixed(1)}%
                </span>
                <span className="text-gray-500">
                  vs mes anterior · {p.ordenesMes} órdenes
                </span>
              </p>
            </div>

            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                Hoy
              </p>
              <p className="mt-1 text-xl font-bold leading-none tabular-nums text-gray-900">
                <AnimatedNumber value={p.ventasHoy} prefix="$" duration={900} />
              </p>
              <p className="mt-1.5 text-[12px] text-gray-500">
                {p.ordenesHoy === 0
                  ? "sin ventas aún"
                  : `${p.ordenesHoy} ${p.ordenesHoy === 1 ? "venta" : "ventas"}`}
              </p>
            </div>

            {/* Comparativa visual — barras, no solo texto (regla 21) */}
            <div className="min-w-[180px] max-w-[240px] flex-1">
              <ComparativaBar
                label="Este mes"
                value={p.ventasMes}
                max={maxBar}
                strong
                display={fmt(p.ventasMes)}
              />
              <div className="mt-2">
                <ComparativaBar
                  label="Mes anterior"
                  value={p.ventasMesAnt}
                  max={maxBar}
                  display={fmt(p.ventasMesAnt)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Derecha: buscador, acciones y en-vivo ─── */}
        <div className="flex shrink-0 flex-col items-stretch gap-3 lg:items-end">
          <div className="flex items-center gap-2">
            <GlobalSearch items={p.searchItems} />
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #0F766E, #115E59)" }}
              title={p.nombre}
              aria-label={`Perfil de ${p.nombre}`}
            >
              {p.nombre[0] ?? "B"}
            </span>
          </div>
          <div className="flex items-center gap-2 lg:justify-end">
            {/* Móvil → flujo rápido de una mano; desktop → formulario completo */}
            <Link href="/cotizaciones/rapida" className="pc-btn-secondary sm:hidden">
              <Zap className="size-4" />
              Cotización rápida
            </Link>
            <Link
              href="/cotizaciones/nueva"
              className="pc-btn-secondary hidden sm:inline-flex"
            >
              <FileText className="size-4" />
              Nueva cotización
            </Link>
            <Link
              href="/ventas/nueva"
              className="pc-btn-primary"
              style={{
                background: "linear-gradient(135deg, #0F766E, #0D6A62)",
              }}
            >
              <Plus className="size-4" />
              Nueva venta
            </Link>
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-gray-400 lg:justify-end">
            <span className="pc-live-dot inline-block size-1.5 rounded-full bg-emerald-500" aria-hidden />
            En vivo · actualizado hace {seg}s
          </p>
        </div>
      </div>
    </section>
  )
}

function ComparativaBar({
  label,
  value,
  max,
  display,
  strong,
}: {
  label: string
  value: number
  max: number
  display: string
  strong?: boolean
}) {
  const pct = Math.max(3, (value / max) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10.5px] font-medium text-gray-500">{label}</span>
        <span
          className={`text-[10.5px] tabular-nums ${
            strong ? "font-semibold text-gray-900" : "text-gray-500"
          }`}
        >
          {display}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/[0.05]">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${
            strong ? "bg-[#0F766E]" : "bg-[#0F766E]/30"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
