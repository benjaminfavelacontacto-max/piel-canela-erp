import { formatMXN } from "@/lib/utils"

/**
 * "Salud financiera": de dónde sale la utilidad, en una sola tarjeta.
 * Server component puro (recibe totales ya calculados en page.tsx — no
 * duplica ninguna fórmula). Gastos se muestra como N/D: no hay ninguna
 * pantalla del ERP que capture gastos todavía (la tabla `gastos` existe en
 * Supabase pero no está conectada a esta app), así que no se inventa un
 * número.
 */

export function FinancialHealth({
  ventas,
  costos,
  utilidad,
  margen,
}: {
  ventas: number
  costos: number
  utilidad: number
  margen: number
}) {
  return (
    <div className="pc-card">
      <header className="mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Salud financiera</h2>
        <p className="mt-0.5 text-[11px] text-gray-400">
          De dónde sale la utilidad de este mes
        </p>
      </header>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Renglon label="Ventas" value={formatMXN(ventas)} />
        <Renglon label="Costos" value={`−${formatMXN(costos)}`} muted />
        <Renglon
          label="Gastos"
          value="N/D"
          muted
          title="Sin captura de gastos todavía en este ERP"
        />
        <Renglon label="Utilidad" value={formatMXN(utilidad)} strong />
        <Renglon label="Margen" value={`${margen.toFixed(1)}%`} strong />
      </div>
    </div>
  )
}

function Renglon({
  label,
  value,
  muted,
  strong,
  title,
}: {
  label: string
  value: string
  muted?: boolean
  strong?: boolean
  title?: string
}) {
  return (
    <div title={title}>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-500">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-bold tabular-nums ${
          strong ? "text-[#0F766E]" : muted ? "text-gray-400" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  )
}
