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

  // ─── Slate neutro (segundas métricas, líneas) ───
  secondary: "#94A3B8",
  lineColor: "#94A3B8",

  // ─── Estructura del chart (refinado v2 — casi invisible) ───
  grid: "rgba(148, 163, 184, 0.12)",
  axisTick: "#94A3B8",
  cursor: "rgba(15, 118, 110, 0.04)",
  cursorOpacity: 1,

  // ─── Estados (cuando un chart muestra warnings/errors) ───
  warning: "#D97706",
  warningSoft: "#FEF3C7",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  success: "#059669",
  successSoft: "#D1FAE5",

  // ─── Series categóricas (pie charts, multi-bar) ───
  series: ["#0F766E", "#94A3B8", "#CBD5E1", "#6B7280", "#D1D5DB"],

  // ─── Defaults de geometría (barras delgadas y refinadas) ───
  bar: {
    radius: [3, 3, 0, 0] as [number, number, number, number],
    barCategoryGap: "30%",
  },
  line: {
    strokeWidth: 2,
  },
} as const
