/**
 * Panorama del negocio: toda la matemática en funciones puras (sin BD) para
 * poder razonarla. La página `/panorama` solo trae los datos y pinta.
 *
 * Criterios (los mismos que el resto del ERP):
 * - Se excluyen ventas CANCELADAS y de clientes INTERNOS (Piel Canela).
 * - "Recuperado" = suma de `venta_socios.monto` (igual que Finanzas/Dashboard).
 * - La utilidad registrada es `ventas.utilidad_neta` (= total − costo − envío;
 *   el total incluye el IVA cobrado, ver `calidad.ivaCobrado`).
 * - Los márgenes por producto/categoría NO usan `venta_items.costo_unitario`
 *   (la mayoría de las partidas históricas están en 0): se estiman con el costo
 *   de reposición actual (`vista_inventario.costo_total_mxn`, costo landed).
 */
import { parseFecha } from "@/lib/fecha"

// ───────────────────────── Entradas ─────────────────────────

export type VentaIn = {
  id: string
  fecha: string
  cliente_id: string | null
  total: number | null
  iva: number | null
  costo_productos: number | null
  costo_envio: number | null
  utilidad_neta: number | null
  estatus: string
  saldo_pendiente: number | null
}

export type ItemIn = {
  venta_id: string
  cantidad: number
  subtotal: number | null
  costo_unitario: number | null
  producto: { sku: string | null; nombre: string; categoria: string | null } | null
  venta: { fecha: string; cliente_id: string | null; estatus: string } | null
}

export type StockIn = {
  sku: string
  nombre: string
  stock_actual: number | null
  costo_total_mxn: number | null
  precio_publico: number | null
}

export type CompraIn = {
  numero: number | string
  fecha: string
  tipo_cambio: number | null
  total_mxn: number | null
  total_usd: number | null
  costo_envio_usd: number | null
  subtotal_usd: number | null
}

export type ClienteIn = {
  id: string
  nombre: string
  nombre_negocio: string | null
  telefono: string | null
  is_internal: boolean | null
}

export type CotizacionIn = {
  estatus: string
  total: number | null
  cliente_id: string | null
}

export type PanoramaInput = {
  ventas: VentaIn[]
  items: ItemIn[]
  stock: StockIn[]
  /** sku → fecha (yyyy-mm-dd) de la última compra a proveedor */
  ultimaCompraPorSku: Map<string, string>
  compras: CompraIn[]
  clientes: ClienteIn[]
  cotizaciones: CotizacionIn[]
  inversionesMxn: number
  /** montos de venta_socios por venta_id (ya sumados por venta) */
  repartoPorVenta: Map<string, number>
  hoy: Date
  periodo: Periodo
}

export type Periodo = "6m" | "12m" | "todo"

// ───────────────────────── Salidas ─────────────────────────

export type MesPunto = {
  mes: string // yyyy-mm
  label: string // "Oct 26"
  ventas: number
  utilidad: number
  n: number
  /** promedio móvil de 3 meses de las ventas */
  promedio3m: number
  /** el mes en curso aún no termina */
  parcial: boolean
}

export type Tono = "ok" | "atencion" | "riesgo" | "info"

export type Hallazgo = {
  tono: Tono
  titulo: string
  detalle: string
  /** a dónde ir para actuar */
  href?: string
  accion?: string
}

export type Panorama = {
  periodoLabel: string
  meses: MesPunto[]
  ventas: {
    total: number
    n: number
    utilidad: number
    margenRegistrado: number // 0-100
    ticket: number
    ytd: number
    ytdPrevio: number
    ytdCambio: number | null // %
    /** Mejor mes del periodo */
    mejorMes: { label: string; ventas: number } | null
    /** meses del periodo sin una sola venta */
    mesesSinVentas: string[]
  }
  ritmo: {
    mesLabel: string
    ventasMes: number
    diaDelMes: number
    diasMes: number
    proyeccion: number
    promedio6m: number
    pctDelPromedio: number
  }
  capital: {
    invertido: number
    recuperado: number
    inventarioCosto: number
    inventarioPrecio: number
    porCobrar: number
    /** recuperado + inventario a costo + por cobrar − invertido */
    resultado: number
    /** (recuperado + inventario a costo + por cobrar) / invertido */
    multiplo: number
    pctRecuperado: number // recuperado / invertido * 100
    unidadesStock: number
    coberturaMeses: number | null
  }
  margen: {
    registrado: number
    /** estimado con costo de reposición, sobre las partidas con costo actual conocido */
    reposicion: number | null
    cobertura: number // % de ingresos de partidas cubierto por el estimado
  }
  categorias: {
    nombre: string
    ingresos: number
    unidades: number
    pct: number
    margen: number | null
  }[]
  pareto: {
    top: { nombre: string; ingresos: number; unidades: number; acumPct: number }[]
    productosConVentas: number
    productosPara80: number
  }
  inventario: {
    total: number
    tramos: { clave: "activo" | "lento" | "parado" | "nuevo"; label: string; costo: number; skus: number; pct: number }[]
    parados: { nombre: string; sku: string; stock: number; costo: number; dias: number | null }[]
  }
  clientes: {
    conVentas: number
    activos90: number
    inactivos180: number
    /** ingresos históricos de los inactivos >180 días */
    ltvInactivos: number
    top: { id: string; nombre: string; total: number; pct: number }[]
    top1Pct: number
    top2Pct: number
    top5Pct: number
    nuevosVsRecurrentes: { label: string; mes: string; nuevos: number; recurrentes: number }[]
  }
  embudo: {
    total: number
    aceptadas: number
    vencidas: number
    rechazadas: number
    borradores: number
    enviadas: number
    conversion: number | null // % sobre cerradas
    valorAceptado: number
  }
  compras: {
    pedidos: { numero: string; fecha: string; mxn: number; usd: number; tc: number; envioPct: number }[]
    totalMxn: number
    diasDesdeUltima: number | null
    tcPromedio: number | null
  }
  calidad: {
    partidasSinCosto: number
    partidasTotal: number
    pctPartidasSinCosto: number
    ingresosSinCosto: number
    ventasSinCostoProductos: number
    ventasTotal: number
    ivaCobrado: number
    clientesSinTelefono: number
    clientesTotal: number
    productosSinPrecio: number
    productosSinCosto: number
    stockNegativo: number
  }
  hallazgos: Hallazgo[]
}

// ───────────────────────── Utilidades ─────────────────────────

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
const DIA = 86_400_000

const num = (n: number | null | undefined) => Number(n ?? 0) || 0
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
const labelMes = (clave: string) => {
  const [y, m] = clave.split("-").map(Number)
  return `${MESES_CORTOS[m - 1]} ${String(y).slice(2)}`
}
export const nombreMesLargo = (clave: string) => {
  const [y, m] = clave.split("-").map(Number)
  return `${MESES[m - 1]} ${y}`
}
const diasEntre = (desde: string, hasta: Date) =>
  Math.floor((hasta.getTime() - parseFecha(desde).getTime()) / DIA)

function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = []
  const [y0, m0] = desde.split("-").map(Number)
  const [y1, m1] = hasta.split("-").map(Number)
  let y = y0
  let m = m0
  while (y < y1 || (y === y1 && m <= m1)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

// ───────────────────────── Cálculo ─────────────────────────

export function calcularPanorama(input: PanoramaInput): Panorama {
  const { hoy, periodo } = input
  const internos = new Set(input.clientes.filter((c) => c.is_internal).map((c) => c.id))
  const esInterno = (id: string | null) => !!id && internos.has(id)

  const ventasTodas = input.ventas.filter((v) => v.estatus !== "cancelada" && !esInterno(v.cliente_id))
  const mesActual = ym(hoy)

  // ── Rango del periodo ──
  const primerMes = ventasTodas.length ? ventasTodas.reduce((m, v) => (v.fecha < m ? v.fecha : m), ventasTodas[0].fecha).slice(0, 7) : mesActual
  const nMeses = periodo === "6m" ? 6 : periodo === "12m" ? 12 : 0
  const desdeMes =
    nMeses > 0 ? ym(new Date(hoy.getFullYear(), hoy.getMonth() - (nMeses - 1), 1)) : primerMes
  const inicioPeriodo = `${desdeMes}-01`
  const periodoLabel = periodo === "6m" ? "Últimos 6 meses" : periodo === "12m" ? "Últimos 12 meses" : "Todo el historial"

  const ventas = ventasTodas.filter((v) => v.fecha >= inicioPeriodo)

  // ── Serie mensual (continua, con ceros) ──
  const claves = mesesEntre(desdeMes < primerMes && periodo === "todo" ? primerMes : desdeMes, mesActual)
  const porMes = new Map(claves.map((k) => [k, { ventas: 0, utilidad: 0, n: 0 }]))
  for (const v of ventas) {
    const b = porMes.get(v.fecha.slice(0, 7))
    if (!b) continue
    b.ventas += num(v.total)
    b.utilidad += num(v.utilidad_neta)
    b.n += 1
  }
  // el promedio móvil necesita meses previos al rango: calcúlalo sobre toda la serie
  const serieCompleta = mesesEntre(primerMes, mesActual)
  const completoPorMes = new Map(serieCompleta.map((k) => [k, 0]))
  for (const v of ventasTodas) completoPorMes.set(v.fecha.slice(0, 7), (completoPorMes.get(v.fecha.slice(0, 7)) ?? 0) + num(v.total))
  const prom3 = (clave: string) => {
    const i = serieCompleta.indexOf(clave)
    const ventana = serieCompleta.slice(Math.max(0, i - 2), i + 1)
    return ventana.reduce((s, k) => s + (completoPorMes.get(k) ?? 0), 0) / Math.max(1, ventana.length)
  }
  const meses: MesPunto[] = claves.map((k) => {
    const b = porMes.get(k)!
    return { mes: k, label: labelMes(k), ventas: b.ventas, utilidad: b.utilidad, n: b.n, promedio3m: prom3(k), parcial: k === mesActual }
  })

  // ── Ventas del periodo ──
  const totalVentas = ventas.reduce((s, v) => s + num(v.total), 0)
  const totalUtilidad = ventas.reduce((s, v) => s + num(v.utilidad_neta), 0)
  const mejor = meses.reduce<MesPunto | null>((m, p) => (!m || p.ventas > m.ventas ? p : m), null)
  const mesesSinVentas = meses.filter((m) => !m.parcial && m.n === 0).map((m) => m.label)

  // YTD vs año anterior (mismo corte de fecha)
  const corte = (y: number) => `${y}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`
  const ytd = ventasTodas.filter((v) => v.fecha >= `${hoy.getFullYear()}-01-01` && v.fecha <= corte(hoy.getFullYear())).reduce((s, v) => s + num(v.total), 0)
  const ytdPrevio = ventasTodas.filter((v) => v.fecha >= `${hoy.getFullYear() - 1}-01-01` && v.fecha <= corte(hoy.getFullYear() - 1)).reduce((s, v) => s + num(v.total), 0)

  // ── Ritmo del mes ──
  const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  const diaDelMes = hoy.getDate()
  const ventasMes = completoPorMes.get(mesActual) ?? 0
  const previos6 = serieCompleta.filter((k) => k < mesActual).slice(-6)
  const promedio6m = previos6.length ? previos6.reduce((s, k) => s + (completoPorMes.get(k) ?? 0), 0) / previos6.length : 0

  // ── Capital ──
  const idsValidos = new Set(ventasTodas.map((v) => v.id))
  let recuperado = 0
  for (const [vid, monto] of input.repartoPorVenta) if (idsValidos.has(vid)) recuperado += monto
  const inventarioCosto = input.stock.reduce((s, p) => s + num(p.stock_actual) * num(p.costo_total_mxn), 0)
  const inventarioPrecio = input.stock.reduce((s, p) => s + num(p.stock_actual) * num(p.precio_publico), 0)
  const unidadesStock = input.stock.reduce((s, p) => s + Math.max(0, num(p.stock_actual)), 0)
  const porCobrar = ventasTodas
    .filter((v) => v.estatus === "pendiente" || v.estatus === "pagada_parcial")
    .reduce((s, v) => s + num(v.saldo_pendiente), 0)
  const invertido = input.inversionesMxn
  const valorHoy = recuperado + inventarioCosto + porCobrar

  // unidades vendidas últimos 6 meses → cobertura
  const hace6m = ym(new Date(hoy.getFullYear(), hoy.getMonth() - 6, 1)) + "-01"
  const itemsValidos = input.items.filter(
    (it) => it.producto && it.venta && it.venta.estatus !== "cancelada" && !esInterno(it.venta.cliente_id),
  )
  const unidades6m = itemsValidos.filter((it) => it.venta!.fecha >= hace6m).reduce((s, it) => s + num(it.cantidad), 0)
  const ritmoUnidadesMes = unidades6m / 6
  const coberturaMeses = ritmoUnidadesMes > 0 ? unidadesStock / ritmoUnidadesMes : null

  // ── Márgenes por categoría / producto (costo de reposición) ──
  const costoActual = new Map(input.stock.map((p) => [p.sku, num(p.costo_total_mxn)]))
  const itemsPeriodo = itemsValidos.filter((it) => it.venta!.fecha >= inicioPeriodo)

  const cat = new Map<string, { ingresos: number; unidades: number; costo: number; ingresosConCosto: number }>()
  const prod = new Map<string, { nombre: string; ingresos: number; unidades: number }>()
  let ingresosItems = 0
  let ingresosConCostoTotal = 0
  let costoRepTotal = 0
  for (const it of itemsPeriodo) {
    const ingreso = num(it.subtotal)
    const sku = it.producto!.sku ?? ""
    const c = costoActual.get(sku) ?? 0
    const nombreCat = (it.producto!.categoria ?? "Sin categoría").toUpperCase()
    const b = cat.get(nombreCat) ?? { ingresos: 0, unidades: 0, costo: 0, ingresosConCosto: 0 }
    b.ingresos += ingreso
    b.unidades += num(it.cantidad)
    if (c > 0) {
      b.costo += c * num(it.cantidad)
      b.ingresosConCosto += ingreso
      costoRepTotal += c * num(it.cantidad)
      ingresosConCostoTotal += ingreso
    }
    cat.set(nombreCat, b)
    ingresosItems += ingreso
    const pk = it.producto!.nombre
    const p = prod.get(pk) ?? { nombre: pk, ingresos: 0, unidades: 0 }
    p.ingresos += ingreso
    p.unidades += num(it.cantidad)
    prod.set(pk, p)
  }
  const categorias = [...cat.entries()]
    .map(([nombre, b]) => ({
      nombre,
      ingresos: b.ingresos,
      unidades: b.unidades,
      pct: ingresosItems > 0 ? (b.ingresos / ingresosItems) * 100 : 0,
      margen: b.ingresosConCosto > 0 ? ((b.ingresosConCosto - b.costo) / b.ingresosConCosto) * 100 : null,
    }))
    .sort((a, b) => b.ingresos - a.ingresos)

  const productosOrdenados = [...prod.values()].sort((a, b) => b.ingresos - a.ingresos)
  let acum = 0
  let para80 = 0
  const topPareto = productosOrdenados.slice(0, 12).map((p) => {
    acum += p.ingresos
    return { ...p, acumPct: ingresosItems > 0 ? (acum / ingresosItems) * 100 : 0 }
  })
  {
    let a = 0
    for (const p of productosOrdenados) {
      a += p.ingresos
      para80++
      if (ingresosItems > 0 && a / ingresosItems >= 0.8) break
    }
  }

  // ── Inventario por rotación ──
  const ultimaVenta = new Map<string, string>()
  for (const it of itemsValidos) {
    const sku = it.producto!.sku
    if (!sku) continue
    const f = it.venta!.fecha
    if (f > (ultimaVenta.get(sku) ?? "")) ultimaVenta.set(sku, f)
  }
  const tramos = {
    activo: { costo: 0, skus: 0 },
    lento: { costo: 0, skus: 0 },
    parado: { costo: 0, skus: 0 },
    nuevo: { costo: 0, skus: 0 },
  }
  const paradosLista: Panorama["inventario"]["parados"] = []
  for (const p of input.stock) {
    const stock = num(p.stock_actual)
    const costo = stock * num(p.costo_total_mxn)
    if (stock <= 0) continue
    const compra = input.ultimaCompraPorSku.get(p.sku)
    const diasCompra = compra ? diasEntre(compra, hoy) : null
    const venta = ultimaVenta.get(p.sku)
    const diasVenta = venta ? diasEntre(venta, hoy) : null
    let clave: keyof typeof tramos
    if (diasCompra != null && diasCompra <= 60 && (diasVenta == null || diasVenta > 30)) clave = "nuevo"
    else if (diasVenta != null && diasVenta <= 30) clave = "activo"
    else if (diasVenta != null && diasVenta <= 90) clave = "lento"
    else clave = "parado"
    tramos[clave].costo += costo
    tramos[clave].skus += 1
    if (clave === "parado") paradosLista.push({ nombre: p.nombre, sku: p.sku, stock, costo, dias: diasVenta })
  }
  const costoTotalInv = Object.values(tramos).reduce((s, t) => s + t.costo, 0)
  const etiquetas = {
    activo: "Se mueve (vendió ≤ 30 d)",
    lento: "Lento (31–90 d)",
    parado: "Parado (> 90 d o nunca vendió)",
    nuevo: "Recién comprado (≤ 60 d)",
  } as const
  const orden = ["activo", "lento", "parado", "nuevo"] as const

  // ── Clientes ──
  const nombrePorId = new Map(input.clientes.map((c) => [c.id, c.nombre_negocio ?? c.nombre]))
  const totalPorCliente = new Map<string, number>()
  for (const v of ventas) if (v.cliente_id) totalPorCliente.set(v.cliente_id, (totalPorCliente.get(v.cliente_id) ?? 0) + num(v.total))
  const rankClientes = [...totalPorCliente.entries()].sort((a, b) => b[1] - a[1])
  const sumaClientes = rankClientes.reduce((s, [, t]) => s + t, 0)
  const pctDe = (n: number) => (sumaClientes > 0 ? (n / sumaClientes) * 100 : 0)
  const topClientes = rankClientes.slice(0, 6).map(([id, total]) => ({ id, nombre: nombrePorId.get(id) ?? "Cliente", total, pct: pctDe(total) }))

  // actividad (sobre TODO el historial, no solo el periodo)
  const ultimaCompraCliente = new Map<string, string>()
  const ltvCliente = new Map<string, number>()
  for (const v of ventasTodas) {
    if (!v.cliente_id) continue
    if (v.fecha > (ultimaCompraCliente.get(v.cliente_id) ?? "")) ultimaCompraCliente.set(v.cliente_id, v.fecha)
    ltvCliente.set(v.cliente_id, (ltvCliente.get(v.cliente_id) ?? 0) + num(v.total))
  }
  let activos90 = 0
  let inactivos180 = 0
  let ltvInactivos = 0
  for (const [id, f] of ultimaCompraCliente) {
    const d = diasEntre(f, hoy)
    if (d <= 90) activos90++
    if (d > 180) {
      inactivos180++
      ltvInactivos += ltvCliente.get(id) ?? 0
    }
  }

  // nuevos vs recurrentes por mes (cliente "nuevo" = su primera compra de la historia cae en ese mes)
  const primeraCompra = new Map<string, string>()
  for (const v of [...ventasTodas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (v.cliente_id && !primeraCompra.has(v.cliente_id)) primeraCompra.set(v.cliente_id, v.fecha.slice(0, 7))
  }
  const nvr = new Map(claves.map((k) => [k, { nuevos: 0, recurrentes: 0 }]))
  for (const v of ventas) {
    const b = nvr.get(v.fecha.slice(0, 7))
    if (!b || !v.cliente_id) continue
    if (primeraCompra.get(v.cliente_id) === v.fecha.slice(0, 7)) b.nuevos += num(v.total)
    else b.recurrentes += num(v.total)
  }

  // ── Embudo de cotizaciones ──
  const cots = input.cotizaciones.filter((c) => !esInterno(c.cliente_id))
  const cuenta = (e: string) => cots.filter((c) => c.estatus === e).length
  const aceptadas = cuenta("aceptada")
  const vencidas = cuenta("vencida")
  const rechazadas = cuenta("rechazada")
  const cerradas = aceptadas + vencidas + rechazadas

  // ── Compras ──
  const pedidos = [...input.compras]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((p) => ({
      numero: String(p.numero),
      fecha: p.fecha,
      mxn: num(p.total_mxn),
      usd: num(p.total_usd),
      tc: num(p.tipo_cambio),
      envioPct: num(p.subtotal_usd) + num(p.costo_envio_usd) > 0 ? (num(p.costo_envio_usd) / (num(p.subtotal_usd) + num(p.costo_envio_usd))) * 100 : 0,
    }))
  const usdTotal = pedidos.reduce((s, p) => s + p.usd, 0)
  const tcPromedio = usdTotal > 0 ? pedidos.reduce((s, p) => s + p.tc * p.usd, 0) / usdTotal : null

  // ── Calidad de datos ──
  const partidas = itemsValidos
  const sinCosto = partidas.filter((it) => num(it.costo_unitario) === 0)
  const clientesReales = input.clientes.filter((c) => !c.is_internal)

  const p: Panorama = {
    periodoLabel,
    meses,
    ventas: {
      total: totalVentas,
      n: ventas.length,
      utilidad: totalUtilidad,
      margenRegistrado: totalVentas > 0 ? (totalUtilidad / totalVentas) * 100 : 0,
      ticket: ventas.length ? totalVentas / ventas.length : 0,
      ytd,
      ytdPrevio,
      ytdCambio: ytdPrevio > 0 ? ((ytd - ytdPrevio) / ytdPrevio) * 100 : null,
      mejorMes: mejor && mejor.ventas > 0 ? { label: mejor.label, ventas: mejor.ventas } : null,
      mesesSinVentas,
    },
    ritmo: {
      mesLabel: nombreMesLargo(mesActual),
      ventasMes,
      diaDelMes,
      diasMes,
      proyeccion: diaDelMes > 0 ? (ventasMes / diaDelMes) * diasMes : 0,
      promedio6m,
      pctDelPromedio: promedio6m > 0 ? (ventasMes / promedio6m) * 100 : 0,
    },
    capital: {
      invertido,
      recuperado,
      inventarioCosto,
      inventarioPrecio,
      porCobrar,
      resultado: valorHoy - invertido,
      multiplo: invertido > 0 ? valorHoy / invertido : 0,
      pctRecuperado: invertido > 0 ? (recuperado / invertido) * 100 : 0,
      unidadesStock,
      coberturaMeses,
    },
    margen: {
      registrado: totalVentas > 0 ? (totalUtilidad / totalVentas) * 100 : 0,
      reposicion: ingresosConCostoTotal > 0 ? ((ingresosConCostoTotal - costoRepTotal) / ingresosConCostoTotal) * 100 : null,
      cobertura: ingresosItems > 0 ? (ingresosConCostoTotal / ingresosItems) * 100 : 0,
    },
    categorias,
    pareto: { top: topPareto, productosConVentas: productosOrdenados.length, productosPara80: para80 },
    inventario: {
      total: costoTotalInv,
      tramos: orden.map((clave) => ({
        clave,
        label: etiquetas[clave],
        costo: tramos[clave].costo,
        skus: tramos[clave].skus,
        pct: costoTotalInv > 0 ? (tramos[clave].costo / costoTotalInv) * 100 : 0,
      })),
      parados: paradosLista.sort((a, b) => b.costo - a.costo).slice(0, 8),
    },
    clientes: {
      conVentas: ultimaCompraCliente.size,
      activos90,
      inactivos180,
      ltvInactivos,
      top: topClientes,
      top1Pct: topClientes[0]?.pct ?? 0,
      top2Pct: (topClientes[0]?.pct ?? 0) + (topClientes[1]?.pct ?? 0),
      top5Pct: topClientes.slice(0, 5).reduce((s, c) => s + c.pct, 0),
      nuevosVsRecurrentes: claves.map((k) => ({ mes: k, label: labelMes(k), ...nvr.get(k)! })),
    },
    embudo: {
      total: cots.length,
      aceptadas,
      vencidas,
      rechazadas,
      borradores: cuenta("borrador"),
      enviadas: cuenta("enviada"),
      conversion: cerradas > 0 ? (aceptadas / cerradas) * 100 : null,
      valorAceptado: cots.filter((c) => c.estatus === "aceptada").reduce((s, c) => s + num(c.total), 0),
    },
    compras: {
      pedidos,
      totalMxn: pedidos.reduce((s, x) => s + x.mxn, 0),
      diasDesdeUltima: pedidos.length ? diasEntre(pedidos[pedidos.length - 1].fecha, hoy) : null,
      tcPromedio,
    },
    calidad: {
      partidasSinCosto: sinCosto.length,
      partidasTotal: partidas.length,
      pctPartidasSinCosto: partidas.length ? (sinCosto.length / partidas.length) * 100 : 0,
      ingresosSinCosto: sinCosto.reduce((s, it) => s + num(it.subtotal), 0),
      ventasSinCostoProductos: ventasTodas.filter((v) => num(v.costo_productos) === 0).length,
      ventasTotal: ventasTodas.length,
      ivaCobrado: ventasTodas.reduce((s, v) => s + num(v.iva), 0),
      clientesSinTelefono: clientesReales.filter((c) => !c.telefono).length,
      clientesTotal: clientesReales.length,
      productosSinPrecio: input.stock.filter((s) => !num(s.precio_publico)).length,
      productosSinCosto: input.stock.filter((s) => !num(s.costo_total_mxn)).length,
      stockNegativo: input.stock.filter((s) => num(s.stock_actual) < 0).length,
    },
    hallazgos: [],
  }
  p.hallazgos = generarHallazgos(p)
  return p
}

// ───────────────────────── Hallazgos ─────────────────────────

const mxn = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })
const pct = (n: number) => `${n.toFixed(0)}%`

/** "Lo que más importa": reglas simples y explicables, ordenadas por gravedad. */
export function generarHallazgos(p: Panorama): Hallazgo[] {
  const h: Hallazgo[] = []

  // Concentración de clientes
  if (p.clientes.top2Pct >= 60 && p.clientes.top.length >= 2) {
    h.push({
      tono: "riesgo",
      titulo: `${p.clientes.top[0].nombre} y ${p.clientes.top[1].nombre} concentran ${pct(p.clientes.top2Pct)} de lo vendido`,
      detalle: "Si uno de los dos baja o se va, las ventas caen de golpe. Conviene abrir más clientes recurrentes.",
      href: "/clientes",
      accion: "Ver clientes",
    })
  }

  // Inventario parado
  const parado = p.inventario.tramos.find((t) => t.clave === "parado")
  if (parado && p.inventario.total > 0 && parado.pct >= 30) {
    h.push({
      tono: parado.pct >= 50 ? "riesgo" : "atencion",
      titulo: `${pct(parado.pct)} del inventario (${mxn(parado.costo)} a costo) está parado`,
      detalle: `${parado.skus} productos con stock que no se venden hace más de 90 días. Es capital detenido: promociones, paquetes o no recomprar.`,
      href: "/inventario",
      accion: "Ver inventario",
    })
  }

  // Ventas vs año anterior
  if (p.ventas.ytdCambio != null) {
    const c = p.ventas.ytdCambio
    h.push({
      tono: c <= -10 ? "atencion" : c >= 10 ? "ok" : "info",
      titulo: `En lo que va del año se ha vendido ${mxn(p.ventas.ytd)}: ${c >= 0 ? "+" : ""}${c.toFixed(1)}% vs el mismo corte de ${new Date().getFullYear() - 1}`,
      detalle: `Mismo periodo del año pasado: ${mxn(p.ventas.ytdPrevio)}.`,
    })
  }

  // Clientes inactivos
  if (p.clientes.conVentas > 0 && p.clientes.inactivos180 >= 3) {
    h.push({
      tono: "atencion",
      titulo: `${p.clientes.inactivos180} de ${p.clientes.conVentas} clientes no compran hace más de 6 meses`,
      detalle: `Entre todos suman ${mxn(p.clientes.ltvInactivos)} históricos. Solo ${p.clientes.activos90} compraron en los últimos 90 días.`,
      href: "/clientes",
      accion: "Reactivar",
    })
  }

  // Meses sin ventas
  if (p.ventas.mesesSinVentas.length >= 2) {
    h.push({
      tono: "info",
      titulo: `${p.ventas.mesesSinVentas.length} meses del periodo sin una sola venta (${p.ventas.mesesSinVentas.slice(-3).join(", ")}…)`,
      detalle: "Las ventas llegan en bloques grandes de pocos clientes; planea el flujo de efectivo por trimestre, no por mes.",
    })
  }

  // Calidad de datos que distorsiona la utilidad
  if (p.calidad.pctPartidasSinCosto >= 30) {
    h.push({
      tono: "atencion",
      titulo: `${pct(p.calidad.pctPartidasSinCosto)} de las partidas vendidas no tienen costo unitario registrado`,
      detalle: p.margen.reposicion != null
        ? `El margen por producto/categoría se estima con el costo actual: ${p.margen.reposicion.toFixed(0)}% (el registrado en ventas es ${p.margen.registrado.toFixed(0)}%, y este incluye el IVA cobrado).`
        : "Sin costo no se puede saber qué productos dejan más margen.",
    })
  }

  // Cobertura de inventario
  if (p.capital.coberturaMeses != null && p.capital.coberturaMeses > 18) {
    h.push({
      tono: "info",
      titulo: `Hay inventario para ~${Math.round(p.capital.coberturaMeses)} meses al ritmo de venta de los últimos 6`,
      detalle: "Mucho stock para la demanda actual: no hace falta una importación grande pronto, salvo para los productos que sí se agotan.",
      href: "/inventario",
      accion: "Sugerencia de pedido",
    })
  } else if (p.capital.coberturaMeses != null && p.capital.coberturaMeses < 3) {
    h.push({
      tono: "atencion",
      titulo: `El inventario alcanza para ~${p.capital.coberturaMeses.toFixed(1)} meses`,
      detalle: "Con el tiempo de importación desde Brasil conviene pedir ya.",
      href: "/pedidos/nuevo",
      accion: "Nuevo pedido",
    })
  }

  // Cobros
  if (p.capital.porCobrar > 0) {
    h.push({
      tono: "atencion",
      titulo: `Hay ${mxn(p.capital.porCobrar)} por cobrar`,
      detalle: "Ventas abiertas con saldo pendiente.",
      href: "/ventas",
      accion: "Ver ventas",
    })
  }

  // Capital recuperado (buena noticia)
  if (p.capital.invertido > 0 && p.capital.multiplo >= 1) {
    h.push({
      tono: "ok",
      titulo: `Con lo recuperado, el inventario y lo por cobrar ya valen ${p.capital.multiplo.toFixed(1)}× lo invertido`,
      detalle: `Resultado acumulado estimado: ${mxn(p.capital.resultado)} sobre ${mxn(p.capital.invertido)} invertidos.`,
      href: "/finanzas",
      accion: "Ver finanzas",
    })
  }

  const peso: Record<Tono, number> = { riesgo: 0, atencion: 1, info: 2, ok: 3 }
  return h.sort((a, b) => peso[a.tono] - peso[b.tono])
}
