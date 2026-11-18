import { cookies, headers } from "next/headers"
import { z } from "zod"
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import { responder } from "@/lib/asistente/agente"

/**
 * POST /api/asistente — chat del asistente con IA.
 * Transmite la respuesta como NDJSON (una línea JSON por evento, ver `tipos.ts`).
 * Protegida por el candado JWT (middleware + verificación aquí) y con tope de ritmo.
 */
export const maxDuration = 120

const Cuerpo = z.object({
  mensajes: z
    .array(z.object({ rol: z.enum(["user", "assistant"]), texto: z.string().min(1).max(6000) }))
    .min(1)
    .max(24),
})

export async function POST(req: Request) {
  const jar = await cookies()
  if (!(await verifySessionToken(jar.get(SESSION_COOKIE)?.value))) {
    return Response.json({ error: "Tu sesión expiró. Vuelve a iniciar sesión." }, { status: 401 })
  }

  // 40 preguntas cada 10 min por IP: de sobra para uso normal y frena un ciclo accidental que gaste saldo.
  const limite = checkRateLimit("asistente:" + clientIp(await headers()), 40, 10 * 60 * 1000)
  if (!limite.allowed) {
    return Response.json(
      { error: "Demasiadas preguntas seguidas. Intenta de nuevo en " + Math.ceil(limite.retryAfter / 60) + " min." },
      { status: 429 },
    )
  }

  const cuerpo = Cuerpo.safeParse(await req.json().catch(() => null))
  if (!cuerpo.success) return Response.json({ error: "Solicitud inválida." }, { status: 400 })
  const mensajes = cuerpo.data.mensajes
  while (mensajes.length && mensajes[0].rol !== "user") mensajes.shift()
  if (!mensajes.length || mensajes[mensajes.length - 1].rol !== "user") {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const evento of responder(mensajes, req.signal)) {
          controller.enqueue(encoder.encode(JSON.stringify(evento) + "\n"))
        }
      } catch (e) {
        if (!req.signal.aborted) console.error("[asistente] stream", e)
      } finally {
        try {
          controller.close()
        } catch {
          // el cliente ya cerró la conexión
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  })
}
