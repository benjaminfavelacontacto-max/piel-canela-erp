"use client"

import { motion, useReducedMotion } from "framer-motion"
import { Crown, Sparkles, Truck } from "lucide-react"

// Destellos que salen una sola vez al aparecer el aviso (posición final en px).
const DESTELLOS = [
  { x: -120, y: -34, d: 0.0, s: 14 },
  { x: -70, y: -48, d: 0.08, s: 10 },
  { x: -20, y: -52, d: 0.16, s: 12 },
  { x: 40, y: -46, d: 0.05, s: 10 },
  { x: 95, y: -36, d: 0.12, s: 14 },
  { x: 135, y: -8, d: 0.2, s: 10 },
  { x: -135, y: -6, d: 0.18, s: 10 },
]

/**
 * Aviso para clientes VIP al teclear su WhatsApp: envío totalmente gratis.
 * Panel SIEMPRE oscuro (amatista + oro canela) para verse igual en claro y
 * oscuro. Respeta "reducir movimiento" del sistema.
 */
export function VipBanner({ nombre }: { nombre: string }) {
  const quieto = useReducedMotion()

  return (
    <motion.div
      role="status"
      initial={quieto ? false : { opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className="relative overflow-hidden rounded-2xl border border-[#C5A47E]/40 p-4 text-white shadow-[0_8px_30px_rgba(139,92,246,0.25)]"
      style={{ background: "linear-gradient(120deg, #1E1A33, #2A244A 60%, #3A2F5E)" }}
    >
      {/* Brillo que cruza el aviso */}
      {!quieto && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent"
          initial={{ x: "-100%" }}
          animate={{ x: "420%" }}
          transition={{ duration: 1.6, delay: 0.4, ease: "easeInOut" }}
        />
      )}

      {/* Destellos dorados */}
      {!quieto &&
        DESTELLOS.map((d, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 text-[#E9D5FF]"
            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
            animate={{
              x: d.x,
              y: d.y,
              opacity: [0, 1, 0],
              scale: [0, 1, 0.4],
              rotate: [0, 90],
            }}
            transition={{ duration: 1.1, delay: 0.25 + d.d, ease: "easeOut" }}
          >
            <Sparkles style={{ width: d.s, height: d.s }} />
          </motion.span>
        ))}

      <div className="relative flex items-center gap-3.5">
        <motion.div
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#C5A47E]/15 ring-1 ring-[#C5A47E]/50"
          initial={quieto ? false : { rotate: -25, scale: 0.4 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.15 }}
        >
          <motion.span
            animate={quieto ? undefined : { y: [0, -2.5, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="flex"
          >
            <Crown className="size-6 text-[#E4C79E]" aria-hidden />
          </motion.span>
        </motion.div>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            ¡Hola, {nombre}!
            <span className="rounded-full bg-[#C5A47E] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#1E1A33]">
              Cliente VIP
            </span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-[#E9D5FF]">
            <Truck className="size-4 shrink-0" aria-hidden />
            Tus envíos son <strong className="font-semibold text-white">totalmente gratis</strong>
          </p>
        </div>
      </div>
    </motion.div>
  )
}
