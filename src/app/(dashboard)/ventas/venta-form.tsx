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

function estatusFor(total: number, pagado: number): "pendiente" | "parcial" | "pagada" {
  if (pagado <= 0) return "pendiente"
  if (pagado >= total) return "pagada"
  return "parcial"
}

const estatusBadge = {
  pendiente: "bg-amber-100 text-amber-700",
  parcial: "bg-blue-100 text-blue-700",
  pagada: "bg-emerald-100 text-emerald-700",
} as const

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
  const [manualIva, setManualIva] = useState<number>(0)
  const [manualDescuento, setManualDescuento] = useState<number>(0)
  const [manualCostoProductos, setManualCostoProductos] = useState<number>(0)
  const [manualCostoEnvio, setManualCostoEnvio] = useState<number>(0)

  const totals = useMemo(() => {
    if (cotizacion) {
      return {
        subtotal: cotizacion.subtotal,
        iva: cotizacion.iva,
        descuento: cotizacion.descuento,
        total: cotizacion.total,
        costo_productos: cotizacion.costo_productos,
        costo_envio: 0,
      }
    }
    return {
      subtotal: manualSubtotal,
      iva: manualIva,
      descuento: manualDescuento,
      total: Math.max(0, manualSubtotal + manualIva - manualDescuento),
      costo_productos: manualCostoProductos,
      costo_envio: manualCostoEnvio,
    }
  }, [
    cotizacion,
    manualSubtotal,
    manualIva,
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
    <div className="p-8">
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
        <div className="mb-4 flex items-center justify-between rounded-xl border border-pink-200 bg-pink-50 p-4 text-sm">
          <div className="flex items-center gap-3">
            <FileText className="size-4 text-pink-700" />
            <div>
              <div className="font-medium text-pink-900">
                Cotización <span className="font-mono">{cotizacion.numero}</span>
              </div>
              <div className="text-xs text-pink-700">
                {cotizacion.itemsCount} producto(s) — totales bloqueados
              </div>
            </div>
          </div>
          <Link
            href={`/cotizaciones/${cotizacion.id}`}
            className="text-xs text-pink-700 hover:underline"
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
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </Field>
              <Field label="Fecha">
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </Field>
              <Field label="Cliente" className="md:col-span-2">
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
              <div className="space-y-1 text-sm">
                <Row label="Subtotal" value={mxn.format(totals.subtotal)} />
                {totals.descuento > 0 && (
                  <Row
                    label="Descuento"
                    value={`-${mxn.format(totals.descuento)}`}
                    valueClass="text-emerald-700"
                  />
                )}
                {totals.iva > 0 && <Row label="IVA" value={mxn.format(totals.iva)} />}
                <Row
                  label="Costo de productos"
                  value={mxn.format(totals.costo_productos)}
                  valueClass="text-gray-500"
                />
                <div className="my-2 border-t border-gray-100" />
                <Row label="Total" value={mxn.format(totals.total)} valueClass="font-bold text-base" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Subtotal">
                  <NumberInput value={manualSubtotal} onChange={setManualSubtotal} />
                </Field>
                <Field label="IVA">
                  <NumberInput value={manualIva} onChange={setManualIva} />
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
                <Field label="Total (calculado)">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-semibold tabular-nums">
                    {mxn.format(totals.total)}
                  </div>
                </Field>
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
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
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
                      {estatus[0].toUpperCase() + estatus.slice(1)}
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
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300"
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
      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm tabular-nums focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
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
