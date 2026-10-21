import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Info,
  ShieldAlert,
} from "lucide-react"
import { formatMXN, formatMXNshort } from "@/lib/utils"
import { nombreMesLargo, type Hallazgo, type Panorama, type Tono } from "@/lib/panorama"

// ─────────────── Piezas base ───────────────

export function Seccion({
  id,
  titulo,
  descripcion,
  children,
}: {
  id: string
  titulo: string
  descripcion?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-16 space-y-3">
      <header>
        <h2 id={`${id}-t`} className="text-lg font-bold tracking-tight text-gray-900">
          {titulo}
        </h2>
        {descripcion && <p className="mt-0.5 text-xs text-gray-500">{descripcion}</p>}
      </header>
      {children}
    </section>
  )
}

export function Panel({
  titulo,
  nota,
  derecha,
  children,
  className = "",
}: {
  titulo?: string
  nota?: string
  derecha?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl border border-pc-line-soft bg-pc-card p-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)] md:p-5 print:break-inside-avoid ${className}`}>
      {(titulo || derecha) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {titulo && <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>}
            {nota && <p className="mt-0.5 text-[11.5px] leading-snug text-gray-500">{nota}</p>}
          </div>
          {derecha}
        </div>
      )}
      {children}
    </div>
  )
}

const TONO: Record<Tono, { label: string; chip: string; barra: string; icono: React.ReactNode }> = {
  riesgo: { label: "Riesgo", chip: "bg-rose-50 text-rose-700 ring-rose-200", barra: "bg-rose-500", icono: <ShieldAlert className="size-4 text-rose-600" aria-hidden /> },
  atencion: { label: "Atención", chip: "bg-amber-50 text-amber-800 ring-amber-200", barra: "bg-amber-500", icono: <AlertTriangle className="size-4 text-amber-600" aria-hidden /> },
  info: { label: "Dato", chip: "bg-sky-50 text-sky-800 ring-sky-200", barra: "bg-sky-500", icono: <Info className="size-4 text-sky-600" aria-hidden /> },
  ok: { label: "Bien", chip: "bg-emerald-50 text-emerald-800 ring-emerald-200", barra: "bg-emerald-500", icono: <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> },
}

/** Barra horizontal que crece al entrar. `pct` 0-100. */
export function BarraH({ pct, color = "var(--pc-accent-ink)", alto = 8, retraso = 0, fondo = "var(--pc-hair-soft)" }: { pct: number; color?: string; alto?: number; retraso?: number; fondo?: string }) {
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ height: alto, background: fondo }} role="presentation">
      <div
        className="pc-grow h-full rounded-full"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color, ["--d" as string]: `${retraso}ms` }}
      />
    </div>
  )
}

/** Barra apilada con segmentos (suman 100). */
export function BarraApilada({
  segmentos,
  alto = 14,
}: {
  segmentos: { pct: number; color: string; titulo: string }[]
  alto?: number
}) {
  return (
    <div className="flex w-full overflow-hidden rounded-full bg-slate-100" style={{ height: alto }} role="img" aria-label={segmentos.map((s) => `${s.titulo} ${s.pct.toFixed(0)}%`).join(", ")}>
      {segmentos.map((s, i) => (
        <div
          key={s.titulo}
          title={`${s.titulo}: ${s.pct.toFixed(1)}%`}
          className="pc-grow h-full"
          style={{ width: `${s.pct}%`, background: s.color, ["--d" as string]: `${i * 90}ms` }}
        />
      ))}
    </div>
  )
}

/** Anillo de progreso (0-100). */
export function Anillo({ pct, tamano = 112, color = "var(--pc-accent-ink)", etiqueta, sub }: { pct: number; tamano?: number; color?: string; etiqueta: string; sub?: string }) {
  const r = 44
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, pct))
  return (
    <div className="relative shrink-0" style={{ width: tamano, height: tamano }}>
      <svg viewBox="0 0 112 112" className="size-full -rotate-90" role="img" aria-label={`${etiqueta}${sub ? " " + sub : ""}`}>
        <circle cx="56" cy="56" r={r} fill="none" stroke="var(--pc-hair)" strokeWidth="10" />
        <circle
          className="pc-ring-arc"
          cx="56"
          cy="56"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          style={{ ["--len" as string]: c }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-lg font-bold leading-none tabular-nums text-gray-900">{etiqueta}</span>
        {sub && <span className="mt-1 max-w-[80%] text-[10px] leading-tight text-gray-500">{sub}</span>}
      </div>
    </div>
  )
}

function Leyenda({ color, texto, valor }: { color: string; texto: string; valor?: string }) {
  return (
    <li className="flex items-start justify-between gap-3 text-xs">
      <span className="flex min-w-0 items-start gap-2 text-gray-700">
        <span className="mt-[3px] size-2.5 shrink-0 rounded-sm" style={{ background: color }} aria-hidden />
        <span className="leading-snug">{texto}</span>
      </span>
      {valor && <span className="shrink-0 font-semibold tabular-nums text-gray-900">{valor}</span>}
    </li>
  )
}

// ─────────────── Hallazgos ───────────────

export function Hallazgos({ items }: { items: Hallazgo[] }) {
  if (items.length === 0) return null
  return (
    <ul className="pc-stagger grid gap-3 md:grid-cols-2">
      {items.map((h, i) => {
        const t = TONO[h.tono]
        return (
          <li key={i} className="relative overflow-hidden rounded-2xl border border-pc-line-soft bg-pc-card p-4 pl-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] print:break-inside-avoid">
            <span className={`absolute inset-y-0 left-0 w-1.5 ${t.barra}`} aria-hidden />
            <div className="flex items-center gap-2">
              {t.icono}
              <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ${t.chip}`}>{t.label}</span>
            </div>
            <p className="mt-2 text-sm font-semibold leading-snug text-gray-900">{h.titulo}</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-600">{h.detalle}</p>
            {h.href && (
              <Link href={h.href} className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-pc-teal-ink hover:underline md:min-h-0">
                {h.accion ?? "Ver"} <ArrowRight className="size-3" aria-hidden />
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ─────────────── Ritmo del mes ───────────────

export function RitmoMes({ p }: { p: Panorama }) {
  const r = p.ritmo
  const maxRef = Math.max(r.proyeccion, r.promedio6m, r.ventasMes, 1)
  const fila = (label: string, valor: number, color: string, nota?: string, retraso = 0) => (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold tabular-nums text-gray-900">{formatMXN(valor)}</span>
      </div>
      <BarraH pct={(valor / maxRef) * 100} color={color} alto={10} retraso={retraso} />
      {nota && <p className="mt-1 text-[11px] text-gray-500">{nota}</p>}
    </div>
  )
  return (
    <Panel titulo={`Ritmo de ${r.mesLabel}`} nota={`Día ${r.diaDelMes} de ${r.diasMes}. Las ventas llegan en bloques: la proyección es solo una referencia.`}>
      <div className="space-y-3.5">
        {fila("Vendido en lo que va del mes", r.ventasMes, "var(--pc-accent)")}
        {fila("A este ritmo cerrarías en", r.proyeccion, "rgba(15,118,110,0.35)", undefined, 120)}
        {fila("Promedio mensual de los últimos 6 meses", r.promedio6m, "var(--pc-text-muted)", r.promedio6m > 0 ? `Llevas ${r.pctDelPromedio.toFixed(0)}% de un mes promedio.` : undefined, 240)}
      </div>
    </Panel>
  )
}

// ─────────────── Categorías y Pareto ───────────────

export function Categorias({ p }: { p: Panorama }) {
  const max = Math.max(...p.categorias.map((c) => c.ingresos), 1)
  return (
    <Panel titulo="Qué categorías dejan el dinero" nota={`Ingresos por partida en ${p.periodoLabel.toLowerCase()}. El margen se estima con el costo ACTUAL de cada producto (el registrado en las ventas viejas está incompleto).`}>
      <ul className="pc-row-in space-y-3">
        {p.categorias.slice(0, 8).map((c, i) => (
          <li key={c.nombre}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="min-w-0 truncate font-medium text-gray-800">{c.nombre}</span>
              <span className="shrink-0 tabular-nums text-gray-600">
                {formatMXNshort(c.ingresos)} · {c.pct.toFixed(0)}%
                {c.margen != null && <span className="ml-2 font-semibold text-emerald-700">{c.margen.toFixed(0)}% margen</span>}
              </span>
            </div>
            <BarraH pct={(c.ingresos / max) * 100} retraso={i * 60} />
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export function Pareto({ p }: { p: Panorama }) {
  const par = p.pareto
  const max = Math.max(...par.top.map((t) => t.ingresos), 1)
  const pctSkus = par.productosConVentas > 0 ? (par.productosPara80 / par.productosConVentas) * 100 : 0
  return (
    <Panel
      titulo="Pocos productos sostienen las ventas"
      nota={
        par.productosConVentas > 0
          ? `${par.productosPara80} de ${par.productosConVentas} productos con ventas (${pctSkus.toFixed(0)}%) suman el 80% de los ingresos.`
          : "Aún no hay ventas con productos en el periodo."
      }
    >
      <ol className="pc-row-in space-y-2.5">
        {par.top.slice(0, 10).map((t, i) => (
          <li key={t.nombre} className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-x-2 gap-y-1">
            <span className="text-[11px] tabular-nums text-gray-400">{i + 1}</span>
            <span className="min-w-0 truncate text-xs font-medium text-gray-800" title={t.nombre}>
              {t.nombre}
            </span>
            <span className="text-right text-xs tabular-nums text-gray-600">
              {formatMXNshort(t.ingresos)} <span className="text-gray-400">· acum. {t.acumPct.toFixed(0)}%</span>
            </span>
            <span aria-hidden />
            <div className="col-span-2">
              <BarraH pct={(t.ingresos / max) * 100} alto={6} color={t.acumPct <= 80 ? "var(--pc-accent)" : "var(--pc-text-muted)"} retraso={i * 50} />
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

// ─────────────── Capital ───────────────

export function CapitalPanel({ p }: { p: Panorama }) {
  const c = p.capital
  const escala = Math.max(c.invertido, c.recuperado + c.inventarioCosto + c.porCobrar, 1)
  const w = (n: number) => (n / escala) * 100
  return (
    <Panel
      titulo="Lo invertido vs lo que hoy tienen"
      nota="'Hoy tienen' = lo recuperado en ventas + el inventario valuado a costo + lo que falta por cobrar. No incluye gastos fuera del sistema."
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        <Anillo
          pct={c.pctRecuperado}
          etiqueta={`${c.pctRecuperado.toFixed(0)}%`}
          sub="de lo invertido ya recuperado"
          color={c.pctRecuperado >= 100 ? "var(--pc-success)" : "var(--pc-accent)"}
          tamano={132}
        />
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-medium text-gray-700">Invertido (compras y envíos)</span>
              <span className="font-semibold tabular-nums">{formatMXN(c.invertido)}</span>
            </div>
            <BarraApilada alto={16} segmentos={[{ pct: w(c.invertido), color: "var(--pc-text-secondary)", titulo: "Invertido" }]} />
          </div>
          <div>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-medium text-gray-700">Hoy tienen</span>
              <span className="font-semibold tabular-nums">{formatMXN(c.recuperado + c.inventarioCosto + c.porCobrar)}</span>
            </div>
            <BarraApilada
              alto={16}
              segmentos={[
                { pct: w(c.recuperado), color: "var(--pc-accent-ink)", titulo: "Recuperado en ventas" },
                { pct: w(c.inventarioCosto), color: "#38BDF8", titulo: "Inventario a costo" },
                { pct: w(c.porCobrar), color: "#F59E0B", titulo: "Por cobrar" },
              ]}
            />
            <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-3">
              <Leyenda color="var(--pc-accent-ink)" texto="Recuperado" valor={formatMXNshort(c.recuperado)} />
              <Leyenda color="#38BDF8" texto="Inventario a costo" valor={formatMXNshort(c.inventarioCosto)} />
              <Leyenda color="#F59E0B" texto="Por cobrar" valor={formatMXNshort(c.porCobrar)} />
            </ul>
          </div>
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900">
            Resultado acumulado estimado: <strong className="tabular-nums">{formatMXN(c.resultado)}</strong> ({c.multiplo.toFixed(1)}× lo invertido). El inventario a precio público valdría{" "}
            <strong className="tabular-nums">{formatMXN(c.inventarioPrecio)}</strong> si se vendiera completo.
          </p>
        </div>
      </div>
    </Panel>
  )
}

// ─────────────── Inventario ───────────────

const COLOR_TRAMO = { activo: "var(--pc-success)", lento: "#F59E0B", parado: "#EF4444", nuevo: "#38BDF8" } as const

export function InventarioPanel({ p }: { p: Panorama }) {
  const inv = p.inventario
  return (
    <Panel titulo="¿Dónde está el dinero del inventario?" nota={`${formatMXN(inv.total)} a costo, según qué tan rápido se mueve cada producto.`}>
      <BarraApilada alto={18} segmentos={inv.tramos.map((t) => ({ pct: t.pct, color: COLOR_TRAMO[t.clave], titulo: t.label }))} />
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {inv.tramos.map((t) => (
          <Leyenda key={t.clave} color={COLOR_TRAMO[t.clave]} texto={`${t.label} · ${t.skus} prod.`} valor={`${formatMXNshort(t.costo)} (${t.pct.toFixed(0)}%)`} />
        ))}
      </ul>
      {inv.parados.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-1.5 text-xs font-semibold text-gray-800">Productos parados con más dinero detenido</h4>
          <ul className="divide-y divide-gray-50">
            {inv.parados.map((x) => (
              <li key={x.sku} className="flex items-start justify-between gap-3 py-2 text-xs">
                <Link href={`/inventario?producto=${encodeURIComponent(x.sku)}`} className="min-w-0 font-medium leading-snug text-gray-800 hover:text-pc-teal-ink hover:underline">
                  {x.nombre}
                </Link>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums text-gray-900">{formatMXN(x.costo)}</p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-gray-500">
                    {x.stock} pzs ·{" "}
                    <span className="font-medium text-rose-700">{x.dias == null ? "nunca vendido" : "sin vender " + x.dias + " d"}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}

// ─────────────── Clientes ───────────────

const COLORES_CLIENTES = ["var(--pc-accent)", "#14B8A6", "#38BDF8", "#818CF8", "#F59E0B", "var(--pc-text-muted)"]

export function ClientesPanel({ p }: { p: Panorama }) {
  const c = p.clientes
  const resto = Math.max(0, 100 - c.top.slice(0, 5).reduce((s, x) => s + x.pct, 0))
  const segs = [
    ...c.top.slice(0, 5).map((x, i) => ({ pct: x.pct, color: COLORES_CLIENTES[i], titulo: x.nombre })),
    { pct: resto, color: "var(--pc-hair)", titulo: "Resto de clientes" },
  ]
  const alerta = c.top2Pct >= 60
  return (
    <Panel
      titulo="De quién dependen las ventas"
      nota={`Participación en lo vendido (${p.periodoLabel.toLowerCase()}).`}
      derecha={
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${alerta ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"}`}>
          {alerta ? "Dependencia alta" : "Diversificado"} · top 2 = {c.top2Pct.toFixed(0)}%
        </span>
      }
    >
      <BarraApilada alto={18} segmentos={segs} />
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {segs.map((s) => (
          <Leyenda key={s.titulo} color={s.color} texto={s.titulo} valor={`${s.pct.toFixed(0)}%`} />
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-emerald-50 p-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-emerald-800">Compraron en 90 días</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-emerald-900">
            {c.activos90} <span className="text-sm font-medium text-emerald-700">de {c.conVentas}</span>
          </p>
        </div>
        <div className="rounded-xl bg-amber-50 p-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-amber-800">Sin comprar &gt; 6 meses</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-amber-900">
            {c.inactivos180} <span className="text-sm font-medium text-amber-700">· {formatMXNshort(c.ltvInactivos)} históricos</span>
          </p>
        </div>
      </div>
    </Panel>
  )
}

export function EmbudoPanel({ p }: { p: Panorama }) {
  const e = p.embudo
  const filas = [
    { label: "Cotizaciones creadas", n: e.total, color: "var(--pc-text-muted)" },
    { label: "Vendidas (aceptadas)", n: e.aceptadas, color: "var(--pc-success-ink)" },
    { label: "Vencidas", n: e.vencidas, color: "#F59E0B" },
    { label: "Rechazadas", n: e.rechazadas, color: "#EF4444" },
    { label: "Borradores / en espera", n: e.borradores + e.enviadas, color: "#38BDF8" },
  ]
  return (
    <Panel
      titulo="De cotización a venta"
      nota={
        e.conversion != null
          ? `${e.conversion.toFixed(0)}% de las cotizaciones cerradas terminaron en venta; valor vendido por esta vía: ${formatMXN(e.valorAceptado)}.`
          : "Aún no hay cotizaciones cerradas."
      }
    >
      <ul className="pc-row-in space-y-2.5">
        {filas.map((f, i) => (
          <li key={f.label}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="text-gray-700">{f.label}</span>
              <span className="font-semibold tabular-nums">{f.n}</span>
            </div>
            <BarraH pct={e.total > 0 ? (f.n / e.total) * 100 : 0} color={f.color} alto={8} retraso={i * 70} />
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ─────────────── Compras ───────────────

export function ComprasPanel({ p }: { p: Panorama }) {
  const c = p.compras
  const max = Math.max(...c.pedidos.map((x) => x.mxn), 1)
  const envioProm = c.pedidos.length ? c.pedidos.reduce((s, x) => s + x.envioPct, 0) / c.pedidos.length : 0
  return (
    <Panel titulo="Importaciones a Brasil" nota="Cada pedido: inversión en MXN, tipo de cambio y qué parte se fue en envío.">
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { l: "Invertido en compras", v: formatMXNshort(c.totalMxn) },
          { l: "Último pedido", v: c.diasDesdeUltima == null ? "—" : `hace ${c.diasDesdeUltima} d` },
          { l: "TC promedio", v: c.tcPromedio ? `$${c.tcPromedio.toFixed(2)}` : "—" },
          { l: "Envío / pedido", v: `${envioProm.toFixed(0)}%` },
        ].map((k) => (
          <div key={k.l} className="rounded-xl bg-gray-50 p-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">{k.l}</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">{k.v}</p>
          </div>
        ))}
      </div>
      <ul className="pc-row-in space-y-3">
        {c.pedidos.map((x, i) => (
          <li key={x.numero}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
              <span className="font-medium text-gray-800">
                Pedido {x.numero} <span className="font-normal text-gray-500">· {x.fecha}</span>
              </span>
              <span className="tabular-nums text-gray-600">
                {formatMXN(x.mxn)} · TC ${x.tc.toFixed(2)} · envío {x.envioPct.toFixed(0)}%
              </span>
            </div>
            <BarraH pct={(x.mxn / max) * 100} color="var(--pc-accent-ink)" alto={8} retraso={i * 80} />
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ─────────────── Calidad de datos ───────────────

type FilaCalidad = { tono: Tono; titulo: string; detalle: string; href?: string; accion?: string }

export function CalidadDatos({ p }: { p: Panorama }) {
  const q = p.calidad
  const filas: FilaCalidad[] = []
  if (q.pctPartidasSinCosto >= 10)
    filas.push({
      tono: "atencion",
      titulo: `${q.partidasSinCosto} de ${q.partidasTotal} partidas de venta (${q.pctPartidasSinCosto.toFixed(0)}%) sin costo unitario`,
      detalle: `Suman ${formatMXN(q.ingresosSinCosto)} de ingresos. Por eso el margen por producto y categoría se estima con el costo actual de reposición.`,
    })
  if (q.ventasSinCostoProductos > 0)
    filas.push({
      tono: "atencion",
      titulo: `${q.ventasSinCostoProductos} de ${q.ventasTotal} ventas con costo de productos en $0`,
      detalle: "Su utilidad aparece como si todo el ingreso fuera ganancia. Conviene capturar el costo al editar cada venta.",
      href: "/ventas",
      accion: "Ir a ventas",
    })
  if (q.ivaCobrado > 0)
    filas.push({
      tono: "info",
      titulo: `${formatMXN(q.ivaCobrado)} de IVA cobrado forman parte de "vendido" y de "utilidad"`,
      detalle: "Si ese IVA se entrega al SAT no es ganancia: la utilidad real es menor. Confirma cómo lo manejan con su contador.",
    })
  if (q.clientesSinTelefono > 0)
    filas.push({
      tono: "info",
      titulo: `${q.clientesSinTelefono} de ${q.clientesTotal} clientes sin teléfono`,
      detalle: "Sin teléfono no se puede mandar WhatsApp (cobros, seguimiento, reactivación).",
      href: "/clientes",
      accion: "Completar clientes",
    })
  if (q.productosSinPrecio > 0)
    filas.push({
      tono: "atencion",
      titulo: `${q.productosSinPrecio} productos sin precio público`,
      detalle: "No aparecen valorados en el inventario a precio ni se pueden cotizar bien.",
      href: "/inventario",
      accion: "Revisar inventario",
    })
  if (q.productosSinCosto > 0)
    filas.push({
      tono: "atencion",
      titulo: `${q.productosSinCosto} productos sin costo`,
      detalle: "Su capital invertido y margen quedan en cero hasta cargar el costo del pedido.",
      href: "/pedidos",
      accion: "Ver pedidos",
    })
  if (q.stockNegativo > 0)
    filas.push({ tono: "riesgo", titulo: `${q.stockNegativo} productos con stock negativo`, detalle: "Se vendió más de lo que había registrado.", href: "/inventario", accion: "Corregir" })

  if (filas.length === 0)
    return (
      <Panel>
        <p className="flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="size-4" aria-hidden /> Los datos clave están completos.
        </p>
      </Panel>
    )

  return (
    <Panel
      titulo="Datos que faltan o distorsionan los números"
      derecha={<Database className="size-4 text-gray-400" aria-hidden />}
      nota="Mientras no se completen, estas cifras son estimaciones; aquí se dice cuáles y por qué."
    >
      <ul className="divide-y divide-gray-100">
        {filas.map((f, i) => (
          <li key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <span className="mt-0.5 shrink-0">{TONO[f.tono].icono}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug text-gray-900">{f.titulo}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{f.detalle}</p>
            </div>
            {f.href && (
              <Link href={f.href} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-pc-teal-ink hover:underline md:min-h-0">
                {f.accion} <ArrowRight className="size-3" aria-hidden />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ─────────────── Resumen de ventas (chips) ───────────────

export function ResumenVentas({ p }: { p: Panorama }) {
  const v = p.ventas
  const chips = [
    { l: "Vendido", v: formatMXN(v.total), s: `${v.n} ventas` },
    { l: "Ticket promedio", v: formatMXN(v.ticket), s: "por venta" },
    { l: "Mejor mes", v: v.mejorMes ? formatMXNshort(v.mejorMes.ventas) : "—", s: v.mejorMes?.label ?? "" },
    { l: "Meses sin ventas", v: String(v.mesesSinVentas.length), s: v.mesesSinVentas.length ? v.mesesSinVentas.slice(-2).join(", ") : "ninguno" },
  ]
  return (
    <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
      {chips.map((c) => (
        <div key={c.l} className="rounded-xl bg-gray-50 p-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">{c.l}</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">{c.v}</p>
          <p className="truncate text-[11px] text-gray-500">{c.s}</p>
        </div>
      ))}
    </div>
  )
}

export { nombreMesLargo }
