import type { CotizacionData, CotizacionItem } from "@/lib/cotizacion-types"
import { formatMXN, formatMXN2 } from "@/lib/utils"
import { resumenRegalos, precioReferencia } from "@/lib/regalos"
import {
  resumenDescuentos,
  renglonesDescuento,
  tieneDescuento,
  etiquetaDescuento,
  precioLista,
} from "@/lib/descuentos"
import { esCinta } from "@/lib/grupos-productos"

const TEAL = "#1a8f72"
const TEAL_BG = "#f8fdfb"
const TEAL_LINE = "#d0ece4"
// Cortesías: magenta suave. Hex hardcodeado — el PDF no admite oklch/lab.
const GIFT = "#A21CAF"
const GIFT_BG = "#FDF4FF"
// Descuentos: verde ahorro (el cliente lee "esto me lo bajaron").
const SAVE = "#047857"
const SAVE_BG = "#ECFDF5"
const SAVE_LINE = "#A7F3D0"
// Rejilla de la tabla de productos — una sola constante para header y filas.
const GRID_COLS = "30px 1fr 60px 38px 92px 96px"
const INSTAGRAM_URL = "https://www.instagram.com/pielcanela_spabronceado/"

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * ⚠️ REGLA DE ESTE DOCUMENTO: nada de cajas ajustadas al texto.
 *
 * html2canvas (el rasterizador de la exportación a PDF) pinta el texto unos
 * píxeles MÁS ABAJO de donde calcula su caja de línea. En cajas holgadas
 * —filas, el bloque del TOTAL, la banda del encabezado— no se nota. Pero
 * cualquier adorno pegado al texto se rompe:
 *   · píldora con fondo y padding de 1-2px → el texto se sale del fondo
 *   · `text-decoration: line-through`       → la raya sale ARRIBA del número
 *   · `overflow: hidden` sobre una línea    → recorta el texto corrido
 * Se probaron `inline-block` + line-height fijo y una raya absoluta de 1px:
 * el desplazamiento persiste porque no depende del layout, sino de cómo
 * html2canvas resuelve la baseline con la fuente sustituida.
 *
 * Por eso el énfasis se hace SOLO con color, peso y palabras — que rasterizan
 * perfecto — y no con fondos, rayas ni recortes.
 */

/** Marca de descuento/cortesía: color + negrita, sin fondo. */
function MarcaTexto({
  children,
  color,
}: {
  children: React.ReactNode
  color: string
}) {
  return (
    <span
      style={{
        color,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  )
}

/**
 * Precio anterior al descuento. Sin tachado: la palabra "antes" comunica lo
 * mismo y no depende de que el rasterizador acierte la posición de la raya.
 */
function PrecioAntes({
  children,
  fontSize = 10,
}: {
  children: React.ReactNode
  fontSize?: number
}) {
  return (
    <span style={{ color: "#9a9a9a", fontSize, whiteSpace: "nowrap" }}>
      antes {children}
    </span>
  )
}

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
  // Cortesías: no suman al total (van en $0), pero se presumen en el documento.
  const regalos = resumenRegalos(data.items)
  // Descuentos por producto: `data.subtotal` ya viene NETO de ellos, así que
  // el bruto a precio de lista se reconstruye desde las partidas.
  const descuentos = resumenDescuentos(data.items)
  // Partidas de la misma familia con el mismo descuento se presentan como un
  // lote ("Cintas · 5 productos −15%") en vez de renglón por renglón.
  const renglonesDesc = renglonesDescuento(descuentos.detalle)
  const hayDescProductos = descuentos.monto > 0
  const hayDescGlobal = Number(data.descuento) > 0
  // % real del descuento global sobre el subtotal (sirva o no que se haya
  // capturado como monto: lo que se enseña es la proporción verdadera).
  const pctGlobal =
    data.subtotal > 0 ? (Number(data.descuento) / data.subtotal) * 100 : 0
  const ahorroTotal = round2(descuentos.monto + Number(data.descuento ?? 0))
  const ahorroPct =
    descuentos.brutoLista > 0 ? (ahorroTotal / descuentos.brutoLista) * 100 : 0

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
      {/* Header columnas: imagen · producto 1fr · medida · cant · p.unit · total */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID_COLS,
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
              const regalo = it.es_regalo === true
              // Partida con descuento: se enseña el precio de lista tachado y
              // el rebajado debajo, para que el cliente vea el ahorro en la
              // línea misma y no solo en el total.
              const conDesc = !regalo && tieneDescuento(it)
              const lista = conDesc ? precioLista(it) : 0
              return (
                <div
                  key={`${gi}-${i}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: GRID_COLS,
                    gap: 8,
                    alignItems: "center",
                    padding: "7px 24px",
                    borderBottom: "1px solid #f0f0f0",
                    minHeight: 34,
                    background: regalo ? GIFT_BG : conDesc ? SAVE_BG : undefined,
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
                    {/* La marca va en el 2º renglón, con el SKU: en la línea
                        del nombre (13px) competía con su altura de línea y
                        con nombres largos se encimaba. */}
                    <p
                      style={{
                        fontSize: 11,
                        color: "#888",
                        lineHeight: "14px",
                        margin: "2px 0 0 0",
                      }}
                    >
                      {it.sku}
                      {regalo && (
                        <span style={{ marginLeft: it.sku ? 8 : 0 }}>
                          <MarcaTexto color={GIFT}>DE REGALO</MarcaTexto>
                        </span>
                      )}
                      {conDesc && (
                        <span style={{ marginLeft: it.sku ? 8 : 0 }}>
                          <MarcaTexto color={SAVE}>
                            {`${etiquetaDescuento(it)} DE DESCUENTO`}
                          </MarcaTexto>
                        </span>
                      )}
                    </p>
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
                  <div
                    style={{
                      textAlign: "right",
                      fontSize: 12,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {/* En un regalo se tacha el precio de lista: el cliente ve
                        cuánto vale lo que se le obsequia. Con descuento se
                        tacha arriba el de catálogo y abajo va el rebajado. */}
                    {conDesc && (
                      <div style={{ lineHeight: 1.5 }}>
                        <PrecioAntes>{formatMXN2(lista)}</PrecioAntes>
                      </div>
                    )}
                    <div
                      style={{
                        color: regalo ? "#999" : conDesc ? SAVE : "#444",
                        fontWeight: conDesc ? 700 : 400,
                        lineHeight: 1.5,
                      }}
                    >
                      {regalo
                        ? `valor ${formatMXN2(precioReferencia(it))}`
                        : formatMXN2(it.precio_unitario)}
                    </div>
                  </div>
                  <div
                    style={{
                      textAlign: "right",
                      fontSize: 12,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        color: regalo ? GIFT : "#222",
                        lineHeight: 1.2,
                      }}
                    >
                      {regalo ? "GRATIS" : formatMXN2(it.subtotal)}
                    </div>
                    {conDesc && (
                      <div
                        style={{
                          fontSize: 9.5,
                          color: SAVE,
                          lineHeight: 1.2,
                        }}
                      >
                        {`ahorra ${formatMXN2(
                          round2((lista - Number(it.precio_unitario)) * Number(it.cantidad)),
                        )}`}
                      </div>
                    )}
                  </div>
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
              gridTemplateColumns: "1fr 250px",
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
                    {formatMXN(r.subtotal)}
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
              {/* Cascada de importes: cada renglón dice de dónde sale el
                  siguiente. Con descuento por producto arranca en el precio de
                  lista para que el ahorro se vea desde el primer renglón. */}
              <div style={{ marginBottom: 10 }}>
                {/* Etiquetas cortas a propósito: en 250px las de dos palabras
                    largas se partían en dos renglones y ensuciaban la
                    cascada. */}
                {hayDescProductos && (
                  <>
                    <LineaTotal
                      label="Subtotal de lista"
                      value={formatMXN2(descuentos.brutoLista)}
                      color="#777"
                    />
                    <LineaTotal
                      label={
                        descuentos.lineas === 1
                          ? "Descuento producto"
                          : "Descuento productos"
                      }
                      value={`− ${formatMXN2(descuentos.monto)}`}
                      color={SAVE}
                      strong
                    />
                  </>
                )}
                <LineaTotal
                  label={hayDescProductos ? "Subtotal con desc." : "Subtotal"}
                  value={formatMXN2(data.subtotal)}
                  color="#333"
                  strong
                  destacado={hayDescProductos}
                />
                {hayDescGlobal && (
                  <>
                    <LineaTotal
                      label={`Desc. general ${pctGlobal.toFixed(1)}%`}
                      value={`− ${formatMXN2(data.descuento)}`}
                      color={SAVE}
                      strong
                    />
                    <LineaTotal
                      label="Subtotal final"
                      value={formatMXN2(round2(data.subtotal - data.descuento))}
                      color="#333"
                      strong
                      destacado
                    />
                  </>
                )}
                {regalos.lineas > 0 && (
                  <LineaTotal
                    label="Regalo incluido"
                    value={`${regalos.piezas} pzs · ${formatMXN2(regalos.valor)}`}
                    color={GIFT}
                  />
                )}
                {data.ivaActivo && (
                  <LineaTotal
                    label="IVA 16%"
                    value={formatMXN2(data.iva)}
                    color="#333"
                  />
                )}
              </div>

              <div
                style={{
                  display: "block",
                  background: TEAL,
                  color: "#ffffff",
                  padding: 10,
                  borderRadius: 6,
                  width: 218,
                  boxSizing: "border-box",
                  marginLeft: "auto",
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
                    fontSize: 16,
                    fontWeight: 700,
                    textAlign: "center",
                    color: "#ffffff",
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1.2,
                  }}
                >
                  {Number(data.total ?? 0).toLocaleString("es-MX", {
                    style: "currency",
                    currency: "MXN",
                    minimumFractionDigits: 2,
                  })}
                </div>
              </div>

              {/* Cierre en positivo: cuánto se llevó de más el cliente. */}
              {ahorroTotal > 0 && (
                <div
                  style={{
                    marginTop: 6,
                    marginLeft: "auto",
                    width: 218,
                    boxSizing: "border-box",
                    background: SAVE_BG,
                    border: `1px solid ${SAVE_LINE}`,
                    borderRadius: 6,
                    padding: "6px 8px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 8.5,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      color: SAVE,
                      fontWeight: 700,
                    }}
                  >
                    Ahorro total
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: SAVE,
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1.3,
                    }}
                  >
                    {formatMXN2(ahorroTotal)}
                    <span style={{ fontSize: 10, fontWeight: 500 }}>
                      {` (${ahorroPct.toFixed(1)}%)`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── DETALLE DE DESCUENTOS: a qué producto corresponde cada uno ─── */}
      {(hayDescProductos || hayDescGlobal) && (
        <div
          style={{
            margin: "10px 24px 0",
            border: `1px solid ${SAVE_LINE}`,
            borderRadius: 8,
            overflow: "hidden",
            pageBreakInside: "avoid",
            breakInside: "avoid",
          }}
        >
          <div
            style={{
              background: SAVE_BG,
              padding: "7px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: `1px solid ${SAVE_LINE}`,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: SAVE,
              }}
            >
              Descuentos aplicados
            </span>
            <span
              style={{
                fontSize: 10.5,
                color: SAVE,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatMXN2(ahorroTotal)} en total
            </span>
          </div>

          {/* Encabezado de columnas */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 40px 78px 78px 82px",
              gap: 8,
              padding: "5px 16px",
              borderBottom: "1px solid #f0f0f0",
              fontSize: 8.5,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#999",
            }}
          >
            <span>Concepto</span>
            <span style={{ textAlign: "center" }}>Cant.</span>
            <span style={{ textAlign: "right" }}>Precio lista</span>
            <span style={{ textAlign: "right" }}>Con desc.</span>
            <span style={{ textAlign: "right" }}>Ahorro</span>
          </div>

          {renglonesDesc.map((d, i) => (
            <div
              key={`desc-${i}`}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 40px 78px 78px 82px",
                gap: 8,
                alignItems: "center",
                padding: "6px 16px",
                borderBottom: "1px solid #f5f5f5",
                fontSize: 11,
              }}
            >
              <span style={{ color: "#333" }}>
                {d.concepto}
                <span style={{ marginLeft: 8 }}>
                  <MarcaTexto color={SAVE}>{`−${d.etiqueta}`}</MarcaTexto>
                </span>
                {d.detalle && (
                  <span
                    style={{ color: "#999", marginLeft: 8, fontSize: 9.5 }}
                  >
                    {d.esLote ? `todo el lote · ${d.detalle}` : d.detalle}
                  </span>
                )}
              </span>
              <span
                style={{
                  textAlign: "center",
                  color: "#666",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {d.cantidad}
              </span>
              <span
                style={{
                  textAlign: "right",
                  color: "#999",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {d.precioLista == null ? "varios" : formatMXN2(d.precioLista)}
              </span>
              <span
                style={{
                  textAlign: "right",
                  color: "#333",
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {d.precioFinal == null ? "varios" : formatMXN2(d.precioFinal)}
              </span>
              <span
                style={{
                  textAlign: "right",
                  color: SAVE,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                − {formatMXN2(d.monto)}
              </span>
            </div>
          ))}

          {hayDescGlobal && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 82px",
                gap: 8,
                alignItems: "center",
                padding: "6px 16px",
                borderBottom: "1px solid #f5f5f5",
                fontSize: 11,
                background: "#fbfefd",
              }}
            >
              <span style={{ color: "#333" }}>
                Descuento general sobre el pedido
                <span style={{ marginLeft: 8 }}>
                  <MarcaTexto color={SAVE}>
                    {`−${pctGlobal.toFixed(1)}%`}
                  </MarcaTexto>
                </span>
                <span style={{ color: "#999", marginLeft: 6, fontSize: 10 }}>
                  {`sobre ${formatMXN2(data.subtotal)}`}
                </span>
              </span>
              <span
                style={{
                  textAlign: "right",
                  color: SAVE,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                − {formatMXN2(data.descuento)}
              </span>
            </div>
          )}

          {regalos.lineas > 0 && (
            <div
              style={{
                padding: "6px 16px",
                fontSize: 10,
                color: GIFT,
                background: GIFT_BG,
              }}
            >
              {`Además se incluyen ${regalos.piezas} pzs de regalo con valor de ${formatMXN2(regalos.valor)}, sin costo para ti.`}
            </div>
          )}
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

/**
 * Renglón de la cascada de importes: etiqueta a la izquierda, importe a la
 * derecha. `destacado` marca los subtotales "de corte" (los que el cliente
 * debe leer como cifra nueva) con fondo y borde.
 */
function LineaTotal({
  label,
  value,
  color,
  strong,
  destacado,
}: {
  label: string
  value: string
  color: string
  strong?: boolean
  destacado?: boolean
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 6,
        alignItems: "baseline",
        padding: destacado ? "5px 6px" : "3px 6px",
        marginTop: 2,
        borderRadius: 4,
        background: destacado ? "#ffffff" : undefined,
        border: destacado ? `1px solid ${TEAL_LINE}` : "1px solid transparent",
      }}
    >
      {/* Sin overflow/ellipsis: el rasterizador del PDF baja el texto unos
          píxeles y el recorte se lo comía por arriba. Line-height holgado por
          el mismo motivo. Las etiquetas ya son cortas para no necesitarlo. */}
      <span
        style={{
          fontSize: 8.5,
          color: "#888",
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          lineHeight: 1.6,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: strong ? 700 : 500,
          color,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.6,
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
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
