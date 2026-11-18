"use client"

import { motion } from "framer-motion"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import type { Kpi, Tabla, TipoColumna } from "@/lib/asistente/tipos"
import { formatear } from "./grafica"

const RESORTE = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 } as const

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

function fechaCorta(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  return m ? Number(m[3]) + " " + MESES[Number(m[2]) - 1] + " " + m[1] : v
}

function celda(v: string | number | null, tipo: TipoColumna): string {
  if (v === null || v === "") return "—"
  if (typeof v === "string" && tipo !== "texto" && tipo !== "fecha" && Number.isNaN(Number(v))) return v
  switch (tipo) {
    case "moneda":
      return formatear(Number(v), "moneda")
    case "porcentaje":
      return formatear(Number(v), "porcentaje")
    case "numero":
      return formatear(Number(v), "numero")
    case "fecha":
      return fechaCorta(String(v))
    default:
      return String(v)
  }
}

const TONO = {
  bueno: "text-pc-green-ink bg-pc-green-soft",
  malo: "text-pc-red-ink bg-pc-red-soft",
  neutro: "text-pc-ink-3 bg-pc-tint",
} as const

/** Cifras clave en tarjetas: lo primero que se lee, sin buscar números dentro de un párrafo. */
export function TarjetasKpi({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className={"grid gap-2 " + (kpis.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
      {kpis.map((k, i) => {
        const tono = k.tono ?? "neutro"
        const valor =
          typeof k.valor === "number" && k.formato && k.formato !== "texto"
            ? formatear(k.valor, k.formato)
            : String(k.valor)
        const Icono = tono === "bueno" ? ArrowUpRight : tono === "malo" ? ArrowDownRight : Minus
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...RESORTE, delay: i * 0.05 }}
            className={
              "min-w-0 rounded-2xl border border-pc-line-soft bg-pc-card p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] " +
              (kpis.length % 2 === 1 && i === 0 && kpis.length > 1 ? "col-span-2" : "")
            }
          >
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-pc-ink-3 [overflow-wrap:anywhere]">
              {k.etiqueta}
            </p>
            <p className="mt-1 text-[22px] font-semibold leading-tight tracking-tight text-pc-ink tabular-nums [overflow-wrap:anywhere]">
              {valor}
            </p>
            {(k.cambio || k.nota) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {k.cambio && (
                  <span className={"inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium " + TONO[tono]}>
                    <Icono className="size-3" strokeWidth={2.4} />
                    {k.cambio}
                  </span>
                )}
                {k.nota && <span className="text-[11px] leading-snug text-pc-ink-3">{k.nota}</span>}
              </div>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}

/** Tabla con columnas alineadas por tipo (números a la derecha, moneda con formato, fechas legibles). */
export function TablaAsistente({ tabla }: { tabla: Tabla }) {
  const { columnas, filas, total } = tabla
  const alinea = (t: TipoColumna) => (t === "texto" || t === "fecha" ? "text-left" : "text-right tabular-nums")
  return (
    <figure className="overflow-hidden rounded-2xl border border-pc-line-soft bg-pc-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <figcaption className="border-b border-pc-line-soft px-3.5 py-2.5 text-[12.5px] font-semibold tracking-tight text-pc-ink">
        {tabla.titulo}
      </figcaption>
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              {columnas.map((c, j) => (
                <th
                  key={j}
                  className={
                    "whitespace-nowrap bg-pc-subtle px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-pc-ink-3 " +
                    alinea(c.tipo)
                  }
                >
                  {c.nombre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, i) => (
              <tr key={i} className="border-t border-pc-line-soft">
                {fila.map((v, j) => (
                  <td
                    key={j}
                    className={
                      "px-3 py-2 align-top " +
                      alinea(columnas[j].tipo) +
                      (j === 0 ? " min-w-[120px] max-w-[190px] font-medium text-pc-ink [overflow-wrap:anywhere]" : " whitespace-nowrap text-pc-ink-2")
                    }
                  >
                    {celda(v, columnas[j].tipo)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {total && (
            <tfoot>
              <tr className="border-t-2 border-pc-line bg-pc-subtle">
                {total.map((v, j) => (
                  <td key={j} className={"whitespace-nowrap px-3 py-2 font-semibold text-pc-ink " + alinea(columnas[j].tipo)}>
                    {j === 0 && (v === null || v === "") ? "Total" : celda(v, columnas[j].tipo)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </figure>
  )
}
