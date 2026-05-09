"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Trash2, Save, FileDown, Search } from "lucide-react"
import type {
  Cliente,
  CotizacionItem,
  CotizacionData,
  Producto,
} from "@/lib/cotizacion-types"
import { CotizacionPreview } from "@/components/cotizaciones/CotizacionPreview"
import { saveCotizacion, updateCotizacion } from "../actions"
import { downloadCotizacionPdf } from "@/lib/pdf"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
})

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function plus30() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

export type CotizacionFormInitial = {
  numero: string
  cliente_id: string
  fecha: string
  valida_hasta: string | null
  ivaActivo: boolean
  notas: string | null
  items: CotizacionItem[]
}

export function CotizacionForm({
  clientes,
  productos,
  productosError,
  editId,
  initial,
}: {
  clientes: Cliente[]
  productos: Producto[]
  productosError: string | null
  editId?: string
  initial?: CotizacionFormInitial
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const previewRef = useRef<HTMLDivElement>(null)
  const isEdit = !!editId

  const [clienteId, setClienteId] = useState<string>(initial?.cliente_id ?? "")
  const [numero, setNumero] = useState<string>(initial?.numero ?? "")
  const [fecha, setFecha] = useState<string>(initial?.fecha ?? todayISO())
  const [validaHasta, setValidaHasta] = useState<string>(
    initial?.valida_hasta ?? plus30(),
  )
  const [ivaActivo, setIvaActivo] = useState<boolean>(initial?.ivaActivo ?? true)
  const [notas, setNotas] = useState<string>(initial?.notas ?? "")
  const [items, setItems] = useState<CotizacionItem[]>(initial?.items ?? [])

  const [search, setSearch] = useState<string>("")
  const [selectedProductId, setSelectedProductId] = useState<string>("")
  const [cantidad, setCantidad] = useState<number>(1)

  const cliente = useMemo(
    () => clientes.find((c) => c.id === clienteId) ?? null,
    [clienteId, clientes],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return productos.slice(0, 20)
    return productos
      .filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q),
      )
      .slice(0, 20)
  }, [search, productos])

  const selectedProduct = useMemo(
    () => productos.find((p) => p.id === selectedProductId) ?? null,
    [selectedProductId, productos],
  )

  const subtotal = items.reduce((s, it) => s + it.subtotal, 0)
  const iva = ivaActivo ? subtotal * 0.16 : 0
  const total = subtotal + iva

  const previewData: CotizacionData = {
    numero,
    fecha,
    valida_hasta: validaHasta,
    cliente,
    items,
    subtotal,
    iva,
    ivaActivo,
    descuento: 0,
    total,
    notas: notas || null,
  }

  function addItem() {
    if (!selectedProduct || cantidad < 1) return
    const newItem: CotizacionItem = {
      producto_id: selectedProduct.id,
      sku: selectedProduct.sku,
      nombre: selectedProduct.nombre,
      imagen_url: selectedProduct.imagen_url,
      peso: selectedProduct.peso,
      cantidad,
      precio_unitario: selectedProduct.precio,
      costo_unitario: 0,
      subtotal: selectedProduct.precio * cantidad,
    }
    setItems((prev) => {
      const i = prev.findIndex((x) => x.producto_id === newItem.producto_id)
      if (i === -1) return [...prev, newItem]
      const copy = [...prev]
      const merged: CotizacionItem = {
        ...copy[i],
        cantidad: copy[i].cantidad + cantidad,
        subtotal: (copy[i].cantidad + cantidad) * copy[i].precio_unitario,
      }
      copy[i] = merged
      return copy
    })
    setSelectedProductId("")
    setCantidad(1)
    setSearch("")
  }

  function updateItemCantidad(producto_id: string, value: number) {
    setItems((prev) =>
      prev.map((it) =>
        it.producto_id === producto_id
          ? { ...it, cantidad: value, subtotal: value * it.precio_unitario }
          : it,
      ),
    )
  }

  function removeItem(producto_id: string) {
    setItems((prev) => prev.filter((it) => it.producto_id !== producto_id))
  }

  function handleSave() {
    if (!numero.trim()) {
      toast.error("Captura el número de cotización.")
      return
    }
    if (!clienteId) {
      toast.error("Selecciona un cliente.")
      return
    }
    if (items.length === 0) {
      toast.error("Agrega al menos un producto.")
      return
    }
    startTransition(async () => {
      try {
        const payload = {
          numero: numero.trim(),
          cliente_id: clienteId,
          fecha,
          valida_hasta: validaHasta || null,
          moneda: "MXN",
          subtotal,
          iva,
          descuento: 0,
          total,
          costo_productos: items.reduce(
            (s, it) => s + it.costo_unitario * it.cantidad,
            0,
          ),
          notas: notas || null,
          items: items.map((it) => ({
            producto_id: it.producto_id,
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario,
            costo_unitario: it.costo_unitario,
            subtotal: it.subtotal,
          })),
        }
        const result = isEdit
          ? await updateCotizacion(editId!, payload)
          : await saveCotizacion(payload)
        if (!result.ok) {
          console.error("[handleSave] action error:", result.error)
          toast.error(result.error, { duration: 8000 })
          return
        }
        toast.success(isEdit ? "Cambios guardados." : "Cotización guardada.")
        const targetId = "id" in result ? result.id : editId!
        router.push(`/cotizaciones/${targetId}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error("[handleSave] threw:", e)
        toast.error(`Error al guardar: ${msg}`, { duration: 8000 })
      }
    })
  }

  async function handlePdf() {
    if (!previewRef.current) return
    try {
      const nombreCliente =
        cliente?.nombre_negocio ?? cliente?.nombre ?? "SinCliente"
      await downloadCotizacionPdf(previewRef.current, numero, nombreCliente)
    } catch (e) {
      toast.error(`Error al generar PDF: ${(e as Error).message}`)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 p-6">
      <aside className="lg:sticky lg:top-6 self-start space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Cliente</h2>
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          >
            <option value="">Selecciona un cliente…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre_negocio ? `${c.nombre_negocio} — ${c.nombre}` : c.nombre}
              </option>
            ))}
          </select>
          {cliente && (
            <div className="mt-3 space-y-1 text-xs text-gray-600">
              <div>
                <strong className="text-gray-900">{cliente.nombre}</strong>
                {cliente.nombre_negocio && ` · ${cliente.nombre_negocio}`}
              </div>
              {cliente.telefono && <div>Tel: {cliente.telefono}</div>}
              {cliente.email && <div>{cliente.email}</div>}
              {cliente.direccion && (
                <div>
                  {cliente.direccion}
                  {cliente.ciudad ? `, ${cliente.ciudad}` : ""}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Productos</h2>
          {productosError && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              {productosError}
            </div>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o SKU…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            />
          </div>
          <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-gray-100">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-gray-500">
                Sin resultados.
              </div>
            ) : (
              filtered.map((p) => {
                const active = p.id === selectedProductId
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProductId(p.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-pink-50 ${
                      active ? "bg-pink-50" : "bg-white"
                    }`}
                  >
                    {p.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imagen_url}
                        alt={p.nombre}
                        className="size-9 shrink-0 rounded border border-gray-200 object-cover"
                      />
                    ) : (
                      <div className="size-9 shrink-0 rounded border border-gray-200 bg-gray-50" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium text-gray-900">
                        {p.nombre}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                        {p.sku && (
                          <span className="font-mono">{p.sku}</span>
                        )}
                        {p.peso && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                            {p.peso}
                          </span>
                        )}
                        <span className="font-semibold text-pink-600">
                          {mxn.format(p.precio)}
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              min={1}
              step={1}
              value={cantidad}
              onChange={(e) =>
                setCantidad(Math.max(1, parseInt(e.target.value) || 1))
              }
              className="w-20 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            />
            <button
              type="button"
              onClick={addItem}
              disabled={!selectedProduct}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              <Plus className="size-4" />
              Agregar
            </button>
          </div>

          {items.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
              {items.map((it) => (
                <div
                  key={it.producto_id}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="flex-1 truncate text-gray-700">
                    {it.nombre}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={it.cantidad}
                    onChange={(e) =>
                      updateItemCantidad(
                        it.producto_id,
                        Math.max(1, parseInt(e.target.value) || 1),
                      )
                    }
                    className="w-14 rounded border border-gray-200 px-2 py-0.5 text-xs"
                  />
                  <span className="w-16 text-right tabular-nums font-medium">
                    {mxn.format(it.subtotal)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(it.producto_id)}
                    className="text-gray-400 hover:text-red-600"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Detalles</h2>

          <label className="block text-xs">
            <span className="text-gray-600">Número de orden</span>
            <input
              type="text"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="PC-210526001-V-NombreCliente"
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs">
              <span className="text-gray-600">Fecha</span>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
            </label>
            <label className="block text-xs">
              <span className="text-gray-600">Vigente hasta</span>
              <input
                type="date"
                value={validaHasta}
                onChange={(e) => setValidaHasta(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
            </label>
          </div>

          <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900">IVA 16%</p>
              <p className="text-xs text-gray-500">
                Aplica impuesto al subtotal
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIvaActivo((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                ivaActivo ? "bg-pink-600" : "bg-gray-300"
              }`}
              aria-pressed={ivaActivo}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${
                  ivaActivo ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <label className="block text-xs">
            <span className="text-gray-600">Notas (opcional)</span>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="flex items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300"
          >
            <Save className="size-4" />
            {pending ? "Guardando…" : "Guardar Cotización"}
          </button>
          <button
            type="button"
            onClick={handlePdf}
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <FileDown className="size-4" />
            Descargar PDF
          </button>
        </div>
      </aside>

      <section>
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-auto">
          <CotizacionPreview data={previewData} innerRef={previewRef} />
        </div>
      </section>
    </div>
  )
}
