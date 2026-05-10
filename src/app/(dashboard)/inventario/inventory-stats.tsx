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

  const pillColors: Record<string, { bg: string; text: string }> = {
    ACTIVADORES: { bg: "rgba(52,211,153,0.12)", text: "#34D399" },
    CINTAS: { bg: "rgba(251,191,36,0.12)", text: "#FBBF24" },
    POTENCIADORES: { bg: "rgba(129,140,248,0.12)", text: "#818CF8" },
    OXIGENANTES: { bg: "rgba(56,189,248,0.12)", text: "#38BDF8" },
    OTROS: { bg: "rgba(255,255,255,0.08)", text: "rgba(255,255,255,0.5)" },
  }

  const cards: StatCard[] = [
    {
      label: "VALOR INVENTARIO",
      value: fmt(valorInventario),
      valueColor: "rgba(255,255,255,0.92)",
      sub: `${totalSkus} SKUs activos`,
      icon: <Package style={{ width: 16, height: 16 }} />,
      iconBg: "rgba(129,140,248,0.15)",
      pills: topCats.map((c) => ({
        label: c.nombre,
        count: c.count,
        color: c.nombre,
      })),
    },
    {
      label: "CAPITAL INVERTIDO",
      value: fmt(capitalInvertido),
      valueColor: "rgba(255,255,255,0.92)",
      sub: "costo total de compras",
      icon: <DollarSign style={{ width: 16, height: 16 }} />,
      iconBg: "rgba(197,164,126,0.15)",
      trend: {
        value: `${margenPct.toFixed(1)}% margen`,
        positive: margenPct > 50,
      },
    },
    {
      label: "UTILIDAD POTENCIAL",
      value: fmt(utilidadPotencial),
      valueColor: "#34D399",
      sub: "si se vende todo el stock",
      icon: <TrendingUp style={{ width: 16, height: 16 }} />,
      iconBg: "rgba(52,211,153,0.15)",
      trend: { value: `${margenPct.toFixed(1)}% margen neto`, positive: true },
    },
    {
      label: "STOCK CRÍTICO",
      value: stockCritico,
      valueColor:
        stockCritico > 10
          ? "#F87171"
          : stockCritico > 5
            ? "#FBBF24"
            : "#34D399",
      sub: `${agotados} agotados · ${stockBajo} bajos`,
      icon: <AlertTriangle style={{ width: 16, height: 16 }} />,
      iconBg:
        stockCritico > 10
          ? "rgba(248,113,113,0.15)"
          : "rgba(251,191,36,0.15)",
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
        marginBottom: 20,
      }}
    >
      {cards.map((card, i) => (
        <div
          key={i}
          style={{
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 20,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 0,
            boxShadow:
              "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)",
            minHeight: 160,
            transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.06)"
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"
            e.currentTarget.style.transform = "translateY(-2px)"
            e.currentTarget.style.boxShadow =
              "0 16px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.04)"
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"
            e.currentTarget.style.transform = "translateY(0)"
            e.currentTarget.style.boxShadow =
              "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)"
          }}
        >
          {/* LABEL + ICON */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <p
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.30)",
              }}
            >
              {card.label}
            </p>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: card.iconBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.6)",
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
                  ? 22
                  : 28,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: card.valueColor || "rgba(255,255,255,0.92)",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
              marginBottom: 8,
              flex: 1,
              display: "flex",
              alignItems: "center",
            }}
          >
            {card.value}
          </p>

          {/* CONTEXT */}
          <div style={{ marginTop: "auto" }}>
            <p
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.30)",
                marginBottom: card.pills ? 8 : 0,
                lineHeight: 1.4,
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
                    ? "rgba(52,211,153,0.12)"
                    : "rgba(248,113,113,0.12)",
                  color: card.trend.positive ? "#34D399" : "#F87171",
                  border: `1px solid ${
                    card.trend.positive
                      ? "rgba(52,211,153,0.2)"
                      : "rgba(248,113,113,0.2)"
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
