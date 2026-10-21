import Link from "next/link"
import { FileBarChart, Gauge } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { KpisPanorama, type KpiPlano } from "./kpis-panorama"
import { formatMXN, formatMXNshort } from "@/lib/utils"
import {
  calcularPanorama,
  type ClienteIn,
  type CompraIn,
  type CotizacionIn,
  type ItemIn,
  type Periodo,
  type StockIn,
  type VentaIn,
} from "@/lib/panorama"
import { NuevosRecurrentesLazy, VentasUtilidadLazy } from "./charts-lazy"
import {
  CalidadDatos,
  CapitalPanel,
  Categorias,
  ClientesPanel,
  ComprasPanel,
  EmbudoPanel,
  Hallazgos,
  InventarioPanel,
  Panel,
  Pareto,
  ResumenVentas,
  RitmoMes,
  Seccion,
} from "./secciones"

export const metadata = { title: "Panorama del negocio · Piel Canela ERP" }

const PERIODOS: { clave: Periodo; label: string }[] = [
  { clave: "6m", label: "6 meses" },
  { clave: "12m", label: "12 meses" },
  { clave: "todo", label: "Todo" },
]

const SECCIONES = [
  { id: "resumen", label: "Resumen" },
  { id: "ventas", label: "Ventas" },
  { id: "productos", label: "Productos" },
  { id: "capital", label: "Capital" },
  { id: "inventario", label: "Inventario" },
  { id: "clientes", label: "Clientes" },
  { id: "compras", label: "Compras" },
  { id: "datos", label: "Datos" },
]

/** Trae TODAS las filas (PostgREST corta en 1,000 por consulta). */
async function traerTodo<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let desde = 0; desde < 20000; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

export default async function PanoramaPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p: pParam } = await searchParams
  const periodo: Periodo = pParam === "6m" || pParam === "todo" ? pParam : "12m"
  const admin = createAdminClient()
  const hoy = new Date()

  const [ventas, itemsRaw, stock, compraItems, compras, clientes, cotizaciones, inversiones, reparto] = await Promise.all([
    traerTodo<VentaIn>((a, b) =>
      admin
        .from("ventas")
        .select("id, fecha, cliente_id, total, iva, costo_productos, costo_envio, utilidad_neta, estatus, saldo_pendiente")
        .range(a, b),
    ),
    traerTodo<{
      venta_id: string
      cantidad: number
      subtotal: number | null
      costo_unitario: number | null
      productos: { sku: string | null; nombre: string; categorias: { nombre: string } | null } | null
      ventas: { fecha: string; cliente_id: string | null; estatus: string } | null
    }>((a, b) =>
      admin
        .from("venta_items")
        .select("venta_id, cantidad, subtotal, costo_unitario, productos(sku, nombre, categorias(nombre)), ventas(fecha, cliente_id, estatus)")
        .range(a, b),
    ),
    traerTodo<StockIn>((a, b) => admin.from("vista_inventario").select("sku, nombre, stock_actual, costo_total_mxn, precio_publico").range(a, b)),
    traerTodo<{ productos: { sku: string | null } | null; pedidos_compra: { fecha: string } | null }>((a, b) =>
      admin.from("pedido_compra_items").select("productos(sku), pedidos_compra(fecha)").range(a, b),
    ),
    traerTodo<CompraIn>((a, b) =>
      admin.from("pedidos_compra").select("numero, fecha, tipo_cambio, total_mxn, total_usd, costo_envio_usd, subtotal_usd").range(a, b),
    ),
    traerTodo<ClienteIn>((a, b) => admin.from("clientes").select("id, nombre, nombre_negocio, telefono, is_internal").range(a, b)),
    traerTodo<CotizacionIn>((a, b) => admin.from("cotizaciones").select("estatus, total, cliente_id").range(a, b)),
    traerTodo<{ monto_mxn: number | null }>((a, b) => admin.from("inversiones").select("monto_mxn").range(a, b)),
    traerTodo<{ venta_id: string; monto: number | null }>((a, b) => admin.from("venta_socios").select("venta_id, monto").range(a, b)),
  ])

  const items: ItemIn[] = itemsRaw.map((i) => ({
    venta_id: i.venta_id,
    cantidad: i.cantidad,
    subtotal: i.subtotal,
    costo_unitario: i.costo_unitario,
    producto: i.productos ? { sku: i.productos.sku, nombre: i.productos.nombre, categoria: i.productos.categorias?.nombre ?? null } : null,
    venta: i.ventas,
  }))

  const ultimaCompraPorSku = new Map<string, string>()
  for (const ci of compraItems) {
    const sku = ci.productos?.sku
    const f = ci.pedidos_compra?.fecha
    if (sku && f && f > (ultimaCompraPorSku.get(sku) ?? "")) ultimaCompraPorSku.set(sku, f)
  }
  const repartoPorVenta = new Map<string, number>()
  for (const r of reparto) repartoPorVenta.set(r.venta_id, (repartoPorVenta.get(r.venta_id) ?? 0) + Number(r.monto ?? 0))

  const p = calcularPanorama({
    ventas,
    items,
    stock,
    ultimaCompraPorSku,
    compras,
    clientes,
    cotizaciones,
    inversionesMxn: inversiones.reduce((s, i) => s + Number(i.monto_mxn ?? 0), 0),
    repartoPorVenta,
    hoy,
    periodo,
  })

  const anio = hoy.getFullYear()
  const parado = p.inventario.tramos.find((t) => t.clave === "parado")
  const cambio = p.ventas.ytdCambio

  const cards: KpiPlano[] = [
    {
      id: "ytd",
      label: `Vendido en ${anio}`,
      value: formatMXN(p.ventas.ytd),
      sub: cambio != null ? `${cambio >= 0 ? "+" : ""}${cambio.toFixed(1)}% vs ${anio - 1}` : "sin año anterior",
      tone: cambio == null ? "neutral" : cambio >= 0 ? "emerald" : "rose",
      valorNeutro: true,
      ayuda: {
        que: "Lo vendido del 1 de enero a hoy, comparado con el mismo corte del año anterior.",
        filas: [
          { texto: `${anio} (al ${hoy.getDate()}/${hoy.getMonth() + 1})`, valor: formatMXN(p.ventas.ytd) },
          { texto: `${anio - 1} (mismo corte)`, valor: formatMXN(p.ventas.ytdPrevio) },
          { texto: "Cambio", valor: cambio == null ? "—" : `${cambio.toFixed(1)}%` },
        ],
        fuente: "Suma de ventas.total (sin canceladas ni clientes internos).",
      },
    },
    {
      id: "utilidad",
      label: "Utilidad registrada",
      value: formatMXN(p.ventas.utilidad),
      sub: `${p.margen.registrado.toFixed(0)}% de lo vendido · ${p.periodoLabel.toLowerCase()}`,
      tone: "teal",
      valorNeutro: true,
      ayuda: {
        que: "Ganancia que dicen las ventas: total − costo de productos − envío.",
        filas: [
          { texto: "Vendido en el periodo", valor: formatMXN(p.ventas.total) },
          { texto: "Utilidad registrada", valor: formatMXN(p.ventas.utilidad) },
          { texto: "IVA cobrado (histórico) incluido en el total", valor: formatMXN(p.calidad.ivaCobrado), alerta: p.calidad.ivaCobrado > 0 },
          { texto: "Ventas con costo de productos en $0", valor: `${p.calidad.ventasSinCostoProductos} de ${p.calidad.ventasTotal}`, alerta: p.calidad.ventasSinCostoProductos > 0 },
        ],
        fuente: "ventas.utilidad_neta. Ver 'Datos' al final de esta página.",
      },
    },
    {
      id: "margen",
      label: "Margen a costo actual",
      value: p.margen.reposicion != null ? `${p.margen.reposicion.toFixed(0)}%` : "—",
      sub: `registrado: ${p.margen.registrado.toFixed(0)}%`,
      tone: "blue",
      valorNeutro: true,
      ayuda: {
        que: "Margen estimado valuando lo vendido al costo ACTUAL de cada producto (landed: precio + envío × tipo de cambio).",
        filas: [
          { texto: "Margen a costo actual", valor: p.margen.reposicion != null ? `${p.margen.reposicion.toFixed(1)}%` : "—" },
          { texto: "Margen registrado en ventas", valor: `${p.margen.registrado.toFixed(1)}%` },
          { texto: "Ingresos cubiertos por la estimación", valor: `${p.margen.cobertura.toFixed(0)}%` },
        ],
        fuente: "venta_items.subtotal vs vista_inventario.costo_total_mxn. Es estimación: no usa el costo histórico, que está incompleto.",
      },
    },
    {
      id: "resultado",
      label: "Resultado acumulado",
      value: formatMXNshort(p.capital.resultado),
      sub: `${p.capital.multiplo.toFixed(1)}× lo invertido`,
      tone: p.capital.resultado >= 0 ? "emerald" : "rose",
      valorNeutro: true,
      ayuda: {
        que: "Lo que hoy tienen (recuperado + inventario a costo + por cobrar) menos lo invertido.",
        filas: [
          { texto: "Recuperado en ventas", valor: formatMXN(p.capital.recuperado) },
          { texto: "+ Inventario a costo", valor: formatMXN(p.capital.inventarioCosto) },
          { texto: "+ Por cobrar", valor: formatMXN(p.capital.porCobrar) },
          { texto: "− Invertido", valor: formatMXN(p.capital.invertido) },
          { texto: "= Resultado", valor: formatMXN(p.capital.resultado) },
        ],
        fuente: "venta_socios.monto, vista_inventario, ventas.saldo_pendiente e inversiones. No incluye gastos fuera del sistema.",
      },
    },
    {
      id: "inventario",
      label: "Inventario a costo",
      value: formatMXNshort(p.inventario.total),
      sub: parado ? `${parado.pct.toFixed(0)}% parado (> 90 d)` : "",
      tone: parado && parado.pct >= 50 ? "rose" : parado && parado.pct >= 30 ? "amber" : "neutral",
      valorNeutro: true,
      ayuda: {
        que: "Dinero que está en producto. 'Parado' = con stock y sin una venta en más de 90 días (o nunca vendido).",
        filas: p.inventario.tramos.map((t) => ({ texto: `${t.label} · ${t.skus} prod.`, valor: formatMXNshort(t.costo) })),
        fuente: "vista_inventario.stock_actual × costo_total_mxn; última venta de venta_items; los comprados hace ≤ 60 días no se consideran parados.",
      },
    },
    {
      id: "cobertura",
      label: "Cobertura de inventario",
      value: p.capital.coberturaMeses != null ? `~${Math.round(p.capital.coberturaMeses)} meses` : "—",
      sub: `${p.capital.unidadesStock.toLocaleString("es-MX")} piezas en stock`,
      tone: "neutral",
      valorNeutro: true,
      ayuda: {
        que: "Cuántos meses alcanza todo el stock al ritmo de venta de los últimos 6 meses (promedio de piezas por mes).",
        filas: [
          { texto: "Piezas en stock", valor: p.capital.unidadesStock.toLocaleString("es-MX") },
          { texto: "Meses de cobertura", valor: p.capital.coberturaMeses != null ? p.capital.coberturaMeses.toFixed(1) : "—" },
        ],
        fuente: "Promedio general: algunos productos se agotan antes. Mira la 'sugerencia de pedido' en Inventario para el detalle.",
      },
    },
    {
      id: "clientes",
      label: "Dependencia de 2 clientes",
      value: `${p.clientes.top2Pct.toFixed(0)}%`,
      sub: `${p.clientes.activos90} de ${p.clientes.conVentas} compraron en 90 d`,
      tone: p.clientes.top2Pct >= 60 ? "rose" : p.clientes.top2Pct >= 40 ? "amber" : "emerald",
      valorNeutro: true,
      ayuda: {
        que: "Qué parte de lo vendido viene de tus 2 mayores clientes. Más de 60% es riesgo: si uno baja, las ventas caen de golpe.",
        filas: p.clientes.top.slice(0, 5).map((c) => ({ texto: c.nombre, valor: `${c.pct.toFixed(0)}%` })),
        fuente: `Ventas de ${p.periodoLabel.toLowerCase()}, sin canceladas ni internos.`,
      },
    },
    {
      id: "cobrar",
      label: "Por cobrar",
      value: formatMXN(p.capital.porCobrar),
      sub: p.embudo.conversion != null ? `cotiz. → venta: ${p.embudo.conversion.toFixed(0)}%` : "",
      tone: p.capital.porCobrar > 0 ? "amber" : "emerald",
      valorNeutro: true,
      ayuda: {
        que: "Saldo de ventas abiertas (pendientes o con pago parcial). Las marcadas como Pagada se dan por saldadas.",
        filas: [
          { texto: "Saldo por cobrar", valor: formatMXN(p.capital.porCobrar) },
          { texto: "Conversión de cotizaciones cerradas", valor: p.embudo.conversion != null ? `${p.embudo.conversion.toFixed(0)}%` : "—" },
        ],
        fuente: "ventas.saldo_pendiente (estatus pendiente / pagada_parcial).",
      },
    },
  ]

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 p-4 pb-24 md:p-8 md:pb-10 print:space-y-5 print:p-0">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#0F766E]">
            <Gauge className="size-3.5" aria-hidden /> Panorama del negocio
          </p>
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em] text-gray-900">Cómo vamos, qué preocupa y qué hacer</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Todo el negocio en una pantalla, con cada número explicado. Periodo de las gráficas: <strong className="font-semibold text-gray-700">{p.periodoLabel}</strong>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-0.5" role="group" aria-label="Periodo">
            {PERIODOS.map((x) => (
              <Link
                key={x.clave}
                href={`/panorama?p=${x.clave}`}
                aria-current={periodo === x.clave ? "true" : undefined}
                className={`inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-semibold transition-colors md:min-h-0 md:py-1.5 ${
                  periodo === x.clave ? "bg-[#0F766E] text-white" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {x.label}
              </Link>
            ))}
          </div>
          <Link href="/finanzas/reporte" className="pc-btn-secondary">
            <FileBarChart className="size-4" aria-hidden /> Reporte mensual
          </Link>
        </div>
      </header>

      {/* Navegación por secciones (se desliza en móvil) */}
      <nav aria-label="Secciones del panorama" className="sticky top-0 z-20 -mx-4 overflow-x-auto border-b border-black/5 bg-[#F5F7F6]/95 px-4 py-2 backdrop-blur md:-mx-8 md:px-8 print:hidden">
        <ul className="flex w-max gap-1.5">
          {SECCIONES.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-flex min-h-9 items-center rounded-full border border-gray-200 bg-white px-3.5 text-xs font-semibold text-gray-700 hover:border-[#0F766E]/40 hover:text-[#0F766E]">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Seccion id="resumen" titulo="Lo que más importa" descripcion="Lo que el sistema detecta, de lo más urgente a lo más tranquilo.">
        <Hallazgos items={p.hallazgos} />
        <div className="pt-2">
          <KpisPanorama cards={cards} />
        </div>
      </Seccion>

      <Seccion id="ventas" titulo="Ventas y utilidad" descripcion="Barras: lo vendido cada mes. Líneas: utilidad registrada y promedio móvil de 3 meses. El mes en curso va más claro.">
        <ResumenVentas p={p} />
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel className="lg:col-span-2" titulo="Evolución mensual">
            <VentasUtilidadLazy data={p.meses} />
          </Panel>
          <RitmoMes p={p} />
        </div>
      </Seccion>

      <Seccion id="productos" titulo="Qué vendemos" descripcion="Dónde está el dinero por categoría y qué productos sostienen las ventas.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Categorias p={p} />
          <Pareto p={p} />
        </div>
      </Seccion>

      <Seccion id="capital" titulo="Capital: lo invertido y lo recuperado" descripcion="El panorama completo del dinero de los socios.">
        <CapitalPanel p={p} />
      </Seccion>

      <Seccion id="inventario" titulo="Inventario" descripcion="Cuánto dinero hay en producto y qué parte no se está moviendo.">
        <InventarioPanel p={p} />
      </Seccion>

      <Seccion id="clientes" titulo="Clientes y cotizaciones" descripcion="Dependencia, actividad y cómo se convierten las cotizaciones.">
        <div className="grid gap-4 lg:grid-cols-2">
          <ClientesPanel p={p} />
          <EmbudoPanel p={p} />
        </div>
        <Panel titulo="Clientes nuevos vs. clientes que ya compraban" nota="Cuánto del ingreso de cada mes viene de clientes que compran por primera vez.">
          <NuevosRecurrentesLazy data={p.clientes.nuevosVsRecurrentes} />
        </Panel>
      </Seccion>

      <Seccion id="compras" titulo="Compras e importaciones" descripcion="Cuánto se ha invertido en pedidos, a qué tipo de cambio y cuánto se fue en envío.">
        <ComprasPanel p={p} />
      </Seccion>

      <Seccion id="datos" titulo="Calidad de los datos" descripcion="Para confiar en las cifras hay que saber cuáles son estimadas.">
        <CalidadDatos p={p} />
      </Seccion>
    </div>
  )
}
