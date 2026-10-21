"use client"

import dynamic from "next/dynamic"
import { ChartSkeleton, LazyOnView } from "@/components/lazy-on-view"
import type { MesPunto, Panorama } from "@/lib/panorama"

// Recharts (~370 KB) solo se descarga al acercarse a la gráfica; ambas salen del mismo
// módulo async → una sola copia de la librería para toda la página.
const VentasUtilidad = dynamic(() => import("./charts").then((m) => m.VentasUtilidadChart), {
  ssr: false,
  loading: () => <ChartSkeleton height={300} />,
})
const NuevosRecurrentes = dynamic(() => import("./charts").then((m) => m.NuevosRecurrentesChart), {
  ssr: false,
  loading: () => <ChartSkeleton height={240} />,
})

export function VentasUtilidadLazy({ data }: { data: MesPunto[] }) {
  return (
    <LazyOnView minHeight={300}>
      <VentasUtilidad data={data} />
    </LazyOnView>
  )
}

export function NuevosRecurrentesLazy({ data }: { data: Panorama["clientes"]["nuevosVsRecurrentes"] }) {
  return (
    <LazyOnView minHeight={240}>
      <NuevosRecurrentes data={data} />
    </LazyOnView>
  )
}
