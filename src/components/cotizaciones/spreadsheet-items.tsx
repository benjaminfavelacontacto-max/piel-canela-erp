"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CotizacionItem } from "@/lib/cotizacion-types"
import { formatMXN2 } from "@/lib/utils"

type ColKey =
  | "#"
  | "sku"
  | "nombre"
  | "peso"
  | "cantidad"
  | "precio_unitario"
  | "costo_unitario"
  | "subtotal"
  | "margen"

type Col = {
  key: ColKey
  label: string
  selectable: boolean
  align?: "left" | "right" | "center"
  format?: "currency" | "number"
}

const COLS: Col[] = [
  { key: "#", label: "#", selectable: false, align: "right" },
  { key: "sku", label: "SKU", selectable: false },
  { key: "nombre", label: "Producto", selectable: false },
  { key: "peso", label: "Peso", selectable: false },
  { key: "cantidad", label: "Cant.", selectable: true, align: "right", format: "number" },
  { key: "precio_unitario", label: "P. Unit.", selectable: true, align: "right", format: "currency" },
  { key: "costo_unitario", label: "Costo unit.", selectable: true, align: "right", format: "currency" },
  { key: "subtotal", label: "Subtotal", selectable: true, align: "right", format: "currency" },
  { key: "margen", label: "Margen", selectable: true, align: "right", format: "currency" },
]

const COL_IDX = new Map(COLS.map((c, i) => [c.key, i]))

function cellValue(it: CotizacionItem, key: ColKey): number | null {
  switch (key) {
    case "cantidad":
      return Number(it.cantidad)
    case "precio_unitario":
      return Number(it.precio_unitario)
    case "costo_unitario":
      return Number(it.costo_unitario)
    case "subtotal":
      return Number(it.subtotal)
    case "margen":
      return (
        (Number(it.precio_unitario) - Number(it.costo_unitario)) *
        Number(it.cantidad)
      )
    default:
      return null
  }
}

function fmt(v: number | null, format?: "currency" | "number"): string {
  if (v == null || Number.isNaN(v)) return "—"
  if (format === "currency") return formatMXN2(v)
  if (format === "number") return v.toLocaleString("es-MX")
  return String(v)
}

type CellKey = `${number}-${ColKey}`
function ck(row: number, col: ColKey): CellKey {
  return `${row}-${col}`
}

function rectKeys(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
): Set<CellKey> {
  const minR = Math.min(startRow, endRow)
  const maxR = Math.max(startRow, endRow)
  const minC = Math.min(startCol, endCol)
  const maxC = Math.max(startCol, endCol)
  const out = new Set<CellKey>()
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const col = COLS[c]
      if (col?.selectable) out.add(ck(r, col.key))
    }
  }
  return out
}

export function SpreadsheetItems({
  items,
}: {
  items: CotizacionItem[]
}) {
  const [selected, setSelected] = useState<Set<CellKey>>(new Set())
  const [anchor, setAnchor] = useState<{ row: number; colIdx: number } | null>(
    null,
  )
  const dragRef = useRef<{
    active: boolean
    startRow: number
    startCol: number
    base: Set<CellKey>
    additive: boolean
  } | null>(null)

  // Esc clears selection
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelected(new Set())
        setAnchor(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Document-level mouseup ends drag even outside the table
  useEffect(() => {
    function onUp() {
      if (dragRef.current?.active) {
        dragRef.current.active = false
      }
    }
    window.addEventListener("mouseup", onUp)
    return () => window.removeEventListener("mouseup", onUp)
  }, [])

  const onCellMouseDown = useCallback(
    (e: React.MouseEvent, row: number, col: Col, colIdx: number) => {
      if (!col.selectable) return
      e.preventDefault()
      const isShift = e.shiftKey
      const isCmd = e.metaKey || e.ctrlKey

      if (isShift && anchor) {
        // Range from anchor to here
        const range = rectKeys(anchor.row, anchor.colIdx, row, colIdx)
        setSelected(range)
        return
      }

      if (isCmd) {
        // Toggle this single cell, keep rest
        setSelected((prev) => {
          const next = new Set(prev)
          const k = ck(row, col.key)
          if (next.has(k)) next.delete(k)
          else next.add(k)
          return next
        })
        setAnchor({ row, colIdx })
        return
      }

      // Plain click → start a drag, single cell
      const start = new Set<CellKey>([ck(row, col.key)])
      setSelected(start)
      setAnchor({ row, colIdx })
      dragRef.current = {
        active: true,
        startRow: row,
        startCol: colIdx,
        base: start,
        additive: false,
      }
    },
    [anchor],
  )

  const onCellMouseEnter = useCallback(
    (row: number, col: Col, colIdx: number) => {
      const drag = dragRef.current
      if (!drag?.active) return
      if (!col.selectable) return
      const range = rectKeys(drag.startRow, drag.startCol, row, colIdx)
      setSelected(range)
    },
    [],
  )

  // Click on column header → select whole column for that field
  const onHeaderClick = useCallback(
    (col: Col, colIdx: number) => {
      if (!col.selectable) return
      const next = new Set<CellKey>()
      for (let r = 0; r < items.length; r++) next.add(ck(r, col.key))
      setSelected(next)
      setAnchor({ row: 0, colIdx })
    },
    [items.length],
  )

  // Click on row index → select all selectable cells in that row
  const onRowIndexClick = useCallback((row: number) => {
    const next = new Set<CellKey>()
    for (const c of COLS) {
      if (c.selectable) next.add(ck(row, c.key))
    }
    setSelected(next)
  }, [])

  function clearSelection() {
    setSelected(new Set())
    setAnchor(null)
  }

  // Compute aggregates from selected cells
  const stats = useMemo(() => {
    if (selected.size === 0)
      return { count: 0, sum: 0, avg: 0, min: 0, max: 0 }
    let sum = 0
    let count = 0
    let min = Infinity
    let max = -Infinity
    for (const k of selected) {
      const [rowStr, colKey] = k.split("-")
      const row = Number(rowStr)
      const it = items[row]
      if (!it) continue
      const v = cellValue(it, colKey as ColKey)
      if (v == null || Number.isNaN(v)) continue
      sum += v
      count++
      if (v < min) min = v
      if (v > max) max = v
    }
    return {
      count,
      sum,
      avg: count > 0 ? sum / count : 0,
      min: count > 0 ? min : 0,
      max: count > 0 ? max : 0,
    }
  }, [selected, items])

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table
          className="w-full select-none text-sm"
          onMouseLeave={() => {
            // keep drag active if mouse re-enters; only releases on document mouseup
          }}
        >
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {COLS.map((c, i) => (
                <th
                  key={c.key}
                  onClick={() => onHeaderClick(c, i)}
                  className={`px-3 py-2 text-xs font-medium uppercase tracking-wide text-gray-500 ${
                    c.selectable
                      ? "cursor-pointer hover:bg-teal-50 hover:text-teal-700"
                      : ""
                  }`}
                  style={{ textAlign: c.align ?? "left" }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={COLS.length}
                  className="px-5 py-12 text-center text-sm text-gray-400"
                >
                  Esta cotización no tiene productos asociados.
                </td>
              </tr>
            ) : (
              items.map((it, row) => (
                <tr key={`${it.producto_id}-${row}`}>
                  {COLS.map((c, colIdx) => {
                    const isSelected = c.selectable && selected.has(ck(row, c.key))
                    let display: React.ReactNode = "—"
                    if (c.key === "#") {
                      display = (
                        <button
                          type="button"
                          onClick={() => onRowIndexClick(row)}
                          className="cursor-pointer text-gray-400 hover:text-teal-600"
                          tabIndex={-1}
                        >
                          {row + 1}
                        </button>
                      )
                    } else if (c.key === "sku") {
                      display = (
                        <span className="font-mono text-xs text-gray-500">
                          {it.sku ?? "—"}
                        </span>
                      )
                    } else if (c.key === "nombre") {
                      display = (
                        <span className="text-gray-900">{it.nombre}</span>
                      )
                    } else if (c.key === "peso") {
                      display = (
                        <span className="text-gray-500">
                          {it.peso ?? "—"}
                        </span>
                      )
                    } else {
                      const v = cellValue(it, c.key)
                      display = fmt(v, c.format)
                    }

                    return (
                      <td
                        key={c.key}
                        onMouseDown={(e) => onCellMouseDown(e, row, c, colIdx)}
                        onMouseEnter={() => onCellMouseEnter(row, c, colIdx)}
                        className={`px-3 py-2 transition-colors ${
                          c.selectable
                            ? "cursor-cell hover:bg-blue-50/50"
                            : ""
                        } ${
                          isSelected
                            ? "bg-teal-100/70 text-teal-900 ring-1 ring-inset ring-teal-400 font-medium"
                            : ""
                        } ${c.format === "currency" ? "tabular-nums" : ""}`}
                        style={{ textAlign: c.align ?? "left" }}
                      >
                        {display}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-gray-400">
        Tip: arrastra el mouse para seleccionar un rango · Shift+click para
        extender · Cmd/Ctrl+click para toggle · Esc para limpiar
      </p>

      <SelectionBar stats={stats} onClear={clearSelection} />
    </>
  )
}

function SelectionBar({
  stats,
  onClear,
}: {
  stats: { count: number; sum: number; avg: number; min: number; max: number }
  onClear: () => void
}) {
  if (stats.count === 0) return null
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-3 duration-200">
      <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-3 shadow-2xl backdrop-blur-md">
        <Stat label="Suma" value={formatMXN2(stats.sum)} highlight />
        <Sep />
        <Stat label="Promedio" value={formatMXN2(stats.avg)} />
        <Sep />
        <Stat
          label="Cantidad"
          value={stats.count.toLocaleString("es-MX")}
        />
        <Sep />
        <Stat label="Mín" value={formatMXN2(stats.min)} subtle />
        <Sep />
        <Stat label="Máx" value={formatMXN2(stats.max)} subtle />
        <button
          type="button"
          onClick={onClear}
          className="ml-2 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          Limpiar (Esc)
        </button>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  highlight,
  subtle,
}: {
  label: string
  value: string
  highlight?: boolean
  subtle?: boolean
}) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={`text-[10px] uppercase tracking-wide ${subtle ? "text-gray-400" : "text-gray-500"}`}
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${highlight ? "text-base font-bold text-teal-700" : subtle ? "text-xs text-gray-500" : "text-sm font-semibold text-gray-900"}`}
      >
        {value}
      </span>
    </div>
  )
}

function Sep() {
  return <div className="h-7 w-px bg-gray-200" />
}
