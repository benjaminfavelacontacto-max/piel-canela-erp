"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { createHash, timingSafeEqual } from "node:crypto"
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
} from "@/lib/auth"
import { checkRateLimit, resetRateLimit, clientIp } from "@/lib/rate-limit"

export type LoginState = { error?: string }

/**
 * Compara la contraseña en tiempo constante para no filtrar información por el
 * tiempo de respuesta (timing-attack). Hasheamos ambas a 32 bytes antes de
 * `timingSafeEqual` para que las longitudes coincidan y la comparación no
 * delate el largo de la contraseña.
 */
function passwordsMatch(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input).digest()
  const b = createHash("sha256").update(expected).digest()
  return timingSafeEqual(a, b)
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "")
  const expected = process.env.ERP_PASSWORD

  if (!expected) {
    return {
      error:
        "El sistema no tiene contraseña configurada (falta ERP_PASSWORD).",
    }
  }

  // Límite anti fuerza-bruta: 5 intentos por IP cada 10 minutos.
  const ip = clientIp(await headers())
  const rl = checkRateLimit(`login:${ip}`, 5, 10 * 60 * 1000)
  if (!rl.allowed) {
    const mins = Math.max(1, Math.ceil(rl.retryAfter / 60))
    return {
      error: `Demasiados intentos. Espera ${mins} minuto${mins === 1 ? "" : "s"} e inténtalo de nuevo.`,
    }
  }

  if (!passwordsMatch(password, expected)) {
    // Pequeño retraso extra para frenar intentos por fuerza bruta.
    await new Promise((r) => setTimeout(r, 600))
    return { error: "Contraseña incorrecta." }
  }

  // Acceso correcto → limpiar el contador de esa IP.
  resetRateLimit(`login:${ip}`)

  const token = await createSessionToken()
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  })

  redirect("/")
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
  redirect("/login")
}
