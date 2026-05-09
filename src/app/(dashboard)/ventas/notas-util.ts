/**
 * Strips a leading "Método: X." tag (written by saveVenta) from notas and
 * returns the method label + the rest of the text.
 */
export function parseNotas(notas: string | null): {
  metodo: string | null
  notas: string
} {
  if (!notas) return { metodo: null, notas: "" }
  const m = notas.match(/^Método:\s*([^.]+)\.\s*(.*)$/s)
  if (m) return { metodo: m[1].trim(), notas: m[2].trim() }
  return { metodo: null, notas }
}
