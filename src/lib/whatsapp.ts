/**
 * Helpers de WhatsApp (México). wa.me exige el número en formato internacional
 * sin "+" ni espacios: 52 + 10 dígitos.
 */
export function normalizarTelefonoMx(raw: string | null | undefined): string | null {
  let d = (raw ?? "").replace(/\D/g, "")
  if (!d) return null
  // 521XXXXXXXXXX (formato móvil antiguo) → 52XXXXXXXXXX
  if (d.length === 13 && d.startsWith("521")) d = "52" + d.slice(3)
  // 10 dígitos nacionales → anteponer lada de país
  if (d.length === 10) d = "52" + d
  // Debe quedar en 52 + 10 dígitos
  if (d.length !== 12 || !d.startsWith("52")) return null
  return d
}

/** Enlace a un chat de WhatsApp con mensaje prellenado (el teléfono es opcional). */
export function whatsappUrl(telefono: string | null | undefined, texto: string): string {
  const tel = normalizarTelefonoMx(telefono)
  const q = encodeURIComponent(texto)
  return tel ? `https://wa.me/${tel}?text=${q}` : `https://wa.me/?text=${q}`
}
