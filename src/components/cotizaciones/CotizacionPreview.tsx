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

function esCinta(it: CotizacionItem): boolean {
  const sku = (it.sku ?? "").toUpperCase().trim()
  const categoria = (it.categoria ?? "").toUpperCase().trim()
  const nombre = (it.nombre ?? "").toUpperCase().trim()
  // SKU CN-XXX → más confiable
  if (sku.startsWith("CN-")) return true
  // Categoría con cualquier variante de "CINTA"
  if (categoria.includes("CINTA")) return true
  // Fallback por nombre
  if (nombre.startsWith("CINTA ")) return true
  if (nombre.includes("CORTADA")) return true
  if (nombre.includes("ENTERA") && !nombre.includes("ML")) return true
  return false
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

  // Resumen por categoría (líneas / piezas / subtotal)
  type ResumenCat = {
    categoria: string
    lineas: number
    piezas: number
    subtotal: number
  }
  const resumenMap = new Map<string, ResumenCat>()
  for (const it of data.items) {
    // Solo 2 grupos: Cintas y Otros (detección por SKU + categoria + nombre)
    const cat = esCinta(it) ? "Cintas" : "Otros"
    const cur = resumenMap.get(cat) ?? {
      categoria: cat,
      lineas: 0,
      piezas: 0,
      subtotal: 0,
    }
    cur.lineas += 1
    cur.piezas += Number(it.cantidad)
    cur.subtotal += Number(it.precio_unitario) * Number(it.cantidad)
    resumenMap.set(cat, cur)
  }
  const resumenCats = Array.from(resumenMap.values()).sort(
    (a, b) => b.subtotal - a.subtotal,
  )
  const totalLineas = data.items.length
  const totalPiezas = data.items.reduce((s, i) => s + Number(i.cantidad), 0)

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
      {/* ─── HEADER teal — logo 80x80 simétrico ─── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 24px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo_pielcanela2.png"
          alt="Piel Canela"
          style={{ width: 110, height: "auto", objectFit: "contain" }}
        />
        <div style={{ textAlign: "right" }}>
          <p
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#222",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            PIEL CANELA
          </p>
          <p
            style={{
              fontSize: 12,
              color: TEAL,
              fontWeight: 500,
              margin: "2px 0 4px 0",
            }}
          >
            Spa &amp; Bronceado
          </p>
          <p style={{ fontSize: 11, color: "#666", lineHeight: 1.6, margin: 0 }}>
            Av Guadalupe 6304, Jardines de Chapalita
            <br />
            CP 45010, Guadalajara, Jalisco
            <br />
            WhatsApp: +52 33 3250 8073
          </p>
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
      {/* Header columnas: imagen 32px · producto 1fr · medida · cant · p.unit · total */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "32px 1fr 70px 44px 88px 88px",
          gap: 8,
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
        <span></span>
        <span>Producto</span>
        <span style={{ textAlign: "center" }}>Medida</span>
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
              const medida = it.peso ?? extractPesoMl(it.nombre) ?? ""
              return (
                <div
                  key={`${gi}-${i}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "32px 1fr 70px 44px 88px 88px",
                    gap: 8,
                    alignItems: "center",
                    padding: "7px 24px",
                    borderBottom: "1px solid #f0f0f0",
                    minHeight: 34,
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
                    {it.sku && (
                      <p
                        style={{
                          fontSize: 11,
                          color: "#888",
                          lineHeight: 1.2,
                          margin: "1px 0 0 0",
                        }}
                      >
                        {it.sku}
                      </p>
                    )}
                  </div>
                  <span
                    style={{
                      textAlign: "center",
                      fontSize: 12,
                      color: "#555",
                    }}
                  >
                    {medida || "—"}
                  </span>
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

      {/* ─── TARJETA UNIFICADA: Resumen del pedido + Totales ─── */}
      {totalPiezas > 0 && (
        <div
          style={{
            margin: "12px 24px 0",
            border: `1px solid ${TEAL_LINE}`,
            borderRadius: 8,
            overflow: "hidden",
            pageBreakInside: "avoid",
            breakInside: "avoid",
          }}
        >
          {/* Header del bloque */}
          <div
            style={{
              background: TEAL_BG,
              padding: "8px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: `1px solid ${TEAL_LINE}`,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: TEAL,
              }}
            >
              Resumen del pedido
            </span>
            <span
              style={{
                fontSize: 10.5,
                color: "#666",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {totalLineas} {totalLineas === 1 ? "ítem" : "ítems"} ·{" "}
              {totalPiezas} pzs
            </span>
          </div>

          {/* Cuerpo: 2 columnas (desglose por categoría · subtotal + TOTAL) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 220px",
            }}
          >
            {/* COLUMNA IZQUIERDA — desglose por categoría */}
            <div style={{ padding: "10px 16px" }}>
              {resumenCats.map((r) => (
                <div
                  key={r.categoria}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 60px 60px 100px",
                    alignItems: "center",
                    padding: "5px 0",
                    borderBottom: "1px solid #f5f5f5",
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "#333", fontWeight: 500 }}>
                    {r.categoria}
                  </span>
                  <span
                    style={{
                      textAlign: "center",
                      color: "#777",
                      fontSize: 11,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {r.lineas} {r.lineas === 1 ? "ítem" : "ítems"}
                  </span>
                  <span
                    style={{
                      textAlign: "center",
                      color: "#777",
                      fontSize: 11,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {r.piezas} pzs
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      color: "#222",
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {r.subtotal.toLocaleString("es-MX", {
                      style: "currency",
                      currency: "MXN",
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
              ))}
            </div>

            {/* COLUMNA DERECHA — Subtotal/IVA + bloque verde TOTAL
                NO usar flex: html2canvas tiene quirks con flex layouts
                que desplazan el centrado. Block puro es bulletproof. */}
            <div
              style={{
                padding: "12px 16px",
                borderLeft: `1px solid ${TEAL_LINE}`,
                background: "#fafdfc",
              }}
            >
              <div style={{ textAlign: "right", marginBottom: 10 }}>
                <p
                  style={{
                    fontSize: 10,
                    color: "#888",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    margin: 0,
                  }}
                >
                  Subtotal
                </p>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#333",
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
                        fontSize: 10,
                        color: "#888",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        margin: "4px 0 0 0",
                      }}
                    >
                      Descuento
                    </p>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
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
                        fontSize: 10,
                        color: "#888",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        margin: "4px 0 0 0",
                      }}
                    >
                      IVA
                    </p>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#333",
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
                  padding: "12px 20px",
                  borderRadius: 8,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    opacity: 0.85,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    textAlign: "center",
                    color: "#ffffff",
                    marginBottom: 4,
                  }}
                >
                  TOTAL
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    textAlign: "center",
                    color: "#ffffff",
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1.1,
                  }}
                >
                  {mxn.format(data.total)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
