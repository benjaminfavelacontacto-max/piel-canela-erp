/**
 * Probabilidad de cierre de cotización.
 * Función pura, basada en heurísticas: estatus, recurrencia cliente,
 * días desde apertura, vigencia, conversión histórica del cliente.
 */

export type ProbabilidadLabel = "alta" | "media" | "baja" | "convertida" | "perdida"

export type ProbResult = {
  score: number // 0..100
  label: ProbabilidadLabel
  diasAbierta: number
  diasParaVencer: number | null
}

export type ClienteHist = {
  ventasCount: number
  cotsCount: number
  cotsConvertidasCount: number
}

const DAY_MS = 1000 * 60 * 60 * 24

export function calcularProbabilidad(
  cot: {
    fecha: string
    valida_hasta: string | null
    estatus: string
    cliente_id: string | null
  },
  hoy: Date,
  cliente: ClienteHist | null,
  esConvertida: boolean,
): ProbResult {
  const fechaCot = new Date(cot.fecha)
  const diasAbierta = Math.max(
    0,
    Math.round((hoy.getTime() - fechaCot.getTime()) / DAY_MS),
  )
  const diasParaVencer = cot.valida_hasta
    ? Math.round(
        (new Date(cot.valida_hasta).getTime() - hoy.getTime()) / DAY_MS,
      )
    : null

  // Estados terminales
  if (esConvertida) {
    return { score: 100, label: "convertida", diasAbierta, diasParaVencer }
  }
  if (cot.estatus === "rechazada" || cot.estatus === "vencida") {
    return { score: 0, label: "perdida", diasAbierta, diasParaVencer }
  }

  // ─── Score base ─────────────────────────────────────────────────
  let score = 30

  // 1) Recurrencia del cliente (peso fuerte)
  if (cliente) {
    if (cliente.ventasCount >= 3) score += 35
    else if (cliente.ventasCount >= 1) score += 20
    // nuevo: 0 boost
    // Tasa histórica de conversión
    if (cliente.cotsCount > 0) {
      const tasa = cliente.cotsConvertidasCount / cliente.cotsCount
      score += Math.round(tasa * 15) // hasta +15
    }
  }

  // 2) Frescura (días desde apertura)
  if (diasAbierta < 7) score += 25
  else if (diasAbierta < 21) score += 15
  else if (diasAbierta < 45) score += 0
  else if (diasAbierta < 90) score -= 10
  else score -= 25

  // 3) Estatus actual
  if (cot.estatus === "enviada") score += 10
  else if (cot.estatus === "borrador") score -= 5

  // 4) Vigencia
  if (diasParaVencer !== null) {
    if (diasParaVencer < 0) score -= 30 // ya vencida (aunque estatus no sea "vencida")
    else if (diasParaVencer < 7) score -= 5
  }

  score = Math.max(0, Math.min(100, score))
  const label: ProbabilidadLabel =
    score >= 60 ? "alta" : score >= 35 ? "media" : "baja"

  return { score, label, diasAbierta, diasParaVencer }
}

export function classifyEstadoComercial(
  estatus: string,
  esConvertida: boolean,
  diasParaVencer: number | null,
): "convertida" | "activa" | "seguimiento" | "vencida" | "perdida" {
  if (esConvertida) return "convertida"
  if (estatus === "rechazada") return "perdida"
  if (
    estatus === "vencida" ||
    (diasParaVencer !== null && diasParaVencer < 0)
  )
    return "vencida"
  if (estatus === "borrador") return "seguimiento"
  // enviada y vigente
  if (diasParaVencer !== null && diasParaVencer < 7) return "seguimiento"
  return "activa"
}
