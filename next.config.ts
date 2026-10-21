import type { NextConfig } from "next";

/**
 * Headers de seguridad aplicados a todas las respuestas. Defensa en
 * profundidad: HTTPS forzado, anti-clickjacking, anti-sniffing, fuga de
 * referer controlada y permisos de hardware deshabilitados.
 */
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  images: {
    // Fotos de producto (Supabase Storage). Los archivos pesan ~290 KB c/u y se
    // muestran en miniaturas de 32–200 px → next/image las sirve en WebP y al tamaño real.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "szjzaajjpuomvpnghvzu.supabase.co",
        pathname: "/storage/v1/object/public/productos/**",
      },
    ],
    // Los nombres de archivo llevan timestamp (inmutables) → caché larga
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // Menos tamaños candidatos → srcset más corto en el HTML (hay ~230 miniaturas por página)
    deviceSizes: [640, 828, 1200],
    imageSizes: [32, 64, 96, 128, 240, 480],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
