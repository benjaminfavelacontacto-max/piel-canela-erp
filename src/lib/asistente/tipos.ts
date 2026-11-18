/**
 * Tipos compartidos entre el servidor (`agente.ts`, ruta /api/asistente) y el
 * chat del navegador. Sin imports de servidor: se puede usar en `"use client"`.
 */

export type FormatoValor = "moneda" | "numero" | "porcentaje"

export type Grafica = {
  tipo: "barras" | "lineas" | "area" | "dona"
  titulo: string
  etiquetas: string[]
  series: { nombre: string; valores: number[] }[]
  formato: FormatoValor
}

export type Kpi = {
  etiqueta: string
  valor: string | number
  formato?: FormatoValor | "texto"
  /** Cambio frente a otro periodo, ya escrito: "+12%", "−$3,200". */
  cambio?: string
  /** bueno = verde, malo = rojo, neutro = gris. */
  tono?: "bueno" | "malo" | "neutro"
  nota?: string
}

export type TipoColumna = "texto" | "moneda" | "numero" | "porcentaje" | "fecha"

export type Tabla = {
  titulo: string
  columnas: { nombre: string; tipo: TipoColumna }[]
  filas: (string | number | null)[][]
  /** Fila de totales opcional (misma cantidad de celdas que columnas). */
  total?: (string | number | null)[]
}

export type ProductoFicha = {
  sku: string
  nombre: string
  categoria: string | null
  imagen: string | null
  stock: number
  precio: number | null
}

export type Uso = {
  /** Costo estimado de la respuesta en USD. */
  costoUsd: number
  tokensEntrada: number
  tokensSalida: number
  modelo: string
}

/** Eventos que la ruta transmite como NDJSON (una línea JSON por evento). */
export type EventoAsistente =
  | { t: "texto"; d: string }
  | { t: "estado"; d: string }
  | { t: "grafica"; d: Grafica }
  | { t: "productos"; d: ProductoFicha[] }
  | { t: "kpis"; d: Kpi[] }
  | { t: "tabla"; d: Tabla }
  | { t: "error"; d: string }
  | { t: "fin"; d: Uso }

export type MensajeEntrada = { rol: "user" | "assistant"; texto: string }
