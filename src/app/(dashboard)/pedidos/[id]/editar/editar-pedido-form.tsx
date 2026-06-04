"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Trash2, ArrowLeft, Loader2 } from "lucide-react"
import {
  ProductCreateModal,
  type Opcion,
  type ProductoCreado,
} from "../../../inventario/product-create-modal"
import { editarPedido } from "../../actions"

type ProductoBase = {
  id: string
  sku: string
  nombre: string
  precio_usd: number | null
  proveedor_id: string | null
}

export type ItemInicial = {
  producto_id: string
  sku: string
  nombre: string
  cantidad: number
  precio_usd: number
  proveedor_id: string | null
}

export type PedidoInicial = {
  nombre: string
  fecha: string
  proveedor_id: string | null
  tipo: string
  tipo_cambio: number
  envio_total_usd: number
  notas: string | null
  sandra_usd: number
  benjamin_usd: number
  items: ItemInicial[]
}

const usd = (v: number) => `$${v.toFixed(2)}`
const mxn = (v: number) =>
  v.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })

export function EditarPedidoForm({
  pedidoId,
  inicial,
  productos,
  proveedorOptions,
  categoriaOptions,
}: {
  pedidoId: string
  inicial: PedidoInicial
  productos: ProductoBase[]
  proveedorOptions: Opcion[]
  categoriaOptions: Opcion[]
}) {
  const router = useRouter()
  const [nombre, setNombre] = useState(inicial.nombre)
  const [fecha, setFecha] = useState(inicial.fecha)
  const [proveedorId, setProveedorId] = useState(inicial.proveedor_id ?? "")
  const [tipo, setTipo] = useState(inicial.tipo || "productos")
  const [tc, setTc] = useState(inicial.tipo_cambio || 20.7)
  const [envioTotal, setEnvioTotal] = useState(inicial.envio_total_usd || 0)
  const [notas, setNotas] = useState(inicial.notas ?? "")
  const [items, setItems] = useState<ItemInicial[]>(inicial.items)

  const igualInicial =
    Math.abs(inicial.sandra_usd - inicial.benjamin_usd) < 0.01
  const [divisionIgual, setDivisionIgual] = useState(igualInicial)
  const [sandraInput, setSandraInput] = useState(String(inicial.sandra_usd || 0))
  const [benjaminInput, setBenjaminInput] = useState(
    String(inicial.benjamin_usd || 0),
  )

  const [busqueda, setBusqueda] = useState("")
  const [crearOpen, setCrearOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const subtotalUsd = items.reduce(
    (s, i) => s + (i.cantidad || 0) * (i.precio_usd || 0),
    0,
  )
  const totalUnidades = items.reduce((s, i) => s + (i.cantidad || 0), 0)
  const envioUnit = totalUnidades > 0 ? envioTotal / totalUnidades : 0
  const totalUsd = subtotalUsd + envioTotal
  const sandra = divisionIgual ? totalUsd / 2 : Number(sandraInput) || 0
  const benjamin = divisionIgual ? totalUsd / 2 : Number(benjaminInput) || 0

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

  const agregar = (p: {
    id: string
    sku: string
    nombre: string
    precio_usd: number | null
    proveedor_id?: string | null
  }) => {
    if (items.some((i) => i.producto_id === p.id)) return
    setItems((prev) => [
      ...prev,
      {
        producto_id: p.id,
        sku: p.sku,
        nombre: p.nombre,
        cantidad: 1,
        precio_usd: Number(p.precio_usd ?? 0),
        proveedor_id: p.proveedor_id ?? null,
      },
    ])
    setBusqueda("")
  }

  const onProductoCreado = (p: ProductoCreado) =>
    agregar({
      id: p.id,
      sku: p.sku,
      nombre: p.nombre,
      precio_usd: p.precio_usd,
      proveedor_id: p.proveedor_id,
    })

  const setItem = (i: number, campo: "cantidad" | "precio_usd", v: number) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [campo]: v } : it)))

  const setItemProveedor = (i: number, v: string) =>
    setItems((prev) =>
      prev.map((it, idx) => (idx === i ? { ...it, proveedor_id: v || null } : it)),
    )

  const quitar = (i: number) =>
    setItems((prev) => prev.filter((_, idx) => idx !== i))

  function guardar() {
    if (!nombre.trim()) return setError("Falta el nombre del pedido")
    if (items.length === 0) return setError("El pedido necesita al menos un producto")
    setError(null)
    startTransition(async () => {
      const res = await editarPedido(pedidoId, {
        nombre,
        fecha,
        proveedor_id: proveedorId || null,
        tipo,
        tipo_cambio: tc,
        envio_total_usd: envioTotal,
        notas: notas || null,
        sandra_usd: sandra,
        benjamin_usd: benjamin,
        items: items.map((i) => ({
          producto_id: i.producto_id,
          cantidad: Math.max(1, Math.round(i.cantidad || 0)),
          precio_usd: Number(i.precio_usd) || 0,
          proveedor_id: i.proveedor_id ?? null,
        })),
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.push(`/pedidos/${pedidoId}`)
      router.refresh()
    })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-gray-400">
            Pedidos de Compra
          </p>
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em] text-gray-900">
            Editar pedido
          </h1>
        </div>
        <Link href={`/pedidos/${pedidoId}`} className="pc-btn-secondary">
          <ArrowLeft className="size-4" />
          Cancelar
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* Datos generales */}
          <section className="pc-card">
            <p className="pc-label mb-4">Datos del pedido</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nombre *">
                <input className="pc-input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </Field>
              <Field label="Fecha">
                <input type="date" className="pc-input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </Field>
              <Field label="Proveedor">
                <select className="pc-input" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                  <option value="">Sin especificar</option>
                  {proveedorOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo">
                <select className="pc-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  <option value="productos">Productos</option>
                  <option value="cintas">Cintas</option>
                  <option value="mixto">Mixto</option>
                </select>
              </Field>
              <Field label="Tipo de cambio (MXN/USD)">
                <input type="number" step="0.01" className="pc-input" value={tc} onChange={(e) => setTc(Number(e.target.value))} />
              </Field>
              <Field label="Envío total (USD)">
                <input type="number" step="0.01" className="pc-input" value={envioTotal || ""} onChange={(e) => setEnvioTotal(Number(e.target.value))} />
              </Field>
            </div>
            <Field label="Notas" className="mt-3">
              <textarea className="pc-input" style={{ height: 60, padding: "10px 16px" }} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </Field>
          </section>

          {/* Productos */}
          <section className="pc-card">
            <p className="pc-label mb-4">Productos del pedido</p>
            <div className="relative mb-3">
              <input
                className="pc-input"
                placeholder="Buscar producto por SKU o nombre…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              {filtrados.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                  {filtrados.map((p) => {
                    const ya = items.some((i) => i.producto_id === p.id)
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
                          <p className="text-[10.5px] text-gray-500">{p.sku} · {usd(Number(p.precio_usd ?? 0))} USD</p>
                        </div>
                        <Plus className="size-3.5 shrink-0 text-gray-400" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setCrearOpen(true)}
              className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-teal-700 transition-colors hover:text-teal-800"
            >
              <Plus className="size-3.5" />
              ¿No está? Crear producto nuevo
            </button>

            {items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                      <th className="px-2 py-2 text-left">Producto</th>
                      <th className="px-2 py-2 text-left">Proveedor</th>
                      <th className="px-2 py-2 text-center">Cant.</th>
                      <th className="px-2 py-2 text-right">Precio USD</th>
                      <th className="px-2 py-2 text-right">Subtotal</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={it.producto_id} className="border-b border-gray-50">
                        <td className="px-2 py-2">
                          <p className="font-medium text-gray-900">{it.nombre}</p>
                          <p className="text-[10px] text-gray-400">{it.sku}</p>
                        </td>
                        <td className="px-2 py-2">
                          <select
                            value={it.proveedor_id ?? ""}
                            onChange={(e) => setItemProveedor(i, e.target.value)}
                            className="h-8 w-36 rounded-lg border border-gray-200 px-2 text-[12px]"
                          >
                            <option value="">— Sin proveedor —</option>
                            {proveedorOptions.map((pr) => (
                              <option key={pr.id} value={pr.id}>
                                {pr.nombre}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="number"
                            min={1}
                            value={it.cantidad}
                            onChange={(e) => setItem(i, "cantidad", Number(e.target.value))}
                            className="h-8 w-16 rounded-lg border border-gray-200 px-2 text-center"
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={it.precio_usd}
                            onChange={(e) => setItem(i, "precio_usd", Number(e.target.value))}
                            className="h-8 w-24 rounded-lg border border-gray-200 px-2 text-right"
                          />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-gray-700">
                          {usd((it.cantidad || 0) * (it.precio_usd || 0))}
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
              <p className="text-[12px] italic text-gray-400">Agrega al menos un producto.</p>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {/* Inversión */}
          <section className="pc-card">
            <p className="pc-label mb-4">Inversión por socio</p>
            <button
              type="button"
              onClick={() => setDivisionIgual((v) => !v)}
              className="mb-3 flex w-full items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-left text-[12px] text-gray-700 transition-colors hover:bg-gray-100"
            >
              <span
                className="flex size-4 items-center justify-center rounded text-[10px] font-bold text-white"
                style={{ background: divisionIgual ? "#0F766E" : "rgba(15,23,42,0.10)" }}
              >
                {divisionIgual ? "✓" : ""}
              </span>
              División 50/50
            </button>
            {[
              { label: "Sandra", value: sandra, input: sandraInput, set: setSandraInput, color: "#B91C1C" },
              { label: "Benjamin", value: benjamin, input: benjaminInput, set: setBenjaminInput, color: "#4F46E5" },
            ].map((s) => (
              <Field key={s.label} label={`${s.label} (USD)`} className="mb-2">
                <input
                  type="number"
                  step="0.01"
                  value={divisionIgual ? s.value.toFixed(2) : s.input}
                  disabled={divisionIgual}
                  onChange={(e) => s.set(e.target.value)}
                  className="pc-input"
                  style={{ color: s.color, opacity: divisionIgual ? 0.55 : 1 }}
                />
                <p className="mt-1 text-[10px] text-gray-400 tabular-nums">= {mxn(s.value * tc)} MXN</p>
              </Field>
            ))}
          </section>

          {/* Resumen */}
          <section className="pc-card sticky top-6">
            <p className="pc-label mb-4">Resumen</p>
            <Row label="Productos USD" value={usd(subtotalUsd)} />
            <Row label="Envío USD" value={usd(envioTotal)} />
            <Row label="Envío / unidad" value={`${usd(envioUnit)} · ${totalUnidades} u`} />
            <Row label="Total USD" value={usd(totalUsd)} strong />
            <Row label="Total MXN" value={mxn(totalUsd * tc)} strong />

            {error && (
              <div className="my-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={guardar}
              disabled={pending || !nombre || items.length === 0}
              className="pc-btn-primary mt-4 w-full justify-center"
              style={{ opacity: pending || !nombre || items.length === 0 ? 0.55 : 1 }}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {pending ? "Guardando…" : "Guardar cambios"}
            </button>
          </section>
        </aside>
      </div>

      {crearOpen && (
        <ProductCreateModal
          onClose={() => setCrearOpen(false)}
          categoriaOptions={categoriaOptions}
          proveedorOptions={proveedorOptions}
          defaultTc={tc}
          onCreated={onProductoCreado}
        />
      )}
    </div>
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
    <div className={className}>
      <label className="pc-label mb-1.5 block">{label}</label>
      {children}
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderTop: strong ? "1px solid rgba(15,23,42,0.06)" : "none", paddingTop: strong ? 8 : undefined }}>
      <span className="text-[11px] uppercase tracking-[0.06em] text-gray-500">{label}</span>
      <span className="tabular-nums" style={{ fontSize: strong ? 14 : 12.5, fontWeight: strong ? 700 : 500, color: strong ? "#0F172A" : "#475569" }}>
        {value}
      </span>
    </div>
  )
}
