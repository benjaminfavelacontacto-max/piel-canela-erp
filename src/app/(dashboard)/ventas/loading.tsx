import { PageSkeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return <PageSkeleton title="Ventas" subtitle="Cargando ventas…" kpis={4} />
}
