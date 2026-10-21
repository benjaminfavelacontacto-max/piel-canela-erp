/**
 * Productos de REGALO (cortesías) — matemática única para cotizaciones,
 * ventas y finanzas. Todo lo que calcule "cuánto costó regalar" pasa por aquí.
 *
 * MODELO
 *   Una partida regalada se guarda con `precio_unitario = 0` (el cliente no la
 *   paga) y `costo_unitario` intacto (a nosotros SÍ nos costó). `precio_lista`
 *   congela el precio de catálogo solo como referencia.
 *
 * CUADRE FINANCIERO (por qué no hay que ajustar nada más)
 *   subtotal        → NO incluye el regalo (precio 0)
 *   costo_productos → SÍ incluye el costo del regalo
 *   utilidad_neta = subtotal − descuento − costo_productos − costo_envio
 *   ⇒ la pérdida ya queda restada de la utilidad, y `ganancia` de ventas
 *     (misma fórmula, columna GENERATED) la absorbe sola.
 *
 * Las 2 cifras que se muestran no son lo mismo:
 *   · costo  = PÉRDIDA REAL (dinero que salió del bolsillo)
 *   · valor  = valor comercial obsequiado (lo que el cliente "se ahorró")
 */

const round2 = (n: number) => Math.round(n * 100) / 100

/** Forma mínima de una partida para los cálculos de regalo. */
export type LineaRegalo = {
  cantidad: number
  precio_unitario: number
  costo_unitario: number
  precio_lista?: number | null
  es_regalo?: boolean | null
}

export type ResumenRegalos = {
  /** Partidas marcadas como regalo. */
  lineas: number
  /** Piezas obsequiadas. */
  piezas: number
  /** PÉRDIDA REAL: Σ costo_unitario × cantidad. */
  costo: number
  /** Valor comercial obsequiado: Σ precio_lista × cantidad. */
  valor: number
  /** Utilidad que se dejó de ganar (valor − costo). */
  margenCedido: number
}

export const RESUMEN_REGALOS_VACIO: ResumenRegalos = {
  lineas: 0,
  piezas: 0,
  costo: 0,
  valor: 0,
  margenCedido: 0,
}

/** ¿Esta partida es cortesía? */
export function esRegalo(it: LineaRegalo): boolean {
  return it.es_regalo === true
}

/**
 * Precio de referencia de una partida: el de catálogo si está congelado, si no
 * el cobrado. En un regalo `precio_unitario` es 0, así que sin `precio_lista`
 * el valor obsequiado se reporta como 0 (nunca infla la cifra).
 */
export function precioReferencia(
  it: Pick<LineaRegalo, "precio_unitario" | "precio_lista">,
): number {
  const lista = Number(it.precio_lista ?? 0)
  if (lista > 0) return lista
  return Number(it.precio_unitario ?? 0)
}

/** Costo + valor de las partidas regaladas de un documento. */
export function resumenRegalos(items: readonly LineaRegalo[]): ResumenRegalos {
  let lineas = 0
  let piezas = 0
  let costo = 0
  let valor = 0
  for (const it of items) {
    if (!esRegalo(it)) continue
    const cantidad = Number(it.cantidad ?? 0)
    lineas += 1
    piezas += cantidad
    costo += Number(it.costo_unitario ?? 0) * cantidad
    valor += precioReferencia(it) * cantidad
  }
  costo = round2(costo)
  valor = round2(valor)
  return { lineas, piezas, costo, valor, margenCedido: round2(valor - costo) }
}

/**
 * Descuento EFECTIVO que recibió el cliente: todo lo que se le rebajó
 * (descuento global + descuentos por producto + valor de lo regalado) sobre lo
 * que habría pagado a precio de lista y sin cortesías.
 * Sirve para detectar el caso "0% de descuento" que en realidad regaló 15%.
 *
 * `brutoLista`/`descuentoProductos` son opcionales por compatibilidad: sin
 * ellos el cálculo es el de antes (solo descuento global + regalos).
 */
export function descuentoEfectivoPct(args: {
  subtotal: number
  descuento: number
  valorRegalos: number
  /** Subtotal a precio de lista, antes de los descuentos por producto. */
  brutoLista?: number
  /** Suma de los descuentos por producto. */
  descuentoProductos?: number
}): number {
  const bruto = args.brutoLista ?? args.subtotal
  const base = bruto + args.valorRegalos
  if (base <= 0) return 0
  const ahorro =
    args.descuento + args.valorRegalos + (args.descuentoProductos ?? 0)
  return (ahorro / base) * 100
}

/**
 * ¿El error de Supabase es "no existe la columna es_regalo/precio_lista"?
 * Pasa mientras no se corra `scripts/add-regalos-cotizaciones.sql`: en ese caso
 * se reintenta sin esas columnas en vez de perder la cotización o la venta.
 */
export function errorSinColumnasRegalo(
  err: { code?: string; message?: string } | null,
): boolean {
  if (!err) return false
  return (
    err.code === "PGRST204" ||
    err.code === "42703" ||
    /es_regalo|precio_lista/.test(err.message ?? "")
  )
}

/** Quita es_regalo/precio_lista de una fila para el reintento sin migración. */
export function sinCamposRegalo<T extends Record<string, unknown>>(row: T) {
  const { es_regalo: _r, precio_lista: _p, ...resto } = row
  return resto
}

/**
 * Convierte una partida a regalo (precio 0, guardando el precio de catálogo)
 * o la regresa a partida normal (recupera el precio congelado).
 * Devuelve los campos a aplicar — no muta.
 */
export function alternarRegalo<T extends LineaRegalo>(
  it: T,
  regalo: boolean,
): { es_regalo: boolean; precio_unitario: number; precio_lista: number | null } {
  if (regalo) {
    const lista = precioReferencia(it)
    return { es_regalo: true, precio_unitario: 0, precio_lista: lista }
  }
  return {
    es_regalo: false,
    precio_unitario: precioReferencia(it),
    precio_lista: null,
  }
}
