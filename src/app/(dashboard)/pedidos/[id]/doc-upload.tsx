"use client"

import { useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Paperclip, FileText, Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { verDocumento } from "../actions"

/**
 * Chip reutilizable para adjuntar / ver / eliminar un documento (PDF o imagen).
 * - Sin archivo: botón "Adjuntar" (abre el selector).
 * - Con archivo: "Ver" (abre signed URL en pestaña nueva) + eliminar.
 * `onUpload` / `onDelete` son closures que llaman las server actions con sus IDs.
 */
export function DocChip({
  filename,
  onUpload,
  onDelete,
  label = "Adjuntar",
}: {
  filename: string | null
  onUpload: (fd: FormData) => Promise<{ ok: boolean; error?: string }>
  onDelete: () => Promise<{ ok: boolean; error?: string }>
  label?: string
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ""
    if (!file) return
    const fd = new FormData()
    fd.append("archivo", file)
    startTransition(async () => {
      const r = await onUpload(fd)
      if (!r.ok) {
        toast.error(r.error || "No se pudo subir")
        return
      }
      toast.success("Documento adjuntado")
      router.refresh()
    })
  }

  async function ver() {
    if (!filename) return
    const r = await verDocumento(filename)
    if (r.ok) window.open(r.url, "_blank", "noopener")
    else toast.error(r.error)
  }

  function borrar() {
    startTransition(async () => {
      const r = await onDelete()
      if (!r.ok) {
        toast.error(r.error || "No se pudo eliminar")
        return
      }
      toast.success("Documento eliminado")
      router.refresh()
    })
  }

  if (filename) {
    return (
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={ver}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
          title="Ver / descargar documento"
        >
          <FileText className="size-3.5" />
          Ver
        </button>
        <button
          type="button"
          onClick={borrar}
          disabled={pending}
          className="inline-flex size-6 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
          title="Eliminar documento"
          aria-label="Eliminar documento"
        >
          {pending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
        </button>
      </div>
    )
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={onFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
        title="Adjuntar PDF o imagen (máx 10 MB)"
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Paperclip className="size-3.5" />
        )}
        {label}
      </button>
    </>
  )
}
