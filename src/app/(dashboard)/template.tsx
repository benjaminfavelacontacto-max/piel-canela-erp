/**
 * Transición de entrada entre pantallas: el contenido aparece con un fundido
 * corto (solo opacidad: un `transform` aquí cambiaría el bloque contenedor de
 * los elementos `fixed` — FAB, hojas inferiores — mientras dura la animación).
 * Se vuelve a montar en cada navegación; con "reducir movimiento" no anima.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="pc-page-enter">{children}</div>
}
