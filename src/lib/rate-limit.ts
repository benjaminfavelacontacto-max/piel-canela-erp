/**
 * Rate limiter in-memory por clave (típicamente IP).
 *
 * Best-effort: el estado vive en el proceso. Con Fluid Compute las instancias
 * se reúsan, así que frena ráfagas reales; pero NO es distribuido entre
 * regiones/instancias — para una capa dura, complementar con una regla de
 * rate limit en Vercel Firewall (WAF) sobre /login y /order.
 *
 * Server-only (mantiene un Map de módulo). NO importar desde el middleware Edge.
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export type RateLimitResult = {
  allowed: boolean
  /** Intentos restantes en la ventana actual. */
  remaining: number
  /** Segundos hasta que la ventana se reinicia (0 si está permitido). */
  retryAfter: number
}

/**
 * Registra un intento para `key` y dice si está permitido.
 * @param key      identificador, p.ej. `login:1.2.3.4`
 * @param limit    intentos permitidos dentro de la ventana
 * @param windowMs duración de la ventana en milisegundos
 */
export function checkRateLimit(
  key: string,
  limit = 5,
  windowMs = 10 * 60 * 1000,
): RateLimitResult {
  const now = Date.now()

  // Purga perezosa: evita que el Map crezca sin límite ante muchas IPs.
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) {
      if (now > b.resetAt) buckets.delete(k)
    }
  }

  const bucket = buckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, retryAfter: 0 }
  }

  bucket.count++
  const allowed = bucket.count <= limit
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    retryAfter: allowed ? 0 : Math.ceil((bucket.resetAt - now) / 1000),
  }
}

/** Limpia el contador de `key` (p.ej. tras un acceso exitoso). */
export function resetRateLimit(key: string): void {
  buckets.delete(key)
}

/**
 * Extrae la IP del cliente de un objeto `Headers`. En Vercel viene en
 * `x-forwarded-for` (lista separada por comas; el primer valor es el cliente).
 * Devuelve `"unknown"` si no hay info (p.ej. en `next dev` sin proxy).
 */
export function clientIp(h: Pick<Headers, "get">): string {
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  )
}
