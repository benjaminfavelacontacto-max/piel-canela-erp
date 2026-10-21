"use client"

import { Boxes, CalendarClock, PiggyBank, Percent, Receipt, TrendingUp, Users, Wallet } from "lucide-react"
import { KpiCards, type KpiCard } from "@/components/kpi-cards"

// Los componentes de ícono no se pueden pasar de un Server Component a uno cliente:
// la página manda datos planos con un `id` y aquí se les pone el ícono.
const ICONOS = {
  ytd: TrendingUp,
  utilidad: Receipt,
  margen: Percent,
  resultado: PiggyBank,
  inventario: Boxes,
  cobertura: CalendarClock,
  clientes: Users,
  cobrar: Wallet,
} as const

export type KpiPlano = Omit<KpiCard, "icon"> & { id: keyof typeof ICONOS }

export function KpisPanorama({ cards }: { cards: KpiPlano[] }) {
  return <KpiCards cards={cards.map((c) => ({ ...c, icon: ICONOS[c.id] }))} />
}
