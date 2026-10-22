/**
 * Promociones del portal público /order.
 *
 * El precio de lista NO se toca en la BD (inventario, ventas manuales y
 * cotizaciones siguen usando 'Pública MXN'): la promoción se aplica aquí, tanto
 * al mostrar el catálogo como —con la misma función— al crear la cotización del
 * pedido, que guarda el precio de lista y el descuento por producto
 * (`precio_lista`, `descuento_tipo`, `descuento_valor`) para que la cotización
 * muestre el precio original y lo que se rebajó.
 *
 * Sem Sol (aerografía): el de 1 L se vende en $4,805 (lista $6,800). Las otras
 * presentaciones llevan el MISMO porcentaje de descuento (4,805 / 6,800), con
 * el precio redondeado a pesos enteros.
 */

const SEMSOL_1L_SKU = "AE-1L-SEM"
const SEMSOL_1L_PROMO = 4805
const SEMSOL_1L_LISTA = 6800
const SEMSOL_SKU = /^AE-(1L|500|60)-SEM$/i

export type PromoPortal = {
  /** Precio que paga el cliente. */
  precio: number
  /** Precio de catálogo (se muestra tachado y se congela en la cotización). */
  precioLista: number
  /** % de descuento (con 2 decimales), p. ej. 29.34. */
  descuentoPct: number
}

/** Promoción vigente para un SKU, o null si no tiene. */
export function promoPortal(
  sku: string,
  precioLista: number,
): PromoPortal | null {
  if (!SEMSOL_SKU.test(sku) || !(precioLista > 0)) return null
  const precio =
    sku.toUpperCase() === SEMSOL_1L_SKU
      ? SEMSOL_1L_PROMO
      : Math.round((precioLista * SEMSOL_1L_PROMO) / SEMSOL_1L_LISTA)
  if (!(precio > 0) || precio >= precioLista) return null
  return {
    precio,
    precioLista,
    descuentoPct: Math.round((1 - precio / precioLista) * 10000) / 100,
  }
}

export const IVA_PORTAL = 0.16

/** Desglose que ve el cliente: subtotal + IVA 16% = total. */
export function desgloseConIva(subtotal: number) {
  const iva = Math.round(subtotal * IVA_PORTAL * 100) / 100
  return { subtotal, iva, total: Math.round((subtotal + iva) * 100) / 100 }
}
