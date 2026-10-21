import { PageSkeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return <PageSkeleton title="Cotizaciones" subtitle="Cargando cotizaciones…" kpis={4} />
}
