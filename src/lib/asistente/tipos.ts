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
  | { t: "error"; d: string }
  | { t: "fin"; d: Uso }

export type MensajeEntrada = { rol: "user" | "assistant"; texto: string }
