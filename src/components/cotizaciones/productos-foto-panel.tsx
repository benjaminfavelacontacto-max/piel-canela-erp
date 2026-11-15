"use client"

import { useMemo, useRef, useState } from "react"
import Image from "next/image"
import { toast } from "sonner"
import { ImagePlus, Loader2, Minus, Plus, Sparkles } from "lucide-react"
import type { Producto } from "@/lib/cotizacion-types"
import { comprimir, type Foto } from "@/lib/foto-cliente"
import { formatMXN2 } from "@/lib/utils"
import {
  identificarProductosDesdeFotos,
  type ResultadoFotoProductos,
} from "@/app/(dashboard)/cotizaciones/actions-cintas-foto"

/**
 * Panel «Productos»: UNA foto general (o hasta 3 ángulos) con todos los productos;
 * la IA los identifica y cuenta, el usuario revisa y confirma. Las cintas NO van
 * aquí (tienen su panel por presentación). Se monta dentro del diálogo de
 * `cintas-foto.tsx`: renderiza el cuerpo y el pie del diálogo.
 */

type Fila = {
  id: number
  productoId: string // "" = sin identificar
  sugeridas: string[]
  cantidad: number
  incluir: boolean
  descripcion: string
  confianza: "alta" | "media" | "baja"
}

const esProductoNoCinta = (p: Producto) =>
  p.activo !== false &&
  !(p.sku ?? "").toUpperCase().startsWith("CN-") &&
  (p.categoria ?? "").toUpperCase() !== "CINTAS"

export function ProductosFotoPanel({
  productos,
  onAgregar,
  onTerminado,
}: {
  productos: Producto[]
  onAgregar: (items: { producto: Producto; cantidad: number }[]) => void
  /** Se llama tras agregar (cierra el diálogo). */
  onTerminado: () => void
}) {
  const catalogo = useMemo(
    () => productos.filter(esProductoNoCinta).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [productos],
  )
  const porId = useMemo(() => new Map(catalogo.map((p) => [p.id, p])), [catalogo])

  const [fotos, setFotos] = useState<(Foto | null)[]>([null, null, null])
  const [fase, setFase] = useState<"subir" | "analizando" | "revisar">("subir")
  const [filas, setFilas] = useState<Fila[]>([])
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef(0)

  const nFotos = fotos.filter(Boolean).length

  async function elegir(i: number, file: File | undefined) {
    if (!file) return
    try {
      const foto = await comprimir(file)
      setFotos((prev) => prev.map((f, k) => (k === i ? foto : f)))
      setError(null)
    } catch {
      toast.error("No se pudo leer esa imagen. Prueba con otra foto.")
    }
  }

  async function identificar() {
    const lista = fotos.filter((f): f is Foto => !!f).map((f) => ({ base64: f.base64 }))
    if (lista.length === 0) {
      setError("Sube al menos una foto.")
      return
    }
    setFase("analizando")
    setError(null)
    let res: ResultadoFotoProductos
    try {
      res = await identificarProductosDesdeFotos(lista)
    } catch {
      setFase("subir")
      setError("No se pudo conectar con el servidor. Revisa tu internet e intenta de nuevo.")
      return
    }
    if (!res.ok) {
      setFase("subir")
      setError(res.error)
      return
    }
    const nuevas: Fila[] = res.grupos.map((g) => ({
      id: ++idRef.current,
      productoId: g.productoId && porId.has(g.productoId) ? g.productoId : "",
      sugeridas: [...(g.productoId ? [g.productoId] : []), ...g.alternativas].filter((x) => porId.has(x)),
      cantidad: g.cantidad,
      incluir: !!g.productoId && porId.has(g.productoId),
      descripcion: g.descripcion,
      confianza: g.confianza,
    }))
    if (nuevas.length === 0) {
      setFase("subir")
      setError("No encontré productos en la foto. Prueba con una foto más cercana y con buena luz.")
      return
    }
    setFilas(nuevas)
    setFase("revisar")
  }

  function patch(id: number, cambios: Partial<Fila>) {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...cambios } : f)))
  }

  const resueltas = filas.map((f) => ({ fila: f, producto: f.productoId ? porId.get(f.productoId) ?? null : null }))
  const aAgregar = resueltas.filter((r) => r.fila.incluir && r.producto)
  const totalPiezas = aAgregar.reduce((s, r) => s + r.fila.cantidad, 0)

  function confirmar() {
    const items = aAgregar.map((r) => ({ producto: r.producto!, cantidad: r.fila.cantidad }))
    if (items.length === 0) return
    onAgregar(items)
    toast.success(
      `${totalPiezas} producto${totalPiezas === 1 ? "" : "s"} agregado${totalPiezas === 1 ? "" : "s"} (${items.length} partida${items.length === 1 ? "" : "s"})`,
    )
    onTerminado()
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {fase !== "revisar" ? (
          <>
            <p className="text-[13px] text-pc-ink-2">
              Toma una foto de todos los productos juntos (con las etiquetas a la vista). Puedes subir hasta 3
              fotos desde distintos ángulos; no cuento dos veces lo mismo. Las cintas se agregan en la otra
              pestaña.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2.5">
              {fotos.map((foto, i) => (
                <div key={i} className="min-w-0">
                  <div className="mb-1 text-center text-[12px] font-semibold text-pc-ink-2">Foto {i + 1}</div>
                  <label
                    className={`relative flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed text-center ${
                      foto ? "border-pc-teal" : "border-pc-line-strong hover:bg-pc-hover"
                    } ${fase === "analizando" ? "pointer-events-none opacity-60" : ""}`}
                  >
                    {foto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={foto.preview} alt={`Foto ${i + 1}`} className="size-full object-cover" />
                    ) : (
                      <>
                        <ImagePlus className="size-6 text-pc-ink-4" />
                        <span className="mt-1 px-1 text-[11px] text-pc-ink-3">Tomar o elegir foto</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        void elegir(i, e.target.files?.[0])
                        e.target.value = ""
                      }}
                    />
                  </label>
                  {foto && fase !== "analizando" && (
                    <button
                      type="button"
                      onClick={() => setFotos((prev) => prev.map((f, k) => (k === i ? null : f)))}
                      className="mt-1 w-full text-center text-[11px] text-pc-red-ink hover:underline"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              ))}
            </div>
            {error && (
              <p className="mt-3 rounded-lg border border-pc-red-line bg-pc-red-soft px-3 py-2 text-[12.5px] text-pc-red-ink">
                {error}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-[13px] text-pc-ink-2">
              Revisa lo que encontré. Corrige el producto o la cantidad si hace falta; las filas sin palomita no
              se agregan.
            </p>
            <ul className="mt-3 space-y-2.5">
              {resueltas.map(({ fila, producto }) => (
                <li
                  key={fila.id}
                  className={`rounded-xl border p-2.5 ${
                    fila.incluir && producto ? "border-pc-teal bg-pc-tint" : "border-pc-line"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={fila.incluir && !!producto}
                      disabled={!producto}
                      onChange={(e) => patch(fila.id, { incluir: e.target.checked })}
                      className="mt-1 size-5 accent-[var(--pc-teal)]"
                      aria-label="Incluir"
                    />
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-pc-subtle">
                      {producto?.imagen_url ? (
                        <Image src={producto.imagen_url} alt={producto.nombre} fill sizes="56px" className="object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
                          fila.confianza === "alta"
                            ? "bg-pc-green-soft text-pc-green-ink"
                            : fila.confianza === "media"
                              ? "bg-pc-amber-soft text-pc-amber-ink"
                              : "bg-pc-red-soft text-pc-red-ink"
                        }`}
                      >
                        confianza {fila.confianza}
                      </span>
                      <SelectorProducto
                        catalogo={catalogo}
                        sugeridas={fila.sugeridas}
                        valor={fila.productoId}
                        onChange={(id) => patch(fila.id, { productoId: id, incluir: !!id && porId.has(id) })}
                      />
                      {fila.descripcion && (
                        <p className="mt-1 truncate text-[11.5px] text-pc-ink-3">Vi: {fila.descripcion}</p>
                      )}
                      {!producto && (
                        <p className="mt-1 text-[11.5px] text-pc-amber-ink">
                          No está en el catálogo: elige el producto o déjala sin marcar.
                        </p>
                      )}
                      {producto && (
                        <p className="mt-1 text-[11.5px] text-pc-ink-3">
                          {producto.sku} · {formatMXN2(producto.precio)} c/u
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={() => patch(fila.id, { cantidad: fila.cantidad + 1 })}
                        className="rounded-md border border-pc-line p-1.5 text-pc-ink-2 hover:bg-pc-hover"
                        aria-label="Más"
                      >
                        <Plus className="size-4" />
                      </button>
                      <span className="min-w-6 text-center text-[15px] font-bold text-pc-ink">{fila.cantidad}</span>
                      <button
                        type="button"
                        onClick={() => patch(fila.id, { cantidad: Math.max(1, fila.cantidad - 1) })}
                        className="rounded-md border border-pc-line p-1.5 text-pc-ink-2 hover:bg-pc-hover"
                        aria-label="Menos"
                      >
                        <Minus className="size-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-pc-line px-4 py-3 pc-safe-bottom">
        {fase === "revisar" ? (
          <>
            <button
              type="button"
              onClick={() => setFase("subir")}
              className="text-[13px] font-medium text-pc-ink-2 hover:underline"
            >
              ← Cambiar fotos
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={aAgregar.length === 0}
              className="rounded-xl bg-pc-teal px-4 py-2.5 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Agregar {totalPiezas} pieza{totalPiezas === 1 ? "" : "s"}
            </button>
          </>
        ) : (
          <>
            <span className="text-[12px] text-pc-ink-3">
              {nFotos} foto{nFotos === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => void identificar()}
              disabled={fase === "analizando" || nFotos === 0}
              className="flex items-center gap-2 rounded-xl bg-pc-teal px-4 py-2.5 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {fase === "analizando" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Analizando…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Identificar productos
                </>
              )}
            </button>
          </>
        )}
      </div>
    </>
  )
}

/** Lista de productos con las sugerencias de la IA primero. */
function SelectorProducto({
  catalogo,
  sugeridas,
  valor,
  onChange,
}: {
  catalogo: Producto[]
  sugeridas: string[]
  valor: string
  onChange: (id: string) => void
}) {
  const sug = new Set(sugeridas)
  const top = sugeridas.map((id) => catalogo.find((p) => p.id === id)).filter(Boolean) as Producto[]
  const etiqueta = (p: Producto) => p.nombre + (p.peso ? ` · ${p.peso}` : "")
  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full rounded-lg border border-pc-line bg-pc-card px-2 py-1.5 text-[13.5px] font-medium text-pc-ink focus:border-pc-teal focus:outline-none"
    >
      <option value="">— Elegir producto —</option>
      {top.length > 0 && (
        <optgroup label="Sugeridos">
          {top.map((p, i) => (
            <option key={p.id} value={p.id}>
              {i === 0 ? "" : "¿"}
              {etiqueta(p)}
              {i === 0 ? "" : "?"}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Todos los productos">
        {catalogo
          .filter((p) => !sug.has(p.id))
          .map((p) => (
            <option key={p.id} value={p.id}>
              {etiqueta(p)}
            </option>
          ))}
      </optgroup>
    </select>
  )
}
