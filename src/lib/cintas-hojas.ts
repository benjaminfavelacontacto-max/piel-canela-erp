import sharp from "sharp"

/**
 * Hojas de referencia para la IA: mosaicos numerados (5×4) con las fotos del
 * catálogo de cintas. El número se dibuja con rectángulos (7 segmentos) para no
 * depender de fuentes del servidor. Sin imports de Next/Supabase → se puede
 * probar suelto.
 */

const TILE_W = 240
const TILE_H = 150
const COLS = 5
const ROWS = 4
const POR_HOJA = COLS * ROWS

export type Hoja = { base64: string; desde: number; hasta: number }

// ───────────────────────── números con rectángulos (7 segmentos) ─────────────────────────
const SEG: Record<string, string> = {
  "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc",
  "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abfgcd",
}
const DW = 16 // ancho de un dígito
const DH = 28 // alto
const T = 4 // grosor

function digitoSvg(d: string, x: number, y: number): string {
  const s = SEG[d] ?? ""
  const r = (rx: number, ry: number, w: number, h: number) =>
    `<rect x="${x + rx}" y="${y + ry}" width="${w}" height="${h}" fill="#000"/>`
  let out = ""
  if (s.includes("a")) out += r(0, 0, DW, T)
  if (s.includes("g")) out += r(0, DH / 2 - T / 2, DW, T)
  if (s.includes("d")) out += r(0, DH - T, DW, T)
  if (s.includes("f")) out += r(0, 0, T, DH / 2 + T / 2)
  if (s.includes("b")) out += r(DW - T, 0, T, DH / 2 + T / 2)
  if (s.includes("e")) out += r(0, DH / 2 - T / 2, T, DH / 2 + T / 2)
  if (s.includes("c")) out += r(DW - T, DH / 2 - T / 2, T, DH / 2 + T / 2)
  return out
}

function etiquetaNumeroSvg(n: number, x: number, y: number): string {
  const txt = String(n)
  const w = txt.length * (DW + 6) + 10
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${DH + 12}" rx="5" fill="#fff" stroke="#000" stroke-width="2"/>`
  for (let i = 0; i < txt.length; i++) {
    out += digitoSvg(txt[i], x + 8 + i * (DW + 6), y + 6)
  }
  return out
}

// ───────────────────────── hojas de referencia ─────────────────────────
async function mosaico(url: string | null): Promise<Buffer> {
  const gris = () =>
    sharp({ create: { width: TILE_W, height: TILE_H, channels: 3, background: "#d4d4d8" } })
      .jpeg()
      .toBuffer()
  if (!url) return gris()
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) })
    if (!res.ok) return gris()
    const buf = Buffer.from(await res.arrayBuffer())
    return await sharp(buf)
      .flatten({ background: "#ffffff" })
      .resize(TILE_W, TILE_H, { fit: "cover", position: "centre" })
      .jpeg({ quality: 82 })
      .toBuffer()
  } catch {
    return gris()
  }
}

export async function construirHojas(urls: (string | null)[]): Promise<Hoja[]> {
  // Descarga en tandas para no saturar la red.
  const tiles: Buffer[] = []
  for (let i = 0; i < urls.length; i += 12) {
    tiles.push(...(await Promise.all(urls.slice(i, i + 12).map(mosaico))))
  }
  const hojas: Hoja[] = []
  for (let desde = 0; desde < tiles.length; desde += POR_HOJA) {
    const trozo = tiles.slice(desde, desde + POR_HOJA)
    const filas = Math.ceil(trozo.length / COLS)
    const width = COLS * TILE_W
    const height = filas * TILE_H
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    // Rejilla fina entre mosaicos
    for (let c = 1; c < COLS; c++) svg += `<rect x="${c * TILE_W - 1}" y="0" width="2" height="${height}" fill="#fff"/>`
    for (let f = 1; f < filas; f++) svg += `<rect x="0" y="${f * TILE_H - 1}" width="${width}" height="2" fill="#fff"/>`
    const composites: sharp.OverlayOptions[] = []
    trozo.forEach((buf, i) => {
      const x = (i % COLS) * TILE_W
      const y = Math.floor(i / COLS) * TILE_H
      composites.push({ input: buf, left: x, top: y })
      svg += etiquetaNumeroSvg(desde + i + 1, x + 4, y + 4)
    })
    svg += "</svg>"
    composites.push({ input: Buffer.from(svg), left: 0, top: 0 })
    const jpg = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
      .composite(composites)
      .jpeg({ quality: 80 })
      .toBuffer()
    hojas.push({ base64: jpg.toString("base64"), desde: desde + 1, hasta: desde + trozo.length })
  }
  return hojas
}

