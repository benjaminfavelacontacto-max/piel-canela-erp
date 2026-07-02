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

export async function downloadCotizacionPdf(
  element: HTMLElement,
  numeroOrden: string,
) {
  const mod = await import("html2pdf.js")
  const html2pdf = mod.default ?? mod

  // El archivo se llama EXACTAMENTE como la cotización (su número), para no
  // tener que renombrarlo. El número ya es filename-safe (PC-DDMMYY-NNN-TIPO-
  // NombreCorto); safeFilenamePart solo actúa como red de seguridad.
  const filename = `${safeFilenamePart(numeroOrden)}.pdf`

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

  await html2pdf().from(element).set(opts).save()
}
