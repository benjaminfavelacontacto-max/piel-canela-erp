-- ─────────────────────────────────────────────────────────────────────────
-- Tabla pedido_conversiones — registra cada conversión MXN → USDT usada para
-- fondear un pedido de compra (los dólares que se enviaron al proveedor),
-- con su comisión. Permite saber el costo total REAL del pedido con comisiones.
--
-- RLS desactivado, como el resto del sistema interno (ver CLAUDE.md).
-- Correr en el SQL editor de Supabase (proyecto szjzaajjpuomvpnghvzu).
-- Idempotente: re-correr no rompe ni duplica el seed.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.pedido_conversiones (
  id            uuid primary key default gen_random_uuid(),
  pedido_id     uuid not null references public.pedidos_compra(id) on delete cascade,
  fecha         timestamptz   not null default now(),
  mxn_gastado   numeric(12,2) not null default 0,   -- "Monto gastado" (incluye comisión)
  usdt_recibido numeric(12,2) not null default 0,   -- USDT que entró
  tipo_cambio   numeric(8,4)  not null default 0,   -- 1 USDT = X MXN
  comision_mxn  numeric(12,2) not null default 0,   -- "Comisión"
  notas         text,
  created_at    timestamptz   not null default now()
);

create index if not exists idx_pedido_conversiones_pedido
  on public.pedido_conversiones(pedido_id);

-- Sistema interno: sin RLS, acceso directo por las llaves del proyecto.
alter table public.pedido_conversiones disable row level security;
grant select, insert, update, delete on public.pedido_conversiones
  to anon, authenticated, service_role;

-- Seed: primera conversión conocida del Pedido 3 (captura del 19 abr 2026).
insert into public.pedido_conversiones
  (pedido_id, fecha, mxn_gastado, usdt_recibido, tipo_cambio, comision_mxn, notas)
select '778a43ad-7cd6-4078-86a9-b572373a2c83', timestamptz '2026-04-19 11:46:52-06',
       21871.00, 1236.38, 17.6000, 109.35, 'Conversión MXN→USDT'
where not exists (
  select 1 from public.pedido_conversiones
  where pedido_id = '778a43ad-7cd6-4078-86a9-b572373a2c83'
    and fecha = timestamptz '2026-04-19 11:46:52-06'
);
