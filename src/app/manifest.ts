import type { MetadataRoute } from "next"

/**
 * Manifest PWA — permite "Agregar a pantalla de inicio" en iOS/Android y
 * abrir el ERP como app (sin barra del navegador).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Piel Canela ERP",
    short_name: "Piel Canela",
    description: "Sistema de gestión Piel Canela — ventas, inventario y finanzas",
    start_url: "/ventas",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F7F9",
    theme_color: "#0F766E",
    lang: "es-MX",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
