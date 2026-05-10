"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Plus, Trash2, ArrowLeft } from "lucide-react"
import { toast } from "sonner"

interface ItemPedido {
  producto_id: string
  sku: string
  nombre: string
  cantidad: number
  precio_usd: number
  precio_mxn: number
  subtotal_usd: number
  subtotal_mxn: number
  envio_unit_usd: number
  envio_unit_mxn: number
  costo_total_usd: number
  costo_total_mxn: number
  precio_publico: number
  profit_unit: number
  profit_total: number
}

interface ProductoBase {
  id: string
  sku: string
  nombre: string
  precio_usd: number | null
  costo_envio_usd: number | null
  precios_producto:
    | Array<{
        precio: number
        listas_precios:
          | { nombre: string }
          | { nombre: string }[]
          | null
      }>
    | null
}

interface ProveedorBase {
  id: string
  nombre: string
}

const mxn = (v: number) =>
  v.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  })
const usd = (v: number) => `$${v.toFixed(2)}`

export default function NuevoPedidoPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [productos, setProductos] = useState<ProductoBase[]>([])
  const [proveedores, setProveedores] = useState<ProveedorBase[]>([])
  const [busqueda, setBusqueda] = useState("")
  const [saving, setSaving] = useState(false)

  const [nombre, setNombre] = useState("")
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [proveedorId, setProveedorId] = useState("")
  const [tipo, setTipo] = useState("productos")
  const [tc, setTc] = useState(20.7)
  const [items, setItems] = useState<ItemPedido[]>([])
  const [envioTotalUSD, setEnvioTotalUSD] = useState(0)
  const [divisionIgual, setDivisionIgual] = useState(true)
  const [sandraUSD, setSandraUSD] = useState(0)
  const [benjaminUSD, setBenjaminUSD] = useState(0)
  const [notas, setNotas] = useState("")

  useEffect(() => {
    async function load() {
      const [{ data: prods }, { data: provs }] = await Promise.all([
        supabase
          .from("productos")
          .select(
            `
              id, sku, nombre, precio_usd, costo_envio_usd,
              precios_producto(precio, listas_precios(nombre))
            `,
          )
          .eq("activo", true)
          .order("nombre"),
        supabase.from("proveedores").select("id, nombre"),
      ])
      setProductos((prods ?? []) as unknown as ProductoBase[])
      setProveedores((provs ?? []) as ProveedorBase[])
    }
    load()
  }, [supabase])

  // Reprorrateo de envío cuando cambian envío total, TC o cantidades
  useEffect(() => {
    const totalUnidades = items.reduce((s, i) => s + i.cantidad, 0)
    if (totalUnidades === 0) return
    const envioUnitUSD = envioTotalUSD / totalUnidades

    setItems((prev) =>
      prev.map((item) => {
        const costoTotalUSD = item.precio_usd + envioUnitUSD
        const costoTotalMXN = costoTotalUSD * tc
        const profitUnit = item.precio_publico - costoTotalMXN
        return {
          ...item,
          envio_unit_usd: envioUnitUSD,
          envio_unit_mxn: envioUnitUSD * tc,
          costo_total_usd: costoTotalUSD,
          costo_total_mxn: costoTotalMXN,
          profit_unit: profitUnit,
          profit_total: profitUnit * item.cantidad,
        }
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envioTotalUSD, tc, items.reduce((s, i) => s + i.cantidad, 0)])

  // Auto-split 50/50
  useEffect(() => {
    const totalUSD = items.reduce((s, i) => s + i.subtotal_usd, 0) + envioTotalUSD
    if (divisionIgual) {
      setSandraUSD(totalUSD / 2)
      setBenjaminUSD(totalUSD / 2)
    }
  }, [items, envioTotalUSD, divisionIgual])

  const agregarProducto = (prod: ProductoBase) => {
    if (items.find((i) => i.producto_id === prod.id)) return
    const precioPublico =
      prod.precios_producto?.find((pp) => {
        const lp = pp.listas_precios
        if (!lp) return false
        const nombre = Array.isArray(lp) ? lp[0]?.nombre : lp.nombre
        return nombre === "Pública MXN"
      })?.precio ?? 0
    const precioUSD = prod.precio_usd ?? 0
    const totalUnidades = items.reduce((s, i) => s + i.cantidad, 0) + 1
    const envioUnit = totalUnidades > 0 ? envioTotalUSD / totalUnidades : 0
    const costoTotalUSD = precioUSD + envioUnit
    const costoTotalMXN = costoTotalUSD * tc
    const profitUnit = precioPublico - costoTotalMXN

    setItems((prev) => [
      ...prev,
      {
        producto_id: prod.id,
        sku: prod.sku,
        nombre: prod.nombre,
        cantidad: 1,
        precio_usd: precioUSD,
        precio_mxn: precioUSD * tc,
        subtotal_usd: precioUSD,
        subtotal_mxn: precioUSD * tc,
        envio_unit_usd: envioUnit,
        envio_unit_mxn: envioUnit * tc,
        costo_total_usd: costoTotalUSD,
        costo_total_mxn: costoTotalMXN,
        precio_publico: precioPublico,
        profit_unit: profitUnit,
        profit_total: profitUnit,
      },
    ])
    setBusqueda("")
  }

  const updateItem = (
    idx: number,
    campo: "cantidad" | "precio_usd",
    valor: number,
  ) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item
        const updated = { ...item, [campo]: valor }
        updated.precio_mxn = updated.precio_usd * tc
        updated.subtotal_usd = updated.precio_usd * updated.cantidad
        updated.subtotal_mxn = updated.subtotal_usd * tc
        const costoTotalUSD = updated.precio_usd + updated.envio_unit_usd
        updated.costo_total_usd = costoTotalUSD
        updated.costo_total_mxn = costoTotalUSD * tc
        updated.profit_unit = updated.precio_publico - updated.costo_total_mxn
        updated.profit_total = updated.profit_unit * updated.cantidad
        return updated
      }),
    )
  }

  const totalUSD = items.reduce((s, i) => s + i.subtotal_usd, 0)
  const grandTotalUSD = totalUSD + envioTotalUSD
  const grandTotalMXN = grandTotalUSD * tc
  const profitTotal = items.reduce((s, i) => s + i.profit_total, 0)

  const guardar = async () => {
    if (!nombre || items.length === 0) return
    setSaving(true)

    const { count } = await supabase
      .from("pedidos_compra")
      .select("*", { count: "exact", head: true })
    const numero = (count ?? 0) + 1

    const { data: pedido, error } = await supabase
      .from("pedidos_compra")
      .insert({
        numero,
        nombre,
        fecha,
        proveedor_id: proveedorId || null,
        tipo,
        tipo_cambio: tc,
        subtotal_usd: totalUSD,
        costo_envio_usd: envioTotalUSD,
        costo_envio_mxn: envioTotalUSD * tc,
        total_usd: grandTotalUSD,
        total_mxn: grandTotalMXN,
        inversion_sandra_usd: sandraUSD,
        inversion_benjamin_usd: benjaminUSD,
        inversion_sandra_mxn: sandraUSD * tc,
        inversion_benjamin_mxn: benjaminUSD * tc,
        notas: notas || null,
      })
      .select("id")
      .single()

    if (error || !pedido) {
      toast.error(error?.message ?? "Error al guardar el pedido")
      setSaving(false)
      return
    }

    const { error: itemsErr } = await supabase
      .from("pedido_compra_items")
      .insert(
        items.map((item, idx) => ({
          pedido_id: pedido.id,
          producto_id: item.producto_id,
          cantidad: item.cantidad,
          precio_unitario_usd: item.precio_usd,
          precio_unitario_mxn: item.precio_mxn,
          envio_unitario_usd: item.envio_unit_usd,
          envio_unitario_mxn: item.envio_unit_mxn,
          costo_total_unitario_usd: item.costo_total_usd,
          costo_total_unitario_mxn: item.costo_total_mxn,
          subtotal_usd: item.subtotal_usd,
          subtotal_mxn: item.subtotal_mxn,
          total_con_envio_usd:
            (item.precio_usd + item.envio_unit_usd) * item.cantidad,
          total_con_envio_mxn: item.costo_total_mxn * item.cantidad,
          precio_publico_mxn: item.precio_publico,
          profit_unitario: item.profit_unit,
          profit_total: item.profit_total,
          sort_order: idx,
        })),
      )

    if (itemsErr) {
      toast.error(itemsErr.message)
      setSaving(false)
      return
    }

    // Snapshot costos en productos (TC + envio + costo MXN)
    await Promise.all(
      items.map((item) =>
        supabase
          .from("productos")
          .update({
            precio_usd: item.precio_usd,
            costo_envio_usd: item.envio_unit_usd,
            tipo_cambio: tc,
            costo: item.costo_total_mxn,
          })
          .eq("id", item.producto_id),
      ),
    )

    toast.success(`Pedido "${nombre}" guardado`)
    router.push("/pedidos")
    router.refresh()
  }

  const filteredProds = busqueda
    ? productos
        .filter(
          (p) =>
            p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
            p.sku.toLowerCase().includes(busqueda.toLowerCase()),
        )
        .slice(0, 10)
    : []

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-gray-400">
            Pedidos de Compra
          </p>
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em] text-gray-900">
            Nuevo Pedido
          </h1>
        </div>
        <Link href="/pedidos" className="pc-btn-secondary">
          <ArrowLeft className="size-4" />
          Volver
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* Datos generales */}
          <section className="pc-card">
            <p className="pc-label mb-4">Datos del pedido</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nombre *">
                <input
                  className="pc-input"
                  placeholder="Ej: Pedido 4 — Brasil"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
              </Field>
              <Field label="Fecha">
                <input
                  type="date"
                  className="pc-input"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </Field>
              <Field label="Proveedor">
                <select
                  className="pc-input"
                  value={proveedorId}
                  onChange={(e) => setProveedorId(e.target.value)}
                >
                  <option value="">Sin especificar</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo">
                <select
                  className="pc-input"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                >
                  <option value="productos">Productos</option>
                  <option value="cintas">Cintas</option>
                  <option value="mixto">Mixto</option>
                </select>
              </Field>
              <Field label="Tipo de cambio (MXN/USD)">
                <input
                  type="number"
                  step="0.01"
                  className="pc-input"
                  value={tc}
                  onChange={(e) => setTc(Number(e.target.value))}
                />
              </Field>
              <Field label="Envío total (USD)">
                <input
                  type="number"
                  step="0.01"
                  className="pc-input"
                  placeholder="0.00"
                  value={envioTotalUSD || ""}
                  onChange={(e) => setEnvioTotalUSD(Number(e.target.value))}
                />
              </Field>
            </div>
            <Field label="Notas" className="mt-3">
              <textarea
                className="pc-input"
                style={{ height: 60, padding: "10px 16px" }}
                placeholder="Notas del pedido..."
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
              />
            </Field>
          </section>

          {/* Productos */}
          <section className="pc-card">
            <p className="pc-label mb-4">Agregar productos</p>
            <div className="relative mb-3">
              <input
                className="pc-input"
                placeholder="Buscar por SKU o nombre..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              {filteredProds.length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
                >
                  {filteredProds.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => agregarProducto(p)}
                      className="flex w-full items-center justify-between gap-3 border-b border-gray-50 px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-gray-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium text-gray-900">
                          {p.nombre}
                        </p>
                        <p className="text-[10.5px] text-gray-500">
                          {p.sku} · ${Number(p.precio_usd ?? 0).toFixed(2)} USD
                        </p>
                      </div>
                      <Plus className="size-3.5 shrink-0 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {[
                        "Producto",
                        "Cant.",
                        "P. USD",
                        "Sub USD",
                        "Envío/u",
                        "Costo MXN",
                        "P. Público",
                        "Profit",
                        "",
                      ].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-2 py-2 text-right text-[9.5px] font-semibold uppercase tracking-[0.08em] text-gray-400"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr
                        key={item.producto_id}
                        className="border-b border-gray-50"
                      >
                        <td className="px-2 py-2.5">
                          <p className="text-[12.5px] font-medium text-gray-900">
                            {item.nombre.length > 22
                              ? item.nombre.slice(0, 22) + "…"
                              : item.nombre}
                          </p>
                          <p className="text-[10px] text-gray-400">{item.sku}</p>
                        </td>
                        <td className="px-1 py-2.5">
                          <input
                            type="number"
                            min={1}
                            value={item.cantidad}
                            onChange={(e) =>
                              updateItem(idx, "cantidad", Number(e.target.value))
                            }
                            className="pc-input"
                            style={{
                              width: 64,
                              height: 32,
                              padding: "0 8px",
                              textAlign: "center",
                            }}
                          />
                        </td>
                        <td className="px-1 py-2.5">
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={item.precio_usd}
                            onChange={(e) =>
                              updateItem(
                                idx,
                                "precio_usd",
                                Number(e.target.value),
                              )
                            }
                            className="pc-input"
                            style={{
                              width: 84,
                              height: 32,
                              padding: "0 8px",
                              textAlign: "right",
                            }}
                          />
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right font-semibold text-indigo-600 tabular-nums">
                          {usd(item.subtotal_usd)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right text-amber-700 tabular-nums">
                          {usd(item.envio_unit_usd)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right text-gray-700 tabular-nums">
                          {mxn(item.costo_total_mxn)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right text-gray-500 tabular-nums">
                          {mxn(item.precio_publico)}
                        </td>
                        <td
                          className="whitespace-nowrap px-2 py-2.5 text-right font-semibold tabular-nums"
                          style={{
                            color: item.profit_unit >= 0 ? "#047857" : "#B91C1C",
                          }}
                        >
                          {mxn(item.profit_total)}
                        </td>
                        <td className="px-1 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setItems((prev) =>
                                prev.filter((_, i) => i !== idx),
                              )
                            }
                            className="inline-flex size-7 items-center justify-center rounded-md bg-rose-50 text-rose-500 transition-colors hover:bg-rose-100"
                            aria-label="Eliminar"
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
                Busca un producto para agregarlo al pedido.
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {/* Inversiones */}
          <section className="pc-card">
            <p className="pc-label mb-4">Inversión por socio</p>
            <button
              type="button"
              onClick={() => setDivisionIgual((v) => !v)}
              className="mb-3 flex w-full items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-left text-[12px] text-gray-700 transition-colors hover:bg-gray-100"
            >
              <span
                className="flex size-4 items-center justify-center rounded text-[10px] font-bold text-white"
                style={{
                  background: divisionIgual ? "#0F766E" : "rgba(15,23,42,0.10)",
                }}
              >
                {divisionIgual ? "✓" : ""}
              </span>
              División 50/50
            </button>
            {[
              {
                label: "Sandra",
                value: sandraUSD,
                set: setSandraUSD,
                color: "#B91C1C",
              },
              {
                label: "Benjamin",
                value: benjaminUSD,
                set: setBenjaminUSD,
                color: "#4F46E5",
              },
            ].map((s) => (
              <Field key={s.label} label={`${s.label} (USD)`} className="mb-2">
                <input
                  type="number"
                  step="0.01"
                  value={s.value.toFixed(2)}
                  disabled={divisionIgual}
                  onChange={(e) => s.set(Number(e.target.value))}
                  className="pc-input"
                  style={{
                    color: s.color,
                    opacity: divisionIgual ? 0.55 : 1,
                  }}
                />
                <p className="mt-1 text-[10px] text-gray-400 tabular-nums">
                  = {mxn(s.value * tc)} MXN
                </p>
              </Field>
            ))}
          </section>

          {/* Resumen */}
          <section className="pc-card sticky top-6">
            <p className="pc-label mb-4">Resumen del pedido</p>
            {[
              {
                label: "Productos USD",
                value: usd(totalUSD),
                tone: "muted" as const,
              },
              {
                label: "Envío USD",
                value: usd(envioTotalUSD),
                tone: "amber" as const,
              },
              {
                label: "Grand Total USD",
                value: usd(grandTotalUSD),
                tone: "strong" as const,
              },
              {
                label: "Grand Total MXN",
                value: mxn(grandTotalMXN),
                tone: "champagne" as const,
              },
              {
                label: "Profit Potencial",
                value: mxn(profitTotal),
                tone: "emerald" as const,
              },
            ].map((row, i) => (
              <SummaryRow key={i} {...row} divider={i >= 2} />
            ))}

            <button
              type="button"
              onClick={guardar}
              disabled={saving || !nombre || items.length === 0}
              className="pc-btn-primary mt-4 w-full justify-center"
              style={{
                opacity: saving || !nombre || items.length === 0 ? 0.55 : 1,
                cursor:
                  saving || !nombre || items.length === 0
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {saving ? "Guardando..." : "Guardar pedido"}
            </button>
            {(!nombre || items.length === 0) && (
              <p className="mt-2 text-center text-[10.5px] text-gray-400">
                {!nombre
                  ? "Falta el nombre del pedido"
                  : "Agrega al menos un producto"}
              </p>
            )}
          </section>
        </aside>
      </div>
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

function SummaryRow({
  label,
  value,
  tone,
  divider,
}: {
  label: string
  value: string
  tone: "muted" | "strong" | "champagne" | "amber" | "emerald"
  divider?: boolean
}) {
  const toneColor = {
    muted: "#64748B",
    strong: "#0F172A",
    champagne: "#C5A47E",
    amber: "#B45309",
    emerald: "#047857",
  }[tone]
  const big = tone !== "muted" && tone !== "amber"
  return (
    <div
      className="flex items-center justify-between py-2"
      style={{
        borderTop: divider ? "1px solid rgba(15,23,42,0.06)" : "none",
        paddingTop: divider ? 10 : undefined,
      }}
    >
      <span className="text-[11px] uppercase tracking-[0.06em] text-gray-500">
        {label}
      </span>
      <span
        className="tabular-nums"
        style={{
          color: toneColor,
          fontSize: big ? 15 : 13,
          fontWeight: big ? 700 : 500,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </span>
    </div>
  )
}
