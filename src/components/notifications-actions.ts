"use server"

import { createAdminClient } from "@/lib/supabase/admin"

export interface NotifDatos {
  cotizacion_numero?: string
  cotizacion_id?: string
  cliente_nombre?: string
  cliente_negocio?: string
  cliente_telefono?: string
  cliente_email?: string
  cliente_ciudad?: string
  items_count?: number
  subtotal?: number
  notas?: string
  url?: string
  [key: string]: unknown
}

export interface Notificacion {
  id: string
  tipo: string
  titulo: string
  mensaje: string
  datos: NotifDatos
  leida: boolean
  created_at: string
}

/**
 * Server actions para el campanita de notificaciones.
 *
 * Antes el componente leía/escribía `notificaciones` (que contiene PII de
 * clientes) directo desde el navegador con el anon key. Con RLS activado eso
 * ya no es posible, así que estas acciones corren server-side con service role.
 * El componente las consulta por polling (cada 8s) en vez de Realtime.
 */
export async function getNotificacionesNoLeidas(): Promise<Notificacion[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("notificaciones")
    .select("*")
    .eq("leida", false)
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) {
    console.error("[notificaciones] error cargando:", error.message)
    return []
  }
  return (data ?? []) as Notificacion[]
}

export async function marcarNotificacionLeida(id: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from("notificaciones").update({ leida: true }).eq("id", id)
}

export async function marcarTodasLeidas(): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from("notificaciones")
    .update({ leida: true })
    .eq("leida", false)
}
