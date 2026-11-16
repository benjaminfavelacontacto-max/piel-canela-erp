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
 * Cotejo de inventario de cintas, MEDIDA POR MEDIDA.
 *
 * Flujo pensado para el reconteo físico: se separan todas las enteras y se cotejan; luego
 * todas las 9/9; luego todas las 6/12. Cada medida de cada modelo se confirma por separado
 * ("cotejada"), y cada modelo muestra un mini-checklist de qué medidas ya van.
 *
 * Dos formas de contar, combinables:
 *  1) Fotos: una (hasta 3) de la medida elegida → la IA identifica el modelo, cuenta piezas y
 *     precarga el conteo real.
 *  2) A mano: cada celda es un contador editable.
 * Al final se aplican los ajustes al stock. El avance se guarda en el navegador.
 */

type IaTag = "alta" | "media" | "baja" | "no-vista"
type Medida = Presentacion | "todas"

type Estado = {
  /** producto_id → piezas contadas (solo si ya hay conteo). */
  contado: Record<string, number>
  /** producto_id → de dónde salió el conteo si vino de la IA (se borra al editarlo a mano). */
  ia: Record<string, IaTag>
  /** producto_id → esa medida de ese modelo ya fue confirmada. */
  cotejada: Record<string, true>
  /** producto_id → ya escrito al inventario. */
  aplicada: Record<string, true>
}

const VACIO: Estado = { contado: {}, ia: {}, cotejada: {}, aplicada: {} }
const LS_KEY = "inventario-cotejo-v2"
const MAX_FOTOS = 3

type Celda = {
  producto: ProductoCotejo
  pres: Presentacion | "otra"
  etiqueta: string
}

type CeldaVista = Celda & {
  sistema: number
  contado: number | null
  ia: IaTag | undefined
  cotejada: boolean
  aplicada: boolean
  diferencia: boolean
  /** La IA no está segura: conviene que el usuario la mire antes de cotejar. */
  revisar: boolean
  /** Conteo igual al sistema y sin dudas de la IA → se puede cotejar en lote. */
  coincide: boolean
}

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
  completo: boolean
}

const PEOR: Record<"alta" | "media" | "baja", number> = { alta: 0, media: 1, baja: 2 }
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()

const MEDIDAS: { id: Medida; etiqueta: string; plural: string }[] = [
  { id: "entera", etiqueta: "Entera", plural: "Enteras" },
  { id: "9-9", etiqueta: "9/9", plural: "9/9" },
  { id: "6-12", etiqueta: "6/12", plural: "6/12" },
  { id: "todas", etiqueta: "Todas", plural: "Todas las medidas" },
]

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
  const [medida, setMedida] = useState<Medida>("entera")

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
  const presVisibles = medida === "todas" ? PRESENTACIONES : PRESENTACIONES.filter((p) => p.id === medida)
  const totalFotos = presVisibles.reduce((s, p) => s + fotos[p.id].length, 0)

  async function agregarFotos(pres: Presentacion, files: FileList | null) {
    if (!files || files.length === 0) return
    const cupo = MAX_FOTOS - fotos[pres].length
    if (cupo <= 0) {
      toast.error(`Máximo ${MAX_FOTOS} fotos por medida.`)
      return
    }
    const elegidas = [...files].slice(0, cupo)
    if (files.length > cupo) toast.message(`Solo caben ${MAX_FOTOS} fotos por medida; agregué ${cupo}.`)
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

  /** Vuelca el resultado de la IA de UNA medida en el conteo (sin pisar lo ya cotejado). */
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
    for (const [clave, acum] of porClave) {
      const m = porClaveModelo.get(clave)
      if (!m || !celdasDe(m).some((c) => c.pres === pres)) {
        sin.push({
          pres,
          texto: m ? m.nombre + " (no existe en esa medida)" : "Modelo desconocido",
          cantidad: acum.piezas,
        })
      }
    }

    setEstado((prev) => {
      const contado = { ...prev.contado }
      const ia = { ...prev.ia }
      for (const m of modelos) {
        for (const c of celdasDe(m)) {
          if (c.pres !== pres || prev.cotejada[c.producto.id]) continue
          const acum = porClave.get(m.clave)
          if (acum) {
            contado[c.producto.id] = Math.min(100000, acum.piezas)
            ia[c.producto.id] = acum.conf
          } else {
            // Foto de TODAS las de esta medida y este modelo no salió → probablemente 0 (a revisar).
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
    const aProcesar = presVisibles.filter((p) => fotos[p.id].length > 0)
    if (aProcesar.length === 0) {
      toast.error("Sube al menos una foto.")
      return
    }
    setErrorIA((e) => {
      const c = { ...e }
      for (const p of aProcesar) delete c[p.id]
      return c
    })
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
          setFotos((prev) => ({ ...prev, [p.id]: [] })) // libera memoria
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
    } else {
      toast.error("Algo falló; revisa los avisos.")
    }
  }

  // ── Edición del conteo ──
  function setContado(productoId: string, valor: number | null) {
    setEstado((prev) => {
      const contado = { ...prev.contado }
      const ia = { ...prev.ia }
      const cotejada = { ...prev.cotejada }
      const aplicada = { ...prev.aplicada }
      if (valor == null) delete contado[productoId]
      else contado[productoId] = valor
      delete ia[productoId]
      // Tocar el conteo de algo ya confirmado lo regresa a "por cotejar".
      delete cotejada[productoId]
      delete aplicada[productoId]
      return { contado, ia, cotejada, aplicada }
    })
  }

  function marcar(ids: string[], cotejada: boolean) {
    if (ids.length === 0) return
    setEstado((prev) => {
      const c = { ...prev.cotejada }
      const a = { ...prev.aplicada }
      for (const id of ids) {
        if (cotejada) c[id] = true
        else delete c[id]
        delete a[id]
      }
      return { ...prev, cotejada: c, aplicada: a }
    })
  }

  // ── Vista derivada ──
  const vistas: ModeloVista[] = useMemo(
    () =>
      modelos.map((m) => {
        const celdas: CeldaVista[] = celdasDe(m).map((c) => {
          const id = c.producto.id
          const sistema = c.producto.stock
          const contado = estado.contado[id] ?? null
          const ia = estado.ia[id]
          const revisar = ia === "baja" || ia === "media" || (ia === "no-vista" && sistema > 0)
          const diferencia = contado != null && contado !== sistema
          return {
            ...c,
            sistema,
            contado,
            ia,
            cotejada: !!estado.cotejada[id],
            aplicada: !!estado.aplicada[id],
            diferencia,
            revisar,
            coincide: contado != null && !diferencia && ia !== "baja",
          }
        })
        return { m, celdas, completo: celdas.length > 0 && celdas.every((c) => c.cotejada) }
      }),
    [modelos, estado],
  )

  const enMedida = (c: CeldaVista) => medida === "todas" || c.pres === medida

  // Avance por medida (tarjetas del selector)
  const avance = useMemo(() => {
    const r: Record<Medida, { total: number; hechas: number }> = {
      entera: { total: 0, hechas: 0 },
      "9-9": { total: 0, hechas: 0 },
      "6-12": { total: 0, hechas: 0 },
      todas: { total: 0, hechas: 0 },
    }
    for (const v of vistas)
      for (const c of v.celdas) {
        r.todas.total++
        if (c.cotejada) r.todas.hechas++
        if (c.pres !== "otra") {
          r[c.pres].total++
          if (c.cotejada) r[c.pres].hechas++
        }
      }
    return r
  }, [vistas])

  const nCompletos = vistas.filter((v) => v.completo).length
  const celdasMedida = vistas.flatMap((v) => v.celdas.filter(enMedida))
  const nCoincidentes = celdasMedida.filter((c) => !c.cotejada && c.coincide).length
  const nDiferencia = celdasMedida.filter((c) => c.diferencia).length
  const nRevisar = celdasMedida.filter((c) => !c.cotejada && c.revisar).length

  const pendientesAplicar = vistas.flatMap((v) =>
    v.celdas.filter((c) => c.cotejada && !c.aplicada).map((c) => ({ v, c })),
  )
  const ajustes = pendientesAplicar
    .filter(({ c }) => c.contado != null && c.contado !== c.sistema)
    .map(({ v, c }) => ({ v, c, contado: c.contado as number }))

  const [filtro, setFiltro] = useState<"todas" | "pendientes" | "diferencia" | "revisar" | "cotejadas">("todas")
  const [busqueda, setBusqueda] = useState("")

  const visibles = useMemo(() => {
    const q = norm(busqueda)
    return vistas
      .map((v) => ({ v, rel: v.celdas.filter(enMedida) }))
      .filter(({ v, rel }) => {
        if (rel.length === 0) return false
        if (q && !norm(v.m.nombre).includes(q)) return false
        if (filtro === "pendientes") return rel.some((c) => !c.cotejada)
        if (filtro === "cotejadas") return rel.every((c) => c.cotejada)
        if (filtro === "diferencia") return rel.some((c) => c.diferencia)
        if (filtro === "revisar") return rel.some((c) => !c.cotejada && c.revisar)
        return true
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vistas, filtro, busqueda, medida])

  const nPendientesMedida = vistas.filter((v) => v.celdas.filter(enMedida).some((c) => !c.cotejada)).length
  const nCotejadasMedida = vistas.filter((v) => {
    const rel = v.celdas.filter(enMedida)
    return rel.length > 0 && rel.every((c) => c.cotejada)
  }).length
  const nModelosMedida = vistas.filter((v) => v.celdas.some(enMedida)).length

  function cotejarCoincidentes() {
    const ids = celdasMedida.filter((c) => !c.cotejada && c.coincide).map((c) => c.producto.id)
    if (ids.length === 0) return
    marcar(ids, true)
    toast.success(`${ids.length} cotejada${ids.length === 1 ? "" : "s"}: el conteo coincide con el sistema.`)
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
      const fallidos = new Set(res.ok ? res.fallidos.map((f) => f.productoId) : [])
      setEstado((prev) => {
        const aplicada = { ...prev.aplicada }
        for (const { c } of pendientesAplicar) if (!fallidos.has(c.producto.id)) aplicada[c.producto.id] = true
        return { ...prev, aplicada }
      })
      if (res.ok && res.fallidos.length > 0) {
        toast.error(`${res.fallidos.length} ajuste(s) fallaron: ${res.fallidos[0].error}`)
      } else {
        toast.success(
          ajustes.length === 0
            ? "Todo coincidía: no hubo nada que ajustar."
            : `Inventario actualizado: ${ajustes.length} ajuste${ajustes.length === 1 ? "" : "s"}.`,
        )
      }
      setConfirmando(false)
    } catch {
      toast.error("No se pudo conectar con el servidor. Tu avance sigue guardado; intenta de nuevo.")
    } finally {
      setAplicando(false)
    }
  }

  const medidaActual = MEDIDAS.find((x) => x.id === medida)!

  return (
    <div className="flex flex-col gap-4 p-4 pb-40 md:px-8 md:py-6 md:pb-28">
      <PageHeader
        breadcrumb={[{ label: "Inventario", href: "/inventario" }]}
        title="Cotejar inventario"
        subtitle="Reconteo de cintas, medida por medida"
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

      {/* Selector de medida + avance */}
      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-pc-ink-3">1 · Elige la medida a cotejar</h2>
          <span className="text-[12.5px] text-pc-ink-3">
            <b className="text-pc-ink">{nCompletos}</b> de {vistas.length} modelos con todas sus medidas cotejadas
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {MEDIDAS.map((x) => {
            const a = avance[x.id]
            const activo = medida === x.id
            const listo = a.total > 0 && a.hechas === a.total
            const pct = a.total ? Math.round((a.hechas / a.total) * 100) : 0
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => setMedida(x.id)}
                aria-pressed={activo}
                className={`rounded-2xl border p-3 text-left transition-all ${
                  activo
                    ? "border-pc-teal bg-pc-tint shadow-sm ring-1 ring-pc-teal"
                    : "border-pc-line bg-pc-card hover:bg-pc-hover"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold text-pc-ink">{x.plural}</span>
                  {listo && (
                    <span className="grid size-5 place-items-center rounded-full bg-pc-green-soft text-pc-green-ink">
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[12px] text-pc-ink-3">
                  <b className="text-[15px] text-pc-ink">{a.hechas}</b> / {a.total} cotejadas
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-pc-subtle">
                  <motion.div
                    className={`h-full rounded-full ${listo ? "bg-pc-green" : "bg-pc-teal"}`}
                    initial={false}
                    animate={{ width: `${pct}%` }}
                    transition={{ type: "spring", stiffness: 120, damping: 20 }}
                  />
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Fotos (solo la medida elegida) */}
      <section className="rounded-2xl border border-pc-line bg-pc-card shadow-sm">
        <button
          type="button"
          onClick={() => setFotosAbierto((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-[15px] font-semibold text-pc-ink">
            <Sparkles className="size-4 text-pc-teal-ink" />
            2 · Contar con fotos (opcional)
          </span>
          <span className="flex items-center gap-2 text-[12px] text-pc-ink-3">
            {presVisibles.map((p) => (
              <EstadoPres key={p.id} etiqueta={p.corta} estado={estadoIA[p.id]} />
            ))}
            <ChevronDown className={`size-4 transition-transform ${fotosAbierto ? "rotate-180" : ""}`} />
          </span>
        </button>

        {fotosAbierto && (
          <div className="border-t border-pc-line px-4 pb-4 pt-3">
            <p className="text-[13px] text-pc-ink-2">
              {medida === "todas" ? (
                <>Sube una foto de <b>todas</b> las cintas de cada medida.</>
              ) : (
                <>
                  Pon <b>todas las {medidaActual.plural}</b> a la vista y toma la foto.
                </>
              )}{" "}
              Si no caben en una, usa hasta {MAX_FOTOS} fotos. Junta las del mismo modelo en un montón y sepáralo de los
              demás: así el conteo sale más exacto. Después tú confirmas modelo por modelo.
            </p>
            <div className={`mt-3 grid gap-3 ${medida === "todas" ? "md:grid-cols-3" : "max-w-md"}`}>
              {presVisibles.map((p) => (
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
                {totalFotos} foto{totalFotos === 1 ? "" : "s"} lista{totalFotos === 1 ? "" : "s"} · no se guardan, solo
                se usan para contar.
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

      {/* Checklist */}
      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-pc-ink-3">
          3 · Revisa y coteja ·{medidaActual.plural}
        </h2>

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
                ["todas", "Todos", nModelosMedida],
                ["pendientes", "Por cotejar", nPendientesMedida],
                ["diferencia", "Con diferencia", nDiferencia],
                ["revisar", "Por revisar", nRevisar],
                ["cotejadas", "Cotejados", nCotejadasMedida],
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
              className="inline-flex items-center gap-1.5 rounded-xl border border-pc-green-line bg-pc-green-soft px-3 py-2 text-[13px] font-semibold text-pc-green-ink hover:brightness-95 md:ml-auto"
            >
              <CheckCheck className="size-4" />
              Cotejar las {nCoincidentes} que coinciden
            </button>
          )}
        </div>

        {visibles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-pc-line px-4 py-10 text-center text-sm text-pc-ink-3">
            {vistas.length === 0 ? "No hay cintas en el catálogo." : "Ningún modelo con ese filtro."}
          </p>
        ) : (
          <ul className={`grid gap-3 ${medida === "todas" ? "md:grid-cols-2 2xl:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-3"}`}>
            {visibles.map(({ v, rel }) => (
              <TarjetaModelo
                key={v.m.clave}
                v={v}
                rel={rel}
                enfocada={medida !== "todas"}
                onContar={setContado}
                onMarcar={marcar}
              />
            ))}
          </ul>
        )}
      </section>

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
                  {pendientesAplicar.length} cotejada{pendientesAplicar.length === 1 ? "" : "s"} por aplicar
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
            nCotejadas={pendientesAplicar.length}
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

/** Mini-checklist: una pastilla por medida del modelo, verde si ya está cotejada. */
function MiniChecklist({ celdas, resaltar }: { celdas: CeldaVista[]; resaltar: boolean }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1" aria-label="Medidas cotejadas">
      {celdas.map((c) => (
        <span
          key={c.producto.id}
          title={c.cotejada ? `${c.etiqueta}: cotejada` : `${c.etiqueta}: por cotejar`}
          className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10.5px] font-semibold leading-none ${
            c.cotejada
              ? "border-pc-green-line bg-pc-green-soft text-pc-green-ink"
              : resaltar
                ? "border-pc-line-strong bg-pc-card text-pc-ink-2"
                : "border-pc-line bg-pc-subtle text-pc-ink-3"
          }`}
        >
          {c.cotejada ? <Check className="size-2.5" strokeWidth={3.5} /> : <span className="size-1.5 rounded-full bg-current opacity-40" />}
          {c.etiqueta}
        </span>
      ))}
    </div>
  )
}

function TarjetaModelo({
  v,
  rel,
  enfocada,
  onContar,
  onMarcar,
}: {
  v: ModeloVista
  rel: CeldaVista[]
  enfocada: boolean
  onContar: (productoId: string, valor: number | null) => void
  onMarcar: (ids: string[], cotejada: boolean) => void
}) {
  const { m, celdas, completo } = v
  const relCompleta = rel.every((c) => c.cotejada)
  const porRevisar = rel.some((c) => !c.cotejada && c.revisar)
  const conConteo = rel.some((c) => c.contado != null)

  return (
    <li
      className={`rounded-2xl border p-3 transition-colors ${
        relCompleta
          ? "border-pc-green-line bg-pc-green-soft"
          : porRevisar
            ? "border-pc-amber-line bg-pc-card"
            : "border-pc-line bg-pc-card"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-pc-subtle">
          {m.imagen_url ? <Image src={m.imagen_url} alt={m.nombre} fill sizes="48px" className="object-cover" /> : null}
          <AnimatePresence>
            {completo && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 18 }}
                className="absolute inset-0 flex items-center justify-center bg-[oklch(0.55_0.15_160/0.82)]"
                title="Todas las medidas cotejadas"
              >
                <CheckCheck className="size-6 text-white" strokeWidth={2.5} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold text-pc-ink">{m.nombre}</div>
          <MiniChecklist celdas={celdas} resaltar={enfocada} />
        </div>
        {/* En vista "todas" hay varias medidas: un botón para cotejarlas juntas */}
        {!enfocada && rel.length > 1 &&
          (relCompleta ? (
            <button
              type="button"
              onClick={() => onMarcar(rel.map((c) => c.producto.id), false)}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-medium text-pc-ink-3 hover:bg-pc-hover"
            >
              <Undo2 className="size-3.5" />
              Deshacer
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onMarcar(rel.filter((c) => c.contado != null).map((c) => c.producto.id), true)}
              disabled={!conConteo}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-pc-teal px-2.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm hover:bg-pc-teal-hover disabled:opacity-40"
            >
              <CheckCheck className="size-4" />
              Todo
            </button>
          ))}
      </div>

      <div className="mt-2.5 space-y-1.5">
        {rel.map((c) => (
          <FilaCelda
            key={c.producto.id}
            c={c}
            onChange={(val) => onContar(c.producto.id, val)}
            onToggle={() => onMarcar([c.producto.id], !c.cotejada)}
          />
        ))}
      </div>
    </li>
  )
}

function FilaCelda({
  c,
  onChange,
  onToggle,
}: {
  c: CeldaVista
  onChange: (valor: number | null) => void
  onToggle: () => void
}) {
  const diff = c.contado == null ? null : c.contado - c.sistema
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 ${
        c.cotejada ? "bg-pc-card/70" : "bg-pc-subtle/60"
      }`}
    >
      <div className="w-[58px] shrink-0">
        <div className="text-[12.5px] font-semibold text-pc-ink">{c.etiqueta}</div>
        <div className="text-[11.5px] text-pc-ink-3">
          Sist. <b className="text-pc-ink-2">{c.sistema}</b>
        </div>
        {c.ia && (
          <div
            className={`flex items-center gap-0.5 text-[10px] font-semibold ${
              c.revisar ? "text-pc-amber-ink" : "text-pc-teal-ink"
            }`}
            title={c.ia === "no-vista" ? "La IA no vio este modelo en la foto" : `Contado por IA (confianza ${c.ia})`}
          >
            <Sparkles className="size-2.5" />
            {c.ia === "no-vista" ? "no vista" : "IA"}
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          aria-label="Restar uno"
          onClick={() => onChange(Math.max(0, (c.contado ?? 0) - 1))}
          className="grid size-8 place-items-center rounded-lg border border-pc-line bg-pc-card text-pc-ink-2 hover:bg-pc-hover active:scale-95"
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
            c.revisar && !c.cotejada ? "border-pc-amber-line" : "border-pc-line"
          }`}
        />
        <button
          type="button"
          aria-label="Sumar uno"
          onClick={() => onChange((c.contado ?? 0) + 1)}
          className="grid size-8 place-items-center rounded-lg border border-pc-line bg-pc-card text-pc-ink-2 hover:bg-pc-hover active:scale-95"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div className="w-9 shrink-0 text-center">
        {diff == null ? null : diff === 0 ? (
          <span className="text-[12px] font-bold text-pc-green-ink">=</span>
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
      <button
        type="button"
        onClick={onToggle}
        disabled={c.contado == null && !c.cotejada}
        aria-pressed={c.cotejada}
        aria-label={c.cotejada ? `Deshacer cotejo ${c.etiqueta}` : `Cotejar ${c.etiqueta}`}
        title={c.cotejada ? (c.aplicada ? "Cotejada y aplicada · toca para deshacer" : "Cotejada · toca para deshacer") : "Cotejar"}
        className={`grid size-9 shrink-0 place-items-center rounded-full border-2 transition-all active:scale-90 disabled:opacity-30 ${
          c.cotejada
            ? "border-[oklch(0.55_0.15_160)] bg-[oklch(0.55_0.15_160)] text-white"
            : "border-pc-line-strong bg-pc-card text-pc-ink-4 hover:border-pc-teal hover:text-pc-teal-ink"
        }`}
      >
        <Check className="size-5" strokeWidth={3} />
      </button>
    </div>
  )
}

function ModalConfirmar({
  ajustes,
  nCotejadas,
  aplicando,
  onCancelar,
  onConfirmar,
}: {
  ajustes: { modelo: string; etiqueta: string; sistema: number; contado: number }[]
  nCotejadas: number
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
              Las {nCotejadas} medidas cotejadas coinciden con el sistema: no hay stock que cambiar. Se marcarán como aplicadas.
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
