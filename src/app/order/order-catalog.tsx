"use client"

import { useMemo, useState } from "react"
import {
  submitOrder,
  buscarClientePorTelefono,
  type ClienteMatch,
} from "./actions"

export interface Producto {
  id: string
  sku: string
  nombre: string
  peso: string | null
  imagen_url: string | null
  categoria: string
  precio: number
  stock: number
}

interface CartItem {
  producto: Producto
  cantidad: number
}

function formatMXN(v: number): string {
  return v.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  })
}

export function OrderCatalog({ productos }: { productos: Producto[] }) {
  const [categoriaActiva, setCategoriaActiva] = useState("TODOS")
  const [busqueda, setBusqueda] = useState("")
  const [cart, setCart] = useState<CartItem[]>([])
  const [step, setStep] = useState<"catalog" | "checkout">("catalog")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [clienteData, setClienteData] = useState({
    nombre: "",
    negocio: "",
    telefono: "",
    email: "",
    ciudad: "",
    notas: "",
  })

  // Match cliente por teléfono (anti-duplicados + auto-fill)
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [clienteMatch, setClienteMatch] = useState<ClienteMatch | null>(null)

  const categorias = useMemo(
    () => ["TODOS", ...Array.from(new Set(productos.map((p) => p.categoria)))],
    [productos],
  )

  const productosFiltrados = productos.filter((p) => {
    const matchCat = categoriaActiva === "TODOS" || p.categoria === categoriaActiva
    const q = busqueda.trim().toLowerCase()
    const matchBusq =
      !q ||
      p.nombre.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q)
    return matchCat && matchBusq
  })

  const addToCart = (producto: Producto) => {
    if (producto.stock <= 0) return // agotado: no se puede cotizar
    setCart((prev) => {
      const existing = prev.find((i) => i.producto.id === producto.id)
      if (existing) {
        return prev.map((i) =>
          i.producto.id === producto.id
            ? { ...i, cantidad: i.cantidad + 1 }
            : i,
        )
      }
      return [...prev, { producto, cantidad: 1 }]
    })
  }

  const updateCantidad = (id: string, cantidad: number) => {
    if (cantidad <= 0) {
      setCart((prev) => prev.filter((i) => i.producto.id !== id))
    } else {
      setCart((prev) =>
        prev.map((i) => (i.producto.id === id ? { ...i, cantidad } : i)),
      )
    }
  }

  const totalCarrito = cart.reduce(
    (s, i) => s + i.producto.precio * i.cantidad,
    0,
  )
  const totalUnidades = cart.reduce((s, i) => s + i.cantidad, 0)

  async function buscarPorTelefono(tel: string) {
    setClienteData((p) => ({ ...p, telefono: tel }))
    const digits = tel.replace(/\D/g, "")
    if (digits.length < 10) {
      setClienteMatch(null)
      return
    }
    setBuscandoCliente(true)
    const m = await buscarClientePorTelefono(tel)
    setBuscandoCliente(false)
    if (m) {
      setClienteMatch(m)
      // Auto-fill solo campos vacíos del form (no pisamos lo que ya escribió)
      setClienteData((p) => ({
        ...p,
        nombre: p.nombre || m.nombre || "",
        negocio: p.negocio || m.nombre_negocio || "",
        email: p.email || m.email || "",
        ciudad: p.ciudad || m.ciudad || "",
      }))
    } else {
      setClienteMatch(null)
    }
  }

  function clearMatch() {
    setClienteMatch(null)
    setClienteData((p) => ({
      ...p,
      nombre: "",
      negocio: "",
      email: "",
      ciudad: "",
    }))
  }

  async function handleSubmit() {
    setSubmitError(null)
    if (!clienteData.nombre.trim() || !clienteData.telefono.trim()) {
      setSubmitError("Nombre y teléfono son requeridos")
      return
    }
    if (cart.length === 0) return
    setSubmitting(true)
    const result = await submitOrder({
      cliente: clienteData,
      items: cart.map((i) => ({
        producto_id: i.producto.id,
        nombre: i.producto.nombre,
        cantidad: i.cantidad,
        precio: i.producto.precio,
      })),
      clienteExistenteId: clienteMatch?.id,
    })
    if (result.success) {
      window.location.href = `/order/success?numero=${encodeURIComponent(result.numero)}`
    } else {
      setSubmitError(result.error)
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {step === "catalog" ? (
        <>
          {/* Búsqueda + filtros */}
          <div className="mb-4 rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <input
              type="text"
              placeholder="Buscar producto o SKU…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="mb-3 w-full rounded-xl border border-[rgba(15,23,42,0.06)] bg-white px-4 py-2.5 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-4 focus:ring-[rgba(15,118,110,0.12)]"
            />
            <div className="flex flex-wrap gap-2">
              {categorias.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoriaActiva(cat)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    categoriaActiva === cat
                      ? "bg-[#0F766E] text-white shadow-sm"
                      : "bg-[#F3F5F7] text-gray-600 hover:bg-[#EEF1F4]"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Grid de productos */}
          <div className="mb-24 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {productosFiltrados.map((producto) => {
              const enCarrito = cart.find((i) => i.producto.id === producto.id)
              const agotado = producto.stock <= 0
              return (
                <div
                  key={producto.id}
                  className={`relative overflow-hidden rounded-xl border border-[rgba(15,23,42,0.06)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-180 ${
                    agotado
                      ? "opacity-75"
                      : "hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
                  }`}
                >
                  <div className="relative flex h-36 items-center justify-center bg-[#F9FAFB]">
                    {agotado && (
                      <span className="absolute left-2 top-2 z-10 rounded-md bg-gray-900/75 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Agotado
                      </span>
                    )}
                    {producto.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={producto.imagen_url}
                        alt={producto.nombre}
                        className={`h-full w-full object-contain p-2 ${
                          agotado ? "grayscale" : ""
                        }`}
                      />
                    ) : (
                      <div className="text-3xl font-bold text-gray-200">
                        {producto.sku.slice(0, 2)}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">
                      {producto.peso ? `${producto.peso} · ` : ""}
                      {producto.sku}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold leading-tight text-gray-900">
                      {producto.nombre}
                    </p>
                    <p className="mt-1 text-base font-bold text-[#0F766E]">
                      {formatMXN(producto.precio)}
                    </p>

                    {agotado ? (
                      <button
                        type="button"
                        disabled
                        className="mt-2 w-full cursor-not-allowed rounded-lg bg-[#F3F5F7] py-1.5 text-xs font-medium text-gray-400"
                      >
                        Agotado
                      </button>
                    ) : enCarrito ? (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateCantidad(producto.id, enCarrito.cantidad - 1)
                          }
                          className="flex size-7 items-center justify-center rounded-lg bg-[#F3F5F7] font-bold text-gray-700 transition-colors hover:bg-[#EEF1F4]"
                          aria-label="Quitar uno"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-bold tabular-nums">
                          {enCarrito.cantidad}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateCantidad(producto.id, enCarrito.cantidad + 1)
                          }
                          className="flex size-7 items-center justify-center rounded-lg bg-[#0F766E] font-bold text-white transition-colors hover:bg-[#115E59]"
                          aria-label="Agregar uno"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => addToCart(producto)}
                        className="mt-2 w-full rounded-lg bg-[#0F766E] py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#115E59]"
                      >
                        + Agregar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {productosFiltrados.length === 0 && (
              <div className="col-span-full py-16 text-center text-sm text-gray-500">
                Sin productos con esos filtros.
              </div>
            )}
          </div>

          {/* Carrito flotante */}
          {cart.length > 0 && (
            <div className="fixed bottom-4 left-0 right-0 z-50 flex justify-center px-4">
              <button
                type="button"
                onClick={() => setStep("checkout")}
                className="flex items-center gap-4 rounded-2xl bg-[#0F766E] px-6 py-4 text-white shadow-[0_8px_24px_rgba(15,118,110,0.25)] transition-all hover:-translate-y-0.5 hover:bg-[#115E59] active:translate-y-0"
              >
                <span className="rounded-lg bg-white/20 px-2 py-0.5 text-sm font-bold tabular-nums">
                  {totalUnidades}
                </span>
                <span className="font-semibold">Ver pedido</span>
                <span className="ml-4 text-lg font-bold tabular-nums">
                  {formatMXN(totalCarrito)}
                </span>
              </button>
            </div>
          )}
        </>
      ) : (
        /* ═══ CHECKOUT ═══ */
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={() => setStep("catalog")}
            className="mb-4 flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-700"
          >
            ← Seguir comprando
          </button>

          {/* Resumen del pedido */}
          <div className="mb-4 rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <h2 className="mb-4 font-semibold text-gray-900">Tu pedido</h2>
            {cart.map((item) => (
              <div
                key={item.producto.id}
                className="flex items-center gap-3 border-b border-[rgba(15,23,42,0.04)] py-2.5 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">
                    {item.producto.nombre}
                  </p>
                  <p className="text-xs text-gray-400">{item.producto.sku}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateCantidad(item.producto.id, item.cantidad - 1)
                    }
                    className="size-6 rounded bg-[#F3F5F7] text-xs font-bold text-gray-600 hover:bg-[#EEF1F4]"
                    aria-label="Quitar uno"
                  >
                    −
                  </button>
                  <span className="w-5 text-center text-sm font-bold tabular-nums">
                    {item.cantidad}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateCantidad(item.producto.id, item.cantidad + 1)
                    }
                    className="size-6 rounded bg-[#F3F5F7] text-xs font-bold text-gray-600 hover:bg-[#EEF1F4]"
                    aria-label="Agregar uno"
                  >
                    +
                  </button>
                </div>
                <p className="w-24 text-right text-sm font-semibold tabular-nums">
                  {formatMXN(item.producto.precio * item.cantidad)}
                </p>
              </div>
            ))}
            <div className="mt-4 flex items-center justify-between border-t border-[rgba(15,23,42,0.06)] pt-3">
              <p className="font-semibold text-gray-900">Total estimado</p>
              <p className="text-xl font-bold tabular-nums text-[#0F766E]">
                {formatMXN(totalCarrito)}
              </p>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              * Precio sin IVA ni envío. Te enviaremos una cotización formal.
            </p>
          </div>

          {/* Datos del cliente */}
          <div className="mb-4 rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <h2 className="mb-4 font-semibold text-gray-900">Tus datos</h2>
            <div className="space-y-3">
              {/* Teléfono — primer campo, busca cliente existente al teclear */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">
                  Teléfono / WhatsApp <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    placeholder="10 dígitos"
                    value={clienteData.telefono}
                    onChange={(e) => buscarPorTelefono(e.target.value)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm transition-all focus:outline-none focus:ring-4 ${
                      clienteMatch
                        ? "border-emerald-300 bg-[#DFF7F4]/30 focus:border-[#0F766E] focus:ring-[rgba(15,118,110,0.12)]"
                        : "border-[rgba(15,23,42,0.06)] bg-white focus:border-[#0F766E] focus:ring-[rgba(15,118,110,0.12)]"
                    }`}
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    {buscandoCliente ? (
                      <div className="size-4 animate-spin rounded-full border-2 border-[#0F766E] border-t-transparent" />
                    ) : clienteMatch ? (
                      <span
                        className="text-base text-[#0F766E]"
                        aria-hidden
                      >
                        ✓
                      </span>
                    ) : null}
                  </div>
                </div>

                {clienteMatch && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-[#DFF7F4]/60 px-3 py-2">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#0F766E] text-xs font-semibold text-white">
                      {clienteMatch.nombre?.[0] ?? "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[#115E59]">
                        ¡Te reconocemos!
                      </p>
                      <p className="truncate text-xs text-[#0F766E]">
                        {clienteMatch.nombre}
                        {clienteMatch.nombre_negocio
                          ? ` · ${clienteMatch.nombre_negocio}`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearMatch}
                      className="text-[#94A3B8] transition-colors hover:text-gray-700"
                      aria-label="No soy yo"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {!buscandoCliente &&
                  !clienteMatch &&
                  clienteData.telefono.replace(/\D/g, "").length >= 10 && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                      <p className="text-xs text-blue-700">
                        ✨ Cliente nuevo — completa tus datos para continuar
                      </p>
                    </div>
                  )}
              </div>

              {/* Resto del formulario solo si ya hay teléfono válido */}
              {clienteData.telefono.replace(/\D/g, "").length >= 10 && (
                <div className="space-y-3">
                  <input
                    placeholder="Nombre completo *"
                    required
                    value={clienteData.nombre}
                    onChange={(e) =>
                      setClienteData((p) => ({
                        ...p,
                        nombre: e.target.value,
                      }))
                    }
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-4 focus:ring-[rgba(15,118,110,0.12)] ${
                      clienteMatch
                        ? "border-emerald-200 bg-[#DFF7F4]/30 focus:border-[#0F766E]"
                        : "border-[rgba(15,23,42,0.06)] bg-white focus:border-[#0F766E]"
                    }`}
                  />
                  <input
                    placeholder="Nombre de tu spa o negocio"
                    value={clienteData.negocio}
                    onChange={(e) =>
                      setClienteData((p) => ({
                        ...p,
                        negocio: e.target.value,
                      }))
                    }
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-4 focus:ring-[rgba(15,118,110,0.12)] ${
                      clienteMatch
                        ? "border-emerald-200 bg-[#DFF7F4]/30 focus:border-[#0F766E]"
                        : "border-[rgba(15,23,42,0.06)] bg-white focus:border-[#0F766E]"
                    }`}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      placeholder="Email (opcional)"
                      value={clienteData.email}
                      onChange={(e) =>
                        setClienteData((p) => ({
                          ...p,
                          email: e.target.value,
                        }))
                      }
                      className="rounded-xl border border-[rgba(15,23,42,0.06)] bg-white px-3 py-2.5 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-4 focus:ring-[rgba(15,118,110,0.12)]"
                    />
                    <input
                      placeholder="Ciudad"
                      value={clienteData.ciudad}
                      onChange={(e) =>
                        setClienteData((p) => ({
                          ...p,
                          ciudad: e.target.value,
                        }))
                      }
                      className="rounded-xl border border-[rgba(15,23,42,0.06)] bg-white px-3 py-2.5 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-4 focus:ring-[rgba(15,118,110,0.12)]"
                    />
                  </div>
                  <textarea
                    placeholder="Notas o comentarios del pedido…"
                    value={clienteData.notas}
                    onChange={(e) =>
                      setClienteData((p) => ({
                        ...p,
                        notas: e.target.value,
                      }))
                    }
                    rows={3}
                    className="w-full resize-none rounded-xl border border-[rgba(15,23,42,0.06)] bg-white px-3 py-2.5 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-4 focus:ring-[rgba(15,118,110,0.12)]"
                  />
                </div>
              )}
            </div>
          </div>

          {submitError && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {submitError}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              submitting ||
              !clienteData.nombre.trim() ||
              !clienteData.telefono.trim()
            }
            className="w-full rounded-2xl bg-[#0F766E] py-4 text-base font-bold text-white shadow-[0_4px_12px_rgba(15,118,110,0.18)] transition-all hover:-translate-y-0.5 hover:bg-[#115E59] hover:shadow-[0_8px_24px_rgba(15,118,110,0.22)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {submitting ? "Enviando…" : "Enviar pedido →"}
          </button>
          <p className="mt-3 text-center text-xs text-gray-400">
            Te contactaremos con la cotización formal en menos de 24 horas
          </p>
        </div>
      )}
    </div>
  )
}
