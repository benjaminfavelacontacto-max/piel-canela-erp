-- ════════════════════════════════════════════════════════════════════
-- Bitácora de ajustes manuales de stock (edición de producto en /inventario).
--
-- Motivo (auditoría 2026-07-25): las ediciones manuales de stock no dejaban
-- rastro, así que al reconciliar compras vs. ventas fue imposible distinguir
-- un ajuste legítimo de un error. Con esta tabla, cada cambio manual queda
-- registrado (antes → después, origen y fecha).
--
-- Aplicar UNA VEZ en el SQL Editor de Supabase (proyecto szjzaajjpuomvpnghvzu).
-- La app escribe vía service_role desde `actualizarProducto`; si la tabla no
-- existe todavía, la edición funciona igual y sólo se avisa en el log.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.ajustes_inventario (
  id             uuid primary key default gen_random_uuid(),
  producto_id    uuid not null references public.productos(id) on delete cascade,
  stock_antes    integer not null,
  stock_despues  integer not null,
  origen         text not null default 'edicion_manual',
  motivo         text,
  created_at     timestamptz not null default now()
);

create index if not exists ajustes_inventario_producto_idx
  on public.ajustes_inventario (producto_id, created_at desc);

-- RLS activo y SIN políticas: sólo el service_role (la app, server-side)
-- puede leer/escribir. Mismo patrón que el resto de tablas del ERP.
alter table public.ajustes_inventario enable row level security;
