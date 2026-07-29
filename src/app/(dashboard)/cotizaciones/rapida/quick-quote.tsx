"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Gift,
  X,
  Check,
  ChevronRight,
  UserRound,
  ShoppingBasket,
  FileText,
  MessageCircle,
  ArrowLeft,
} from "lucide-react"
import type { Cliente, Producto } from "@/lib/cotizacion-types"
import { formatMXN2 } from "@/lib/utils"
import { resumenRegalos } from "@/lib/regalos"
import { saveCotizacion, siguienteNumeroCotizacion } from "../actions"

/**
 * Cotización rápida — flujo pensado para el iPhone, con el cliente enfrente.
 *
 * Una sola pantalla que se recorre con el pulgar: cliente → productos →
 * guardar. Nada de preview de PDF ni panel lateral (eso vive en el formulario
 * completo de escritorio): aquí manda la velocidad.
 *
 * Decisiones móviles:
 * - Barra fija abajo con el total y el botón de guardar (respeta el home
 *   indicator vía .pc-safe-bottom). Siempre visible: no hay que scrollear
 *   al final para cobrar.
 * - Selección de cliente y de producto en hojas a pantalla completa con el
 *   buscador enfocado — el teclado sube y se escribe de inmediato.
 * - Cantidades con stepper −/+ de 36px (nada de teclear en inputs chicos).
 * - Toda la matemática es la MISMA que el formulario de escritorio
 *   (round2 → descuento sobre el subtotal → IVA sobre la base gravable).
 * - Al guardar: hoja de éxito con Ver/PDF y WhatsApp al cliente.
 */

type Linea = {
  producto_id: string
  sku: string | null
  nombre: string
  imagen_url: string | null
  cantidad: number
  precio_unitario: number
  costo_unitario: number
  es_regalo: boolean
  precio_lista: number | null
}

const round2 = (n: number) => Math.round(n * 100) / 100
const lineaKey = (l: { producto_id: string; es_regalo: boolean }) =>
  `${l.producto_id}|${l.es_regalo ? "R" : "N"}`

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

function todayISO() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
    .toISOString()
    .slice(0, 10)
}
function plus30ISO() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 30)
    .toISOString()
    .slice(0, 10)
}

export function QuickQuote({
  clientes,
  productos,
  productosError,
}: {
  clientes: Cliente[]
  productos: Producto[]
  productosError: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [clienteId, setClienteId] = useState("")
  const [numero, setNumero] = useState("")
  const [lineas, setLineas] = useState<Linea[]>([])
  const [ivaActivo, setIvaActivo] = useState(true)
  const [descuentoPct, setDescuentoPct] = useState(0)
  const [notas, setNotas] = useState("")

  const [sheet, setSheet] = useState<null | "cliente" | "producto" | "ajustes">(null)
  const [guardada, setGuardada] = useState<{ id: string; numero: string } | null>(
    null,
  )

  const cliente = useMemo(
    () => clientes.find((c) => c.id === clienteId) ?? null,
    [clienteId, clientes],
  )

  // ─── Totales (idénticos al formulario de escritorio) ──────────────
  const subtotal = round2(
    lineas.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0),
  )
  const descuento = round2(
    Math.max(0, Math.min(subtotal, subtotal * (descuentoPct / 100))),
  )
  const baseGravable = round2(subtotal - descuento)
  const iva = ivaActivo ? round2(baseGravable * 0.16) : 0
  const total = round2(baseGravable + iva)
  const costoProductos = round2(
    lineas.reduce((s, l) => s + l.costo_unitario * l.cantidad, 0),
  )
  const utilidad = round2(subtotal - descuento - costoProductos)
  const regalos = resumenRegalos(
    lineas.map((l) => ({
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
      costo_unitario: l.costo_unitario,
      precio_lista: l.precio_lista,
      es_regalo: l.es_regalo,
    })),
  )
  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0)

  function elegirCliente(id: string) {
    setClienteId(id)
    setSheet(null)
    void (async () => {
      const n = await siguienteNumeroCotizacion(id, todayISO())
      if (n) setNumero(n)
    })()
  }

  function agregar(p: Producto, comoRegalo = false) {
    const nueva: Linea = {
      producto_id: p.id,
      sku: p.sku,
      nombre: p.nombre,
      imagen_url: p.imagen_url,
      cantidad: 1,
      precio_unitario: comoRegalo ? 0 : p.precio,
      costo_unitario: Number(p.costo ?? 0),
      es_regalo: comoRegalo,
      precio_lista: comoRegalo ? p.precio : null,
    }
    setLineas((prev) => {
      const i = prev.findIndex((l) => lineaKey(l) === lineaKey(nueva))
      if (i === -1) return [...prev, nueva]
      const copy = [...prev]
      copy[i] = { ...copy[i], cantidad: copy[i].cantidad + 1 }
      return copy
    })
  }

  function cambiarCantidad(key: string, delta: number) {
    setLineas((prev) =>
      prev.flatMap((l) => {
        if (lineaKey(l) !== key) return [l]
        const n = l.cantidad + delta
        return n <= 0 ? [] : [{ ...l, cantidad: n }]
      }),
    )
  }

  function quitar(key: string) {
    setLineas((prev) => prev.filter((l) => lineaKey(l) !== key))
  }

  function alternarRegaloLinea(key: string) {
    setLineas((prev) => {
      const i = prev.findIndex((l) => lineaKey(l) === key)
      if (i === -1) return prev
      const l = prev[i]
      const regalo = !l.es_regalo
      const lista = l.precio_lista ?? l.precio_unitario
      const cambiada: Linea = {
        ...l,
        es_regalo: regalo,
        precio_unitario: regalo ? 0 : lista,
        precio_lista: regalo ? lista : null,
      }
      // Si al cambiar de tipo choca con una línea igual, se fusionan.
      const gemela = prev.findIndex(
        (x, idx) => idx !== i && lineaKey(x) === lineaKey(cambiada),
      )
      if (gemela === -1) {
        const copy = [...prev]
        copy[i] = cambiada
        return copy
      }
      return prev
        .map((x, idx) =>
          idx === gemela ? { ...x, cantidad: x.cantidad + cambiada.cantidad } : x,
        )
        .filter((_, idx) => idx !== i)
    })
  }

  function guardar() {
    if (!clienteId) {
      toast.error("Elige el cliente.")
      setSheet("cliente")
      return
    }
    if (lineas.length === 0) {
      toast.error("Agrega al menos un producto.")
      setSheet("producto")
      return
    }
    startTransition(async () => {
      const result = await saveCotizacion({
        numero: numero.trim(),
        cliente_id: clienteId,
        fecha: todayISO(),
        valida_hasta: plus30ISO(),
        moneda: "MXN",
        subtotal,
        iva,
        descuento,
        descuento_tipo: "pct",
        descuento_valor: descuentoPct,
        total,
        costo_productos: costoProductos,
        costo_envio: 0,
        notas: notas.trim() || null,
        items: lineas.map((l) => ({
          producto_id: l.producto_id,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          costo_unitario: l.costo_unitario,
          subtotal: round2(l.precio_unitario * l.cantidad),
          es_regalo: l.es_regalo,
          precio_lista: l.precio_lista,
        })),
      })
      if (!result.ok) {
        toast.error(result.error, { duration: 8000 })
        return
      }
      setGuardada({ id: result.id, numero: numero.trim() })
    })
  }

  // Reinicia para hacer otra cotización sin salir de la pantalla.
  function otraNueva() {
    setGuardada(null)
    setClienteId("")
    setNumero("")
    setLineas([])
    setDescuentoPct(0)
    setNotas("")
    router.refresh()
  }

  return (
    <div className="min-h-screen pb-40">
      {/* ─── Encabezado compacto ─── */}
      <header className="sticky top-0 z-20 border-b border-black/5 bg-white/90 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Link
            href="/cotizaciones"
            aria-label="Volver a cotizaciones"
            className="pc-tap -ml-1 flex size-9 items-center justify-center rounded-xl text-gray-400 active:bg-black/5"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-bold leading-tight tracking-[-0.02em] text-gray-900">
              Cotización rápida
            </h1>
            <p className="truncate text-[11px] text-gray-500">
              {numero || "el número se genera al elegir cliente"}
            </p>
          </div>
          <Link
            href="/cotizaciones/nueva"
            className="pc-tap shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-[#0F766E] active:bg-black/5"
          >
            Modo completo
          </Link>
        </div>
      </header>

      <div className="space-y-3 p-4">
        {productosError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {productosError}
          </div>
        )}

        {/* ─── 1. Cliente ─── */}
        <button
          type="button"
          onClick={() => setSheet("cliente")}
          className="pc-tap flex w-full items-center gap-3 rounded-2xl border border-black/5 bg-white p-4 text-left shadow-[0_2px_8px_rgba(0,0,0,0.03)] active:bg-gray-50"
        >
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${
              cliente ? "text-white" : "bg-[#F5F7F6] text-gray-400"
            }`}
            style={
              cliente
                ? { background: "linear-gradient(135deg,#0F766E,#14B8A6)" }
                : undefined
            }
          >
            {cliente ? (
              (cliente.nombre_negocio ?? cliente.nombre)[0]?.toUpperCase()
            ) : (
              <UserRound className="size-5" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">
              Cliente
            </span>
            <span className="block truncate text-[15px] font-semibold text-gray-900">
              {cliente
                ? (cliente.nombre_negocio ?? cliente.nombre)
                : "Elegir cliente"}
            </span>
            {cliente?.telefono && (
              <span className="block truncate text-[12px] text-gray-500">
                {cliente.telefono}
              </span>
            )}
          </span>
          <ChevronRight className="size-5 shrink-0 text-gray-300" />
        </button>

        {/* ─── 2. Productos ─── */}
        <button
          type="button"
          onClick={() => setSheet("producto")}
          className="pc-tap flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-[15px] font-semibold text-white shadow-[0_4px_14px_rgba(15,118,110,0.25)] active:scale-[0.99]"
          style={{ background: "linear-gradient(135deg,#0F766E,#0D6A62)" }}
        >
          <Plus className="size-5" />
          Agregar productos
        </button>

        {lineas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/10 bg-white/60 px-4 py-10 text-center">
            <ShoppingBasket className="mx-auto size-7 text-gray-300" />
            <p className="mt-2 text-[13px] font-medium text-gray-500">
              Sin productos todavía
            </p>
            <p className="mt-0.5 text-[12px] text-gray-400">
              Toca «Agregar productos» y busca por nombre o SKU.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {lineas.map((l) => {
              const key = lineaKey(l)
              return (
                <li
                  key={key}
                  className={`rounded-2xl border p-3 shadow-[0_2px_8px_rgba(0,0,0,0.03)] ${
                    l.es_regalo
                      ? "border-fuchsia-200 bg-fuchsia-50/60"
                      : "border-black/5 bg-white"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {l.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={l.imagen_url}
                        alt=""
                        className="size-11 shrink-0 rounded-xl border border-black/5 object-cover"
                      />
                    ) : (
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#F5F7F6] font-mono text-[10px] font-semibold text-gray-400">
                        {(l.sku ?? l.nombre)
                          .replace(/[^A-Z0-9]/gi, "")
                          .slice(0, 3)
                          .toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium leading-tight text-gray-900">
                        {l.nombre}
                        {l.es_regalo && (
                          <span className="ml-1.5 rounded bg-fuchsia-600 px-1.5 py-px align-middle text-[9px] font-bold uppercase tracking-wide text-white">
                            Regalo
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-gray-500">
                        {l.es_regalo
                          ? `Cortesía · valor ${formatMXN2(l.precio_lista ?? 0)} c/u`
                          : `${formatMXN2(l.precio_unitario)} c/u`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => quitar(key)}
                      aria-label={`Quitar ${l.nombre}`}
                      className="pc-tap -mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-300 active:bg-black/5 active:text-rose-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(key, -1)}
                        aria-label="Quitar una pieza"
                        className="pc-stepper-btn"
                      >
                        <Minus className="size-4" />
                      </button>
                      <span className="min-w-8 text-center text-[16px] font-bold tabular-nums text-gray-900">
                        {l.cantidad}
                      </span>
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(key, 1)}
                        aria-label="Agregar una pieza"
                        className="pc-stepper-btn"
                      >
                        <Plus className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => alternarRegaloLinea(key)}
                        aria-pressed={l.es_regalo}
                        className={`pc-tap ml-1 flex h-9 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium ${
                          l.es_regalo
                            ? "bg-fuchsia-100 text-fuchsia-700"
                            : "text-gray-400 active:bg-black/5"
                        }`}
                      >
                        <Gift className="size-4" />
                        {l.es_regalo ? "Regalo" : "Regalar"}
                      </button>
                    </div>
                    <span
                      className={`text-[15px] font-bold tabular-nums ${
                        l.es_regalo ? "text-fuchsia-600" : "text-gray-900"
                      }`}
                    >
                      {l.es_regalo
                        ? "Gratis"
                        : formatMXN2(l.precio_unitario * l.cantidad)}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {/* ─── 3. Ajustes rápidos (IVA / descuento / notas) ─── */}
        {lineas.length > 0 && (
          <button
            type="button"
            onClick={() => setSheet("ajustes")}
            className="pc-tap flex w-full items-center justify-between gap-2 rounded-2xl border border-black/5 bg-white px-4 py-3.5 text-left shadow-[0_2px_8px_rgba(0,0,0,0.03)] active:bg-gray-50"
          >
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold text-gray-900">
                IVA, descuento y notas
              </span>
              <span className="block truncate text-[11.5px] text-gray-500">
                {ivaActivo ? "Con IVA 16%" : "Sin IVA"}
                {descuentoPct > 0 ? ` · ${descuentoPct}% descuento` : ""}
                {regalos.lineas > 0
                  ? ` · ${regalos.piezas} pzs de regalo`
                  : ""}
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-gray-300" />
          </button>
        )}
      </div>

      {/* ─── Barra fija de total + guardar ─── */}
      <div className="pc-safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-black/5 bg-white/95 px-4 pt-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">
              Total {piezas > 0 ? `· ${piezas} pzs` : ""}
            </p>
            <p className="text-[24px] font-bold leading-none tabular-nums text-gray-900">
              {formatMXN2(total)}
            </p>
            {lineas.length > 0 && (
              <p className="mt-0.5 truncate text-[11px] text-gray-500">
                Utilidad {formatMXN2(utilidad)}
                {regalos.costo > 0
                  ? ` · regalos −${formatMXN2(regalos.costo)}`
                  : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={guardar}
            disabled={pending}
            className="pc-tap flex h-12 shrink-0 items-center gap-2 rounded-2xl px-5 text-[15px] font-semibold text-white shadow-[0_4px_14px_rgba(15,118,110,0.25)] transition-transform active:scale-[0.97] disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#0F766E,#0D6A62)" }}
          >
            {pending ? (
              <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Check className="size-5" />
            )}
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      {/* ─── Hojas ─── */}
      {sheet === "cliente" && (
        <ClienteSheet
          clientes={clientes}
          onPick={elegirCliente}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "producto" && (
        <ProductoSheet
          productos={productos}
          lineas={lineas}
          onAdd={agregar}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "ajustes" && (
        <AjustesSheet
          ivaActivo={ivaActivo}
          setIvaActivo={setIvaActivo}
          descuentoPct={descuentoPct}
          setDescuentoPct={setDescuentoPct}
          notas={notas}
          setNotas={setNotas}
          subtotal={subtotal}
          descuento={descuento}
          iva={iva}
          total={total}
          onClose={() => setSheet(null)}
        />
      )}
      {guardada && (
        <ExitoSheet
          numero={guardada.numero}
          id={guardada.id}
          total={total}
          telefono={cliente?.telefono ?? null}
          clienteNombre={cliente?.nombre_negocio ?? cliente?.nombre ?? ""}
          onOtra={otraNueva}
        />
      )}
    </div>
  )
}

// ─── Contenedor de hoja a pantalla completa ──────────────────────────

function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  // Bloquea el scroll del fondo mientras la hoja está abierta.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="flex items-center gap-2 border-b border-black/5 px-4 py-3">
        <h2 className="min-w-0 flex-1 text-[16px] font-bold tracking-[-0.02em] text-gray-900">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="pc-tap flex size-9 items-center justify-center rounded-xl text-gray-400 active:bg-black/5"
        >
          <X className="size-5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>
      {footer && (
        <div className="pc-safe-bottom border-t border-black/5 bg-white px-4 pt-3">
          {footer}
        </div>
      )}
    </div>
  )
}

function ClienteSheet({
  clientes,
  onPick,
  onClose,
}: {
  clientes: Cliente[]
  onPick: (id: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [])

  const filtrados = useMemo(() => {
    const s = norm(q.trim())
    if (!s) return clientes.slice(0, 40)
    return clientes
      .filter((c) =>
        norm(
          `${c.nombre} ${c.nombre_negocio ?? ""} ${c.telefono ?? ""} ${c.ciudad ?? ""}`,
        ).includes(s),
      )
      .slice(0, 40)
  }, [q, clientes])

  return (
    <Sheet title="Elegir cliente" onClose={onClose}>
      <div className="sticky top-0 z-10 bg-white px-4 pb-2 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, negocio o teléfono…"
            autoComplete="off"
            className="h-12 w-full rounded-xl border border-black/10 bg-white pl-9 pr-3 text-gray-900 placeholder:text-gray-400 focus:border-[#0F766E]/40 focus:outline-none focus:ring-2 focus:ring-[#0F766E]/15"
          />
        </div>
      </div>
      <ul className="divide-y divide-gray-100 px-4">
        {filtrados.length === 0 ? (
          <li className="py-10 text-center text-[13px] text-gray-400">
            Sin resultados.
          </li>
        ) : (
          filtrados.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c.id)}
                className="pc-touch-row flex w-full items-center gap-3 py-3 text-left active:bg-gray-50"
              >
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg,#0F766E,#14B8A6)" }}
                >
                  {(c.nombre_negocio ?? c.nombre)[0]?.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-gray-900">
                    {c.nombre_negocio ?? c.nombre}
                  </span>
                  <span className="block truncate text-[12px] text-gray-500">
                    {[c.nombre_negocio ? c.nombre : null, c.telefono, c.ciudad]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-gray-300" />
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="px-4 py-4">
        <Link
          href="/clientes/nuevo"
          className="pc-tap flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white py-3 text-[14px] font-medium text-[#0F766E] active:bg-gray-50"
        >
          <Plus className="size-4" />
          Crear cliente nuevo
        </Link>
      </div>
    </Sheet>
  )
}

function ProductoSheet({
  productos,
  lineas,
  onAdd,
  onClose,
}: {
  productos: Producto[]
  lineas: Linea[]
  onAdd: (p: Producto, comoRegalo?: boolean) => void
  onClose: () => void
}) {
  const [q, setQ] = useState("")
  const [modoRegalo, setModoRegalo] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [])

  // Cuántas piezas de cada producto ya van en la cotización (badge)
  const yaEn = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of lineas)
      m.set(l.producto_id, (m.get(l.producto_id) ?? 0) + l.cantidad)
    return m
  }, [lineas])

  const filtrados = useMemo(() => {
    const s = norm(q.trim())
    if (!s) return productos.slice(0, 40)
    return productos
      .filter((p) => norm(`${p.nombre} ${p.sku ?? ""}`).includes(s))
      .slice(0, 40)
  }, [q, productos])

  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0)

  return (
    <Sheet
      title="Agregar productos"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="pc-tap flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white active:scale-[0.99]"
          style={{ background: "linear-gradient(135deg,#0F766E,#0D6A62)" }}
        >
          <Check className="size-5" />
          Listo{piezas > 0 ? ` · ${piezas} pzs` : ""}
        </button>
      }
    >
      <div className="sticky top-0 z-10 space-y-2 bg-white px-4 pb-2 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o SKU…"
            autoComplete="off"
            className="h-12 w-full rounded-xl border border-black/10 bg-white pl-9 pr-3 text-gray-900 placeholder:text-gray-400 focus:border-[#0F766E]/40 focus:outline-none focus:ring-2 focus:ring-[#0F766E]/15"
          />
        </div>
        <button
          type="button"
          onClick={() => setModoRegalo((v) => !v)}
          aria-pressed={modoRegalo}
          className={`pc-tap flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-medium transition-colors ${
            modoRegalo
              ? "bg-fuchsia-600 text-white"
              : "bg-[#F5F7F6] text-gray-600"
          }`}
        >
          <Gift className="size-4" />
          {modoRegalo
            ? "Modo regalo activo — lo que toques va en $0"
            : "Agregar como regalo"}
        </button>
      </div>
      <ul className="divide-y divide-gray-100 px-4">
        {filtrados.length === 0 ? (
          <li className="py-10 text-center text-[13px] text-gray-400">
            Sin resultados.
          </li>
        ) : (
          filtrados.map((p) => {
            const n = yaEn.get(p.id) ?? 0
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onAdd(p, modoRegalo)}
                  className="pc-touch-row flex w-full items-center gap-3 py-3 text-left active:bg-gray-50"
                >
                  {p.imagen_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imagen_url}
                      alt=""
                      className="size-11 shrink-0 rounded-xl border border-black/5 object-cover"
                    />
                  ) : (
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#F5F7F6] font-mono text-[10px] font-semibold text-gray-400">
                      {(p.sku ?? p.nombre)
                        .replace(/[^A-Z0-9]/gi, "")
                        .slice(0, 3)
                        .toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-gray-900">
                      {p.nombre}
                    </span>
                    <span className="block truncate text-[12px] text-gray-500">
                      {p.sku ? `${p.sku} · ` : ""}
                      <span className="font-semibold text-[#0F766E]">
                        {formatMXN2(p.precio)}
                      </span>
                      {p.peso ? ` · ${p.peso}` : ""}
                    </span>
                  </span>
                  {n > 0 && (
                    <span className="shrink-0 rounded-full bg-[#DFF7F4] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[#0F766E]">
                      {n}
                    </span>
                  )}
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-white ${
                      modoRegalo ? "bg-fuchsia-600" : "bg-[#0F766E]"
                    }`}
                    aria-hidden
                  >
                    {modoRegalo ? (
                      <Gift className="size-4" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                  </span>
                </button>
              </li>
            )
          })
        )}
      </ul>
      <div className="h-4" />
    </Sheet>
  )
}

function AjustesSheet({
  ivaActivo,
  setIvaActivo,
  descuentoPct,
  setDescuentoPct,
  notas,
  setNotas,
  subtotal,
  descuento,
  iva,
  total,
  onClose,
}: {
  ivaActivo: boolean
  setIvaActivo: (v: boolean) => void
  descuentoPct: number
  setDescuentoPct: (v: number) => void
  notas: string
  setNotas: (v: string) => void
  subtotal: number
  descuento: number
  iva: number
  total: number
  onClose: () => void
}) {
  return (
    <Sheet
      title="IVA, descuento y notas"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="pc-tap flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white active:scale-[0.99]"
          style={{ background: "linear-gradient(135deg,#0F766E,#0D6A62)" }}
        >
          <Check className="size-5" />
          Listo
        </button>
      }
    >
      <div className="space-y-4 p-4">
        {/* IVA */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-black/5 bg-white p-4">
          <div className="min-w-0">
            <p className="text-[14.5px] font-semibold text-gray-900">IVA 16%</p>
            <p className="text-[12px] text-gray-500">
              Se aplica sobre el subtotal menos el descuento
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIvaActivo(!ivaActivo)}
            role="switch"
            aria-checked={ivaActivo}
            aria-label="Aplicar IVA"
            className={`pc-tap relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors ${
              ivaActivo ? "bg-[#0F766E]" : "bg-gray-300"
            }`}
          >
            <span
              aria-hidden
              className={`inline-block size-6 transform rounded-full bg-white shadow transition ${
                ivaActivo ? "translate-x-[28px]" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Descuento con botones grandes */}
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <p className="text-[14.5px] font-semibold text-gray-900">Descuento</p>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {[0, 5, 10, 15, 20].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setDescuentoPct(pct)}
                aria-pressed={descuentoPct === pct}
                className={`pc-tap h-11 rounded-xl text-[14px] font-semibold tabular-nums transition-colors ${
                  descuentoPct === pct
                    ? "bg-[#0F766E] text-white"
                    : "bg-[#F5F7F6] text-gray-600"
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
          {descuento > 0 && (
            <p className="mt-2 text-[12px] tabular-nums text-rose-600">
              − {formatMXN2(descuento)} sobre {formatMXN2(subtotal)}
            </p>
          )}
        </div>

        {/* Notas */}
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <label className="block">
            <span className="text-[14.5px] font-semibold text-gray-900">
              Notas (opcional)
            </span>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              placeholder="Entrega, condiciones, referencia…"
              className="mt-2 w-full rounded-xl border border-black/10 bg-white p-3 text-gray-900 placeholder:text-gray-400 focus:border-[#0F766E]/40 focus:outline-none focus:ring-2 focus:ring-[#0F766E]/15"
            />
          </label>
        </div>

        {/* Resumen */}
        <div className="rounded-2xl bg-[#FAFAFA] p-4 text-[13px]">
          <Row label="Subtotal" value={formatMXN2(subtotal)} />
          {descuento > 0 && (
            <Row
              label="Descuento"
              value={`− ${formatMXN2(descuento)}`}
              tone="text-rose-600"
            />
          )}
          {iva > 0 && <Row label="IVA 16%" value={formatMXN2(iva)} />}
          <div className="mt-2 border-t border-black/5 pt-2">
            <Row label="Total" value={formatMXN2(total)} bold />
          </div>
        </div>
      </div>
    </Sheet>
  )
}

function Row({
  label,
  value,
  tone,
  bold,
}: {
  label: string
  value: string
  tone?: string
  bold?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-gray-600">{label}</span>
      <span
        className={`tabular-nums ${tone ?? "text-gray-900"} ${bold ? "text-[16px] font-bold" : "font-medium"}`}
      >
        {value}
      </span>
    </div>
  )
}

function ExitoSheet({
  numero,
  id,
  total,
  telefono,
  clienteNombre,
  onOtra,
}: {
  numero: string
  id: string
  total: number
  telefono: string | null
  clienteNombre: string
  onOtra: () => void
}) {
  const tel = (telefono ?? "").replace(/\D/g, "")
  const waTel = tel ? (tel.startsWith("52") ? tel : `52${tel}`) : null
  const waText = encodeURIComponent(
    `Hola ${clienteNombre}, te comparto tu cotización ${numero} de Piel Canela por ${formatMXN2(total)}. ¿La reviso contigo?`,
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-sm">
      <div className="pc-safe-bottom rounded-t-3xl bg-white px-5 pt-6">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-50">
          <Check className="size-7 text-emerald-600" />
        </div>
        <h2 className="text-center text-[19px] font-bold tracking-[-0.02em] text-gray-900">
          Cotización guardada
        </h2>
        <p className="mt-1 text-center font-mono text-[12.5px] text-gray-500">
          {numero}
        </p>
        <p className="mt-1 text-center text-[22px] font-bold tabular-nums text-gray-900">
          {formatMXN2(total)}
        </p>

        <div className="mt-5 space-y-2">
          <Link
            href={`/cotizaciones/${id}`}
            className="pc-tap flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white active:scale-[0.99]"
            style={{ background: "linear-gradient(135deg,#0F766E,#0D6A62)" }}
          >
            <FileText className="size-5" />
            Ver y descargar PDF
          </Link>
          {waTel && (
            <a
              href={`https://wa.me/${waTel}?text=${waText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="pc-tap flex w-full items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white py-3.5 text-[15px] font-semibold text-gray-800 active:bg-gray-50"
            >
              <MessageCircle className="size-5 text-emerald-600" />
              Avisar por WhatsApp
            </a>
          )}
          <button
            type="button"
            onClick={onOtra}
            className="pc-tap flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-medium text-[#0F766E] active:bg-gray-50"
          >
            <Plus className="size-5" />
            Hacer otra cotización
          </button>
        </div>
      </div>
    </div>
  )
}
