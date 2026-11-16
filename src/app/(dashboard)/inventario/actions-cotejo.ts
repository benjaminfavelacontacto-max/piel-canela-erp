"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { identificarCintas, ErrorConfig, type GrupoIdentificado } from "@/lib/cintas-foto-ia"
import type { Presentacion } from "@/lib/cintas-modelos"

const PRES_VALIDAS: Presentacion[] = ["entera", "9-9", "6-12"]
const MAX_BASE64 = 3_000_000 // ~2.2 MB reales por foto (el navegador las comprime a ~300 KB)

export type ResultadoConteoFotos =
  | { ok: true; grupos: GrupoIdentificado[] }
  | { ok: false; error: string }

/**
 * Cuenta las cintas de UNA presentación a partir de 1–3 fotos (cotejo de inventario).
 * Reutiliza la misma IA de «cintas desde foto»; la diferencia es que aquí todas las
 * fotos son de la misma presentación y se permite reportar muchos modelos (más tokens).
 * Nada se guarda: la foto viaja a la IA y se descarta.
 */
export async function contarCintasDesdeFotos(
  presentacion: string,
  fotos: { base64: string }[],
): Promise<ResultadoConteoFotos> {
  if (!PRES_VALIDAS.includes(presentacion as Presentacion)) {
    return { ok: false, error: "Presentación inválida." }
  }
  if (!Array.isArray(fotos) || fotos.length < 1 || fotos.length > 3) {
    return { ok: false, error: "Sube de 1 a 3 fotos por presentación." }
  }
  for (const f of fotos) {
    if (typeof f.base64 !== "string" || f.base64.length < 100 || f.base64.length > MAX_BASE64) {
      return { ok: false, error: "Una de las fotos es demasiado grande o está vacía." }
    }
    if (!/^[A-Za-z0-9+/=]+$/.test(f.base64)) {
      return { ok: false, error: "Formato de foto inválido." }
    }
  }
  try {
    const { grupos } = await identificarCintas(
      fotos.map((f) => ({ presentacion: presentacion as Presentacion, base64: f.base64 })),
      { maxTokens: 16000 },
    )
    return { ok: true, grupos }
  } catch (e) {
    if (e instanceof ErrorConfig) return { ok: false, error: e.message }
    console.error("[cotejo-fotos] error", e)
    const msg = e instanceof Error ? e.message : "Error desconocido"
    return { ok: false, error: "No se pudo contar las cintas: " + msg.slice(0, 180) }
  }
}

export type AjusteCotejo = { productoId: string; contado: number }

export type ResultadoAplicarCotejo =
  | { ok: true; aplicados: number; sinCambio: number; fallidos: { productoId: string; error: string }[] }
  | { ok: false; error: string }

/**
 * Aplica el conteo físico confirmado: deja `inventario.stock_actual` = lo contado.
 * (inventario.estatus es GENERATED → no se escribe; stock_inicial es NOT NULL → en fila
 * nueva se iguala al stock.) Cada cambio queda en la bitácora `ajustes_inventario` con
 * origen "cotejo" (no fatal si la tabla aún no existe).
 */
export async function aplicarCotejoInventario(
  ajustes: AjusteCotejo[],
): Promise<ResultadoAplicarCotejo> {
  if (!Array.isArray(ajustes) || ajustes.length === 0) {
    return { ok: false, error: "No hay ajustes que aplicar." }
  }
  if (ajustes.length > 1000) return { ok: false, error: "Demasiados ajustes en una sola operación." }

  // Normaliza y quita duplicados (gana el último).
  const porProducto = new Map<string, number>()
  for (const a of ajustes) {
    const n = Number(a.contado)
    if (typeof a.productoId !== "string" || !a.productoId || !Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Hay un conteo inválido." }
    }
    porProducto.set(a.productoId, Math.min(100000, Math.round(n)))
  }

  const admin = createAdminClient()
  const ids = [...porProducto.keys()]
  const { data: filas, error: errLeer } = await admin
    .from("inventario")
    .select("id, producto_id, stock_actual")
    .in("producto_id", ids)
  if (errLeer) return { ok: false, error: "inventario: " + errLeer.message }
  const existentes = new Map(
    ((filas ?? []) as { id: string; producto_id: string; stock_actual: number | null }[]).map((f) => [
      f.producto_id,
      f,
    ]),
  )

  let aplicados = 0
  let sinCambio = 0
  const fallidos: { productoId: string; error: string }[] = []
  const bitacora: { producto_id: string; stock_antes: number; stock_despues: number; origen: string }[] = []

  for (const [productoId, contado] of porProducto) {
    const fila = existentes.get(productoId)
    const antes = Number(fila?.stock_actual ?? 0)
    if (fila && antes === contado) {
      sinCambio++
      continue
    }
    if (fila) {
      const { error } = await admin.from("inventario").update({ stock_actual: contado }).eq("id", fila.id)
      if (error) {
        fallidos.push({ productoId, error: error.message })
        continue
      }
    } else {
      const { error } = await admin
        .from("inventario")
        .insert({ producto_id: productoId, stock_inicial: contado, stock_actual: contado })
      if (error) {
        fallidos.push({ productoId, error: error.message })
        continue
      }
    }
    aplicados++
    bitacora.push({ producto_id: productoId, stock_antes: antes, stock_despues: contado, origen: "cotejo" })
  }

  if (bitacora.length > 0) {
    const { error: logErr } = await admin.from("ajustes_inventario").insert(bitacora)
    if (logErr) {
      console.error(
        "[aplicarCotejoInventario] bitácora ajustes_inventario (¿falta aplicar scripts/ajustes-inventario.sql?):",
        logErr.message,
      )
    }
  }

  revalidatePath("/inventario")
  revalidatePath("/inventario/cotejar")
  return { ok: true, aplicados, sinCambio, fallidos }
}
