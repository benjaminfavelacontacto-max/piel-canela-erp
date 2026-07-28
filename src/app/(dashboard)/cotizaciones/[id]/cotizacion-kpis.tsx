"use client"

import {
  ShoppingBag,
  Package,
  TrendingUp,
  Percent,
  BadgePercent,
  Receipt,
  Gift,
  Boxes,
} from "lucide-react"
import { formatMXN2 } from "@/lib/utils"
import type { CotizacionItem } from "@/lib/cotizacion-types"
import { resumenRegalos, descuentoEfectivoPct } from "@/lib/regalos"
import {
  KpiCards,
  round2,
  casiIgual,
  type KpiCard,
  type KpiFila,
} from "@/components/kpi-cards"

/**
 * KPIs del detalle de cotización con (?) que explica cada cálculo.
 *
 * Misma filosofía que `venta-kpis.tsx`: la ayuda muestra la cuenta con los
 * importes REALES de esta cotización y contrasta lo guardado contra lo que
 * suman las partidas — si no cuadra (se editó a mano), se avisa en ámbar.
 *
 * Diferencias clave con una venta:
 *  - El IVA aquí es REFERENCIAL (regla del proyecto): el real se define al
 *    registrar la venta. La tarjeta de IVA lo dice.
 *  - La utilidad es la ESTIMADA al cotizar; el (?) la compara contra la
 *    columna GENERATED `cotizaciones.utilidad_neta`.
 */

export type CotizacionKpisProps = {
  subtotal: number
  iva: number
  descuento: number
  total: number
  /** Columna `cotizaciones.costo_productos` tal cual está guardada. */
  costoProductos: number
  costoEnvio: number
  /** Columna `cotizaciones.utilidad_neta` (GENERATED), para contrastar. */
  utilidadNetaBD: number | null
  items: CotizacionItem[]
}

export function CotizacionKpis(p: CotizacionKpisProps) {
  // ─── Derivados de las partidas ────────────────────────────────────
  const costoPartidas = round2(
    p.items.reduce(
      (s, it) => s + Number(it.costo_unitario ?? 0) * Number(it.cantidad ?? 0),
      0,
    ),
  )
  const subtotalPartidas = round2(
    p.items.reduce((s, it) => s + Number(it.subtotal ?? 0), 0),
  )
  const regalos = resumenRegalos(p.items)
  const conPartidas = p.items.length > 0
  const costoDesfasado = conPartidas && !casiIgual(p.costoProductos, costoPartidas)
  const subtotalDesfasado =
    conPartidas && !casiIgual(p.subtotal, subtotalPartidas)

  // ─── Cálculos ─────────────────────────────────────────────────────
  const baseNeta = round2(p.subtotal - p.descuento)
  const totalCalc = round2(baseNeta + p.iva)
  const costoTotal = round2(p.costoProductos + p.costoEnvio)
  // El IVA es de paso (se entera al SAT): la utilidad parte de la base neta.
  const utilidad = round2(baseNeta - costoTotal)
  const margen = baseNeta > 0 ? (utilidad / baseNeta) * 100 : 0
  const utilidadBD = p.utilidadNetaBD == null ? null : round2(p.utilidadNetaBD)
  const descPctSubtotal = p.subtotal > 0 ? (p.descuento / p.subtotal) * 100 : 0
  const descEfectivo = descuentoEfectivoPct({
    subtotal: p.subtotal,
    descuento: p.descuento,
    valorRegalos: regalos.valor,
  })

  const piezasTotal = p.items.reduce((s, it) => s + Number(it.cantidad ?? 0), 0)
  const piezasCobradas = piezasTotal - regalos.piezas
  const precioPromedio = piezasCobradas > 0 ? round2(p.subtotal / piezasCobradas) : 0

  const fmt = (n: number) => formatMXN2(n)
  const pct = (n: number) => `${n.toFixed(1)}%`

  const cards: KpiCard[] = [
    {
      id: "total",
      label: "Total cotizado",
      value: fmt(p.total),
      sub: p.iva > 0 ? `incluye IVA ${fmt(p.iva)}` : "sin IVA",
      icon: ShoppingBag,
      tone: "neutral",
      ayuda: {
        que: "Lo que pagaría el cliente si acepta esta cotización.",
        filas: [
          { texto: "Subtotal", valor: fmt(p.subtotal) },
          ...(conPartidas
            ? [
                {
                  texto: "Σ precio × cantidad de las partidas",
                  valor: fmt(subtotalPartidas),
                } as KpiFila,
              ]
            : []),
          ...(subtotalDesfasado
            ? [
                {
                  texto:
                    "No coinciden: el subtotal guardado ya no refleja las partidas.",
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
          ...(regalos.lineas > 0
            ? [
                {
                  texto: `Los regalos (${regalos.piezas} pzs) van en $0: no suben este total.`,
                } as KpiFila,
              ]
            : []),
        ],
        fuente:
          "cotizaciones.total es una columna GENERATED: la calcula Postgres desde subtotal, iva y descuento. El descuento baja la base antes del IVA (estándar fiscal MX).",
      },
    },
    {
      id: "costo",
      label: "Costo total",
      value: fmt(costoTotal),
      sub:
        p.costoEnvio > 0
          ? `productos ${fmt(p.costoProductos)} · envío ${fmt(p.costoEnvio)}`
          : `${p.items.length} ${p.items.length === 1 ? "partida" : "partidas"}`,
      icon: Package,
      tone: "neutral",
      ayuda: {
        que: "Lo que te costaría a ti surtir este pedido.",
        filas: [
          {
            texto: "Costo de productos (guardado en la cotización)",
            valor: fmt(p.costoProductos),
          },
          {
            texto: "Σ costo unitario × cantidad de las partidas",
            valor: fmt(costoPartidas),
          },
          ...(costoDesfasado
            ? [
                {
                  texto:
                    "No coinciden: el costo guardado ya no refleja las partidas.",
                  alerta: true,
                } as KpiFila,
              ]
            : []),
          { texto: "+ Costo de envío", valor: fmt(p.costoEnvio) },
          { texto: "= Costo total", valor: fmt(costoTotal) },
          ...(regalos.lineas > 0
            ? [
                {
                  texto: `De ese costo, ${regalos.piezas} pzs son regalo`,
                  valor: fmt(regalos.costo),
                } as KpiFila,
              ]
            : []),
        ],
        fuente:
          "El costo unitario de cada partida se congela al cotizar (viene del inventario). costo_productos y costo_envio se guardan en la cotización y viajan a la venta al convertirla.",
      },
    },
    {
      id: "utilidad",
      label: "Utilidad neta",
      value: fmt(utilidad),
      sub: p.iva > 0 ? "el IVA no cuenta como utilidad" : "base − costos",
      icon: TrendingUp,
      tone: utilidad >= 0 ? "emerald" : "rose",
      ayuda: {
        que: "Lo que te quedaría de esta cotización si se vende tal cual.",
        filas: [
          { texto: "Base neta (subtotal − descuento)", valor: fmt(baseNeta) },
          { texto: "− Costo de productos", valor: fmt(p.costoProductos) },
          { texto: "− Costo de envío", valor: fmt(p.costoEnvio) },
          { texto: "= Utilidad neta", valor: fmt(utilidad) },
          ...(p.iva > 0
            ? [
                {
                  texto: `No se parte del total (${fmt(p.total)}): ${fmt(p.iva)} de IVA se cobran para el SAT, son de paso.`,
                } as KpiFila,
              ]
            : []),
          ...(regalos.costo > 0
            ? [
                {
                  texto: `Ya trae restados ${fmt(regalos.costo)} de regalos (no suman a la base pero sí al costo). Sin regalar sería ${fmt(round2(utilidad + regalos.costo))}.`,
                } as KpiFila,
              ]
            : []),
          ...(utilidadBD != null
            ? [
                {
                  texto: casiIgual(utilidadBD, utilidad)
                    ? "Columna cotizaciones.utilidad_neta: coincide ✓"
                    : `Columna cotizaciones.utilidad_neta guarda ${fmt(utilidadBD)}.`,
                  alerta: !casiIgual(utilidadBD, utilidad),
                } as KpiFila,
              ]
            : []),
        ],
        fuente:
          "Calculada aquí con las columnas de la cotización y comparada contra cotizaciones.utilidad_neta (GENERATED). Es una estimación: la utilidad real se confirma en la venta.",
      },
    },
    {
      id: "margen",
      label: "Margen neto",
      value: pct(margen),
      sub: `${fmt(utilidad)} de ${fmt(baseNeta)}`,
      icon: Percent,
      tone: margen >= 30 ? "emerald" : margen >= 15 ? "amber" : "rose",
      ayuda: {
        que: "De cada peso cotizado (sin IVA), cuánto quedaría de utilidad.",
        filas: [
          { texto: "Utilidad neta", valor: fmt(utilidad) },
          { texto: "÷ Base neta (subtotal − descuento)", valor: fmt(baseNeta) },
          { texto: "= Margen", valor: pct(margen) },
          {
            texto:
              "Se divide entre la base sin IVA: si no, el IVA inflaría la venta y el margen saldría más bajo de lo real.",
          },
        ],
        fuente:
          "Calculado en la app. No hay columna de margen en la base de datos.",
      },
    },
    {
      id: "descuento",
      label: "Descuento",
      value: fmt(p.descuento),
      sub:
        p.descuento > 0
          ? `${descPctSubtotal.toFixed(1)}% del subtotal`
          : "sin descuento",
      icon: BadgePercent,
      tone: p.descuento > 0 ? "rose" : "neutral",
      ayuda: {
        que: "Lo que se le rebajó al cliente sobre el precio de lista.",
        filas: [
          { texto: "Descuento aplicado", valor: fmt(p.descuento) },
          { texto: "Sobre un subtotal de", valor: fmt(p.subtotal) },
          { texto: "= % explícito", valor: pct(descPctSubtotal) },
          ...(regalos.valor > 0
            ? [
                {
                  texto: `+ regalos por ${fmt(regalos.valor)} a precio de lista ⇒ descuento EFECTIVO`,
                  valor: pct(descEfectivo),
                } as KpiFila,
              ]
            : []),
        ],
        fuente:
          "cotizaciones.descuento guarda el monto; descuento_tipo/descuento_valor recuerdan si se capturó como % o como $. El descuento efectivo suma el valor de lo regalado — lo que el cliente recibe de más en total.",
      },
    },
    {
      id: "iva",
      label: "IVA",
      value: p.iva > 0 ? fmt(p.iva) : "Sin IVA",
      sub: p.iva > 0 ? "referencial, 16% de la base" : "no se presentó con IVA",
      icon: Receipt,
      tone: "teal",
      valorNeutro: p.iva === 0,
      ayuda: {
        que: "El impuesto tal como se le presentó al cliente en el PDF.",
        filas: [
          { texto: "Base gravable (subtotal − descuento)", valor: fmt(baseNeta) },
          { texto: "× 16%", valor: fmt(round2(baseNeta * 0.16)) },
          ...(p.iva > 0 && !casiIgual(p.iva, round2(baseNeta * 0.16))
            ? [
                {
                  texto: `El IVA guardado (${fmt(p.iva)}) no es exactamente el 16% de la base.`,
                  alerta: true,
                } as KpiFila,
              ]
            : []),
          {
            texto:
              "Este IVA es REFERENCIAL: sirve para presentar al cliente. El IVA real se decide al registrar la venta y puede diferir.",
          },
        ],
        fuente:
          "Regla del proyecto: cotizaciones.iva = referencial (presentación); ventas.iva = real cobrado. Todos los reportes financieros usan el de ventas.",
      },
    },
    {
      id: "regalos",
      label: "Regalos (costo)",
      value: fmt(regalos.costo),
      sub:
        regalos.piezas > 0
          ? `${regalos.piezas} ${regalos.piezas === 1 ? "pza" : "pzs"} · valor ${fmt(regalos.valor)}`
          : "sin cortesías en esta cotización",
      icon: Gift,
      tone: "fuchsia",
      valorNeutro: regalos.costo === 0,
      ayuda: {
        que: "Lo que te costarían los productos que van gratis.",
        filas: [
          { texto: "Piezas regaladas", valor: String(regalos.piezas) },
          { texto: "Costo (pérdida real)", valor: fmt(regalos.costo) },
          { texto: "Valor a precio de lista", valor: fmt(regalos.valor) },
          {
            texto: "Margen cedido (valor − costo)",
            valor: fmt(regalos.margenCedido),
          },
          {
            texto:
              "Este costo ya está dentro de \u201cCosto total\u201d y por eso la utilidad de arriba ya lo trae restado: aquí solo se hace visible.",
          },
        ],
        fuente:
          "Partidas de cotizacion_items con es_regalo = true: van en $0 para el cliente, con su costo real y el precio de lista congelado en precio_lista.",
      },
    },
    {
      id: "volumen",
      label: "Volumen",
      value: `${piezasTotal.toLocaleString("es-MX")} pzs`,
      sub: `${p.items.length} ${p.items.length === 1 ? "línea" : "líneas"}${
        precioPromedio > 0 ? ` · ${fmt(precioPromedio)}/pza` : ""
      }`,
      icon: Boxes,
      tone: "blue",
      valorNeutro: true,
      ayuda: {
        que: "Cuánto producto se está cotizando y a qué precio promedio.",
        filas: [
          { texto: "Piezas totales (incluye regalos)", valor: String(piezasTotal) },
          ...(regalos.piezas > 0
            ? [
                {
                  texto: "Piezas cobradas",
                  valor: String(piezasCobradas),
                } as KpiFila,
              ]
            : []),
          { texto: "Líneas (productos distintos)", valor: String(p.items.length) },
          {
            texto: "Precio promedio = subtotal ÷ piezas cobradas",
            valor: precioPromedio > 0 ? fmt(precioPromedio) : "—",
          },
        ],
        fuente:
          "Σ de cantidades de cotizacion_items. El promedio divide el subtotal solo entre piezas cobradas (las regaladas van en $0 y lo distorsionarían).",
      },
    },
  ]

  return <KpiCards cards={cards} />
}
