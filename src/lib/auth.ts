/**
 * Candado de acceso del ERP (contraseña única compartida).
 *
 * La sesión es un JWT firmado con HMAC (HS256) que guardamos en una cookie
 * httpOnly. El middleware lo verifica en cada request al dashboard.
 *
 * Edge-compatible: `jose` usa Web Crypto, así que funciona dentro del
 * middleware de Next.js. NO importar `node:crypto` aquí.
 */
import { SignJWT, jwtVerify } from "jose"

/** Nombre de la cookie de sesión. */
export const SESSION_COOKIE = "pc_session"

/** Duración de la sesión: 30 días. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30

const ALG = "HS256"

function getSecret(): Uint8Array {
  const secret = process.env.ERP_AUTH_SECRET
  if (!secret || secret.length < 16) {
    throw new Error(
      "ERP_AUTH_SECRET no está configurada (o es muy corta). Revisa .env.local / Vercel.",
    )
  }
  return new TextEncoder().encode(secret)
}

/** Firma un token de sesión nuevo. Llamar tras validar la contraseña. */
export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: "erp" })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret())
}

/**
 * Verifica el token de la cookie. Devuelve `true` solo si la firma y la
 * expiración son válidas. Cualquier error (token manipulado, expirado, secret
 * faltante) cuenta como NO autenticado — fail closed.
 */
export async function verifySessionToken(
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false
  try {
    await jwtVerify(token, getSecret(), { algorithms: [ALG] })
    return true
  } catch {
    return false
  }
}
