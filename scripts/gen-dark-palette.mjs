// Genera el bloque `.dark { --color-<tono>-<paso>: … }` de globals.css.
//
// Por qué existe: la app usa ~3,400 clases de la paleta de Tailwind (text-gray-600,
// bg-emerald-50, border-amber-200…). En vez de reescribirlas con `dark:` una por
// una, el tema oscuro REASIGNA las variables de la paleta bajo `.dark`: las
// utilidades de Tailwind leen `var(--color-*)`, así que todo cambia solo.
//
// Uso:  node scripts/gen-dark-palette.mjs   → imprime el CSS (pégalo entre los
//       marcadores BEGIN/END GENERATED de src/app/globals.css).
//
// Reglas del mapeo (claro → oscuro):
//   neutros (gray/slate/zinc/neutral/stone): rampa propia, 50 = superficie sutil
//     un poco MÁS CLARA que la tarjeta (hover/zebra), 900 = texto principal.
//   tonos de color: 50/100 = tinte translúcido, 200/300 = borde/anillo translúcido,
//     400/500 = igual, 600→500, 700→400, 800→300, 900→200 (texto legible sobre oscuro).
import { readFileSync } from "node:fs"

const theme = readFileSync(new URL("../node_modules/tailwindcss/theme.css", import.meta.url), "utf8")
const val = (name) => {
  const m = theme.match(new RegExp(`--color-${name}:\\s*(oklch\\([^)]*\\))`))
  if (!m) throw new Error("sin valor para " + name)
  return m[1]
}
const withAlpha = (oklch, a) => oklch.replace(/\)$/, ` / ${Math.round(a * 100)}%)`)

const NEUTRAL_DARK = {
  50: "#181E21", 100: "#1E2529", 200: "#272F34", 300: "#353F45", 400: "#82908D",
  500: "#9AA8A5", 600: "#B4BFBC", 700: "#C9D1CF", 800: "#DCE3E1", 900: "#E8EEEC", 950: "#F4F7F6",
}
const NEUTRALS = ["gray", "slate", "zinc", "neutral", "stone"]
const HUES = ["red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose"]

const out = []
out.push("  /* Neutros: rampa oscura propia */")
for (const n of NEUTRALS) {
  for (const [step, hex] of Object.entries(NEUTRAL_DARK)) out.push(`  --color-${n}-${step}: ${hex};`)
}
for (const h of HUES) {
  out.push(`  /* ${h} */`)
  const L = (s) => val(`${h}-${s}`)
  const rows = {
    50: withAlpha(L(500), 0.1),
    100: withAlpha(L(500), 0.16),
    200: withAlpha(L(400), 0.3),
    300: withAlpha(L(400), 0.42),
    600: L(500),
    700: L(400),
    800: L(300),
    900: L(200),
    950: L(100),
  }
  for (const [s, v] of Object.entries(rows)) out.push(`  --color-${h}-${s}: ${v};`)
}
console.log(out.join("\n"))
