/**
 * Dictado LOCAL (respaldo): graba con el micrófono, detecta cuándo dejas de hablar y
 * transcribe con Whisper corriendo en el navegador (ver public/whisper-worker.js).
 * Gratis, sin enviar el audio a ningún servidor. Solo cliente.
 */

export type Grabacion = {
  /** Termina la grabación y entrega lo grabado. */
  detener: () => void
  /** Descarta la grabación (el resultado será null). */
  cancelar: () => void
  /** Audio mono a 16 kHz listo para Whisper, o null si no se escuchó voz. */
  resultado: Promise<Float32Array | null>
}

const UMBRAL_VOZ = 0.02
const SILENCIO_MS = 1500
const ESPERA_VOZ_MS = 8000
const MAXIMO_MS = 30000

export function grabar(stream: MediaStream, analyser: AnalyserNode): Grabacion {
  const trozos: Blob[] = []
  const rec = new MediaRecorder(stream)
  let cancelado = false
  let hablo = false
  let ultimaVoz = 0
  const inicio = performance.now()
  const datos = new Uint8Array(512)

  const resultado = new Promise<Float32Array | null>((resolver) => {
    rec.ondataavailable = (e) => {
      if (e.data.size) trozos.push(e.data)
    }
    rec.onstop = async () => {
      clearInterval(vigia)
      if (cancelado || !hablo) return resolver(null)
      try {
        const bytes = await new Blob(trozos, { type: rec.mimeType }).arrayBuffer()
        resolver(await aMono16k(bytes))
      } catch {
        resolver(null)
      }
    }
  })

  const detener = () => {
    if (rec.state !== "inactive") rec.stop()
  }

  const vigia = setInterval(() => {
    analyser.getByteTimeDomainData(datos)
    let suma = 0
    for (let i = 0; i < datos.length; i++) {
      const v = (datos[i] - 128) / 128
      suma += v * v
    }
    const ahora = performance.now()
    if (Math.sqrt(suma / datos.length) > UMBRAL_VOZ) {
      hablo = true
      ultimaVoz = ahora
    }
    if (
      (hablo && ahora - ultimaVoz > SILENCIO_MS) ||
      (!hablo && ahora - inicio > ESPERA_VOZ_MS) ||
      ahora - inicio > MAXIMO_MS
    ) {
      detener()
    }
  }, 100)

  rec.start()
  return {
    detener,
    cancelar: () => {
      cancelado = true
      detener()
    },
    resultado,
  }
}

async function aMono16k(bytes: ArrayBuffer): Promise<Float32Array | null> {
  const ctx = new AudioContext()
  try {
    const buf = await ctx.decodeAudioData(bytes)
    if (buf.duration < 0.4) return null
    const fuera = new OfflineAudioContext(1, Math.ceil(buf.duration * 16000), 16000)
    const fuente = fuera.createBufferSource()
    fuente.buffer = buf
    fuente.connect(fuera.destination)
    fuente.start()
    return (await fuera.startRendering()).getChannelData(0)
  } finally {
    void ctx.close().catch(() => {})
  }
}

let worker: Worker | null = null
let consecutivo = 0

/** Transcribe audio 16 kHz mono. `onEstado` informa descarga del modelo y transcripción. */
export function transcribir(
  audio: Float32Array,
  onEstado: (e: { fase: "descargando"; pct: number } | { fase: "transcribiendo" }) => void,
): Promise<string> {
  worker ??= new Worker("/whisper-worker.js", { type: "module" })
  const w = worker
  const id = ++consecutivo
  return new Promise((resolver, rechazar) => {
    const alMensaje = (e: MessageEvent) => {
      const m = e.data as { tipo: string; id?: number; pct?: number; texto?: string; mensaje?: string }
      if (m.tipo === "progreso") onEstado({ fase: "descargando", pct: m.pct ?? 0 })
      else if (m.tipo === "transcribiendo") onEstado({ fase: "transcribiendo" })
      else if (m.id === id && (m.tipo === "texto" || m.tipo === "error")) {
        w.removeEventListener("message", alMensaje)
        w.removeEventListener("error", alError)
        if (m.tipo === "texto") resolver((m.texto ?? "").trim())
        else rechazar(new Error(m.mensaje))
      }
    }
    const alError = () => {
      w.removeEventListener("message", alMensaje)
      w.removeEventListener("error", alError)
      worker = null
      rechazar(new Error("worker"))
    }
    w.addEventListener("message", alMensaje)
    w.addEventListener("error", alError)
    w.postMessage({ id, audio }, [audio.buffer])
  })
}
