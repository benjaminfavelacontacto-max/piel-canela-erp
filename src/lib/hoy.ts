/**
 * Lógica del panel "Hoy" del dashboard: qué conviene hacer primero.
 * Funciones puras (sin acceso a BD) para poder razonarlas y probarlas.
 */

export type ClienteMini = {
  nombre: string
  nombre_negocio: string | null
  telefono: string | null
}

const nombreDe = (c: ClienteMini | null | undefined) =>
  c?.nombre_negocio ?? c?.nombre ?? "Cliente"

const DIA = 86_400_000
const diasEntre = (desde: string | Date, hasta: Date) =>
  Math.floor((hasta.getTime() - new Date(desde).getTime()) / DIA)

// ── Cobrar ─────────────────────────────────────────────────────────────

export type VentaConSaldo = {
  id: string
  numero: string
  fecha: string
  saldo_pendiente: number
  estatus: string
  cliente_id: string | null
  clientes: ClienteMini | null
}

export type ItemCobrar = {
  id: string
  numero: string
  cliente: string
  telefono: string | null
  saldo: number
  dias: number
}

/** Ventas con saldo por cobrar (sin canceladas ni internas), las más viejas primero. */
export function calcularCobrar(
  ventas: VentaConSaldo[],
  internos: Set<string>,
  hoy: Date,
): { total: number; cantidad: number; items: ItemCobrar[] } {
  const validas = ventas.filter(
    (v) =>
      v.estatus !== "cancelada" &&
      Number(v.saldo_pendiente) > 0.009 &&
      !(v.cliente_id && internos.has(v.cliente_id)),
  )
  const items = validas
    .map((v) => ({
      id: v.id,
      numero: v.numero,
      cliente: nombreDe(v.clientes),
      telefono: v.clientes?.telefono ?? null,
      saldo: Number(v.saldo_pendiente),
      dias: Math.max(0, diasEntre(v.fecha, hoy)),
    }))
    .sort((a, b) => b.dias - a.dias)
  return {
    total: items.reduce((s, i) => s + i.saldo, 0),
    cantidad: items.length,
    items: items.slice(0, 5),
  }
}

// ── Seguimiento de cotizaciones ────────────────────────────────────────

export type CotizacionEnviada = {
  id: string
  numero: string
  fecha: string
  valida_hasta: string | null
  total: number
  cliente_id: string | null
  clientes: ClienteMini | null
}

export type ItemSeguimiento = {
  id: string
  numero: string
  cliente: string
  telefono: string | null
  total: number
  /** Días desde que se envió */
  dias: number
  /** Días para que venza (negativo = ya venció) */
  venceEn: number | null
  motivo: "por_vencer" | "sin_respuesta"
}

/**
 * Cotizaciones "enviadas" que piden seguimiento: llevan entre 4 y 30 días sin
 * respuesta, o vencen en ≤ 3 días. Las que vencen pronto van primero.
 */
export function calcularSeguimiento(
  cots: CotizacionEnviada[],
  internos: Set<string>,
  hoy: Date,
): { cantidad: number; items: ItemSeguimiento[] } {
  const items: ItemSeguimiento[] = []
  for (const c of cots) {
    if (c.cliente_id && internos.has(c.cliente_id)) continue
    const dias = Math.max(0, diasEntre(c.fecha, hoy))
    const venceEn = c.valida_hasta
      ? Math.ceil((new Date(c.valida_hasta + "T23:59:59").getTime() - hoy.getTime()) / DIA)
      : null
    const porVencer = venceEn != null && venceEn >= 0 && venceEn <= 3
    // 4–30 días: pasado un mes (vigencia típica) ya no es seguimiento sino una cotización muerta
    const sinRespuesta = dias >= 4 && dias <= 30 && (venceEn == null || venceEn >= 0)
    if (!porVencer && !sinRespuesta) continue
    items.push({
      id: c.id,
      numero: c.numero,
      cliente: nombreDe(c.clientes),
      telefono: c.clientes?.telefono ?? null,
      total: Number(c.total ?? 0),
      dias,
      venceEn,
      motivo: porVencer ? "por_vencer" : "sin_respuesta",
    })
  }
  items.sort((a, b) => {
    if (a.motivo !== b.motivo) return a.motivo === "por_vencer" ? -1 : 1
    return a.motivo === "por_vencer"
      ? (a.venceEn ?? 99) - (b.venceEn ?? 99)
      : b.dias - a.dias
  })
  return { cantidad: items.length, items: items.slice(0, 5) }
}

// ── Clientes que "tocaría contactar" ───────────────────────────────────

export type VentaMini = {
  fecha: string
  estatus: string
  cliente_id: string | null
}

export type ItemContactar = {
  id: string
  cliente: string
  telefono: string | null
  /** Cada cuántos días suele comprar (mediana) */
  cadaDias: number
  /** Días desde su última compra */
  sinComprarDias: number
}

/**
 * Clientes con ≥ 3 compras cuyo ritmo habitual ya se cumplió: pasaron al menos
 * 90 % de su intervalo mediano (y no más de 3× — pasado eso se considera perdido
 * y es otro tema). Heurística simple y explicable, no un modelo estadístico.
 */
export function calcularContactar(
  ventas: VentaMini[],
  clientes: Map<string, ClienteMini>,
  internos: Set<string>,
  hoy: Date,
): { cantidad: number; items: ItemContactar[] } {
  const porCliente = new Map<string, number[]>()
  for (const v of ventas) {
    if (!v.cliente_id || v.estatus === "cancelada" || internos.has(v.cliente_id)) continue
    const t = new Date(v.fecha).getTime()
    if (Number.isNaN(t)) continue
    const arr = porCliente.get(v.cliente_id) ?? []
    arr.push(t)
    porCliente.set(v.cliente_id, arr)
  }
  const out: (ItemContactar & { ratio: number })[] = []
  for (const [id, fechas] of porCliente) {
    // Compras el mismo día cuentan como una sola
    const dias = [...new Set(fechas.map((t) => Math.floor(t / DIA)))].sort((a, b) => a - b)
    if (dias.length < 3) continue
    const gaps: number[] = []
    for (let i = 1; i < dias.length; i++) gaps.push(dias[i] - dias[i - 1])
    gaps.sort((a, b) => a - b)
    const mediana = gaps[Math.floor(gaps.length / 2)]
    if (mediana < 5) continue // ritmo demasiado corto: ruido
    const sinComprar = Math.floor(hoy.getTime() / DIA) - dias[dias.length - 1]
    const ratio = sinComprar / mediana
    if (ratio < 0.9 || ratio > 3) continue
    const c = clientes.get(id)
    if (!c) continue
    out.push({
      id,
      cliente: nombreDe(c),
      telefono: c.telefono,
      cadaDias: mediana,
      sinComprarDias: sinComprar,
      ratio,
    })
  }
  out.sort((a, b) => b.ratio - a.ratio)
  return {
    cantidad: out.length,
    items: out.slice(0, 5).map((o) => ({
      id: o.id,
      cliente: o.cliente,
      telefono: o.telefono,
      cadaDias: o.cadaDias,
      sinComprarDias: o.sinComprarDias,
    })),
  }
}
