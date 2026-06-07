"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileText, Plus, X, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  subirDocumentoPedido,
  eliminarDocumentoPedido,
  verDocumento,
} from "../actions"

type Documento = {
  id: string
  nombre: string
  tipo: string
  filename: string
  notas: string | null
  created_at: string
}

const TIPOS = [
  { value: "factura_proveedor", label: "Factura proveedor" },
  { value: "factura_envio", label: "Factura de envío" },
  { value: "comprobante", label: "Comprobante" },
  { value: "otro", label: "Otro" },
]
const TIPO_CONF: Record<string, { label: string; cls: string }> = {
  factura_proveedor: { label: "Factura proveedor", cls: "bg-indigo-50 text-indigo-700" },
  factura_envio: { label: "Factura de envío", cls: "bg-amber-50 text-amber-700" },
  comprobante: { label: "Comprobante", cls: "bg-emerald-50 text-emerald-700" },
  otro: { label: "Otro", cls: "bg-gray-100 text-gray-600" },
}

export function Documentos({
  pedidoId,
  documentos,
}: {
  pedidoId: string
  documentos: Documento[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState("")
  const [tipo, setTipo] = useState("factura_proveedor")
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()

  function guardar() {
    setError(null)
    const file = fileRef.current?.files?.[0]
    if (!nombre.trim()) {
      setError("Captura un nombre para el documento.")
      return
    }
    if (!file) {
      setError("Selecciona un archivo (PDF o imagen).")
      return
    }
    const fd = new FormData()
    fd.append("archivo", file)
    fd.append("nombre", nombre.trim())
    fd.append("tipo", tipo)
    startTransition(async () => {
      const r = await subirDocumentoPedido(pedidoId, fd)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setNombre("")
      setTipo("factura_proveedor")
      setAbierto(false)
      if (fileRef.current) fileRef.current.value = ""
      toast.success("Documento subido")
      router.refresh()
    })
  }

  async function ver(filename: string) {
    const r = await verDocumento(filename)
    if (r.ok) window.open(r.url, "_blank", "noopener")
    else toast.error(r.error)
  }

  function borrar(id: string, filename: string) {
    startTransition(async () => {
      const r = await eliminarDocumentoPedido(pedidoId, id, filename)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      toast.success("Documento eliminado")
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-gray-900">
            <FileText className="size-4 text-indigo-600" />
            Facturas y documentos
          </h3>
          <p className="text-[11.5px] text-gray-500">
            Facturas del proveedor y de envío, comprobantes. PDF o imagen (máx 10 MB).
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAbierto((v) => !v)
            setError(null)
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
        >
          {abierto ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          {abierto ? "Cancelar" : "Subir documento"}
        </button>
      </div>

      {abierto && (
        <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                Nombre
              </span>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Factura Patricia Lobo #0377"
                className="h-8 w-full rounded-lg border border-gray-200 px-2 text-[12.5px]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                Tipo
              </span>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-[12.5px]"
              >
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                Archivo (PDF / imagen)
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="block w-full text-[11.5px] text-gray-600 file:mr-2 file:rounded-md file:border-0 file:bg-indigo-100 file:px-2 file:py-1 file:text-[11.5px] file:font-semibold file:text-indigo-700"
              />
            </label>
          </div>
          {error && <p className="mt-2 text-[11.5px] text-rose-600">{error}</p>}
          <div className="mt-2.5 flex justify-end">
            <button
              type="button"
              onClick={guardar}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Guardar documento
            </button>
          </div>
        </div>
      )}

      {documentos.length > 0 ? (
        <ul className="divide-y divide-gray-50">
          {documentos.map((d) => {
            const conf = TIPO_CONF[d.tipo] ?? TIPO_CONF.otro
            return (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-gray-900">
                      {d.nombre}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${conf.cls}`}
                    >
                      {conf.label}
                    </span>
                  </div>
                  {d.notas && (
                    <p className="mt-0.5 text-[11px] text-gray-500">{d.notas}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => ver(d.filename)}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                    title="Ver / descargar"
                  >
                    <FileText className="size-3.5" />
                    Ver
                  </button>
                  <button
                    type="button"
                    onClick={() => borrar(d.id, d.filename)}
                    disabled={pending}
                    className="inline-flex size-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                    title="Eliminar"
                    aria-label="Eliminar documento"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-[12px] italic text-gray-400">
          Aún no hay documentos. Sube las facturas (proveedor / envío) y los
          comprobantes para tenerlos correlacionados con el pedido.
        </p>
      )}
    </section>
  )
}
