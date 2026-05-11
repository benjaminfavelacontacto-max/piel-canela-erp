"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Bell, X, ShoppingCart } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

const mxn0 = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

type NotifTipo = "pedido_portal" | "stock_bajo" | "pago_pendiente" | string

interface NotifDatos {
  cotizacion_numero?: string
  cotizacion_id?: string
  cliente_nombre?: string
  cliente_negocio?: string
  cliente_telefono?: string
  cliente_email?: string
  cliente_ciudad?: string
  items_count?: number
  subtotal?: number
  notas?: string
  url?: string
  [key: string]: unknown
}

interface Notificacion {
  id: string
  tipo: NotifTipo
  titulo: string
  mensaje: string
  datos: NotifDatos
  leida: boolean
  created_at: string
}

function formatPhoneIntl(tel: string | undefined): string {
  if (!tel) return ""
  const digits = tel.replace(/\D/g, "")
  // Si ya empieza con 52, déjalo. Si no, asume MX y prefija 52.
  return digits.startsWith("52") ? digits : `52${digits}`
}

function whatsappUrl(notif: Notificacion): string | null {
  const tel = formatPhoneIntl(notif.datos?.cliente_telefono)
  if (!tel) return null
  const nombre = notif.datos?.cliente_nombre ?? ""
  const ref = notif.datos?.cotizacion_numero ?? ""
  const text = `Hola ${nombre}! Recibimos tu pedido en Piel Canela${ref ? ` (${ref})` : ""}. Te enviaremos tu cotización formal en breve.`
  return `https://wa.me/${tel}?text=${encodeURIComponent(text)}`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(diff / 3600000)
  if (mins < 1) return "ahora mismo"
  if (mins < 60) return `hace ${mins}m`
  if (hrs < 24) return `hace ${hrs}h`
  return new Date(dateStr).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  })
}

/** Mini-beep generado vía Web Audio (sin assets externos). */
function playBeep() {
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
    const Ctx = W.AudioContext ?? W.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.2)
  } catch {
    /* silencio si el navegador bloquea */
  }
}

export function NotificationBell() {
  const [notifs, setNotifs] = useState<Notificacion[]>([])
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState<Notificacion | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement>(null)
  const bellRef = useRef<HTMLButtonElement>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const nuevas = notifs.length

  // Calcula posición del panel relativa al viewport (fixed)
  // basado en el bounding rect del bell button
  function recalcPos() {
    const el = bellRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ top: r.top, left: r.left })
  }

  function togglePanel() {
    setOpen((prev) => {
      if (!prev) recalcPos()
      return !prev
    })
  }

  // Recalc on window resize while open
  useEffect(() => {
    if (!open) return
    const onScrollOrResize = () => recalcPos()
    window.addEventListener("resize", onScrollOrResize)
    window.addEventListener("scroll", onScrollOrResize, true)
    return () => {
      window.removeEventListener("resize", onScrollOrResize)
      window.removeEventListener("scroll", onScrollOrResize, true)
    }
  }, [open])

  useEffect(() => {
    const supabase = createClient()

    function showToastForNew(nueva: Notificacion) {
      setToast(nueva)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => setToast(null), 8000)
      playBeep()
    }

    /** True si el error es por schema cache desactualizado de PostgREST. */
    function isSchemaCacheError(msg: string | undefined): boolean {
      if (!msg) return false
      const m = msg.toLowerCase()
      return (
        m.includes("schema cache") ||
        m.includes("not find the table") ||
        m.includes("pgrst205")
      )
    }

    // Carga inicial de no-leídas — reintenta si la tabla no está en cache
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    async function cargarNotificaciones() {
      try {
        const { data, error } = await supabase
          .from("notificaciones")
          .select("*")
          .eq("leida", false)
          .order("created_at", { ascending: false })
          .limit(20)

        if (error) {
          if (isSchemaCacheError(error.message)) {
            console.warn(
              "[NotificationBell] tabla aún no en cache PostgREST, reintentando en 5s…",
            )
            retryTimer = setTimeout(() => void cargarNotificaciones(), 5000)
            return
          }
          console.error("[NotificationBell] error cargando:", error.message)
          return
        }
        const arr = (data ?? []) as Notificacion[]
        console.log(
          `[NotificationBell] 🔔 carga inicial: ${arr.length} no leída(s)`,
          arr.map((n) => ({ id: n.id, tipo: n.tipo, created: n.created_at })),
        )
        setNotifs(arr)
      } catch (e) {
        console.error("[NotificationBell] excepción cargando:", e)
      }
    }
    void cargarNotificaciones()

    // Suscripción Realtime — channel name único por tab para evitar
    // colisiones cuando hay múltiples pestañas abiertas
    const channel = supabase
      .channel(`notificaciones-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificaciones" },
        (payload) => {
          const nueva = payload.new as Notificacion
          console.log("[NotificationBell] 🔔 INSERT recibido:", nueva.id)
          setNotifs((prev) =>
            prev.some((n) => n.id === nueva.id) ? prev : [nueva, ...prev],
          )
          showToastForNew(nueva)
        },
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log("[NotificationBell] ✅ Realtime conectado")
        } else if (status === "CHANNEL_ERROR") {
          console.error("[NotificationBell] ❌ Channel error:", err)
        } else if (status === "TIMED_OUT") {
          console.warn("[NotificationBell] ⏱ Realtime timeout")
        } else if (status === "CLOSED") {
          console.warn("[NotificationBell] 🔌 Realtime closed")
        }
      })

    // Función reusable para fetch+merge: usada por polling Y por
    // visibilitychange para responder rápido cuando vuelven a la pestaña
    async function refetchNuevas() {
      try {
        const { data, error } = await supabase
          .from("notificaciones")
          .select("*")
          .eq("leida", false)
          .order("created_at", { ascending: false })
          .limit(20)
        if (error) {
          if (!isSchemaCacheError(error.message)) {
            console.error("[NotificationBell] refetch error:", error.message)
          }
          return
        }
        if (!data) return
        setNotifs((prev) => {
          const idsActuales = new Set(prev.map((n) => n.id))
          const nuevasNotifs = (data as Notificacion[]).filter(
            (n) => !idsActuales.has(n.id),
          )
          if (nuevasNotifs.length === 0) return prev
          console.log(
            `[NotificationBell] 📊 refetch detectó ${nuevasNotifs.length} nuevas`,
          )
          if (nuevasNotifs[0]) showToastForNew(nuevasNotifs[0])
          return data as Notificacion[]
        })
      } catch (e) {
        console.error("[NotificationBell] excepción refetch:", e)
      }
    }

    // FALLBACK: polling cada 8s — cubre si Realtime se cae o si la
    // tabla no está en la publication supabase_realtime
    const polling = setInterval(refetchNuevas, 8000)

    // Refetch inmediato al volver a la pestaña (browsers pausan setInterval
    // en background; visibilitychange evita lag al recuperar el foco)
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refetchNuevas()
    }
    document.addEventListener("visibilitychange", onVisibility)

    // Cerrar panel al click fuera
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)

    return () => {
      console.log("[NotificationBell] desconectando")
      supabase.removeChannel(channel)
      clearInterval(polling)
      if (retryTimer) clearTimeout(retryTimer)
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("visibilitychange", onVisibility)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  async function marcarLeida(id: string) {
    const supabase = createClient()
    await supabase.from("notificaciones").update({ leida: true }).eq("id", id)
    setNotifs((prev) => prev.filter((n) => n.id !== id))
  }

  async function marcarTodasLeidas() {
    const supabase = createClient()
    await supabase.from("notificaciones").update({ leida: true }).eq("leida", false)
    setNotifs([])
  }

  function irACotizacion(notif: Notificacion) {
    void marcarLeida(notif.id)
    setOpen(false)
    setToast(null)
    if (notif.datos?.url) router.push(notif.datos.url)
  }

  return (
    <>
      {/* ─── TOAST ─── */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] w-full max-w-sm">
          <div className="relative overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.12),0_4px_12px_rgba(15,23,42,0.06)]">
            <div
              className="pointer-events-none absolute left-0 top-0 h-[3px] bg-[#0F766E]"
              style={{
                animation: "pc-shrink 8s linear forwards",
                width: "100%",
              }}
            />
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#DFF7F4] text-[#0F766E]">
                <ShoppingCart className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  {toast.titulo}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                  {toast.mensaje}
                </p>
                {toast.datos?.cliente_telefono && (
                  <p className="mt-1 text-xs font-medium text-[#0F766E]">
                    📱 {toast.datos.cliente_telefono}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="shrink-0 text-gray-300 transition-colors hover:text-gray-500"
                aria-label="Cerrar notificación"
              >
                <X className="size-4" />
              </button>
            </div>
            {toast.datos?.url && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => irACotizacion(toast)}
                  className="flex-1 rounded-xl bg-[#0F766E] py-2 text-xs font-semibold text-white transition-colors hover:bg-[#115E59]"
                >
                  Ver pedido →
                </button>
                {(() => {
                  const wp = whatsappUrl(toast)
                  return wp ? (
                    <a
                      href={wp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
                    >
                      💬 WhatsApp
                    </a>
                  ) : null
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── BELL + PANEL ─── */}
      <div className="relative" ref={panelRef}>
        <button
          ref={bellRef}
          type="button"
          onClick={togglePanel}
          className="relative rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-[rgba(15,23,42,0.04)] hover:text-gray-900"
          aria-label="Notificaciones"
        >
          <Bell className="size-4" strokeWidth={1.75} />
          {nuevas > 0 && (
            <span className="absolute -right-1 -top-1 flex size-[18px] items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
              {nuevas > 9 ? "9+" : nuevas}
            </span>
          )}
        </button>

        {open && (
          <div
            data-notif-panel
            style={{
              position: "fixed",
              top: Math.max(8, pos.top - 300),
              left: pos.left,
              width: 360,
              maxHeight: 480,
              overflowY: "auto",
              background: "rgba(11,17,32,0.96)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 20,
              boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
              zIndex: 99999,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.87)",
                    margin: 0,
                  }}
                >
                  Notificaciones
                </p>
                {nuevas > 0 && (
                  <span
                    style={{
                      background: "rgba(52,211,153,0.15)",
                      color: "#34D399",
                      border: "1px solid rgba(52,211,153,0.25)",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 9999,
                    }}
                  >
                    {nuevas} nuevas
                  </span>
                )}
              </div>
              {nuevas > 0 && (
                <button
                  type="button"
                  onClick={marcarTodasLeidas}
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.35)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px 8px",
                    borderRadius: 6,
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "rgba(255,255,255,0.70)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "rgba(255,255,255,0.35)")
                  }
                >
                  Marcar todas leídas
                </button>
              )}
            </div>

            {/* Lista */}
            {notifs.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center" }}>
                <p
                  style={{
                    fontSize: 13,
                    color: "rgba(255,255,255,0.25)",
                    margin: 0,
                  }}
                >
                  Sin notificaciones
                </p>
              </div>
            ) : (
              notifs.map((n) => {
                const wp = whatsappUrl(n)
                const onClickRow = () => {
                  if (!n.leida) void marcarLeida(n.id)
                }
                return (
                  <div
                    key={n.id}
                    onClick={onClickRow}
                    style={{
                      padding: "14px 20px",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      background: n.leida
                        ? "transparent"
                        : "rgba(52,211,153,0.03)",
                      cursor: n.leida ? "default" : "pointer",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "rgba(255,255,255,0.03)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = n.leida
                        ? "transparent"
                        : "rgba(52,211,153,0.03)")
                    }
                  >
                    {/* Fila superior: título + tiempo */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 4,
                        gap: 8,
                      }}
                    >
                      <p
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: n.leida
                            ? "rgba(255,255,255,0.45)"
                            : "rgba(255,255,255,0.87)",
                          margin: 0,
                          lineHeight: 1.3,
                        }}
                      >
                        {n.titulo}
                      </p>
                      <p
                        style={{
                          fontSize: 10,
                          color: "rgba(255,255,255,0.25)",
                          margin: 0,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        {timeAgo(n.created_at)}
                      </p>
                    </div>

                    {/* Mensaje */}
                    <p
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.45)",
                        margin: "0 0 8px 0",
                        lineHeight: 1.5,
                      }}
                    >
                      {n.mensaje}
                    </p>

                    {/* Subtotal si existe */}
                    {typeof n.datos?.subtotal === "number" && (
                      <p
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#34D399",
                          margin: "0 0 8px 0",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {mxn0.format(n.datos.subtotal)}
                      </p>
                    )}

                    {/* Botones de acción */}
                    {(n.datos?.cotizacion_id || wp) && (
                      <div style={{ display: "flex", gap: 6 }}>
                        {n.datos?.cotizacion_id && (
                          <Link
                            href={
                              n.datos.url ??
                              `/cotizaciones/${n.datos.cotizacion_id}`
                            }
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpen(false)
                            }}
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#34D399",
                              background: "rgba(52,211,153,0.10)",
                              border: "1px solid rgba(52,211,153,0.20)",
                              padding: "4px 10px",
                              borderRadius: 8,
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            Ver cotización →
                          </Link>
                        )}
                        {wp && (
                          <a
                            href={wp}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#25D366",
                              background: "rgba(37,211,102,0.10)",
                              border: "1px solid rgba(37,211,102,0.20)",
                              padding: "4px 10px",
                              borderRadius: 8,
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            💬 WhatsApp
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}

            {/* Footer */}
            {notifs.length > 0 && (
              <div
                style={{
                  padding: "12px 20px",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  textAlign: "center",
                }}
              >
                <Link
                  href="/cotizaciones"
                  onClick={() => setOpen(false)}
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.30)",
                    textDecoration: "none",
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "rgba(255,255,255,0.60)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "rgba(255,255,255,0.30)")
                  }
                >
                  Ver todas las cotizaciones →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
