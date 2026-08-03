/**
 * DESCUENTOS por partida (por producto) — matemática única para cotizaciones,
 * ventas y el PDF. Todo lo que calcule "cuánto se le rebajó al cliente" pasa
 * por aquí.
 *
 * MODELO
 *   Una partida con descuento se guarda con:
 *     · `precio_lista`     → precio de catálogo congelado (el de ANTES)
 *     · `precio_unitario`  → precio YA con el descuento aplicado (el que paga)
 *     · `descuento_tipo`   → 'pct' | 'monto' (cómo se capturó)
 *     · `descuento_valor`  → el número tecleado (15 = 15%, 25 = $25 por pieza)
 *
 *   Guardar el precio ya rebajado en `precio_unitario` es lo que hace que NADA
 *   aguas abajo tenga que cambiar: `subtotal` (GENERATED = cantidad ×
 *   precio_unitario), `cotizaciones.subtotal`, el IVA, la utilidad y la venta
 *   espejo siguen cuadrando solos. `descuento_tipo`/`descuento_valor` solo
 *   recuerdan CÓMO se capturó, para poder mostrarlo ("−15%") y para recalcular
 *   el precio si cambia la cantidad o el producto.
 *
 * DOS DESCUENTOS DISTINTOS — no se mezclan
 *   1. Por producto (este archivo): baja el precio de cada partida ⇒ ya viene
 *      restado dentro de `cotizaciones.subtotal`.
 *   2. Global (`cotizaciones.descuento`): se resta DESPUÉS del subtotal y
 *      antes del IVA.
 *   El "ahorro total" que se le presenta al cliente es la suma de los dos.
 *
 * REGALO vs DESCUENTO
 *   Un regalo es una cortesía al 100% con su propia contabilidad (ver
 *   `@/lib/regalos`): NO cuenta como descuento aquí y se excluye del subtotal
 *   bruto, para no inflar el "descuento por productos" con el valor obsequiado.
 */

import { precioReferencia } from "./regalos"
import { grupoProducto } from "./grupos-productos"

const round2 = (n: number) => Math.round(n * 100) / 100

export type TipoDescuento = "monto" | "pct"

/** Forma mínima de una partida para los cálculos de descuento. */
export type LineaDescuento = {
  cantidad: number
  precio_unitario: number
  precio_lista?: number | null
  es_regalo?: boolean | null
  descuento_tipo?: TipoDescuento | null
  /** % (15 = 15%) o $ POR PIEZA, según `descuento_tipo`. */
  descuento_valor?: number | null
}

/** Partida con lo mínimo para poder nombrarla y agruparla en el desglose. */
export type LineaDescuentoConNombre = LineaDescuento & {
  nombre?: string
  sku?: string | null
  categoria?: string | null
}

/**
 * Precio de catálogo de la partida (antes de descuento). Reutiliza
 * `precioReferencia`: `precio_lista` si está congelado, si no el cobrado.
 */
export function precioLista(it: LineaDescuento): number {
  return precioReferencia(it)
}

/**
 * Precio unitario final tras aplicar un descuento al precio de lista.
 * `valor` es % cuando `tipo === 'pct'` y $ POR PIEZA cuando es 'monto'.
 * Nunca deja el precio por debajo de 0 ni el descuento por encima del precio.
 */
export function precioConDescuento(
  lista: number,
  tipo: TipoDescuento | null | undefined,
  valor: number | null | undefined,
): number {
  const base = Number(lista ?? 0)
  const v = Number(valor ?? 0)
  if (!(base > 0) || !(v > 0)) return round2(Math.max(0, base))
  const rebaja =
    tipo === "pct" ? base * (Math.min(100, v) / 100) : Math.min(base, v)
  return round2(Math.max(0, base - rebaja))
}

/** ¿Esta partida trae descuento por producto? (un regalo NO cuenta). */
export function tieneDescuento(it: LineaDescuento): boolean {
  if (it.es_regalo === true) return false
  const lista = precioLista(it)
  return lista > 0 && round2(lista) > round2(Number(it.precio_unitario ?? 0))
}

/** Descuento en pesos por UNA pieza de la partida. */
export function descuentoUnitario(it: LineaDescuento): number {
  if (!tieneDescuento(it)) return 0
  return round2(precioLista(it) - Number(it.precio_unitario ?? 0))
}

/** % real de descuento de la partida (derivado de los precios, no del input). */
export function descuentoPct(it: LineaDescuento): number {
  const lista = precioLista(it)
  if (!(lista > 0)) return 0
  return (descuentoUnitario(it) / lista) * 100
}

/**
 * Etiqueta corta de cómo se capturó el descuento: "15%" o "$25.00 c/u".
 * Si no se guardó el tipo (cotización vieja), se deriva el % de los precios.
 */
export function etiquetaDescuento(it: LineaDescuento): string {
  if (!tieneDescuento(it)) return ""
  const valor = Number(it.descuento_valor ?? 0)
  if (it.descuento_tipo === "pct" && valor > 0) {
    return `${trimPct(valor)}%`
  }
  if (it.descuento_tipo === "monto" && valor > 0) {
    return `${fmt2(descuentoUnitario(it))} c/u`
  }
  return `${trimPct(descuentoPct(it))}%`
}

function trimPct(n: number): string {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

function fmt2(n: number): string {
  return `$${n.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Renglón del desglose "a qué producto se le hizo descuento". */
export type DetalleDescuento = {
  nombre: string
  sku: string | null
  /** Familia del producto (Cintas, Potenciadores…) para agrupar por lote. */
  grupo: string
  cantidad: number
  /** Precio de catálogo por pieza. */
  precioLista: number
  /** Precio cobrado por pieza. */
  precioFinal: number
  /** Ahorro por pieza. */
  unitario: number
  /** Ahorro de toda la partida (unitario × cantidad). */
  monto: number
  /** % de descuento de la partida. */
  pct: number
  /** "15%" o "$25.00 c/u". */
  etiqueta: string
}

export type ResumenDescuentos = {
  /** Partidas cobradas con descuento. */
  lineas: number
  /** Piezas con descuento. */
  piezas: number
  /** Σ precio de lista × cantidad de las partidas COBRADAS (sin regalos). */
  brutoLista: number
  /** Σ precio cobrado × cantidad de las partidas cobradas (= subtotal). */
  neto: number
  /** brutoLista − neto: lo que se rebajó producto por producto. */
  monto: number
  /** monto ÷ brutoLista × 100. */
  pct: number
  detalle: DetalleDescuento[]
}

export const RESUMEN_DESCUENTOS_VACIO: ResumenDescuentos = {
  lineas: 0,
  piezas: 0,
  brutoLista: 0,
  neto: 0,
  monto: 0,
  pct: 0,
  detalle: [],
}

/**
 * Descuentos por producto de un documento. Los regalos se excluyen del bruto
 * y del neto: su cortesía se reporta aparte (`resumenRegalos`), si no el
 * "descuento por productos" se llevaría también el valor obsequiado.
 */
export function resumenDescuentos(
  items: readonly LineaDescuentoConNombre[],
): ResumenDescuentos {
  let brutoLista = 0
  let neto = 0
  let piezas = 0
  const detalle: DetalleDescuento[] = []

  for (const it of items) {
    if (it.es_regalo === true) continue
    const cantidad = Number(it.cantidad ?? 0)
    const lista = precioLista(it)
    const final = Number(it.precio_unitario ?? 0)
    brutoLista += lista * cantidad
    neto += final * cantidad
    if (!tieneDescuento(it)) continue
    const unitario = descuentoUnitario(it)
    piezas += cantidad
    detalle.push({
      nombre: it.nombre ?? "—",
      sku: it.sku ?? null,
      grupo: grupoProducto(it).label,
      cantidad,
      precioLista: round2(lista),
      precioFinal: round2(final),
      unitario,
      monto: round2(unitario * cantidad),
      pct: descuentoPct(it),
      etiqueta: etiquetaDescuento(it),
    })
  }

  brutoLista = round2(brutoLista)
  neto = round2(neto)
  const monto = round2(brutoLista - neto)
  return {
    lineas: detalle.length,
    piezas,
    brutoLista,
    neto,
    monto,
    pct: brutoLista > 0 ? (monto / brutoLista) * 100 : 0,
    detalle: detalle.sort((a, b) => b.monto - a.monto),
  }
}

/**
 * Renglón del desglose que se le presenta al cliente. Puede ser UNA partida o
 * un LOTE ("Cintas — 5 productos con −15%"): cuando el mismo descuento se
 * aplicó a varias partidas de la misma familia, listarlas una por una alarga
 * el documento sin decir nada nuevo.
 */
export type RenglonDescuento = {
  /** "Ametista UV 1" o "Cintas". */
  concepto: string
  /** SKU de la partida, o "5 productos" en un lote. */
  detalle: string | null
  /** Piezas cubiertas por el renglón. */
  cantidad: number
  /** Precio de lista; null en un lote con precios distintos. */
  precioLista: number | null
  /** Precio cobrado; null en un lote con precios distintos. */
  precioFinal: number | null
  etiqueta: string
  monto: number
  esLote: boolean
}

/**
 * Convierte el detalle por partida en renglones para el documento, juntando
 * en un lote las partidas de la MISMA familia con el MISMO descuento (2 o
 * más). Un lote con precios distintos deja precio lista/final en null: lo que
 * importa ahí es el % y el ahorro total, no un precio unitario que no existe.
 */
export function renglonesDescuento(
  detalle: readonly DetalleDescuento[],
): RenglonDescuento[] {
  const grupos = new Map<string, DetalleDescuento[]>()
  for (const d of detalle) {
    const clave = `${d.grupo}|${d.etiqueta}`
    const arr = grupos.get(clave) ?? []
    arr.push(d)
    grupos.set(clave, arr)
  }

  const renglones: RenglonDescuento[] = []
  for (const partidas of grupos.values()) {
    if (partidas.length === 1) {
      const d = partidas[0]
      renglones.push({
        concepto: d.nombre,
        detalle: d.sku,
        cantidad: d.cantidad,
        precioLista: d.precioLista,
        precioFinal: d.precioFinal,
        etiqueta: d.etiqueta,
        monto: d.monto,
        esLote: false,
      })
      continue
    }
    const mismoPrecio =
      partidas.every((p) => p.precioLista === partidas[0].precioLista) &&
      partidas.every((p) => p.precioFinal === partidas[0].precioFinal)
    renglones.push({
      concepto: partidas[0].grupo,
      detalle: `${partidas.length} productos`,
      cantidad: partidas.reduce((s, p) => s + p.cantidad, 0),
      precioLista: mismoPrecio ? partidas[0].precioLista : null,
      precioFinal: mismoPrecio ? partidas[0].precioFinal : null,
      etiqueta: partidas[0].etiqueta,
      monto: round2(partidas.reduce((s, p) => s + p.monto, 0)),
      esLote: true,
    })
  }
  return renglones.sort((a, b) => b.monto - a.monto)
}

/**
 * Aplica un descuento a TODAS las partidas cobradas que casen con `filtro`
 * (por ejemplo, todas las cintas). Los regalos se saltan: ya son cortesía al
 * 100%. Devuelve una lista nueva — no muta.
 */
export function aplicarDescuentoLote<T extends LineaDescuento>(
  items: readonly T[],
  filtro: (it: T) => boolean,
  tipo: TipoDescuento,
  valor: number,
): T[] {
  return items.map((it) => {
    if (it.es_regalo === true || !filtro(it)) return it
    return { ...it, ...aplicarDescuentoLinea(it, tipo, valor) }
  })
}

/** Cascada completa de importes de una cotización. */
export type TotalesCotizacion = {
  /** Subtotal a precio de lista (antes de descuentos por producto). */
  brutoLista: number
  /** Suma de los descuentos por producto. */
  descuentoProductos: number
  /** Subtotal ya con los descuentos por producto = `cotizaciones.subtotal`. */
  subtotal: number
  /** Descuento global sobre el subtotal = `cotizaciones.descuento`. */
  descuentoGlobal: number
  /** subtotal − descuento global: sobre esto se calcula el IVA. */
  baseGravable: number
  iva: number
  total: number
  /** Todo lo que el cliente se ahorró (por producto + global). */
  ahorroCliente: number
  /** ahorroCliente ÷ brutoLista × 100. */
  ahorroPct: number
}

/**
 * Única fuente de verdad de los importes. El descuento global reduce la BASE
 * GRAVABLE antes del IVA (estándar fiscal MX: el descuento comercial baja la
 * base sobre la que se calcula el 16%).
 */
export function totalesCotizacion(args: {
  items: readonly LineaDescuento[]
  descuentoTipo: TipoDescuento
  descuentoValor: number
  ivaActivo: boolean
  ivaTasa?: number
}): TotalesCotizacion {
  const tasa = args.ivaTasa ?? 0.16
  let brutoLista = 0
  let subtotal = 0
  for (const it of args.items) {
    const cantidad = Number(it.cantidad ?? 0)
    subtotal += Number(it.precio_unitario ?? 0) * cantidad
    // El regalo no entra al bruto: su valor se reporta como cortesía, no como
    // descuento (si no, "descuento por productos" se lo comería).
    if (it.es_regalo === true) continue
    brutoLista += precioLista(it) * cantidad
  }
  brutoLista = round2(brutoLista)
  subtotal = round2(subtotal)
  const descuentoProductos = round2(Math.max(0, brutoLista - subtotal))

  const descuentoGlobal = round2(
    args.descuentoTipo === "pct"
      ? Math.max(0, Math.min(subtotal, subtotal * (args.descuentoValor / 100)))
      : Math.max(0, Math.min(subtotal, args.descuentoValor)),
  )
  const baseGravable = round2(subtotal - descuentoGlobal)
  const iva = args.ivaActivo ? round2(baseGravable * tasa) : 0
  const total = round2(baseGravable + iva)
  const ahorroCliente = round2(descuentoProductos + descuentoGlobal)

  return {
    brutoLista,
    descuentoProductos,
    subtotal,
    descuentoGlobal,
    baseGravable,
    iva,
    total,
    ahorroCliente,
    ahorroPct: brutoLista > 0 ? (ahorroCliente / brutoLista) * 100 : 0,
  }
}

/**
 * Campos a aplicar para poner (o quitar) el descuento de una partida.
 * Congela `precio_lista` la primera vez que se descuenta, para que el precio
 * original no se pierda y el descuento se pueda recalcular o revertir.
 */
export function aplicarDescuentoLinea(
  it: LineaDescuento,
  tipo: TipoDescuento,
  valor: number,
): {
  descuento_tipo: TipoDescuento
  descuento_valor: number
  precio_unitario: number
  precio_lista: number | null
} {
  const lista = precioLista(it)
  const v = Number(valor ?? 0)
  if (!(v > 0)) {
    // Sin descuento: se recupera el precio de lista y se suelta el congelado.
    return {
      descuento_tipo: tipo,
      descuento_valor: 0,
      precio_unitario: round2(lista),
      precio_lista: null,
    }
  }
  return {
    descuento_tipo: tipo,
    descuento_valor: v,
    precio_unitario: precioConDescuento(lista, tipo, v),
    precio_lista: round2(lista),
  }
}

/**
 * ¿El error de Supabase es "no existe la columna descuento_tipo/
 * descuento_valor" EN LAS PARTIDAS? Pasa mientras no se corra
 * `scripts/add-descuento-por-producto.sql`: en ese caso se reintenta sin esas
 * columnas en vez de perder la cotización.
 */
export function errorSinColumnasDescuentoLinea(
  err: { code?: string; message?: string } | null,
): boolean {
  if (!err) return false
  return (
    err.code === "PGRST204" ||
    err.code === "42703" ||
    /descuento_(tipo|valor)/.test(err.message ?? "")
  )
}

/** Quita descuento_tipo/descuento_valor de una fila (reintento sin migración). */
export function sinCamposDescuentoLinea<T extends Record<string, unknown>>(
  row: T,
) {
  const { descuento_tipo: _t, descuento_valor: _v, ...resto } = row
  return resto
}
