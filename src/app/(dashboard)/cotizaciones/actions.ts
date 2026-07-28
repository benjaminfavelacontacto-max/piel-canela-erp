"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { faltantesDeStock, describirFaltantes } from "@/lib/stock"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import {
  construirNumeroOrden,
  nombreCorto,
  cambiarTipoNumero,
} from "@/lib/numero-orden"
// Si la BD aún no tiene es_regalo/precio_lista (migración pendiente) se
// reintenta sin esas columnas — ver scripts/add-regalos-cotizaciones.sql.
import { errorSinColumnasRegalo, sinCamposRegalo } from "@/lib/regalos"

export type SaveItem = {
  producto_id: string
  cantidad: number
  precio_unitario: number
  costo_unitario: number
  subtotal: number
  /** Cortesía: precio_unitario llega en 0 y el costo cuenta como pérdida. */
  es_regalo?: boolean
  /** Precio de catálogo congelado (solo referencia del valor obsequiado). */
  precio_lista?: number | null
}

export type SaveCotizacionInput = {
  numero: string
  cliente_id: string | null
  fecha: string
  valida_hasta: string | null
  moneda: string
  subtotal: number
  iva: number
  descuento: number
  descuento_tipo: "monto" | "pct"
  descuento_valor: number
  total: number
  costo_productos: number
  costo_envio: number
  notas: string | null
  items: SaveItem[]
}

// ─── Auto-generación del número de orden (consecutivo por cliente) ──────

async function numeroOrdenExiste(
  supabase: ReturnType<typeof createAdminClient>,
  numeroC: string,
): Promise<boolean> {
  const numeroV = cambiarTipoNumero(numeroC, "V")
  const [c1, c2, v1, v2] = await Promise.all([
    supabase.from("cotizaciones").select("id").eq("numero", numeroC).maybeSingle(),
    supabase.from("cotizaciones").select("id").eq("numero", numeroV).maybeSingle(),
    supabase.from("ventas").select("id").eq("numero", numeroC).maybeSingle(),
    supabase.from("ventas").select("id").eq("numero", numeroV).maybeSingle(),
  ])
  return !!(c1.data || c2.data || v1.data || v2.data)
}

async function generarNumeroCotizacion(
  supabase: ReturnType<typeof createAdminClient>,
  clienteId: string,
  fecha: string,
): Promise<string> {
  // Consecutivo = # de cotizaciones del cliente + 1
  const { count } = await supabase
    .from("cotizaciones")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", clienteId)
  const { data: cli } = await supabase
    .from("clientes")
    .select("nombre, nombre_negocio")
    .eq("id", clienteId)
    .maybeSingle()
  const corto = nombreCorto(cli ?? null)
  let consecutivo = (count ?? 0) + 1
  // Garantizar unicidad: si el número ya existe, sube el consecutivo.
  for (let i = 0; i < 50; i++) {
    const numero = construirNumeroOrden({ fecha, consecutivo, tipo: "C", nombreCorto: corto })
    if (!(await numeroOrdenExiste(supabase, numero))) return numero
    consecutivo++
  }
  return construirNumeroOrden({ fecha, consecutivo, tipo: "C", nombreCorto: corto })
}

/** Server action: número sugerido para el formulario (preview, editable). */
export async function siguienteNumeroCotizacion(
  clienteId: string,
  fecha?: string,
): Promise<string | null> {
  if (!clienteId) return null
  const supabase = createAdminClient()
  return generarNumeroCotizacion(
    supabase,
    clienteId,
    fecha || new Date().toISOString().slice(0, 10),
  )
}

// Compatibilidad: si la migración add-descuento-tipo-cotizaciones.sql aún no
// se corre, la BD no tiene descuento_tipo/descuento_valor. Detectamos ese
// error y reintentamos sin esos campos (comportamiento anterior) en lugar de
// romper el guardado.
function esColumnaDescuentoFaltante(
  err: { code?: string; message?: string } | null,
): boolean {
  if (!err) return false
  return (
    err.code === "PGRST204" ||
    err.code === "42703" ||
    /descuento_(tipo|valor)/.test(err.message ?? "")
  )
}

function sinCamposDescuento<T extends Record<string, unknown>>(row: T) {
  const { descuento_tipo: _t, descuento_valor: _v, ...resto } = row
  return resto
}

/** Filas de cotizacion_items listas para insertar (subtotal es GENERATED). */
function filasItems(cotizacionId: string, items: SaveItem[]) {
  return items.map((it, i) => ({
    cotizacion_id: cotizacionId,
    producto_id: it.producto_id,
    cantidad: it.cantidad,
    // Un regalo se persiste con precio 0: así `subtotal` (GENERATED) da 0 y
    // ningún reporte lo cuenta como ingreso. Ver src/lib/regalos.ts.
    precio_unitario: it.es_regalo ? 0 : it.precio_unitario,
    costo_unitario: it.costo_unitario,
    sort_order: i,
    es_regalo: it.es_regalo ?? false,
    precio_lista: it.precio_lista ?? null,
  }))
}

export async function saveCotizacion(input: SaveCotizacionInput) {
  const supabase = createAdminClient()

  // Número: usar el provisto, o auto-generar (consecutivo por cliente) si viene vacío.
  let numero = (input.numero ?? "").trim()
  if (!numero && input.cliente_id) {
    numero = await generarNumeroCotizacion(supabase, input.cliente_id, input.fecha)
  }

  // total y utilidad_neta son GENERATED — no se insertan. Postgres las calcula.
  const row = {
    numero,
    cliente_id: input.cliente_id,
    fecha: input.fecha,
    valida_hasta: input.valida_hasta,
    moneda: input.moneda,
    subtotal: input.subtotal,
    iva: input.iva,
    descuento: input.descuento,
    descuento_tipo: input.descuento_tipo,
    descuento_valor: input.descuento_valor,
    costo_productos: input.costo_productos,
    costo_envio: input.costo_envio ?? 0,
    estatus: "borrador",
    notas: input.notas,
  }
  let { data: cot, error: cotErr } = await supabase
    .from("cotizaciones")
    .insert(row)
    .select("id")
    .single()
  if (esColumnaDescuentoFaltante(cotErr)) {
    console.warn("[saveCotizacion] BD sin migración de descuento_tipo; guardando sin tipo/valor")
    ;({ data: cot, error: cotErr } = await supabase
      .from("cotizaciones")
      .insert(sinCamposDescuento(row))
      .select("id")
      .single())
  }

  if (cotErr || !cot) {
    console.error("[saveCotizacion] insert cotización falló:", JSON.stringify(cotErr, null, 2))
    return {
      ok: false as const,
      error: cotErr?.message ?? "Error al crear cotización",
    }
  }

  if (input.items.length > 0) {
    // cotizacion_items.subtotal también es GENERATED — no se inserta.
    const itemsRows = filasItems(cot.id as string, input.items)

    let { error: itemsErr } = await supabase
      .from("cotizacion_items")
      .insert(itemsRows)
    if (errorSinColumnasRegalo(itemsErr)) {
      console.warn(
        "[saveCotizacion] BD sin migración de regalos; guardando sin es_regalo/precio_lista",
      )
      ;({ error: itemsErr } = await supabase
        .from("cotizacion_items")
        .insert(itemsRows.map(sinCamposRegalo)))
    }

    if (itemsErr) {
      console.error("[saveCotizacion] insert items falló:", JSON.stringify(itemsErr, null, 2))
      return {
        ok: false as const,
        error: `Cotización creada pero items fallaron: ${itemsErr.message}`,
      }
    }
  }

  revalidatePath("/cotizaciones")
  return { ok: true as const, id: cot.id as string }
}

export async function saveCotizacionAndRedirect(input: SaveCotizacionInput) {
  const result = await saveCotizacion(input)
  if (!result.ok) return result
  redirect(`/cotizaciones/${result.id}`)
}

/**
 * Marca una cotización como vendida:
 * 1. Crea una venta espejo (mismos campos que cotización + cotizacion_id).
 * 2. Copia los items a venta_items.
 * 3. Llama RPC descontar_inventario_venta(venta_id).
 * 4. Marca la cotización como 'aceptada'.
 *
 * NOTA: Asume que `ventas` y `venta_items` reflejan el shape de cotizaciones/cotizacion_items.
 * Si tu schema difiere, este insert va a fallar y debes ajustar los campos.
 */
export async function marcarVendida(
  cotizacionId: string,
  opts?: {
    /**
     * Sólo para salidas internas (Piel Canela): la socia ya se llevó el
     * producto físicamente, así que se registra aunque el sistema no tenga
     * stock — el negativo resultante es la señal para reconciliar.
     * Las ventas a clientes NUNCA deben pasar esto.
     */
    permitirSinStock?: boolean
  },
) {
  const supabase = createAdminClient()

  // Validación de existencias EN EL SERVIDOR. La RPC de descuento no valida
  // (deja el stock en negativo), y el aviso del detalle de cotización es sólo
  // visual — sin esto, cualquier otro camino (o una pestaña vieja) puede
  // vender sin stock. Ver auditoría de inventario 2026-07-25.
  if (!opts?.permitirSinStock) {
    const { data: itemsCot } = await supabase
      .from("cotizacion_items")
      .select("producto_id, cantidad")
      .eq("cotizacion_id", cotizacionId)
    const faltantes = await faltantesDeStock(
      supabase,
      (itemsCot ?? []) as { producto_id: string | null; cantidad: number }[],
    )
    if (faltantes.length > 0) {
      return {
        ok: false as const,
        error: `Sin existencias suficientes — ${describirFaltantes(faltantes)}`,
      }
    }
  }

  // Flujo cotización→venta ATÓMICO: una sola RPC plpgsql crea la venta espejo
  // (número -C-→-V-), copia los items, inserta el reparto 50/50, descuenta
  // inventario y marca la cotización 'aceptada' — TODO en una transacción
  // (o todo, o nada). Reemplaza el orquestado JS que podía dejar ventas a
  // medias ante un fallo. Ver scripts/atomic-venta-rpc.sql.
  const { data: ventaId, error } = await supabase.rpc(
    "crear_venta_desde_cotizacion",
    { p_cotizacion_id: cotizacionId },
  )

  if (error) {
    return { ok: false as const, error: error.message }
  }

  revalidatePath(`/cotizaciones/${cotizacionId}`)
  revalidatePath("/cotizaciones")
  revalidatePath("/")
  revalidatePath("/inventario")
  revalidatePath("/ventas")

  return { ok: true as const, ventaId: ventaId as string }
}

// ───────────────────────────────────────────────────────────────────
// cambiarEstatusCotizacion — cambio inline desde la lista
// ───────────────────────────────────────────────────────────────────

const ESTATUS_VALIDOS = [
  "borrador",
  "enviada",
  "aceptada",
  "rechazada",
  "vencida",
] as const
type EstatusCotizacion = (typeof ESTATUS_VALIDOS)[number]

export async function cambiarEstatusCotizacion(
  id: string,
  estatus: string,
) {
  if (!ESTATUS_VALIDOS.includes(estatus as EstatusCotizacion)) {
    return { ok: false as const, error: `Estatus inválido: ${estatus}` }
  }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("cotizaciones")
    .update({ estatus })
    .eq("id", id)
  if (error) {
    console.error(
      "[cambiarEstatusCotizacion] error:",
      JSON.stringify(error, null, 2),
    )
    return { ok: false as const, error: error.message }
  }
  revalidatePath("/cotizaciones")
  revalidatePath(`/cotizaciones/${id}`)
  return { ok: true as const }
}

// ───────────────────────────────────────────────────────────────────
// duplicarCotizacion — clona como nueva en estatus 'borrador'
// ───────────────────────────────────────────────────────────────────

export async function duplicarCotizacion(id: string) {
  const supabase = createAdminClient()
  let { data: orig, error: fetchErr } = await supabase
    .from("cotizaciones")
    .select(
      "numero, cliente_id, fecha, valida_hasta, moneda, subtotal, iva, descuento, descuento_tipo, descuento_valor, costo_productos, costo_envio, notas",
    )
    .eq("id", id)
    .single()
  if (esColumnaDescuentoFaltante(fetchErr)) {
    ;({ data: orig, error: fetchErr } = await supabase
      .from("cotizaciones")
      .select(
        "numero, cliente_id, fecha, valida_hasta, moneda, subtotal, iva, descuento, costo_productos, costo_envio, notas",
      )
      .eq("id", id)
      .single())
  }
  if (fetchErr || !orig) {
    console.error(
      "[duplicarCotizacion] fetch error:",
      JSON.stringify(fetchErr, null, 2),
    )
    throw new Error(fetchErr?.message ?? "Cotización no encontrada")
  }

  const newNumero = `${orig.numero}-COPIA-${Date.now().toString().slice(-6)}`
  const today = new Date().toISOString().slice(0, 10)
  const validaHasta = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })()

  const origRow = orig as typeof orig & {
    descuento_tipo?: string
    descuento_valor?: number
  }
  const nuevaRow = {
    numero: newNumero,
    cliente_id: orig.cliente_id,
    fecha: today,
    valida_hasta: validaHasta,
    moneda: orig.moneda,
    subtotal: orig.subtotal,
    iva: orig.iva,
    descuento: orig.descuento,
    descuento_tipo: origRow.descuento_tipo ?? "monto",
    descuento_valor: origRow.descuento_valor ?? orig.descuento,
    costo_productos: orig.costo_productos,
    costo_envio: orig.costo_envio ?? 0,
    estatus: "borrador",
    notas: orig.notas,
  }
  let { data: cot, error: insErr } = await supabase
    .from("cotizaciones")
    .insert(nuevaRow)
    .select("id")
    .single()
  if (esColumnaDescuentoFaltante(insErr)) {
    ;({ data: cot, error: insErr } = await supabase
      .from("cotizaciones")
      .insert(sinCamposDescuento(nuevaRow))
      .select("id")
      .single())
  }
  if (insErr || !cot) {
    console.error(
      "[duplicarCotizacion] insert error:",
      JSON.stringify(insErr, null, 2),
    )
    throw new Error(insErr?.message ?? "No se pudo duplicar")
  }

  let { data: items, error: itemsErr } = await supabase
    .from("cotizacion_items")
    .select(
      "producto_id, cantidad, precio_unitario, costo_unitario, sort_order, es_regalo, precio_lista",
    )
    .eq("cotizacion_id", id)
  if (errorSinColumnasRegalo(itemsErr)) {
    const retry = await supabase
      .from("cotizacion_items")
      .select(
        "producto_id, cantidad, precio_unitario, costo_unitario, sort_order",
      )
      .eq("cotizacion_id", id)
    items = retry.data as typeof items
    itemsErr = retry.error
  }
  if (itemsErr) {
    console.error(
      "[duplicarCotizacion] items fetch error:",
      JSON.stringify(itemsErr, null, 2),
    )
  }
  if (items && items.length > 0) {
    // La copia conserva las cortesías: duplicar una cotización con regalos
    // debe volver a regalar lo mismo, no cobrarlo.
    type ItemDup = (typeof items)[number] & {
      es_regalo?: boolean
      precio_lista?: number | null
    }
    const newItems = (items as ItemDup[]).map((it) => ({
      cotizacion_id: cot.id,
      producto_id: it.producto_id,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
      costo_unitario: it.costo_unitario,
      sort_order: it.sort_order,
      es_regalo: it.es_regalo ?? false,
      precio_lista: it.precio_lista ?? null,
    }))
    let { error: insItemsErr } = await supabase
      .from("cotizacion_items")
      .insert(newItems)
    if (errorSinColumnasRegalo(insItemsErr)) {
      ;({ error: insItemsErr } = await supabase
        .from("cotizacion_items")
        .insert(newItems.map(sinCamposRegalo)))
    }
    if (insItemsErr) {
      console.error(
        "[duplicarCotizacion] insert items error:",
        JSON.stringify(insItemsErr, null, 2),
      )
    }
  }

  revalidatePath("/cotizaciones")
  redirect(`/cotizaciones/${cot.id}/editar`)
}

// ───────────────────────────────────────────────────────────────────
// updateCotizacion — usado por la página de editar
// ───────────────────────────────────────────────────────────────────

export async function updateCotizacion(
  id: string,
  input: SaveCotizacionInput,
) {
  const supabase = createAdminClient()

  // total y utilidad_neta son GENERATED — Postgres los recalcula
  const row = {
    numero: input.numero,
    cliente_id: input.cliente_id,
    fecha: input.fecha,
    valida_hasta: input.valida_hasta,
    moneda: input.moneda,
    subtotal: input.subtotal,
    iva: input.iva,
    descuento: input.descuento,
    descuento_tipo: input.descuento_tipo,
    descuento_valor: input.descuento_valor,
    costo_productos: input.costo_productos,
    costo_envio: input.costo_envio ?? 0,
    notas: input.notas,
  }
  let { error: updErr } = await supabase
    .from("cotizaciones")
    .update(row)
    .eq("id", id)
  if (esColumnaDescuentoFaltante(updErr)) {
    console.warn("[updateCotizacion] BD sin migración de descuento_tipo; guardando sin tipo/valor")
    ;({ error: updErr } = await supabase
      .from("cotizaciones")
      .update(sinCamposDescuento(row))
      .eq("id", id))
  }
  if (updErr) {
    console.error(
      "[updateCotizacion] update error:",
      JSON.stringify(updErr, null, 2),
    )
    return { ok: false as const, error: updErr.message }
  }

  // Reemplaza items: DELETE old, INSERT new (subtotal es GENERATED — no se envía)
  const { error: delErr } = await supabase
    .from("cotizacion_items")
    .delete()
    .eq("cotizacion_id", id)
  if (delErr) {
    console.error(
      "[updateCotizacion] delete items error:",
      JSON.stringify(delErr, null, 2),
    )
    return { ok: false as const, error: delErr.message }
  }
  if (input.items.length > 0) {
    const rows = filasItems(id, input.items)
    let { error: insErr } = await supabase
      .from("cotizacion_items")
      .insert(rows)
    if (errorSinColumnasRegalo(insErr)) {
      console.warn(
        "[updateCotizacion] BD sin migración de regalos; guardando sin es_regalo/precio_lista",
      )
      ;({ error: insErr } = await supabase
        .from("cotizacion_items")
        .insert(rows.map(sinCamposRegalo)))
    }
    if (insErr) {
      console.error(
        "[updateCotizacion] insert items error:",
        JSON.stringify(insErr, null, 2),
      )
      return { ok: false as const, error: insErr.message }
    }
  }

  revalidatePath("/cotizaciones")
  revalidatePath(`/cotizaciones/${id}`)
  return { ok: true as const, id }
}


// ─── Eliminar cotización ──────────────────────────────────────────
// Protegido: si tiene venta vinculada, regresa error y no borra nada.

export async function eliminarCotizacion(id: string) {
  const supabase = createAdminClient()

  // Verificar que no tenga venta vinculada
  const { data: venta } = await supabase
    .from("ventas")
    .select("id, numero")
    .eq("cotizacion_id", id)
    .maybeSingle()

  if (venta) {
    return {
      ok: false as const,
      error: `No se puede eliminar: tiene la venta ${venta.numero} vinculada. Elimina primero la venta.`,
    }
  }

  // Eliminar items primero (FK constraint)
  const { error: errItems } = await supabase
    .from("cotizacion_items")
    .delete()
    .eq("cotizacion_id", id)
  if (errItems) {
    return { ok: false as const, error: errItems.message }
  }

  const { error } = await supabase
    .from("cotizaciones")
    .delete()
    .eq("id", id)
  if (error) {
    return { ok: false as const, error: error.message }
  }

  revalidatePath("/cotizaciones")
  return { ok: true as const }
}

// ─── Revertir cotización vendida → borrador ────────────────────────
// Deshace un "Marcar como Vendida" hecho por error:
//  1. Restaura el inventario que se descontó (re-suma cantidades de venta_items;
//     descontar_inventario_venta no tiene RPC inversa, se hace manual).
//  2. Borra venta_socios, venta_items y la venta.
//  3. Regresa la cotización a estatus 'borrador'.
// Restaura ANTES de borrar para no perder las cantidades. Si no hay venta
// asociada (solo estatus 'aceptada'), únicamente regresa el estatus.

export async function revertirCotizacion(cotizacionId: string) {
  const supabase = createAdminClient()

  const { data: venta, error: ventaErr } = await supabase
    .from("ventas")
    .select("id, numero")
    .eq("cotizacion_id", cotizacionId)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (ventaErr) {
    return { ok: false as const, error: ventaErr.message }
  }

  if (venta) {
    // 1) Restaurar inventario desde los items de la venta
    const { data: items, error: itemsErr } = await supabase
      .from("venta_items")
      .select("producto_id, cantidad")
      .eq("venta_id", venta.id)
    if (itemsErr) {
      return { ok: false as const, error: `Items: ${itemsErr.message}` }
    }
    const byProd = new Map<string, number>()
    for (const it of items ?? []) {
      const pid = it.producto_id as string | null
      if (!pid) continue
      byProd.set(pid, (byProd.get(pid) ?? 0) + Number(it.cantidad ?? 0))
    }
    for (const [productoId, cant] of byProd) {
      if (cant <= 0) continue
      const { data: inv } = await supabase
        .from("inventario")
        .select("id, stock_actual")
        .eq("producto_id", productoId)
        .maybeSingle()
      if (inv?.id) {
        const { error } = await supabase
          .from("inventario")
          .update({ stock_actual: Number(inv.stock_actual ?? 0) + cant })
          .eq("id", inv.id)
        if (error) {
          return { ok: false as const, error: `Inventario: ${error.message}` }
        }
      } else {
        const { error } = await supabase.from("inventario").insert({
          producto_id: productoId,
          stock_actual: cant,
          stock_minimo: 0,
          stock_inicial: cant,
        })
        if (error) {
          return { ok: false as const, error: `Inventario: ${error.message}` }
        }
      }
    }

    // 2) Borrar reparto a socios, items y la venta (en ese orden por FKs)
    await supabase.from("venta_socios").delete().eq("venta_id", venta.id)
    await supabase.from("venta_items").delete().eq("venta_id", venta.id)
    const { error: delErr } = await supabase
      .from("ventas")
      .delete()
      .eq("id", venta.id)
    if (delErr) {
      return { ok: false as const, error: `Venta: ${delErr.message}` }
    }
  }

  // 3) Regresar la cotización a borrador (y su número de -V- de vuelta a -C-)
  const updatesCot: { estatus: string; numero?: string } = { estatus: "borrador" }
  if (venta?.numero) updatesCot.numero = cambiarTipoNumero(venta.numero, "C")
  const { error: updErr } = await supabase
    .from("cotizaciones")
    .update(updatesCot)
    .eq("id", cotizacionId)
  if (updErr) {
    return { ok: false as const, error: `Estatus: ${updErr.message}` }
  }

  revalidatePath(`/cotizaciones/${cotizacionId}`)
  revalidatePath("/cotizaciones")
  revalidatePath("/ventas")
  revalidatePath("/inventario")
  revalidatePath("/")
  return {
    ok: true as const,
    ventaNumero: (venta?.numero as string | undefined) ?? null,
  }
}
