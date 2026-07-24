/**
 * Modelo de predicción de compras por cliente.
 * Funciones puras — sin estado externo, fáciles de testear.
 *
 * Estrategia:
 * 1. CDF empírica (≥4 ventas): usa la distribución real de gaps del cliente.
 * 2. Bell curve (2-3 ventas): aproximación gaussiana centrada en la frecuencia.
 * 3. Global average (1 venta): usa el promedio del negocio como fallback.
 * 4. Insuficiente (0 ventas): no predice.
 *
 * Preparado para ML: implementa la interfaz `ModeloPrediccion`. En el futuro
 * puedes plug-in un modelo entrenado (TF.js / API server-side) sin tocar la UI.
 */

import type { EnrichedCliente, VentaSummaryRow } from "./clientes-dashboard"

import { parseFecha } from "@/lib/fecha"

export type ConfidenceLevel = "alta" | "media" | "baja" | "insuficiente"
export type Metodo = "empirical" | "bell" | "global" | "insufficient"

export type PrediccionResult = {
  probabilidadProx30: number // 0..1
  probabilidadProx60: number
  probabilidadProx90: number
  ingresoEstimadoProx: number // ticket × P(60d), MXN
  valorFuturo12m: number // proyección anual
  fechaProxima: Date | null
  ventanaInicio: Date | null
  ventanaFin: Date | null
  riesgoAbandono: number // 0..1
  confianza: ConfidenceLevel
  metodo: Metodo
  seasonality: number[] // 12 elementos, frecuencia por mes-del-año (0..1)
  mesProximoLabel: string | null
  diasParaProxima: number | null
  // Para heatmap predictivo: P(comprar en mes [i meses adelante])
  probMesesFuturos: number[] // 6 meses adelante
}

export interface ModeloPrediccion {
  predict(
    cliente: EnrichedCliente,
    ventas: VentaSummaryRow[],
    fechaHoy: Date,
  ): PrediccionResult
}

// ─── Helpers matemáticos ────────────────────────────────────────────

function cdfEmpirical(sortedGaps: number[], g: number): number {
  if (sortedGaps.length === 0) return 0
  let count = 0
  for (const x of sortedGaps) if (x <= g) count++
  return count / sortedGaps.length
}

function bellProbability(D: number, t: number, frecuencia: number): number {
  if (frecuencia <= 0) return 0
  const ratio = (D + t - frecuencia) / frecuencia
  return Math.min(1, Math.max(0, Math.exp(-Math.pow(ratio, 2))))
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0
  const mean = arr.reduce((s, x) => s + x, 0) / arr.length
  const variance =
    arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

const MES_ABBR = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
]

// ─── Implementación principal ───────────────────────────────────────

export function predecirCompra(
  cliente: EnrichedCliente,
  ventas: VentaSummaryRow[],
  fechaHoy: Date = new Date(),
  globalFrecuencia: number = 60,
): PrediccionResult {
  // Filtrar y ordenar fechas del cliente
  const fechas = ventas
    .filter(
      (v) => v.cliente_id === cliente.id && v.estatus !== "cancelada",
    )
    .map((v) => parseFecha(v.fecha))
    .sort((a, b) => a.getTime() - b.getTime())

  const N = fechas.length

  // ─── Caso vacío ─────────────────────────────────────────────────
  if (N === 0) {
    return {
      probabilidadProx30: 0,
      probabilidadProx60: 0,
      probabilidadProx90: 0,
      ingresoEstimadoProx: 0,
      valorFuturo12m: 0,
      fechaProxima: null,
      ventanaInicio: null,
      ventanaFin: null,
      riesgoAbandono: 0,
      confianza: "insuficiente",
      metodo: "insufficient",
      seasonality: Array(12).fill(0),
      mesProximoLabel: null,
      diasParaProxima: null,
      probMesesFuturos: Array(6).fill(0),
    }
  }

  // ─── Cálculos base ──────────────────────────────────────────────
  const gaps: number[] = []
  for (let i = 1; i < N; i++) {
    gaps.push((fechas[i].getTime() - fechas[i - 1].getTime()) / 86400000)
  }

  const ultimo = fechas[N - 1]
  const D =
    Math.max(0, fechaHoy.getTime() - ultimo.getTime()) / 86400000

  const frecuenciaCalculada =
    gaps.length > 0
      ? gaps.reduce((s, x) => s + x, 0) / gaps.length
      : globalFrecuencia
  const frecuencia =
    cliente.frecuencia_dias ?? frecuenciaCalculada ?? globalFrecuencia

  const sigma = stdDev(gaps)

  // ─── Selección de método ───────────────────────────────────────
  const metodo: Metodo =
    N >= 4 ? "empirical" : N >= 2 ? "bell" : N === 1 ? "global" : "insufficient"

  const sortedGaps = [...gaps].sort((a, b) => a - b)

  function probEnTdias(t: number): number {
    if (metodo === "global") {
      return bellProbability(D, t, globalFrecuencia)
    }
    if (metodo === "bell") {
      return bellProbability(D, t, frecuencia)
    }
    if (metodo === "empirical") {
      const fD = cdfEmpirical(sortedGaps, D)
      const fDt = cdfEmpirical(sortedGaps, D + t)
      // Si ya pasó más allá de todos los gaps históricos → muy probable abandonado
      if (fD >= 0.999) return 0.05
      const cond = (fDt - fD) / Math.max(0.001, 1 - fD)
      return Math.min(1, Math.max(0, cond))
    }
    return 0
  }

  const p30 = probEnTdias(30)
  const p60 = probEnTdias(60)
  const p90 = probEnTdias(90)

  // ─── Riesgo de abandono ─────────────────────────────────────────
  const ratioAbandono = Math.max(0, (D - frecuencia) / frecuencia)
  const baseRiesgo = Math.min(1, ratioAbandono)
  // Atenuar si pocas ventas (no juzgar tan rápido)
  const ajusteN = 1 - Math.exp(-N / 3)
  const riesgo = Math.min(1, baseRiesgo * ajusteN)

  // ─── Fecha próxima estimada + ventana ──────────────────────────
  const fechaProxima = new Date(ultimo)
  fechaProxima.setDate(fechaProxima.getDate() + Math.round(frecuencia))
  const ventanaDias = sigma > 0 ? sigma : frecuencia / 2
  const ventanaInicio = new Date(fechaProxima)
  ventanaInicio.setDate(ventanaInicio.getDate() - Math.round(ventanaDias))
  const ventanaFin = new Date(fechaProxima)
  ventanaFin.setDate(ventanaFin.getDate() + Math.round(ventanaDias))
  const diasParaProxima = Math.round(
    (fechaProxima.getTime() - fechaHoy.getTime()) / 86400000,
  )

  // ─── Ingreso estimado ──────────────────────────────────────────
  const ticket = Number(cliente.ticket_promedio) || 0
  const ingresoEstimadoProx = ticket * p60

  // Compras esperadas en 12 meses, atenuadas por riesgo
  const comprasAnualesEstim =
    (365 / Math.max(7, frecuencia)) * (1 - riesgo) // mínimo gap 7d para evitar div locura
  const valorFuturo12m = ticket * comprasAnualesEstim

  // ─── Estacionalidad (mes-of-year) ───────────────────────────────
  const seasonalityCounts: number[] = Array(12).fill(0)
  for (const f of fechas) seasonalityCounts[f.getMonth()]++
  const seasonality = seasonalityCounts.map((c) => c / N)

  // ─── Probabilidades por mes futuro (6 meses adelante) ──────────
  const probMesesFuturos: number[] = []
  for (let m = 0; m < 6; m++) {
    // P(comprar dentro del mes m..m+1 desde hoy)
    const tInicio = m * 30
    const tFin = (m + 1) * 30
    const pInicio = probEnTdias(tInicio)
    const pFin = probEnTdias(tFin)
    // Probabilidad de que la compra caiga en ese mes específico
    let pBucket = Math.max(0, pFin - pInicio)
    // Boost por estacionalidad: si históricamente compra en ese mes-of-year
    const targetDate = new Date(fechaHoy)
    targetDate.setMonth(targetDate.getMonth() + m)
    const monthIdx = targetDate.getMonth()
    const seasonalBoost =
      seasonality[monthIdx] > 1 / 12
        ? 1 + (seasonality[monthIdx] - 1 / 12) * 2
        : 1
    pBucket = Math.min(1, pBucket * seasonalBoost)
    probMesesFuturos.push(pBucket)
  }

  // ─── Confianza ─────────────────────────────────────────────────
  const confianza: ConfidenceLevel =
    N >= 5
      ? "alta"
      : N >= 3
        ? "media"
        : N >= 2
          ? "baja"
          : "insuficiente"

  const mesProximoLabel = `${MES_ABBR[fechaProxima.getMonth()]} ${String(fechaProxima.getFullYear()).slice(2)}`

  return {
    probabilidadProx30: p30,
    probabilidadProx60: p60,
    probabilidadProx90: p90,
    ingresoEstimadoProx,
    valorFuturo12m,
    fechaProxima,
    ventanaInicio,
    ventanaFin,
    riesgoAbandono: riesgo,
    confianza,
    metodo,
    seasonality,
    mesProximoLabel,
    diasParaProxima,
    probMesesFuturos,
  }
}

// ─── Modelo wrapper (interfaz ML-ready) ─────────────────────────────

export class EmpiricalCDFModel implements ModeloPrediccion {
  constructor(private readonly globalFrecuencia: number = 60) {}
  predict(
    cliente: EnrichedCliente,
    ventas: VentaSummaryRow[],
    fechaHoy: Date,
  ): PrediccionResult {
    return predecirCompra(cliente, ventas, fechaHoy, this.globalFrecuencia)
  }
}

// ─── Promedio global (para fallback) ────────────────────────────────

export function calcularGlobalFrecuencia(
  clientes: EnrichedCliente[],
): number {
  const valores = clientes
    .filter((c) => c.frecuencia_dias !== null)
    .map((c) => c.frecuencia_dias as number)
  if (valores.length === 0) return 60 // default razonable
  return valores.reduce((s, x) => s + x, 0) / valores.length
}

export { MES_ABBR }
