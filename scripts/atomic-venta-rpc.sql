-- ════════════════════════════════════════════════════════════════════
-- crear_venta_desde_cotizacion — versión ATÓMICA del flujo cotización→venta
-- ════════════════════════════════════════════════════════════════════
--
-- POR QUÉ: supabase-js NO abre transacciones multi-statement. Hoy
-- `marcarVendida` / `saveVenta` (src/app/(dashboard)/{cotizaciones,ventas}/actions.ts)
-- hacen 4 escrituras secuenciales (venta → items → venta_socios → inventario)
-- y, ante un fallo a media, dejan datos huérfanos. El código ya hace
-- ROLLBACK manual (borra la venta si un paso falla), pero eso no es atómico:
-- un crash entre pasos sigue corrompiendo. Esta función encapsula TODO en una
-- sola transacción plpgsql — o se hace completo, o no se hace nada.
--
-- CÓMO USAR: ejecuta este script en el SQL editor de Supabase. Luego, en el
-- código, puedes reemplazar el cuerpo de `marcarVendida` por:
--     const { data, error } = await supabase
--       .rpc("crear_venta_desde_cotizacion", { p_cotizacion_id: cotizacionId })
--     if (error) return { ok:false, error: error.message }
--     // data === venta_id
-- (Mantén los revalidatePath en el server action.)
--
-- ⚠️ REVISA los nombres/columnas contra tu esquema real ANTES de correr.
--    Verificado contra el esquema real (2026-06-29):
--      - venta_items.subtotal y .costo_total son GENERATED → NO se insertan (error 428C9)
--      - ventas.total / ganancia / saldo_pendiente / utilidad_neta son GENERATED → NO se insertan
--      - reusa la RPC existente descontar_inventario_venta(p_venta_id)
-- ════════════════════════════════════════════════════════════════════

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

  -- Sufijo del número: -C- (cotizado) → -V- (vendido)
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

  -- 2) Copiar items. OJO: venta_items.subtotal y .costo_total son GENERATED
  --    (Postgres los calcula). Insertarlos da error 428C9 → NO incluirlos.
  insert into venta_items (
    venta_id, producto_id, cantidad, precio_unitario,
    costo_unitario, sort_order
  )
  select
    v_venta_id, producto_id, cantidad, precio_unitario,
    costo_unitario, sort_order
  from cotizacion_items
  where cotizacion_id = p_cotizacion_id
  order by sort_order;

  -- 3) Reparto socios 50/50 (placeholder; se ajusta a mano después)
  v_half := round(coalesce(v_cot.total, 0) / 2.0, 2);
  insert into venta_socios (venta_id, socio_id, monto, concepto, pagado) values
    (v_venta_id, c_sandra,   v_half, 'Comisión venta ' || v_numero, false),
    (v_venta_id, c_benjamin, v_half, 'Comisión venta ' || v_numero, false);

  -- 4) Descontar inventario (reusa la RPC existente)
  perform descontar_inventario_venta(v_venta_id);

  -- 5) Marcar cotización aceptada + nuevo número
  update cotizaciones
     set estatus = 'aceptada', numero = v_numero
   where id = p_cotizacion_id;

  return v_venta_id;
exception
  when others then
    -- En plpgsql, una excepción revierte TODO lo hecho en este bloque.
    raise;
end;
$$;

-- Solo el service_role debe ejecutarla (la app la llama server-side).
revoke all on function crear_venta_desde_cotizacion(uuid) from anon, authenticated;
