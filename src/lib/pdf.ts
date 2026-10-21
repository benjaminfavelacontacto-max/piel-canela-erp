"use client"

export function safeFilenamePart(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\w-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "sn"
  )
}

/**
 * Strip CSS variables that resolve to oklch()/lab() so html2canvas (legacy)
 * doesn't crash with "unsupported color function". The cloned doc gets a
 * stylesheet that overrides Tailwind v4 base colors with safe hex values
 * before html2canvas walks the tree.
 */
const PDF_RESET_CSS = `
*, *::before, *::after { color-scheme: light !important; }
:root {
  --background: #ffffff !important;
  --foreground: #111827 !important;
  --color-background: #ffffff !important;
  --color-foreground: #111827 !important;
  --border: #e5e7eb !important;
  --color-border: #e5e7eb !important;
  --muted: #f9fafb !important;
  --muted-foreground: #6b7280 !important;
  --primary: #0d9488 !important;
  --primary-foreground: #ffffff !important;
}
html, body { background: #ffffff !important; color: #111827 !important; }
`

/**
 * Nombre del archivo = nombre de la cotización (su número, p. ej.
 * "PC-211026002-C-KanelaBronze.pdf"), tal cual: solo se quitan los caracteres
 * que el sistema de archivos no admite (/ \\ : * ? " < > |). Se conservan
 * espacios y acentos para que coincida exactamente con lo que se ve en pantalla.
 */
export function nombreArchivoPdf(numeroOrden: string): string {
  const base = numeroOrden
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\- ]+|[. ]+$/g, "")
  return `${base || "cotizacion"}.pdf`
}

function pdfOptions(numeroOrden: string) {
  const filename = nombreArchivoPdf(numeroOrden)

  // `pagebreak` no está en los tipos de html2pdf.js pero sí existe en runtime
  // y respeta `page-break-inside: avoid` para evitar cortes entre páginas.
  const opts = {
    margin: 0,
    filename,
    image: { type: "jpeg", quality: 1 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: 816,
      windowWidth: 816,
      onclone: (doc: Document) => {
        const style = doc.createElement("style")
        style.textContent = PDF_RESET_CSS
        doc.head.appendChild(style)
      },
    },
    jsPDF: { unit: "px", format: [816, 1056], orientation: "portrait" },
    // Solo respeta el CSS explícito (`page-break-inside: avoid` que ponemos
    // en el card del resumen). `avoid-all` empujaba todo el contenido a la
    // página 2 dejando una hoja en blanco al inicio.
    pagebreak: { mode: ["css", "legacy"] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
  return { opts, filename }
}

/** Genera el PDF como archivo (sin descargarlo), con el nombre de la cotización. */
export async function cotizacionPdfFile(
  element: HTMLElement,
  numeroOrden: string,
): Promise<File> {
  const mod = await import("html2pdf.js")
  const html2pdf = mod.default ?? mod
  const { opts, filename } = pdfOptions(numeroOrden)
  const blob: Blob = await html2pdf().from(element).set(opts).outputPdf("blob")
  return new File([blob], filename, { type: "application/pdf" })
}

export type ResultadoGuardado = "descargado" | "compartido" | "cancelado"

/**
 * Guarda el PDF en el dispositivo CON EL NOMBRE DEL ARCHIVO:
 * - Android / escritorio / Safari de iPhone: descarga directa (<a download> sobre un blob;
 *   a diferencia de `file-saver`, respeta el nombre también en iOS Safari 13+).
 * - App instalada en el iPhone (pantalla de inicio): la WebView no permite descargas con
 *   <a download>, así que se abre la hoja de compartir → "Guardar en Archivos" (conserva el nombre).
 */
export async function guardarPdfEnDispositivo(file: File): Promise<ResultadoGuardado> {
  const ua = navigator.userAgent
  const esIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  const instalada =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true

  if (esIOS && instalada && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return "compartido"
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelado"
      // cualquier otro error → intentamos la descarga normal
    }
  }

  const url = URL.createObjectURL(file)
  const a = document.createElement("a")
  a.href = url
  a.download = file.name
  a.rel = "noopener"
  a.style.display = "none"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Margen amplio: en móvil la descarga puede tardar en arrancar
  setTimeout(() => URL.revokeObjectURL(url), 120_000)
  return "descargado"
}

/** Genera y guarda el PDF de la cotización con el nombre de la cotización. */
export async function downloadCotizacionPdf(
  element: HTMLElement,
  numeroOrden: string,
): Promise<{ resultado: ResultadoGuardado; nombre: string }> {
  const file = await cotizacionPdfFile(element, numeroOrden)
  const resultado = await guardarPdfEnDispositivo(file)
  return { resultado, nombre: file.name }
}
