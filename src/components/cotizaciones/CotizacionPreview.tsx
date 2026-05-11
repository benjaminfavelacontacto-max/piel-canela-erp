import type { CotizacionData, CotizacionItem } from "@/lib/cotizacion-types"

const INSTAGRAM_URL = "https://www.instagram.com/pielcanela_spabronceado/"

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
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
  if (!m) return ""
  let unit = m[2].toUpperCase()
  if (unit === "GR") unit = "G"
  if (unit === "LT") unit = "L"
  return `${m[1]}${unit}`
}

function groupByCategoria(items: CotizacionItem[]): [string | null, CotizacionItem[]][] {
  // Si NINGÚN item tiene categoria → un solo grupo "flat" sin label
  const hasAnyCategoria = items.some((it) => it.categoria)
  if (!hasAnyCategoria) return [[null, items]]

  const map = new Map<string, CotizacionItem[]>()
  for (const it of items) {
    const cat = it.categoria ?? "Otros"
    const arr = map.get(cat) ?? []
    arr.push(it)
    map.set(cat, arr)
  }
  return Array.from(map.entries()).map(([k, v]) => [k, v])
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
  const clienteLinea = [
    clienteNombre,
    c?.telefono ?? null,
    c?.ciudad ?? null,
  ]
    .filter(Boolean)
    .join("  ·  ")

  const grupos = groupByCategoria(data.items)

  return (
    <div
      ref={innerRef}
      style={{
        width: 816,
        minHeight: 1056,
        boxSizing: "border-box",
        background: "#ffffff",
        color: "#111827",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: 11,
        lineHeight: 1.4,
      }}
    >
      {/* ─── Header compacto: logo + brand + meta inline ─── */}
      <div
        style={{
          padding: "20px 24px 14px",
          borderBottom: "1px solid #E5E7EB",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Piel Canela"
              style={{ height: 52, width: "auto", objectFit: "contain" }}
            />
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  color: "#111827",
                  lineHeight: 1.1,
                }}
              >
                PIEL CANELA
              </div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: "#0F766E",
                  letterSpacing: "0.02em",
                }}
              >
                Spa &amp; Bronceado
              </div>
            </div>
          </div>

          <div style={{ textAlign: "right", color: "#6B7280", fontSize: 9.5 }}>
            <div style={{ marginBottom: 1 }}>
              Av. Guadalupe 6304, Jardines de Chapalita
            </div>
            <div>CP 45010, Guadalajara, Jalisco · +52 33 3250 8073</div>
          </div>
        </div>

        {/* Meta inline: Cotización · Folio · Fecha · Validez */}
        <div
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            paddingTop: 10,
            borderTop: "1px solid #F3F4F6",
            fontSize: 10,
            color: "#374151",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "#111827",
            }}
          >
            COTIZACIÓN
          </div>
          <div style={{ display: "flex", gap: 18 }}>
            <MetaInline label="Folio" value={data.numero || "—"} mono />
            <MetaInline label="Fecha" value={fmtFecha(data.fecha)} />
            <MetaInline
              label="Validez"
              value={
                data.valida_hasta
                  ? fmtFecha(data.valida_hasta)
                  : "30 días"
              }
            />
          </div>
        </div>
      </div>

      {/* ─── Cliente en una línea ─── */}
      <div
        style={{
          padding: "10px 24px",
          borderBottom: "1px solid #F3F4F6",
          fontSize: 11,
          color: "#374151",
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: "#9CA3AF",
            marginRight: 10,
          }}
        >
          Cliente
        </span>
        <span style={{ color: "#111827", fontWeight: 600 }}>
          {clienteLinea || "—"}
        </span>
      </div>

      {/* ─── Productos ─── */}
      <div style={{ padding: "10px 24px 4px" }}>
        {/* Header columnas */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "28px 1fr 60px 80px 38px 70px 80px",
            gap: 8,
            padding: "6px 0",
            borderBottom: "1px solid #E5E7EB",
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#9CA3AF",
          }}
        >
          <span></span>
          <span>Descripción</span>
          <span style={{ textAlign: "center" }}>Peso</span>
          <span style={{ textAlign: "center" }}>Código</span>
          <span style={{ textAlign: "center" }}>Cant.</span>
          <span style={{ textAlign: "right" }}>P. Unit.</span>
          <span style={{ textAlign: "right" }}>Total</span>
        </div>

        {data.items.length === 0 ? (
          <div
            style={{
              padding: "24px 0",
              textAlign: "center",
              color: "#9CA3AF",
              fontSize: 11,
            }}
          >
            Sin productos.
          </div>
        ) : (
          grupos.map(([cat, catItems], gi) => (
            <div key={`grupo-${gi}`}>
              {cat && (
                <div
                  style={{
                    padding: "6px 0 3px",
                    marginTop: gi > 0 ? 4 : 0,
                    fontSize: 8.5,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#0F766E",
                  }}
                >
                  {cat}
                </div>
              )}
              {catItems.map((it, i) => (
                <div
                  key={`${gi}-${i}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px 1fr 60px 80px 38px 70px 80px",
                    gap: 8,
                    padding: "8px 0",
                    borderTop:
                      i === 0 && !cat ? "none" : "1px solid #F3F4F6",
                    alignItems: "center",
                    fontSize: 10.5,
                    color: "#374151",
                    minHeight: 28,
                  }}
                >
                  <MiniImage src={it.imagen_url} />
                  <span style={{ color: "#111827", fontWeight: 500 }}>
                    {it.nombre}
                  </span>
                  <span style={{ textAlign: "center", color: "#6B7280" }}>
                    {it.peso ?? extractPesoMl(it.nombre) ?? ""}
                  </span>
                  <span
                    style={{
                      textAlign: "center",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: 9.5,
                      color: "#6B7280",
                    }}
                  >
                    {it.sku ?? "—"}
                  </span>
                  <span
                    style={{
                      textAlign: "center",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {it.cantidad}
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      color: "#6B7280",
                    }}
                  >
                    {mxn.format(it.precio_unitario)}
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                      color: "#111827",
                    }}
                  >
                    {mxn.format(it.subtotal)}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* ─── Totales: alineado a la derecha, sin bloque verde ─── */}
      <div
        style={{
          padding: "12px 24px 6px",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <div style={{ width: 260, fontSize: 11, color: "#374151" }}>
          <TotalRow label="Subtotal" value={mxn.format(data.subtotal)} />
          {data.descuento > 0 && (
            <TotalRow
              label="Descuento"
              value={`− ${mxn.format(data.descuento)}`}
              valueColor="#059669"
            />
          )}
          {data.ivaActivo && (
            <TotalRow label="IVA 16%" value={mxn.format(data.iva)} />
          )}
          <div
            style={{
              marginTop: 6,
              paddingTop: 8,
              borderTop: "1px solid #E5E7EB",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: "#6B7280",
              }}
            >
              Total
            </span>
            <span
              style={{
                fontSize: 19,
                fontWeight: 800,
                color: "#0F766E",
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.01em",
              }}
            >
              {mxn.format(data.total)}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Notas si existen ─── */}
      {data.notas && (
        <div
          style={{
            margin: "6px 24px 0",
            padding: "8px 12px",
            borderRadius: 6,
            background: "#F9FAFB",
            border: "1px solid #F3F4F6",
            fontSize: 10,
            color: "#6B7280",
            lineHeight: 1.55,
          }}
        >
          <span
            style={{
              fontWeight: 700,
              color: "#374151",
              marginRight: 6,
            }}
          >
            Notas:
          </span>
          {data.notas}
        </div>
      )}

      {/* ─── Footer una línea ─── */}
      <div
        style={{
          marginTop: 14,
          padding: "10px 24px",
          borderTop: "1px solid #E5E7EB",
          textAlign: "center",
          fontSize: 9.5,
          color: "#9CA3AF",
        }}
      >
        Precios en MXN · No incluye envío · Vigencia 30 días ·{" "}
        <a
          href={INSTAGRAM_URL}
          style={{
            color: "#0F766E",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          @pielcanela_spabronceado
        </a>
      </div>
    </div>
  )
}

function MetaInline({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div
      style={{ display: "flex", alignItems: "baseline", gap: 6 }}
    >
      <span
        style={{
          fontSize: 8.5,
          fontWeight: 700,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: "#9CA3AF",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: "#111827",
          fontFamily: mono
            ? "ui-monospace, SFMono-Regular, Menlo, monospace"
            : undefined,
        }}
      >
        {value}
      </span>
    </div>
  )
}

function MiniImage({ src }: { src: string | null }) {
  if (!src) {
    return (
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: 3,
          background: "#F3F4F6",
        }}
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      crossOrigin="anonymous"
      style={{
        width: 20,
        height: 20,
        borderRadius: 3,
        objectFit: "cover",
        display: "block",
      }}
    />
  )
}

function TotalRow({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "3px 0",
      }}
    >
      <span style={{ color: "#6B7280" }}>{label}</span>
      <span
        style={{
          fontWeight: 500,
          color: valueColor ?? "#111827",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  )
}
