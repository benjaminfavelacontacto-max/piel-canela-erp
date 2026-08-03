import type { TipoDescuento } from "./descuentos"

export type Estatus = "borrador" | "enviada" | "aceptada" | "rechazada" | "vencida"

export type Cliente = {
  id: string
  nombre: string
  nombre_negocio: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  colonia?: string | null
  codigo_postal?: string | null
  ciudad: string | null
  estado?: string | null
  rfc?: string | null
  metodo_pago_pref?: string | null
}

export type Producto = {
  id: string
  sku: string | null
  nombre: string
  nombre_display: string | null
  imagen_url: string | null
  peso: string | null
  precio: number
  costo: number
}

export type CotizacionItem = {
  producto_id: string
  sku: string | null
  nombre: string
  imagen_url: string | null
  peso: string | null
  categoria?: string | null
  cantidad: number
  precio_unitario: number
  costo_unitario: number
  subtotal: number
  /**
   * Partida de cortesía: `precio_unitario` y `subtotal` van en 0 (el cliente no
   * la paga) pero `costo_unitario` es real — esa es la pérdida. Ver
   * `@/lib/regalos`.
   */
  es_regalo?: boolean
  /**
   * Precio de catálogo congelado (el de ANTES del descuento). En un regalo es
   * el valor obsequiado; en una partida con descuento es el precio tachado.
   */
  precio_lista?: number | null
  /** Descuento de ESTA partida: cómo se capturó (% o $ por pieza). */
  descuento_tipo?: TipoDescuento | null
  /** Valor tecleado del descuento (15 = 15%, 25 = $25 por pieza). */
  descuento_valor?: number | null
}

export type CotizacionData = {
  numero: string
  fecha: string
  valida_hasta: string | null
  cliente: Cliente | null
  items: CotizacionItem[]
  subtotal: number
  iva: number
  ivaActivo: boolean
  descuento: number
  total: number
  notas: string | null
}
