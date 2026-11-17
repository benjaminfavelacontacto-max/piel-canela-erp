-- ════════════════════════════════════════════════════════════════════
-- Cintas por escoger POR MEDIDA — cotizar y COBRAR sin elegir modelo
-- ════════════════════════════════════════════════════════════════════
--
-- QUÉ HACE
--   1. Crea 3 productos comodín (uno por medida, $150 como toda cinta):
--        CN-POR-ESCOGER-ENT (Cinta entera) · -9 (Cinta 9,9 = cortada 9mm) ·
        -12 (Cinta 6,12 = cortada 12mm)
--      El genérico CN-POR-ESCOGER (scripts/add-cinta-por-escoger.sql) sigue
--      existiendo para las cotizaciones viejas.
--   2. Recrea la RPC crear_venta_desde_cotizacion para que una cotización con
--      cintas por escoger SE PUEDA VENDER: los comodines se copian a la venta
--      (quedan como marca de "cintas pendientes") pero NO pasan por
--      descontar_inventario_venta — no tienen fila de stock y la RPC truena con
--      23502 (movimientos_inventario.stock_anterior NOT NULL) si falta.
--
-- ORDEN DE LA RPC (único cambio vs scripts/add-descuento-por-producto.sql)
--   a) copia las partidas REALES  →  b) descuenta inventario  →
--   c) copia los comodines (ya fuera del descuento).
--
-- CÓMO CORRERLO
--   SQL Editor de Supabase (proyecto szjzaajjpuomvpnghvzu). Idempotente.
--   Sin correrlo la app avisa: convertir una cotización con cintas por escoger
--   falla limpio (transacción completa, no queda venta a medias).
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Productos comodín por medida ────────────────────────────────
INSERT INTO productos (sku, nombre, nombre_display, categoria_id, peso, costo, activo)
SELECT v.sku, v.nombre, v.nombre, (SELECT id FROM categorias WHERE nombre = 'CINTAS'),
       '1PZA', 75, false
FROM (VALUES
  ('CN-POR-ESCOGER-ENT', 'Cinta entera por escoger'),
  ('CN-POR-ESCOGER-9',   'Cinta 9,9 por escoger'),
  ('CN-POR-ESCOGER-12',  'Cinta 6,12 por escoger')
) AS v(sku, nombre)
WHERE NOT EXISTS (SELECT 1 FROM productos p WHERE p.sku = v.sku);

INSERT INTO precios_producto (producto_id, lista_id, precio)
SELECT p.id, l.id, 150
FROM productos p, listas_precios l
WHERE p.sku IN ('CN-POR-ESCOGER-9','CN-POR-ESCOGER-12','CN-POR-ESCOGER-ENT')
  AND l.nombre = 'Pública MXN'
  AND NOT EXISTS (
    SELECT 1 FROM precios_producto pp
    WHERE pp.producto_id = p.id AND pp.lista_id = l.id
  );

-- ─── 2. RPC cotización→venta: los comodines no descuentan inventario ─
create or replace function crear_venta_desde_cotizacion(p_cotizacion_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cot        record;
  v_venta_id   uuid;
  v_numero     text;
  v_half       numeric;
  c_sandra   constant uuid := '4f21084b-dfe9-45f3-be80-935dc1a5e7a5';
  c_benjamin constant uuid := '3165fe33-c760-4373-84d0-e1cd14d863b3';
begin
  select * into v_cot from cotizaciones where id = p_cotizacion_id for update;
  if not found then
    raise exception 'Cotización % no encontrada', p_cotizacion_id;
  end if;

  v_numero := replace(v_cot.numero, '-C-', '-V-');

  -- 1) Venta espejo (columnas GENERATED omitidas)
  insert into ventas (
    numero, cliente_id, fecha, moneda, subtotal, iva, descuento,
    costo_productos, costo_envio, cantidad_pagada, estatus, notas,
    cotizacion_id, inventario_descontado
  ) values (
    v_numero, v_cot.cliente_id, current_date, v_cot.moneda, v_cot.subtotal,
    v_cot.iva, v_cot.descuento, v_cot.costo_productos, coalesce(v_cot.costo_envio, 0),
    0, 'pendiente', v_cot.notas, p_cotizacion_id, false
  )
  returning id into v_venta_id;

  -- 2a) Copiar partidas REALES (subtotal y costo_total son GENERATED).
  insert into venta_items (
    venta_id, producto_id, cantidad, precio_unitario,
    costo_unitario, sort_order, es_regalo, precio_lista,
    descuento_tipo, descuento_valor
  )
  select
    v_venta_id, ci.producto_id, ci.cantidad, ci.precio_unitario,
    ci.costo_unitario, ci.sort_order, coalesce(ci.es_regalo, false), ci.precio_lista,
    ci.descuento_tipo, coalesce(ci.descuento_valor, 0)
  from cotizacion_items ci
  where ci.cotizacion_id = p_cotizacion_id
    and ci.producto_id not in (
      select id from productos where sku like 'CN-POR-ESCOGER%'
    )
  order by ci.sort_order;

  -- 3) Reparto socios 50/50 (placeholder; se ajusta a mano después)
  v_half := round(coalesce(v_cot.total, 0) / 2.0, 2);
  insert into venta_socios (venta_id, socio_id, monto, concepto, pagado) values
    (v_venta_id, c_sandra,   v_half, 'Comisión venta ' || v_numero, false),
    (v_venta_id, c_benjamin, v_half, 'Comisión venta ' || v_numero, false);

  -- 4) Descontar inventario de las partidas reales (el regalo TAMBIÉN sale).
  --    Si la cotización es solo de cintas por escoger no hay nada que descontar.
  if exists (select 1 from venta_items where venta_id = v_venta_id) then
    perform descontar_inventario_venta(v_venta_id);
  end if;

  -- 2b) Comodines: ya fuera del descuento. Quedan en la venta como marca de
  --     "cintas pendientes" hasta reemplazarlas por los modelos reales.
  insert into venta_items (
    venta_id, producto_id, cantidad, precio_unitario,
    costo_unitario, sort_order, es_regalo, precio_lista,
    descuento_tipo, descuento_valor
  )
  select
    v_venta_id, ci.producto_id, ci.cantidad, ci.precio_unitario,
    ci.costo_unitario, ci.sort_order, coalesce(ci.es_regalo, false), ci.precio_lista,
    ci.descuento_tipo, coalesce(ci.descuento_valor, 0)
  from cotizacion_items ci
  where ci.cotizacion_id = p_cotizacion_id
    and ci.producto_id in (
      select id from productos where sku like 'CN-POR-ESCOGER%'
    )
  order by ci.sort_order;

  -- 5) Marcar cotización aceptada + nuevo número
  update cotizaciones
     set estatus = 'aceptada', numero = v_numero
   where id = p_cotizacion_id;

  return v_venta_id;
exception
  when others then
    raise;
end;
$$;

revoke all on function crear_venta_desde_cotizacion(uuid) from anon, authenticated;

-- ─── 3. Verificación (4 filas con precio 150: el genérico + las 3 medidas) ─
select p.sku, p.nombre, p.activo, pp.precio
from productos p
left join precios_producto pp on pp.producto_id = p.id
where p.sku like 'CN-POR-ESCOGER%'
order by p.sku;
