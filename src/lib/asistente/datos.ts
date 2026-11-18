import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { buildProductoImageUrl } from "@/lib/storage-images"
import type { ProductoFicha } from "./tipos"

/**
 * Motor de consultas del asistente (SOLO LECTURA).
 *
 * La IA no escribe SQL ni toca Supabase: pide un "conjunto de datos" ya aplanado
 * (ventas con el nombre del cliente, partidas con producto y categoría, etc.) y
 * este módulo filtra / agrupa / suma en memoria. La base es chica (cientos de
 * filas), así que es rápido, y las reglas del negocio quedan fijas aquí:
 *  - el cliente interno «Piel Canela» se excluye salvo que se pida,
 *  - las ventas canceladas se excluyen salvo que se pidan.
 *
 * Las tablas crudas se guardan 30 s en memoria para no releer en cada pregunta.
 */

export type Valor = string | number | boolean | null
export type Fila = Record<string, Valor>
type Cruda = Record<string, unknown>

const TTL_MS = 30_000
const cache = new Map<string, { t: number; p: Promise<Cruda[]> }>()

function tabla(nombre: string, select = "*", orden = "id"): Promise<Cruda[]> {
  const clave = nombre + "|" + select
  const hit = cache.get(clave)
  if (hit && Date.now() - hit.t < TTL_MS) return hit.p
  const p = (async () => {
    const sb = createAdminClient()
    const out: Cruda[] = []
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await sb
        .from(nombre)
        .select(select)
        .order(orden)
        .range(desde, desde + 999)
      if (error) throw new Error(nombre + ": " + error.message)
      const filas = (data ?? []) as unknown as Cruda[]
      out.push(...filas)
      if (filas.length < 1000) break
    }
    return out
  })()
  cache.set(clave, { t: Date.now(), p })
  p.catch(() => cache.delete(clave))
  return p
}

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}
const s = (v: unknown): string | null => (v == null || v === "" ? null : String(v))
const b = (v: unknown): boolean => v === true
const r2 = (x: number) => Math.round(x * 100) / 100
const fecha = (v: unknown): string | null => (v == null ? null : String(v).slice(0, 10))

function porId(filas: Cruda[]): Map<string, Cruda> {
  const m = new Map<string, Cruda>()
  for (const f of filas) m.set(String(f.id), f)
  return m
}

async function mapaClientes() {
  const m = new Map<string, { nombre: string; tipo: string | null; ciudad: string | null; interno: boolean }>()
  for (const c of await tabla("clientes")) {
    m.set(String(c.id), {
      nombre: s(c.nombre_negocio) ?? s(c.nombre) ?? "(sin nombre)",
      tipo: s(c.tipo),
      ciudad: s(c.ciudad),
      interno: b(c.is_internal),
    })
  }
  return m
}

async function mapaProductos() {
  const [productos, categorias] = await Promise.all([tabla("productos"), tabla("categorias")])
  const cat = porId(categorias)
  const m = new Map<string, { sku: string | null; nombre: string; categoria: string | null }>()
  for (const p of productos) {
    m.set(String(p.id), {
      sku: s(p.sku),
      nombre: s(p.nombre_display) ?? s(p.nombre) ?? "(sin nombre)",
      categoria: s(cat.get(String(p.categoria_id))?.nombre),
    })
  }
  return m
}

async function mapaSocios() {
  const m = new Map<string, string>()
  for (const x of await tabla("socios")) m.set(String(x.id), s(x.nombre) ?? "?")
  return m
}

type Conjunto = {
  descripcion: string
  /** columna → descripción corta (solo las que no se explican solas llevan texto). */
  columnas: Record<string, string>
  cargar: () => Promise<Fila[]>
}

const hoyISO = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date())

export const CONJUNTOS: Record<string, Conjunto> = {
  ventas: {
    descripcion: "Una fila por venta (lo realmente vendido y cobrado).",
    columnas: {
      numero: "folio",
      fecha: "AAAA-MM-DD",
      cliente: "",
      tipo_cliente: "spa|salon|distribuidor|particular|curso|prospecto|clinica",
      ciudad: "",
      estatus: "pendiente|pagada_parcial|pagada_total|cancelada",
      subtotal: "",
      descuento: "descuento global",
      iva: "IVA real cobrado",
      total: "subtotal − descuento + IVA",
      costo_productos: "",
      costo_envio: "",
      ganancia: "total − costo_productos − costo_envio",
      cantidad_pagada: "",
      saldo_pendiente: "lo que el cliente aún debe",
      es_interno: "true = consumo interno Piel Canela",
    },
    async cargar() {
      const [ventas, clientes] = await Promise.all([tabla("ventas"), mapaClientes()])
      return ventas.map((v) => {
        const c = clientes.get(String(v.cliente_id))
        return {
          numero: s(v.numero),
          fecha: fecha(v.fecha),
          cliente: c?.nombre ?? null,
          tipo_cliente: c?.tipo ?? null,
          ciudad: c?.ciudad ?? null,
          estatus: s(v.estatus),
          subtotal: n(v.subtotal),
          descuento: n(v.descuento),
          iva: n(v.iva),
          total: n(v.total),
          costo_productos: n(v.costo_productos),
          costo_envio: n(v.costo_envio),
          ganancia: n(v.ganancia),
          cantidad_pagada: n(v.cantidad_pagada),
          saldo_pendiente: n(v.saldo_pendiente),
          es_interno: c?.interno ?? false,
        }
      })
    },
  },

  venta_items: {
    descripcion: "Una fila por producto dentro de cada venta. Úsalo para unidades vendidas, productos y categorías.",
    columnas: {
      venta: "folio de la venta",
      fecha: "fecha de la venta",
      cliente: "",
      estatus: "estatus de la venta",
      sku: "",
      producto: "",
      categoria: "",
      cantidad: "unidades",
      precio_unitario: "precio ya con descuento",
      subtotal: "importe de la partida (sin IVA)",
      costo: "costo total de la partida",
      ganancia: "subtotal − costo",
      es_regalo: "true = cortesía",
      es_interno: "",
    },
    async cargar() {
      const [items, ventas, clientes, productos] = await Promise.all([
        tabla("venta_items"),
        tabla("ventas"),
        mapaClientes(),
        mapaProductos(),
      ])
      const v = porId(ventas)
      return items.map((i) => {
        const venta = v.get(String(i.venta_id))
        const c = clientes.get(String(venta?.cliente_id))
        const p = productos.get(String(i.producto_id))
        const costo = i.costo_total != null ? n(i.costo_total) : n(i.costo_unitario) * n(i.cantidad)
        return {
          venta: s(venta?.numero),
          fecha: fecha(venta?.fecha),
          cliente: c?.nombre ?? null,
          estatus: s(venta?.estatus),
          sku: p?.sku ?? null,
          producto: p?.nombre ?? null,
          categoria: p?.categoria ?? null,
          cantidad: n(i.cantidad),
          precio_unitario: n(i.precio_unitario),
          subtotal: n(i.subtotal),
          costo: r2(costo),
          ganancia: r2(n(i.subtotal) - costo),
          es_regalo: b(i.es_regalo),
          es_interno: c?.interno ?? false,
        }
      })
    },
  },

  cotizaciones: {
    descripcion: "Una fila por cotización (propuesta al cliente; NO es dinero cobrado).",
    columnas: {
      numero: "",
      fecha: "",
      valida_hasta: "",
      cliente: "",
      estatus: "borrador|enviada|aceptada|rechazada|vencida",
      subtotal: "",
      descuento: "",
      iva: "referencial",
      total: "",
      ganancia: "estimada",
      convertida_en_venta: "true si ya existe una venta ligada",
      es_interno: "",
    },
    async cargar() {
      const [cots, ventas, clientes] = await Promise.all([
        tabla("cotizaciones"),
        tabla("ventas"),
        mapaClientes(),
      ])
      const conVenta = new Set(ventas.map((v) => String(v.cotizacion_id)))
      return cots.map((q) => {
        const c = clientes.get(String(q.cliente_id))
        return {
          numero: s(q.numero),
          fecha: fecha(q.fecha),
          valida_hasta: fecha(q.valida_hasta),
          cliente: c?.nombre ?? null,
          estatus: s(q.estatus),
          subtotal: n(q.subtotal),
          descuento: n(q.descuento),
          iva: n(q.iva),
          total: n(q.total),
          ganancia: n(q.ganancia),
          convertida_en_venta: conVenta.has(String(q.id)),
          es_interno: c?.interno ?? false,
        }
      })
    },
  },

  cotizacion_items: {
    descripcion: "Una fila por producto dentro de cada cotización.",
    columnas: {
      cotizacion: "folio",
      fecha: "",
      cliente: "",
      estatus: "estatus de la cotización",
      sku: "",
      producto: "",
      categoria: "",
      cantidad: "",
      precio_unitario: "",
      subtotal: "",
      es_regalo: "",
      es_interno: "",
    },
    async cargar() {
      const [items, cots, clientes, productos] = await Promise.all([
        tabla("cotizacion_items"),
        tabla("cotizaciones"),
        mapaClientes(),
        mapaProductos(),
      ])
      const q = porId(cots)
      return items.map((i) => {
        const cot = q.get(String(i.cotizacion_id))
        const c = clientes.get(String(cot?.cliente_id))
        const p = productos.get(String(i.producto_id))
        return {
          cotizacion: s(cot?.numero),
          fecha: fecha(cot?.fecha),
          cliente: c?.nombre ?? null,
          estatus: s(cot?.estatus),
          sku: p?.sku ?? null,
          producto: p?.nombre ?? null,
          categoria: p?.categoria ?? null,
          cantidad: n(i.cantidad),
          precio_unitario: n(i.precio_unitario),
          subtotal: n(i.subtotal),
          es_regalo: b(i.es_regalo),
          es_interno: c?.interno ?? false,
        }
      })
    },
  },

  inventario: {
    descripcion: "Una fila por producto activo: existencias, precio, costo y margen.",
    columnas: {
      sku: "",
      producto: "",
      categoria: "",
      stock: "piezas en existencia",
      stock_minimo: "",
      estatus: "ok|bajo|agotado",
      precio_publico: "MXN",
      costo_unitario: "costo puesto en México, MXN (producto + envío)",
      ganancia_unitaria: "precio_publico − costo_unitario",
      unidades_vendidas: "histórico",
      valor_costo: "stock × costo_unitario",
      valor_venta: "stock × precio_publico",
      tipo_cambio: "MXN por USD del producto",
    },
    async cargar() {
      const filas = await tabla("vista_inventario")
      return filas.map((p) => {
        const stock = n(p.stock_actual)
        return {
          sku: s(p.sku),
          producto: s(p.nombre_display) ?? s(p.nombre),
          categoria: s(p.categoria),
          stock,
          stock_minimo: n(p.stock_minimo),
          estatus: s(p.estatus),
          precio_publico: n(p.precio_publico),
          costo_unitario: r2(n(p.costo_total_mxn)),
          ganancia_unitaria: r2(n(p.profit_unitario)),
          unidades_vendidas: n(p.unidades_vendidas),
          valor_costo: r2(stock * n(p.costo_total_mxn)),
          valor_venta: r2(stock * n(p.precio_publico)),
          tipo_cambio: n(p.tipo_cambio),
        }
      })
    },
  },

  clientes: {
    descripcion: "Una fila por cliente con su historial de compras (ventas no canceladas).",
    columnas: {
      cliente: "nombre del negocio o persona",
      contacto: "",
      tipo: "",
      telefono: "",
      ciudad: "",
      estado: "",
      compras: "número de ventas",
      total_comprado: "",
      ganancia: "",
      saldo_pendiente: "lo que debe hoy",
      primera_compra: "",
      ultima_compra: "",
      dias_sin_comprar: "días desde la última compra",
      activo: "",
      es_interno: "",
    },
    async cargar() {
      const [clientes, ventas] = await Promise.all([tabla("clientes"), tabla("ventas")])
      const agg = new Map<string, { c: number; t: number; g: number; sp: number; pri: string; ult: string }>()
      for (const v of ventas) {
        if (v.estatus === "cancelada") continue
        const id = String(v.cliente_id)
        const f = fecha(v.fecha) ?? ""
        const a = agg.get(id) ?? { c: 0, t: 0, g: 0, sp: 0, pri: f, ult: f }
        a.c++
        a.t += n(v.total)
        a.g += n(v.ganancia)
        a.sp += n(v.saldo_pendiente)
        if (f && (!a.pri || f < a.pri)) a.pri = f
        if (f > a.ult) a.ult = f
        agg.set(id, a)
      }
      const hoy = Date.parse(hoyISO())
      return clientes.map((c) => {
        const a = agg.get(String(c.id))
        return {
          cliente: s(c.nombre_negocio) ?? s(c.nombre),
          contacto: s(c.nombre_negocio) ? s(c.nombre) : null,
          tipo: s(c.tipo),
          telefono: s(c.telefono),
          ciudad: s(c.ciudad),
          estado: s(c.estado),
          compras: a?.c ?? 0,
          total_comprado: r2(a?.t ?? 0),
          ganancia: r2(a?.g ?? 0),
          saldo_pendiente: r2(a?.sp ?? 0),
          primera_compra: a?.pri || null,
          ultima_compra: a?.ult || null,
          dias_sin_comprar: a?.ult ? Math.round((hoy - Date.parse(a.ult)) / 86_400_000) : null,
          activo: c.activo !== false,
          es_interno: b(c.is_internal),
        }
      })
    },
  },

  reparto_socios: {
    descripcion: "Dinero de cada venta entregado a cada socio (Sandra / Benjamin). Sirve para capital recuperado.",
    columnas: { socio: "", venta: "folio", fecha: "fecha de la venta", cliente: "", monto: "MXN", pagado: "", concepto: "", es_interno: "" },
    async cargar() {
      const [vs, ventas, socios, clientes] = await Promise.all([
        tabla("venta_socios"),
        tabla("ventas"),
        mapaSocios(),
        mapaClientes(),
      ])
      const v = porId(ventas)
      return vs.map((x) => {
        const venta = v.get(String(x.venta_id))
        const c = clientes.get(String(venta?.cliente_id))
        return {
          socio: socios.get(String(x.socio_id)) ?? null,
          venta: s(venta?.numero),
          fecha: fecha(venta?.fecha),
          cliente: c?.nombre ?? null,
          monto: n(x.monto),
          pagado: b(x.pagado),
          concepto: s(x.concepto),
          es_interno: c?.interno ?? false,
        }
      })
    },
  },

  inversiones: {
    descripcion: "Capital aportado por cada socio, por ronda.",
    columnas: { socio: "", ronda: "", fecha: "", concepto: "", monto_usd: "", monto_mxn: "", tasa_cambio: "", recuperado_mxn: "" },
    async cargar() {
      const [inv, socios] = await Promise.all([tabla("inversiones"), mapaSocios()])
      return inv.map((x) => ({
        socio: socios.get(String(x.socio_id)) ?? null,
        ronda: n(x.numero_ronda),
        fecha: fecha(x.fecha),
        concepto: s(x.concepto),
        monto_usd: n(x.monto_usd),
        monto_mxn: n(x.monto_mxn),
        tasa_cambio: n(x.tasa_cambio),
        recuperado_mxn: n(x.recuperado_mxn),
      }))
    },
  },

  gastos: {
    descripcion: "Gastos operativos registrados.",
    columnas: { fecha: "", concepto: "", categoria: "", monto: "", moneda: "", socio: "" },
    async cargar() {
      const [g, socios] = await Promise.all([tabla("gastos"), mapaSocios()])
      return g.map((x) => ({
        fecha: fecha(x.fecha),
        concepto: s(x.concepto),
        categoria: s(x.categoria),
        monto: n(x.monto),
        moneda: s(x.moneda),
        socio: socios.get(String(x.socio_id)) ?? null,
      }))
    },
  },

  pedidos: {
    descripcion: "Pedidos de compra al proveedor (importaciones desde Brasil). Una fila por pedido.",
    columnas: {
      numero: "",
      nombre: "",
      fecha: "",
      tipo: "",
      tipo_cambio: "MXN por USD",
      subtotal_usd: "",
      costo_envio_usd: "",
      total_usd: "",
      total_mxn: "",
      inversion_sandra_usd: "",
      inversion_benjamin_usd: "",
    },
    async cargar() {
      const p = await tabla("pedidos_compra")
      return p.map((x) => ({
        numero: n(x.numero),
        nombre: s(x.nombre),
        fecha: fecha(x.fecha),
        tipo: s(x.tipo),
        tipo_cambio: n(x.tipo_cambio),
        subtotal_usd: n(x.subtotal_usd),
        costo_envio_usd: n(x.costo_envio_usd),
        total_usd: n(x.total_usd),
        total_mxn: n(x.total_mxn),
        inversion_sandra_usd: n(x.inversion_sandra_usd),
        inversion_benjamin_usd: n(x.inversion_benjamin_usd),
      }))
    },
  },

  pedido_items: {
    descripcion: "Productos comprados en cada pedido al proveedor.",
    columnas: {
      pedido: "número de pedido",
      fecha: "",
      sku: "",
      producto: "",
      categoria: "",
      cantidad: "",
      costo_unitario_usd: "con envío",
      costo_unitario_mxn: "con envío",
      total_usd: "con envío",
      total_mxn: "con envío",
      precio_publico_mxn: "",
      ganancia_unitaria: "",
    },
    async cargar() {
      const [items, pedidos, productos] = await Promise.all([
        tabla("pedido_compra_items"),
        tabla("pedidos_compra"),
        mapaProductos(),
      ])
      const ped = porId(pedidos)
      return items.map((i) => {
        const pd = ped.get(String(i.pedido_id))
        const p = productos.get(String(i.producto_id))
        return {
          pedido: pd ? n(pd.numero) : null,
          fecha: fecha(pd?.fecha),
          sku: p?.sku ?? null,
          producto: p?.nombre ?? null,
          categoria: p?.categoria ?? null,
          cantidad: n(i.cantidad),
          costo_unitario_usd: n(i.costo_total_unitario_usd),
          costo_unitario_mxn: n(i.costo_total_unitario_mxn),
          total_usd: n(i.total_con_envio_usd),
          total_mxn: n(i.total_con_envio_mxn),
          precio_publico_mxn: n(i.precio_publico_mxn),
          ganancia_unitaria: n(i.profit_unitario),
        }
      })
    },
  },

  movimientos_inventario: {
    descripcion: "Bitácora de entradas y salidas de inventario.",
    columnas: {
      fecha: "",
      sku: "",
      producto: "",
      tipo: "entrada_compra|salida_venta|ajuste_positivo|ajuste_negativo|devolucion",
      cantidad: "",
      stock_anterior: "",
      stock_nuevo: "",
      notas: "",
    },
    async cargar() {
      const [mov, productos] = await Promise.all([tabla("movimientos_inventario"), mapaProductos()])
      return mov.map((m) => {
        const p = productos.get(String(m.producto_id))
        return {
          fecha: fecha(m.created_at),
          sku: p?.sku ?? null,
          producto: p?.nombre ?? null,
          tipo: s(m.tipo),
          cantidad: n(m.cantidad),
          stock_anterior: n(m.stock_anterior),
          stock_nuevo: n(m.stock_nuevo),
          notas: s(m.notas),
        }
      })
    },
  },
}

export const NOMBRES_CONJUNTOS = Object.keys(CONJUNTOS) as [string, ...string[]]

/** Diccionario de datos compacto para el prompt del sistema. */
export function diccionarioDeDatos(): string {
  return Object.entries(CONJUNTOS)
    .map(([nombre, c]) => {
      const cols = Object.entries(c.columnas)
        .map(([k, d]) => (d ? k + " (" + d + ")" : k))
        .join(", ")
      return "• " + nombre + " — " + c.descripcion + "\n  Columnas: " + cols
    })
    .join("\n")
}

// ─────────────────────────── consulta genérica ───────────────────────────

const OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "contiene", "en"] as const
const METRICAS = ["suma", "promedio", "min", "max", "conteo", "conteo_distinto"] as const

export const ConsultaSchema = z.object({
  datos: z.enum(NOMBRES_CONJUNTOS),
  filtros: z
    .array(
      z.object({
        columna: z.string(),
        op: z.enum(OPS),
        valor: z.union([
          z.string(),
          z.number(),
          z.boolean(),
          z.null(),
          z.array(z.union([z.string(), z.number()])),
        ]),
      }),
    )
    .optional(),
  agrupar_por: z.array(z.string()).max(3).optional(),
  metricas: z
    .array(z.object({ op: z.enum(METRICAS), columna: z.string().optional() }))
    .max(8)
    .optional(),
  columnas: z.array(z.string()).optional(),
  ordenar_por: z
    .object({ columna: z.string(), direccion: z.enum(["asc", "desc"]).optional() })
    .optional(),
  limite: z.number().int().min(1).max(300).optional(),
  incluir_internos: z.boolean().optional(),
  incluir_canceladas: z.boolean().optional(),
})
export type Consulta = z.infer<typeof ConsultaSchema>

const norm = (x: unknown) =>
  String(x)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()

function igual(v: Valor, x: unknown): boolean {
  if (x === null) return v === null
  if (v === null) return false
  if (typeof v === "number") return v === Number(x)
  if (typeof v === "boolean") return v === (x === true || x === "true")
  return norm(v) === norm(x)
}

function comparar(v: Valor, x: unknown): number {
  if (typeof v === "number") return v - Number(x)
  return String(v).localeCompare(String(x))
}

function cumple(v: Valor, op: (typeof OPS)[number], x: unknown): boolean {
  switch (op) {
    case "eq":
      return igual(v, x)
    case "neq":
      return !igual(v, x)
    case "contiene":
      return v !== null && norm(v).includes(norm(x))
    case "en":
      return Array.isArray(x) && x.some((y) => igual(v, y))
  }
  if (v === null) return false
  const c = comparar(v, x)
  return op === "gt" ? c > 0 : op === "gte" ? c >= 0 : op === "lt" ? c < 0 : c <= 0
}

const GRANOS: Record<string, number> = { anio: 4, mes: 7, dia: 10 }

class ErrorConsulta extends Error {}

function exigirColumna(col: string, conjunto: string, validas: string[]) {
  if (!validas.includes(col)) {
    throw new ErrorConsulta(
      'La columna "' + col + '" no existe en "' + conjunto + '". Columnas válidas: ' + validas.join(", "),
    )
  }
}

/** Ejecuta una consulta y devuelve JSON compacto (columnas + filas como arreglos). */
export async function consultar(q: Consulta): Promise<string> {
  const conjunto = CONJUNTOS[q.datos]
  const validas = Object.keys(conjunto.columnas)
  let filas = await conjunto.cargar()
  const notas: string[] = []

  if (validas.includes("es_interno") && !q.incluir_internos) {
    const antes = filas.length
    filas = filas.filter((f) => f.es_interno !== true)
    if (antes !== filas.length) notas.push("Se excluyó el consumo interno de Piel Canela.")
  }
  if ((q.datos === "ventas" || q.datos === "venta_items") && !q.incluir_canceladas) {
    filas = filas.filter((f) => f.estatus !== "cancelada")
  }

  for (const f of q.filtros ?? []) {
    exigirColumna(f.columna, q.datos, validas)
    filas = filas.filter((fila) => cumple(fila[f.columna], f.op, f.valor))
  }

  const grupos = (q.agrupar_por ?? []).map((g) => {
    const [col, grano] = g.split(":")
    exigirColumna(col, q.datos, validas)
    if (grano && !GRANOS[grano]) throw new ErrorConsulta('Grano de fecha inválido "' + grano + '". Usa mes, anio o dia.')
    return { col, grano, nombre: grano ? col + "_" + grano : col }
  })
  const metricas = (q.metricas ?? []).map((m) => {
    if (m.op !== "conteo") {
      if (!m.columna) throw new ErrorConsulta('La métrica "' + m.op + '" necesita "columna".')
      exigirColumna(m.columna, q.datos, validas)
    }
    return { op: m.op, col: m.columna ?? "", nombre: m.op === "conteo" ? "conteo" : m.op + "_" + m.columna }
  })

  let columnas: string[]
  let salida: Fila[]

  if (grupos.length || metricas.length) {
    if (!metricas.length) metricas.push({ op: "conteo", col: "", nombre: "conteo" })
    const cubetas = new Map<string, { llave: Valor[]; filas: Fila[] }>()
    for (const fila of filas) {
      const llave = grupos.map((g) => {
        const v = fila[g.col]
        return g.grano && typeof v === "string" ? v.slice(0, GRANOS[g.grano]) : v
      })
      const k = JSON.stringify(llave)
      let c = cubetas.get(k)
      if (!c) cubetas.set(k, (c = { llave, filas: [] }))
      c.filas.push(fila)
    }
    if (!grupos.length && !cubetas.size) cubetas.set("[]", { llave: [], filas: [] })
    columnas = [...grupos.map((g) => g.nombre), ...metricas.map((m) => m.nombre)]
    salida = [...cubetas.values()].map((c) => {
      const o: Fila = {}
      grupos.forEach((g, i) => (o[g.nombre] = c.llave[i]))
      for (const m of metricas) {
        if (m.op === "conteo") {
          o[m.nombre] = c.filas.length
          continue
        }
        const vals = c.filas.map((f) => f[m.col]).filter((v) => v !== null)
        if (m.op === "conteo_distinto") {
          o[m.nombre] = new Set(vals.map((v) => String(v))).size
          continue
        }
        if (!vals.length) {
          o[m.nombre] = m.op === "suma" ? 0 : null
          continue
        }
        if (m.op === "min" || m.op === "max") {
          const orden = [...vals].sort((a, z) => comparar(a, z))
          o[m.nombre] = m.op === "min" ? orden[0] : orden[orden.length - 1]
          continue
        }
        const suma = vals.reduce<number>((a, v) => a + n(v), 0)
        o[m.nombre] = r2(m.op === "suma" ? suma : suma / vals.length)
      }
      return o
    })
  } else {
    columnas = q.columnas?.length ? q.columnas : validas.filter((c) => c !== "es_interno")
    for (const c of columnas) exigirColumna(c, q.datos, validas)
    salida = filas
  }

  // Orden: el pedido; si no, cronológico cuando se agrupa por fecha; si no, la primera métrica de mayor a menor.
  let ordenCol = q.ordenar_por?.columna
  let dir = q.ordenar_por?.direccion ?? "desc"
  const ordenables = grupos.length || metricas.length ? columnas : validas
  if (ordenCol && !ordenables.includes(ordenCol)) {
    throw new ErrorConsulta('No se puede ordenar por "' + ordenCol + '". Opciones: ' + ordenables.join(", "))
  }
  if (!ordenCol && grupos.length) {
    const temporal = grupos.find((g) => g.grano)
    if (temporal) {
      ordenCol = temporal.nombre
      dir = "asc"
    } else {
      ordenCol = metricas[0].nombre
    }
  }
  if (ordenCol) {
    const col = ordenCol
    const signo = dir === "asc" ? 1 : -1
    salida = [...salida].sort((a, z) => {
      const x = a[col]
      const y = z[col]
      if (x === null) return 1
      if (y === null) return -1
      return comparar(x, y) * signo
    })
  }

  const total = salida.length
  const limite = q.limite ?? (grupos.length || metricas.length ? 60 : 25)
  const recorte = salida.slice(0, limite)
  if (total > recorte.length) {
    notas.push("Hay " + total + " filas; se muestran " + recorte.length + ". Agrupa, filtra o sube «limite» si necesitas más.")
  }

  return JSON.stringify({
    columnas,
    filas: recorte.map((f) => columnas.map((c) => f[c] ?? null)),
    total_filas: total,
    ...(notas.length ? { notas } : {}),
  })
}

export function esErrorDeConsulta(e: unknown): e is Error {
  return e instanceof ErrorConsulta
}

/** Fichas con foto para la herramienta «mostrar_productos». */
export async function fichasDeProductos(skus: string[]): Promise<ProductoFicha[]> {
  const filas = await tabla("vista_inventario")
  const buscados = new Set(skus.map(norm))
  return filas
    .filter((p) => buscados.has(norm(p.sku)))
    .slice(0, 12)
    .map((p) => {
      const archivo = s(p.imagen_url)
      return {
        sku: String(p.sku),
        nombre: s(p.nombre_display) ?? s(p.nombre) ?? "",
        categoria: s(p.categoria),
        imagen: archivo ? buildProductoImageUrl(archivo) : null,
        stock: n(p.stock_actual),
        precio: p.precio_publico == null ? null : n(p.precio_publico),
      }
    })
}

export { hoyISO }
