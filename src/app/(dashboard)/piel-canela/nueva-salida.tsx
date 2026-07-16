"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Plus,
  Trash2,
  X,
  Loader2,
  Home,
  PackagePlus,
  CheckCircle2,
  ArrowRight,
} from "lucide-react"
import { crearSalidaInterna } from "./actions"

type ProductoBase = { id: string; sku: string; nombre: string; precio: number }
type Fila = { producto_id: string; sku: string; nombre: string; cantidad: number; precio: number }

const mxn = (v: number) =>
  (Number(v) || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  })

const hoyLabel = () =>
  new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })

export function NuevaSalida({ productos }: { productos: ProductoBase[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState("")
  const [filas, setFilas] = useState<Fila[]>([])
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<{ numero: string; fecha: string; ventaId: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const filtrados = useMemo(() => {
    if (!busqueda.trim()) return []
    const q = busqueda.toLowerCase()
    return productos
      .filter((p) => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 8)
  }, [busqueda, productos])

  const agregar = (p: ProductoBase) => {
    if (filas.some((f) => f.producto_id === p.id)) return
    setFilas((prev) => [
      ...prev,
      { producto_id: p.id, sku: p.sku, nombre: p.nombre, cantidad: 1, precio: p.precio },
    ])
    setBusqueda("")
  }
  const setCantidad = (i: number, v: number) =>
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, cantidad: v } : f)))
  const quitar = (i: number) => setFilas((prev) => prev.filter((_, idx) => idx !== i))
  const totalU = filas.reduce((s, f) => s + (f.cantidad || 0), 0)
  const totalMXN = filas.reduce((s, f) => s + f.precio * (f.cantidad || 0), 0)

  function guardar() {
    if (filas.length === 0) return
    setError(null)
    startTransition(async () => {
      const res = await crearSalidaInterna(
        filas.map((f) => ({ producto_id: f.producto_id, cantidad: Math.max(1, Math.round(f.cantidad || 0)) })),
      )
      if (!res.ok) {
        setError(res.error)
        return
      }
      setExito({ numero: res.numero, fecha: res.fecha, ventaId: res.ventaId })
      setFilas([])
      setAbierto(false)
      router.refresh()
    })
  }

  // Confirmación de la última salida registrada (con folio/fecha automáticos)
  const banner = exito && (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
      <p className="flex items-center gap-2 text-[12.5px] text-emerald-800">
        <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
        Salida registrada —{" "}
        <span className="font-mono font-semibold">{exito.numero || "cotización interna"}</span>
        <span className="text-emerald-600">
          · {new Date(exito.fecha).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
        </span>
      </p>
      <div className="flex items-center gap-3">
        <Link
          href={`/ventas/${exito.ventaId}`}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 hover:underline"
        >
          Ver <ArrowRight className="size-3.5" />
        </Link>
        <button type="button" onClick={() => setExito(null)} className="text-emerald-500 hover:text-emerald-700" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>
    </div>
  )

  if (!abierto) {
    return (
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => {
            setAbierto(true)
            setExito(null)
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B5CF6] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#7C3AED]"
        >
          <PackagePlus className="size-4" />
          Nueva salida
        </button>
        {banner}
      </div>
    )
  }

  return (
    <section className="w-full rounded-2xl border border-purple-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-gray-900">
            <Home className="size-4 text-[#8B5CF6]" />
            Nueva salida a la terraza
          </h3>
          <p className="text-[11.5px] text-gray-500">
            Se guarda como <b>cotización interna</b> — folio, fecha y nombre (Piel Canela)
            automáticos. Descuenta inventario y NO cuenta en finanzas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAbierto(false)
            setFilas([])
            setError(null)
          }}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Datos automáticos (como cotización) */}
      <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl border border-purple-50 bg-purple-50/40 px-3 py-2 text-[11px]">
        <div>
          <p className="font-semibold uppercase tracking-[0.06em] text-[#7C3AED]">Cliente</p>
          <p className="mt-0.5 text-gray-700">Piel Canela</p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-[0.06em] text-[#7C3AED]">Fecha</p>
          <p className="mt-0.5 text-gray-700">{hoyLabel()}</p>
        </div>
        <div>
          <p className="font-semibold uppercase tracking-[0.06em] text-[#7C3AED]">Folio</p>
          <p className="mt-0.5 text-gray-700">Automático (PC-…-Piel Canela)</p>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative mb-3">
        <input
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#8B5CF6] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/20"
          placeholder="Buscar producto por SKU o nombre…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        {filtrados.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
            {filtrados.map((p) => {
              const ya = filas.some((f) => f.producto_id === p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={ya}
                  onClick={() => agregar(p)}
                  className="flex w-full items-center justify-between gap-3 border-b border-gray-50 px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-gray-50 disabled:opacity-40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium text-gray-900">{p.nombre}</p>
                    <p className="text-[10.5px] text-gray-500">{p.sku} · {mxn(p.precio)}</p>
                  </div>
                  <Plus className="size-3.5 shrink-0 text-gray-400" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Filas */}
      {filas.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                <th className="px-2 py-2 text-left">Producto</th>
                <th className="px-2 py-2 text-center">Cant.</th>
                <th className="px-2 py-2 text-right">P. público</th>
                <th className="px-2 py-2 text-right">Importe</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={f.producto_id} className="border-b border-gray-50">
                  <td className="px-2 py-2">
                    <p className="font-medium text-gray-900">{f.nombre}</p>
                    <p className="text-[10px] text-gray-400">{f.sku}</p>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="number"
                      min={1}
                      value={f.cantidad}
                      onChange={(e) => setCantidad(i, Number(e.target.value))}
                      className="h-8 w-16 rounded-lg border border-gray-200 px-2 text-center"
                    />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-500">{mxn(f.precio)}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums text-gray-900">
                    {mxn(f.precio * (f.cantidad || 0))}
                  </td>
                  <td className="px-1 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => quitar(i)}
                      className="inline-flex size-7 items-center justify-center rounded-md bg-rose-50 text-rose-500 transition-colors hover:bg-rose-100"
                      aria-label="Quitar"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 text-[12px] font-bold text-gray-900">
                <td className="px-2 py-2" colSpan={3}>Total (valor público)</td>
                <td className="px-2 py-2 text-right tabular-nums text-[#7C3AED]">{mxn(totalMXN)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-[12px] italic text-gray-400">Busca un producto para agregarlo a la salida.</p>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[12px] text-gray-500">
          {totalU} unidad{totalU === 1 ? "" : "es"} se descontarán del inventario
        </span>
        <button
          type="button"
          onClick={guardar}
          disabled={pending || filas.length === 0}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B5CF6] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#7C3AED] disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Home className="size-4" />}
          {pending ? "Guardando…" : "Registrar salida"}
        </button>
      </div>
    </section>
  )
}
