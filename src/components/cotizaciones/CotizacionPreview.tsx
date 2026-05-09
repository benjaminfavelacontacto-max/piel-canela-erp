import type { CotizacionData } from "@/lib/cotizacion-types"

const INSTAGRAM_URL = "https://www.instagram.com/pielcanela_spabronceado/"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
})

const fechaFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

function fmtFecha(s: string | null | undefined): string {
  if (!s) return "—"
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : fechaFmt.format(d)
}

function extractPesoMl(nombre: string): string {
  const m = nombre.match(/(\d+(?:\.\d+)?)\s*(ML|L|LT|KG|G|GR)\b/i)
  if (!m) return "—"
  let unit = m[2].toUpperCase()
  if (unit === "GR") unit = "G"
  if (unit === "LT") unit = "L"
  return `${m[1]}${unit}`
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  )
}

export function CotizacionPreview({
  data,
  innerRef,
}: {
  data: CotizacionData
  innerRef?: React.Ref<HTMLDivElement>
}) {
  const c = data.cliente
  const clienteNombre = c?.nombre_negocio ?? c?.nombre ?? "—"
  const clienteSecundario = c?.nombre_negocio ? c.nombre : null
  const clienteDireccion = c
    ? [
        c.direccion,
        c.colonia,
        c.codigo_postal ? `C.P. ${c.codigo_postal}` : null,
        c.ciudad,
        c.estado,
      ]
        .filter(Boolean)
        .join(", ") || "—"
    : "—"

  return (
    <div
      ref={innerRef}
      className="bg-[#ffffff] text-[#111827] font-sans"
      style={{
        width: 816,
        minHeight: 1056,
        boxSizing: "border-box",
      }}
    >
      <div className="px-10 pt-8 pb-6">
        <header className="flex items-start justify-between gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Piel Canela"
            className="h-28 w-auto"
            style={{ objectFit: "contain" }}
          />
          <div className="text-right text-[#111827]">
            <div className="text-lg font-bold leading-tight">PIEL CANELA</div>
            <div className="text-sm font-semibold text-[#0d9488]">
              Spa &amp; Bronceado
            </div>
            <div className="mt-1 text-xs text-[#374151] leading-snug">
              Av Guadalupe 6304, Jardines de Chapalita
              <br />
              CP 45010, Guadalajara, Jalisco
              <br />
              WhatsApp: +52 33 3250 8073
            </div>
          </div>
        </header>
      </div>

      <SectionHeader>COTIZACIÓN</SectionHeader>
      <div className="px-10 py-3">
        <InfoTable
          rows={[
            { label: "Fecha", value: fmtFecha(data.fecha) },
            { label: "Número de orden", value: data.numero || "—", mono: true },
            {
              label: "Validez",
              value: "30 días (Precios sin IVA) No incluye envío",
            },
          ]}
        />
      </div>

      <SectionHeader>DATOS DE CLIENTE</SectionHeader>
      <div className="px-10 py-3">
        <InfoTable
          rows={[
            {
              label: "Nombre",
              value: clienteSecundario
                ? `${clienteNombre} — ${clienteSecundario}`
                : clienteNombre,
            },
            { label: "Dirección", value: clienteDireccion },
            { label: "Teléfono", value: c?.telefono ?? "—" },
            { label: "Email", value: c?.email ?? "—" },
          ]}
        />
      </div>

      <SectionHeader>LISTA DE PRECIOS</SectionHeader>
      <div className="px-10 py-3">
        <table
          className="w-full border-collapse text-sm"
          style={{ tableLayout: "fixed" }}
        >
          <colgroup>
            <col style={{ width: 64 }} />
            <col />
            <col style={{ width: 80 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr className="bg-[#f9fafb] text-[#374151]">
              <Th>Imagen</Th>
              <Th align="left">Descripción</Th>
              <Th>Peso/ml</Th>
              <Th>Código</Th>
              <Th>Cant.</Th>
              <Th align="right">P. Unit.</Th>
              <Th align="right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="border border-[#e5e7eb] py-8 text-center text-[#6b7280]"
                >
                  Sin productos.
                </td>
              </tr>
            ) : (
              data.items.map((it, i) => (
                <tr
                  key={`${it.producto_id}-${i}`}
                  className={i % 2 === 1 ? "bg-[#fafafa]" : "bg-[#ffffff]"}
                >
                  <Td>
                    <ProductImage
                      src={it.imagen_url}
                      name={it.nombre}
                    />
                  </Td>
                  <Td align="left">
                    <div className="font-semibold text-[#111827]">
                      {it.nombre}
                    </div>
                  </Td>
                  <Td>{it.peso ?? extractPesoMl(it.nombre)}</Td>
                  <Td>
                    <span className="font-mono text-xs text-[#374151]">
                      {it.sku ?? "—"}
                    </span>
                  </Td>
                  <Td>{it.cantidad}</Td>
                  <Td align="right">{mxn.format(it.precio_unitario)}</Td>
                  <Td align="right" bold>
                    {mxn.format(it.subtotal)}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end px-10 py-3">
        <div className="w-72 text-sm">
          <TotalRow label="Subtotal" value={mxn.format(data.subtotal)} />
          {data.descuento > 0 && (
            <TotalRow
              label="Descuento"
              value={`-${mxn.format(data.descuento)}`}
              valueClass="text-[#059669]"
            />
          )}
          {data.ivaActivo && (
            <TotalRow label="IVA 16%" value={mxn.format(data.iva)} />
          )}
          <div className="mt-2 flex items-center justify-between rounded-md bg-[#0d9488] px-4 py-2.5 text-[#ffffff]">
            <span className="text-sm font-bold">TOTAL</span>
            <span
              className="text-lg font-bold"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {mxn.format(data.total)}
            </span>
          </div>
        </div>
      </div>

      {data.notas && (
        <div className="px-10 py-2">
          <div className="rounded-md border border-[#e5e7eb] bg-[#f9fafb] p-3 text-xs text-[#374151]">
            <div className="mb-1 font-semibold text-[#111827]">Notas</div>
            {data.notas}
          </div>
        </div>
      )}

      <footer className="mt-4 border-t border-[#e5e7eb] px-10 py-4 text-center text-xs text-[#6b7280]">
        <div>Precios en MXN. No incluye gastos de envío.</div>
        <div className="mt-1">
          <a
            href={INSTAGRAM_URL}
            className="text-[#0d9488] font-semibold no-underline"
          >
            @pielcanela_spabronceado
          </a>
        </div>
      </footer>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#0d9488] px-10 py-2 text-center">
      <span className="text-sm font-bold tracking-wide text-[#ffffff]">
        {children}
      </span>
    </div>
  )
}

function InfoTable({
  rows,
}: {
  rows: { label: string; value: string; mono?: boolean }[]
}) {
  return (
    <table
      className="w-full border-collapse text-sm"
      style={{ tableLayout: "fixed" }}
    >
      <colgroup>
        <col style={{ width: 180 }} />
        <col />
      </colgroup>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#374151]">
              {r.label}
            </td>
            <td
              className={`border border-[#e5e7eb] bg-[#ffffff] px-3 py-2 text-[#111827] ${
                r.mono ? "font-mono text-sm" : "text-sm"
              }`}
            >
              {r.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Th({
  children,
  align = "center",
}: {
  children: React.ReactNode
  align?: "left" | "center" | "right"
}) {
  return (
    <th
      className="border border-[#e5e7eb] px-2 py-2 text-xs font-semibold uppercase tracking-wide"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = "center",
  bold = false,
}: {
  children: React.ReactNode
  align?: "left" | "center" | "right"
  bold?: boolean
}) {
  return (
    <td
      className={`border border-[#e5e7eb] px-2 py-2 text-sm ${bold ? "font-semibold" : ""}`}
      style={{ textAlign: align, verticalAlign: "middle" }}
    >
      {children}
    </td>
  )
}

function ProductImage({
  src,
  name,
}: {
  src: string | null
  name: string
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        crossOrigin="anonymous"
        className="rounded border border-[#e5e7eb]"
        style={{
          width: 40,
          height: 40,
          objectFit: "cover",
          display: "block",
          margin: "0 auto",
        }}
      />
    )
  }
  return (
    <div
      className="flex items-center justify-center rounded border border-[#e5e7eb] bg-[#f3f4f6] text-xs font-semibold text-[#6b7280]"
      style={{ width: 40, height: 40, margin: "0 auto" }}
    >
      {initials(name)}
    </div>
  )
}

function TotalRow({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex justify-between py-1 text-[#374151]">
      <span>{label}</span>
      <span
        className={`font-medium text-[#111827] ${valueClass ?? ""}`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </span>
    </div>
  )
}
