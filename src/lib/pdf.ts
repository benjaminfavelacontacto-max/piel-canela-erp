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
  nombreCliente: string,
) {
  const mod = await import("html2pdf.js")
  // @ts-expect-error html2pdf.js doesn't ship types
  const html2pdf = mod.default ?? mod

  const filename = `PC_${safeFilenamePart(numeroOrden)}_${safeFilenamePart(nombreCliente)}.pdf`

  await html2pdf()
    .from(element)
    .set({
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
    })
    .save()
}
