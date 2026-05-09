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

  // ─── Defaults de geometría (Linear/Stripe Analytics v2) ───
  bar: {
    /** Cap redondeado top + esquinas inferiores sutiles, estilo Linear */
    radius: [12, 12, 4, 4] as [number, number, number, number],
    /** 22px = barra delgada premium */
    size: 22,
    /** Aire entre barras para sensación editorial */
    categoryGap: "32%",
    opacity: 0.92,
    /** ID del gradient SVG a usar en <Bar fill={`url(#${gradientId})`}> */
    gradientId: "pc-bar-gradient",
  },
  line: {
    strokeWidth: 2.2,
    color: "#94A3B8",
    /** Sin dots por default — más limpio */
    showDot: false,
    curve: "monotone" as const,
  },

  /**
   * Gradient definition para barras (paste dentro de <defs>):
   *
   *   <linearGradient id={CHART.bar.gradientId} x1="0" y1="0" x2="0" y2="1">
   *     <stop offset="0%"  stopColor="#0F766E" stopOpacity="0.92" />
   *     <stop offset="100%" stopColor="#0F766E" stopOpacity="0.35" />
   *   </linearGradient>
   *
   * Y luego: <Bar fill={`url(#${CHART.bar.gradientId})`} barSize={CHART.bar.size}
   *               radius={CHART.bar.radius} opacity={CHART.bar.opacity} />
   */
} as const
