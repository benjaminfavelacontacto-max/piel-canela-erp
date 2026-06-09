import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Cliente Supabase para SERVER components / server actions.
 *
 * ⚠️ Usa el SERVICE ROLE key → bypassa RLS (acceso total a la BD).
 *
 * Es seguro porque:
 *  - Este archivo es server-only (importa `next/headers`); el key NUNCA
 *    se incluye en el bundle del navegador.
 *  - Todas las rutas que lo usan viven detrás del candado JWT
 *    (ver `src/middleware.ts`). Las rutas públicas (/order) NO usan este
 *    cliente — usan server actions dedicadas con validación + rate-limit.
 *
 * NO importar desde componentes `"use client"` ni desde rutas públicas sin
 * autenticación. Antes este cliente usaba el ANON key, pero con RLS activado
 * el anon ya no tiene acceso a las tablas internas (ver scripts/enable-rls.sql).
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a Server Component — middleware will refresh sessions.
          }
        },
      },
    },
  )
}
