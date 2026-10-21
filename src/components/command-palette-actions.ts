"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getInternalClienteIds } from "@/lib/internal-clientes"

export type ResultadoBusqueda = {
  tipo: "cliente" | "producto" | "venta" | "cotizacion"
  id: string
  titulo: string
  subtitulo: string
  href: string
}

/** Quita caracteres que rompen los filtros `or(...)` / `ilike` de PostgREST. */
function sanear(q: string): string {
  return q.replace(/[%,()*\\:"']/g, " ").replace(/\s+/g, " ").trim()
}

const fmtMXN = (v: number) =>
  (Number(v) || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })

/**
 * Búsqueda global (⌘K): clientes, productos, ventas y cotizaciones.
 * Los clientes internos (Piel Canela) no aparecen: no son CRM ni ventas reales.
 */
export async function buscarGlobal(consulta: string): Promise<ResultadoBusqueda[]> {
  const q = sanear(consulta)
  if (q.length < 2) return []
  const like = `%${q}%`
  const admin = createAdminClient()

  const [internos, cli, prod, ven, cot] = await Promise.all([
    getInternalClienteIds(),
    admin
      .from("clientes")
      .select("id, nombre, nombre_negocio, telefono, ciudad")
      .or(`nombre.ilike.${like},nombre_negocio.ilike.${like},telefono.ilike.${like}`)
      .limit(8),
    admin
      .from("productos")
      .select("sku, nombre, nombre_display, peso")
      .eq("activo", true)
      .or(`sku.ilike.${like},nombre.ilike.${like},nombre_display.ilike.${like}`)
      .limit(6),
    admin
      .from("ventas")
      .select("id, numero, fecha, total, cliente_id, clientes(nombre, nombre_negocio)")
      .ilike("numero", like)
      .order("fecha", { ascending: false })
      .limit(8),
    admin
      .from("cotizaciones")
      .select("id, numero, fecha, total, estatus, cliente_id, clientes(nombre, nombre_negocio)")
      .ilike("numero", like)
      .order("fecha", { ascending: false })
      .limit(8),
  ])

  const out: ResultadoBusqueda[] = []

  for (const c of (cli.data ?? []).filter((c) => !internos.has(c.id as string)).slice(0, 5)) {
    out.push({
      tipo: "cliente",
      id: c.id as string,
      titulo: (c.nombre_negocio as string | null) ?? (c.nombre as string),
      subtitulo: [c.nombre_negocio ? c.nombre : null, c.ciudad, c.telefono]
        .filter(Boolean)
        .join(" · "),
      href: `/clientes/${c.id}`,
    })
  }
  for (const p of prod.data ?? []) {
    out.push({
      tipo: "producto",
      id: p.sku as string,
      titulo: (p.nombre_display as string | null) ?? (p.nombre as string),
      subtitulo: [p.sku, p.peso].filter(Boolean).join(" · "),
      href: `/inventario?producto=${encodeURIComponent(p.sku as string)}`,
    })
  }

  type Fila = {
    id: string
    numero: string
    fecha: string
    total: number
    cliente_id: string | null
    estatus?: string
    clientes: { nombre: string; nombre_negocio: string | null } | null
  }
  const cliNombre = (f: Fila) => f.clientes?.nombre_negocio ?? f.clientes?.nombre ?? "Sin cliente"
  for (const v of ((ven.data ?? []) as unknown as Fila[])
    .filter((v) => !v.cliente_id || !internos.has(v.cliente_id))
    .slice(0, 5)) {
    out.push({
      tipo: "venta",
      id: v.id,
      titulo: v.numero,
      subtitulo: `${cliNombre(v)} · ${fmtMXN(v.total)} · ${v.fecha}`,
      href: `/ventas/${v.id}`,
    })
  }
  for (const c of ((cot.data ?? []) as unknown as Fila[]).slice(0, 5)) {
    out.push({
      tipo: "cotizacion",
      id: c.id,
      titulo: c.numero,
      subtitulo: `${cliNombre(c)} · ${fmtMXN(c.total)} · ${c.estatus ?? ""}`,
      href: `/cotizaciones/${c.id}`,
    })
  }
  return out
}
