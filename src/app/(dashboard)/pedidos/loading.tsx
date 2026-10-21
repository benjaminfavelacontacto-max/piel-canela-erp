import { PageSkeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return <PageSkeleton title="Pedidos de Compra" subtitle="Cargando pedidos…" kpis={4} />
}
