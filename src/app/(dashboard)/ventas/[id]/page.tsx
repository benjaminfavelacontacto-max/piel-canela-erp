import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ShoppingBag, TrendingUp, Wallet, CircleDollarSign } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { buildImageMap, findImageFor } from "@/lib/storage-images"
import { parseNotas } from "../notas-util"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
})

const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "long",
  year: "numeric",
})

type Estatus = "pendiente" | "parcial" | "pagada"

const estatusBadge: Record<Estatus, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  parcial: "bg-blue-100 text-blue-700",
  pagada: "bg-emerald-100 text-emerald-700",
}

const estatusLabel: Record<Estatus, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  pagada: "Pagada",
}

export default async function VentaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: venta, error } = await supabase
    .from("ventas")
    .select(
      `id, numero, fecha, subtotal, iva, descuento, total, costo_productos, costo_envio,
       ganancia, cantidad_pagada, saldo_pendiente, estatus, notas, inventario_descontado,
       cotizacion_id,
       clientes(id, nombre, nombre_negocio, telefono, email, direccion, ciudad)`,
    )
    .eq("id", id)
    .maybeSingle()

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error.message}
        </div>
      </div>
    )
  }
  if (!venta) notFound()

  const [{ data: itemRows }, { data: socioRows }, imageMap] = await Promise.all([
    supabase
      .from("venta_items")
      .select(
        `cantidad, precio_unitario, costo_unitario, subtotal, costo_total, sort_order,
         productos(id, sku, nombre, nombre_display, imagen_url)`,
      )
      .eq("venta_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("venta_socios")
      .select(
        `monto, concepto, pagado, fecha_pago,
         socios(id, nombre, porcentaje)`,
      )
      .eq("venta_id", id),
    buildImageMap(),
  ])

  type ItemRow = {
    cantidad: number
    precio_unitario: number
    costo_unitario: number
    subtotal: number
    costo_total: number
    productos: {
      id: string
      sku: string | null
      nombre: string
      nombre_display: string | null
      imagen_url: string | null
    } | null
  }

  type SocioRow = {
    monto: number
    concepto: string | null
    pagado: boolean
    fecha_pago: string | null
    socios: { id: string; nombre: string; porcentaje: number } | null
  }

  const items = (itemRows ?? []) as unknown as ItemRow[]
  const socios = (socioRows ?? []) as unknown as SocioRow[]

  type Cliente = {
    id: string
    nombre: string
    nombre_negocio: string | null
    telefono: string | null
    email: string | null
    direccion: string | null
    ciudad: string | null
  }
  const cliente = (venta.clientes as Cliente | null) ?? null
  const { metodo, notas } = parseNotas(venta.notas)
  const estatus = venta.estatus as Estatus

  return (
    <div className="p-8">
      <nav className="mb-4 flex items-center gap-2 text-xs text-gray-500">
        <Link href="/ventas" className="hover:text-gray-900">
          Ventas
        </Link>
        <span>/</span>
        <span className="font-mono text-gray-900">{venta.numero}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/ventas"
            className="text-gray-400 hover:text-gray-600"
            aria-label="Volver"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="font-mono text-2xl font-semibold text-gray-900">
              {venta.numero}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {fechaFmt.format(new Date(venta.fecha))}
              {venta.cotizacion_id && (
                <>
                  {" · "}
                  <Link
                    href={`/cotizaciones/${venta.cotizacion_id}`}
                    className="text-pink-600 hover:underline"
                  >
                    Ver cotización
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${estatusBadge[estatus]}`}
        >
          {estatusLabel[estatus]}
        </span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total"
          value={mxn.format(Number(venta.total ?? 0))}
          icon={ShoppingBag}
          tone="text-gray-900"
        />
        <StatCard
          label="Ganancia"
          value={mxn.format(Number(venta.ganancia ?? 0))}
          icon={TrendingUp}
          tone="text-emerald-700"
        />
        <StatCard
          label="Pagado"
          value={mxn.format(Number(venta.cantidad_pagada ?? 0))}
          icon={CircleDollarSign}
          tone="text-blue-700"
        />
        <StatCard
          label="Saldo"
          value={mxn.format(Number(venta.saldo_pendiente ?? 0))}
          icon={Wallet}
          tone={Number(venta.saldo_pendiente ?? 0) > 0 ? "text-amber-700" : "text-gray-900"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-gray-200 bg-white">
          <header className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Productos
            </h2>
          </header>
          {items.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-500">
              Esta venta no tiene productos asociados.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="w-14 px-3 py-2"></th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Producto
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wide text-gray-500">
                    Cant.
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                    P. Unit.
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                    Costo unit.
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((it, i) => {
                  const display = it.productos?.nombre_display ?? it.productos?.nombre ?? "—"
                  const img = findImageFor(display, it.productos?.imagen_url ?? null, imageMap)
                  return (
                    <tr key={`${it.productos?.id ?? "row"}-${i}`}>
                      <td className="px-3 py-2">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={img}
                            alt={display}
                            className="size-9 rounded border border-gray-200 object-cover"
                          />
                        ) : (
                          <div className="size-9 rounded border border-gray-200 bg-gray-50" />
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-900">
                        <div className="font-medium">{display}</div>
                        {it.productos?.sku && (
                          <div className="font-mono text-xs text-gray-500">
                            {it.productos.sku}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">{it.cantidad}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {mxn.format(Number(it.precio_unitario))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                        {mxn.format(Number(it.costo_unitario))}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {mxn.format(Number(it.subtotal))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td colSpan={5} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-gray-500">
                    Subtotal
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {mxn.format(Number(venta.subtotal ?? 0))}
                  </td>
                </tr>
                {Number(venta.descuento ?? 0) > 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-1 text-right text-xs uppercase tracking-wide text-gray-500">
                      Descuento
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums text-emerald-700">
                      -{mxn.format(Number(venta.descuento))}
                    </td>
                  </tr>
                )}
                {Number(venta.iva ?? 0) > 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-1 text-right text-xs uppercase tracking-wide text-gray-500">
                      IVA
                    </td>
                    <td className="px-3 py-1 text-right tabular-nums">
                      {mxn.format(Number(venta.iva))}
                    </td>
                  </tr>
                )}
                <tr className="border-t border-gray-200">
                  <td colSpan={5} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-gray-700 font-semibold">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right text-base font-bold tabular-nums">
                    {mxn.format(Number(venta.total ?? 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Cliente
            </h2>
            <div className="mt-2 text-sm text-gray-900 font-medium">
              {cliente?.nombre_negocio ?? cliente?.nombre ?? "—"}
            </div>
            {cliente?.nombre_negocio && (
              <div className="text-xs text-gray-600">{cliente.nombre}</div>
            )}
            <div className="mt-2 space-y-1 text-xs text-gray-600">
              {cliente?.telefono && <div>Tel: {cliente.telefono}</div>}
              {cliente?.email && <div>{cliente.email}</div>}
              {cliente?.direccion && (
                <div>
                  {cliente.direccion}
                  {cliente.ciudad ? `, ${cliente.ciudad}` : ""}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Pago
            </h2>
            <div className="mt-2 space-y-1 text-sm">
              <Row label="Método" value={metodo ?? "—"} />
              <Row label="Pagado" value={mxn.format(Number(venta.cantidad_pagada ?? 0))} />
              <Row
                label="Saldo"
                value={mxn.format(Number(venta.saldo_pendiente ?? 0))}
                valueClass={
                  Number(venta.saldo_pendiente ?? 0) > 0 ? "text-amber-700" : ""
                }
              />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              División de socios
            </h2>
            {socios.length === 0 ? (
              <p className="mt-2 text-xs text-gray-500">Sin socios asignados.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {socios.map((s, i) => (
                  <li key={`${s.socios?.id ?? i}`} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">
                        {s.socios?.nombre ?? "—"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {s.socios?.porcentaje ?? 0}%
                        {" · "}
                        <span className={s.pagado ? "text-emerald-700" : "text-amber-700"}>
                          {s.pagado ? "Pagado" : "Pendiente"}
                        </span>
                      </div>
                    </div>
                    <span className="tabular-nums font-semibold">
                      {mxn.format(Number(s.monto))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {notas && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Notas
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{notas}</p>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Inventario
            </h2>
            <p className="mt-2 text-sm text-gray-700">
              {venta.inventario_descontado
                ? "Stock descontado."
                : "Stock no descontado todavía."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  tone: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </span>
        <Icon className={`size-4 ${tone}`} />
      </div>
      <div className={`mt-2 text-xl font-semibold tabular-nums ${tone}`}>
        {value}
      </div>
    </div>
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
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`tabular-nums ${valueClass ?? "text-gray-900"}`}>{value}</span>
    </div>
  )
}
