"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { formatMXN } from "@/lib/utils"

export type PortalCotizacion = {
  id: string
  numero: string
  total: number
  created_at: string
  cliente_nombre: string | null
  cliente_telefono: string | null
}

function formatPhoneIntl(tel: string | null | undefined): string {
  if (!tel) return ""
  const digits = tel.replace(/\D/g, "")
  return digits.startsWith("52") ? digits : `52${digits}`
}

export function PortalBadge({
  cotizaciones,
  children,
}: {
  cotizaciones: PortalCotizacion[]
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  if (cotizaciones.length === 0) {
    return <>{children}</>
  }

  return (
    <div style={{ position: "relative" }} ref={wrapperRef}>
      {children}

      {/* Badge rojo arriba-derecha */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`${cotizaciones.length} cotizacion${cotizaciones.length === 1 ? "" : "es"} del portal`}
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          background: "#ef4444",
          color: "white",
          borderRadius: "50%",
          width: 22,
          height: 22,
          fontSize: 11,
          fontWeight: 700,
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 8px rgba(239,68,68,0.45)",
          zIndex: 10,
          padding: 0,
        }}
      >
        {cotizaciones.length > 9 ? "9+" : cotizaciones.length}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            width: 360,
            maxHeight: 400,
            overflowY: "auto",
            background: "#0f172a",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 14,
            boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
            zIndex: 99999,
            marginTop: 8,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(255,255,255,0.80)",
                margin: 0,
              }}
            >
              🛍️ Del portal — {cotizaciones.length} pendiente
              {cotizaciones.length === 1 ? "" : "s"}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.4)",
                cursor: "pointer",
                fontSize: 16,
                padding: 0,
              }}
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          {/* Lista */}
          {cotizaciones.map((cot) => {
            const phone = formatPhoneIntl(cot.cliente_telefono)
            const waText = encodeURIComponent(
              `Hola ${cot.cliente_nombre ?? ""}! Recibimos tu pedido en Piel Canela (${cot.numero}). Te enviaremos tu cotización formal en breve.`,
            )
            return (
              <div
                key={cot.id}
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                {/* Fila superior: número + fecha */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#34D399",
                      margin: 0,
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, monospace",
                    }}
                  >
                    {cot.numero}
                  </p>
                  <p
                    style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.30)",
                      margin: 0,
                    }}
                  >
                    {new Date(cot.created_at).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                {/* Cliente */}
                <p
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.70)",
                    marginBottom: 6,
                    margin: "0 0 6px 0",
                  }}
                >
                  {cot.cliente_nombre ?? "Sin nombre"}
                  {cot.cliente_telefono && (
                    <span
                      style={{
                        color: "rgba(255,255,255,0.35)",
                        marginLeft: 6,
                      }}
                    >
                      · {cot.cliente_telefono}
                    </span>
                  )}
                </p>

                {/* Total + acciones */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "white",
                      margin: 0,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatMXN(Number(cot.total) || 0)}
                  </p>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Link
                      href={`/cotizaciones/${cot.id}/confirmar`}
                      onClick={() => setOpen(false)}
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#34D399",
                        background: "rgba(52,211,153,0.10)",
                        border: "1px solid rgba(52,211,153,0.20)",
                        padding: "3px 8px",
                        borderRadius: 6,
                        textDecoration: "none",
                      }}
                    >
                      Ver →
                    </Link>
                    {phone && (
                      <a
                        href={`https://wa.me/${phone}?text=${waText}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#25D366",
                          background: "rgba(37,211,102,0.10)",
                          border: "1px solid rgba(37,211,102,0.20)",
                          padding: "3px 8px",
                          borderRadius: 6,
                          textDecoration: "none",
                        }}
                      >
                        💬
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Footer */}
          <div
            style={{
              padding: "10px 16px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <Link
              href="/cotizaciones"
              onClick={() => setOpen(false)}
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.40)",
                textDecoration: "none",
                display: "block",
                textAlign: "center",
              }}
            >
              Ver todas las cotizaciones →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
