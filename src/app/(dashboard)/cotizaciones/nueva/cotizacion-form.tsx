"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Trash2, Save, FileDown, Search, FileText } from "lucide-react"
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
  descuentoTipo?: "monto" | "pct"
  descuentoValor?: number
  costoEnvio?: number
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
  const [descuentoTipo, setDescuentoTipo] = useState<"monto" | "pct">(
    initial?.descuentoTipo ?? "monto",
  )
  const [descuentoValor, setDescuentoValor] = useState<number>(
    initial?.descuentoValor ?? 0,
  )
  const [costoEnvio, setCostoEnvio] = useState<number>(initial?.costoEnvio ?? 0)
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
  // Descuento global (% o monto fijo). Se aplica DESPUÉS del IVA — coincide con la lógica del Sheet.
  const descuento =
    descuentoTipo === "pct"
      ? Math.max(0, Math.min(subtotal, subtotal * (descuentoValor / 100)))
      : Math.max(0, Math.min(subtotal, descuentoValor))
  const iva = ivaActivo ? subtotal * 0.16 : 0
  const total = subtotal + iva - descuento
  const costoProductos = items.reduce(
    (s, it) => s + it.costo_unitario * it.cantidad,
    0,
  )
  // Utilidad neta = subtotal − descuento − costo_productos − costo_envio
  const utilidadNeta = subtotal - descuento - costoProductos - costoEnvio
  const margenNeto = total > 0 ? (utilidadNeta / total) * 100 : 0

  // ─── Resumen inteligente del pedido (categorización por SKU prefix) ──
  const itemsCount = items.length
  const piezasTotal = items.reduce((s, it) => s + Number(it.cantidad ?? 0), 0)
  const resumenCategorias = useMemo(() => {
    const map = new Map<
      string,
      { label: string; cantidad: number; piezas: number; monto: number; tone: string }
    >()
    const SKU_LABELS: Array<[RegExp, { label: string; tone: string }]> = [
      [/^CN-/i, { label: "Cintas", tone: "text-pink-700 bg-pink-50" }],
      [/^AC-/i, { label: "Activadores", tone: "text-emerald-700 bg-emerald-50" }],
      [/^OX/i, { label: "Emulsión", tone: "text-teal-700 bg-teal-50" }],
      [/^PB-/i, { label: "Polvo blanquear", tone: "text-violet-700 bg-violet-50" }],
      [/^AE-/i, { label: "Aerografía", tone: "text-amber-700 bg-amber-50" }],
      [/^PO-/i, { label: "Potenciadores", tone: "text-rose-700 bg-rose-50" }],
      [/^HI-/i, { label: "Humectantes", tone: "text-blue-700 bg-blue-50" }],
      [/^EX-/i, { label: "Exfoliants", tone: "text-orange-700 bg-orange-50" }],
      [/^SM/i, { label: "Sombrillas", tone: "text-cyan-700 bg-cyan-50" }],
      [/^DYE/i, { label: "Dye Color", tone: "text-purple-700 bg-purple-50" }],
      [/^DOL/i, { label: "Aceite", tone: "text-yellow-700 bg-yellow-50" }],
    ]
    for (const it of items) {
      const sku = it.sku ?? ""
      const match = SKU_LABELS.find(([rx]) => rx.test(sku))
      const cat = match
        ? match[1]
        : { label: "Otros", tone: "text-gray-700 bg-gray-100" }
      const cur =
        map.get(cat.label) ?? {
          label: cat.label,
          cantidad: 0,
          piezas: 0,
          monto: 0,
          tone: cat.tone,
        }
      cur.cantidad += 1
      cur.piezas += Number(it.cantidad ?? 0)
      cur.monto += Number(it.subtotal ?? 0)
      map.set(cat.label, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.piezas - a.piezas)
  }, [items])

  const previewData: CotizacionData = {
    numero,
    fecha,
    valida_hasta: validaHasta,
    cliente,
    items,
    subtotal,
    iva,
    ivaActivo,
    descuento,
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
      costo_unitario: Number(selectedProduct.costo ?? 0),
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
          descuento,
          total,
          costo_productos: costoProductos,
          costo_envio: costoEnvio,
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
          <ClientePicker
            clientes={clientes}
            selectedId={clienteId}
            onSelect={setClienteId}
          />
          {cliente && (
            <div className="mt-3 space-y-1.5 rounded-lg bg-gradient-to-br from-pink-50/60 to-white p-3 text-xs">
              <div className="flex items-center justify-between">
                <strong className="text-sm text-gray-900">
                  {cliente.nombre_negocio ?? cliente.nombre}
                </strong>
                {cliente.rfc && (
                  <span className="rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-blue-700">
                    {cliente.rfc}
                  </span>
                )}
              </div>
              {cliente.nombre_negocio && (
                <div className="text-gray-600">{cliente.nombre}</div>
              )}
              {cliente.telefono && (
                <div className="text-gray-600">📞 {cliente.telefono}</div>
              )}
              {cliente.email && (
                <div className="text-gray-600">✉ {cliente.email}</div>
              )}
              {cliente.direccion && (
                <div className="text-gray-600">
                  📍{" "}
                  {[
                    cliente.direccion,
                    cliente.colonia,
                    cliente.codigo_postal
                      ? `C.P. ${cliente.codigo_postal}`
                      : null,
                    cliente.ciudad,
                    cliente.estado,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              )}
              {cliente.metodo_pago_pref && (
                <div className="text-gray-500 text-[10.5px]">
                  💳 Método pago pref.: {cliente.metodo_pago_pref}
                </div>
              )}
              <button
                type="button"
                onClick={() => setClienteId("")}
                className="mt-2 text-[10.5px] text-pink-600 hover:text-pink-800 hover:underline"
              >
                Cambiar cliente
              </button>
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

          <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3">
            <div>
              <p className="text-sm font-medium text-gray-900">IVA 16%</p>
              <p className="text-xs text-gray-500">
                Aplica impuesto al subtotal
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIvaActivo((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 ${
                ivaActivo ? "bg-pink-600" : "bg-gray-300"
              }`}
              role="switch"
              aria-checked={ivaActivo}
            >
              <span className="sr-only">
                {ivaActivo ? "Desactivar IVA" : "Activar IVA"}
              </span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  ivaActivo ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* Resumen inteligente del pedido (real-time) */}
          {items.length > 0 && (
            <div className="rounded-xl border border-pink-200/60 bg-gradient-to-br from-pink-50/70 via-white to-teal-50/40 p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="flex size-5 items-center justify-center rounded-md bg-pink-100 text-pink-700">
                    <FileText className="size-3" />
                  </span>
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-pink-700">
                    Resumen del pedido
                  </span>
                </div>
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-pink-700 ring-1 ring-pink-200/60">
                  {itemsCount} ítems · {piezasTotal} pzs
                </span>
              </div>
              <ul className="space-y-1">
                {resumenCategorias.map((c) => (
                  <li
                    key={c.label}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <span
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${c.tone}`}
                    >
                      {c.label}
                    </span>
                    <span className="flex items-center gap-2 tabular-nums text-gray-700">
                      <span className="text-gray-500">{c.cantidad} ítems</span>
                      <span className="font-semibold">{c.piezas} pzs</span>
                      <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-900 ring-1 ring-gray-200/60">
                        {mxn.format(c.monto)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Descuento global con toggle %/$ */}
          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">Descuento</p>
              <div className="inline-flex items-center rounded-md bg-gray-100 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setDescuentoTipo("monto")}
                  className={`rounded px-2 py-0.5 font-medium transition ${
                    descuentoTipo === "monto"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  $ Monto
                </button>
                <button
                  type="button"
                  onClick={() => setDescuentoTipo("pct")}
                  className={`rounded px-2 py-0.5 font-medium transition ${
                    descuentoTipo === "pct"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  % Porcentaje
                </button>
              </div>
            </div>
            <div className="relative">
              <input
                type="number"
                min="0"
                step={descuentoTipo === "pct" ? "0.1" : "0.01"}
                value={descuentoValor || ""}
                onChange={(e) =>
                  setDescuentoValor(Number(e.target.value) || 0)
                }
                placeholder="0"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-8 text-sm tabular-nums focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500">
                {descuentoTipo === "pct" ? "%" : "$"}
              </span>
            </div>
            {descuento > 0 && (
              <p className="text-xs text-rose-600 tabular-nums">
                − {mxn.format(descuento)}
                {descuentoTipo === "pct" && (
                  <span className="text-gray-500">
                    {" "}({descuentoValor.toFixed(1)}% de subtotal)
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Costo de envío */}
          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">Costo de envío</p>
              <span className="text-[10px] uppercase tracking-wider text-gray-400">
                resta de utilidad neta
              </span>
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500">
                $
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={costoEnvio || ""}
                onChange={(e) => setCostoEnvio(Number(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-200 bg-white pl-6 pr-3 py-2 text-sm tabular-nums focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
            </div>
          </div>

          {/* Resumen financiero (lectura) */}
          <div className="rounded-lg border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-3 space-y-1.5 text-xs">
            <Row label="Subtotal" value={mxn.format(subtotal)} />
            {descuento > 0 && (
              <Row label="Descuento" value={`− ${mxn.format(descuento)}`} accent="text-rose-600" />
            )}
            {iva > 0 && (
              <Row label="IVA 16%" value={mxn.format(iva)} accent="text-teal-700" />
            )}
            <Row label="Total" value={mxn.format(total)} bold />
            <div className="border-t border-gray-200 pt-1.5 mt-1.5 space-y-1">
              <Row label="Costo productos" value={mxn.format(costoProductos)} muted />
              {costoEnvio > 0 && (
                <Row label="Costo envío" value={mxn.format(costoEnvio)} muted />
              )}
              <Row
                label="Utilidad neta"
                value={mxn.format(utilidadNeta)}
                accent={utilidadNeta >= 0 ? "text-emerald-700" : "text-rose-700"}
                bold
              />
              <Row
                label="Margen neto"
                value={`${margenNeto.toFixed(1)}%`}
                muted
              />
            </div>
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

function ClientePicker({
  clientes,
  selectedId,
  onSelect,
}: {
  clientes: Cliente[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

  const filtered = useMemo(() => {
    if (!query.trim()) return clientes.slice(0, 30)
    const q = norm(query.trim())
    return clientes
      .filter((c) => {
        const haystack = norm(
          `${c.nombre} ${c.nombre_negocio ?? ""} ${c.rfc ?? ""} ${c.email ?? ""} ${c.ciudad ?? ""}`,
        )
        return haystack.includes(q)
      })
      .slice(0, 50)
  }, [clientes, query])

  const selected = clientes.find((c) => c.id === selectedId)

  if (selected && !open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          setQuery("")
        }}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm transition hover:border-pink-300"
      >
        <span className="truncate text-gray-900">
          {selected.nombre_negocio ?? selected.nombre}
        </span>
        <Search className="size-4 text-gray-400" />
      </button>
    )
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar por nombre, negocio, RFC, ciudad…"
          autoComplete="off"
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
      </div>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white shadow-xl">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-gray-500">
                No se encontraron clientes con ese criterio.
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelect(c.id)
                    setOpen(false)
                    setQuery("")
                  }}
                  className="flex w-full items-start gap-2 border-b border-gray-100 px-3 py-2 text-left transition last:border-b-0 hover:bg-pink-50/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-gray-900">
                        {c.nombre_negocio ?? c.nombre}
                      </span>
                      {c.rfc && (
                        <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-blue-700">
                          {c.rfc}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-gray-500">
                      {c.nombre_negocio && (
                        <span>{c.nombre} · </span>
                      )}
                      {c.ciudad ?? "—"}
                      {c.telefono && <span> · {c.telefono}</span>}
                    </div>
                  </div>
                </button>
              ))
            )}
            <div className="border-t border-gray-100 p-2">
              <a
                href="/clientes/nuevo"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-md bg-pink-50 px-2 py-1.5 text-[11px] font-medium text-pink-700 transition hover:bg-pink-100"
              >
                + Crear nuevo cliente
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  accent,
  bold,
  muted,
}: {
  label: string
  value: string
  accent?: string
  bold?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={
          muted
            ? "text-[10.5px] uppercase tracking-wider text-gray-500"
            : "text-gray-600"
        }
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${accent ?? "text-gray-900"} ${bold ? "font-semibold" : ""}`}
      >
        {value}
      </span>
    </div>
  )
}
