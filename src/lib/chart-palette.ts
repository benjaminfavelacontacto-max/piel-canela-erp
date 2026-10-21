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
  real: "var(--pc-chart-real)",
  realSoft: "color-mix(in srgb, var(--pc-chart-real) 18%, transparent)",

  // ─── Proyecciones / forecasts ───
  projection: "var(--pc-chart-projection)",
  projectionLight: "color-mix(in srgb, var(--pc-chart-real) 18%, transparent)",

  // ─── Comparativas / segundo plano ───
  comparative: "var(--pc-chart-comparative)",
  comparativeSoft: "var(--pc-hair)",

  // ─── Slate neutro (segundas métricas, líneas) ───
  secondary: "var(--pc-text-muted)",
  lineColor: "var(--pc-chart-line)",

  // ─── Estructura del chart (refinado v2 — casi invisible) ───
  grid: "var(--pc-chart-grid)",
  axisTick: "var(--pc-text-muted)",
  cursor: "color-mix(in srgb, var(--pc-chart-real) 6%, transparent)",
  cursorOpacity: 1,

  // ─── Estados (cuando un chart muestra warnings/errors) ───
  warning: "var(--pc-warning)",
  warningSoft: "var(--pc-warning-soft)",
  danger: "var(--pc-danger)",
  dangerSoft: "var(--pc-danger-soft)",
  success: "var(--pc-success)",
  successSoft: "var(--pc-success-soft)",

  // ─── Series categóricas (pie charts, multi-bar) ───
  series: ["var(--pc-chart-real)", "var(--pc-text-muted)", "var(--pc-chart-comparative)", "#6B7280", "var(--pc-hair-strong)"],

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
    color: "var(--pc-chart-line)",
    /** Sin dots por default — más limpio */
    showDot: false,
    curve: "monotone" as const,
  },

  /**
   * Gradient definition para barras (paste dentro de <defs>):
   *
   *   <linearGradient id={CHART.bar.gradientId} x1="0" y1="0" x2="0" y2="1">
   *     <stop offset="0%"  stopColor="var(--pc-chart-real)" stopOpacity="0.92" />
   *     <stop offset="100%" stopColor="var(--pc-chart-real)" stopOpacity="0.35" />
   *   </linearGradient>
   *
   * Y luego: <Bar fill={`url(#${CHART.bar.gradientId})`} barSize={CHART.bar.size}
   *               radius={CHART.bar.radius} opacity={CHART.bar.opacity} />
   */
} as const
