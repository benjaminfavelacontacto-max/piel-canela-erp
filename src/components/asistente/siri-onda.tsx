"use client"

import { useEffect, useRef } from "react"

/**
 * Animación estilo Siri: ondas de luz de colores que se mezclan (blend aditivo) sobre un
 * fondo oscuro y reaccionan al volumen real del micrófono. Sin micrófono medible
 * (permiso denegado, etc.) se mueve sola con un pulso suave.
 */
const COLORES: [number, number, number][] = [
  [255, 255, 255], // núcleo blanco
  [20, 184, 166], // teal
  [139, 92, 246], // violeta
  [56, 189, 248], // celeste
  [244, 114, 182], // rosa
  [197, 164, 126], // canela
]

export function SiriOnda({ analyserRef }: { analyserRef: React.RefObject<AnalyserNode | null> }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    let raf = 0
    let w = 0
    let h = 0
    let nivel = 0
    const inicio = performance.now()
    const datos = new Uint8Array(512)

    const ajustar = () => {
      const r = canvas.getBoundingClientRect()
      const d = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width
      h = r.height
      canvas.width = Math.max(1, Math.round(w * d))
      canvas.height = Math.max(1, Math.round(h * d))
      ctx.setTransform(d, 0, 0, d, 0, 0)
    }
    ajustar()
    const ro = new ResizeObserver(ajustar)
    ro.observe(canvas)

    const dibujar = (ahora: number) => {
      const t = (ahora - inicio) / 1000

      // Volumen del micrófono (RMS de la forma de onda) o pulso simulado.
      let objetivo: number
      const analizador = analyserRef.current
      if (analizador) {
        analizador.getByteTimeDomainData(datos)
        let suma = 0
        for (let i = 0; i < datos.length; i++) {
          const v = (datos[i] - 128) / 128
          suma += v * v
        }
        objetivo = Math.min(1, Math.sqrt(suma / datos.length) * 5.5)
      } else {
        objetivo = 0.3 + 0.16 * Math.sin(t * 2.1) + 0.08 * Math.sin(t * 5.3)
      }
      // Sube rápido y baja lento, como un medidor de nivel.
      nivel += (objetivo - nivel) * (objetivo > nivel ? 0.35 : 0.1)

      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = "lighter"
      const mid = h / 2

      // Resplandor central que respira con la voz.
      const radio = Math.min(w * 0.42, 150) * (0.55 + nivel * 0.75)
      const glow = ctx.createRadialGradient(w / 2, mid, 0, w / 2, mid, radio)
      glow.addColorStop(0, "rgba(139,92,246," + (0.2 + nivel * 0.35).toFixed(3) + ")")
      glow.addColorStop(0.55, "rgba(20,184,166," + (0.1 + nivel * 0.18).toFixed(3) + ")")
      glow.addColorStop(1, "rgba(20,184,166,0)")
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, h)

      COLORES.forEach(([r, g, b], i) => {
        const nucleo = i === 0
        const fase = t * (1.5 + i * 0.42) + i * 1.9
        const frecuencia = (nucleo ? 2.2 : 1.6 + i * 0.55) * Math.PI * 2
        const alto = h * 0.4 * (0.1 + nivel * 0.9) * (nucleo ? 1 : 0.5 + (i % 3) * 0.2)
        ctx.beginPath()
        for (let x = 0; x <= w; x += 3) {
          const u = x / w
          const envolvente = Math.pow(Math.sin(Math.PI * u), 2.2) // 0 en los bordes, 1 al centro
          const y = mid + Math.sin(u * frecuencia + fase) * alto * envolvente
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.lineWidth = nucleo ? 2.4 : 1.7
        ctx.strokeStyle = "rgba(" + r + "," + g + "," + b + "," + (nucleo ? 0.95 : 0.6) + ")"
        ctx.shadowColor = "rgba(" + r + "," + g + "," + b + ",0.9)"
        ctx.shadowBlur = nucleo ? 10 : 16
        ctx.stroke()
      })
      ctx.shadowBlur = 0
      ctx.globalCompositeOperation = "source-over"

      raf = requestAnimationFrame(dibujar)
    }
    raf = requestAnimationFrame(dibujar)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [analyserRef])

  return <canvas ref={ref} className="block size-full" aria-hidden />
}
