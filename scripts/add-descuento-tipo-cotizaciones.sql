-- Persiste CÓMO se capturó el descuento de una cotización (% o monto fijo).
-- Sin esto, un descuento capturado como porcentaje se congela como monto al
-- editar la cotización y ya no se recalcula cuando cambian los productos
-- (ej. PC-250726012: 10% de $17,054 = $1,705.40 quedó fijo aunque el
-- subtotal creció a $44,882 — el descuento correcto era $4,488.20).
--
-- Ejecutar en el SQL Editor de Supabase del proyecto piel-canela-erp.

alter table public.cotizaciones
  add column if not exists descuento_tipo text not null default 'monto'
    check (descuento_tipo in ('monto', 'pct')),
  add column if not exists descuento_valor numeric not null default 0;

-- Backfill: las cotizaciones existentes se tratan como monto fijo igual al
-- descuento ya guardado (comportamiento actual, sin cambios retroactivos).
update public.cotizaciones
   set descuento_valor = descuento
 where descuento_valor = 0
   and descuento > 0;
