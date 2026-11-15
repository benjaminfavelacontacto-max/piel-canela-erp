/**
 * Utilidades de foto del lado del NAVEGADOR (las usan los paneles «desde foto»
 * de cotizaciones). No importar desde código de servidor.
 */

export type Foto = { base64: string; preview: string }

const MAX_LADO = 1600

/** Redimensiona y recomprime a JPEG en el navegador (las fotos de celular pesan 4–10 MB). */
export async function comprimir(file: File): Promise<Foto> {
  const bmp = await createImageBitmap(file)
  const escala = Math.min(1, MAX_LADO / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * escala))
  const h = Math.max(1, Math.round(bmp.height * escala))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("No se pudo procesar la imagen")
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  const url = canvas.toDataURL("image/jpeg", 0.8)
  return { base64: url.split(",")[1] ?? "", preview: url }
}
