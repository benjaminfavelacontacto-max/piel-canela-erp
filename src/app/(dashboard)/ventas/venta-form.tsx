"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Save, ArrowLeft, FileText } from "lucide-react"
import { saveVenta } from "./actions"
import type { CotizacionLoaded } from "./nueva/page"

type Cliente = {
  id: string
  nombre: string
  nombre_negocio: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  ciudad: string | null
}

type Socio = {
  id: string
  nombre: string
  email: string | null
  porcentaje: number
}

type MetodoPago = "transferencia" | "efectivo" | "tarjeta"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
})

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

type Estatus = "pendiente" | "pagada_parcial" | "pagada_total"

function estatusFor(total: number, pagado: number): Estatus {
  if (pagado <= 0) return "pendiente"
  if (pagado >= total) return "pagada_total"
  return "pagada_parcial"
}

const estatusBadge: Record<Estatus, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  pagada_parcial: "bg-blue-100 text-blue-700",
  pagada_total: "bg-teal-100 text-teal-700",
}

const estatusLabel: Record<Estatus, string> = {
  pendiente: "Pendiente",
  pagada_parcial: "Parcial",
  pagada_total: "Pagada",
}

export function VentaForm({
  clientes,
  socios,
  cotizacion,
  cotizacionError,
}: {
  clientes: Cliente[]
  socios: Socio[]
  cotizacion: CotizacionLoaded | null
  cotizacionError: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const lockedFromCotizacion = !!cotizacion

  const [clienteId, setClienteId] = useState<string>(cotizacion?.cliente_id ?? "")
  const [numero, setNumero] = useState<string>(cotizacion?.numero ?? "")
  const [fecha, setFecha] = useState<string>(todayISO())
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("transferencia")
  const [cantidadPagada, setCantidadPagada] = useState<number>(0)
  const [notas, setNotas] = useState<string>("")

  // Manual totals (only used when no cotizacion is loaded)
  const [manualSubtotal, setManualSubtotal] = useState<number>(0)
  // ivaActivo: pre-cargado de la cotización si existe, pero EDITABLE.
  // Regla: cotizaciones.iva = referencial, ventas.iva = real cobrado.
  const [ivaActivo, setIvaActivo] = useState<boolean>(
    cotizacion ? Number(cotizacion.iva ?? 0) > 0 : false,
  )
  const [manualDescuento, setManualDescuento] = useState<number>(0)
  const [manualCostoProductos, setManualCostoProductos] = useState<number>(0)
  const [manualCostoEnvio, setManualCostoEnvio] = useState<number>(0)

  const totals = useMemo(() => {
    if (cotizacion) {
      const subtotal = Number(cotizacion.subtotal ?? 0)
      const descuento = Number(cotizacion.descuento ?? 0)
      // IVA real = subtotal × 16% si user activa toggle, NO el de la cotización
      const iva = ivaActivo ? Number((subtotal * 0.16).toFixed(2)) : 0
      return {
        subtotal,
        iva,
        descuento,
        total: Math.max(0, subtotal + iva - descuento),
        costo_productos: Number(cotizacion.costo_productos ?? 0),
        costo_envio: 0,
      }
    }
    const iva = ivaActivo
      ? Number((manualSubtotal * 0.16).toFixed(2))
      : 0
    return {
      subtotal: manualSubtotal,
      iva,
      descuento: manualDescuento,
      total: Math.max(0, manualSubtotal + iva - manualDescuento),
      costo_productos: manualCostoProductos,
      costo_envio: manualCostoEnvio,
    }
  }, [
    cotizacion,
    manualSubtotal,
    ivaActivo,
    manualDescuento,
    manualCostoProductos,
    manualCostoEnvio,
  ])

  const ganancia = totals.total - totals.iva - totals.costo_productos - totals.costo_envio
  const saldoPendiente = Math.max(0, totals.total - cantidadPagada)
  const estatus = estatusFor(totals.total, cantidadPagada)

  const cliente = clientes.find((c) => c.id === clienteId) ?? null

  function handleSave() {
    if (!numero.trim()) {
      toast.error("Captura el número de la venta.")
      return
    }
    if (!clienteId) {
      toast.error("Selecciona un cliente.")
      return
    }
    if (totals.total <= 0) {
      toast.error("El total de la venta debe ser mayor a 0.")
      return
    }

    startTransition(async () => {
      const result = await saveVenta({
        numero: numero.trim(),
        cotizacion_id: cotizacion?.id ?? null,
        cliente_id: clienteId,
        fecha,
        subtotal: totals.subtotal,
        iva: totals.iva,
        descuento: totals.descuento,
        total: totals.total,
        costo_productos: totals.costo_productos,
        costo_envio: totals.costo_envio,
        cantidad_pagada: cantidadPagada,
        metodo_pago: metodoPago,
        notas,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Venta creada.")
      router.push(`/ventas/${result.id}`)
    })
  }

  return (
    <div className="p-4">
      <nav className="mb-4 flex items-center gap-2 text-xs text-gray-500">
        <Link href="/ventas" className="hover:text-gray-900">
          Ventas
        </Link>
        <span>/</span>
        <span className="text-gray-900">Nueva</span>
      </nav>

      <div className="mb-6 flex items-center gap-3">
        <Link href="/ventas" className="text-gray-400 hover:text-gray-600" aria-label="Volver">
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Nueva Venta</h1>
          <p className="text-sm text-gray-500 mt-1">
            {cotizacion
              ? `Basada en cotización ${cotizacion.numero}`
              : "Registra una venta manualmente"}
          </p>
        </div>
      </div>

      {cotizacionError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {cotizacionError}
        </div>
      )}

      {cotizacion && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-pink-200 bg-[#F9FAFB] p-4 text-sm">
          <div className="flex items-center gap-3">
            <FileText className="size-4 text-[#0F766E]" />
            <div>
              <div className="font-medium text-[#115E59]">
                Cotización <span className="font-mono">{cotizacion.numero}</span>
              </div>
              <div className="text-xs text-[#0F766E]">
                {cotizacion.itemsCount} producto(s) — totales bloqueados
              </div>
            </div>
          </div>
          <Link
            href={`/cotizaciones/${cotizacion.id}`}
            className="text-xs text-[#0F766E] hover:underline"
          >
            Ver cotización
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Datos generales
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Número de venta">
                <input
                  type="text"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="PC-210526001-V-Cliente"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                />
              </Field>
              <Field label="Fecha">
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                />
              </Field>
              <Field label="Cliente" className="md:col-span-2">
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                >
                  <option value="">Selecciona un cliente…</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre_negocio ? `${c.nombre_negocio} — ${c.nombre}` : c.nombre}
                    </option>
                  ))}
                </select>
                {cliente && (
                  <div className="mt-2 text-xs text-gray-600">
                    {cliente.telefono && <span>Tel: {cliente.telefono} · </span>}
                    {cliente.email && <span>{cliente.email}</span>}
                  </div>
                )}
              </Field>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Totales
            </h2>
            {lockedFromCotizacion ? (
              <div className="space-y-3 text-sm">
                <div className="space-y-1">
                  <Row label="Subtotal" value={mxn.format(totals.subtotal)} />
                  {totals.descuento > 0 && (
                    <Row
                      label="Descuento"
                      value={`-${mxn.format(totals.descuento)}`}
                      valueClass="text-emerald-700"
                    />
                  )}
                  {totals.iva > 0 && (
                    <Row label="IVA real cobrado" value={mxn.format(totals.iva)} />
                  )}
                  <Row
                    label="Costo de productos"
                    value={mxn.format(totals.costo_productos)}
                    valueClass="text-gray-500"
                  />
                  <div className="my-2 border-t border-gray-100" />
                  <Row
                    label="Total"
                    value={mxn.format(totals.total)}
                    valueClass="font-bold text-base"
                  />
                </div>

                {/* Toggle IVA real — independiente del IVA referencial de la cot */}
                <div className="rounded-xl border border-amber-200/70 bg-amber-50/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-amber-900">
                        IVA real cobrado
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-amber-700">
                        ¿Esta venta se cobró con IVA incluido? El IVA de la
                        cotización origen es referencial — el cobro real puede
                        diferir.
                      </p>
                      {Number(cotizacion?.iva ?? 0) > 0 ? (
                        <p className="mt-1 text-[10px] italic text-amber-600">
                          📋 La cotización se presentó CON IVA — pre-seleccionado.
                        </p>
                      ) : (
                        <p className="mt-1 text-[10px] italic text-amber-600">
                          📋 La cotización se presentó SIN IVA.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIvaActivo((v) => !v)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 ${
                        ivaActivo ? "bg-amber-600" : "bg-gray-300"
                      }`}
                      role="switch"
                      aria-checked={ivaActivo}
                    >
                      <span className="sr-only">
                        {ivaActivo ? "Desactivar IVA" : "Activar IVA"}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                          ivaActivo ? "translate-x-[22px]" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                  {ivaActivo && (
                    <p className="mt-2 rounded-md bg-white/70 px-2 py-1 text-[11px] tabular-nums text-amber-900">
                      IVA 16%: <strong>{mxn.format(totals.iva)}</strong> · Total:{" "}
                      <strong>{mxn.format(totals.total)}</strong>
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="Subtotal">
                    <NumberInput value={manualSubtotal} onChange={setManualSubtotal} />
                  </Field>
                  <Field label="Descuento">
                    <NumberInput value={manualDescuento} onChange={setManualDescuento} />
                  </Field>
                  <Field label="Costo productos">
                    <NumberInput value={manualCostoProductos} onChange={setManualCostoProductos} />
                  </Field>
                  <Field label="Costo envío">
                    <NumberInput value={manualCostoEnvio} onChange={setManualCostoEnvio} />
                  </Field>
                </div>

                <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">IVA 16%</p>
                    <p className="text-xs text-gray-500">
                      Aplica impuesto al subtotal
                      {ivaActivo
                        ? ` (${mxn.format(totals.iva)})`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIvaActivo((v) => !v)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      ivaActivo ? "bg-[#0F766E]" : "bg-gray-300"
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

                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total calculado</span>
                    <span className="font-semibold tabular-nums text-gray-900">
                      {mxn.format(totals.total)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Pago
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Método de pago">
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                >
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                </select>
              </Field>
              <Field label="Cantidad pagada">
                <NumberInput
                  value={cantidadPagada}
                  onChange={setCantidadPagada}
                  max={totals.total || undefined}
                />
              </Field>
              <div className="md:col-span-2 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-gray-500">Saldo pendiente</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">
                    {mxn.format(saldoPendiente)}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-gray-500">Estatus</div>
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${estatusBadge[estatus]}`}
                    >
                      {estatusLabel[estatus]}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Notas
            </h2>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              placeholder="Notas internas, referencia de pago, etc."
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#115E59] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="size-4" />
            {pending ? "Guardando…" : "Guardar Venta"}
          </button>
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Resumen
            </h2>
            <div className="mt-2 space-y-1 text-sm">
              <Row label="Total" value={mxn.format(totals.total)} valueClass="font-bold" />
              <Row label="Ganancia" value={mxn.format(ganancia)} valueClass="text-emerald-700" />
              <Row label="Pagado" value={mxn.format(cantidadPagada)} valueClass="text-blue-700" />
              <Row
                label="Saldo"
                value={mxn.format(saldoPendiente)}
                valueClass={saldoPendiente > 0 ? "text-amber-700" : ""}
              />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              División de socios
            </h2>
            {socios.length === 0 ? (
              <p className="mt-2 text-xs text-gray-500">No hay socios activos.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {socios.map((s) => {
                  const monto = (totals.total * Number(s.porcentaje)) / 100
                  return (
                    <li key={s.id} className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{s.nombre}</div>
                        <div className="text-xs text-gray-500">{s.porcentaje}%</div>
                      </div>
                      <span className="tabular-nums font-semibold">{mxn.format(monto)}</span>
                    </li>
                  )
                })}
                {(() => {
                  const sumPct = socios.reduce((s, x) => s + Number(x.porcentaje), 0)
                  if (sumPct !== 100) {
                    return (
                      <li className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                        Los porcentajes suman {sumPct}%, no 100%.
                      </li>
                    )
                  }
                  return null
                })()}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs uppercase tracking-wide text-gray-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function NumberInput({
  value,
  onChange,
  max,
}: {
  value: number
  onChange: (n: number) => void
  max?: number
}) {
  return (
    <input
      type="number"
      min={0}
      step="0.01"
      max={max}
      value={value}
      onChange={(e) => {
        const v = parseFloat(e.target.value)
        onChange(Number.isNaN(v) ? 0 : v)
      }}
      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm tabular-nums focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
    />
  )
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={`tabular-nums ${valueClass ?? "text-gray-900"}`}>{value}</span>
    </div>
  )
}
