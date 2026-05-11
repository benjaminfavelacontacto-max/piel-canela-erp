"use client"

import { useRef, useState, useTransition } from "react"
import { createClient } from "@/lib/supabase/client"
import { guardarUrlImagenProducto } from "./actions"

interface ImageUploadProps {
  productoId: string
  productoNombre: string
  productoSku?: string | null
  imagenActual?: string | null
}

const TIPOS_PERMITIDOS = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

export function ImageUpload({
  productoId,
  productoNombre,
  productoSku,
  imagenActual,
}: ImageUploadProps) {
  const [imagen, setImagen] = useState<string | null>(imagenActual ?? null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const procesarArchivo = (archivo: File) => {
    setError(null)
    setSuccess(false)

    if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
      setError("Solo JPG, PNG o WebP")
      return
    }
    if (archivo.size > MAX_SIZE) {
      setError("Máximo 5MB")
      return
    }

    // Preview optimista
    const reader = new FileReader()
    reader.onload = (e) => setImagen(e.target?.result as string)
    reader.readAsDataURL(archivo)

    startTransition(async () => {
      try {
        const extension = (archivo.name.split(".").pop() ?? "jpg").toLowerCase()
        const nombreArchivo = `producto-${productoId}-${Date.now()}.${extension}`

        console.log("[ImageUpload] subiendo:", nombreArchivo, archivo.size, "bytes")

        // Upload DIRECTO desde cliente a Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from("productos")
          .upload(nombreArchivo, archivo, {
            contentType: archivo.type,
            upsert: true,
          })

        if (uploadError) {
          console.error("[ImageUpload] upload error:", uploadError)
          setError("Error al subir: " + uploadError.message)
          setImagen(imagenActual ?? null)
          return
        }

        // Obtener URL pública
        const { data: urlData } = supabase.storage
          .from("productos")
          .getPublicUrl(nombreArchivo)
        const publicUrl = urlData.publicUrl
        console.log("[ImageUpload] URL pública:", publicUrl)

        // Guardar URL en BD vía Server Action
        const result = await guardarUrlImagenProducto(productoId, publicUrl)
        if (result.success) {
          setImagen(publicUrl)
          setSuccess(true)
          setTimeout(() => setSuccess(false), 2500)
        } else {
          setError(result.error ?? "Error al guardar URL")
          setImagen(imagenActual ?? null)
        }
      } catch (err) {
        console.error("[ImageUpload] error inesperado:", err)
        setError("Error inesperado al subir")
        setImagen(imagenActual ?? null)
      }
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    const archivo = e.dataTransfer.files[0]
    if (archivo) procesarArchivo(archivo)
  }

  const handleEliminar = () => {
    if (!imagen) return
    startTransition(async () => {
      try {
        // Extraer path después de /productos/
        const idx = imagen.indexOf("/productos/")
        const path = idx >= 0 ? imagen.slice(idx + "/productos/".length) : null
        if (path) {
          const { error: rmError } = await supabase.storage
            .from("productos")
            .remove([path])
          if (rmError) console.warn("[ImageUpload] remove warning:", rmError)
        }
        const result = await guardarUrlImagenProducto(productoId, null)
        if (result.success) {
          setImagen(null)
        } else {
          setError(result.error ?? "Error al eliminar")
        }
      } catch (err) {
        console.error("[ImageUpload] error al eliminar:", err)
        setError("Error al eliminar")
      }
    })
  }

  const initials = (productoSku?.slice(0, 2) ?? "?").toUpperCase()

  return (
    <div className="relative">
      <div
        onClick={(e) => {
          if (!imagen) {
            e.stopPropagation()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setDragging(false)
        }}
        onDrop={handleDrop}
        className="group relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg transition-all"
        style={{
          border: imagen
            ? "none"
            : dragging
              ? "2px dashed rgba(5,150,105,0.55)"
              : "1.5px dashed rgba(15,23,42,0.18)",
          background: imagen
            ? "transparent"
            : dragging
              ? "rgba(5,150,105,0.06)"
              : "rgba(15,23,42,0.03)",
          cursor: imagen ? "default" : "pointer",
        }}
        title={imagen ? "Click para opciones" : "Subir imagen"}
      >
        {imagen ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagen}
              alt={productoNombre}
              className="size-full rounded-md object-cover"
            />
            {/* Overlay hover */}
            <div className="absolute inset-0 hidden flex-col items-center justify-center gap-0.5 rounded-md bg-black/65 group-hover:flex">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  inputRef.current?.click()
                }}
                className="rounded px-1.5 py-0.5 text-[8px] font-semibold text-white hover:bg-white/15"
              >
                Cambiar
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleEliminar()
                }}
                className="rounded px-1.5 py-0.5 text-[8px] font-semibold text-rose-300 hover:bg-rose-500/20"
              >
                Quitar
              </button>
            </div>
          </>
        ) : isPending ? (
          <div
            className="size-3.5 animate-spin rounded-full border-2 border-gray-200"
            style={{ borderTopColor: "#047857" }}
          />
        ) : (
          <span className="text-[9px] font-bold text-gray-400">{initials}</span>
        )}

        {/* Indicador de éxito */}
        {success && (
          <span
            className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white"
            style={{
              background: "#047857",
              boxShadow: "0 0 6px rgba(5,150,105,0.5)",
            }}
          >
            ✓
          </span>
        )}
      </div>

      {/* Error tooltip */}
      {error && (
        <div
          className="absolute left-0 top-full z-50 mt-1 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-medium text-white shadow-md"
          style={{ background: "#B91C1C" }}
          onClick={(e) => e.stopPropagation()}
        >
          {error}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setError(null)
            }}
            className="ml-1.5 opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0]
          if (archivo) procesarArchivo(archivo)
          e.target.value = ""
        }}
      />
    </div>
  )
}
