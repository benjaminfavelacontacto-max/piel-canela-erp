import type { CSSProperties } from "react"

/**
 * Posición `fixed` para un menú desplegable anclado a un botón. Al no ser
 * `absolute`, no lo recortan los contenedores con `overflow` (tablas, tarjetas)
 * y se abre hacia arriba cuando abajo no hay espacio (última fila / barra inferior).
 */
export function posicionMenuFlotante(
  btn: HTMLElement,
  alto = 230,
): CSSProperties {
  const r = btn.getBoundingClientRect()
  const abajo = window.innerHeight - r.bottom
  const right = Math.max(8, window.innerWidth - r.right)
  // Deja libre la barra inferior móvil (~64px) al decidir si cabe abajo
  return abajo - 72 >= alto || r.top < alto
    ? { right, top: r.bottom + 4 }
    : { right, bottom: window.innerHeight - r.top + 4 }
}
