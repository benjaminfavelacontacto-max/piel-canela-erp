import type { CotizacionData, CotizacionItem } from "@/lib/cotizacion-types"

const TEAL = "#1a8f72"
const TEAL_BG = "#f8fdfb"
const TEAL_LINE = "#d0ece4"
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
  if (!m) return ""
  let unit = m[2].toUpperCase()
  if (unit === "GR") unit = "G"
  if (unit === "LT") unit = "L"
  return `${m[1]}${unit}`
}

function initials(name: string | null | undefined): string {
  if (!name) return "?"
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  )
}

function groupByCategoria(
  items: CotizacionItem[],
): { categoria: string | null; items: CotizacionItem[] }[] {
  const hasAny = items.some((it) => it.categoria)
  if (!hasAny) return [{ categoria: null, items }]
  const map = new Map<string, CotizacionItem[]>()
  for (const it of items) {
    const cat = it.categoria ?? "Otros"
    const arr = map.get(cat) ?? []
    arr.push(it)
    map.set(cat, arr)
  }
  return Array.from(map.entries()).map(([categoria, list]) => ({
    categoria,
    items: list,
  }))
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
  const clienteSubLine = [
    [c?.direccion, c?.ciudad].filter(Boolean).join(", "),
    c?.telefono,
  ]
    .filter(Boolean)
    .join(" · ")
  const avatarInitials = initials(clienteNombre)

  const grupos = groupByCategoria(data.items)

  // Conteo de unidades por tipo: Cintas vs resto de productos
  const unidadesCintas = data.items
    .filter((it) => it.categoria === "CINTAS")
    .reduce((s, i) => s + Number(i.cantidad), 0)
  const unidadesProductos = data.items
    .filter((it) => it.categoria !== "CINTAS")
    .reduce((s, i) => s + Number(i.cantidad), 0)

  return (
    <div
      ref={innerRef}
      style={{
        width: 816,
        minHeight: 1056,
        boxSizing: "border-box",
        background: "#ffffff",
        color: "#222222",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: 11,
        lineHeight: 1.4,
      }}
    >
      {/* ─── HEADER teal preservado ─── */}
      <div style={{ padding: "20px 24px 8px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Piel Canela"
            style={{ height: 160, width: "auto", objectFit: "contain" }}
          />
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "#222",
                lineHeight: 1.1,
              }}
            >
              PIEL CANELA
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: TEAL }}>
              Spa &amp; Bronceado
            </div>
            <div style={{ marginTop: 4, fontSize: 10, color: "#666" }}>
              Av Guadalupe 6304, Jardines de Chapalita
              <br />
              CP 45010, Guadalajara, Jalisco
              <br />
              WhatsApp: +52 33 3250 8073
            </div>
          </div>
        </div>
      </div>

      {/* ─── BANNER COTIZACIÓN (verde teal) ─── */}
      <div
        style={{
          background: TEAL,
          color: "#ffffff",
          padding: "8px 24px",
          textAlign: "center",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.14em",
        }}
      >
        COTIZACIÓN
      </div>

      {/* ─── FRANJA DE ORDEN: 3-col horizontal ─── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          padding: "8px 24px",
          background: TEAL_BG,
          borderBottom: `1px solid ${TEAL_LINE}`,
          fontSize: 10.5,
        }}
      >
        <FranjaCell label="Número de orden" value={data.numero || "—"} mono />
        <FranjaCell label="Fecha" value={fmtFecha(data.fecha)} />
        <FranjaCell
          label="Validez"
          value={
            data.valida_hasta ? fmtFecha(data.valida_hasta) : "30 días"
          }
        />
      </div>

      {/* ─── CLIENTE: avatar + 2 líneas ─── */}
      <div
        style={{
          padding: "12px 24px",
          borderBottom: `1px solid ${TEAL_LINE}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            background: TEAL,
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {avatarInitials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#222" }}>
            {clienteNombre}
          </div>
          {clienteSubLine && (
            <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>
              {clienteSubLine}
            </div>
          )}
        </div>
      </div>

      {/* ─── TABLA DE PRODUCTOS ─── */}
      {/* Header columnas */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 44px 88px 88px",
          padding: "8px 24px",
          background: TEAL_BG,
          borderBottom: `1px solid ${TEAL_LINE}`,
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: TEAL,
        }}
      >
        <span>Producto</span>
        <span style={{ textAlign: "center" }}>Cant.</span>
        <span style={{ textAlign: "right" }}>P. Unit.</span>
        <span style={{ textAlign: "right" }}>Total</span>
      </div>

      {/* Filas agrupadas por categoría */}
      {data.items.length === 0 ? (
        <div
          style={{
            padding: "32px 24px",
            textAlign: "center",
            color: "#aaa",
            fontSize: 11,
          }}
        >
          Sin productos.
        </div>
      ) : (
        grupos.map((g, gi) => (
          <div key={`grupo-${gi}`}>
            {g.categoria && (
              <div
                style={{
                  background: TEAL_BG,
                  borderBottom: `1px solid ${TEAL_LINE}`,
                  padding: "6px 24px",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: TEAL,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    fontWeight: 500,
                  }}
                >
                  {g.categoria}
                </span>
              </div>
            )}
            {g.items.map((it, i) => {
              const peso = it.peso ?? extractPesoMl(it.nombre)
              const subline = [it.sku, peso].filter(Boolean).join(" · ")
              return (
                <div
                  key={`${gi}-${i}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 44px 88px 88px",
                    alignItems: "center",
                    padding: "7px 24px",
                    borderBottom: "1px solid #f0f0f0",
                    minHeight: 34,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      minWidth: 0,
                    }}
                  >
                    <ProductThumb src={it.imagen_url} sku={it.sku} />
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 13,
                          color: "#222",
                          lineHeight: 1.2,
                          margin: 0,
                        }}
                      >
                        {it.nombre}
                      </p>
                      {subline && (
                        <p
                          style={{
                            fontSize: 11,
                            color: "#888",
                            lineHeight: 1.2,
                            margin: "1px 0 0 0",
                          }}
                        >
                          {subline}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    style={{
                      textAlign: "center",
                      fontSize: 12,
                      color: "#444",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {it.cantidad}
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      fontSize: 12,
                      color: "#444",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {mxn.format(it.precio_unitario)}
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#222",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {mxn.format(it.subtotal)}
                  </span>
                </div>
              )
            })}
          </div>
        ))
      )}

      {/* ─── DESGLOSE por tipo: Productos · Cintas · Total ─── */}
      {(unidadesCintas > 0 || unidadesProductos > 0) && (
        <div
          style={{
            padding: "10px 24px",
            borderTop: "1px solid #e8e8e8",
            display: "flex",
            justifyContent: "flex-end",
            gap: 24,
            alignItems: "center",
          }}
        >
          {unidadesProductos > 0 && (
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#000",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                margin: 0,
              }}
            >
              Productos ({unidadesProductos} uds)
            </p>
          )}
          {unidadesCintas > 0 && (
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#000",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                margin: 0,
              }}
            >
              Cintas ({unidadesCintas} uds)
            </p>
          )}
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#000",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              margin: 0,
              paddingLeft: 16,
              borderLeft: "1px solid #ddd",
            }}
          >
            Total ({unidadesProductos + unidadesCintas} uds)
          </p>
        </div>
      )}

      {/* ─── TOTALES: subtotal/IVA + bloque verde TOTAL compacto ─── */}
      <div
        style={{
          borderTop: `1.5px solid ${TEAL}`,
          padding: "12px 24px",
          display: "flex",
          justifyContent: "flex-end",
          gap: 32,
          alignItems: "center",
        }}
      >
        <div style={{ textAlign: "right" }}>
          <p
            style={{ fontSize: 11, color: "#888", margin: 0, lineHeight: 1.3 }}
          >
            Subtotal
          </p>
          <p
            style={{
              fontSize: 13,
              color: "#444",
              margin: 0,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.3,
            }}
          >
            {mxn.format(data.subtotal)}
          </p>
          {data.descuento > 0 && (
            <>
              <p
                style={{
                  fontSize: 11,
                  color: "#888",
                  margin: "4px 0 0 0",
                  lineHeight: 1.3,
                }}
              >
                Descuento
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: "#059669",
                  margin: 0,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1.3,
                }}
              >
                − {mxn.format(data.descuento)}
              </p>
            </>
          )}
          {data.ivaActivo && (
            <>
              <p
                style={{
                  fontSize: 11,
                  color: "#888",
                  margin: "4px 0 0 0",
                  lineHeight: 1.3,
                }}
              >
                IVA
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: "#444",
                  margin: 0,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1.3,
                }}
              >
                {mxn.format(data.iva)}
              </p>
            </>
          )}
        </div>

        <div
          style={{
            background: TEAL,
            color: "#ffffff",
            padding: "10px 20px",
            borderRadius: 8,
            textAlign: "center",
            minWidth: 130,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <p
            style={{
              fontSize: 10,
              opacity: 0.85,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              margin: 0,
              marginBottom: 2,
            }}
          >
            TOTAL
          </p>
          <p
            style={{
              fontSize: 20,
              fontWeight: 600,
              margin: 0,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            {mxn.format(data.total)}
          </p>
        </div>
      </div>

      {/* ─── NOTAS si existen ─── */}
      {data.notas && (
        <div
          style={{
            margin: "0 24px 12px",
            padding: "8px 12px",
            borderRadius: 6,
            background: TEAL_BG,
            border: `1px solid ${TEAL_LINE}`,
            fontSize: 10.5,
            color: "#555",
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontWeight: 600, color: "#222", marginRight: 6 }}>
            Notas:
          </span>
          {data.notas}
        </div>
      )}

      {/* ─── FOOTER una línea ─── */}
      <div
        style={{
          padding: "8px 24px",
          borderTop: "1px solid #e8e8e8",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <p style={{ fontSize: 10, color: "#aaa", margin: 0 }}>
          Precios en MXN · No incluye gastos de envío
        </p>
        <a
          href={INSTAGRAM_URL}
          style={{
            fontSize: 10,
            color: TEAL,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          @pielcanela_spabronceado
        </a>
      </div>
    </div>
  )
}

function FranjaCell({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: TEAL,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#222",
          fontWeight: 500,
          fontFamily: mono
            ? "ui-monospace, SFMono-Regular, Menlo, monospace"
            : undefined,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function ProductThumb({
  src,
  sku,
}: {
  src: string | null
  sku: string | null
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        crossOrigin="anonymous"
        style={{
          width: 28,
          height: 28,
          borderRadius: 4,
          objectFit: "cover",
          flexShrink: 0,
          background: "#f5f5f5",
        }}
      />
    )
  }
  // Sin imagen → iniciales del SKU en placeholder gris
  const ini = sku ? sku.replace(/[^A-Z0-9]/gi, "").slice(0, 2).toUpperCase() : "?"
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 4,
        background: "#f0f0f0",
        color: "#999",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.02em",
        flexShrink: 0,
      }}
    >
      {ini}
    </div>
  )
}
