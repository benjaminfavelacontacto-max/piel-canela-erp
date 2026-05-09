"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Search, Eye, Pencil } from "lucide-react"
import { cambiarEstatusCotizacion } from "./actions"

export type Estatus =
  | "borrador"
  | "enviada"
  | "aceptada"
  | "rechazada"
  | "vencida"

export type CotizacionRow = {
  id: string
  numero: string
  fecha: string
  total: number | null
  estatus: Estatus
  cliente_id: string | null
  clientes: { id: string; nombre: string; nombre_negocio: string | null } | null
}

export type ClienteOption = {
  id: string
  nombre: string
  nombre_negocio: string | null
}

const ESTATUS_OPTIONS: { value: Estatus; label: string }[] = [
  { value: "borrador", label: "Borrador" },
  { value: "enviada", label: "Enviada" },
  { value: "aceptada", label: "Aceptada" },
  { value: "rechazada", label: "Rechazada" },
  { value: "vencida", label: "Vencida" },
]

const estatusColor: Record<Estatus, { bg: string; text: string; hex: string }> = {
  borrador: { bg: "bg-yellow-50", text: "text-yellow-700", hex: "#a16207" },
  enviada: { bg: "bg-blue-50", text: "text-blue-700", hex: "#1d4ed8" },
  aceptada: { bg: "bg-green-50", text: "text-green-700", hex: "#15803d" },
  rechazada: { bg: "bg-red-50", text: "text-red-700", hex: "#b91c1c" },
  vencida: { bg: "bg-gray-50", text: "text-gray-600", hex: "#52525b" },
}

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
})
const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

export function CotizacionesList({
  cotizaciones,
  clientes,
  error,
}: {
  cotizaciones: CotizacionRow[]
  clientes: ClienteOption[]
  error: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [search, setSearch] = useState("")
  const [estatusFiltro, setEstatusFiltro] = useState("")
  const [clienteFiltro, setClienteFiltro] = useState("")

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cotizaciones.filter((c) => {
      const matchSearch =
        !q ||
        c.numero.toLowerCase().includes(q) ||
        (c.clientes?.nombre ?? "").toLowerCase().includes(q) ||
        (c.clientes?.nombre_negocio ?? "").toLowerCase().includes(q)
      const matchEstatus = !estatusFiltro || c.estatus === estatusFiltro
      const matchCliente = !clienteFiltro || c.cliente_id === clienteFiltro
      return matchSearch && matchEstatus && matchCliente
    })
  }, [cotizaciones, search, estatusFiltro, clienteFiltro])

  function onChangeEstatus(id: string, nuevo: Estatus) {
    startTransition(async () => {
      try {
        const r = await cambiarEstatusCotizacion(id, nuevo)
        if (!r.ok) {
          toast.error(r.error ?? "No se pudo cambiar el estatus")
          return
        }
        toast.success("Estatus actualizado")
        router.refresh()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        toast.error(`Error: ${msg}`)
      }
    })
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Piel Canela"
            className="h-10 w-10 rounded-md object-contain"
          />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Cotizaciones
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {filtradas.length === cotizaciones.length
                ? `${cotizaciones.length} cotizaciones`
                : `${filtradas.length} de ${cotizaciones.length}`}
            </p>
          </div>
        </div>
        <Link
          href="/cotizaciones/nueva"
          className="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-pink-700"
        >
          <Plus className="size-4" />
          Nueva Cotización
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Search + filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por número, cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <select
          value={estatusFiltro}
          onChange={(e) => setEstatusFiltro(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">Todos los estatus</option>
          {ESTATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={clienteFiltro}
          onChange={(e) => setClienteFiltro(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">Todos los clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre_negocio ?? c.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <Th>Número</Th>
              <Th>Cliente</Th>
              <Th>Fecha</Th>
              <Th align="right">Total</Th>
              <Th>Estatus</Th>
              <Th align="right">Acciones</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtradas.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-12 text-center text-sm text-gray-500"
                >
                  {cotizaciones.length === 0
                    ? "No hay cotizaciones."
                    : "Sin resultados con esos filtros."}
                </td>
              </tr>
            ) : (
              filtradas.map((c) => {
                const color = estatusColor[c.estatus]
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-700">
                      {c.numero}
                    </td>
                    <td className="px-5 py-3 text-gray-900">
                      {c.clientes?.nombre_negocio ??
                        c.clientes?.nombre ??
                        "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {fechaFmt.format(new Date(c.fecha))}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-gray-900">
                      {c.total != null ? mxn.format(c.total) : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={c.estatus}
                        disabled={pending}
                        onChange={(e) =>
                          onChangeEstatus(c.id, e.target.value as Estatus)
                        }
                        className={`cursor-pointer rounded-md border-0 bg-transparent text-xs font-medium focus:outline-none focus:ring-1 focus:ring-teal-500 ${color.text}`}
                      >
                        {ESTATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link
                          href={`/cotizaciones/${c.id}`}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-pink-700 hover:bg-pink-50"
                        >
                          <Eye className="size-3" />
                          Ver
                        </Link>
                        <Link
                          href={`/cotizaciones/${c.id}/editar`}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                        >
                          <Pencil className="size-3" />
                          Editar
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode
  align?: "left" | "right" | "center"
}) {
  return (
    <th
      className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-gray-500"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  )
}
