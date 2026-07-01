import { cn } from "@/lib/utils"

/** Bloque gris con shimmer. Base para skeletons de carga. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[rgba(15,23,42,0.06)]",
        className,
      )}
    />
  )
}

/** Card blanca con el mismo chrome premium del resto de la app. */
function SkeletonCard({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[rgba(15,23,42,0.05)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Skeleton genérico de página del dashboard: header + fila de KPIs + bloque de
 * contenido (chart/tabla). Sirve como fallback de `loading.tsx` para cualquier
 * ruta que no tenga uno propio — mantiene el sidebar visible y evita el
 * "flash en blanco" al navegar.
 */
export function PageSkeleton({ kpis = 4 }: { kpis?: number }) {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-live="polite">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-[42px] w-32 rounded-[14px]" />
          <Skeleton className="h-[42px] w-36 rounded-[14px]" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: kpis }).map((_, i) => (
          <SkeletonCard key={i} className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-20" />
          </SkeletonCard>
        ))}
      </div>

      {/* Bloque principal (chart / tabla) */}
      <SkeletonCard className="space-y-4">
        <Skeleton className="h-4 w-40" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </SkeletonCard>

      <span className="sr-only">Cargando…</span>
    </div>
  )
}
