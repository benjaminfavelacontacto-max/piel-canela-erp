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
  `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`

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
  status: string | null
  proveedores: { nombre: string } | null
  pedido_compra_items: PedidoItem[]
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; color: string; border: string }
> = {
  en_transito: {
    label: "En tránsito",
    bg: "rgba(8,145,178,0.10)",
    color: "#0E7490",
    border: "rgba(8,145,178,0.20)",
  },
  recibido: {
    label: "Recibido",
    bg: "rgba(5,150,105,0.10)",
    color: "#047857",
    border: "rgba(5,150,105,0.20)",
  },
  vendido: {
    label: "Vendido",
    bg: "rgba(99,102,241,0.10)",
    color: "#4F46E5",
    border: "rgba(99,102,241,0.20)",
  },
  parcial: {
    label: "Venta parcial",
    bg: "rgba(217,119,6,0.10)",
    color: "#B45309",
    border: "rgba(217,119,6,0.20)",
  },
  pendiente: {
    label: "Pendiente",
    bg: "rgba(220,38,38,0.10)",
    color: "#B91C1C",
    border: "rgba(220,38,38,0.20)",
  },
}

function tcColor(tc: number): string {
  if (tc <= 18.5) return "#047857"
  if (tc <= 20) return "#B45309"
  return "#B91C1C"
}
function tcBg(tc: number): { bg: string; border: string } {
  if (tc <= 18.5)
    return {
      bg: "rgba(5,150,105,0.10)",
      border: "rgba(5,150,105,0.20)",
    }
  if (tc <= 20)
    return {
      bg: "rgba(217,119,6,0.10)",
      border: "rgba(217,119,6,0.20)",
    }
  return {
    bg: "rgba(220,38,38,0.10)",
    border: "rgba(220,38,38,0.20)",
  }
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
  const totalProductosUSD = list.reduce(
    (s, p) => s + Number(p.subtotal_usd ?? 0),
    0,
  )
  const totalEnvioUSD = list.reduce(
    (s, p) => s + Number(p.costo_envio_usd ?? 0),
    0,
  )
  const roiGlobal =
    totalInvMXN > 0 ? Math.round((totalProfit / totalInvMXN) * 100) : 0
  const lastPedido = list[list.length - 1]
  const lastROI = lastPedido
    ? (() => {
        const profit =
          lastPedido.pedido_compra_items?.reduce(
            (s, i) => s + Number(i.profit_total ?? 0),
            0,
          ) ?? 0
        const inv =
          Number(lastPedido.inversion_sandra_mxn) +
          Number(lastPedido.inversion_benjamin_mxn)
        return inv > 0 ? Math.round((profit / inv) * 100) : 0
      })()
    : 0

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Pedidos de Compra"
        subtitle={
          lastROI > 0
            ? `${list.length} pedidos · ${totalUnidades.toLocaleString("es-MX")} unidades · Último pedido genera +${lastROI}% retorno esperado`
            : `${list.length} pedidos · ${totalUnidades.toLocaleString("es-MX")} unidades compradas`
        }
        icon={<Package className="size-5" />}
        kpis={[
          {
            label: "Productos",
            value: usd(totalProductosUSD),
            currency: "USD",
            sub: `${totalUnidades.toLocaleString("es-MX")} unidades`,
            color: "text-indigo-600",
          },
          {
            label: "Envío",
            value: usd(totalEnvioUSD),
            currency: "USD",
            sub: "Brasil → MXN + flete",
            color: "text-amber-700",
          },
          {
            label: "Invertido",
            value: usd(totalInvUSD),
            currency: "USD",
            sub: "ambos socios (con envío)",
          },
          {
            label: "Invertido",
            value: mxn(totalInvMXN),
            currency: "MXN",
            sub: "snapshot al TC del pedido",
            color: "text-[#C5A47E]",
          },
          {
            label: "Unidades",
            value: totalUnidades.toLocaleString("es-MX"),
            sub: `${list.reduce((s, p) => s + (p.pedido_compra_items?.length ?? 0), 0)} SKUs`,
            color: "text-gray-500",
          },
          {
            label: "Profit potencial",
            value: mxn(totalProfit),
            currency: "MXN",
            sub: "si se vende todo el stock",
            color: "text-emerald-700",
            microBadge:
              roiGlobal > 0 ? `+${roiGlobal}% ROI esperado` : undefined,
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
            const tc = Number(pedido.tipo_cambio)
            const tcStyle = tcBg(tc)
            const invTotal =
              Number(pedido.inversion_sandra_mxn) +
              Number(pedido.inversion_benjamin_mxn)
            const profitPed = items.reduce(
              (s, i) => s + Number(i.profit_total ?? 0),
              0,
            )
            const roi =
              invTotal > 0 ? Math.round((profitPed / invTotal) * 100) : 0
            const status = pedido.status ?? "recibido"
            const sc = STATUS_CONFIG[status] ?? STATUS_CONFIG.recibido

            return (
              <article
                key={pedido.id}
                className="overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white shadow-sm transition-all hover:-translate-y-0.5"
                style={{ transition: "all 0.15s cubic-bezier(0.4,0,0.2,1)" }}
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
                      <div className="flex items-center gap-2">
                        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[#0F172A]">
                          {pedido.nombre}
                        </h2>
                        <span
                          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                          style={{
                            background: sc.bg,
                            color: sc.color,
                            border: `1px solid ${sc.border}`,
                          }}
                        >
                          {sc.label}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[#64748B]">
                        <span>
                          {new Date(pedido.fecha).toLocaleDateString("es-MX", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                        {pedido.proveedores?.nombre && (
                          <span className="text-gray-400">
                            · {pedido.proveedores.nombre}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                  <Link
                    href={`/pedidos/${pedido.id}`}
                    className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-[rgba(15,23,42,0.10)] bg-white px-4 py-2 text-[12px] font-medium text-[#475569] transition-all hover:border-[rgba(15,23,42,0.18)] hover:bg-[rgba(15,23,42,0.02)] hover:text-[#0F172A]"
                  >
                    Abrir pedido
                    <span className="text-[14px] opacity-60">↗</span>
                  </Link>
                </header>

                {/* Chips horizontales agrupados: COMPRA · COSTOS · RESULTADO */}
                <div className="flex flex-wrap items-center gap-2 border-t border-[rgba(15,23,42,0.04)] px-6 py-4">
                  <SectionLabel>Compra</SectionLabel>
                  <Chip label="unidades" value={totalItems.toLocaleString("es-MX")} />
                  <Chip label="SKUs" value={String(items.length)} />

                  <Sep />
                  <SectionLabel>Costos</SectionLabel>
                  <Chip
                    label="TC"
                    value={`$${tc.toFixed(2)}`}
                    color={tcColor(tc)}
                    bg={tcStyle.bg}
                    border={tcStyle.border}
                  />
                  <Chip
                    label="envío"
                    value={`$${Number(pedido.costo_envio_usd).toFixed(0)} USD`}
                    color="#B45309"
                  />
                  <Chip
                    label="invertido"
                    value={mxn(invTotal)}
                    color="#A8895F"
                  />

                  {profitPed > 0 && (
                    <>
                      <Sep />
                      <SectionLabel tone="emerald">Resultado</SectionLabel>
                      <Chip
                        label="profit"
                        value={`↑ ${mxn(profitPed)}`}
                        color="#047857"
                        bg="rgba(5,150,105,0.08)"
                        border="rgba(5,150,105,0.20)"
                        bold
                      />
                      {roi > 0 && (
                        <Chip
                          value={`+${roi}% ROI`}
                          color="#047857"
                          bg="rgba(5,150,105,0.05)"
                          border="rgba(5,150,105,0.15)"
                        />
                      )}
                    </>
                  )}
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

function SectionLabel({
  children,
  tone,
}: {
  children: React.ReactNode
  tone?: "emerald"
}) {
  const color = tone === "emerald" ? "rgba(5,150,105,0.55)" : "#94A3B8"
  return (
    <span
      className="mr-1.5 text-[10.5px] font-semibold uppercase"
      style={{ color, letterSpacing: "0.12em" }}
    >
      {children}
    </span>
  )
}

function Sep() {
  return <span className="mx-1 text-gray-300">·</span>
}

function Chip({
  label,
  value,
  color = "#475569",
  bg = "rgba(15,23,42,0.04)",
  border = "rgba(15,23,42,0.08)",
  bold = false,
}: {
  label?: string
  value: string
  color?: string
  bg?: string
  border?: string
  bold?: boolean
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] tabular-nums"
      style={{
        background: bg,
        border: `1px solid ${border}`,
        color,
        fontWeight: bold ? 700 : 600,
        letterSpacing: "-0.01em",
        fontFeatureSettings: '"tnum" 1',
      }}
    >
      {label && (
        <span className="text-[11px] font-normal text-gray-400">{label}</span>
      )}
      {value}
    </span>
  )
}
