"use client"

import {
  ShoppingBag,
  TrendingUp,
  Wallet,
  CircleDollarSign,
  Package,
  Percent,
  Receipt,
  Gift,
} from "lucide-react"
import { formatMXN2 } from "@/lib/utils"
import {
  KpiCards,
  round2,
  casiIgual,
  type KpiCard,
  type KpiFila,
} from "@/components/kpi-cards"

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

export function VentaKpis(p: VentaKpisProps) {
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

  const cards: KpiCard[] = [
    {
      id: "total",
      label: "Total",
      value: fmt(p.total),
      sub: p.iva > 0 ? `incluye IVA ${fmt(p.iva)}` : "sin IVA",
      icon: ShoppingBag,
      tone: "neutral",
      ayuda: {
        que: "Lo que le cobras al cliente por esta venta.",
        filas: [
          { texto: "Subtotal de la venta", valor: fmt(p.subtotal) },
          ...(conPartidas
            ? [
                {
                  texto: "Σ precio × cantidad de las partidas",
                  valor: fmt(p.subtotalPartidas),
                } as KpiFila,
              ]
            : []),
          ...(subtotalDesfasado
            ? [
                {
                  texto:
                    "No coinciden: el subtotal de la venta se editó a mano y ya no refleja las partidas.",
                  alerta: true,
                } as KpiFila,
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
                } as KpiFila,
              ]),
        ],
        fuente:
          "ventas.total es una columna GENERATED: la calcula Postgres desde subtotal, iva y descuento. El descuento baja la base antes del IVA (estándar fiscal MX).",
      },
    },
    {
      id: "iva",
      label: "IVA real",
      value: p.iva > 0 ? fmt(p.iva) : "Sin IVA",
      sub:
        p.iva > 0 ? "cobrado en esta venta" : "esta venta se cobró sin IVA",
      icon: Receipt,
      tone: "teal",
      valorNeutro: p.iva === 0,
      ayuda: {
        que: "El impuesto que efectivamente se cobró en esta venta.",
        filas: [
          { texto: "Base gravable (subtotal − descuento)", valor: fmt(baseNeta) },
          { texto: "× 16%", valor: fmt(round2(baseNeta * 0.16)) },
          { texto: "IVA guardado en la venta", valor: fmt(p.iva) },
          ...(p.iva > 0 && !casiIgual(p.iva, round2(baseNeta * 0.16))
            ? [
                {
                  texto:
                    "No es exactamente el 16% de la base: se capturó o editó a mano.",
                  alerta: true,
                } as KpiFila,
              ]
            : []),
          {
            texto:
              "Se cobra por cuenta del SAT: entra al total pero NO a la ganancia.",
          },
        ],
        fuente:
          "Regla del proyecto: cotizaciones.iva = referencial (presentación); ventas.iva = REAL cobrado. Los reportes financieros usan siempre el de ventas.",
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
      tone: "neutral",
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
                } as KpiFila,
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
      tone: ganancia >= 0 ? "emerald" : "rose",
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
                } as KpiFila,
              ]
            : []),
          ...(p.regalos.costo > 0
            ? [
                {
                  texto: `Ya trae restados ${fmt(p.regalos.costo)} de regalos (los obsequios no suman a la base pero sí al costo).`,
                } as KpiFila,
              ]
            : []),
          ...(gananciaBD != null
            ? [
                {
                  texto: casiIgual(gananciaBD, ganancia)
                    ? "Columna ventas.ganancia: coincide ✓"
                    : `Columna ventas.ganancia guarda ${fmt(gananciaBD)} — otra fórmula (por eso los reportes no la usan).`,
                  alerta: !casiIgual(gananciaBD, ganancia),
                } as KpiFila,
              ]
            : []),
          ...(utilidadBD != null
            ? [
                {
                  texto: casiIgual(utilidadBD, ganancia)
                    ? "Columna ventas.utilidad_neta: coincide ✓"
                    : `Columna ventas.utilidad_neta guarda ${fmt(utilidadBD)}.`,
                  alerta: !casiIgual(utilidadBD, ganancia),
                } as KpiFila,
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
      tone: margen >= 30 ? "emerald" : margen >= 15 ? "amber" : "rose",
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
      id: "regalos",
      label: "Regalos (costo)",
      value: fmt(p.regalos.costo),
      sub:
        p.regalos.piezas > 0
          ? `${p.regalos.piezas} ${p.regalos.piezas === 1 ? "pza" : "pzs"} · valor ${fmt(p.regalos.valor)}`
          : "sin cortesías en esta venta",
      icon: Gift,
      tone: "fuchsia",
      valorNeutro: p.regalos.costo === 0,
      ayuda: {
        que: "Lo que te costaron los productos que se fueron gratis.",
        filas: [
          {
            texto: "Piezas regaladas",
            valor: String(p.regalos.piezas),
          },
          { texto: "Costo (pérdida real)", valor: fmt(p.regalos.costo) },
          { texto: "Valor a precio de lista", valor: fmt(p.regalos.valor) },
          {
            texto: "Margen cedido (valor − costo)",
            valor: fmt(round2(p.regalos.valor - p.regalos.costo)),
          },
          {
            texto:
              "Este costo ya está dentro de \u201cCosto total\u201d y por tanto ya está restado de la ganancia: aquí solo se hace visible.",
          },
        ],
        fuente:
          "Partidas de venta_items con es_regalo = true: van en $0 para el cliente, con su costo real y el precio de lista congelado en precio_lista.",
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
      tone: "blue",
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
      tone: p.saldoBD > 0 ? "amber" : "neutral",
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
                } as KpiFila,
              ]),
        ],
        fuente:
          "ventas.saldo_pendiente es una columna GENERATED: Postgres la calcula como total − cantidad_pagada.",
      },
    },
  ]

  return <KpiCards cards={cards} />
}
