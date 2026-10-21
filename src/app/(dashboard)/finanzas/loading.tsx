import { PageSkeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return <PageSkeleton title="Finanzas" subtitle="Cargando finanzas…" kpis={4} variant="detail" />
}
