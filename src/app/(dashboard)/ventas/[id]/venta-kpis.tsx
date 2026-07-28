"use client"

import { useState } from "react"
import {
  ShoppingBag,
  TrendingUp,
  Wallet,
  CircleDollarSign,
  Package,
  Percent,
  HelpCircle,
  AlertTriangle,
} from "lucide-react"
import { formatMXN2 } from "@/lib/utils"

/**
 * KPIs del detalle de venta con explicación del cálculo.
 *
 * Cada tarjeta trae un (?) que abre de dónde sale el número: la fórmula, la
 * cuenta con los importes REALES de esta venta y qué columna de la BD la
 * respalda. Donde el dato guardado no cuadra con la fórmula (venta editada a
 * mano, o columnas GENERATED con otra definición), se avisa en vez de esconderlo.
 *
 * Las cifras del encabezado se calculan AQUÍ y no se leen de `ventas.ganancia`:
 * esa columna GENERATED no coincide con la fórmula que usan los reportes
 * (ver nota en ventas-dashboard.tsx). El (?) compara ambas y marca cuál cuadra.
 */

const round2 = (n: number) => Math.round(n * 100) / 100
const casiIgual = (a: number, b: number) => Math.abs(a - b) < 0.02

export type VentaKpisProps = {
  subtotal: number
  iva: number
  descuento: number
  total: number
  costoProductos: number
  costoEnvio: number
  /** Columna `ventas.ganancia` (GENERATED) tal cual está guardada. */
  gananciaBD: number | null
  /** Columna `ventas.utilidad_neta` (GENERATED) tal cual está guardada. */
  utilidadNetaBD: number | null
  pagado: number
  /** Columna `ventas.saldo_pendiente` (GENERATED). */
  saldoBD: number
  /** Σ costo_unitario × cantidad de las partidas de esta venta. */
  costoPartidas: number
  /** Σ precio_unitario × cantidad de las partidas (los regalos suman 0). */
  subtotalPartidas: number
  itemsCount: number
  regalos: { lineas: number; piezas: number; costo: number; valor: number }
}

type Fila = { texto: string; valor?: string; alerta?: boolean }

export function VentaKpis(p: VentaKpisProps) {
  const [abierto, setAbierto] = useState<string | null>(null)

  // ─── Cálculos (todos derivados de las columnas de la venta) ───────
  const baseNeta = round2(p.subtotal - p.descuento) // lo vendido sin IVA
  const totalCalc = round2(baseNeta + p.iva)
  const costoTotal = round2(p.costoProductos + p.costoEnvio)
  // El IVA se cobra para el SAT: NO es utilidad, por eso la ganancia parte de
  // la base neta y no del total.
  const ganancia = round2(baseNeta - costoTotal)
  const margen = baseNeta > 0 ? (ganancia / baseNeta) * 100 : 0
  const saldoCalc = round2(Math.max(0, p.total - p.pagado))

  // Qué fórmula reproduce cada columna GENERATED de esta venta.
  const gananciaBD = p.gananciaBD == null ? null : round2(p.gananciaBD)
  const utilidadBD = p.utilidadNetaBD == null ? null : round2(p.utilidadNetaBD)
  const conIva = round2(p.total - costoTotal) // total (con IVA) − costos
  // Solo tiene sentido contrastar contra las partidas si la venta TIENE
  // partidas: las ventas viejas se capturaron con totales a mano.
  const conPartidas = p.itemsCount > 0
  const costoDesfasado =
    conPartidas && !casiIgual(p.costoProductos, p.costoPartidas)
  const subtotalDesfasado =
    conPartidas && !casiIgual(p.subtotal, p.subtotalPartidas)

  const fmt = (n: number) => formatMXN2(n)
  const pct = (n: number) => `${n.toFixed(1)}%`

  const cards: {
    id: string
    label: string
    value: string
    sub?: string
    icon: React.ComponentType<{ className?: string }>
    tone: string
    ayuda: { que: string; filas: Fila[]; fuente: string }
  }[] = [
    {
      id: "total",
      label: "Total",
      value: fmt(p.total),
      sub: p.iva > 0 ? `incluye IVA ${fmt(p.iva)}` : "sin IVA",
      icon: ShoppingBag,
      tone: "text-gray-900",
      ayuda: {
        que: "Lo que le cobras al cliente por esta venta.",
        filas: [
          { texto: "Subtotal de la venta", valor: fmt(p.subtotal) },
          ...(conPartidas
            ? [
                {
                  texto: "Σ precio × cantidad de las partidas",
                  valor: fmt(p.subtotalPartidas),
                } as Fila,
              ]
            : []),
          ...(subtotalDesfasado
            ? [
                {
                  texto:
                    "No coinciden: el subtotal de la venta se editó a mano y ya no refleja las partidas.",
                  alerta: true,
                } as Fila,
              ]
            : []),
          { texto: "− Descuento", valor: fmt(p.descuento) },
          { texto: "= Base neta (sin IVA)", valor: fmt(baseNeta) },
          { texto: "+ IVA 16% sobre la base", valor: fmt(p.iva) },
          { texto: "= Total", valor: fmt(totalCalc) },
          ...(casiIgual(totalCalc, p.total)
            ? []
            : [
                {
                  texto: `El total guardado (${fmt(p.total)}) no coincide con esa cuenta.`,
                  alerta: true,
                } as Fila,
              ]),
        ],
        fuente:
          "ventas.total es una columna GENERATED: la calcula Postgres desde subtotal, iva y descuento. El descuento baja la base antes del IVA (estándar fiscal MX).",
      },
    },
    {
      id: "costo",
      label: "Costo total",
      value: fmt(costoTotal),
      sub:
        p.costoEnvio > 0
          ? `productos ${fmt(p.costoProductos)} · envío ${fmt(p.costoEnvio)}`
          : `${p.itemsCount} ${p.itemsCount === 1 ? "partida" : "partidas"}`,
      icon: Package,
      tone: "text-gray-900",
      ayuda: {
        que: "Lo que te costó a ti surtir esta venta (no lo que cobraste).",
        filas: [
          {
            texto: "Costo de productos (columna de la venta)",
            valor: fmt(p.costoProductos),
          },
          {
            texto: "Σ costo unitario × cantidad de las partidas",
            valor: fmt(p.costoPartidas),
          },
          ...(costoDesfasado
            ? [
                {
                  texto:
                    "No coinciden: el costo de la venta se capturó o editó a mano y ya no refleja las partidas.",
                  alerta: true,
                } as Fila,
              ]
            : []),
          { texto: "+ Costo de envío", valor: fmt(p.costoEnvio) },
          { texto: "= Costo total", valor: fmt(costoTotal) },
          ...(p.regalos.lineas > 0
            ? [
                {
                  texto: `De ese costo, ${p.regalos.piezas} pzs son regalo`,
                  valor: fmt(p.regalos.costo),
                },
              ]
            : []),
        ],
        fuente:
          "costo_productos y costo_envio se guardan en la venta al crearla (se copian de la cotización) y se pueden ajustar en Editar venta. El costo unitario de cada partida queda congelado al momento de vender.",
      },
    },
    {
      id: "ganancia",
      label: "Ganancia neta",
      value: fmt(ganancia),
      sub: p.iva > 0 ? "el IVA no cuenta como ganancia" : "base − costos",
      icon: TrendingUp,
      tone: ganancia >= 0 ? "text-emerald-700" : "text-rose-700",
      ayuda: {
        que: "Lo que realmente te queda de esta venta antes de gastos fijos.",
        filas: [
          { texto: "Base neta (subtotal − descuento)", valor: fmt(baseNeta) },
          { texto: "− Costo de productos", valor: fmt(p.costoProductos) },
          { texto: "− Costo de envío", valor: fmt(p.costoEnvio) },
          { texto: "= Ganancia neta", valor: fmt(ganancia) },
          ...(p.iva > 0
            ? [
                {
                  texto: `No se parte del total (${fmt(p.total)}) porque ${fmt(p.iva)} de IVA se cobran para el SAT: son de paso, no utilidad. Con el total daría ${fmt(conIva)}.`,
                } as Fila,
              ]
            : []),
          ...(p.regalos.costo > 0
            ? [
                {
                  texto: `Ya trae restados ${fmt(p.regalos.costo)} de regalos (los obsequios no suman a la base pero sí al costo).`,
                } as Fila,
              ]
            : []),
          ...(gananciaBD != null
            ? [
                {
                  texto: casiIgual(gananciaBD, ganancia)
                    ? "Columna ventas.ganancia: coincide ✓"
                    : `Columna ventas.ganancia guarda ${fmt(gananciaBD)} — otra fórmula (por eso los reportes no la usan).`,
                  alerta: !casiIgual(gananciaBD, ganancia),
                } as Fila,
              ]
            : []),
          ...(utilidadBD != null
            ? [
                {
                  texto: casiIgual(utilidadBD, ganancia)
                    ? "Columna ventas.utilidad_neta: coincide ✓"
                    : `Columna ventas.utilidad_neta guarda ${fmt(utilidadBD)}.`,
                  alerta: !casiIgual(utilidadBD, ganancia),
                } as Fila,
              ]
            : []),
        ],
        fuente:
          "Este número se calcula aquí con las columnas de la venta, no se lee de la BD: ventas.ganancia y ventas.utilidad_neta son columnas GENERATED con fórmulas propias y arriba se comparan contra esta cuenta.",
      },
    },
    {
      id: "margen",
      label: "Margen neto",
      value: pct(margen),
      sub: `${fmt(ganancia)} de ${fmt(baseNeta)}`,
      icon: Percent,
      tone:
        margen >= 30
          ? "text-emerald-700"
          : margen >= 15
            ? "text-amber-700"
            : "text-rose-700",
      ayuda: {
        que: "De cada peso vendido (sin IVA), cuánto se queda como ganancia.",
        filas: [
          { texto: "Ganancia neta", valor: fmt(ganancia) },
          { texto: "÷ Base neta (subtotal − descuento)", valor: fmt(baseNeta) },
          { texto: "= Margen", valor: pct(margen) },
          {
            texto:
              "Se divide entre la base sin IVA, no entre el total: si no, el IVA cobrado inflaría la venta y el margen saldría más bajo de lo real.",
          },
        ],
        fuente:
          "Calculado en la app a partir de las columnas de la venta. No hay columna de margen en la base de datos.",
      },
    },
    {
      id: "pagado",
      label: "Pagado",
      value: fmt(p.pagado),
      sub:
        p.total > 0
          ? `${Math.min(100, (p.pagado / p.total) * 100).toFixed(0)}% del total`
          : undefined,
      icon: CircleDollarSign,
      tone: "text-blue-700",
      ayuda: {
        que: "Cuánto ha entrado de dinero por esta venta.",
        filas: [
          { texto: "Cantidad pagada registrada", valor: fmt(p.pagado) },
          { texto: "Total de la venta", valor: fmt(p.total) },
        ],
        fuente:
          "ventas.cantidad_pagada se captura a mano al crear o editar la venta. De ahí sale el estatus: 0 = pendiente, menos que el total = parcial, completo = pagada.",
      },
    },
    {
      id: "saldo",
      label: "Saldo",
      value: fmt(p.saldoBD),
      sub: p.saldoBD > 0 ? "por cobrar" : "liquidada",
      icon: Wallet,
      tone: p.saldoBD > 0 ? "text-amber-700" : "text-gray-900",
      ayuda: {
        que: "Lo que el cliente todavía te debe.",
        filas: [
          { texto: "Total", valor: fmt(p.total) },
          { texto: "− Pagado", valor: fmt(p.pagado) },
          { texto: "= Saldo", valor: fmt(saldoCalc) },
          ...(casiIgual(saldoCalc, p.saldoBD)
            ? []
            : [
                {
                  texto: `El saldo guardado (${fmt(p.saldoBD)}) no coincide con esa resta.`,
                  alerta: true,
                } as Fila,
              ]),
        ],
        fuente:
          "ventas.saldo_pendiente es una columna GENERATED: Postgres la calcula como total − cantidad_pagada.",
      },
    },
  ]

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
      {cards.map((c) => {
        const Icon = c.icon
        const open = abierto === c.id
        return (
          <div
            key={c.id}
            className="relative rounded-xl border border-gray-200 bg-white p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {c.label}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAbierto(open ? null : c.id)}
                  aria-expanded={open}
                  aria-label={`¿De dónde sale ${c.label}?`}
                  title="¿De dónde sale este número?"
                  className={`rounded-full p-0.5 transition-colors ${
                    open
                      ? "bg-[#0F766E] text-white"
                      : "text-gray-300 hover:bg-gray-100 hover:text-[#0F766E]"
                  }`}
                >
                  <HelpCircle className="size-4" />
                </button>
                <Icon className={`size-4 ${c.tone}`} />
              </div>
            </div>
            <div className={`mt-2 text-xl font-semibold tabular-nums ${c.tone}`}>
              {c.value}
            </div>
            {c.sub && (
              <div className="mt-0.5 text-[11px] text-gray-500">{c.sub}</div>
            )}

            {open && (
              <>
                {/* Capa para cerrar al tocar fuera (mismo patrón que el
                    selector de cliente de cotizaciones). */}
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setAbierto(null)}
                />
                <div className="absolute left-3 right-3 top-14 z-30 rounded-xl border border-gray-200 bg-white p-3 shadow-[0_16px_40px_rgba(15,23,42,0.18)] sm:left-auto sm:right-4 sm:w-80">
                  <p className="text-xs font-semibold text-gray-900">
                    {c.label}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-gray-600">
                    {c.ayuda.que}
                  </p>
                  <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                    {c.ayuda.filas.map((f, i) => (
                      <li
                        key={i}
                        className={`flex items-start justify-between gap-2 text-[11px] ${
                          f.alerta ? "text-amber-700" : "text-gray-700"
                        }`}
                      >
                        <span className="flex-1 leading-snug">
                          {f.alerta && (
                            <AlertTriangle className="mr-1 inline size-3 -translate-y-px" />
                          )}
                          {f.texto}
                        </span>
                        {f.valor && (
                          <span className="shrink-0 font-semibold tabular-nums">
                            {f.valor}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 border-t border-gray-100 pt-2 text-[10.5px] leading-snug text-gray-500">
                    {c.ayuda.fuente}
                  </p>
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
