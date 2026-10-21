"use client"

// Punto de entrada async único para los paneles con gráficas de Clientes:
// Recharts se descarga UNA sola vez (en vez de una copia por panel).
export { RecurrenciaAnalytics } from "./recurrencia-analytics"
export { EstimadoIngresos } from "./estimado-ingresos"
export { PrediccionInsights } from "./prediccion-insights"
