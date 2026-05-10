import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { Plus, Package } from "lucide-react"

const mxn = (v: number) =>
  v.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  })

const usd = (v: number) =>
  `$${Number(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USD`

interface PedidoItem {
  id: string
  cantidad: number
  total_con_envio_mxn: number
  profit_total: number
  precio_unitario_usd: number
}

interface Pedido {
  id: string
  numero: number
  nombre: string
  fecha: string
  tipo: string | null
  tipo_cambio: number
  subtotal_usd: number
  costo_envio_usd: number
  total_mxn: number
  inversion_sandra_mxn: number
  inversion_benjamin_mxn: number
  inversion_sandra_usd: number
  inversion_benjamin_usd: number
  notas: string | null
  proveedores: { nombre: string } | null
  pedido_compra_items: PedidoItem[]
}

export default async function PedidosPage() {
  const supabase = await createClient()

  const { data: pedidos } = await supabase
    .from("pedidos_compra")
    .select(
      `
      *,
      proveedores(nombre),
      pedido_compra_items(id, cantidad, total_con_envio_mxn, profit_total, precio_unitario_usd)
    `,
    )
    .order("numero", { ascending: true })
    .returns<Pedido[]>()

  const list = pedidos ?? []

  const totalInvMXN = list.reduce(
    (s, p) =>
      s + Number(p.inversion_sandra_mxn) + Number(p.inversion_benjamin_mxn),
    0,
  )
  const totalInvUSD = list.reduce(
    (s, p) =>
      s + Number(p.inversion_sandra_usd) + Number(p.inversion_benjamin_usd),
    0,
  )
  const totalProfit = list.reduce(
    (s, p) =>
      s +
      (p.pedido_compra_items?.reduce(
        (si, i) => si + Number(i.profit_total ?? 0),
        0,
      ) ?? 0),
    0,
  )
  const totalUnidades = list.reduce(
    (s, p) =>
      s +
      (p.pedido_compra_items?.reduce(
        (si, i) => si + Number(i.cantidad ?? 0),
        0,
      ) ?? 0),
    0,
  )

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Pedidos de Compra"
        subtitle={`${list.length} pedidos · ${totalUnidades.toLocaleString("es-MX")} unidades compradas`}
        icon={<Package className="size-5" />}
        kpis={[
          {
            label: "Invertido USD",
            value: usd(totalInvUSD),
            sub: "ambos socios",
          },
          {
            label: "Invertido MXN",
            value: mxn(totalInvMXN),
            sub: "snapshot al TC del pedido",
            color: "text-[#C5A47E]",
          },
          {
            label: "Unidades compradas",
            value: totalUnidades.toLocaleString("es-MX"),
            sub: "histórico",
          },
          {
            label: "Profit potencial",
            value: mxn(totalProfit),
            sub: "si se vende todo el stock",
            color: "text-emerald-600",
          },
        ]}
        actions={
          <Link href="/pedidos/nuevo" className="pc-btn-primary">
            <Plus className="size-4" />
            Nuevo Pedido
          </Link>
        }
      />

      {list.length === 0 ? (
        <div className="rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          No hay pedidos registrados todavía.
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((pedido) => {
            const items = pedido.pedido_compra_items ?? []
            const totalItems = items.reduce(
              (s, i) => s + Number(i.cantidad),
              0,
            )
            const tipoIsCintas = pedido.tipo === "cintas"

            return (
              <article
                key={pedido.id}
                className="overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <header className="flex items-center justify-between gap-4 border-b border-[rgba(15,23,42,0.04)] px-6 py-4">
                  <Link
                    href={`/pedidos/${pedido.id}`}
                    className="flex flex-1 items-center gap-3 transition-opacity hover:opacity-70"
                  >
                    <div
                      className="flex size-11 shrink-0 items-center justify-center rounded-xl text-lg"
                      style={{
                        background: tipoIsCintas
                          ? "rgba(217,119,6,0.10)"
                          : "rgba(99,102,241,0.10)",
                        border: tipoIsCintas
                          ? "1px solid rgba(217,119,6,0.20)"
                          : "1px solid rgba(99,102,241,0.20)",
                        color: tipoIsCintas ? "#B45309" : "#4F46E5",
                      }}
                    >
                      <Package className="size-5" strokeWidth={1.75} />
                    </div>
                    <div>
                      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[#0F172A]">
                        {pedido.nombre}
                      </h2>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[#64748B]">
                        <span>
                          {new Date(pedido.fecha).toLocaleDateString("es-MX", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            background: "rgba(5,150,105,0.10)",
                            color: "#047857",
                            border: "1px solid rgba(5,150,105,0.20)",
                          }}
                        >
                          TC ${Number(pedido.tipo_cambio).toFixed(2)}
                        </span>
                        {pedido.proveedores?.nombre && (
                          <span>· {pedido.proveedores.nombre}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                  <Link
                    href={`/pedidos/${pedido.id}`}
                    className="hidden sm:inline-flex pc-btn-secondary"
                    style={{ height: 36, padding: "0 14px", fontSize: 12 }}
                  >
                    Ver detalle →
                  </Link>
                </header>

                <div className="grid grid-cols-2 divide-x divide-[rgba(15,23,42,0.04)] sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    {
                      label: "Productos",
                      value: totalItems.toLocaleString("es-MX"),
                      tone: "slate" as const,
                    },
                    {
                      label: "Subtotal USD",
                      value: `$${Number(pedido.subtotal_usd).toFixed(2)}`,
                      tone: "indigo" as const,
                    },
                    {
                      label: "Envío USD",
                      value: `$${Number(pedido.costo_envio_usd).toFixed(2)}`,
                      tone: "amber" as const,
                    },
                    {
                      label: "Total MXN",
                      value: mxn(Number(pedido.total_mxn)),
                      tone: "slate" as const,
                    },
                    {
                      label: "Inv. Sandra",
                      value: mxn(Number(pedido.inversion_sandra_mxn)),
                      tone: "rose" as const,
                    },
                    {
                      label: "Inv. Benjamin",
                      value: mxn(Number(pedido.inversion_benjamin_mxn)),
                      tone: "indigo" as const,
                    },
                  ].map((m, i) => (
                    <Metric key={i} label={m.label} value={m.value} tone={m.tone} />
                  ))}
                </div>

                {pedido.notas && (
                  <p className="border-t border-[rgba(15,23,42,0.04)] bg-[rgba(15,23,42,0.02)] px-6 py-2.5 text-[11px] italic text-[#64748B]">
                    {pedido.notas}
                  </p>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

const TONE: Record<
  "slate" | "indigo" | "amber" | "rose" | "emerald",
  string
> = {
  slate: "#0F172A",
  indigo: "#4F46E5",
  amber: "#B45309",
  rose: "#B91C1C",
  emerald: "#047857",
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: keyof typeof TONE
}) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="text-[9px] font-semibold uppercase tracking-[0.10em] text-[#94A3B8]">
        {label}
      </p>
      <p
        className="mt-1 text-[13px] font-bold tabular-nums tracking-[-0.01em]"
        style={{
          color: TONE[tone],
          fontFeatureSettings: '"tnum" 1',
        }}
      >
        {value}
      </p>
    </div>
  )
}
