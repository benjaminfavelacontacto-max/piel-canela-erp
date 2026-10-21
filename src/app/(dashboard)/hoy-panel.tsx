import Link from "next/link"
import { CheckCircle2, MessageCircle, Phone, Wallet, FileText, Users } from "lucide-react"
import { formatMXN2 } from "@/lib/utils"
import { normalizarTelefonoMx, whatsappUrl } from "@/lib/whatsapp"
import type { ItemCobrar, ItemContactar, ItemSeguimiento } from "@/lib/hoy"

type Cobrar = { total: number; cantidad: number; items: ItemCobrar[] }
type Seguimiento = { cantidad: number; items: ItemSeguimiento[] }
type Contactar = { cantidad: number; items: ItemContactar[] }

function WaLink({ telefono, texto, label }: { telefono: string | null; texto: string; label: string }) {
  if (!normalizarTelefonoMx(telefono)) return null
  return (
    <a
      href={whatsappUrl(telefono, texto)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 md:size-9"
    >
      <MessageCircle className="size-4" aria-hidden />
    </a>
  )
}

function Seccion({
  icono,
  titulo,
  resumen,
  tono,
  vacio,
  children,
}: {
  icono: React.ReactNode
  titulo: string
  resumen?: string
  tono: string
  vacio: string
  children?: React.ReactNode
}) {
  const tieneItems = !!children
  return (
    <section aria-label={titulo} className="min-w-0">
      <header className="mb-1 flex items-center gap-2">
        <span className={`flex size-7 items-center justify-center rounded-lg ${tono}`} aria-hidden>
          {icono}
        </span>
        <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
        {resumen && <span className="ml-auto text-xs font-semibold tabular-nums text-gray-600">{resumen}</span>}
      </header>
      {tieneItems ? (
        <ul className="divide-y divide-gray-100">{children}</ul>
      ) : (
        <p className="flex items-center gap-1.5 py-3 text-xs text-gray-500">
          <CheckCircle2 className="size-3.5 text-emerald-500" aria-hidden /> {vacio}
        </p>
      )}
    </section>
  )
}

/**
 * "Hoy": lo que conviene atender primero — cobros, cotizaciones sin respuesta
 * y clientes cuyo ritmo de compra ya se cumplió. Cada fila abre el detalle o
 * escribe por WhatsApp con el mensaje armado.
 */
export function HoyPanel({
  cobrar,
  seguimiento,
  contactar,
}: {
  cobrar: Cobrar
  seguimiento: Seguimiento
  contactar: Contactar
}) {
  const todoAlDia =
    cobrar.cantidad === 0 && seguimiento.cantidad === 0 && contactar.cantidad === 0

  return (
    <section className="pc-card" aria-labelledby="hoy-titulo">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 id="hoy-titulo" className="text-base font-bold tracking-tight text-gray-900">
            Hoy
          </h2>
          <p className="text-xs text-gray-500">
            {todoAlDia ? "Nada urgente: todo al día." : "Lo que conviene atender primero"}
          </p>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-3 md:gap-6">
        <Seccion
          icono={<Wallet className="size-3.5 text-amber-700" />}
          titulo="Por cobrar"
          resumen={cobrar.cantidad > 0 ? formatMXN2(cobrar.total) : undefined}
          tono="bg-amber-50"
          vacio="Sin saldos pendientes"
        >
          {cobrar.items.length > 0 &&
            cobrar.items.map((i) => (
              <li key={i.id} className="flex items-center gap-1">
                <Link
                  href={`/ventas/${i.id}`}
                  className="-mx-1 flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-1 py-2 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/30"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">{i.cliente}</span>
                    <span className="block truncate text-xs text-gray-500">
                      {i.dias === 0 ? "de hoy" : `hace ${i.dias} d`} · {i.numero}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-amber-700">
                    {formatMXN2(i.saldo)}
                  </span>
                </Link>
                <WaLink
                  telefono={i.telefono}
                  label={`Recordar pago a ${i.cliente} por WhatsApp`}
                  texto={`Hola ${i.cliente}, te recuerdo el saldo pendiente de ${formatMXN2(i.saldo)} de la venta ${i.numero}. ¡Gracias! — Piel Canela`}
                />
              </li>
            ))}
        </Seccion>

        <Seccion
          icono={<FileText className="size-3.5 text-blue-700" />}
          titulo="Cotizaciones por seguir"
          resumen={seguimiento.cantidad > 0 ? String(seguimiento.cantidad) : undefined}
          tono="bg-blue-50"
          vacio="Ninguna espera respuesta"
        >
          {seguimiento.items.length > 0 &&
            seguimiento.items.map((i) => (
              <li key={i.id} className="flex items-center gap-1">
                <Link
                  href={`/cotizaciones/${i.id}`}
                  className="-mx-1 flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-1 py-2 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/30"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">{i.cliente}</span>
                    <span
                      className={`block truncate text-xs ${i.motivo === "por_vencer" ? "font-medium text-rose-600" : "text-gray-500"}`}
                    >
                      {i.motivo === "por_vencer"
                        ? i.venceEn === 0
                          ? "Vence hoy"
                          : `Vence en ${i.venceEn} d`
                        : `Enviada hace ${i.dias} d`}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                    {formatMXN2(i.total)}
                  </span>
                </Link>
                <WaLink
                  telefono={i.telefono}
                  label={`Dar seguimiento a ${i.cliente} por WhatsApp`}
                  texto={`Hola ${i.cliente}, ¿pudiste revisar la cotización ${i.numero} por ${formatMXN2(i.total)}? Quedo al pendiente. — Piel Canela`}
                />
              </li>
            ))}
        </Seccion>

        <Seccion
          icono={<Users className="size-3.5 text-violet-700" />}
          titulo="Toca contactar"
          resumen={contactar.cantidad > 0 ? String(contactar.cantidad) : undefined}
          tono="bg-violet-50"
          vacio="Nadie por reactivar"
        >
          {contactar.items.length > 0 &&
            contactar.items.map((i) => (
              <li key={i.id} className="flex items-center gap-1">
                <Link
                  href={`/clientes/${i.id}`}
                  className="-mx-1 flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-1 py-2 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/30"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">{i.cliente}</span>
                    <span className="block truncate text-xs text-gray-500">
                      Suele comprar cada {i.cadaDias} d · van {i.sinComprarDias} d
                    </span>
                  </span>
                </Link>
                {normalizarTelefonoMx(i.telefono) ? (
                  <WaLink
                    telefono={i.telefono}
                    label={`Escribir a ${i.cliente} por WhatsApp`}
                    texto={`Hola ${i.cliente}, ¿cómo vas de producto? ¿Te preparo tu pedido? — Piel Canela`}
                  />
                ) : i.telefono ? (
                  <a
                    href={`tel:${i.telefono}`}
                    aria-label={`Llamar a ${i.cliente}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 md:size-9"
                  >
                    <Phone className="size-4" aria-hidden />
                  </a>
                ) : null}
              </li>
            ))}
        </Seccion>
      </div>
    </section>
  )
}
