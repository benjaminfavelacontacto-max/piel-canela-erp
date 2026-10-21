// Verificación numérica de los productos de REGALO.
// Importa el módulo REAL (src/lib/regalos.ts) — Node ≥22 hace type-stripping,
// así que no hay copia de la fórmula que se pueda desincronizar. Lo único que
// se replica aquí es el cálculo de totales de cotizacion-form.tsx (vive dentro
// del componente), igual que en scripts/verify-cotizacion-math.mjs.
//
// Corre con: node scripts/verify-regalos-math.mjs

import {
  resumenRegalos,
  descuentoEfectivoPct,
  precioReferencia,
  alternarRegalo,
} from "../src/lib/regalos.ts"

const round2 = (n) => Math.round(n * 100) / 100

/** Espejo de cotizacion-form.tsx: subtotal → descuento → IVA → total. */
function calcDoc({ items, descuentoTipo = "monto", descuentoValor = 0, ivaActivo = true, costoEnvio = 0 }) {
  const subtotal = round2(items.reduce((s, it) => s + it.precio_unitario * it.cantidad, 0))
  const descuento = round2(
    descuentoTipo === "pct"
      ? Math.max(0, Math.min(subtotal, subtotal * (descuentoValor / 100)))
      : Math.max(0, Math.min(subtotal, descuentoValor)),
  )
  const baseGravable = round2(subtotal - descuento)
  const iva = ivaActivo ? round2(baseGravable * 0.16) : 0
  const total = round2(baseGravable + iva)
  // El costo SÍ incluye los regalos (salieron del almacén).
  const costoProductos = round2(items.reduce((s, it) => s + it.costo_unitario * it.cantidad, 0))
  const utilidadNeta = round2(subtotal - descuento - costoProductos - costoEnvio)
  return { subtotal, descuento, iva, total, costoProductos, utilidadNeta }
}

const vendido = (precio, costo, cantidad) => ({
  cantidad,
  precio_unitario: precio,
  costo_unitario: costo,
  es_regalo: false,
  precio_lista: null,
})
const regalado = (precioLista, costo, cantidad) => ({
  cantidad,
  precio_unitario: 0, // así se persiste: subtotal (GENERATED) = 0
  costo_unitario: costo,
  es_regalo: true,
  precio_lista: precioLista,
})

let fails = 0
function check(name, got, want) {
  const ok = typeof got === "number" ? Math.abs(got - want) < 0.005 : got === want
  if (!ok) fails++
  const fmt = (v) => (typeof v === "number" ? v.toFixed(2) : String(v))
  console.log(`${ok ? "✓" : "✗ FALLA"}  ${name}: ${fmt(got)} (esperado ${fmt(want)})`)
}

// ── A. Línea base: 10 pzs a $1,000 (costo $400), con IVA ───────────
console.log("— A. Sin regalos (línea base) —")
const BASE = [vendido(1000, 400, 10)]
let a = calcDoc({ items: BASE })
check("subtotal", a.subtotal, 10000)
check("IVA 16%", a.iva, 1600)
check("total", a.total, 11600)
check("costo productos", a.costoProductos, 4000)
check("utilidad neta", a.utilidadNeta, 6000)

// ── B. "Compra 10, lleva 1": mismo SKU, 2 partidas ─────────────────
console.log("— B. Compra 10 lleva 1 (el regalo no cambia lo que paga el cliente) —")
const CON_REGALO = [vendido(1000, 400, 10), regalado(1000, 400, 1)]
let b = calcDoc({ items: CON_REGALO })
check("subtotal NO sube", b.subtotal, 10000)
check("IVA NO sube", b.iva, 1600)
check("total NO sube", b.total, 11600)
check("costo productos SÍ sube", b.costoProductos, 4400)
check("utilidad = base − costo del regalo", b.utilidadNeta, 5600)
let rb = resumenRegalos(CON_REGALO)
check("regalos: piezas", rb.piezas, 1)
check("regalos: costo (pérdida real)", rb.costo, 400)
check("regalos: valor obsequiado", rb.valor, 1000)
check("regalos: margen cedido", rb.margenCedido, 600)
check("cuadre utilidad: base − pérdida", a.utilidadNeta - rb.costo, b.utilidadNeta)
check(
  "descuento efectivo",
  round2(descuentoEfectivoPct({ subtotal: b.subtotal, descuento: 0, valorRegalos: rb.valor })),
  9.09,
)

// ── C. Regalo + descuento 5% (los dos conviven) ────────────────────
console.log("— C. Regalo + 5% de descuento —")
let c = calcDoc({ items: CON_REGALO, descuentoTipo: "pct", descuentoValor: 5 })
check("descuento", c.descuento, 500)
check("IVA sobre base gravable", c.iva, 1520)
check("total", c.total, 11020)
check("utilidad neta", c.utilidadNeta, 5100)
check(
  "descuento efectivo (desc + regalo)",
  round2(descuentoEfectivoPct({ subtotal: c.subtotal, descuento: c.descuento, valorRegalos: rb.valor })),
  13.64,
)

// ── D. Venta 100% cortesía (muestra gratis) ────────────────────────
console.log("— D. Todo regalado —")
const SOLO_REGALO = [regalado(1000, 400, 1)]
let d = calcDoc({ items: SOLO_REGALO })
check("subtotal", d.subtotal, 0)
check("total", d.total, 0)
check("utilidad neta = pérdida pura", d.utilidadNeta, -400)
check("costo del regalo", resumenRegalos(SOLO_REGALO).costo, 400)

// ── E. Regalo sin precio de lista (dato viejo) ─────────────────────
console.log("— E. Regalo sin precio_lista: nunca inventa valor —")
const SIN_LISTA = [{ cantidad: 2, precio_unitario: 0, costo_unitario: 250, es_regalo: true, precio_lista: null }]
const e = resumenRegalos(SIN_LISTA)
check("valor obsequiado", e.valor, 0)
check("costo sí cuenta", e.costo, 500)
check("precio de referencia", precioReferencia(SIN_LISTA[0]), 0)

// ── F. Marcar/desmarcar no pierde el precio ────────────────────────
console.log("— F. Ida y vuelta del toggle de regalo —")
const original = vendido(1498, 600, 3)
const aRegalo = { ...original, ...alternarRegalo(original, true) }
check("al regalar, precio = 0", aRegalo.precio_unitario, 0)
check("al regalar, se congela el precio", aRegalo.precio_lista, 1498)
const deVuelta = { ...aRegalo, ...alternarRegalo(aRegalo, false) }
check("al desmarcar, vuelve el precio", deVuelta.precio_unitario, 1498)
check("al desmarcar, no queda precio_lista", deVuelta.precio_lista, null)

// ── G. Partidas no marcadas nunca cuentan como regalo ──────────────
console.log("— G. Aislamiento —")
check("documento sin regalos: costo 0", resumenRegalos(BASE).costo, 0)
check("documento sin regalos: líneas 0", resumenRegalos(BASE).lineas, 0)
check(
  "una venta de $0 SIN marcar no es regalo",
  resumenRegalos([{ cantidad: 1, precio_unitario: 0, costo_unitario: 99, es_regalo: false }]).costo,
  0,
)

// ── H. Centavos: barrido de cantidades/costos ──────────────────────
let malRedondeo = 0
for (let q = 1; q <= 60; q++) {
  for (const costo of [12.34, 99.99, 133.33, 1498.5]) {
    const r = resumenRegalos([regalado(costo * 2, costo, q)])
    if (r.costo !== round2(r.costo) || r.valor !== round2(r.valor)) malRedondeo++
    if (Math.abs(r.margenCedido - round2(r.valor - r.costo)) > 0.005) malRedondeo++
  }
}
console.log(`${malRedondeo === 0 ? "✓" : "✗ FALLA"}  barrido 240 combinaciones: ${malRedondeo} incoherencias de centavos`)
if (malRedondeo > 0) fails++

console.log(fails === 0 ? "\nTODO OK — regalos verificados" : `\n${fails} FALLAS`)
process.exit(fails === 0 ? 0 : 1)
