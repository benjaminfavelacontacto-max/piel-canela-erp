import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Piel Canela ERP",
  description: "Sistema de gestión empresarial Piel Canela",
  // Añadida a la pantalla de inicio del iPhone abre a pantalla completa,
  // sin barra de Safari, con el nombre corto.
  appleWebApp: {
    capable: true,
    title: "Piel Canela",
    statusBarStyle: "default",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // viewportFit=cover deja que el contenido use la pantalla completa del
  // iPhone; las barras fijas respetan el notch/home indicator con
  // env(safe-area-inset-*) (ver .pc-safe-bottom en globals.css).
  viewportFit: "cover",
  themeColor: "#F5F7F6",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} h-full overflow-x-hidden antialiased`}
    >
      <body className="flex min-h-full flex-col overflow-x-hidden">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
