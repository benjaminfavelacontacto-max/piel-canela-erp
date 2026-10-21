"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import { downloadCotizacionPdf } from "@/lib/pdf"

/**
 * Descarga del PDF de una cotización con feedback: "Generando…" mientras html2canvas
 * trabaja (en el celular tarda unos segundos), luego avisa con el NOMBRE del archivo
 * guardado. Evita dobles toques mientras se genera.
 */
export function usePdfDownload() {
  const [generando, setGenerando] = useState(false)

  const descargar = useCallback(
    async (element: HTMLElement | null, numero: string) => {
      if (!element || generando) return
      setGenerando(true)
      const aviso = toast.loading("Generando PDF…")
      try {
        const { resultado, nombre } = await downloadCotizacionPdf(element, numero)
        toast.dismiss(aviso)
        if (resultado === "descargado") {
          toast.success("PDF guardado", { description: nombre, duration: 6000 })
        }
      } catch (e) {
        toast.dismiss(aviso)
        toast.error(`No se pudo generar el PDF: ${(e as Error).message}`)
      } finally {
        setGenerando(false)
      }
    },
    [generando],
  )

  return { generando, descargar }
}
