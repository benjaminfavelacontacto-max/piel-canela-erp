-- ════════════════════════════════════════════════════════════════════
-- Productos de REGALO (cortesías) en cotizaciones y ventas
-- ════════════════════════════════════════════════════════════════════
--
-- QUÉ HACE
--   1. Agrega `es_regalo` y `precio_lista` a cotizacion_items y venta_items.
--   2. Quita (si existe) el UNIQUE (cotizacion_id, producto_id) / (venta_id,
--      producto_id) — un mismo SKU puede ir en 2 partidas: la vendida y la
--      regalada ("compra 10, lleva 1 gratis").
--   3. Recrea `crear_venta_desde_cotizacion` para que copie las 2 columnas
--      nuevas a la venta (sin esto el regalo se convierte en venta normal de $0
--      y se pierde el rastro de la cortesía).
--
-- MODELO DE DATOS (por qué así)
--   Un regalo se guarda con `precio_unitario = 0` — así `subtotal` (columna
--   GENERATED = cantidad × precio_unitario) da 0 y NINGÚN reporte existente
--   cuenta el regalo como ingreso, sin tocar ninguna columna generada.
--   `costo_unitario` se conserva REAL: entra en `costo_productos`, y como
--   `utilidad_neta = subtotal − descuento − costo_productos − costo_envio`,
--   la pérdida del regalo ya queda restada de la utilidad. Ese es el cuadre.
--   `precio_lista` congela el precio de catálogo al momento de cotizar, solo
--   para mostrar "valor comercial obsequiado" (no entra en ningún total).
--
-- CÓMO CORRERLO
--   Pega TODO este archivo en el SQL Editor de Supabase (proyecto
--   szjzaajjpuomvpnghvzu) y ejecútalo. Es idempotente: se puede correr 2 veces.
--   La app funciona ANTES de correrlo (degrada: no deja marcar regalos y avisa
--   en el log del servidor), pero los regalos no se guardan hasta aplicarlo.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Columnas nuevas ─────────────────────────────────────────────
alter table cotizacion_items
  add column if not exists es_regalo boolean not null default false,
  add column if not exists precio_lista numeric(12,2);

alter table venta_items
  add column if not exists es_regalo boolean not null default false,
  add column if not exists precio_lista numeric(12,2);

comment on column cotizacion_items.es_regalo is
  'Partida de cortesía: precio_unitario = 0, el costo SÍ cuenta como pérdida.';
comment on column cotizacion_items.precio_lista is
  'Precio de catálogo congelado al cotizar. Solo referencia (valor obsequiado).';
comment on column venta_items.es_regalo is
  'Partida de cortesía: precio_unitario = 0, el costo SÍ cuenta como pérdida.';
comment on column venta_items.precio_lista is
  'Precio de catálogo congelado al vender. Solo referencia (valor obsequiado).';

-- Índices parciales: los reportes de regalos filtran por es_regalo = true.
create index if not exists idx_cotizacion_items_regalo
  on cotizacion_items (cotizacion_id) where es_regalo;
create index if not exists idx_venta_items_regalo
  on venta_items (venta_id) where es_regalo;

-- ─── 2. Permitir 2 partidas del mismo producto (vendida + regalada) ──
-- Si nunca existió ese UNIQUE, este bloque no hace nada.
do $$
declare r record;
begin
  for r in
    select con.conname, con.conrelid::regclass::text as tabla
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where con.contype = 'u'
      and rel.relname in ('cotizacion_items', 'venta_items')
      and (
        select array_agg(att.attname order by att.attname)
        from unnest(con.conkey) k
        join pg_attribute att
          on att.attrelid = con.conrelid and att.attnum = k
      ) in (
        array['cotizacion_id','producto_id']::name[],
        array['producto_id','venta_id']::name[]
      )
  loop
    execute format('alter table %s drop constraint %I', r.tabla, r.conname);
    raise notice 'Quitado UNIQUE % de % (ahora se puede regalar el mismo SKU que se vende)', r.conname, r.tabla;
  end loop;
end $$;

-- Lo mismo para índices únicos sueltos (no creados como constraint).
do $$
declare r record;
begin
  for r in
    select cls.relname as idx, tab.relname as tabla
    from pg_index i
    join pg_class cls on cls.oid = i.indexrelid
    join pg_class tab on tab.oid = i.indrelid
    where i.indisunique
      and tab.relname in ('cotizacion_items', 'venta_items')
      and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
      and (
        select array_agg(att.attname order by att.attname)
        from unnest(i.indkey::int[]) k
        join pg_attribute att on att.attrelid = i.indrelid and att.attnum = k
      ) in (
        array['cotizacion_id','producto_id']::name[],
        array['producto_id','venta_id']::name[]
      )
  loop
    execute format('drop index %I', r.idx);
    raise notice 'Quitado índice único % de %', r.idx, r.tabla;
  end loop;
end $$;

-- ─── 3. RPC cotización→venta: copiar es_regalo y precio_lista ───────
-- Igual que scripts/atomic-venta-rpc.sql, solo cambian las 2 columnas nuevas
-- en el INSERT de venta_items (paso 2).
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
  insert into venta_items (
    venta_id, producto_id, cantidad, precio_unitario,
    costo_unitario, sort_order, es_regalo, precio_lista
  )
  select
    v_venta_id, producto_id, cantidad, precio_unitario,
    costo_unitario, sort_order, coalesce(es_regalo, false), precio_lista
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

-- ─── 4. Verificación (debe regresar 4 filas) ────────────────────────
select table_name, column_name, data_type
from information_schema.columns
where (table_name, column_name) in (
        ('cotizacion_items','es_regalo'), ('cotizacion_items','precio_lista'),
        ('venta_items','es_regalo'),      ('venta_items','precio_lista'))
order by table_name, column_name;
