"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Bell, X, ShoppingCart, Package, Wallet } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

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

function tipoIcon(tipo: NotifTipo) {
  if (tipo === "pedido_portal") return ShoppingCart
  if (tipo === "stock_bajo") return Package
  return Wallet
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
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const nuevas = notifs.length

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
        if (data) setNotifs(data as Notificacion[])
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
          type="button"
          onClick={() => setOpen((o) => !o)}
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
          <div className="absolute bottom-full right-0 z-50 mb-2 w-96 overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.06)] bg-white shadow-[0_24px_48px_rgba(15,23,42,0.10),0_4px_12px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.04)] px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Notificaciones
                {nuevas > 0 && (
                  <span className="ml-2 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">
                    {nuevas} {nuevas === 1 ? "nueva" : "nuevas"}
                  </span>
                )}
              </h3>
              {notifs.length > 0 && (
                <button
                  type="button"
                  onClick={marcarTodasLeidas}
                  className="text-xs text-gray-400 transition-colors hover:text-gray-700"
                >
                  Marcar todas leídas
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifs.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell className="mx-auto mb-2 size-6 text-gray-300" />
                  <p className="text-sm text-gray-400">
                    Sin notificaciones nuevas
                  </p>
                </div>
              ) : (
                notifs.map((notif) => {
                  const Icon = tipoIcon(notif.tipo)
                  const wp = whatsappUrl(notif)
                  return (
                    <div
                      key={notif.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => irACotizacion(notif)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") irACotizacion(notif)
                      }}
                      className="cursor-pointer border-b border-[rgba(15,23,42,0.04)] px-4 py-3 transition-colors hover:bg-[rgba(15,118,110,0.03)]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#DFF7F4] text-[#0F766E]">
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-900">
                            {notif.titulo}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                            {notif.mensaje}
                          </p>
                          {notif.datos?.cliente_telefono && (
                            <p className="mt-1 text-xs text-[#0F766E]">
                              📱 {notif.datos.cliente_telefono}
                            </p>
                          )}
                          <p className="mt-1 text-[10px] text-gray-400">
                            {timeAgo(notif.created_at)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            void marcarLeida(notif.id)
                          }}
                          className="shrink-0 text-gray-300 transition-colors hover:text-gray-500"
                          aria-label="Marcar como leída"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                      {notif.tipo === "pedido_portal" && (
                        <div className="ml-11 mt-2 flex gap-2">
                          <span className="rounded-md bg-[#DFF7F4] px-2 py-1 text-[10px] font-semibold text-[#0F766E]">
                            Ver cotización →
                          </span>
                          {wp && (
                            <a
                              href={wp}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
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
            </div>

            {notifs.length > 0 && (
              <Link
                href="/cotizaciones?filtro=portal"
                onClick={() => setOpen(false)}
                className="block border-t border-[rgba(15,23,42,0.04)] px-4 py-2.5 text-center text-[11px] font-medium text-gray-500 transition-colors hover:bg-[rgba(15,23,42,0.02)] hover:text-gray-900"
              >
                Ver todas las cotizaciones del portal
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  )
}
