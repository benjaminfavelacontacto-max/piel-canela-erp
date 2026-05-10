"use client"

import { Package, TrendingUp, AlertTriangle, DollarSign } from "lucide-react"

interface CategoryPill {
  label: string
  count: number
  color: string
}

interface StatCard {
  label: string
  value: string | number
  valueColor?: string
  sub: string
  icon: React.ReactNode
  iconBg: string
  pills?: CategoryPill[]
  trend?: { value: string; positive: boolean }
}

interface InventoryStatsProps {
  totalProductos: number
  totalSkus: number
  valorInventario: number
  capitalInvertido: number
  utilidadPotencial: number
  margenPct: number
  stockCritico: number
  agotados: number
  stockBajo: number
  categorias: { nombre: string; count: number }[]
}

export function InventoryStats({
  totalSkus,
  valorInventario,
  capitalInvertido,
  utilidadPotencial,
  margenPct,
  stockCritico,
  agotados,
  stockBajo,
  categorias,
}: InventoryStatsProps) {
  const fmt = (v: number) =>
    v.toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    })

  const topCats = categorias.slice(0, 3)

  // Pills tonales sobre fondo claro — tonos saturados con bg suave
  const pillColors: Record<string, { bg: string; text: string }> = {
    ACTIVADORES: { bg: "rgba(5,150,105,0.10)", text: "#047857" },
    CINTAS: { bg: "rgba(217,119,6,0.10)", text: "#B45309" },
    POTENCIADORES: { bg: "rgba(99,102,241,0.10)", text: "#4F46E5" },
    OXIGENANTES: { bg: "rgba(8,145,178,0.10)", text: "#0E7490" },
    OTROS: { bg: "rgba(100,116,139,0.08)", text: "#475569" },
  }

  const cards: StatCard[] = [
    {
      label: "VALOR INVENTARIO",
      value: fmt(valorInventario),
      valueColor: "#0F172A",
      sub: `${totalSkus} SKUs activos`,
      icon: <Package style={{ width: 16, height: 16 }} />,
      iconBg: "rgba(99,102,241,0.10)",
      pills: topCats.map((c) => ({
        label: c.nombre,
        count: c.count,
        color: c.nombre,
      })),
    },
    {
      label: "CAPITAL INVERTIDO",
      value: fmt(capitalInvertido),
      valueColor: "#0F172A",
      sub: "costo total de compra de stock disponible",
      icon: <DollarSign style={{ width: 16, height: 16 }} />,
      iconBg: "rgba(197,164,126,0.18)",
      trend: {
        value: `${margenPct.toFixed(1)}% margen`,
        positive: margenPct > 50,
      },
    },
    {
      label: "UTILIDAD POTENCIAL",
      value: fmt(utilidadPotencial),
      valueColor: "#047857",
      sub: "si se vende todo el stock",
      icon: <TrendingUp style={{ width: 16, height: 16 }} />,
      iconBg: "rgba(5,150,105,0.10)",
      trend: { value: `${margenPct.toFixed(1)}% margen neto`, positive: true },
    },
    {
      label: "STOCK CRÍTICO",
      value: stockCritico,
      valueColor:
        stockCritico > 10
          ? "#B91C1C"
          : stockCritico > 5
            ? "#B45309"
            : "#047857",
      sub: `${agotados} agotados · ${stockBajo} bajos`,
      icon: <AlertTriangle style={{ width: 16, height: 16 }} />,
      iconBg:
        stockCritico > 10
          ? "rgba(220,38,38,0.10)"
          : "rgba(217,119,6,0.10)",
      trend:
        stockCritico === 0
          ? { value: "Todo en orden ✓", positive: true }
          : { value: "Requieren atención", positive: false },
    },
  ]

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12,
        marginBottom: 0,
      }}
    >
      {cards.map((card, i) => (
        <div
          key={i}
          style={{
            background: "white",
            border: "1px solid rgba(15,23,42,0.06)",
            borderRadius: 14,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 0,
            boxShadow: "0 1px 2px rgba(15,23,42,0.03)",
            minHeight: 108,
            transition: "all 0.18s cubic-bezier(0.4,0,0.2,1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)"
            e.currentTarget.style.boxShadow =
              "0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.04)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)"
            e.currentTarget.style.boxShadow = "0 1px 2px rgba(15,23,42,0.03)"
          }}
        >
          {/* LABEL + ICON */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
              gap: 8,
            }}
          >
            <p
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#64748B",
              }}
            >
              {card.label}
            </p>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: card.iconBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#475569",
                flexShrink: 0,
              }}
            >
              {card.icon}
            </div>
          </div>

          {/* VALUE */}
          <p
            style={{
              fontSize:
                typeof card.value === "string" && card.value.length > 9
                  ? 20
                  : 24,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: card.valueColor || "#0F172A",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
              marginBottom: 6,
            }}
          >
            {card.value}
          </p>

          {/* CONTEXT */}
          <div style={{ marginTop: "auto" }}>
            <p
              style={{
                fontSize: 11,
                color: "#64748B",
                marginBottom: card.pills ? 6 : 0,
                lineHeight: 1.35,
              }}
            >
              {card.sub}
            </p>

            {card.pills && card.pills.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 4,
                  alignItems: "center",
                }}
              >
                {card.pills.map((pill, pi) => {
                  const colors =
                    pillColors[pill.label.toUpperCase()] ?? pillColors["OTROS"]
                  return (
                    <span
                      key={pi}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "2px 8px",
                        borderRadius: 9999,
                        fontSize: 10,
                        fontWeight: 600,
                        background: colors.bg,
                        color: colors.text,
                        border: `1px solid ${colors.text}22`,
                        letterSpacing: "0.02em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {pill.label.length > 8
                        ? pill.label.slice(0, 8) + "."
                        : pill.label}
                      <span style={{ opacity: 0.6 }}>{pill.count}</span>
                    </span>
                  )
                })}
              </div>
            )}

            {card.trend && !card.pills && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "2px 8px",
                  borderRadius: 9999,
                  fontSize: 10,
                  fontWeight: 600,
                  background: card.trend.positive
                    ? "rgba(5,150,105,0.10)"
                    : "rgba(220,38,38,0.10)",
                  color: card.trend.positive ? "#047857" : "#B91C1C",
                  border: `1px solid ${
                    card.trend.positive
                      ? "rgba(5,150,105,0.20)"
                      : "rgba(220,38,38,0.20)"
                  }`,
                }}
              >
                {card.trend.positive ? "↑" : "↓"} {card.trend.value}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
