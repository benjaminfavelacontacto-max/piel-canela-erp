import { PageSkeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return <PageSkeleton title="Clientes" subtitle="Cargando clientes…" kpis={4} />
}
