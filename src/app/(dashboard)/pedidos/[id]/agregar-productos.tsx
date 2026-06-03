"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, PackagePlus, X, Loader2, Boxes } from "lucide-react"
import { agregarItemsPedido } from "../actions"

type ProductoBase = {
  id: string
  sku: string
  nombre: string
  precio_usd: number | null
}

type Fila = {
  producto_id: string
  sku: string
  nombre: string
  cantidad: number
  precio_usd: number
}

const usd = (v: number) => `$${v.toFixed(2)}`

export function AgregarProductosPedido({
  pedidoId,
  productos,
}: {
  pedidoId: string
  productos: ProductoBase[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState("")
  const [filas, setFilas] = useState<Fila[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const filtrados = useMemo(() => {
    if (!busqueda.trim()) return []
    const q = busqueda.toLowerCase()
    return productos
      .filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [busqueda, productos])

  const agregar = (p: ProductoBase) => {
    if (filas.some((f) => f.producto_id === p.id)) return
    setFilas((prev) => [
      ...prev,
      {
        producto_id: p.id,
        sku: p.sku,
        nombre: p.nombre,
        cantidad: 1,
        precio_usd: Number(p.precio_usd ?? 0),
      },
    ])
    setBusqueda("")
  }

  const setFila = (i: number, campo: "cantidad" | "precio_usd", v: number) =>
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, [campo]: v } : f)))

  const quitar = (i: number) =>
    setFilas((prev) => prev.filter((_, idx) => idx !== i))

  const totalUnidades = filas.reduce((s, f) => s + (f.cantidad || 0), 0)

  function guardar() {
    if (filas.length === 0) return
    setError(null)
    startTransition(async () => {
      const res = await agregarItemsPedido(
        pedidoId,
        filas.map((f) => ({
          producto_id: f.producto_id,
          cantidad: Math.max(1, Math.round(f.cantidad || 0)),
          precio_usd: Number(f.precio_usd) || 0,
        })),
      )
      if (!res.ok) {
        setError(res.error)
        return
      }
      setFilas([])
      setAbierto(false)
      router.refresh()
    })
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
      >
        <PackagePlus className="size-4" />
        Agregar productos
      </button>
    )
  }

  return (
    <section className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-gray-900">
            <PackagePlus className="size-4 text-teal-600" />
            Agregar productos a este pedido
          </h3>
          <p className="text-[11.5px] text-gray-500">
            Re-prorratea el envío sobre el nuevo total y <b>suma el stock</b> al
            inventario.
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

      {/* Buscador */}
      <div className="relative mb-3">
        <input
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
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
                    <p className="truncate text-[12.5px] font-medium text-gray-900">
                      {p.nombre}
                    </p>
                    <p className="text-[10.5px] text-gray-500">
                      {p.sku} · {usd(Number(p.precio_usd ?? 0))} USD
                    </p>
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
                <th className="px-2 py-2 text-right">Precio USD</th>
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
                      onChange={(e) => setFila(i, "cantidad", Number(e.target.value))}
                      className="h-8 w-16 rounded-lg border border-gray-200 px-2 text-center"
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={f.precio_usd}
                      onChange={(e) => setFila(i, "precio_usd", Number(e.target.value))}
                      className="h-8 w-24 rounded-lg border border-gray-200 px-2 text-right"
                    />
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
          </table>
        </div>
      ) : (
        <p className="text-[12px] italic text-gray-400">
          Busca un producto para agregarlo a la entrada.
        </p>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[12px] text-gray-500">
          <Boxes className="size-3.5 text-teal-600" />
          {totalUnidades} unidad{totalUnidades === 1 ? "" : "es"} se sumarán al
          stock
        </span>
        <button
          type="button"
          onClick={guardar}
          disabled={pending || filas.length === 0}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0c635c] disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <PackagePlus className="size-4" />
          )}
          {pending ? "Guardando…" : "Guardar entradas"}
        </button>
      </div>
    </section>
  )
}
