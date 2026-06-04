"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  X,
  Save,
  Boxes,
  DollarSign,
  Truck,
  Package,
  Loader2,
} from "lucide-react"
import { crearProducto } from "./actions"

export type Opcion = { id: string; nombre: string }

type FormState = {
  sku: string
  nombre: string
  categoria_id: string
  proveedor_id: string
  peso: string
  stock_actual: string
  stock_minimo: string
  precio_publico: string
  precio_usd: string
  costo_envio_usd: string
  tipo_cambio: string
}

function parseNum(s: string): number | null {
  const t = s.trim().replace(/,/g, ".")
  if (t === "") return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export type ProductoCreado = {
  id: string
  sku: string
  nombre: string
  precio_usd: number
  precio_publico: number
  proveedor_id: string | null
}

export function ProductCreateModal({
  onClose,
  categoriaOptions,
  proveedorOptions,
  defaultTc,
  onCreated,
}: {
  onClose: () => void
  categoriaOptions: Opcion[]
  proveedorOptions: Opcion[]
  defaultTc: number
  /** Si se pasa, se llama con el producto recién creado (para agregarlo a un pedido). */
  onCreated?: (p: ProductoCreado) => void
}) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(() => ({
    sku: "",
    nombre: "",
    categoria_id: "",
    proveedor_id: "",
    peso: "",
    stock_actual: "0",
    stock_minimo: "0",
    precio_publico: "",
    precio_usd: "",
    costo_envio_usd: "",
    tipo_cambio: defaultTc ? String(defaultTc) : "",
  }))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Esc cierra + lock scroll
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const set = (k: keyof FormState, v: string) =>
    setForm((f) => ({ ...f, [k]: v }))

  function onSave() {
    if (!form.sku.trim()) return setError("El SKU es obligatorio")
    if (!form.nombre.trim()) return setError("El nombre es obligatorio")
    if (!form.categoria_id) return setError("Selecciona una categoría")
    setError(null)
    startTransition(async () => {
      const res = await crearProducto({
        sku: form.sku,
        nombre: form.nombre,
        peso: form.peso,
        categoria_id: form.categoria_id,
        proveedor_id: form.proveedor_id || null,
        precio_publico: parseNum(form.precio_publico),
        precio_usd: parseNum(form.precio_usd),
        costo_envio_usd: parseNum(form.costo_envio_usd),
        tipo_cambio: parseNum(form.tipo_cambio),
        stock_actual: parseNum(form.stock_actual) ?? 0,
        stock_minimo: parseNum(form.stock_minimo) ?? 0,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onCreated?.({
        id: res.id,
        sku: form.sku.trim().toUpperCase(),
        nombre: form.nombre.trim(),
        precio_usd: parseNum(form.precio_usd) ?? 0,
        precio_publico: parseNum(form.precio_publico) ?? 0,
        proveedor_id: form.proveedor_id || null,
      })
      router.refresh()
      onClose()
    })
  }

  const envioMxn = (() => {
    const u = parseNum(form.costo_envio_usd)
    const tc = parseNum(form.tipo_cambio)
    return u != null && tc != null
      ? (u * tc).toLocaleString("es-MX", { style: "currency", currency: "MXN" })
      : "—"
  })()

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div
        className="fixed inset-0 z-[61] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 fade-in duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start gap-3 border-b border-gray-100 px-6 py-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Package className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">
                Inventario
              </p>
              <h2 className="truncate text-base font-semibold text-gray-900">
                Nuevo producto
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              aria-label="Cerrar"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* Identidad */}
            <Group icon={<Package className="size-3.5" />} title="Identidad">
              <Field label="SKU *">
                <input
                  type="text"
                  value={form.sku}
                  onChange={(e) => set("sku", e.target.value.toUpperCase())}
                  placeholder="ej. CN-COR-WH9"
                  className={inputCls}
                />
              </Field>
              <Field label="Peso / medida">
                <input
                  type="text"
                  value={form.peso}
                  onChange={(e) => set("peso", e.target.value)}
                  placeholder="ej. 9mm, 850g"
                  className={inputCls}
                />
              </Field>
              <Field label="Nombre *" className="col-span-2">
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => set("nombre", e.target.value)}
                  placeholder="ej. Cinta Corazones Blanca 9mm"
                  className={inputCls}
                />
              </Field>
              <Field label="Categoría *">
                <select
                  value={form.categoria_id}
                  onChange={(e) => set("categoria_id", e.target.value)}
                  className={inputCls}
                >
                  <option value="">Selecciona…</option>
                  {categoriaOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Proveedor">
                <select
                  value={form.proveedor_id}
                  onChange={(e) => set("proveedor_id", e.target.value)}
                  className={inputCls}
                >
                  <option value="">Sin especificar</option>
                  {proveedorOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </Field>
            </Group>

            {/* Stock */}
            <Group icon={<Boxes className="size-3.5" />} title="Stock">
              <Field label="Stock actual">
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.stock_actual}
                  onChange={(e) => set("stock_actual", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Stock mínimo">
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.stock_minimo}
                  onChange={(e) => set("stock_minimo", e.target.value)}
                  className={inputCls}
                />
              </Field>
            </Group>

            {/* Precios */}
            <Group icon={<DollarSign className="size-3.5" />} title="Precios">
              <Field label="Precio público (MXN)">
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.precio_publico}
                  onChange={(e) => set("precio_publico", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Precio (USD)">
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.precio_usd}
                  onChange={(e) => set("precio_usd", e.target.value)}
                  className={inputCls}
                />
              </Field>
            </Group>

            {/* Envío */}
            <Group icon={<Truck className="size-3.5" />} title="Envío de importación / unidad">
              <Field label="Envío / unidad (USD)">
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.costo_envio_usd}
                  onChange={(e) => set("costo_envio_usd", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Tipo de cambio (MXN/USD)">
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.tipo_cambio}
                  onChange={(e) => set("tipo_cambio", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <p className="col-span-2 -mt-1 text-[11px] text-gray-400">
                Envío en MXN = {envioMxn} · lo calcula el inventario automáticamente
              </p>
            </Group>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-6 py-3.5">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0c635c] disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {pending ? "Creando…" : "Crear producto"}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"

function Group({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <header className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        <span className="text-emerald-600">{icon}</span>
        {title}
      </header>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </section>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-[11px] font-medium text-gray-500">
        {label}
      </span>
      {children}
    </label>
  )
}
