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
      html2canvas: { scale: 2, useCORS: true, width: 816, windowWidth: 816 },
      jsPDF: { unit: "px", format: [816, 1056], orientation: "portrait" },
    })
    .save()
}
