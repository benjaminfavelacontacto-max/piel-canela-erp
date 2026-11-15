"use client"

import { useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import { toast } from "sonner"
import { Camera, ImagePlus, Loader2, Minus, Plus, Sparkles, X } from "lucide-react"
import type { Producto } from "@/lib/cotizacion-types"
import {
  agruparModelos,
  PRESENTACIONES,
  productoDeModelo,
  type ModeloCinta,
  type Presentacion,
} from "@/lib/cintas-modelos"
import { formatMXN2 } from "@/lib/utils"
import { comprimir, type Foto } from "@/lib/foto-cliente"
import { ProductosFotoPanel } from "@/components/cotizaciones/productos-foto-panel"
import {
  identificarCintasDesdeFotos,
  type ResultadoFotoCintas,
} from "@/app/(dashboard)/cotizaciones/actions-cintas-foto"

/**
 * «Agregar cintas desde foto»: el usuario sube una foto de las cintas ENTERAS,
 * otra de las 9/9 y otra de las 6/12; la IA identifica el modelo y cuenta las
 * piezas; se muestra una lista editable (con la foto de referencia del catálogo)
 * y al confirmar se agregan a la cotización en la presentación correcta.
 *
 * Mismo componente para la cotización rápida (móvil) y el formulario completo.
 */

type Fila = {
  id: number
  presentacion: Presentacion
  clave: string // "" = sin identificar
  sugeridas: string[] // clave principal + alternativas
  cantidad: number
  incluir: boolean
  descripcion: string
  confianza: "alta" | "media" | "baja"
}

export function CintasFotoBoton({
  productos,
  onAgregar,
  variante = "escritorio",
}: {
  productos: Producto[]
  /** Recibe cada producto con la cantidad a sumar a la cotización. */
  onAgregar: (items: { producto: Producto; cantidad: number }[]) => void
  variante?: "movil" | "escritorio"
}) {
  const [abierto, setAbierto] = useState(false)
  const [modo, setModo] = useState<"productos" | "cintas">("productos")

  const modelos = useMemo(() => agruparModelos(productos), [productos])
  const porClave = useMemo(() => new Map(modelos.map((m) => [m.clave, m])), [modelos])

  const [fotos, setFotos] = useState<Partial<Record<Presentacion, Foto>>>({})
  const [fase, setFase] = useState<"subir" | "analizando" | "revisar">("subir")
  const [filas, setFilas] = useState<Fila[]>([])
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef(0)

  function cerrar() {
    setAbierto(false)
    // Se limpia al cerrar para no dejar fotos en memoria.
    setTimeout(() => {
      setFotos({})
      setFilas([])
      setFase("subir")
      setError(null)
    }, 200)
  }

  async function elegirArchivo(pres: Presentacion, file: File | undefined) {
    if (!file) return
    try {
      const foto = await comprimir(file)
      setFotos((prev) => ({ ...prev, [pres]: foto }))
      setError(null)
    } catch {
      toast.error("No se pudo leer esa imagen. Prueba con otra foto.")
    }
  }

  async function identificar() {
    const lista = PRESENTACIONES.filter((p) => fotos[p.id]).map((p) => ({
      presentacion: p.id,
      base64: fotos[p.id]!.base64,
    }))
    if (lista.length === 0) {
      setError("Sube al menos una foto.")
      return
    }
    setFase("analizando")
    setError(null)
    let res: ResultadoFotoCintas
    try {
      res = await identificarCintasDesdeFotos(lista)
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
    const nuevas: Fila[] = res.grupos.map((g) => {
      const modelo = g.clave ? porClave.get(g.clave) : undefined
      const existe = !!modelo && !!productoDeModelo(modelo, g.presentacion)
      return {
        id: ++idRef.current,
        presentacion: g.presentacion,
        clave: g.clave ?? "",
        sugeridas: [...(g.clave ? [g.clave] : []), ...g.alternativas],
        cantidad: g.cantidad,
        incluir: existe,
        descripcion: g.descripcion,
        confianza: g.confianza,
      }
    })
    if (nuevas.length === 0) {
      setFase("subir")
      setError("No encontré cintas en las fotos. Prueba con una foto más cercana y con buena luz.")
      return
    }
    setFilas(nuevas)
    setFase("revisar")
  }

  const resueltas = filas.map((f) => {
    const modelo = f.clave ? porClave.get(f.clave) : undefined
    const producto = modelo ? productoDeModelo(modelo, f.presentacion) : null
    return { fila: f, modelo, producto }
  })
  const aAgregar = resueltas.filter((r) => r.fila.incluir && r.producto)
  const totalPiezas = aAgregar.reduce((s, r) => s + r.fila.cantidad, 0)

  function patch(id: number, cambios: Partial<Fila>) {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...cambios } : f)))
  }

  function confirmar() {
    const items = aAgregar.map((r) => ({ producto: r.producto!, cantidad: r.fila.cantidad }))
    if (items.length === 0) return
    onAgregar(items)
    toast.success(
      `${totalPiezas} cinta${totalPiezas === 1 ? "" : "s"} agregada${totalPiezas === 1 ? "" : "s"} (${items.length} partida${items.length === 1 ? "" : "s"})`,
    )
    cerrar()
  }

  const boton =
    variante === "movil" ? (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="pc-tap flex w-full items-center justify-center gap-2 rounded-2xl border border-pc-line bg-pc-card px-4 py-3.5 text-[14px] font-semibold text-pc-ink active:scale-[0.99]"
      >
        <Camera className="size-5 text-pc-teal-ink" />
        Agregar desde foto
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-pc-card px-3 py-2 text-sm font-medium text-pc-ink hover:bg-pc-hover"
      >
        <Camera className="size-4 text-pc-teal-ink" />
        Agregar desde foto
      </button>
    )

  const dialogo = abierto && createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && fase !== "analizando") cerrar()
      }}
    >
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-pc-line bg-pc-card shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-pc-line px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-pc-teal-ink" />
            <h2 className="text-[15px] font-semibold text-pc-ink">Agregar desde foto</h2>
          </div>
          <button
            type="button"
            onClick={cerrar}
            disabled={fase === "analizando"}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-pc-ink-3 hover:bg-pc-hover disabled:opacity-40"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex gap-1.5 border-b border-pc-line px-4 py-2" role="tablist">
          {(
            [
              ["productos", "Productos"],
              ["cintas", "Cintas por presentación"],
            ] as const
          ).map(([id, etiqueta]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={modo === id}
              onClick={() => setModo(id)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${
                modo === id ? "bg-pc-teal text-white" : "bg-pc-subtle text-pc-ink-2 hover:bg-pc-hover"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        <div className={modo === "productos" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
          <ProductosFotoPanel productos={productos} onAgregar={onAgregar} onTerminado={cerrar} />
        </div>

        <div className={modo === "cintas" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {fase !== "revisar" ? (
            <>
              <p className="text-[13px] text-pc-ink-2">
                Sube una foto de cada presentación (puedes subir solo las que necesites). Identifico el
                modelo, cuento las piezas y tú lo revisas antes de agregarlo.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2.5">
                {PRESENTACIONES.map((p) => {
                  const foto = fotos[p.id]
                  return (
                    <div key={p.id} className="min-w-0">
                      <div className="mb-1 text-center text-[12px] font-semibold text-pc-ink-2">
                        {p.etiqueta}
                      </div>
                      <label
                        className={`relative flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed text-center ${
                          foto ? "border-pc-teal" : "border-pc-line-strong hover:bg-pc-hover"
                        } ${fase === "analizando" ? "pointer-events-none opacity-60" : ""}`}
                      >
                        {foto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={foto.preview} alt={`Foto ${p.etiqueta}`} className="size-full object-cover" />
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
                            void elegirArchivo(p.id, e.target.files?.[0])
                            e.target.value = ""
                          }}
                        />
                      </label>
                      {foto && fase !== "analizando" && (
                        <button
                          type="button"
                          onClick={() =>
                            setFotos((prev) => {
                              const c = { ...prev }
                              delete c[p.id]
                              return c
                            })
                          }
                          className="mt-1 w-full text-center text-[11px] text-pc-red-ink hover:underline"
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  )
                })}
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
                Revisa lo que encontré. Corrige el modelo o la cantidad si hace falta; las filas sin
                palomita no se agregan.
              </p>
              <ul className="mt-3 space-y-2.5">
                {resueltas.map(({ fila, modelo, producto }) => {
                  const pres = PRESENTACIONES.find((p) => p.id === fila.presentacion)!
                  const sinPres = !!modelo && !producto
                  return (
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
                          {modelo?.imagen_url ? (
                            <Image
                              src={modelo.imagen_url}
                              alt={modelo.nombre}
                              fill
                              sizes="56px"
                              className="object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-pc-subtle px-2 py-0.5 text-[11px] font-semibold text-pc-ink-2">
                              {pres.corta}
                            </span>
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
                          </div>
                          <SelectorModelo
                            modelos={modelos}
                            sugeridas={fila.sugeridas}
                            valor={fila.clave}
                            onChange={(clave) => {
                              const m = clave ? porClave.get(clave) : undefined
                              patch(fila.id, {
                                clave,
                                incluir: !!m && !!productoDeModelo(m, fila.presentacion),
                              })
                            }}
                          />
                          {fila.descripcion && (
                            <p className="mt-1 truncate text-[11.5px] text-pc-ink-3">
                              Vi: {fila.descripcion}
                            </p>
                          )}
                          {!modelo && (
                            <p className="mt-1 text-[11.5px] text-pc-amber-ink">
                              No está en el catálogo: elige el modelo o déjala sin marcar.
                            </p>
                          )}
                          {sinPres && (
                            <p className="mt-1 text-[11.5px] text-pc-amber-ink">
                              «{modelo!.nombre}» no tiene presentación {pres.corta} en inventario; créala
                              primero o elige otro modelo.
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
                          <span className="min-w-6 text-center text-[15px] font-bold text-pc-ink">
                            {fila.cantidad}
                          </span>
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
                  )
                })}
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
                {Object.keys(fotos).length} foto{Object.keys(fotos).length === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={() => void identificar()}
                disabled={fase === "analizando" || Object.keys(fotos).length === 0}
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
                    Identificar cintas
                  </>
                )}
              </button>
            </>
          )}
        </div>
        </div>
      </div>
    </div>,
    document.body,
  )

  return (
    <>
      {boton}
      {dialogo}
    </>
  )
}

/** Lista de modelos con las sugerencias de la IA primero. */
function SelectorModelo({
  modelos,
  sugeridas,
  valor,
  onChange,
}: {
  modelos: ModeloCinta[]
  sugeridas: string[]
  valor: string
  onChange: (clave: string) => void
}) {
  const sug = new Set(sugeridas)
  const delTop = sugeridas.map((c) => modelos.find((m) => m.clave === c)).filter(Boolean) as ModeloCinta[]
  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full rounded-lg border border-pc-line bg-pc-card px-2 py-1.5 text-[13.5px] font-medium text-pc-ink focus:border-pc-teal focus:outline-none"
    >
      <option value="">— Elegir modelo —</option>
      {delTop.length > 0 && (
        <optgroup label="Sugeridas">
          {delTop.map((m, i) => (
            <option key={m.clave} value={m.clave}>
              {i === 0 ? "" : "¿"}
              {m.nombre}
              {i === 0 ? "" : "?"}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Todas las cintas">
        {modelos
          .filter((m) => !sug.has(m.clave))
          .map((m) => (
            <option key={m.clave} value={m.clave}>
              {m.nombre}
            </option>
          ))}
      </optgroup>
    </select>
  )
}
