"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react"
import {
  submitOrder,
  buscarClientePorTelefono,
  type ClienteMatch,
} from "./actions"
import { formatMXN } from "@/lib/utils"
import { desgloseConIva, IVA_PORTAL } from "@/lib/promos-portal"
import { VipBanner } from "./vip-banner"

export interface Producto {
  id: string
  sku: string
  nombre: string
  peso: string | null
  imagen_url: string | null
  categoria: string
  /** Precio que se cobra (ya con promoción, si la hay). */
  precio: number
  /** Precio de catálogo cuando hay promoción (se muestra tachado). */
  precioLista?: number | null
  /** % de descuento de la promoción (para la etiqueta). */
  descuentoPct?: number | null
  /** Solo se sabe si está agotado: la cantidad disponible nunca llega al navegador. */
  agotado: boolean
}

interface CartItem {
  producto: Producto
  cantidad: number
}

// ─── Agrupación de cintas por tipo (1 tarjeta → varias medidas) ──────
// En la categoría CINTAS cada "tipo" (p.ej. "Amarilla clara") tiene varias
// medidas (cortada 6/9/12mm, entera). Las unimos en una sola tarjeta y al
// hacer clic el cliente elige la medida. Se agrupa por el nombre base (lo que
// va antes del paréntesis); la medida es el contenido del paréntesis.
const CINTA_CAT = "CINTAS"

function parseCintaNombre(nombre: string): {
  base: string
  medidaRaw: string | null
} {
  const m = nombre.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (m) return { base: m[1].trim(), medidaRaw: m[2].trim() }
  return { base: nombre.trim(), medidaRaw: null }
}

function medidaCorta(medidaRaw: string | null, peso: string | null): string {
  if (medidaRaw) {
    const mm = medidaRaw.match(/(\d+)\s*mm/i)
    if (mm) return `${mm[1]}mm`
    if (/enter/i.test(medidaRaw)) return "Entera"
    return medidaRaw.charAt(0).toUpperCase() + medidaRaw.slice(1)
  }
  if ((peso ?? "").toUpperCase() === "1PZA") return "Entera"
  return peso || "Pieza"
}

function medidaRank(medida: string): number {
  const mm = medida.match(/(\d+)mm/i)
  if (mm) return Number(mm[1]) // 6, 9, 12 → orden natural
  if (/enter/i.test(medida)) return 100 // entera al final
  return 50
}

export type VarianteCinta = { producto: Producto; medida: string; rank: number }
export type GrupoCinta = {
  key: string
  base: string
  imagen_url: string | null
  variantes: VarianteCinta[]
}

// ─── Categorías: orden y nombre legible ─────────────────────────────
// Las que no estén aquí se muestran al final, con su nombre en minúsculas.
const ORDEN_CATEGORIAS = [
  "ACTIVADORES",
  "POTENCIADORES",
  "EMULSIÓN REVELADORA",
  "POLVO DE BLANQUEAR",
  "EXFOLIANTS",
  "HUMECTANTES",
  "AEROGRAFÍA",
  "CINTAS",
  "OTROS",
]

// Categorías de 1-2 productos se juntan en "Otros" para que el filtro quede corto.
const CATEGORIAS_EN_OTROS = new Set(["ACEITE CORPORAL", "SOMBRILLA"])

function grupoCategoria(cat: string): string {
  return CATEGORIAS_EN_OTROS.has(cat) ? "OTROS" : cat
}

function ordenCategoria(cat: string): number {
  const i = ORDEN_CATEGORIAS.indexOf(cat)
  return i === -1 ? ORDEN_CATEGORIAS.length : i
}

function nombreCategoria(cat: string): string {
  if (cat === "TODOS") return "Todos"
  if (cat === "EXFOLIANTS") return "Exfoliantes"
  const t = cat.toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// ─── Pares polvo ⇄ emulsión (mismo aroma) ───────────────────────────
// Se compran juntos: al agregar uno ofrecemos el otro del mismo aroma. El
// aroma es el último segmento del SKU (PB-500-CAM ⇄ OX20-900-CAM).
const CAT_EMULSION = "EMULSIÓN REVELADORA"
const CAT_POLVO = "POLVO DE BLANQUEAR"

function aromaDeSku(sku: string): string {
  return (sku.split("-").pop() ?? "").toUpperCase()
}

function complementosDe(producto: Producto, todos: Producto[]): Producto[] {
  const buscada =
    producto.categoria === CAT_POLVO
      ? CAT_EMULSION
      : producto.categoria === CAT_EMULSION
        ? CAT_POLVO
        : null
  if (!buscada) return []
  const aroma = aromaDeSku(producto.sku)
  if (!aroma) return []
  return todos.filter(
    (p) =>
      p.categoria === buscada && !p.agotado && aromaDeSku(p.sku) === aroma,
  )
}

const inputCls =
  "w-full rounded-xl border border-pc-line bg-pc-card px-3.5 py-3 text-sm text-pc-ink placeholder:text-pc-ink-4 transition-colors focus:border-pc-teal focus:outline-none focus:ring-4 focus:ring-pc-teal/15"

type DisplayItem =
  | { kind: "single"; sortName: string; categoria: string; producto: Producto }
  | { kind: "group"; sortName: string; categoria: string; grupo: GrupoCinta }

export function OrderCatalog({ productos }: { productos: Producto[] }) {
  const [categoriaActiva, setCategoriaActiva] = useState("TODOS")
  const [busqueda, setBusqueda] = useState("")
  const [catSheet, setCatSheet] = useState(false)
  // Producto recién agregado + su pareja (polvo ⇄ emulsión) para ofrecer
  const [pareja, setPareja] = useState<{
    origen: Producto
    candidatos: Producto[]
  } | null>(null)
  // Lo que el cliente fue agregando; `cart` (abajo) es esa lista puesta al día
  // con el catálogo vivo (nombre/precio nuevos, y sin lo que se agotó).
  const [cartRaw, setCart] = useState<CartItem[]>([])
  const [step, setStepRaw] = useState<"catalog" | "checkout">("catalog")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Grupo de cinta abierto en el selector de medida (null = cerrado)
  const [medidaGrupo, setMedidaGrupo] = useState<GrupoCinta | null>(null)

  const [clienteData, setClienteData] = useState({
    nombre: "",
    negocio: "",
    telefono: "",
    email: "",
    ciudad: "",
    notas: "",
  })

  // Match cliente por teléfono (anti-duplicados + auto-fill)
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [clienteMatch, setClienteMatch] = useState<ClienteMatch | null>(null)

  // ─── Catálogo en vivo ───
  // Lo que cambies en Inventario (nombre, precio, surtido, agotado) llega solo:
  // se vuelve a pedir la página al servidor cada 20 s mientras la pestaña está
  // visible y al volver a ella. El carrito y los filtros se conservan.
  const router = useRouter()
  const ultimoRefresco = useRef(0)
  useEffect(() => {
    const refrescar = () => {
      if (document.visibilityState !== "visible") return
      if (Date.now() - ultimoRefresco.current < 5000) return
      ultimoRefresco.current = Date.now()
      router.refresh()
    }
    const id = setInterval(refrescar, 20000)
    document.addEventListener("visibilitychange", refrescar)
    window.addEventListener("focus", refrescar)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", refrescar)
      window.removeEventListener("focus", refrescar)
    }
  }, [router])

  const productoVivo = useMemo(
    () => new Map(productos.map((p) => [p.id, p])),
    [productos],
  )
  const { cart, agotadosEnPedido } = useMemo(() => {
    const vivos: CartItem[] = []
    const agotados: string[] = []
    for (const i of cartRaw) {
      const actual = productoVivo.get(i.producto.id)
      if (!actual || actual.agotado) agotados.push(i.producto.nombre)
      else vivos.push({ ...i, producto: actual })
    }
    return { cart: vivos, agotadosEnPedido: agotados }
  }, [cartRaw, productoVivo])

  const setStep = (s: "catalog" | "checkout") => {
    setStepRaw(s)
    window.scrollTo({ top: 0 })
  }

  // Grupos de cinta por tipo (se arman una vez sobre TODO el catálogo).
  const cintaGroups = useMemo<GrupoCinta[]>(() => {
    const map = new Map<string, GrupoCinta>()
    for (const p of productos) {
      if (p.categoria !== CINTA_CAT) continue
      const { base, medidaRaw } = parseCintaNombre(p.nombre)
      const key = base.toLowerCase()
      const medida = medidaCorta(medidaRaw, p.peso)
      const g =
        map.get(key) ??
        ({ key, base, imagen_url: null, variantes: [] } as GrupoCinta)
      g.variantes.push({ producto: p, medida, rank: medidaRank(medida) })
      if (!g.imagen_url && p.imagen_url) g.imagen_url = p.imagen_url
      map.set(key, g)
    }
    const arr = [...map.values()]
    for (const g of arr) g.variantes.sort((a, b) => a.rank - b.rank)
    return arr
  }, [productos])

  // Todo lo que se puede mostrar (sin filtros): productos sueltos + grupos de
  // cinta. Las cintas de una sola medida se muestran como tarjeta normal.
  const todosLosItems = useMemo<DisplayItem[]>(() => {
    const out: DisplayItem[] = []
    for (const p of productos) {
      if (p.categoria === CINTA_CAT) continue
      out.push({
        kind: "single",
        sortName: p.nombre.toLowerCase(),
        categoria: grupoCategoria(p.categoria),
        producto: p,
      })
    }
    for (const g of cintaGroups) {
      if (g.variantes.length === 1) {
        out.push({
          kind: "single",
          sortName: g.base.toLowerCase(),
          categoria: CINTA_CAT,
          producto: g.variantes[0].producto,
        })
      } else {
        out.push({
          kind: "group",
          sortName: g.base.toLowerCase(),
          categoria: CINTA_CAT,
          grupo: g,
        })
      }
    }
    return out
  }, [productos, cintaGroups])

  // Chips de categoría con su número de tarjetas.
  const categorias = useMemo(() => {
    const conteo = new Map<string, number>()
    for (const it of todosLosItems)
      conteo.set(it.categoria, (conteo.get(it.categoria) ?? 0) + 1)
    const cats = [...conteo.keys()].sort(
      (a, b) =>
        ordenCategoria(a) - ordenCategoria(b) || a.localeCompare(b, "es"),
    )
    return [
      { cat: "TODOS", n: todosLosItems.length },
      ...cats.map((cat) => ({ cat, n: conteo.get(cat) ?? 0 })),
    ]
  }, [todosLosItems])

  // Secciones a renderizar, ya filtradas por categoría y búsqueda.
  const secciones = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const coincide = (it: DisplayItem) => {
      if (!q) return true
      if (it.kind === "single")
        return (
          it.producto.nombre.toLowerCase().includes(q) ||
          it.producto.sku.toLowerCase().includes(q)
        )
      return (
        it.grupo.base.toLowerCase().includes(q) ||
        it.grupo.variantes.some(
          (v) =>
            v.producto.nombre.toLowerCase().includes(q) ||
            v.producto.sku.toLowerCase().includes(q) ||
            v.medida.toLowerCase().includes(q),
        )
      )
    }
    const porCat = new Map<string, DisplayItem[]>()
    for (const it of todosLosItems) {
      if (categoriaActiva !== "TODOS" && it.categoria !== categoriaActiva)
        continue
      if (!coincide(it)) continue
      const arr = porCat.get(it.categoria) ?? []
      arr.push(it)
      porCat.set(it.categoria, arr)
    }
    return [...porCat.entries()]
      .sort(
        ([a], [b]) =>
          ordenCategoria(a) - ordenCategoria(b) || a.localeCompare(b, "es"),
      )
      .map(([cat, items]) => ({
        cat,
        items: [...items].sort((a, b) =>
          a.sortName.localeCompare(b.sortName, "es"),
        ),
      }))
  }, [todosLosItems, categoriaActiva, busqueda])

  const hayResultados = secciones.length > 0

  const addToCart = (producto: Producto) => {
    if (producto.agotado) return // agotado: no se puede cotizar
    setCart((prev) => {
      const existing = prev.find((i) => i.producto.id === producto.id)
      if (existing) {
        return prev.map((i) =>
          i.producto.id === producto.id
            ? { ...i, cantidad: i.cantidad + 1 }
            : i,
        )
      }
      return [...prev, { producto, cantidad: 1 }]
    })
  }

  const updateCantidad = (id: string, cantidad: number) => {
    if (cantidad <= 0) {
      setCart((prev) => prev.filter((i) => i.producto.id !== id))
    } else {
      setCart((prev) =>
        prev.map((i) => (i.producto.id === id ? { ...i, cantidad } : i)),
      )
    }
  }

  // Agregar desde la tarjeta: si es la primera pieza de un polvo/emulsión y
  // su pareja del mismo aroma no está en el pedido, la ofrecemos.
  const agregarProducto = (producto: Producto) => {
    const yaEstaba = cart.some((i) => i.producto.id === producto.id)
    addToCart(producto)
    if (yaEstaba || producto.agotado) return
    const candidatos = complementosDe(producto, productos).filter(
      (c) => !cart.some((i) => i.producto.id === c.id),
    )
    if (candidatos.length > 0) setPareja({ origen: producto, candidatos })
  }

  const descartarAgotados = () =>
    setCart((prev) =>
      prev.filter((i) => productoVivo.get(i.producto.id)?.agotado === false),
    )

  const avisoAgotados =
    agotadosEnPedido.length > 0 ? (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-2xl border border-pc-amber-line bg-pc-amber-soft p-4 text-pc-amber-ink"
      >
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">
            {agotadosEnPedido.length === 1
              ? "Se agotó un producto de tu pedido"
              : "Se agotaron productos de tu pedido"}
          </p>
          <p className="mt-0.5">
            {agotadosEnPedido.join(", ")} ya no está
            {agotadosEnPedido.length === 1 ? "" : "n"} disponible
            {agotadosEnPedido.length === 1 ? "" : "s"}, así que no se incluye
            {agotadosEnPedido.length === 1 ? "" : "n"} en tu pedido.
          </p>
        </div>
        <button
          type="button"
          onClick={descartarAgotados}
          className="shrink-0 rounded-lg bg-pc-card px-3 py-1.5 text-xs font-semibold text-pc-ink shadow-sm hover:bg-pc-hover"
        >
          Entendido
        </button>
      </div>
    ) : null

  const totalCarrito = cart.reduce(
    (s, i) => s + i.producto.precio * i.cantidad,
    0,
  )
  const totalUnidades = cart.reduce((s, i) => s + i.cantidad, 0)
  const desglose = desgloseConIva(totalCarrito)
  // Lo que se ahorran con promociones (precio de lista − precio cobrado).
  const ahorroPromos = cart.reduce(
    (s, i) =>
      s +
      (i.producto.precioLista
        ? (i.producto.precioLista - i.producto.precio) * i.cantidad
        : 0),
    0,
  )
  const esVip = !!clienteMatch?.vip

  async function buscarPorTelefono(tel: string) {
    setClienteData((p) => ({ ...p, telefono: tel }))
    const digits = tel.replace(/\D/g, "")
    if (digits.length < 10) {
      setClienteMatch(null)
      return
    }
    setBuscandoCliente(true)
    const m = await buscarClientePorTelefono(tel)
    setBuscandoCliente(false)
    if (m) {
      setClienteMatch(m)
      // Auto-fill solo campos vacíos del form (no pisamos lo que ya escribió)
      setClienteData((p) => ({
        ...p,
        nombre: p.nombre || m.nombre || "",
        negocio: p.negocio || m.nombre_negocio || "",
        email: p.email || m.email || "",
        ciudad: p.ciudad || m.ciudad || "",
      }))
    } else {
      setClienteMatch(null)
    }
  }

  function clearMatch() {
    setClienteMatch(null)
    setClienteData((p) => ({
      ...p,
      nombre: "",
      negocio: "",
      email: "",
      ciudad: "",
    }))
  }

  async function handleSubmit() {
    setSubmitError(null)
    if (!clienteData.nombre.trim() || !clienteData.telefono.trim()) {
      setSubmitError("Nombre y teléfono son requeridos")
      return
    }
    if (cart.length === 0) return
    setSubmitting(true)
    const result = await submitOrder({
      cliente: clienteData,
      items: cart.map((i) => ({
        producto_id: i.producto.id,
        nombre: i.producto.nombre,
        cantidad: i.cantidad,
        precio: i.producto.precio,
      })),
      clienteExistenteId: clienteMatch?.id,
    })
    if (result.success) {
      window.location.href = `/order/success?numero=${encodeURIComponent(result.numero)}`
    } else {
      setSubmitError(result.error)
      setSubmitting(false)
    }
  }

  const enviar = (
    <>
      {submitError && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-pc-red-line bg-pc-red-soft p-3 text-sm text-pc-red-ink"
        >
          {submitError}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={
          submitting ||
          !clienteData.nombre.trim() ||
          !clienteData.telefono.trim()
        }
        className="mt-4 w-full rounded-xl bg-pc-teal py-3.5 text-base font-bold text-white shadow-sm transition-all hover:bg-pc-teal-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Enviando…" : "Enviar pedido"}
      </button>
      {(!clienteData.nombre.trim() ||
        !clienteData.telefono.trim()) && (
        <p className="mt-2 text-center text-xs text-pc-ink-4">
          Escribe tu teléfono y nombre para poder enviarlo.
        </p>
      )}
      <p className="mt-3 text-center text-xs text-pc-ink-4">
        Te contactaremos con la cotización formal en menos de 24 horas
      </p>
    </>
  )

  const telefonoValido = clienteData.telefono.replace(/\D/g, "").length >= 10

  return (
    <div className="mx-auto max-w-6xl pb-32">
      {step === "catalog" ? (
        <>
          {/* Barra fija: búsqueda + categorías */}
          <div className="sticky top-0 z-40 border-b border-pc-line bg-pc-app/90 px-4 pb-3 pt-3 backdrop-blur-md">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-pc-ink-4"
                aria-hidden
              />
              <input
                type="search"
                inputMode="search"
                aria-label="Buscar producto"
                placeholder="Buscar producto…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className={`${inputCls} pl-10 pr-10`}
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda("")}
                  aria-label="Borrar búsqueda"
                  className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-pc-ink-3 hover:bg-pc-hover hover:text-pc-ink"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
            {/* Móvil: un solo botón que abre la lista de categorías */}
            <button
              type="button"
              onClick={() => setCatSheet(true)}
              aria-haspopup="dialog"
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-pc-line bg-pc-card px-4 py-3 text-left md:hidden"
            >
              <span className="text-sm text-pc-ink-3">
                Categoría:{" "}
                <span className="font-semibold text-pc-ink">
                  {nombreCategoria(categoriaActiva)}
                </span>
              </span>
              <span className="flex items-center gap-2 text-sm font-medium text-pc-teal-ink">
                Cambiar
                <ChevronDown className="size-4" aria-hidden />
              </span>
            </button>

            {/* Escritorio / tablet: botones de categoría en renglones */}
            <div
              role="tablist"
              aria-label="Categorías"
              className="mt-3 hidden flex-wrap gap-2 md:flex"
            >
              {categorias.map(({ cat, n }) => {
                const activa = categoriaActiva === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    role="tab"
                    aria-selected={activa}
                    onClick={() => setCategoriaActiva(cat)}
                    className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                      activa
                        ? "border-pc-teal bg-pc-teal text-white shadow-sm"
                        : "border-pc-line bg-pc-card text-pc-ink-2 hover:border-pc-line-strong hover:bg-pc-hover"
                    }`}
                  >
                    {nombreCategoria(cat)}
                    <span
                      className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                        activa
                          ? "bg-white/20 text-white"
                          : "bg-pc-tint text-pc-ink-3"
                      }`}
                    >
                      {n}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Catálogo por secciones */}
          <div className="space-y-8 px-4 pt-5">
            {avisoAgotados}
            {secciones.map(({ cat, items }) => (
              <section key={cat} aria-labelledby={`cat-${cat}`}>
                <div className="mb-3 flex items-baseline gap-2">
                  <h2
                    id={`cat-${cat}`}
                    className="text-lg font-semibold tracking-tight text-pc-ink"
                  >
                    {nombreCategoria(cat)}
                  </h2>
                  <span className="text-sm text-pc-ink-4">
                    {items.length}{" "}
                    {items.length === 1 ? "producto" : "productos"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
                  {items.map((item) => {
                    if (item.kind === "group") {
                      const unidades = item.grupo.variantes.reduce(
                        (s, v) =>
                          s +
                          (cart.find((i) => i.producto.id === v.producto.id)
                            ?.cantidad ?? 0),
                        0,
                      )
                      return (
                        <CintaGroupCard
                          key={item.grupo.key}
                          grupo={item.grupo}
                          unidadesEnCarrito={unidades}
                          onElegir={() => setMedidaGrupo(item.grupo)}
                        />
                      )
                    }
                    const producto = item.producto
                    return (
                      <ProductCard
                        key={producto.id}
                        producto={producto}
                        cantidad={
                          cart.find((i) => i.producto.id === producto.id)
                            ?.cantidad ?? 0
                        }
                        onAdd={() => agregarProducto(producto)}
                        onChange={(n) => updateCantidad(producto.id, n)}
                      />
                    )
                  })}
                </div>
              </section>
            ))}

            {!hayResultados && (
              <div className="rounded-2xl border border-dashed border-pc-line-strong bg-pc-card px-6 py-14 text-center">
                <Search
                  className="mx-auto mb-3 size-8 text-pc-ink-4"
                  aria-hidden
                />
                <p className="font-medium text-pc-ink">
                  No encontramos productos
                </p>
                <p className="mt-1 text-sm text-pc-ink-3">
                  Prueba con otra palabra o quita los filtros.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setBusqueda("")
                    setCategoriaActiva("TODOS")
                  }}
                  className="mt-4 rounded-xl bg-pc-teal px-4 py-2 text-sm font-semibold text-white hover:bg-pc-teal-hover"
                >
                  Ver todo el catálogo
                </button>
              </div>
            )}
          </div>

          {/* Barra flotante del pedido */}
          {cart.length > 0 && (
            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setStep("checkout")}
                className="pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-2xl bg-pc-teal py-3 pl-4 pr-5 text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] transition-all hover:-translate-y-0.5 hover:bg-pc-teal-hover active:translate-y-0"
              >
                <span className="relative flex size-10 items-center justify-center rounded-xl bg-white/20">
                  <ShoppingBag className="size-5" aria-hidden />
                  <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold tabular-nums text-pc-teal-hover">
                    {totalUnidades}
                  </span>
                </span>
                <span className="flex-1 text-left">
                  <span className="block text-sm font-semibold leading-tight">
                    Ver mi pedido
                  </span>
                  <span className="block text-xs text-white/75">
                    {totalUnidades}{" "}
                    {totalUnidades === 1 ? "pieza" : "piezas"} · subtotal sin IVA
                  </span>
                </span>
                <span className="text-lg font-bold tabular-nums">
                  {formatMXN(totalCarrito)}
                </span>
              </button>
            </div>
          )}

          {/* Lista de categorías (móvil) */}
          {catSheet && (
            <div
              className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm md:hidden"
              onClick={() => setCatSheet(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Elegir categoría"
            >
              <div
                className="max-h-[85vh] w-full overflow-hidden rounded-t-3xl border border-pc-line bg-pc-card shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="flex items-center justify-between border-b border-pc-line px-5 py-4">
                  <h3 className="text-base font-semibold text-pc-ink">
                    Elige una categoría
                  </h3>
                  <button
                    type="button"
                    onClick={() => setCatSheet(false)}
                    className="flex size-9 items-center justify-center rounded-full text-pc-ink-3 hover:bg-pc-hover hover:text-pc-ink"
                    aria-label="Cerrar"
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                </header>
                <ul className="max-h-[70vh] divide-y divide-pc-line-soft overflow-y-auto pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                  {categorias.map(({ cat, n }) => {
                    const activa = categoriaActiva === cat
                    return (
                      <li key={cat}>
                        <button
                          type="button"
                          onClick={() => {
                            setCategoriaActiva(cat)
                            setCatSheet(false)
                            window.scrollTo({ top: 0 })
                          }}
                          className={`flex w-full items-center justify-between px-5 py-4 text-left text-base transition-colors ${
                            activa
                              ? "bg-pc-teal-soft font-semibold text-pc-teal-ink"
                              : "text-pc-ink hover:bg-pc-hover"
                          }`}
                        >
                          <span>{nombreCategoria(cat)}</span>
                          <span className="flex items-center gap-2 text-sm text-pc-ink-3">
                            {n}
                            {activa && (
                              <Check
                                className="size-4 text-pc-teal-ink"
                                aria-hidden
                              />
                            )}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          )}

          {/* Sugerencia: la pareja del mismo aroma (polvo ⇄ emulsión) */}
          {pareja && (
            <ParejaSheet
              origen={pareja.origen}
              candidatos={pareja.candidatos}
              cart={cart}
              addToCart={addToCart}
              updateCantidad={updateCantidad}
              onClose={() => setPareja(null)}
            />
          )}

          {/* Selector de medida para un tipo de cinta */}
          {medidaGrupo && (
            <MedidaPicker
              grupo={medidaGrupo}
              cart={cart}
              addToCart={addToCart}
              updateCantidad={updateCantidad}
              onClose={() => setMedidaGrupo(null)}
            />
          )}
        </>
      ) : (
        /* ═══ CHECKOUT ═══ */
        <div className="px-4 pt-5">
          <button
            type="button"
            onClick={() => setStep("catalog")}
            className="mb-4 inline-flex items-center gap-2 rounded-lg py-1 pr-2 text-sm font-medium text-pc-ink-3 transition-colors hover:text-pc-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Seguir agregando productos
          </button>

          <h2 className="mb-5 text-2xl font-semibold tracking-tight text-pc-ink">
            Revisa tu pedido
          </h2>
          {avisoAgotados && <div className="mb-5">{avisoAgotados}</div>}

          {cart.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-pc-line-strong bg-pc-card px-6 py-14 text-center">
              <ShoppingBag
                className="mx-auto mb-3 size-8 text-pc-ink-4"
                aria-hidden
              />
              <p className="font-medium text-pc-ink">Tu pedido está vacío</p>
              <button
                type="button"
                onClick={() => setStep("catalog")}
                className="mt-4 rounded-xl bg-pc-teal px-4 py-2 text-sm font-semibold text-white hover:bg-pc-teal-hover"
              >
                Ver productos
              </button>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[1fr_380px] lg:items-start">
              {/* Datos del cliente */}
              <div className="order-2 rounded-2xl border border-pc-line bg-pc-card p-5 lg:order-1">
                <h3 className="mb-4 text-base font-semibold text-pc-ink">
                  Tus datos
                </h3>
                <div className="space-y-3">
                  {/* Teléfono — primer campo, busca cliente existente al teclear */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="order-tel"
                      className="text-sm font-medium text-pc-ink-2"
                    >
                      Teléfono / WhatsApp{" "}
                      <span className="text-pc-red-ink">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="order-tel"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="10 dígitos"
                        value={clienteData.telefono}
                        onChange={(e) => buscarPorTelefono(e.target.value)}
                        className={`${inputCls} ${
                          clienteMatch ? "border-pc-green-line" : ""
                        }`}
                      />
                      <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">
                        {buscandoCliente ? (
                          <div className="size-4 animate-spin rounded-full border-2 border-pc-teal border-t-transparent" />
                        ) : clienteMatch ? (
                          <Check
                            className="size-4 text-pc-green-ink"
                            aria-hidden
                          />
                        ) : null}
                      </div>
                    </div>

                    {clienteMatch?.vip && (
                      <div className="space-y-2">
                        <VipBanner
                          nombre={
                            clienteMatch.nombre?.split(" ")[0] || "bienvenida"
                          }
                        />
                        <button
                          type="button"
                          onClick={clearMatch}
                          className="text-xs text-pc-ink-4 underline-offset-2 hover:text-pc-ink hover:underline"
                        >
                          No soy yo
                        </button>
                      </div>
                    )}

                    {clienteMatch && !clienteMatch.vip && (
                      <div className="flex items-center gap-2.5 rounded-xl border border-pc-green-line bg-pc-green-soft px-3 py-2.5">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pc-teal text-xs font-semibold text-white">
                          {clienteMatch.nombre?.[0] ?? "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-pc-green-ink">
                            ¡Te reconocemos!
                          </p>
                          <p className="truncate text-xs text-pc-green-ink">
                            {clienteMatch.nombre}
                            {clienteMatch.nombre_negocio
                              ? ` · ${clienteMatch.nombre_negocio}`
                              : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={clearMatch}
                          className="flex size-8 items-center justify-center rounded-full text-pc-green-ink transition-colors hover:bg-pc-tint"
                          aria-label="No soy yo"
                          title="No soy yo"
                        >
                          <X className="size-4" aria-hidden />
                        </button>
                      </div>
                    )}

                    {!buscandoCliente && !clienteMatch && telefonoValido && (
                      <div className="rounded-xl border border-pc-blue-line bg-pc-blue-soft px-3 py-2.5">
                        <p className="text-sm text-pc-blue-ink">
                          Eres cliente nuevo — completa tus datos para
                          continuar.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Resto del formulario solo si ya hay teléfono válido */}
                  {telefonoValido && (
                    <div className="space-y-3">
                      <input
                        aria-label="Nombre completo"
                        autoComplete="name"
                        placeholder="Nombre completo *"
                        required
                        value={clienteData.nombre}
                        onChange={(e) =>
                          setClienteData((p) => ({
                            ...p,
                            nombre: e.target.value,
                          }))
                        }
                        className={inputCls}
                      />
                      <input
                        aria-label="Nombre de tu spa o negocio"
                        autoComplete="organization"
                        placeholder="Nombre de tu spa o negocio"
                        value={clienteData.negocio}
                        onChange={(e) =>
                          setClienteData((p) => ({
                            ...p,
                            negocio: e.target.value,
                          }))
                        }
                        className={inputCls}
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          type="email"
                          aria-label="Email"
                          autoComplete="email"
                          placeholder="Email (opcional)"
                          value={clienteData.email}
                          onChange={(e) =>
                            setClienteData((p) => ({
                              ...p,
                              email: e.target.value,
                            }))
                          }
                          className={inputCls}
                        />
                        <input
                          aria-label="Ciudad"
                          autoComplete="address-level2"
                          placeholder="Ciudad"
                          value={clienteData.ciudad}
                          onChange={(e) =>
                            setClienteData((p) => ({
                              ...p,
                              ciudad: e.target.value,
                            }))
                          }
                          className={inputCls}
                        />
                      </div>
                      <textarea
                        aria-label="Notas del pedido"
                        placeholder="Notas o comentarios del pedido…"
                        value={clienteData.notas}
                        onChange={(e) =>
                          setClienteData((p) => ({
                            ...p,
                            notas: e.target.value,
                          }))
                        }
                        rows={3}
                        className={`${inputCls} resize-none`}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="order-3 lg:hidden">{enviar}</div>

              {/* Resumen del pedido */}
              <div className="order-1 rounded-2xl border border-pc-line bg-pc-card p-5 lg:order-2 lg:sticky lg:top-4">
                <h3 className="mb-1 text-base font-semibold text-pc-ink">
                  Tu pedido{" "}
                  <span className="font-normal text-pc-ink-4">
                    ({totalUnidades}{" "}
                    {totalUnidades === 1 ? "pieza" : "piezas"})
                  </span>
                </h3>
                <ul className="divide-y divide-pc-line-soft">
                  {cart.map((item) => (
                    <li
                      key={item.producto.id}
                      className="flex items-center gap-3 py-3"
                    >
                      <Miniatura producto={item.producto} />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium leading-snug text-pc-ink">
                          {item.producto.nombre}
                        </p>
                        <p className="mt-0.5 text-xs text-pc-ink-4">
                          {item.producto.precioLista ? (
                            <span className="mr-1 line-through">
                              {formatMXN(item.producto.precioLista)}
                            </span>
                          ) : null}
                          {formatMXN(item.producto.precio)} c/u
                          {item.producto.descuentoPct ? (
                            <span className="ml-1.5 rounded bg-pc-green-soft px-1 py-0.5 text-[10px] font-bold text-pc-green-ink">
                              −{Math.round(item.producto.descuentoPct)}%
                            </span>
                          ) : null}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Stepper
                            cantidad={item.cantidad}
                            onChange={(n) =>
                              updateCantidad(item.producto.id, n)
                            }
                            compact
                          />
                          <button
                            type="button"
                            onClick={() => updateCantidad(item.producto.id, 0)}
                            className="flex size-8 items-center justify-center rounded-lg text-pc-ink-4 transition-colors hover:bg-pc-red-soft hover:text-pc-red-ink"
                            aria-label={`Quitar ${item.producto.nombre}`}
                            title="Quitar"
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm font-semibold tabular-nums text-pc-ink">
                        {formatMXN(item.producto.precio * item.cantidad)}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 border-t border-pc-line pt-4">
                  <p className="mb-2 text-sm font-semibold text-pc-ink">
                    Total estimado
                  </p>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <dt className="text-pc-ink-3">Subtotal</dt>
                      <dd className="tabular-nums text-pc-ink">
                        {formatMXN(desglose.subtotal)}
                      </dd>
                    </div>
                    {ahorroPromos > 0 && (
                      <div className="flex items-center justify-between text-pc-green-ink">
                        <dt>Ya incluye tu ahorro en promociones</dt>
                        <dd className="tabular-nums">
                          −{formatMXN(ahorroPromos)}
                        </dd>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <dt className="text-pc-ink-3">
                        IVA ({Math.round(IVA_PORTAL * 100)}%)
                      </dt>
                      <dd className="tabular-nums text-pc-ink">
                        {formatMXN(desglose.iva)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-pc-ink-3">Envío</dt>
                      <dd
                        className={
                          esVip
                            ? "font-semibold text-pc-green-ink"
                            : "text-pc-ink-3"
                        }
                      >
                        {esVip ? "Gratis · VIP" : "Se cotiza aparte"}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex items-center justify-between border-t border-pc-line pt-3">
                    <p className="font-semibold text-pc-ink">Total</p>
                    <p className="text-2xl font-bold tabular-nums text-pc-teal-ink">
                      {formatMXN(desglose.total)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-pc-ink-4">
                  Te enviaremos una cotización formal para confirmar.
                </p>

                <div className="hidden lg:block">{enviar}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Piezas reutilizables ───────────────────────────────────────────

/** Contador − N + (botones grandes para el dedo). */
function Stepper({
  cantidad,
  onChange,
  compact = false,
}: {
  cantidad: number
  onChange: (n: number) => void
  compact?: boolean
}) {
  const btn = compact ? "size-8" : "size-10"
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(cantidad - 1)}
        className={`${btn} flex items-center justify-center rounded-lg bg-pc-hover text-pc-ink transition-colors hover:bg-pc-line-soft active:scale-95`}
        aria-label="Quitar uno"
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <span
        className={`${compact ? "w-7" : "w-10"} text-center text-sm font-bold tabular-nums text-pc-ink`}
        aria-live="polite"
      >
        {cantidad}
      </span>
      <button
        type="button"
        onClick={() => onChange(cantidad + 1)}
        className={`${btn} flex items-center justify-center rounded-lg bg-pc-teal text-white transition-colors hover:bg-pc-teal-hover active:scale-95`}
        aria-label="Agregar uno"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  )
}

function Miniatura({ producto }: { producto: Producto }) {
  return (
    <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-pc-line bg-white">
      {producto.imagen_url ? (
        <Image
          src={producto.imagen_url}
          alt=""
          fill
          sizes="56px"
          className="object-contain p-1"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm font-bold text-pc-ink-4">
          {producto.sku.slice(0, 2)}
        </div>
      )}
    </div>
  )
}

// ─── Sello de oferta sobre la foto (siempre rojo: se lee en claro y oscuro) ───
function PromoSello({ pct }: { pct: number }) {
  return (
    <div
      className="absolute right-0 top-0 z-10 flex flex-col items-center rounded-bl-2xl bg-[#DC2626] px-3 py-1.5 text-white shadow-md"
      aria-label={`Oferta, ${Math.round(pct)} por ciento de descuento`}
    >
      <span className="text-[10px] font-bold uppercase leading-none tracking-widest">
        Oferta
      </span>
      <span className="text-xl font-extrabold leading-tight tabular-nums">
        −{Math.round(pct)}%
      </span>
    </div>
  )
}

// ─── Tarjeta de producto ────────────────────────────────────────────
function ProductCard({
  producto,
  cantidad,
  onAdd,
  onChange,
}: {
  producto: Producto
  cantidad: number
  onAdd: () => void
  onChange: (n: number) => void
}) {
  const agotado = producto.agotado
  const enCarrito = cantidad > 0
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border bg-pc-card transition-all ${
        enCarrito
          ? "border-pc-teal shadow-[0_0_0_1px_var(--pc-accent)]"
          : "border-pc-line hover:border-pc-line-strong"
      } ${agotado ? "opacity-70" : ""}`}
    >
      <div className="relative aspect-[4/3] bg-white">
        {agotado && (
          <span className="absolute left-2 top-2 z-10 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
            Agotado
          </span>
        )}
        {!agotado && producto.descuentoPct ? (
          <PromoSello pct={producto.descuentoPct} />
        ) : null}
        {producto.imagen_url ? (
          <Image
            src={producto.imagen_url}
            alt={producto.nombre}
            fill
            sizes="(min-width:1024px) 22vw, (min-width:768px) 30vw, 46vw"
            className={`object-contain p-3 ${agotado ? "grayscale" : ""}`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl font-bold text-pc-ink-4/50">
            {producto.sku.slice(0, 2)}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="text-xs text-pc-ink-4">{producto.peso ?? " "}</p>
        <p className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-pc-ink">
          {producto.nombre}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-lg font-bold tabular-nums text-pc-teal-ink">
            {formatMXN(producto.precio)}
          </p>
          {producto.precioLista ? (
            <p className="text-sm tabular-nums text-pc-ink-4 line-through">
              {formatMXN(producto.precioLista)}
            </p>
          ) : null}
        </div>

        <div className="mt-3 flex-1" />
        {agotado ? (
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-xl bg-pc-hover py-2.5 text-sm font-medium text-pc-ink-4"
          >
            Agotado
          </button>
        ) : enCarrito ? (
          <div className="flex justify-center">
            <Stepper cantidad={cantidad} onChange={onChange} />
          </div>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-pc-teal py-2.5 text-sm font-semibold text-white transition-colors hover:bg-pc-teal-hover active:scale-[0.98]"
          >
            <Plus className="size-4" aria-hidden />
            Agregar
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Tarjeta de un TIPO de cinta (varias medidas) ───────────────────
function CintaGroupCard({
  grupo,
  unidadesEnCarrito,
  onElegir,
}: {
  grupo: GrupoCinta
  unidadesEnCarrito: number
  onElegir: () => void
}) {
  const agotado = grupo.variantes.every((v) => v.producto.agotado)
  const precios = grupo.variantes.map((v) => v.producto.precio)
  const precioMin = Math.min(...precios)
  const variosPrecios = new Set(precios).size > 1
  const enCarrito = unidadesEnCarrito > 0
  return (
    <button
      type="button"
      onClick={agotado ? undefined : onElegir}
      disabled={agotado}
      className={`flex flex-col overflow-hidden rounded-2xl border bg-pc-card text-left transition-all ${
        enCarrito
          ? "border-pc-teal shadow-[0_0_0_1px_var(--pc-accent)]"
          : "border-pc-line"
      } ${
        agotado
          ? "cursor-not-allowed opacity-70"
          : "hover:border-pc-line-strong active:scale-[0.99]"
      }`}
    >
      <div className="relative aspect-[4/3] w-full bg-white">
        {agotado && (
          <span className="absolute left-2 top-2 z-10 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
            Agotado
          </span>
        )}
        {enCarrito && (
          <span className="absolute right-2 top-2 z-10 rounded-full bg-pc-teal px-2.5 py-0.5 text-[11px] font-bold text-white">
            {unidadesEnCarrito} en tu pedido
          </span>
        )}
        {grupo.imagen_url ? (
          <Image
            src={grupo.imagen_url}
            alt={grupo.base}
            fill
            sizes="(min-width:1024px) 22vw, (min-width:768px) 30vw, 46vw"
            className={`object-contain p-3 ${agotado ? "grayscale" : ""}`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl font-bold text-pc-ink-4/50">
            CN
          </div>
        )}
      </div>
      <div className="flex w-full flex-1 flex-col p-3">
        <p className="text-xs text-pc-ink-4">
          {grupo.variantes.length} medidas
        </p>
        <p className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-pc-ink">
          {grupo.base}
        </p>
        <p className="mt-1 text-lg font-bold tabular-nums text-pc-teal-ink">
          {variosPrecios ? (
            <span className="mr-1 text-xs font-medium text-pc-ink-4">
              desde
            </span>
          ) : null}
          {formatMXN(precioMin)}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {grupo.variantes.map((v) => (
            <span
              key={v.producto.id}
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                !v.producto.agotado
                  ? "bg-pc-teal-soft text-pc-teal-ink"
                  : "bg-pc-hover text-pc-ink-4 line-through"
              }`}
            >
              {v.medida}
            </span>
          ))}
        </div>
        <div className="mt-3 flex-1" />
        <span
          className={`block w-full rounded-xl py-2.5 text-center text-sm font-semibold ${
            agotado
              ? "bg-pc-hover text-pc-ink-4"
              : enCarrito
                ? "bg-pc-teal-soft text-pc-teal-ink"
                : "bg-pc-teal text-white"
          }`}
        >
          {agotado
            ? "Agotado"
            : enCarrito
              ? "Editar medidas"
              : "Elegir medida"}
        </span>
      </div>
    </button>
  )
}

// ─── Sugerencia de pareja (polvo ⇄ emulsión del mismo aroma) ────────
function ParejaSheet({
  origen,
  candidatos,
  cart,
  addToCart,
  updateCantidad,
  onClose,
}: {
  origen: Producto
  candidatos: Producto[]
  cart: CartItem[]
  addToCart: (p: Producto) => void
  updateCantidad: (id: string, cantidad: number) => void
  onClose: () => void
}) {
  const buscaEmulsion = origen.categoria === CAT_POLVO
  const agregados = candidatos.filter((c) =>
    cart.some((i) => i.producto.id === c.id),
  ).length
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Agregar el producto que va con este"
    >
      <div
        className="w-full overflow-hidden rounded-t-3xl border border-pc-line bg-pc-card shadow-2xl sm:max-w-md sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-pc-line px-5 py-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-pc-green-ink">
            <Check className="size-4" aria-hidden />
            {origen.nombre} agregado
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-pc-ink">
            {buscaEmulsion
              ? "¿Agregas también la emulsión reveladora?"
              : "¿Agregas también el polvo para blanquear?"}
          </h3>
          <p className="mt-0.5 text-sm text-pc-ink-3">
            Es del mismo aroma y normalmente se lleva en pareja.
          </p>
        </header>

        <ul className="max-h-[45vh] divide-y divide-pc-line-soft overflow-y-auto">
          {candidatos.map((c) => {
            const enCarrito = cart.find((i) => i.producto.id === c.id)
            return (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                <Miniatura producto={c} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-pc-ink">
                    {c.nombre}
                  </p>
                  <p className="mt-0.5 text-sm text-pc-ink-3">
                    {c.peso ? `${c.peso} · ` : ""}
                    <span className="font-semibold text-pc-teal-ink">
                      {formatMXN(c.precio)}
                    </span>
                  </p>
                </div>
                {enCarrito ? (
                  <Stepper
                    cantidad={enCarrito.cantidad}
                    onChange={(n) => updateCantidad(c.id, n)}
                    compact
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => addToCart(c)}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl bg-pc-teal px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-pc-teal-hover active:scale-95"
                  >
                    <Plus className="size-4" aria-hidden />
                    Agregar
                  </button>
                )}
              </li>
            )
          })}
        </ul>

        <footer className="border-t border-pc-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className={`w-full rounded-xl py-3 text-sm font-bold transition-colors ${
              agregados > 0
                ? "bg-pc-teal text-white hover:bg-pc-teal-hover"
                : "bg-pc-hover text-pc-ink hover:bg-pc-line-soft"
            }`}
          >
            {agregados > 0 ? "Listo, seguir comprando" : "No, gracias"}
          </button>
        </footer>
      </div>
    </div>
  )
}

// ─── Modal selector de medida ───────────────────────────────────────
function MedidaPicker({
  grupo,
  cart,
  addToCart,
  updateCantidad,
  onClose,
}: {
  grupo: GrupoCinta
  cart: CartItem[]
  addToCart: (p: Producto) => void
  updateCantidad: (id: string, cantidad: number) => void
  onClose: () => void
}) {
  const totalGrupo = grupo.variantes.reduce(
    (s, v) =>
      s + (cart.find((i) => i.producto.id === v.producto.id)?.cantidad ?? 0),
    0,
  )
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Elegir medida de ${grupo.base}`}
    >
      <div
        className="max-h-[88vh] w-full overflow-hidden rounded-t-3xl border border-pc-line bg-pc-card shadow-2xl sm:max-w-md sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-pc-line px-5 py-4">
          <div className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-pc-line bg-white">
            {grupo.imagen_url && (
              <Image
                src={grupo.imagen_url}
                alt=""
                fill
                sizes="56px"
                className="object-contain p-1"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-pc-ink-4">Elige la medida</p>
            <h3 className="truncate text-base font-semibold text-pc-ink">
              {grupo.base}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-pc-ink-3 transition-colors hover:bg-pc-hover hover:text-pc-ink"
            aria-label="Cerrar"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <ul className="max-h-[50vh] divide-y divide-pc-line-soft overflow-y-auto">
          {grupo.variantes.map((v) => {
            const p = v.producto
            const enCarrito = cart.find((i) => i.producto.id === p.id)
            const agotado = p.agotado
            return (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-base font-semibold text-pc-ink">
                    {v.medida}
                  </p>
                  <p className="text-sm text-pc-ink-3">
                    {formatMXN(p.precio)}
                    {agotado ? " · Agotado" : ""}
                  </p>
                </div>
                {agotado ? (
                  <span className="rounded-lg bg-pc-hover px-3 py-2 text-xs font-medium text-pc-ink-4">
                    Agotado
                  </span>
                ) : enCarrito ? (
                  <Stepper
                    cantidad={enCarrito.cantidad}
                    onChange={(n) => updateCantidad(p.id, n)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => addToCart(p)}
                    className="flex items-center gap-1.5 rounded-xl bg-pc-teal px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-pc-teal-hover active:scale-95"
                  >
                    <Plus className="size-4" aria-hidden />
                    Agregar
                  </button>
                )}
              </li>
            )
          })}
        </ul>

        <footer className="border-t border-pc-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-pc-teal py-3 text-sm font-bold text-white transition-colors hover:bg-pc-teal-hover"
          >
            {totalGrupo > 0
              ? `Listo · ${totalGrupo} agregada${totalGrupo === 1 ? "" : "s"}`
              : "Cerrar"}
          </button>
        </footer>
      </div>
    </div>
  )
}
