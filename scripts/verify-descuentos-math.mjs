// Verificación numérica del DESCUENTO POR PRODUCTO + descuento global.
// Corre la lib REAL, no una copia de la fórmula: si `src/lib/descuentos.ts`
// cambia, este script falla.
//   node scripts/verify-descuentos-math.mjs
//
// Se bundlea con esbuild porque Node ESM exige extensión en los imports y la
// lib usa el estilo de Next (`./regalos` sin `.ts`).
import { execFileSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const salida = path.join(
  mkdtempSync(path.join(tmpdir(), "pc-descuentos-")),
  "descuentos.mjs",
)
execFileSync(
  "npx",
  [
    "esbuild",
    "src/lib/descuentos.ts",
    "--bundle",
    "--format=esm",
    "--log-level=warning",
    `--outfile=${salida}`,
  ],
  { cwd: raiz, stdio: "inherit" },
)
const {
  totalesCotizacion,
  resumenDescuentos,
  renglonesDescuento,
  aplicarDescuentoLinea,
  aplicarDescuentoLote,
  precioConDescuento,
  etiquetaDescuento,
} = await import(salida)

let fails = 0
function check(name, got, want) {
  const ok =
    typeof got === "number" ? Math.abs(got - want) < 0.005 : got === want
  if (!ok) fails++
  const fmt = (v) => (typeof v === "number" ? v.toFixed(2) : String(v))
  console.log(
    `${ok ? "✓" : "✗ FALLA"}  ${name}: ${fmt(got)} (esperado ${fmt(want)})`,
  )
}

/** Partida cobrada, con descuento opcional aplicado como lo hace el form. */
function linea(nombre, precio, cantidad, desc, sku = null) {
  const base = {
    nombre,
    sku,
    cantidad,
    precio_unitario: precio,
    costo_unitario: 0,
    precio_lista: null,
    es_regalo: false,
    descuento_tipo: null,
    descuento_valor: 0,
  }
  if (!desc) return base
  return { ...base, ...aplicarDescuentoLinea(base, desc.tipo, desc.valor) }
}

console.log("— Precio con descuento (pieza a pieza) —")
check("15% de 2,113", precioConDescuento(2113, "pct", 15), 1796.05)
check("$25 por pieza sobre 150", precioConDescuento(150, "monto", 25), 125)
check("descuento mayor al precio se topa en 0", precioConDescuento(150, "monto", 900), 0)
check("101% se topa en 100%", precioConDescuento(150, "pct", 101), 0)
check("sin descuento deja el precio", precioConDescuento(150, "pct", 0), 150)

console.log("\n— Una partida con 15% —")
const l1 = linea("Ametista UV 1", 2113, 4, { tipo: "pct", valor: 15 })
check("precio rebajado", l1.precio_unitario, 1796.05)
check("precio de lista congelado", l1.precio_lista, 2113)
check("etiqueta", etiquetaDescuento(l1), "15%")
let r = resumenDescuentos([l1])
check("bruto a lista (2,113 × 4)", r.brutoLista, 8452)
check("neto (1,796.05 × 4)", r.neto, 7184.2)
check("descuento de la partida", r.monto, 1267.8)
check("% de la partida", r.detalle[0].pct, 15)

console.log("\n— Quitar el descuento devuelve el precio de lista —")
const l1sin = { ...l1, ...aplicarDescuentoLinea(l1, "pct", 0) }
check("precio restaurado", l1sin.precio_unitario, 2113)
check("precio_lista liberado", l1sin.precio_lista, null)
check("ya no cuenta como descuento", resumenDescuentos([l1sin]).monto, 0)

console.log("\n— Cambiar de 15% a 20% recalcula sobre la LISTA, no en cascada —")
const l1b = { ...l1, ...aplicarDescuentoLinea(l1, "pct", 20) }
check("precio con 20% de 2,113", l1b.precio_unitario, 1690.4)

console.log("\n— Cotización mixta: 2 con descuento + 1 sin + 1 regalo —")
const items = [
  linea("Ametista UV 1", 2113, 4, { tipo: "pct", valor: 15 }), // ahorra 1,267.80
  linea("Cinta Naranja", 150, 10, { tipo: "monto", valor: 25 }), // ahorra   250.00
  linea("Café Fit", 1498, 4), // sin descuento
  {
    nombre: "Cinta regalo",
    cantidad: 2,
    precio_unitario: 0,
    costo_unitario: 40,
    precio_lista: 150,
    es_regalo: true,
    descuento_tipo: null,
    descuento_valor: 0,
  },
]
r = resumenDescuentos(items)
check("partidas con descuento", r.lineas, 2)
check("bruto a lista (8,452 + 1,500 + 5,992)", r.brutoLista, 15944)
check("descuento por productos", r.monto, 1517.8)
check("neto = bruto − descuento", r.neto, 14426.2)
check("el regalo NO entra al bruto", r.detalle.length, 2)

let t = totalesCotizacion({
  items,
  descuentoTipo: "pct",
  descuentoValor: 5,
  ivaActivo: true,
})
check("subtotal (ya con descuentos por producto)", t.subtotal, 14426.2)
check("bruto a precios de lista", t.brutoLista, 15944)
check("descuento por productos", t.descuentoProductos, 1517.8)
check("descuento general 5% del subtotal", t.descuentoGlobal, 721.31)
check("base gravable", t.baseGravable, 13704.89)
check("IVA 16% de la base", t.iva, 2192.78)
check("total", t.total, 15897.67)
check("ahorro del cliente", t.ahorroCliente, 2239.11)
check("total = base + IVA", t.total, t.baseGravable + t.iva)
check(
  "subtotal = bruto − descuento productos",
  t.subtotal,
  t.brutoLista - t.descuentoProductos,
)

console.log("\n— Sin ningún descuento se comporta como antes —")
const simples = [linea("Café Fit", 1498, 4), linea("Cinta", 150, 10)]
t = totalesCotizacion({
  items: simples,
  descuentoTipo: "monto",
  descuentoValor: 0,
  ivaActivo: true,
})
check("subtotal", t.subtotal, 7492)
check("bruto = subtotal", t.brutoLista, 7492)
check("descuento productos", t.descuentoProductos, 0)
check("IVA", t.iva, 1198.72)
check("total", t.total, 8690.72)
check("ahorro", t.ahorroCliente, 0)

console.log("\n— Regresión: el pedido Mithra sin descuentos por producto —")
const MITHRA = [
  linea("Ametista UV 1", 2113, 4),
  linea("Potência Ultra", 1980, 4),
  linea("Café Fit", 1498, 4),
  linea("Ametista UV II", 1440, 4),
  linea("Potência 3.0", 2243, 6),
  linea("c1", 150, 2), linea("c2", 150, 2), linea("c3", 150, 2), linea("c4", 150, 2),
  linea("c5", 150, 1), linea("c6", 150, 1), linea("c7", 150, 1), linea("c8", 150, 1),
  linea("Cinta Naranja", 150, 10),
]
t = totalesCotizacion({
  items: MITHRA,
  descuentoTipo: "pct",
  descuentoValor: 5,
  ivaActivo: true,
})
check("subtotal", t.subtotal, 44882.0)
check("descuento 5%", t.descuentoGlobal, 2244.1)
check("IVA", t.iva, 6822.06)
check("total", t.total, 49459.96)

console.log("\n— Descuento POR LOTE: 10% a todas las cintas —")
const conCintas = [
  linea("Ametista UV 1", 2113, 4, { tipo: "pct", valor: 15 }, "PO-1L-AM1"),
  linea("Cinta Naranja 9mm", 150, 10, null, "CN-NAR-9"),
  linea("Cinta Azul 12mm", 150, 6, null, "CN-AZU-12"),
  linea("Cinta Rosa 9mm", 150, 4, null, "CN-ROS-9"),
  linea("Cinta Verde 12mm", 150, 4, null, "CN-VER-12"),
  {
    nombre: "Cinta de regalo",
    sku: "CN-AMA-CLA",
    cantidad: 2,
    precio_unitario: 0,
    costo_unitario: 40,
    precio_lista: 150,
    es_regalo: true,
    descuento_tipo: null,
    descuento_valor: 0,
  },
]
const conLote = aplicarDescuentoLote(
  conCintas,
  (it) => (it.sku ?? "").startsWith("CN-"),
  "pct",
  10,
)
r = resumenDescuentos(conLote)
check("cintas cobradas con descuento", r.lineas, 5)
check("precio de cinta rebajado", conLote[1].precio_unitario, 135)
check("el regalo sigue en $0", conLote[5].precio_unitario, 0)
check("el regalo NO recibe descuento", conLote[5].descuento_valor, 0)
check("ahorro de cintas (24 pzs × $15)", r.monto - 1267.8, 360)
check("el descuento previo del potenciador se conserva", conLote[0].precio_unitario, 1796.05)

let renglones = renglonesDescuento(r.detalle)
check("renglones = 1 lote de cintas + 1 partida suelta", renglones.length, 2)
const lote = renglones.find((x) => x.esLote)
check("el lote es de Cintas", lote.concepto, "Cintas")
check("junta las 4 partidas", lote.detalle, "4 productos")
check("piezas del lote", lote.cantidad, 24)
check("ahorro del lote", lote.monto, 360)
check("mismo precio en todo el lote", lote.precioFinal, 135)

console.log("\n— Lote con precios distintos: no inventa un precio unitario —")
const mixto = aplicarDescuentoLote(
  [
    linea("Cinta corta", 150, 2, null, "CN-A"),
    linea("Cinta larga", 220, 2, null, "CN-B"),
  ],
  () => true,
  "pct",
  10,
)
renglones = renglonesDescuento(resumenDescuentos(mixto).detalle)
check("se agrupan igual", renglones.length, 1)
check("precio lista queda en null (varios)", renglones[0].precioLista, null)
check("ahorro = 15×2 + 22×2", renglones[0].monto, 74)

console.log("\n— Reaplicar el lote NO encadena descuentos —")
const doble = aplicarDescuentoLote(conLote, (it) => (it.sku ?? "").startsWith("CN-"), "pct", 10)
check("sigue en $135, no $121.50", doble[1].precio_unitario, 135)

console.log("\n— Quitar el lote (0%) regresa a precio de lista —")
const sinLote = aplicarDescuentoLote(conLote, (it) => (it.sku ?? "").startsWith("CN-"), "pct", 0)
check("cinta a precio de lista", sinLote[1].precio_unitario, 150)
check("el potenciador conserva su 15%", sinLote[0].precio_unitario, 1796.05)

console.log("\n— Descuento global topado al subtotal —")
t = totalesCotizacion({
  items: simples,
  descuentoTipo: "monto",
  descuentoValor: 999999,
  ivaActivo: true,
})
check("descuento no pasa del subtotal", t.descuentoGlobal, 7492)
check("total no se hace negativo", t.total, 0)

console.log(
  fails === 0
    ? "\nTodo cuadra ✓"
    : `\n${fails} verificacion(es) fallaron ✗`,
)
process.exit(fails === 0 ? 0 : 1)
