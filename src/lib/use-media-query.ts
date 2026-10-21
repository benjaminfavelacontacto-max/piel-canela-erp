"use client"

import { useEffect, useState } from "react"

/**
 * Media query reactiva. Primera pasada (servidor + hidratación) = `serverValue`
 * → sin mismatch; ya montado, se actualiza con el valor real y escucha cambios.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const [matches, setMatches] = useState(serverValue)

  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [query])

  return matches
}
