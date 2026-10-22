"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft,
  Copy,
  FileText,
  Minus,
  Plus,
  Printer,
  Search,
} from "lucide-react"
import { formatMXN2 } from "@/lib/utils"
import {
  listaParaWhatsApp,
  nombreEnLista,
  presentacionEnLista,
  type SeccionCatalogo,
} from "@/lib/lista-precios"

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

export function ListaPreciosView({
  secciones,
  error,
  fecha,
}: {
  secciones: SeccionCatalogo[]
  error: string | null
  fecha: string
}) {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [cant, setCant] = useState<Record<string, number>>({})

  const visibles = useMemo(() => {
    const s = norm(q.trim())
    if (!s) return secciones
    return secciones.flatMap((sec) => {
      // Buscar por la familia ("activador") deja toda la familia.
      if (norm(sec.label).includes(s)) return [sec]
      const productos = sec.productos.filter((p) =>
        norm(`${nombreEnLista(p)} ${p.sku ?? ""} ${p.peso ?? ""}`).includes(s),
      )
      return productos.length ? [{ ...sec, productos }] : []
    })
  }, [q, secciones])

  const todos = useMemo(() => secciones.flatMap((s) => s.productos), [secciones])
  const elegidos = todos.filter((p) => (cant[p.id] ?? 0) > 0)
  const piezas = elegidos.reduce((s, p) => s + (cant[p.id] ?? 0), 0)
  const subtotal = elegidos.reduce((s, p) => s + p.precio * (cant[p.id] ?? 0), 0)

  function poner(id: string, n: number) {
    setCant((prev) => {
      const v = Math.max(0, Math.min(999, Math.floor(n) || 0))
      const next = { ...prev }
      if (v === 0) delete next[id]
      else next[id] = v
      return next
    })
  }

  function cotizar() {
    const items = elegidos.map((p) => `${p.id}:${cant[p.id]}`).join(",")
    router.push(`/cotizaciones/rapida?items=${items}`)
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(listaParaWhatsApp(visibles))
      toast.success("Lista copiada", { description: "Pégala en WhatsApp." })
    } catch {
      toast.error("No se pudo copiar. Usa Imprimir / PDF.")
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-48 md:p-6 md:pb-32 print:max-w-none print:space-y-3 print:p-0 print:pb-0">
      <Link
        href="/cotizaciones"
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 print:hidden"
      >
        <ArrowLeft className="size-3.5" /> Cotizaciones
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-pc-teal-ink">
            Piel Canela
          </p>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            Lista de precios
          </h1>
          <p className="text-xs text-gray-500">
            {fecha} · Precios en pesos mexicanos (MXN)
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={copiar}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-gray-200 bg-pc-card px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 md:h-10"
          >
            <Copy className="size-4" aria-hidden /> Copiar para WhatsApp
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-pc-teal px-4 text-sm font-semibold text-white hover:bg-pc-teal-hover md:h-10"
          >
            <Printer className="size-4" aria-hidden /> Imprimir / PDF
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {error}
        </div>
      )}

      <div className="relative print:hidden">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar producto o familia…"
          autoComplete="off"
          className="h-12 w-full rounded-xl border border-gray-200 bg-pc-card pl-9 pr-3 text-gray-900 placeholder:text-gray-400 focus:border-pc-teal focus:outline-none focus:ring-2 focus:ring-pc-teal/15"
        />
      </div>

      <p className="text-xs text-gray-500 print:hidden">
        Escribe cuántas piezas quiere en cada renglón y toca{" "}
        <b>Cotizar</b>: la cotización se arma sola con todo lo marcado.
      </p>

      {visibles.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
          Sin resultados.
        </p>
      )}

      {visibles.map((sec) => (
        <section
          key={sec.key}
          aria-label={sec.label}
          className="overflow-hidden rounded-2xl border border-gray-200 bg-pc-card print:break-inside-avoid print:rounded-none print:border-x-0 print:border-t-0"
        >
          <div className="flex flex-wrap items-baseline gap-x-2 border-b border-gray-100 bg-pc-subtle px-4 py-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">
              {sec.label}
            </h2>
            {sec.nota && <span className="text-xs text-gray-500">{sec.nota}</span>}
          </div>
          <ul className="divide-y divide-gray-100">
            {sec.productos.map((p) => {
              const n = cant[p.id] ?? 0
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium leading-tight text-gray-900">
                      {nombreEnLista(p)}
                    </p>
                    {presentacionEnLista(p) && (
                      <p className="text-xs text-gray-500">
                        {presentacionEnLista(p)}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[15px] font-bold tabular-nums text-pc-teal-ink">
                    {formatMXN2(p.precio)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1 print:hidden">
                    <button
                      type="button"
                      onClick={() => poner(p.id, n - 1)}
                      disabled={n === 0}
                      aria-label={`Quitar una pieza de ${nombreEnLista(p)}`}
                      className="flex size-9 items-center justify-center rounded-lg bg-pc-app text-gray-600 disabled:opacity-30"
                    >
                      <Minus className="size-4" />
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={n || ""}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) =>
                        poner(p.id, Number(e.target.value.replace(/\D/g, "")))
                      }
                      aria-label={`Cantidad de ${nombreEnLista(p)}`}
                      className={`h-9 w-12 rounded-lg border text-center text-[15px] font-bold tabular-nums focus:border-pc-teal focus:outline-none ${
                        n > 0
                          ? "border-pc-teal bg-pc-teal-soft text-pc-teal-ink"
                          : "border-gray-200 bg-pc-card text-gray-900"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => poner(p.id, n + 1)}
                      aria-label={`Agregar una pieza de ${nombreEnLista(p)}`}
                      className="flex size-9 items-center justify-center rounded-lg bg-pc-teal text-white"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <p className="hidden text-center text-[11px] text-gray-500 print:block">
        Precios sujetos a cambio sin previo aviso.
      </p>

      {piezas > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(var(--pc-nav-h)+var(--pc-safe-bottom))] z-30 border-t border-gray-200 bg-pc-card/95 px-4 pt-3 backdrop-blur-xl md:bottom-0 md:left-[224px] print:hidden">
          <div className="mx-auto flex max-w-3xl items-center gap-3 pb-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-500">
                {elegidos.length} producto{elegidos.length === 1 ? "" : "s"} ·{" "}
                {piezas} pza{piezas === 1 ? "" : "s"}
              </p>
              <p className="text-lg font-bold tabular-nums text-gray-900">
                {formatMXN2(subtotal)}
                <span className="ml-1 text-xs font-normal text-gray-500">
                  subtotal
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCant({})}
              className="h-11 rounded-xl px-3 text-sm font-medium text-gray-500 hover:bg-gray-100"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={cotizar}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-pc-teal px-5 text-sm font-semibold text-white hover:bg-pc-teal-hover"
            >
              <FileText className="size-4" aria-hidden /> Cotizar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
