// Verificación numérica de las fórmulas de cotización (espejo exacto de
// cotizacion-form.tsx). Corre con: node scripts/verify-cotizacion-math.mjs
const round2 = (n) => Math.round(n * 100) / 100

function calc({ items, descuentoTipo, descuentoValor, ivaActivo }) {
  const subtotal = round2(items.reduce((s, it) => s + it.subtotal, 0))
  const descuento = round2(
    descuentoTipo === "pct"
      ? Math.max(0, Math.min(subtotal, subtotal * (descuentoValor / 100)))
      : Math.max(0, Math.min(subtotal, descuentoValor)),
  )
  const baseGravable = round2(subtotal - descuento)
  const iva = ivaActivo ? round2(baseGravable * 0.16) : 0
  const total = round2(baseGravable + iva)
  return { subtotal, descuento, iva, total }
}

const item = (precio, cantidad) => ({ subtotal: precio * cantidad })

// Pedido real Mithra Sun & Spa (PC-250726012): 14 líneas, 44 pzs
const MITHRA = [
  item(2113, 4), // Ametista UV 1        8,452
  item(1980, 4), // Potência Ultra       7,920
  item(1498, 4), // Café Fit             5,992
  item(1440, 4), // Ametista UV II       5,760
  item(2243, 6), // Potência 3.0        13,458
  item(150, 2), item(150, 2), item(150, 2), item(150, 2), // cintas 9mm x2
  item(150, 1), item(150, 1), item(150, 1), item(150, 1), // cintas 9mm x1
  item(150, 10), // Cinta Naranja        1,500
]

let fails = 0
function check(name, got, want) {
  const ok = Math.abs(got - want) < 0.005
  if (!ok) fails++
  console.log(`${ok ? "✓" : "✗ FALLA"}  ${name}: ${got.toFixed(2)} (esperado ${want.toFixed(2)})`)
}

console.log("— Mithra con 5% (correcto tras el fix) —")
let r = calc({ items: MITHRA, descuentoTipo: "pct", descuentoValor: 5, ivaActivo: true })
check("subtotal", r.subtotal, 44882.0)
check("descuento 5%", r.descuento, 2244.1)
check("IVA 16% de (44,882−2,244.10)", r.iva, 6822.06)
check("total", r.total, 49459.96)
check("coherencia total = sub−desc+iva", r.total, r.subtotal - r.descuento + r.iva)

console.log("— Mithra sin descuento —")
r = calc({ items: MITHRA, descuentoTipo: "monto", descuentoValor: 0, ivaActivo: true })
check("descuento", r.descuento, 0)
check("IVA", r.iva, 7181.12)
check("total", r.total, 52063.12)

console.log("— Mithra 5% sin IVA —")
r = calc({ items: MITHRA, descuentoTipo: "pct", descuentoValor: 5, ivaActivo: false })
check("total", r.total, 42637.9)

console.log("— Monto fijo $1,705.40 (reproduce el PDF malo) —")
r = calc({ items: MITHRA, descuentoTipo: "monto", descuentoValor: 1705.4, ivaActivo: true })
check("IVA (como en el PDF)", r.iva, 6908.26)
check("total (como en el PDF)", r.total, 50084.86)

console.log("— Clamps y bordes —")
r = calc({ items: MITHRA, descuentoTipo: "pct", descuentoValor: 150, ivaActivo: true })
check("pct>100 se limita al subtotal", r.descuento, 44882.0)
check("total con 100%+", r.total, 0)
r = calc({ items: MITHRA, descuentoTipo: "monto", descuentoValor: 99999, ivaActivo: true })
check("monto>subtotal se limita", r.descuento, 44882.0)
r = calc({ items: MITHRA, descuentoTipo: "monto", descuentoValor: -50, ivaActivo: true })
check("descuento negativo → 0", r.descuento, 0)

console.log("— Redondeo a centavos (pct con decimales) —")
r = calc({ items: MITHRA, descuentoTipo: "pct", descuentoValor: 7.5, ivaActivo: true })
check("descuento 7.5%", r.descuento, 3366.15)
check("iva", r.iva, 6642.54)
check("total exacto en centavos", r.total, 48158.39)
check("coherencia", r.total, r.subtotal - r.descuento + r.iva)

// Barrido: coherencia centavo-exacta para 2,000 combinaciones
let sweepBad = 0
for (let p = 0; p <= 100; p += 0.05) {
  const x = calc({ items: MITHRA, descuentoTipo: "pct", descuentoValor: p, ivaActivo: true })
  const coherente =
    Math.abs(x.total - (x.subtotal - x.descuento + x.iva)) < 0.005 &&
    x.descuento === round2(x.descuento) && x.iva === round2(x.iva) && x.total === round2(x.total)
  if (!coherente) sweepBad++
}
console.log(`${sweepBad === 0 ? "✓" : "✗ FALLA"}  barrido 0–100% en pasos de 0.05: ${sweepBad} incoherencias`)
if (sweepBad > 0) fails++

console.log(fails === 0 ? "\nTODO OK — cálculos verificados" : `\n${fails} FALLAS`)
process.exit(fails === 0 ? 0 : 1)
