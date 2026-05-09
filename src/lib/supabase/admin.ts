import { createClient } from "@supabase/supabase-js"

/**
 * Admin client que usa el service role key — bypassa RLS.
 *
 * USO ESTRICTAMENTE SERVER-SIDE: nunca importes este archivo desde un
 * componente client (`"use client"`). El service role key vive sólo en
 * `.env.local` y no debe llegar al bundle del navegador.
 *
 * Útil para queries en server components/actions sobre tablas donde RLS
 * está habilitado pero la app no tiene auth de usuario aún (ej. socios,
 * venta_socios). Cuando agregues auth, migra estas queries al server
 * client normal con políticas basadas en `auth.uid()`.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
