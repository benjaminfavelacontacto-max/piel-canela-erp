import { ReactNode, CSSProperties } from "react"

type GlassCardProps = {
  children: ReactNode
  className?: string
  hover?: boolean
  dark?: boolean
  style?: CSSProperties
}

export function GlassCard({
  children,
  className = "",
  hover = true,
  dark = false,
  style,
}: GlassCardProps) {
  const base: CSSProperties = dark
    ? {
        background: "rgba(27,48,34,0.88)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        color: "white",
      }
    : {
        background: "rgba(255,255,255,0.75)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.6)",
        boxShadow:
          "0 8px 32px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.8) inset, 0 -1px 0 rgba(0,0,0,0.04) inset",
      }

  return (
    <div
      className={`rounded-2xl transition-all duration-300 ${
        hover ? "hover:-translate-y-0.5" : ""
      } ${className}`}
      style={{ ...base, ...style }}
    >
      {children}
    </div>
  )
}
