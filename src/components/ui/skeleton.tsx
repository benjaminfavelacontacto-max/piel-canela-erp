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
 * Skeleton de página del dashboard: header + fila de KPIs + bloque de contenido.
 * Se muestra como `loading.tsx` mientras el server component resuelve sus
 * queries (sidebar/barra inferior siguen visibles, sin flash en blanco).
 *
 * - `title`/`subtitle`: texto REAL del encabezado (no barra gris) → la página
 *   "ya se ve" al instante y solo falta el contenido.
 * - `variant="list"`: tarjetas en móvil / filas de tabla en escritorio, igual
 *   que las listas reales. `variant="detail"`: dos bloques de contenido.
 */
export function PageSkeleton({
  kpis = 4,
  title,
  subtitle,
  variant = "list",
  rows = 8,
}: {
  kpis?: number
  title?: string
  subtitle?: string
  variant?: "list" | "detail"
  rows?: number
}) {
  return (
    <div
      className="flex flex-col gap-4 p-4 md:gap-6 md:p-6"
      aria-busy="true"
      aria-live="polite"
    >
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          {title ? (
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-gray-900">
              {title}
            </h1>
          ) : (
            <Skeleton className="h-8 w-48" />
          )}
          {subtitle ? (
            <p className="text-sm text-gray-500">{subtitle}</p>
          ) : (
            <Skeleton className="h-4 w-64" />
          )}
        </div>
        <div className="hidden gap-2 md:flex">
          <Skeleton className="h-[42px] w-32 rounded-[14px]" />
          <Skeleton className="h-[42px] w-36 rounded-[14px]" />
        </div>
      </div>

      {/* KPIs */}
      {kpis > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: kpis }).map((_, i) => (
            <SkeletonCard key={i} className="space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-20" />
            </SkeletonCard>
          ))}
        </div>
      )}

      {variant === "list" ? (
        <>
          {/* Móvil: tarjetas */}
          <div className="space-y-2.5 md:hidden">
            <Skeleton className="h-11 w-full rounded-xl" />
            {Array.from({ length: Math.min(rows, 5) }).map((_, i) => (
              <SkeletonCard key={i} className="space-y-3 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-7 w-24 rounded-full" />
              </SkeletonCard>
            ))}
          </div>
          {/* Escritorio: tabla */}
          <SkeletonCard className="hidden space-y-4 md:block">
            <Skeleton className="h-4 w-40" />
            <div className="space-y-2">
              {Array.from({ length: rows }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          </SkeletonCard>
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <SkeletonCard className="space-y-3 lg:col-span-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-48 w-full" />
          </SkeletonCard>
          <SkeletonCard className="space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </SkeletonCard>
        </div>
      )}

      <span className="sr-only">Cargando…</span>
    </div>
  )
}
