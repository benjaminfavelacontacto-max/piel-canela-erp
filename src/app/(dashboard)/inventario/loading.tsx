import { PageSkeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return <PageSkeleton title="Inventario" subtitle="Cargando productos…" kpis={4} />
}
