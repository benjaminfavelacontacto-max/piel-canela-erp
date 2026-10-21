import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { Toaster } from "@/components/ui/sonner"
import { ThemeSync } from "@/components/theme-sync"
import { themeInitScript } from "@/lib/theme"
import "./globals.css"

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Piel Canela ERP",
  description: "Sistema de gestión empresarial Piel Canela",
  applicationName: "Piel Canela ERP",
  // Los íconos (pestaña / iPhone) salen de src/app/icon.png y apple-icon.png (convención de archivos)
  // Añadida a la pantalla de inicio del iPhone abre a pantalla completa,
  // sin barra de Safari, con el nombre corto.
  appleWebApp: {
    capable: true,
    title: "Piel Canela",
    statusBarStyle: "default",
  },
  // Evita que iOS convierta números (folios, montos) en links de teléfono
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // viewportFit=cover deja que el contenido use la pantalla completa del
  // iPhone; las barras fijas respetan el notch/home indicator con
  // env(safe-area-inset-*) (ver .pc-safe-bottom en globals.css).
  viewportFit: "cover",
  themeColor: "var(--pc-bg-app)",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // suppressHydrationWarning: el script de <head> agrega la clase `dark` antes de hidratar.
    <html
      lang="es"
      suppressHydrationWarning
      className={`${inter.variable} h-full overflow-x-hidden antialiased`}
    >
      <head>
        {/* Aplica el tema ANTES de pintar (sin destello blanco en oscuro) */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col overflow-x-hidden">
        {children}
        <Toaster />
        <ThemeSync />
      </body>
    </html>
  )
}
