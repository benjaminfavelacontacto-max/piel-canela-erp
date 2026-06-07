/**
 * Documentos adjuntos a pedidos (comprobantes de pago, facturas).
 * Bucket PRIVADO `documentos-pedidos` — lectura vía signed URLs server-side.
 * Server-only: usa el admin client (service_role). No importar en el cliente.
 */
import { createAdminClient } from "@/lib/supabase/admin"

export const DOCS_BUCKET = "documentos-pedidos"

const TIPOS_PERMITIDOS = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export type SubirResult =
  | { ok: true; filename: string }
  | { ok: false; error: string }

/**
 * Valida y sube un archivo al bucket privado. `prefijo` arma el nombre
 * (p.ej. "pago-<id>" o "doc-<pedidoId>"). Devuelve el filename guardado.
 */
export async function subirDocumento(
  file: File | null,
  prefijo: string,
): Promise<SubirResult> {
  if (!file || file.size === 0) return { ok: false, error: "No se seleccionó archivo" }
  if (!TIPOS_PERMITIDOS.includes(file.type))
    return { ok: false, error: "Solo PDF, JPG, PNG o WebP" }
  if (file.size > MAX_SIZE) return { ok: false, error: "El archivo pesa más de 10 MB" }

  const buffer = new Uint8Array(await file.arrayBuffer())
  const ext = (file.name.split(".").pop() ?? "pdf").toLowerCase()
  const filename = `${prefijo}-${Date.now()}.${ext}`
  const admin = createAdminClient()
  const { error } = await admin.storage
    .from(DOCS_BUCKET)
    .upload(filename, buffer, { contentType: file.type, upsert: true })
  if (error) return { ok: false, error: error.message }
  return { ok: true, filename }
}

/** Signed URL temporal (1 h) para ver/descargar un documento privado. */
export async function getDocumentoSignedUrl(
  filename: string | null,
): Promise<string | null> {
  if (!filename) return null
  const admin = createAdminClient()
  const { data } = await admin.storage
    .from(DOCS_BUCKET)
    .createSignedUrl(filename, 3600)
  return data?.signedUrl ?? null
}

/** Borra un documento del bucket (ignora errores — best effort). */
export async function borrarDocumento(filename: string | null): Promise<void> {
  if (!filename) return
  const admin = createAdminClient()
  await admin.storage.from(DOCS_BUCKET).remove([filename])
}
