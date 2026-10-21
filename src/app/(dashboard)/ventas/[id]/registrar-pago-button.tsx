"use client"

import { useState } from "react"
import { Wallet } from "lucide-react"
import { PagoRapidoDialog } from "../pago-rapido-dialog"

/** Botón "Registrar pago" del detalle de venta (abre el mismo diálogo de la lista). */
export function RegistrarPagoButton({
  venta,
}: {
  venta: { id: string; numero: string; cliente: string; total: number; saldo: number }
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 shadow-sm hover:bg-amber-100 md:min-h-0"
      >
        <Wallet className="size-4" />
        Registrar pago
      </button>
      {open && <PagoRapidoDialog venta={venta} onClose={() => setOpen(false)} />}
    </>
  )
}
