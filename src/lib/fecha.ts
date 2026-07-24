/**
 * Parseo de fechas SIN corrimiento de zona horaria.
 *
 * `new Date("2026-07-16")` lo interpreta JS como medianoche **UTC**; al
 * formatearlo en hora de México (UTC−6) retrocede a "15 jul 26". Lo mismo con
 * las claves de mes: `new Date("2026-07" + "-01")` cae en 30 jun → etiqueta el
 * mes anterior en las gráficas.
 *
 * `parseFecha` reconoce los formatos de solo-fecha y los construye en hora
 * LOCAL. Cualquier otra cadena (p. ej. un `timestamptz` completo, que sí trae
 * su propio huso) se delega a `new Date` sin tocar — por eso es seguro usarla
 * en todos lados.
 */

const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/
const SOLO_MES = /^(\d{4})-(\d{2})$/

export function parseFecha(valor: string | number | Date): Date {
  // Copia: quien reciba el resultado puede mutarlo sin tocar el original.
  if (valor instanceof Date) return new Date(valor.getTime())
  if (typeof valor === "number") return new Date(valor)

  const dia = SOLO_FECHA.exec(valor)
  if (dia) {
    return new Date(Number(dia[1]), Number(dia[2]) - 1, Number(dia[3]))
  }

  const mes = SOLO_MES.exec(valor)
  if (mes) {
    return new Date(Number(mes[1]), Number(mes[2]) - 1, 1)
  }

  return new Date(valor)
}
