"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ChevronRight,
  ChevronDown,
  Save,
  Loader2,
  ArrowRight,
  Boxes,
} from "lucide-react"
import { editarSalidaCantidades } from "./actions"

type SItem = {
  producto_id: string
  sku: string
  nombre: string
  cantidad: number
  precio: number
  costo: number
}
type Salida = {
  id: string
  numero: string
  fecha: string
  unidades: number
  costo: number
  publico: number
  items: SItem[]
}

const mxn = (v: number) =>
  (Number(v) || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  })
const fechaLarga = (f: string) =>
  new Date(f).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })

export function SalidasList({ salidas }: { salidas: Salida[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [edit, setEdit] = useState<Record<string, number>>({})
  const [pending, startTransition] = useTransition()

  function toggle(s: Salida) {
    if (abierto === s.id) {
      setAbierto(null)
      return
    }
    setAbierto(s.id)
    setEdit(Object.fromEntries(s.items.map((i) => [i.producto_id, i.cantidad])))
  }

  const dirty = (s: Salida) =>
    s.items.some((i) => (edit[i.producto_id] ?? i.cantidad) !== i.cantidad)

  function guardar(s: Salida) {
    startTransition(async () => {
      const cambios = s.items.map((i) => ({
        producto_id: i.producto_id,
        cantidad: edit[i.producto_id] ?? i.cantidad,
      }))
      const res = await editarSalidaCantidades(s.id, cambios)
      if (res.ok) {
        setAbierto(null)
        router.refresh()
      }
    })
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
        <Boxes className="size-4 text-gray-400" strokeWidth={1.75} />
        <h2 className="text-[13px] font-semibold text-gray-900">Salidas</h2>
        <span className="text-[11px] text-gray-400">
          {salidas.length} veces · clic para ver productos y editar cantidades
        </span>
      </header>
      <div className="divide-y divide-gray-50">
        {salidas.map((s) => {
          const open = abierto === s.id
          return (
            <div key={s.id}>
              {/* Renglón de la salida */}
              <button
                type="button"
                onClick={() => toggle(s)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-purple-50/40"
              >
                {open ? (
                  <ChevronDown className="size-4 shrink-0 text-[#8B5CF6]" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-gray-400" />
                )}
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-gray-900">{fechaLarga(s.fecha)}</p>
                  <p className="font-mono text-[10.5px] text-gray-400">{s.numero}</p>
                </div>
                <div className="ml-auto flex items-center gap-4 text-[12px] tabular-nums">
                  <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-[#7C3AED]">
                    {s.items.length} {s.items.length === 1 ? "ítem" : "ítems"}
                  </span>
                  <span className="text-gray-500">{s.unidades} u</span>
                  <span className="hidden text-amber-700 sm:inline">{mxn(s.costo)}</span>
                  <span className="font-semibold text-indigo-700">{mxn(s.publico)}</span>
                </div>
              </button>

              {/* Detalle desplegado (como cotización) */}
              {open && (
                <div className="border-t border-gray-50 bg-gray-50/40 px-5 py-4">
                  <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="border-b border-gray-50 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                          <th className="px-3 py-2 text-left">Producto</th>
                          <th className="px-3 py-2 text-center">Cantidad</th>
                          <th className="px-3 py-2 text-right">P. público</th>
                          <th className="px-3 py-2 text-right">Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.items.map((i) => {
                          const cant = edit[i.producto_id] ?? i.cantidad
                          return (
                            <tr key={i.producto_id} className="border-b border-gray-50 last:border-0">
                              <td className="px-3 py-2">
                                <Link
                                  href={`/inventario?producto=${encodeURIComponent(i.sku)}`}
                                  className="font-medium text-gray-900 hover:text-[#7C3AED] hover:underline"
                                >
                                  {i.nombre}
                                </Link>
                                <p className="text-[10px] text-gray-400">{i.sku}</p>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  value={cant}
                                  onChange={(e) =>
                                    setEdit((prev) => ({
                                      ...prev,
                                      [i.producto_id]: Number(e.target.value),
                                    }))
                                  }
                                  className={`h-8 w-16 rounded-lg border px-2 text-center tabular-nums ${
                                    cant !== i.cantidad
                                      ? "border-[#8B5CF6] bg-purple-50"
                                      : "border-gray-200"
                                  }`}
                                />
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-500">{mxn(i.precio)}</td>
                              <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">
                                {mxn(i.precio * cant)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <Link
                      href={`/ventas/${s.id}`}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-gray-500 hover:text-[#7C3AED]"
                    >
                      Ver salida completa <ArrowRight className="size-3.5" />
                    </Link>
                    <div className="flex items-center gap-2">
                      {dirty(s) && (
                        <span className="text-[11px] text-gray-400">Pon 0 para quitar un producto</span>
                      )}
                      <button
                        type="button"
                        onClick={() => guardar(s)}
                        disabled={pending || !dirty(s)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#8B5CF6] px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:bg-[#7C3AED] disabled:opacity-40"
                      >
                        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                        Guardar cambios
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
