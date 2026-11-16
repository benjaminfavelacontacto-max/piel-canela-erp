"use client"

import Image from "next/image"
import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  ImagePlus,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Undo2,
  X,
} from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { comprimir, type Foto } from "@/lib/foto-cliente"
import {
  agruparModelos,
  PRESENTACIONES,
  type ModeloCinta,
  type Presentacion,
} from "@/lib/cintas-modelos"
import type { GrupoIdentificado } from "@/lib/cintas-foto-ia"
import { aplicarCotejoInventario, contarCintasDesdeFotos } from "../actions-cotejo"
import type { ProductoCotejo } from "./page"

/**
 * Cotejo de inventario de cintas. Dos formas de contar, combinables:
 *  1) Fotos: una (o hasta 3) por presentación (entera / 9/9 / 6/12) → la IA identifica el
 *     modelo y cuenta piezas, y precarga el conteo real de cada modelo.
 *  2) A mano: cada celda es un contador editable.
 * Cada modelo se confirma ("cotejada") y al final se aplican los ajustes al stock.
 * El avance se guarda en el navegador para no perderlo si se cierra la pestaña.
 */

type IaTag = "alta" | "media" | "baja" | "no-vista"

type Estado = {
  /** producto_id → piezas contadas (solo si ya hay conteo). */
  contado: Record<string, number>
  /** producto_id → de dónde salió el conteo si vino de la IA (se borra al editarlo a mano). */
  ia: Record<string, IaTag>
  /** clave de modelo → confirmado por el usuario. */
  cotejada: Record<string, true>
  /** clave de modelo → ya escrito al inventario. */
  aplicada: Record<string, true>
}

const VACIO: Estado = { contado: {}, ia: {}, cotejada: {}, aplicada: {} }
const LS_KEY = "inventario-cotejo-v1"
const MAX_FOTOS = 3

type Celda = {
  producto: ProductoCotejo
  pres: Presentacion | "otra"
  etiqueta: string
}

type CeldaVista = Celda & { sistema: number; contado: number | null; ia: IaTag | undefined }

function etiquetaOtra(p: ProductoCotejo): string {
  return /6\s*mm/i.test(p.nombre_display ?? p.nombre) ? "6 mm" : "Otra"
}

function celdasDe(m: ModeloCinta<ProductoCotejo>): Celda[] {
  const out: Celda[] = []
  if (m.entera) out.push({ producto: m.entera, pres: "entera", etiqueta: "Entera" })
  if (m.c9) out.push({ producto: m.c9, pres: "9-9", etiqueta: "9/9" })
  if (m.c12) out.push({ producto: m.c12, pres: "6-12", etiqueta: "6/12" })
  const legacy = !m.entera && !m.c9 && !m.c12 && m.otras.length === 1
  for (const o of m.otras) {
    out.push(
      legacy
        ? { producto: o, pres: "entera", etiqueta: "Única" }
        : { producto: o, pres: "otra", etiqueta: etiquetaOtra(o) },
    )
  }
  return out
}

type ModeloVista = {
  m: ModeloCinta<ProductoCotejo>
  celdas: CeldaVista[]
  cotejada: boolean
  aplicada: boolean
  conConteo: boolean
  conDiferencia: boolean
  porRevisar: boolean
  coincide: boolean
}

const PEOR: Record<"alta" | "media" | "baja", number> = { alta: 0, media: 1, baja: 2 }

export function CotejarView({
  productos,
  error,
}: {
  productos: ProductoCotejo[]
  error: string | null
}) {
  const modelos = useMemo(() => agruparModelos<ProductoCotejo>(productos), [productos])
  const [estado, setEstado] = useState<Estado>(VACIO)
  const [cargado, setCargado] = useState(false)

  // ── Persistencia local del avance ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const p = JSON.parse(raw) as Partial<Estado>
        // Leer localStorage solo se puede tras montar (evita desajuste de hidratación).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEstado({
          contado: p.contado ?? {},
          ia: p.ia ?? {},
          cotejada: p.cotejada ?? {},
          aplicada: p.aplicada ?? {},
        })
      }
    } catch {
      /* sin storage: se trabaja en memoria */
    }
    setCargado(true)
  }, [])
  useEffect(() => {
    if (!cargado) return
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(estado))
    } catch {
      /* ignorar */
    }
  }, [estado, cargado])

  // ── Fotos / IA ──
  const [fotos, setFotos] = useState<Record<Presentacion, Foto[]>>({ entera: [], "9-9": [], "6-12": [] })
  const [fotosAbierto, setFotosAbierto] = useState(true)
  const [estadoIA, setEstadoIA] = useState<Record<Presentacion, "idle" | "analizando" | "listo" | "error">>({
    entera: "idle",
    "9-9": "idle",
    "6-12": "idle",
  })
  const [errorIA, setErrorIA] = useState<Partial<Record<Presentacion, string>>>({})
  const [sinIdentificar, setSinIdentificar] = useState<{ pres: Presentacion; texto: string; cantidad: number }[]>([])
  const analizando = Object.values(estadoIA).some((s) => s === "analizando")
  const totalFotos = PRESENTACIONES.reduce((s, p) => s + fotos[p.id].length, 0)

  async function agregarFotos(pres: Presentacion, files: FileList | null) {
    if (!files || files.length === 0) return
    const cupo = MAX_FOTOS - fotos[pres].length
    if (cupo <= 0) {
      toast.error(`Máximo ${MAX_FOTOS} fotos por presentación.`)
      return
    }
    const elegidas = [...files].slice(0, cupo)
    if (files.length > cupo) toast.message(`Solo caben ${MAX_FOTOS} fotos por presentación; agregué ${cupo}.`)
    const nuevas: Foto[] = []
    for (const f of elegidas) {
      try {
        nuevas.push(await comprimir(f))
      } catch {
        toast.error("No se pudo leer una de las imágenes.")
      }
    }
    if (nuevas.length) setFotos((prev) => ({ ...prev, [pres]: [...prev[pres], ...nuevas] }))
  }

  function quitarFoto(pres: Presentacion, i: number) {
    setFotos((prev) => ({ ...prev, [pres]: prev[pres].filter((_, k) => k !== i) }))
  }

  /** Vuelca el resultado de la IA de UNA presentación en el conteo (sin pisar modelos ya cotejados). */
  function aplicarResultadoIA(pres: Presentacion, grupos: GrupoIdentificado[]) {
    type Acum = { piezas: number; conf: "alta" | "media" | "baja" }
    const porClave = new Map<string, Acum>()
    const sin: { pres: Presentacion; texto: string; cantidad: number }[] = []
    for (const g of grupos) {
      if (!g.clave) {
        sin.push({ pres, texto: g.descripcion || "Diseño no reconocido", cantidad: g.cantidad })
        continue
      }
      const cur = porClave.get(g.clave) ?? { piezas: 0, conf: "alta" as const }
      cur.piezas += g.cantidad
      if (PEOR[g.confianza] > PEOR[cur.conf]) cur.conf = g.confianza
      porClave.set(g.clave, cur)
    }
    const porClaveModelo = new Map(modelos.map((m) => [m.clave, m]))
    for (const [clave] of porClave) {
      const m = porClaveModelo.get(clave)
      if (!m || !celdasDe(m).some((c) => c.pres === pres)) {
        sin.push({
          pres,
          texto: (m ? m.nombre + " (no existe en esa presentación)" : "Modelo desconocido"),
          cantidad: porClave.get(clave)!.piezas,
        })
      }
    }

    setEstado((prev) => {
      const contado = { ...prev.contado }
      const ia = { ...prev.ia }
      for (const m of modelos) {
        if (prev.cotejada[m.clave]) continue
        for (const c of celdasDe(m)) {
          if (c.pres !== pres) continue
          const acum = porClave.get(m.clave)
          if (acum) {
            contado[c.producto.id] = Math.min(100000, acum.piezas)
            ia[c.producto.id] = acum.conf
          } else {
            // Foto de TODAS las de esta presentación y este modelo no salió → probablemente 0 (a revisar).
            contado[c.producto.id] = 0
            ia[c.producto.id] = "no-vista"
          }
        }
      }
      return { ...prev, contado, ia }
    })
    setSinIdentificar((prev) => [...prev.filter((s) => s.pres !== pres), ...sin])
  }

  async function analizar() {
    const aProcesar = PRESENTACIONES.filter((p) => fotos[p.id].length > 0)
    if (aProcesar.length === 0) {
      toast.error("Sube al menos una foto.")
      return
    }
    setErrorIA({})
    setEstadoIA({ entera: "idle", "9-9": "idle", "6-12": "idle" })
    let fallos = 0
    // En serie: la primera llamada calienta el caché del catálogo y las demás salen más rápido y baratas.
    for (const p of aProcesar) {
      setEstadoIA((s) => ({ ...s, [p.id]: "analizando" }))
      try {
        const res = await contarCintasDesdeFotos(
          p.id,
          fotos[p.id].map((f) => ({ base64: f.base64 })),
        )
        if (res.ok) {
          aplicarResultadoIA(p.id, res.grupos)
          setEstadoIA((s) => ({ ...s, [p.id]: "listo" }))
        } else {
          fallos++
          setErrorIA((e) => ({ ...e, [p.id]: res.error }))
          setEstadoIA((s) => ({ ...s, [p.id]: "error" }))
        }
      } catch {
        fallos++
        setErrorIA((e) => ({ ...e, [p.id]: "No se pudo conectar con el servidor. Intenta de nuevo." }))
        setEstadoIA((s) => ({ ...s, [p.id]: "error" }))
      }
    }
    if (fallos === 0) {
      toast.success("Listo: revisa y confirma modelo por modelo.")
      setFotosAbierto(false)
      setFotos({ entera: [], "9-9": [], "6-12": [] }) // libera memoria
    } else {
      toast.error("Alguna presentación falló; revisa los avisos.")
    }
  }

  // ── Edición del conteo ──
  function setContado(clave: string, productoId: string, valor: number | null) {
    setEstado((prev) => {
      const contado = { ...prev.contado }
      const ia = { ...prev.ia }
      const cotejada = { ...prev.cotejada }
      const aplicada = { ...prev.aplicada }
      if (valor == null) delete contado[productoId]
      else contado[productoId] = valor
      delete ia[productoId]
      // Tocar el conteo de un modelo ya confirmado lo regresa a "por cotejar".
      delete cotejada[clave]
      delete aplicada[clave]
      return { contado, ia, cotejada, aplicada }
    })
  }

  function cotejar(clave: string) {
    setEstado((prev) => {
      const aplicada = { ...prev.aplicada }
      delete aplicada[clave]
      return { ...prev, cotejada: { ...prev.cotejada, [clave]: true }, aplicada }
    })
  }
  function descotejar(clave: string) {
    setEstado((prev) => {
      const cotejada = { ...prev.cotejada }
      const aplicada = { ...prev.aplicada }
      delete cotejada[clave]
      delete aplicada[clave]
      return { ...prev, cotejada, aplicada }
    })
  }

  // ── Vista derivada ──
  const vistas: ModeloVista[] = useMemo(
    () =>
      modelos.map((m) => {
        const celdas: CeldaVista[] = celdasDe(m).map((c) => ({
          ...c,
          sistema: c.producto.stock,
          contado: estado.contado[c.producto.id] ?? null,
          ia: estado.ia[c.producto.id],
        }))
        const conConteo = celdas.some((c) => c.contado != null)
        const conDiferencia = celdas.some((c) => c.contado != null && c.contado !== c.sistema)
        const porRevisar = celdas.some(
          (c) => c.ia === "baja" || c.ia === "media" || (c.ia === "no-vista" && c.sistema > 0),
        )
        return {
          m,
          celdas,
          cotejada: !!estado.cotejada[m.clave],
          aplicada: !!estado.aplicada[m.clave],
          conConteo,
          conDiferencia,
          porRevisar,
          coincide: conConteo && !conDiferencia && !celdas.some((c) => c.ia === "baja"),
        }
      }),
    [modelos, estado],
  )

  const totalModelos = vistas.length
  const nCotejadas = vistas.filter((v) => v.cotejada).length
  const nCoincidentes = vistas.filter((v) => !v.cotejada && v.coincide).length
  const nDiferencia = vistas.filter((v) => v.conConteo && v.conDiferencia).length
  const nRevisar = vistas.filter((v) => !v.cotejada && v.porRevisar).length
  const pendientesAplicar = vistas.filter((v) => v.cotejada && !v.aplicada)
  const ajustes = pendientesAplicar.flatMap((v) =>
    v.celdas
      .filter((c) => c.contado != null && c.contado !== c.sistema)
      .map((c) => ({ v, c, contado: c.contado as number })),
  )

  const [filtro, setFiltro] = useState<"todas" | "pendientes" | "diferencia" | "revisar" | "cotejadas">("todas")
  const [busqueda, setBusqueda] = useState("")
  const visibles = useMemo(() => {
    const q = busqueda
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
    return vistas.filter((v) => {
      if (q && !v.m.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q)) return false
      if (filtro === "pendientes") return !v.cotejada
      if (filtro === "cotejadas") return v.cotejada
      if (filtro === "diferencia") return v.conConteo && v.conDiferencia
      if (filtro === "revisar") return !v.cotejada && v.porRevisar
      return true
    })
  }, [vistas, filtro, busqueda])

  function cotejarCoincidentes() {
    const claves = vistas.filter((v) => !v.cotejada && v.coincide).map((v) => v.m.clave)
    if (claves.length === 0) return
    setEstado((prev) => {
      const cotejada = { ...prev.cotejada }
      const aplicada = { ...prev.aplicada }
      for (const c of claves) {
        cotejada[c] = true
        delete aplicada[c]
      }
      return { ...prev, cotejada, aplicada }
    })
    toast.success(`${claves.length} modelo${claves.length === 1 ? "" : "s"} cotejado${claves.length === 1 ? "" : "s"}: el conteo coincide con el sistema.`)
  }

  function reiniciar() {
    if (!window.confirm("¿Borrar todo el avance del cotejo? (No toca el inventario ya aplicado.)")) return
    setEstado(VACIO)
    setSinIdentificar([])
    setEstadoIA({ entera: "idle", "9-9": "idle", "6-12": "idle" })
    setFotosAbierto(true)
  }

  // ── Aplicar al inventario ──
  const [confirmando, setConfirmando] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  async function aplicar() {
    setAplicando(true)
    try {
      const res = await aplicarCotejoInventario(ajustes.map((a) => ({ productoId: a.c.producto.id, contado: a.contado })))
      if (!res.ok && ajustes.length > 0) {
        toast.error(res.error)
        return
      }
      const fallidosIds = new Set(res.ok ? res.fallidos.map((f) => f.productoId) : [])
      const clavesFallidas = new Set(
        ajustes.filter((a) => fallidosIds.has(a.c.producto.id)).map((a) => a.v.m.clave),
      )
      setEstado((prev) => {
        const aplicada = { ...prev.aplicada }
        for (const v of pendientesAplicar) if (!clavesFallidas.has(v.m.clave)) aplicada[v.m.clave] = true
        return { ...prev, aplicada }
      })
      if (res.ok && res.fallidos.length > 0) {
        toast.error(`${res.fallidos.length} ajuste(s) fallaron: ${res.fallidos[0].error}`)
      } else {
        toast.success(
          ajustes.length === 0
            ? "Todo coincidía: no hubo nada que ajustar."
            : `Inventario actualizado: ${ajustes.length} ajuste${ajustes.length === 1 ? "" : "s"} en ${pendientesAplicar.length} modelo${pendientesAplicar.length === 1 ? "" : "s"}.`,
        )
      }
      setConfirmando(false)
    } catch {
      toast.error("No se pudo conectar con el servidor. Tu avance sigue guardado; intenta de nuevo.")
    } finally {
      setAplicando(false)
    }
  }

  const pct = totalModelos ? Math.round((nCotejadas / totalModelos) * 100) : 0

  return (
    <div className="flex flex-col gap-4 p-4 pb-40 md:px-8 md:py-6 md:pb-28">
      <PageHeader
        breadcrumb={[{ label: "Inventario", href: "/inventario" }]}
        title="Cotejar inventario"
        subtitle="Reconteo de cintas: entera, 9/9 y 6/12"
        actions={
          <button
            type="button"
            onClick={reiniciar}
            className="inline-flex items-center gap-1.5 rounded-xl border border-pc-line bg-pc-card px-3 py-2 text-sm font-medium text-pc-ink-2 hover:bg-pc-hover"
          >
            <RotateCcw className="size-4" />
            Reiniciar
          </button>
        }
      />

      {error && (
        <p className="rounded-xl border border-pc-red-line bg-pc-red-soft px-3 py-2 text-sm text-pc-red-ink">{error}</p>
      )}

      {/* Progreso */}
      <section className="rounded-2xl border border-pc-line bg-pc-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[13px] font-medium text-pc-ink-3">Avance del cotejo</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-pc-ink">{nCotejadas}</span>
              <span className="text-sm text-pc-ink-3">de {totalModelos} modelos cotejados</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[12px] font-semibold">
            <Chip tono="verde">{nCoincidentes} coinciden</Chip>
            <Chip tono="rojo">{nDiferencia} con diferencia</Chip>
            {nRevisar > 0 && <Chip tono="ambar">{nRevisar} por revisar</Chip>}
          </div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-pc-subtle">
          <motion.div
            className="h-full rounded-full bg-pc-teal"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
      </section>

      {/* Fotos */}
      <section className="rounded-2xl border border-pc-line bg-pc-card shadow-sm">
        <button
          type="button"
          onClick={() => setFotosAbierto((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-[15px] font-semibold text-pc-ink">
            <Sparkles className="size-4 text-pc-teal-ink" />
            Contar con fotos (IA)
          </span>
          <span className="flex items-center gap-2 text-[12px] text-pc-ink-3">
            {PRESENTACIONES.map((p) => (
              <EstadoPres key={p.id} etiqueta={p.corta} estado={estadoIA[p.id]} />
            ))}
            <ChevronDown className={`size-4 transition-transform ${fotosAbierto ? "rotate-180" : ""}`} />
          </span>
        </button>

        {fotosAbierto && (
          <div className="border-t border-pc-line px-4 pb-4 pt-3">
            <p className="text-[13px] text-pc-ink-2">
              Sube una foto de <b>todas</b> las cintas de cada medida (hasta {MAX_FOTOS} por medida si no caben en una).
              Junta las del mismo modelo en un montón y sepáralo de los demás: así el conteo sale más exacto. Después tú
              confirmas modelo por modelo. Puedes subir solo las medidas que quieras contar hoy.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {PRESENTACIONES.map((p) => (
                <SlotFotos
                  key={p.id}
                  etiqueta={p.etiqueta}
                  fotos={fotos[p.id]}
                  deshabilitado={analizando}
                  estado={estadoIA[p.id]}
                  error={errorIA[p.id]}
                  onAgregar={(files) => void agregarFotos(p.id, files)}
                  onQuitar={(i) => quitarFoto(p.id, i)}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] text-pc-ink-3">
                {totalFotos} foto{totalFotos === 1 ? "" : "s"} lista{totalFotos === 1 ? "" : "s"} ·{" "}
                las fotos no se guardan, solo se usan para contar.
              </span>
              <button
                type="button"
                onClick={() => void analizar()}
                disabled={analizando || totalFotos === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-pc-teal px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-pc-teal-hover disabled:opacity-50"
              >
                {analizando ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {analizando ? "Contando…" : "Contar con IA"}
              </button>
            </div>
            {analizando && (
              <p className="mt-2 text-[12px] text-pc-ink-3">
                Cada medida tarda alrededor de un minuto; no cierres la pantalla.
              </p>
            )}
          </div>
        )}

        {sinIdentificar.length > 0 && (
          <div className="border-t border-pc-line px-4 py-3">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-pc-amber-ink">
              <AlertTriangle className="size-4" />
              La IA no pudo ubicar {sinIdentificar.length} grupo{sinIdentificar.length === 1 ? "" : "s"} en el catálogo
            </div>
            <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-pc-ink-2">
              {sinIdentificar.map((s, i) => (
                <li key={i}>
                  • {PRESENTACIONES.find((p) => p.id === s.pres)?.corta}: {s.texto} (~{s.cantidad})
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[12px] text-pc-ink-3">
              Cuéntalas a mano en el modelo que corresponda (o revisa si es una cinta sin foto de referencia).
            </p>
          </div>
        )}
      </section>

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 md:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-pc-ink-4" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar modelo…"
            className="w-full rounded-xl border border-pc-line bg-pc-card py-2 pl-9 pr-3 text-sm text-pc-ink placeholder:text-pc-ink-4 focus:border-pc-teal focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["todas", "Todas", totalModelos],
              ["pendientes", "Por cotejar", totalModelos - nCotejadas],
              ["diferencia", "Con diferencia", nDiferencia],
              ["revisar", "Por revisar", nRevisar],
              ["cotejadas", "Cotejadas", nCotejadas],
            ] as const
          ).map(([id, etq, n]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${
                filtro === id ? "bg-pc-teal text-white" : "bg-pc-subtle text-pc-ink-2 hover:bg-pc-hover"
              }`}
            >
              {etq} <span className="opacity-70">{n}</span>
            </button>
          ))}
        </div>
        {nCoincidentes > 0 && (
          <button
            type="button"
            onClick={cotejarCoincidentes}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-pc-green-line bg-pc-green-soft px-3 py-2 text-[13px] font-semibold text-pc-green-ink hover:brightness-95"
          >
            <CheckCheck className="size-4" />
            Cotejar las {nCoincidentes} que coinciden
          </button>
        )}
      </div>

      {/* Checklist */}
      {visibles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-pc-line px-4 py-10 text-center text-sm text-pc-ink-3">
          {totalModelos === 0 ? "No hay cintas en el catálogo." : "Ningún modelo con ese filtro."}
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {visibles.map((v) => (
            <TarjetaModelo
              key={v.m.clave}
              v={v}
              onContar={(productoId, valor) => setContado(v.m.clave, productoId, valor)}
              onCotejar={() => cotejar(v.m.clave)}
              onDescotejar={() => descotejar(v.m.clave)}
            />
          ))}
        </ul>
      )}

      {/* Barra de aplicar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[76px] z-30 flex justify-center px-4 md:bottom-4 md:pl-64">
        <AnimatePresence>
          {pendientesAplicar.length > 0 && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="pointer-events-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-2xl border border-pc-line bg-pc-card px-4 py-3 shadow-xl"
            >
              <div className="min-w-0 text-[13px]">
                <div className="font-semibold text-pc-ink">
                  {pendientesAplicar.length} modelo{pendientesAplicar.length === 1 ? "" : "s"} cotejado
                  {pendientesAplicar.length === 1 ? "" : "s"} por aplicar
                </div>
                <div className="text-pc-ink-3">
                  {ajustes.length === 0
                    ? "Todo coincide con el sistema."
                    : `${ajustes.length} ajuste${ajustes.length === 1 ? "" : "s"} al stock`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className="shrink-0 rounded-xl bg-pc-teal px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-pc-teal-hover"
              >
                Aplicar al inventario
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {confirmando &&
        createPortal(
          <ModalConfirmar
            ajustes={ajustes.map((a) => ({
              modelo: a.v.m.nombre,
              etiqueta: a.c.etiqueta,
              sistema: a.c.sistema,
              contado: a.contado,
            }))}
            nModelos={pendientesAplicar.length}
            aplicando={aplicando}
            onCancelar={() => !aplicando && setConfirmando(false)}
            onConfirmar={() => void aplicar()}
          />,
          document.body,
        )}
    </div>
  )
}

// ───────────────────────── piezas de UI ─────────────────────────

function Chip({ tono, children }: { tono: "verde" | "rojo" | "ambar"; children: React.ReactNode }) {
  const c =
    tono === "verde"
      ? "border-pc-green-line bg-pc-green-soft text-pc-green-ink"
      : tono === "rojo"
        ? "border-pc-red-line bg-pc-red-soft text-pc-red-ink"
        : "border-pc-amber-line bg-pc-amber-soft text-pc-amber-ink"
  return <span className={`rounded-full border px-2.5 py-1 ${c}`}>{children}</span>
}

function EstadoPres({ etiqueta, estado }: { etiqueta: string; estado: "idle" | "analizando" | "listo" | "error" }) {
  return (
    <span className="inline-flex items-center gap-1">
      {estado === "analizando" ? (
        <Loader2 className="size-3.5 animate-spin text-pc-teal-ink" />
      ) : estado === "listo" ? (
        <Check className="size-3.5 text-pc-green-ink" />
      ) : estado === "error" ? (
        <X className="size-3.5 text-pc-red-ink" />
      ) : null}
      {etiqueta}
    </span>
  )
}

function SlotFotos({
  etiqueta,
  fotos,
  deshabilitado,
  estado,
  error,
  onAgregar,
  onQuitar,
}: {
  etiqueta: string
  fotos: Foto[]
  deshabilitado: boolean
  estado: "idle" | "analizando" | "listo" | "error"
  error?: string
  onAgregar: (files: FileList | null) => void
  onQuitar: (i: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="rounded-xl border border-pc-line p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-pc-ink">{etiqueta}</span>
        <EstadoPres etiqueta="" estado={estado} />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {fotos.map((f, i) => (
          <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-pc-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.preview} alt={`Foto ${etiqueta} ${i + 1}`} className="size-full object-cover" />
            {!deshabilitado && (
              <button
                type="button"
                onClick={() => onQuitar(i)}
                aria-label="Quitar foto"
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        {fotos.length < MAX_FOTOS && !deshabilitado && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center rounded-lg border-2 border-dashed border-pc-line-strong text-pc-ink-3 hover:bg-pc-hover"
          >
            {fotos.length === 0 ? <Camera className="size-5" /> : <ImagePlus className="size-5" />}
            <span className="mt-0.5 px-1 text-center text-[10.5px] leading-tight">
              {fotos.length === 0 ? "Tomar o elegir" : "Otra foto"}
            </span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          onAgregar(e.target.files)
          e.target.value = ""
        }}
      />
      {error && <p className="mt-2 text-[11.5px] text-pc-red-ink">{error}</p>}
    </div>
  )
}

function TarjetaModelo({
  v,
  onContar,
  onCotejar,
  onDescotejar,
}: {
  v: ModeloVista
  onContar: (productoId: string, valor: number | null) => void
  onCotejar: () => void
  onDescotejar: () => void
}) {
  const { m, celdas, cotejada, aplicada, conConteo, porRevisar } = v
  const sinContar = celdas.filter((c) => c.contado == null).map((c) => c.etiqueta)

  return (
    <li
      className={`rounded-2xl border p-3 transition-colors ${
        cotejada
          ? "border-pc-green-line bg-pc-green-soft"
          : porRevisar
            ? "border-pc-amber-line bg-pc-card"
            : "border-pc-line bg-pc-card"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-pc-subtle">
          {m.imagen_url ? <Image src={m.imagen_url} alt={m.nombre} fill sizes="48px" className="object-cover" /> : null}
          <AnimatePresence>
            {cotejada && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 18 }}
                className="absolute inset-0 flex items-center justify-center bg-[oklch(0.55_0.15_160/0.82)]"
              >
                <Check className="size-6 text-white" strokeWidth={3} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold text-pc-ink">{m.nombre}</div>
          <div className="text-[12px] text-pc-ink-3">
            {cotejada ? (
              <span className="font-semibold text-pc-green-ink">
                {aplicada ? "Cotejada y aplicada" : "Cotejada · falta aplicar"}
              </span>
            ) : porRevisar ? (
              <span className="font-semibold text-pc-amber-ink">Revisa el conteo de la IA</span>
            ) : (
              "Por cotejar"
            )}
          </div>
        </div>
        {cotejada ? (
          <button
            type="button"
            onClick={onDescotejar}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-medium text-pc-ink-3 hover:bg-pc-hover"
          >
            <Undo2 className="size-3.5" />
            Deshacer
          </button>
        ) : (
          <button
            type="button"
            onClick={onCotejar}
            disabled={!conConteo}
            className="inline-flex items-center gap-1 rounded-xl bg-pc-teal px-3 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-pc-teal-hover disabled:opacity-40"
          >
            <Check className="size-4" />
            Cotejar
          </button>
        )}
      </div>

      <div className="mt-2.5 space-y-1.5">
        {celdas.map((c) => (
          <FilaCelda key={c.producto.id} c={c} bloqueada={false} onChange={(val) => onContar(c.producto.id, val)} />
        ))}
        {celdas.length === 0 && <p className="text-[12px] text-pc-ink-3">Sin presentaciones en el catálogo.</p>}
      </div>

      {!cotejada && conConteo && sinContar.length > 0 && (
        <p className="mt-2 text-[11.5px] text-pc-ink-3">Sin contar (no se ajustan): {sinContar.join(", ")}</p>
      )}
    </li>
  )
}

function FilaCelda({
  c,
  onChange,
}: {
  c: CeldaVista
  bloqueada: boolean
  onChange: (valor: number | null) => void
}) {
  const diff = c.contado == null ? null : c.contado - c.sistema
  const revisar = c.ia === "baja" || c.ia === "media" || (c.ia === "no-vista" && c.sistema > 0)
  return (
    <div className="flex items-center gap-2 rounded-xl bg-pc-subtle/60 px-2.5 py-1.5">
      <div className="w-[52px] shrink-0">
        <div className="text-[12.5px] font-semibold text-pc-ink">{c.etiqueta}</div>
        {c.ia && (
          <div
            className={`flex items-center gap-0.5 text-[10px] font-semibold ${
              revisar ? "text-pc-amber-ink" : "text-pc-teal-ink"
            }`}
            title={c.ia === "no-vista" ? "La IA no vio este modelo en la foto" : `Contado por IA (confianza ${c.ia})`}
          >
            <Sparkles className="size-2.5" />
            {c.ia === "no-vista" ? "no vista" : "IA"}
          </div>
        )}
      </div>
      <div className="min-w-[58px] text-[12px] text-pc-ink-3">
        Sist. <b className="text-pc-ink-2">{c.sistema}</b>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          aria-label="Restar uno"
          onClick={() => onChange(Math.max(0, (c.contado ?? 0) - 1))}
          className="grid size-8 place-items-center rounded-lg border border-pc-line bg-pc-card text-pc-ink-2 active:scale-95 hover:bg-pc-hover"
        >
          <Minus className="size-4" />
        </button>
        <input
          inputMode="numeric"
          aria-label={`Conteo real ${c.etiqueta}`}
          value={c.contado ?? ""}
          placeholder="–"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const t = e.target.value.replace(/\D/g, "")
            onChange(t === "" ? null : Math.min(100000, parseInt(t, 10)))
          }}
          className={`h-8 w-12 rounded-lg border bg-pc-card text-center text-[14px] font-semibold tabular-nums text-pc-ink focus:border-pc-teal focus:outline-none ${
            revisar ? "border-pc-amber-line" : "border-pc-line"
          }`}
        />
        <button
          type="button"
          aria-label="Sumar uno"
          onClick={() => onChange((c.contado ?? 0) + 1)}
          className="grid size-8 place-items-center rounded-lg border border-pc-line bg-pc-card text-pc-ink-2 active:scale-95 hover:bg-pc-hover"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div className="w-12 shrink-0 text-right">
        {diff == null ? null : diff === 0 ? (
          <span className="inline-flex items-center justify-center rounded-full bg-pc-green-soft p-1 text-pc-green-ink">
            <Check className="size-3.5" strokeWidth={3} />
          </span>
        ) : (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[12px] font-bold tabular-nums ${
              diff > 0 ? "bg-pc-blue-soft text-pc-blue-ink" : "bg-pc-red-soft text-pc-red-ink"
            }`}
          >
            {diff > 0 ? "+" : "−"}
            {Math.abs(diff)}
          </span>
        )}
      </div>
    </div>
  )
}

function ModalConfirmar({
  ajustes,
  nModelos,
  aplicando,
  onCancelar,
  onConfirmar,
}: {
  ajustes: { modelo: string; etiqueta: string; sistema: number; contado: number }[]
  nModelos: number
  aplicando: boolean
  onCancelar: () => void
  onConfirmar: () => void
}) {
  const sobran = ajustes.filter((a) => a.contado > a.sistema).reduce((s, a) => s + (a.contado - a.sistema), 0)
  const faltan = ajustes.filter((a) => a.contado < a.sistema).reduce((s, a) => s + (a.sistema - a.contado), 0)
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancelar()
      }}
    >
      <div className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-pc-line bg-pc-card shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-pc-line px-4 py-3">
          <h2 className="text-[15px] font-semibold text-pc-ink">Aplicar conteo al inventario</h2>
          <button type="button" onClick={onCancelar} aria-label="Cerrar" className="rounded-lg p-1.5 text-pc-ink-3 hover:bg-pc-hover">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {ajustes.length === 0 ? (
            <p className="text-[13px] text-pc-ink-2">
              Los {nModelos} modelos cotejados coinciden con el sistema: no hay stock que cambiar. Se marcarán como aplicados.
            </p>
          ) : (
            <>
              <p className="text-[13px] text-pc-ink-2">
                El stock del sistema se reemplazará por lo que contaste en {ajustes.length} presentación
                {ajustes.length === 1 ? "" : "es"}. Sobran <b className="text-pc-blue-ink">{sobran}</b> y faltan{" "}
                <b className="text-pc-red-ink">{faltan}</b> unidades en total. Queda registro en la bitácora de ajustes.
              </p>
              <ul className="mt-3 divide-y divide-pc-line-soft rounded-xl border border-pc-line">
                {ajustes.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
                    <span className="min-w-0 truncate text-pc-ink">
                      {a.modelo} <span className="text-pc-ink-3">· {a.etiqueta}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-pc-ink-2">
                      {a.sistema} → <b className="text-pc-ink">{a.contado}</b>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-pc-line px-4 py-3">
          <button
            type="button"
            onClick={onCancelar}
            disabled={aplicando}
            className="rounded-xl border border-pc-line px-4 py-2 text-sm font-medium text-pc-ink-2 hover:bg-pc-hover disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={aplicando}
            className="inline-flex items-center gap-2 rounded-xl bg-pc-teal px-4 py-2 text-sm font-semibold text-white hover:bg-pc-teal-hover disabled:opacity-60"
          >
            {aplicando && <Loader2 className="size-4 animate-spin" />}
            Confirmar y aplicar
          </button>
        </div>
      </div>
    </div>
  )
}
