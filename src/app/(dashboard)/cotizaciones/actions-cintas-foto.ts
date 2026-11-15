"use server"

import { identificarCintas, ErrorConfig, type GrupoIdentificado } from "@/lib/cintas-foto-ia"
import type { Presentacion } from "@/lib/cintas-modelos"

const PRES_VALIDAS: Presentacion[] = ["entera", "9-9", "6-12"]
const MAX_BASE64 = 3_000_000 // ~2.2 MB reales por foto (el cliente las comprime a ~300 KB)

export type ResultadoFotoCintas =
  | { ok: true; grupos: GrupoIdentificado[] }
  | { ok: false; error: string }

/**
 * Identifica las cintas de hasta 3 fotos (una por presentación) para
 * precargarlas en una cotización. Las fotos llegan YA comprimidas a JPEG desde
 * el navegador, como base64 (sin el prefijo `data:`). Nada se guarda: la foto
 * sólo viaja a la IA y se descarta.
 */
export async function identificarCintasDesdeFotos(
  fotos: { presentacion: string; base64: string }[],
): Promise<ResultadoFotoCintas> {
  if (!Array.isArray(fotos) || fotos.length < 1 || fotos.length > 3) {
    return { ok: false, error: "Sube de 1 a 3 fotos." }
  }
  const limpias: { presentacion: Presentacion; base64: string }[] = []
  const vistas = new Set<string>()
  for (const f of fotos) {
    if (!PRES_VALIDAS.includes(f.presentacion as Presentacion) || vistas.has(f.presentacion)) {
      return { ok: false, error: "Presentación de foto inválida." }
    }
    if (typeof f.base64 !== "string" || f.base64.length < 100 || f.base64.length > MAX_BASE64) {
      return { ok: false, error: "Una de las fotos es demasiado grande o está vacía." }
    }
    if (!/^[A-Za-z0-9+/=]+$/.test(f.base64)) {
      return { ok: false, error: "Formato de foto inválido." }
    }
    vistas.add(f.presentacion)
    limpias.push({ presentacion: f.presentacion as Presentacion, base64: f.base64 })
  }

  try {
    const { grupos } = await identificarCintas(limpias)
    return { ok: true, grupos }
  } catch (e) {
    if (e instanceof ErrorConfig) return { ok: false, error: e.message }
    console.error("[cintas-foto] error", e)
    const msg = e instanceof Error ? e.message : "Error desconocido"
    return { ok: false, error: "No se pudo identificar las cintas: " + msg.slice(0, 180) }
  }
}
