import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth"

/**
 * Rutas públicas que NO requieren sesión:
 *  - /login  → la propia pantalla de acceso
 *  - /order  → portal público de pedidos para clientes (catálogo + checkout)
 * Cada prefijo cubre la ruta exacta y sus sub-rutas (ej. /order/success).
 */
const PUBLIC_PREFIXES = ["/login", "/order"]

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  )
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const valid = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)

  // Ya logueado pero visitando /login → mándalo al dashboard
  if (pathname === "/login" && valid) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  if (isPublic(pathname)) {
    return NextResponse.next()
  }

  // Todo lo demás (dashboard, ventas, finanzas, etc.) exige sesión
  if (!valid) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return NextResponse.next()
}

export const config = {
  /**
   * Corre en todas las rutas EXCEPTO internos de Next y archivos estáticos
   * (con extensión, p.ej. /logo.png, *.css). Así el candado cubre todas las
   * páginas sin bloquear assets ni imágenes.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
}
