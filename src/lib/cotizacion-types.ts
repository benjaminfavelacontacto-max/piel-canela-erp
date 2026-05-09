export type Estatus = "borrador" | "enviada" | "aceptada" | "rechazada" | "vencida"

export type Cliente = {
  id: string
  nombre: string
  nombre_negocio: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  ciudad: string | null
}

export type Producto = {
  id: string
  sku: string | null
  nombre: string
  nombre_display: string | null
  imagen_url: string | null
  peso: string | null
  precio: number
}

export type CotizacionItem = {
  producto_id: string
  sku: string | null
  nombre: string
  imagen_url: string | null
  peso: string | null
  cantidad: number
  precio_unitario: number
  costo_unitario: number
  subtotal: number
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
