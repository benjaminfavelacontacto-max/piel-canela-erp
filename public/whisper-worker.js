// Transcripción de voz LOCAL (Whisper dentro del navegador, gratis y privada).
// Respaldo del asistente cuando el dictado del navegador no puede conectar con su servicio.
// La primera vez baja el modelo (~80 MB) y queda en la caché del navegador.
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/+esm"

env.allowLocalModels = false

let reconocedor = null
const avance = new Map()

async function cargar() {
  if (!reconocedor) {
    reconocedor = await pipeline("automatic-speech-recognition", "onnx-community/whisper-base", {
      dtype: "q8",
      device: "wasm",
      progress_callback: (p) => {
        if (p.status === "progress" && p.total) {
          avance.set(p.file, { cargado: p.loaded, total: p.total })
          let c = 0
          let t = 0
          for (const v of avance.values()) {
            c += v.cargado
            t += v.total
          }
          self.postMessage({ tipo: "progreso", pct: Math.min(99, Math.round((c / t) * 100)) })
        }
      },
    })
  }
  return reconocedor
}

self.onmessage = async (e) => {
  const { id, audio } = e.data
  try {
    const modelo = await cargar()
    self.postMessage({ tipo: "transcribiendo" })
    const salida = await modelo(audio, { language: "spanish", task: "transcribe", chunk_length_s: 30 })
    self.postMessage({ tipo: "texto", id, texto: String(salida.text || "") })
  } catch (err) {
    self.postMessage({ tipo: "error", id, mensaje: String((err && err.message) || err) })
  }
}
