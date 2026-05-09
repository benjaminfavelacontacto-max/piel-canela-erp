/**
 * Tipos de cliente — Single source of truth.
 * Los `value` deben coincidir EXACTAMENTE con los valores del enum
 * `tipo_cliente` en Postgres (lowercase). Los `label` se muestran en UI.
 */

export type TipoCliente =
  | "spa"
  | "salon"
  | "particular"
  | "distribuidor"
  | "curso"
  | "clinica"
  | "prospecto"

export type TipoClienteConf = {
  value: TipoCliente
  label: string
  // Tailwind classes para badge solid (bg + text + ring)
  bgText: string
}

export const TIPOS_CLIENTE: TipoClienteConf[] = [
  { value: "spa",          label: "SPA",          bgText: "bg-blue-100 text-blue-700 ring-blue-200/60" },
  { value: "salon",        label: "Salón",        bgText: "bg-pink-100 text-pink-700 ring-pink-200/60" },
  { value: "clinica",      label: "Clínica",      bgText: "bg-teal-100 text-teal-700 ring-teal-200/60" },
  { value: "distribuidor", label: "Distribuidor", bgText: "bg-amber-100 text-amber-700 ring-amber-200/60" },
  { value: "curso",        label: "Curso",        bgText: "bg-purple-100 text-purple-700 ring-purple-200/60" },
  { value: "particular",   label: "Particular",   bgText: "bg-gray-100 text-gray-700 ring-gray-200/60" },
  { value: "prospecto",    label: "Prospecto",    bgText: "bg-violet-100 text-violet-700 ring-violet-200/60" },
]

export function getTipoConf(tipo: string | null | undefined): TipoClienteConf {
  return (
    TIPOS_CLIENTE.find((t) => t.value === tipo) ??
    TIPOS_CLIENTE.find((t) => t.value === "particular")!
  )
}
