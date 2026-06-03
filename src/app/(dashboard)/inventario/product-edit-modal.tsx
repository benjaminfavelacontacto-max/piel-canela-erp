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
import { actualizarProducto } from "./actions"
import type { ProductoEnriquecido } from "./inventario-view"

type FormState = {
  nombre_display: string
  peso: string
  stock_actual: string
  stock_minimo: string
  precio_publico: string
  precio_usd: string
  costo_envio_usd: string
  tipo_cambio: string
}

const EMPTY: FormState = {
  nombre_display: "",
  peso: "",
  stock_actual: "",
  stock_minimo: "",
  precio_publico: "",
  precio_usd: "",
  costo_envio_usd: "",
  tipo_cambio: "",
}

function initForm(p: ProductoEnriquecido | null): FormState {
  if (!p) return EMPTY
  const s = (v: number | null) => (v != null ? String(v) : "")
  return {
    nombre_display: p.nombre_display ?? p.nombre ?? "",
    peso: p.peso ?? "",
    stock_actual: String(p.stock_actual ?? 0),
    stock_minimo: String(p.stock_minimo ?? 0),
    precio_publico: s(p.precio_publico),
    precio_usd: s(p.precio_usd),
    costo_envio_usd: s(p.costo_envio_usd),
    tipo_cambio: s(p.tipo_cambio),
  }
}

function parseNum(s: string): number | null {
  const t = s.trim().replace(/,/g, ".")
  if (t === "") return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function ProductEditModal({
  producto,
  onClose,
}: {
  producto: ProductoEnriquecido | null
  onClose: () => void
}) {
  const router = useRouter()
  // Estado inicial derivado del producto. El padre remonta el modal vía `key`,
  // así que el inicializador lazy corre con el producto correcto en cada apertura.
  const [form, setForm] = useState<FormState>(() => initForm(producto))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Esc cierra + lock scroll
  useEffect(() => {
    if (!producto) return
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
  }, [producto, onClose])

  if (!producto) return null

  const set = (k: keyof FormState, v: string) =>
    setForm((f) => ({ ...f, [k]: v }))

  function onSave() {
    if (!producto) return
    setError(null)
    startTransition(async () => {
      const res = await actualizarProducto(producto.id, {
        nombre_display: form.nombre_display,
        peso: form.peso,
        stock_actual: parseNum(form.stock_actual) ?? 0,
        stock_minimo: parseNum(form.stock_minimo) ?? 0,
        precio_publico: parseNum(form.precio_publico),
        precio_usd: parseNum(form.precio_usd),
        costo_envio_usd: parseNum(form.costo_envio_usd),
        tipo_cambio: parseNum(form.tipo_cambio),
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      {/* Modal centrado */}
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
                Editar producto
              </p>
              <h2 className="truncate text-base font-semibold text-gray-900">
                {producto.nombre_display ?? producto.nombre}
              </h2>
              <p className="font-mono text-[11px] text-gray-400">{producto.sku}</p>
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
            {/* Datos del producto */}
            <Group icon={<Package className="size-3.5" />} title="Datos">
              <Field label="Nombre" className="col-span-2">
                <input
                  type="text"
                  value={form.nombre_display}
                  onChange={(e) => set("nombre_display", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Peso / medida">
                <input
                  type="text"
                  value={form.peso}
                  onChange={(e) => set("peso", e.target.value)}
                  placeholder="ej. 1 L, 250 ml, 9mm"
                  className={inputCls}
                />
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

            {/* Envío de importación (porción prorrateada por unidad).
                El inventario deriva el MXN = envío USD × TC; el stored mxn se ignora. */}
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
                Envío en MXN ={" "}
                {(() => {
                  const u = parseNum(form.costo_envio_usd)
                  const tc = parseNum(form.tipo_cambio)
                  return u != null && tc != null
                    ? (u * tc).toLocaleString("es-MX", {
                        style: "currency",
                        currency: "MXN",
                      })
                    : "—"
                })()}{" "}
                · lo calcula el inventario automáticamente
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
              {pending ? "Guardando…" : "Guardar cambios"}
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
