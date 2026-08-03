-- ════════════════════════════════════════════════════════════════════
-- DESCUENTO POR PRODUCTO (por partida) en cotizaciones y ventas
-- ════════════════════════════════════════════════════════════════════
--
-- QUÉ HACE
--   1. Agrega `descuento_tipo` y `descuento_valor` a cotizacion_items y
--      venta_items.
--   2. Recrea `crear_venta_desde_cotizacion` para que copie esas 2 columnas a
--      la venta (sin esto, la venta pierde el rastro de por qué el precio de
--      una partida era menor al de catálogo).
--
-- MODELO DE DATOS (por qué así)
--   La partida con descuento guarda el precio YA REBAJADO en `precio_unitario`
--   y el de catálogo en `precio_lista` (la misma columna que ya usan los
--   regalos). Así `subtotal` (GENERATED = cantidad × precio_unitario),
--   `cotizaciones.subtotal`, el IVA, la utilidad y la venta espejo siguen
--   cuadrando SOLOS, sin tocar ninguna columna generada ni ningún reporte.
--   `descuento_tipo`/`descuento_valor` solo recuerdan CÓMO se capturó
--   (15 = 15%, o 500 = $500 sobre la PARTIDA COMPLETA) para mostrarlo en el
--   PDF y poder recalcular el precio si cambia la cantidad — con un monto
--   fijo, el precio por pieza depende de cuántas piezas hay.
--
--   OJO: el descuento por producto NO se suma a `cotizaciones.descuento` —
--   esa columna es el descuento GLOBAL, que se resta después del subtotal y
--   antes del IVA. Sumarlos ahí descontaría dos veces.
--
-- CÓMO CORRERLO
--   Pega TODO este archivo en el SQL Editor de Supabase (proyecto
--   szjzaajjpuomvpnghvzu) y ejecútalo. Es idempotente: se puede correr 2 veces.
--   La app funciona ANTES de correrlo (degrada: el descuento por producto se
--   guarda en el precio pero se pierde la etiqueta "−15%" y avisa en el log),
--   así que conviene aplicarlo antes de mergear.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Columnas nuevas ─────────────────────────────────────────────
alter table cotizacion_items
  add column if not exists descuento_tipo text
    check (descuento_tipo is null or descuento_tipo in ('monto', 'pct')),
  add column if not exists descuento_valor numeric(12,2) not null default 0;

alter table venta_items
  add column if not exists descuento_tipo text
    check (descuento_tipo is null or descuento_tipo in ('monto', 'pct')),
  add column if not exists descuento_valor numeric(12,2) not null default 0;

comment on column cotizacion_items.descuento_tipo is
  'Cómo se capturó el descuento de ESTA partida: pct (%) o monto ($ por pieza).';
comment on column cotizacion_items.descuento_valor is
  'Valor tecleado del descuento de la partida (15 = 15%, 500 = $500 sobre la partida completa, repartidos entre sus piezas). El precio ya rebajado vive en precio_unitario y el de catálogo en precio_lista.';
comment on column venta_items.descuento_tipo is
  'Cómo se capturó el descuento de ESTA partida: pct (%) o monto ($ por pieza).';
comment on column venta_items.descuento_valor is
  'Valor tecleado del descuento de la partida (15 = 15%, 500 = $500 sobre la partida completa, repartidos entre sus piezas). El precio ya rebajado vive en precio_unitario y el de catálogo en precio_lista.';

-- Los reportes de "qué se descontó" filtran por partidas con descuento.
create index if not exists idx_cotizacion_items_descuento
  on cotizacion_items (cotizacion_id) where descuento_valor > 0;
create index if not exists idx_venta_items_descuento
  on venta_items (venta_id) where descuento_valor > 0;

-- ─── 2. RPC cotización→venta: copiar descuento_tipo y descuento_valor ─
-- Igual que scripts/add-regalos-cotizaciones.sql, solo cambian las 2 columnas
-- nuevas en el INSERT de venta_items (paso 2).
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

  -- 2) Copiar items (subtotal y costo_total son GENERATED → no se insertan).
  --    es_regalo / precio_lista viajan tal cual: la venta hereda la cortesía.
  --    descuento_tipo / descuento_valor también: la venta conserva el porqué
  --    de un precio menor al de catálogo (precio_unitario ya viene rebajado).
  insert into venta_items (
    venta_id, producto_id, cantidad, precio_unitario,
    costo_unitario, sort_order, es_regalo, precio_lista,
    descuento_tipo, descuento_valor
  )
  select
    v_venta_id, producto_id, cantidad, precio_unitario,
    costo_unitario, sort_order, coalesce(es_regalo, false), precio_lista,
    descuento_tipo, coalesce(descuento_valor, 0)
  from cotizacion_items
  where cotizacion_id = p_cotizacion_id
  order by sort_order;

  -- 3) Reparto socios 50/50 (placeholder; se ajusta a mano después)
  v_half := round(coalesce(v_cot.total, 0) / 2.0, 2);
  insert into venta_socios (venta_id, socio_id, monto, concepto, pagado) values
    (v_venta_id, c_sandra,   v_half, 'Comisión venta ' || v_numero, false),
    (v_venta_id, c_benjamin, v_half, 'Comisión venta ' || v_numero, false);

  -- 4) Descontar inventario — el regalo TAMBIÉN sale del almacén.
  perform descontar_inventario_venta(v_venta_id);

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

-- ─── 3. Verificación (debe regresar 4 filas) ────────────────────────
select table_name, column_name, data_type, column_default
from information_schema.columns
where (table_name, column_name) in (
        ('cotizacion_items','descuento_tipo'), ('cotizacion_items','descuento_valor'),
        ('venta_items','descuento_tipo'),      ('venta_items','descuento_valor'))
order by table_name, column_name;
