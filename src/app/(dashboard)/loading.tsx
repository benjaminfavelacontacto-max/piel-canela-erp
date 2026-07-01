import { PageSkeleton } from "@/components/ui/skeleton"

/**
 * Fallback de carga para TODAS las rutas del dashboard que no definan uno
 * propio. Next.js lo muestra dentro del layout (sidebar visible) mientras el
 * server component de la página resuelve sus queries — sin flash en blanco.
 */
export default function DashboardLoading() {
  return <PageSkeleton />
}
