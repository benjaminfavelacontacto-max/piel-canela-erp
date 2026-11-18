"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  ArrowUp,
  Check,
  Copy,
  Mic,
  Package,
  Sparkles,
  Square,
  SquarePen,
  TrendingUp,
  Users,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from "lucide-react"
import type { EventoAsistente, Grafica, MensajeEntrada, ProductoFicha, Uso } from "@/lib/asistente/tipos"
import { GraficaAsistente } from "./grafica"
import { SiriOnda } from "./siri-onda"
import { grabar, transcribir, type Grabacion } from "@/lib/asistente/dictado-local"
import "./asistente.css"

/** Evento global para abrir el asistente desde cualquier parte (p. ej. ⌘K). */
export const OPEN_ASISTENTE_EVENT = "pc:open-asistente"

type Parte =
  | { tipo: "texto"; texto: string }
  | { tipo: "grafica"; grafica: Grafica }
  | { tipo: "productos"; productos: ProductoFicha[] }

type Mensaje = {
  id: string
  rol: "user" | "assistant"
  partes: Parte[]
  estado?: string
  pendiente?: boolean
  error?: string
  uso?: Uso
}

const STORAGE_CHAT = "pc-asistente-chat-v1"
const STORAGE_VOZ = "pc-asistente-voz"
const STORAGE_LOCAL = "pc-dictado-local"

const SUGERENCIAS = [
  { icono: TrendingUp, titulo: "Ventas del mes", pregunta: "¿Cuánto vendimos este mes y cuánta ganancia dejó? Compáralo con el mes pasado." },
  { icono: Package, titulo: "Por agotarse", pregunta: "¿Qué productos están agotados o con stock bajo?" },
  { icono: Wallet, titulo: "Por cobrar", pregunta: "¿Quién nos debe dinero y cuánto?" },
  { icono: Users, titulo: "Mejores clientes", pregunta: "Muéstrame una gráfica con los 5 clientes que más han comprado." },
]

const RESORTE = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 } as const

let contador = 0
const nuevoId = () => Date.now().toString(36) + "-" + (contador++).toString(36)

/** Separa el cuerpo de la respuesta de la línea final «>> a | b | c» (preguntas de seguimiento). */
function separar(texto: string): { cuerpo: string; sugerencias: string[] } {
  const i = texto.startsWith(">>") ? 0 : texto.lastIndexOf("\n>>") + 1
  if (i === 0 && !texto.startsWith(">>")) {
    // Mientras llega el texto, oculta un «>» suelto al final para que no parpadee.
    return { cuerpo: texto.replace(/\n>?$/, ""), sugerencias: [] }
  }
  const linea = texto.slice(i + 2).split("\n")[0]
  return {
    cuerpo: texto.slice(0, i).trimEnd(),
    sugerencias: linea
      .split("|")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 3),
  }
}

function aEntrada(m: Mensaje): MensajeEntrada {
  const texto = m.partes
    .map((p) =>
      p.tipo === "texto"
        ? p.texto
        : p.tipo === "grafica"
          ? "[Gráfica mostrada: " + p.grafica.titulo + "]"
          : "[Fotos mostradas: " + p.productos.map((x) => x.sku).join(", ") + "]",
    )
    .join("\n")
    .trim()
  return { rol: m.rol, texto: texto.slice(0, 5500) }
}

function paraLeer(md: string): string {
  return separar(md)
    .cuerpo.replace(/\|[^\n]*\|/g, " ") // tablas
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#`>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

// ─── Reconocimiento de voz del navegador (gratis, sin servicios externos) ───
type Reconocedor = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}
function crearReconocedor(): Reconocedor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: new () => Reconocedor
    webkitSpeechRecognition?: new () => Reconocedor
  }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return Ctor ? new Ctor() : null
}

const md: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-pc-ink">{children}</strong>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-pc-ink-4">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-pc-ink-3">{children}</ol>,
  h1: ({ children }) => <h3 className="mb-1 mt-3 text-[15px] font-semibold tracking-tight text-pc-ink">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1 mt-3 text-[15px] font-semibold tracking-tight text-pc-ink">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1 mt-3 text-[14px] font-semibold tracking-tight text-pc-ink">{children}</h4>,
  code: ({ children }) => <code className="rounded-md bg-pc-tint px-1 py-0.5 text-[12.5px]">{children}</code>,
  hr: () => <hr className="my-3 border-pc-line-soft" />,
  a: ({ href, children }) =>
    href?.startsWith("/") ? (
      <Link href={href} className="font-medium text-pc-teal-ink underline decoration-pc-teal/30 underline-offset-2 hover:decoration-pc-teal">
        {children}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-pc-teal-ink underline underline-offset-2">
        {children}
      </a>
    ),
  img: () => null,
  table: ({ children }) => (
    <div className="my-2.5 overflow-x-auto rounded-xl border border-pc-line-soft bg-pc-card">
      <table className="w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  ),
  th: ({ children, style }) => (
    <th style={style} className="whitespace-nowrap border-b border-pc-line-soft bg-pc-subtle px-2.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-pc-ink-3">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="border-b border-pc-line-soft px-2.5 py-1.5 tabular-nums text-pc-ink-2 [tr:last-child>&]:border-b-0">
      {children}
    </td>
  ),
}

function Orbe({ size, activo, children }: { size: number; activo?: boolean; children?: React.ReactNode }) {
  return (
    <span
      className="pc-ai-orb flex shrink-0 items-center justify-center text-white"
      data-activo={activo ? "true" : "false"}
      style={{ width: size, height: size, boxShadow: "0 6px 22px rgba(20,184,166,0.35), 0 2px 8px rgba(139,92,246,0.3)" }}
      aria-hidden
    >
      {children}
    </span>
  )
}

export function Asistente({ oculto = false }: { oculto?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const [voz, setVoz] = useState(false)
  const [soportaDictado, setSoportaDictado] = useState(false)
  const [escuchando, setEscuchando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [vozEstado, setVozEstado] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)

  const mensajesRef = useRef<Mensaje[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const recRef = useRef<Reconocedor | null>(null)
  const dictadoRef = useRef("")
  const grabRef = useRef<Grabacion | null>(null)
  const modoLocalRef = useRef(false)
  const respaldoRef = useRef(false)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const medidorRef = useRef<{ stream: MediaStream; ctx: AudioContext } | null>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const enviarRef = useRef<(p: string, porVoz?: boolean) => void>(() => {})

  useEffect(() => {
    mensajesRef.current = mensajes
  }, [mensajes])

  // Estado inicial desde el navegador (después de hidratar, para no desajustar el HTML del servidor).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const guardado = sessionStorage.getItem(STORAGE_CHAT)
        if (guardado) setMensajes(JSON.parse(guardado) as Mensaje[])
        setVoz(localStorage.getItem(STORAGE_VOZ) === "1")
        modoLocalRef.current = localStorage.getItem(STORAGE_LOCAL) === "1"
      } catch {
        // almacenamiento bloqueado: se sigue sin persistencia
      }
      setSoportaDictado(crearReconocedor() !== null || typeof MediaRecorder !== "undefined")
    }, 0)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (ocupado) return
    try {
      sessionStorage.setItem(STORAGE_CHAT, JSON.stringify(mensajes.slice(-40)))
    } catch {
      // sin persistencia
    }
  }, [mensajes, ocupado])

  // ⌘J / Ctrl+J abre o cierra; Esc cierra; evento global para abrir desde otros componentes.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault()
        setAbierto((a) => !a)
      } else if (e.key === "Escape") {
        setAbierto(false)
      }
    }
    const abrir = () => setAbierto(true)
    window.addEventListener("keydown", tecla)
    window.addEventListener(OPEN_ASISTENTE_EVENT, abrir)
    return () => {
      window.removeEventListener("keydown", tecla)
      window.removeEventListener(OPEN_ASISTENTE_EVENT, abrir)
    }
  }, [])

  useEffect(() => {
    if (abierto && window.matchMedia("(min-width: 768px)").matches) {
      const t = setTimeout(() => inputRef.current?.focus(), 250)
      return () => clearTimeout(t)
    }
    if (!abierto) {
      recRef.current?.abort()
      grabRef.current?.cancelar()
      detenerMedidor()
      window.speechSynthesis?.cancel()
    }
  }, [abierto])

  useEffect(() => {
    const el = listaRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [mensajes, abierto])

  const hablar = useCallback((contenido: string) => {
    const synth = window.speechSynthesis
    const frase = paraLeer(contenido)
    if (!synth || !frase) return
    synth.cancel()
    const u = new SpeechSynthesisUtterance(frase)
    u.lang = "es-MX"
    u.rate = 1.05
    const vozEs = synth.getVoices().find((v) => v.lang === "es-MX") ?? synth.getVoices().find((v) => v.lang.startsWith("es"))
    if (vozEs) u.voice = vozEs
    synth.speak(u)
  }, [])

  const enviar = useCallback(
    async (pregunta: string, porVoz = false) => {
      const limpio = pregunta.trim()
      if (!limpio || abortRef.current) return
      window.speechSynthesis?.cancel()
      setAviso(null)

      const previo = mensajesRef.current
      const user: Mensaje = { id: nuevoId(), rol: "user", partes: [{ tipo: "texto", texto: limpio }] }
      const asis: Mensaje = { id: nuevoId(), rol: "assistant", partes: [], pendiente: true, estado: "Pensando…" }
      setMensajes([...previo, user, asis])
      setTexto("")
      setOcupado(true)
      if (inputRef.current) inputRef.current.style.height = "auto"

      const historial = [...previo, user]
        .map(aEntrada)
        .filter((m) => m.texto)
        .slice(-14)
      const ctrl = new AbortController()
      abortRef.current = ctrl
      const editar = (fn: (m: Mensaje) => Mensaje) =>
        setMensajes((ms) => ms.map((m) => (m.id === asis.id ? fn(m) : m)))
      let acumulado = ""

      const aplicar = (ev: EventoAsistente) => {
        switch (ev.t) {
          case "texto":
            acumulado += ev.d
            editar((m) => {
              const partes = [...m.partes]
              const ultima = partes[partes.length - 1]
              if (ultima?.tipo === "texto") partes[partes.length - 1] = { tipo: "texto", texto: ultima.texto + ev.d }
              else partes.push({ tipo: "texto", texto: ev.d })
              return { ...m, partes, estado: undefined }
            })
            break
          case "estado":
            editar((m) => ({ ...m, estado: ev.d }))
            break
          case "grafica":
            editar((m) => ({ ...m, partes: [...m.partes, { tipo: "grafica", grafica: ev.d }] }))
            break
          case "productos":
            editar((m) => ({ ...m, partes: [...m.partes, { tipo: "productos", productos: ev.d }] }))
            break
          case "error":
            editar((m) => ({ ...m, error: ev.d, estado: undefined }))
            break
          case "fin":
            editar((m) => ({ ...m, uso: ev.d, pendiente: false, estado: undefined }))
            break
        }
      }

      try {
        const res = await fetch("/api/asistente", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mensajes: historial }),
          signal: ctrl.signal,
        })
        const tipo = res.headers.get("content-type") ?? ""
        if (!res.ok || !res.body || !tipo.includes("ndjson")) {
          let error = "Tu sesión expiró. Recarga la página e inicia sesión de nuevo."
          if (tipo.includes("json")) {
            const j = (await res.json().catch(() => null)) as { error?: string } | null
            if (j?.error) error = j.error
          }
          editar((m) => ({ ...m, error, pendiente: false, estado: undefined }))
          return
        }
        const lector = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ""
        for (;;) {
          const { done, value } = await lector.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          let salto: number
          while ((salto = buf.indexOf("\n")) >= 0) {
            const linea = buf.slice(0, salto)
            buf = buf.slice(salto + 1)
            if (linea.trim()) aplicar(JSON.parse(linea) as EventoAsistente)
          }
        }
        if ((porVoz || voz) && acumulado) hablar(acumulado)
      } catch {
        if (!ctrl.signal.aborted) {
          editar((m) => ({ ...m, error: "Se perdió la conexión. Intenta de nuevo." }))
        }
      } finally {
        editar((m) => ({ ...m, pendiente: false, estado: undefined }))
        abortRef.current = null
        setOcupado(false)
      }
    },
    [hablar, voz],
  )
  useEffect(() => {
    enviarRef.current = enviar
  }, [enviar])

  const detener = () => abortRef.current?.abort()

  const nuevoChat = () => {
    detener()
    window.speechSynthesis?.cancel()
    setMensajes([])
    setAviso(null)
    inputRef.current?.focus()
  }

  const alternarVoz = () => {
    setVoz((v) => {
      const sig = !v
      if (!sig) window.speechSynthesis?.cancel()
      try {
        localStorage.setItem(STORAGE_VOZ, sig ? "1" : "0")
      } catch {
        // sin persistencia
      }
      return sig
    })
  }

  /** Libera el micrófono usado solo para medir el volumen de la animación. */
  const detenerMedidor = () => {
    analyserRef.current = null
    const m = medidorRef.current
    medidorRef.current = null
    if (m) {
      m.stream.getTracks().forEach((t) => t.stop())
      void m.ctx.close().catch(() => {})
    }
  }

  /** Respaldo gratis: graba, detecta el silencio y transcribe con Whisper dentro del navegador. */
  const dictarLocal = async () => {
    window.speechSynthesis?.cancel()
    setAviso(null)
    setTexto("")
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setAviso("Permite el uso del micrófono en tu navegador para dictar.")
      return
    }
    const ctx = new AudioContext()
    const an = ctx.createAnalyser()
    an.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(an)
    medidorRef.current = { stream, ctx }
    analyserRef.current = an
    const g = grabar(stream, an)
    grabRef.current = g
    setEscuchando(true)
    const audio = await g.resultado
    grabRef.current = null
    detenerMedidor()
    setEscuchando(false)
    if (!audio) {
      setAviso("No escuché nada. Toca el micrófono y habla enseguida.")
      return
    }
    setVozEstado("Preparando el dictado…")
    try {
      const t = await transcribir(audio, (e) =>
        setVozEstado(
          e.fase === "descargando"
            ? "Descargando el modelo de voz (solo la primera vez) " + e.pct + "%"
            : "Transcribiendo…",
        ),
      )
      setVozEstado(null)
      if (t) enviarRef.current(t, true)
      else setAviso("No entendí lo que dijiste. Intenta de nuevo.")
    } catch {
      setVozEstado(null)
      setAviso("No pude transcribir tu voz en este navegador. Usa el dictado del teclado (en Mac: tecla 🎤 o Fn dos veces).")
    }
  }

  const alternarDictado = () => {
    if (escuchando) {
      if (grabRef.current) grabRef.current.detener()
      else recRef.current?.stop()
      return
    }
    const rec = modoLocalRef.current ? null : crearReconocedor()
    if (!rec) {
      void dictarLocal()
      return
    }
    window.speechSynthesis?.cancel()
    setAviso(null)
    dictadoRef.current = ""
    rec.lang = "es-MX"
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = (e) => {
      let t = ""
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
      dictadoRef.current = t
      setTexto(t)
    }
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setAviso("Permite el uso del micrófono en tu navegador para dictar.")
      } else if (e.error === "network") {
        // El navegador no alcanza su servicio de dictado (bloqueado, sin API de Google, VPN…):
        // se pasa solo al dictado local y se recuerda para las próximas veces.
        respaldoRef.current = true
        modoLocalRef.current = true
        try {
          localStorage.setItem(STORAGE_LOCAL, "1")
        } catch {
          // sin persistencia
        }
      } else if (e.error === "audio-capture") {
        setAviso("No encontré un micrófono. Revisa que esté conectado y que el navegador tenga permiso en Ajustes del sistema → Privacidad → Micrófono.")
      } else if (e.error === "language-not-supported") {
        setAviso("Tu navegador no tiene dictado en español. Usa el dictado del teclado o prueba en Chrome.")
      } else if (e.error === "no-speech") {
        setAviso("No escuché nada. Toca el micrófono y habla enseguida.")
      } else if (e.error !== "aborted") {
        setAviso("No pude escucharte (" + e.error + "). Intenta de nuevo.")
      }
    }
    rec.onend = () => {
      detenerMedidor()
      setEscuchando(false)
      recRef.current = null
      if (respaldoRef.current) {
        respaldoRef.current = false
        void dictarLocal()
        return
      }
      const dicho = dictadoRef.current.trim()
      dictadoRef.current = ""
      if (dicho) enviarRef.current(dicho, true)
    }
    recRef.current = rec
    try {
      rec.start()
      setEscuchando(true)
      // Medidor de volumen para la animación (opcional: si falla, la onda se mueve sola).
      navigator.mediaDevices
        ?.getUserMedia({ audio: true })
        .then((stream) => {
          if (recRef.current !== rec) {
            stream.getTracks().forEach((t) => t.stop())
            return
          }
          const ctx = new AudioContext()
          const an = ctx.createAnalyser()
          an.fftSize = 512
          ctx.createMediaStreamSource(stream).connect(an)
          medidorRef.current = { stream, ctx }
          analyserRef.current = an
        })
        .catch(() => {})
    } catch {
      setAviso("No pude activar el micrófono.")
    }
  }

  const copiar = async (m: Mensaje) => {
    const contenido = m.partes
      .map((p) => (p.tipo === "texto" ? separar(p.texto).cuerpo : ""))
      .filter(Boolean)
      .join("\n\n")
    try {
      await navigator.clipboard.writeText(contenido)
      setCopiado(m.id)
      setTimeout(() => setCopiado(null), 1600)
    } catch {
      // portapapeles no disponible
    }
  }

  const ultimo = mensajes[mensajes.length - 1]
  const vacio = mensajes.length === 0

  return (
    <>
      {/* ─── Botón flotante ─── */}
      <AnimatePresence>
        {!abierto && !oculto && (
          <motion.button
            key="lanzador"
            type="button"
            onClick={() => setAbierto(true)}
            aria-label="Abrir asistente con IA"
            title="Asistente (⌘J)"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.93 }}
            transition={RESORTE}
            className="fixed bottom-[calc(var(--pc-nav-h)+var(--pc-safe-bottom)+0.875rem)] left-3.5 z-40 rounded-full outline-none focus-visible:ring-4 focus-visible:ring-pc-teal/30 md:bottom-6 md:left-auto md:right-6 print:hidden"
          >
            <Orbe size={54}>
              <Sparkles className="size-[22px] drop-shadow" strokeWidth={2} />
            </Orbe>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ─── Panel ─── */}
      <AnimatePresence>
        {abierto && (
          <motion.div
            key="panel"
            role="dialog"
            aria-label="Asistente con inteligencia artificial"
            initial={{ opacity: 0, y: 28, scale: 0.94, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 20, scale: 0.96, filter: "blur(6px)" }}
            transition={RESORTE}
            style={{
              transformOrigin: "bottom right",
              background: "color-mix(in srgb, var(--pc-bg-card) 84%, transparent)",
              backdropFilter: "blur(30px) saturate(1.7)",
              WebkitBackdropFilter: "blur(30px) saturate(1.7)",
            }}
            className="fixed inset-0 z-[60] flex flex-col overflow-hidden text-pc-ink shadow-[0_30px_80px_-12px_rgba(0,0,0,0.35),0_0_0_1px_var(--pc-hair)] md:inset-auto md:bottom-6 md:right-6 md:h-[min(720px,calc(100dvh-3rem))] md:w-[440px] md:rounded-[28px] print:hidden"
          >
            {/* Encabezado */}
            <header className="flex shrink-0 items-center gap-3 border-b border-pc-line-soft px-4 pb-3 pt-[calc(var(--pc-safe-top)+0.875rem)] md:pt-3.5">
              <Orbe size={34} activo={ocupado || escuchando}>
                <Sparkles className="size-4" strokeWidth={2.2} />
              </Orbe>
              <div className="min-w-0 flex-1">
                <h2 className="text-[14.5px] font-semibold leading-tight tracking-tight">Asistente</h2>
                <p className="truncate text-[11px] text-pc-ink-3">
                  {escuchando ? "Escuchando…" : ocupado ? "Trabajando…" : "Pregunta lo que sea de tu negocio"}
                </p>
              </div>
              <BotonIcono onClick={alternarVoz} etiqueta={voz ? "Dejar de leer respuestas en voz alta" : "Leer respuestas en voz alta"} activo={voz}>
                {voz ? <Volume2 className="size-[17px]" /> : <VolumeX className="size-[17px]" />}
              </BotonIcono>
              <BotonIcono onClick={nuevoChat} etiqueta="Nueva conversación">
                <SquarePen className="size-[17px]" />
              </BotonIcono>
              <BotonIcono onClick={() => setAbierto(false)} etiqueta="Cerrar">
                <X className="size-[18px]" />
              </BotonIcono>
            </header>

            {/* Conversación */}
            <div ref={listaRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              {vacio ? (
                <div className="flex min-h-full flex-col items-center justify-center pb-4 text-center">
                  <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...RESORTE, delay: 0.08 }}>
                    <Orbe size={76} activo={escuchando}>
                      <Sparkles className="size-8" strokeWidth={1.8} />
                    </Orbe>
                  </motion.div>
                  <motion.h3
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.16 }}
                    className="mt-5 text-[21px] font-semibold tracking-tight"
                  >
                    ¿En qué te ayudo?
                  </motion.h3>
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.22 }}
                    className="mt-1 max-w-[290px] text-[13px] leading-relaxed text-pc-ink-3"
                  >
                    Ventas, inventario, clientes, pedidos o finanzas. Escríbelo o dímelo por voz y te respondo con cifras y gráficas.
                  </motion.p>
                  <div className="mt-6 grid w-full grid-cols-2 gap-2">
                    {SUGERENCIAS.map((sug, i) => (
                      <motion.button
                        key={sug.titulo}
                        type="button"
                        onClick={() => enviar(sug.pregunta)}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...RESORTE, delay: 0.26 + i * 0.05 }}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        className="rounded-2xl border border-pc-line-soft bg-pc-card/80 p-3 text-left transition-colors hover:border-pc-teal/40"
                      >
                        <sug.icono className="size-4 text-pc-teal-ink" strokeWidth={2} />
                        <span className="mt-2 block text-[12.5px] font-semibold tracking-tight">{sug.titulo}</span>
                        <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-pc-ink-3">{sug.pregunta}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {mensajes.map((m) =>
                    m.rol === "user" ? (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 10, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={RESORTE}
                        className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-[20px] rounded-br-md bg-pc-teal px-3.5 py-2 text-[14px] leading-relaxed text-white"
                      >
                        {m.partes[0]?.tipo === "texto" ? m.partes[0].texto : ""}
                      </motion.div>
                    ) : (
                      <RespuestaIA
                        key={m.id}
                        m={m}
                        esUltimo={m.id === ultimo?.id}
                        copiado={copiado === m.id}
                        onCopiar={() => copiar(m)}
                        onSeguir={(p) => enviar(p)}
                      />
                    ),
                  )}
                </div>
              )}
            </div>

            {/* Redacción */}
            <div className="shrink-0 px-3 pb-[calc(var(--pc-safe-bottom)+0.75rem)] pt-1">
              {vozEstado && (
                <p className="pc-ai-shimmer mb-1.5 w-fit px-2 text-[12.5px] font-medium" role="status">
                  {vozEstado}
                </p>
              )}
              <AnimatePresence>
                {aviso && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-2 pb-1.5 text-[11.5px] text-pc-amber-ink"
                  >
                    {aviso}
                  </motion.p>
                )}
              </AnimatePresence>
              <AnimatePresence initial={false}>
                {escuchando && (
                  <motion.div
                    key="siri"
                    initial={{ opacity: 0, height: 0, scale: 0.9 }}
                    animate={{ opacity: 1, height: 128, scale: 1 }}
                    exit={{ opacity: 0, height: 0, scale: 0.9 }}
                    transition={RESORTE}
                    className="mb-2 overflow-hidden rounded-[26px] shadow-[0_10px_40px_-8px_rgba(139,92,246,0.55)]"
                    style={{ background: "linear-gradient(180deg, #0b1220, #14122b)" }}
                    role="status"
                    aria-label="Escuchando"
                  >
                    <SiriOnda analyserRef={analyserRef} />
                  </motion.div>
                )}
              </AnimatePresence>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  enviar(texto)
                }}
                className={
                  "flex items-end gap-1.5 rounded-[26px] border bg-pc-card p-1.5 pl-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.05)] transition-[border-color,box-shadow] focus-within:border-pc-teal/50 focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--pc-chart-real)_12%,transparent)] " +
                  (escuchando ? "border-pc-teal/60" : "border-pc-line")
                }
              >
                {escuchando ? (
                  <div className="flex min-h-9 flex-1 items-center py-1">
                    <span className="min-w-0 flex-1 truncate text-[14px] text-pc-ink-2">{texto || "Te escucho…"}</span>
                  </div>
                ) : (
                  <textarea
                    ref={inputRef}
                    value={texto}
                    rows={1}
                    onChange={(e) => {
                      setTexto(e.target.value)
                      e.target.style.height = "auto"
                      e.target.style.height = Math.min(e.target.scrollHeight, 132) + "px"
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        enviar(texto)
                      }
                    }}
                    placeholder="Pregunta algo…"
                    aria-label="Mensaje para el asistente"
                    className="max-h-[132px] min-h-9 flex-1 resize-none bg-transparent py-2 text-[15px] leading-snug text-pc-ink outline-none placeholder:text-pc-ink-4 md:text-[14px]"
                  />
                )}
                {soportaDictado && !ocupado && !vozEstado && (
                  <motion.button
                    type="button"
                    onClick={alternarDictado}
                    whileTap={{ scale: 0.9 }}
                    aria-label={escuchando ? "Terminar dictado" : "Hablar"}
                    aria-pressed={escuchando}
                    className={
                      "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors " +
                      (escuchando ? "bg-pc-red-soft text-pc-red-ink" : "text-pc-ink-3 hover:bg-pc-tint hover:text-pc-ink")
                    }
                  >
                    {escuchando ? <Square className="size-3.5 fill-current" /> : <Mic className="size-[18px]" />}
                  </motion.button>
                )}
                {ocupado ? (
                  <motion.button
                    type="button"
                    onClick={detener}
                    whileTap={{ scale: 0.9 }}
                    aria-label="Detener respuesta"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pc-ink text-pc-card"
                  >
                    <Square className="size-3 fill-current" />
                  </motion.button>
                ) : (
                  !escuchando && (
                    <motion.button
                      type="submit"
                      disabled={!texto.trim()}
                      whileTap={{ scale: 0.9 }}
                      aria-label="Enviar"
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pc-teal text-white transition-opacity disabled:opacity-30"
                    >
                      <ArrowUp className="size-[18px]" strokeWidth={2.4} />
                    </motion.button>
                  )
                )}
              </form>
              <p className="mt-1.5 hidden text-center text-[10.5px] text-pc-ink-4 md:block">
                Solo lectura · verifica las cifras importantes · ⌘J para abrir o cerrar
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function BotonIcono({
  onClick,
  etiqueta,
  activo,
  children,
}: {
  onClick: () => void
  etiqueta: string
  activo?: boolean
  children: React.ReactNode
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.88 }}
      aria-label={etiqueta}
      title={etiqueta}
      aria-pressed={activo}
      className={
        "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors " +
        (activo ? "bg-pc-teal-soft text-pc-teal-ink" : "text-pc-ink-3 hover:bg-pc-tint hover:text-pc-ink")
      }
    >
      {children}
    </motion.button>
  )
}

function RespuestaIA({
  m,
  esUltimo,
  copiado,
  onCopiar,
  onSeguir,
}: {
  m: Mensaje
  esUltimo: boolean
  copiado: boolean
  onCopiar: () => void
  onSeguir: (pregunta: string) => void
}) {
  const final = m.partes[m.partes.length - 1]
  const sugerencias = final?.tipo === "texto" ? separar(final.texto).sugerencias : []
  const hayTexto = m.partes.some((p) => p.tipo === "texto")

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={RESORTE} className="space-y-3">
      {m.partes.map((p, i) => {
        if (p.tipo === "texto") {
          const s = separar(p.texto)
          if (!s.cuerpo) return null
          return (
            <div key={i} className="text-[14px] leading-relaxed text-pc-ink-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>
                {s.cuerpo}
              </ReactMarkdown>
            </div>
          )
        }
        if (p.tipo === "grafica") {
          return (
            <motion.div key={i} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={RESORTE}>
              <GraficaAsistente grafica={p.grafica} />
            </motion.div>
          )
        }
        return (
          <div key={i} className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
            {p.productos.map((prod, j) => (
              <motion.div
                key={prod.sku}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...RESORTE, delay: j * 0.04 }}
                className="w-[128px] shrink-0 overflow-hidden rounded-2xl border border-pc-line-soft bg-pc-card"
              >
                <div className="flex aspect-square items-center justify-center bg-pc-subtle">
                  {prod.imagen ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={prod.imagen} alt={prod.nombre} loading="lazy" className="size-full object-cover" />
                  ) : (
                    <Package className="size-7 text-pc-ink-4" strokeWidth={1.5} />
                  )}
                </div>
                <div className="p-2">
                  <p className="line-clamp-2 text-[11.5px] font-medium leading-snug text-pc-ink">{prod.nombre}</p>
                  <p className="mt-1 text-[11px] tabular-nums text-pc-ink-3">
                    {prod.stock} pzas
                    {prod.precio != null &&
                      " · " + prod.precio.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )
      })}

      {m.pendiente && m.estado && (
        <p className="pc-ai-shimmer w-fit text-[13px] font-medium" role="status">
          {m.estado}
        </p>
      )}

      {m.error && (
        <p className="rounded-xl border border-pc-red-line bg-pc-red-soft px-3 py-2 text-[12.5px] text-pc-red-ink">{m.error}</p>
      )}

      {!m.pendiente && hayTexto && (
        <div className="flex items-center gap-2 text-[11px] text-pc-ink-4">
          <button
            type="button"
            onClick={onCopiar}
            aria-label="Copiar respuesta"
            className="flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:text-pc-ink-2"
          >
            {copiado ? <Check className="size-3.5 text-pc-green-ink" /> : <Copy className="size-3.5" />}
            {copiado ? "Copiado" : "Copiar"}
          </button>
          {m.uso && m.uso.costoUsd > 0 && (
            <span title={m.uso.tokensEntrada + " tokens de entrada · " + m.uso.tokensSalida + " de salida · " + m.uso.modelo}>
              · costo ≈ ${m.uso.costoUsd < 0.0001 ? "0.0001" : m.uso.costoUsd.toFixed(4)} USD
            </span>
          )}
        </div>
      )}

      {esUltimo && !m.pendiente && sugerencias.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {sugerencias.map((sug, i) => (
            <motion.button
              key={sug}
              type="button"
              onClick={() => onSeguir(sug)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...RESORTE, delay: 0.05 + i * 0.05 }}
              whileTap={{ scale: 0.96 }}
              className="rounded-full border border-pc-line bg-pc-card/70 px-3 py-1.5 text-left text-[12px] text-pc-ink-2 transition-colors hover:border-pc-teal/50 hover:text-pc-teal-ink"
            >
              {sug}
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  )
}
