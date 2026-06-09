"use client"

import { useMemo } from "react"
import { Brain, CalendarClock, TrendingUp, AlertTriangle } from "lucide-react"
import type { EnrichedCliente } from "./clientes-dashboard"
import type { PrediccionResult } from "./lib-prediccion"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

// Avatar gradient estable por nombre (mismo criterio que el resto del módulo).
const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #4F46E5, #047857)",
  "linear-gradient(135deg, #047857, #0E7490)",
  "linear-gradient(135deg, #B45309, #B91C1C)",
  "linear-gradient(135deg, #BE185D, #4F46E5)",
  "linear-gradient(135deg, #0E7490, #047857)",
  "linear-gradient(135deg, #EA580C, #B45309)",
  "linear-gradient(135deg, #7E22CE, #BE185D)",
  "linear-gradient(135deg, #047857, #B45309)",
  "linear-gradient(135deg, #A8895F, #BE185D)",
  "linear-gradient(135deg, #0891B2, #4F46E5)",
  "linear-gradient(135deg, #B91C1C, #EA580C)",
  "linear-gradient(135deg, #15803D, #0891B2)",
]
function getAvatarGradient(nombre: string): string {
  if (!nombre) return AVATAR_GRADIENTS[0]
  let hash = 0
  for (let i = 0; i < nombre.length; i++) hash += nombre.charCodeAt(i)
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
}

type ConPred = EnrichedCliente & { pred: PrediccionResult }

/**
 * Panel COMPACTO de predicción de compras (insights, no listado completo).
 * Resume lo que la tabla unificada ya tiene por cliente:
 *  - KPIs: revenue proyectado 60d, # alta probabilidad, # en riesgo
 *  - Top "Próximas compras" y "En riesgo de abandono" (curado, ~6 c/u)
 * La lista completa de clientes vive en la tabla de abajo (sin duplicar).
 */
export function PrediccionInsights({
  clientes,
  predByCliente,
  onClienteClick,
}: {
  clientes: EnrichedCliente[]
  predByCliente: Map<string, PrediccionResult>
  onClienteClick?: (cliente: EnrichedCliente) => void
}) {
  const conPred: ConPred[] = useMemo(
    () =>
      clientes
        .map((c) => {
          const pred = predByCliente.get(c.id)
          return pred ? { ...c, pred } : null
        })
        .filter((x): x is ConPred => x !== null),
    [clientes, predByCliente],
  )

  const kpis = useMemo(() => {
    const validos = conPred.filter((c) => c.pred.metodo !== "insufficient")
    const revenue60 = validos.reduce((s, c) => s + c.pred.ingresoEstimadoProx, 0)
    const altaProb = validos.filter(
      (c) => c.pred.probabilidadProx60 >= 0.6,
    ).length
    const enRiesgo = validos.filter(
      (c) => c.pred.riesgoAbandono >= 0.6 && c.ventas_count > 0,
    ).length
    return { revenue60, altaProb, enRiesgo }
  }, [conPred])

  const proximas = useMemo(
    () =>
      [...conPred]
        .filter(
          (c) =>
            c.pred.metodo !== "insufficient" &&
            c.pred.ingresoEstimadoProx > 0 &&
            (c.pred.diasParaProxima ?? 999) >= -14,
        )
        .sort(
          (a, b) =>
            b.pred.probabilidadProx60 * b.pred.ingresoEstimadoProx -
            a.pred.probabilidadProx60 * a.pred.ingresoEstimadoProx,
        )
        .slice(0, 6),
    [conPred],
  )

  const riesgo = useMemo(
    () =>
      [...conPred]
        .filter((c) => c.pred.riesgoAbandono >= 0.5 && c.ventas_count > 0)
        .sort((a, b) => b.pred.riesgoAbandono - a.pred.riesgoAbandono)
        .slice(0, 6),
    [conPred],
  )

  const KPIS = [
    {
      label: "Revenue proyectado (60d)",
      value: mxn.format(kpis.revenue60),
      sub: "ticket × probabilidad",
      color: "#047857",
      tint: "rgba(5,150,105,0.07)",
      border: "rgba(5,150,105,0.20)",
      icon: TrendingUp,
    },
    {
      label: "Alta probabilidad",
      value: String(kpis.altaProb),
      sub: "≥60% de compra a 60d",
      color: "#4F46E5",
      tint: "rgba(99,102,241,0.06)",
      border: "rgba(99,102,241,0.18)",
      icon: CalendarClock,
    },
    {
      label: "En riesgo de abandono",
      value: String(kpis.enRiesgo),
      sub: kpis.enRiesgo === 0 ? "Todos al día ✓" : "Requieren atención",
      color: kpis.enRiesgo > 0 ? "#B91C1C" : "#047857",
      tint: kpis.enRiesgo > 0 ? "rgba(220,38,38,0.06)" : "rgba(5,150,105,0.06)",
      border:
        kpis.enRiesgo > 0 ? "rgba(220,38,38,0.18)" : "rgba(5,150,105,0.18)",
      icon: AlertTriangle,
    },
  ]

  return (
    <section className="overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-[rgba(15,23,42,0.04)] bg-gradient-to-r from-white to-gray-50/50 px-5 py-3">
        <Brain className="size-4 text-[#4F46E5]" />
        <h2 className="text-sm font-semibold text-gray-900">
          Predicción de compras
        </h2>
        <span className="text-[11px] text-gray-400">
          · pronóstico por cliente (detalle en la tabla)
        </span>
      </header>

      <div className="space-y-4 p-4">
        {/* KPIs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {KPIS.map((kpi, i) => (
            <div
              key={i}
              className="rounded-2xl border p-3.5"
              style={{ borderColor: kpi.border, background: kpi.tint }}
            >
              <p
                className="mb-1.5 flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.10em]"
                style={{ color: kpi.color, opacity: 0.9 }}
              >
                <kpi.icon className="size-3" />
                {kpi.label}
              </p>
              <p
                className="text-[22px] font-bold leading-none tracking-[-0.02em] tabular-nums"
                style={{ color: kpi.color }}
              >
                {kpi.value}
              </p>
              <p className="mt-1 text-[10.5px] text-gray-500">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Listas curadas */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ListaClientes
            titulo="Próximas compras"
            icon={CalendarClock}
            accent="#4F46E5"
            items={proximas}
            vacio="Sin compras próximas previstas"
            onClienteClick={onClienteClick}
            render={(c) => {
              const dias = c.pred.diasParaProxima ?? 0
              const rel =
                dias === 0 ? "hoy" : dias < 0 ? `hace ${-dias}d` : `en ${dias}d`
              const pct = Math.round(c.pred.probabilidadProx60 * 100)
              return (
                <div className="text-right">
                  <div className="text-[12px] font-bold tabular-nums text-[#047857]">
                    {pct}%
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {c.pred.mesProximoLabel ?? rel} · {rel}
                  </div>
                </div>
              )
            }}
          />
          <ListaClientes
            titulo="En riesgo de abandono"
            icon={AlertTriangle}
            accent="#B91C1C"
            items={riesgo}
            vacio="Ningún cliente en riesgo ✓"
            onClienteClick={onClienteClick}
            render={(c) => {
              const dias = c.dias_sin_compra ?? 0
              return (
                <div className="text-right">
                  <div className="text-[12px] font-bold tabular-nums text-[#B91C1C]">
                    {Math.round(c.pred.riesgoAbandono * 100)}%
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {dias}d sin comprar
                  </div>
                </div>
              )
            }}
          />
        </div>
      </div>
    </section>
  )
}

function ListaClientes({
  titulo,
  icon: Icon,
  accent,
  items,
  vacio,
  render,
  onClienteClick,
}: {
  titulo: string
  icon: typeof CalendarClock
  accent: string
  items: ConPred[]
  vacio: string
  render: (c: ConPred) => React.ReactNode
  onClienteClick?: (cliente: EnrichedCliente) => void
}) {
  return (
    <div className="rounded-xl border border-[rgba(15,23,42,0.05)] bg-[#FBFCFD]">
      <div className="flex items-center gap-1.5 border-b border-[rgba(15,23,42,0.04)] px-3.5 py-2">
        <Icon className="size-3.5" style={{ color: accent }} />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          {titulo}
        </h3>
        <span className="ml-auto rounded-full bg-gray-100 px-1.5 py-px text-[9px] font-bold tabular-nums text-gray-500">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-gray-400">{vacio}</p>
      ) : (
        <ul className="divide-y divide-[rgba(15,23,42,0.03)]">
          {items.map((c) => {
            const display = c.nombre_negocio ?? c.nombre
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onClienteClick?.(c)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-white"
                >
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                    style={{ background: getAvatarGradient(display) }}
                  >
                    {iniciales(display)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-gray-800">
                    {display}
                  </span>
                  {render(c)}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
