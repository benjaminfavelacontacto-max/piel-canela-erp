import Link from "next/link"
import { notFound } from "next/navigation"
import {
  Pencil,
  Phone,
  Mail,
  MapPin,
  AtSign,
  Link2,
  Globe,
  FileText,
  ShoppingBag,
} from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { PageHeader } from "@/components/page-header"
import { formatMXN2 } from "@/lib/utils"

const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})
const fmtFecha = (iso: string | null) =>
  iso ? fechaFmt.format(new Date(iso + "T00:00:00")) : "—"

const ESTATUS: Record<string, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "bg-amber-50 text-amber-700" },
  pagada_parcial: { label: "Parcial", cls: "bg-blue-50 text-blue-700" },
  pagada_total: { label: "Pagada", cls: "bg-teal-50 text-teal-700" },
  cancelada: { label: "Cancelada", cls: "bg-gray-100 text-gray-500" },
  borrador: { label: "Borrador", cls: "bg-gray-100 text-gray-600" },
  enviada: { label: "Enviada", cls: "bg-blue-50 text-blue-700" },
  aceptada: { label: "Aceptada", cls: "bg-teal-50 text-teal-700" },
  rechazada: { label: "Rechazada", cls: "bg-red-50 text-red-700" },
  vencida: { label: "Vencida", cls: "bg-amber-50 text-amber-700" },
}
function Badge({ estatus }: { estatus: string | null }) {
  const e = ESTATUS[estatus ?? ""] ?? { label: estatus ?? "—", cls: "bg-gray-100 text-gray-600" }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${e.cls}`}>
      {e.label}
    </span>
  )
}

type VentaRow = {
  id: string
  numero: string | null
  fecha: string
  total: number | null
  utilidad_neta: number | null
  saldo_pendiente: number | null
  estatus: string | null
}
type CotRow = {
  id: string
  numero: string | null
  fecha: string
  total: number | null
  estatus: string | null
}

export default async function ClienteFichaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const [clienteRes, ventasRes, cotsRes] = await Promise.all([
    supabase
      .from("clientes")
      .select(
        `id, nombre, nombre_negocio, tipo, telefono, email, direccion, colonia,
         codigo_postal, ciudad, estado, pais, rfc, redes_sociales,
         metodo_pago_pref, notas`,
      )
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("ventas")
      .select("id, numero, fecha, total, utilidad_neta, saldo_pendiente, estatus")
      .eq("cliente_id", id)
      .order("fecha", { ascending: false }),
    admin
      .from("cotizaciones")
      .select("id, numero, fecha, total, estatus")
      .eq("cliente_id", id)
      .order("fecha", { ascending: false }),
  ])

  if (clienteRes.error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {clienteRes.error.message}
        </div>
      </div>
    )
  }
  if (!clienteRes.data) notFound()

  const c = clienteRes.data as {
    id: string
    nombre: string
    nombre_negocio: string | null
    tipo: string | null
    telefono: string | null
    email: string | null
    direccion: string | null
    colonia: string | null
    codigo_postal: string | null
    ciudad: string | null
    estado: string | null
    pais: string | null
    rfc: string | null
    redes_sociales: Record<string, string> | null
    metodo_pago_pref: string | null
    notas: string | null
  }
  const ventas = (ventasRes.data ?? []) as VentaRow[]
  const cots = (cotsRes.data ?? []) as CotRow[]

  // ── KPIs (excluye ventas canceladas para dinero) ──
  const ventasReales = ventas.filter((v) => v.estatus !== "cancelada")
  const ltv = ventasReales.reduce((s, v) => s + Number(v.total ?? 0), 0)
  const utilidad = ventasReales.reduce((s, v) => s + Number(v.utilidad_neta ?? 0), 0)
  const saldo = ventasReales.reduce((s, v) => s + Number(v.saldo_pendiente ?? 0), 0)
  const numCompras = ventasReales.length
  const ticket = numCompras > 0 ? ltv / numCompras : 0
  const ultima = ventasReales[0]?.fecha ?? null // ya ordenado desc

  const titulo = c.nombre_negocio ?? c.nombre
  const dir = [c.direccion, c.colonia, c.ciudad, c.estado, c.codigo_postal]
    .filter(Boolean)
    .join(", ")

  const redes = c.redes_sociales ?? {}
  const redesEntries = Object.entries(redes).filter(([, v]) => v && String(v).trim())
  const redIcon = (k: string) => {
    const key = k.toLowerCase()
    if (key.includes("insta")) return AtSign
    if (key.includes("face")) return Link2
    return Globe
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={titulo}
        subtitle={c.nombre_negocio ? c.nombre : c.tipo ? `Cliente ${c.tipo}` : "Cliente"}
        breadcrumb={[
          { label: "Clientes", href: "/clientes" },
          { label: titulo, href: `/clientes/${c.id}` },
        ]}
        kpis={[
          { label: "Valor de vida (LTV)", value: formatMXN2(ltv), sub: `${numCompras} compra${numCompras === 1 ? "" : "s"}`, featured: true },
          { label: "Utilidad generada", value: formatMXN2(utilidad) },
          { label: "Ticket promedio", value: formatMXN2(ticket) },
          { label: "Saldo pendiente", value: formatMXN2(saldo), accent: saldo > 0 ? "rose" : undefined },
          { label: "Última compra", value: fmtFecha(ultima) },
        ]}
        actions={
          <Link href={`/clientes/${c.id}/editar`} className="pc-btn-secondary">
            <Pencil className="size-4" strokeWidth={1.75} />
            Editar
          </Link>
        }
      />

      {/* Contacto */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[rgba(15,23,42,0.05)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Contacto
          </h2>
          <ul className="space-y-2 text-sm text-gray-700">
            {c.telefono && (
              <li className="flex items-center gap-2">
                <Phone className="size-4 text-gray-400" strokeWidth={1.75} />
                <a href={`tel:${c.telefono}`} className="hover:text-[#7C3AED]">{c.telefono}</a>
                <a
                  href={`https://wa.me/${c.telefono.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-xs font-medium text-emerald-700 hover:underline"
                >
                  WhatsApp
                </a>
              </li>
            )}
            {c.email && (
              <li className="flex items-center gap-2">
                <Mail className="size-4 text-gray-400" strokeWidth={1.75} />
                <a href={`mailto:${c.email}`} className="truncate hover:text-[#7C3AED]">{c.email}</a>
              </li>
            )}
            {dir && (
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-gray-400" strokeWidth={1.75} />
                <span>{dir}</span>
              </li>
            )}
            {redesEntries.map(([k, v]) => {
              const Icon = redIcon(k)
              const href = String(v).startsWith("http") ? String(v) : `https://${v}`
              return (
                <li key={k} className="flex items-center gap-2">
                  <Icon className="size-4 text-gray-400" strokeWidth={1.75} />
                  <a href={href} target="_blank" rel="noopener noreferrer" className="truncate hover:text-[#7C3AED]">
                    {String(v)}
                  </a>
                </li>
              )
            })}
            {c.rfc && (
              <li className="flex items-center gap-2 text-gray-500">
                <span className="text-xs font-semibold uppercase">RFC</span>
                <span className="font-mono">{c.rfc}</span>
              </li>
            )}
            {!c.telefono && !c.email && !dir && redesEntries.length === 0 && (
              <li className="text-gray-400">Sin datos de contacto.</li>
            )}
          </ul>
          {c.notas && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Notas</div>
              <p className="whitespace-pre-wrap text-sm text-gray-600">{c.notas}</p>
            </div>
          )}
        </div>

        {/* Historial de ventas */}
        <div className="rounded-2xl border border-[rgba(15,23,42,0.05)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <ShoppingBag className="size-4 text-gray-400" strokeWidth={1.75} />
            Compras ({ventas.length})
          </h2>
          {ventas.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Este cliente aún no tiene ventas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="py-2 pr-3 font-medium">Número</th>
                    <th className="py-2 pr-3 font-medium">Fecha</th>
                    <th className="py-2 pr-3 text-right font-medium">Total</th>
                    <th className="py-2 pr-3 text-right font-medium">Saldo</th>
                    <th className="py-2 font-medium">Estatus</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((v) => (
                    <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="py-2 pr-3">
                        <Link href={`/ventas/${v.id}`} className="font-mono text-xs text-[#7C3AED] hover:underline">
                          {v.numero ?? v.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-gray-500">{fmtFecha(v.fecha)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums font-medium text-gray-900">{formatMXN2(Number(v.total ?? 0))}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-gray-500">
                        {Number(v.saldo_pendiente ?? 0) > 0 ? formatMXN2(Number(v.saldo_pendiente)) : "—"}
                      </td>
                      <td className="py-2"><Badge estatus={v.estatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Cotizaciones */}
      <section className="rounded-2xl border border-[rgba(15,23,42,0.05)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <FileText className="size-4 text-gray-400" strokeWidth={1.75} />
          Cotizaciones ({cots.length})
        </h2>
        {cots.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Sin cotizaciones.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-3 font-medium">Número</th>
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 text-right font-medium">Total</th>
                  <th className="py-2 font-medium">Estatus</th>
                </tr>
              </thead>
              <tbody>
                {cots.map((q) => (
                  <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="py-2 pr-3">
                      <Link href={`/cotizaciones/${q.id}`} className="font-mono text-xs text-[#7C3AED] hover:underline">
                        {q.numero ?? q.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-gray-500">{fmtFecha(q.fecha)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-medium text-gray-900">{formatMXN2(Number(q.total ?? 0))}</td>
                    <td className="py-2"><Badge estatus={q.estatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
