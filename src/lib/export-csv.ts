/**
 * Exportación CSV sin dependencias, compatible con Excel.
 *
 * - Antepone BOM UTF-8 (﻿) para que Excel lea acentos/ñ correctamente.
 * - Escapa comillas, comas y saltos de línea según RFC 4180.
 * - Los números se escriben crudos (sin formato de moneda) para que Excel
 *   pueda sumarlos. Formatea en la hoja, no en el archivo.
 *
 * Client-only: usa Blob + <a download> (requiere `window`).
 */

type Cell = string | number | null | undefined

function escapeCell(value: Cell): string {
  if (value == null) return ""
  const s = String(value)
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Construye el contenido CSV (con BOM) a partir de encabezados + filas. */
export function buildCSV(headers: string[], rows: Cell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","))
  return "﻿" + lines.join("\r\n")
}

/** Construye el CSV y dispara la descarga en el navegador. */
export function downloadCSV(
  filename: string,
  headers: string[],
  rows: Cell[][],
): void {
  if (typeof window === "undefined") return
  const csv = buildCSV(headers, rows)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
