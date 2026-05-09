/**
 * Paleta unificada para todos los charts (Recharts) del ERP.
 *
 * Filosofía: el color comunica, no decora. Pocos colores, intencionados.
 * Inspirado en Linear / Stripe / Mercury / Attio.
 *
 * Uso:
 *   import { CHART } from "@/lib/chart-palette"
 *   <Bar fill={CHART.real} />
 *   <Line stroke={CHART.comparative} />
 */
export const CHART = {
  // ─── Datos reales (métrica principal) ───
  real: "#0F766E",
  realSoft: "rgba(15, 118, 110, 0.18)",

  // ─── Proyecciones / forecasts ───
  projection: "rgba(15, 118, 110, 0.35)",
  projectionLight: "rgba(15, 118, 110, 0.18)",

  // ─── Comparativas / segundo plano ───
  comparative: "#CBD5E1",
  comparativeSoft: "#E2E8F0",

  // ─── Slate neutro (segundas métricas) ───
  secondary: "#94A3B8",

  // ─── Estructura del chart ───
  grid: "#EEF1F4",
  axisTick: "#9CA3AF",
  cursor: "#F3F5F7",
  cursorOpacity: 0.4,

  // ─── Estados (cuando un chart muestra warnings/errors) ───
  warning: "#D97706",
  warningSoft: "#FEF3C7",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  success: "#059669",
  successSoft: "#D1FAE5",

  // ─── Series categóricas (pie charts, multi-bar) ───
  series: ["#0F766E", "#94A3B8", "#CBD5E1", "#6B7280", "#D1D5DB"],
} as const
