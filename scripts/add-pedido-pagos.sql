-- ─────────────────────────────────────────────────────────────────────────
-- Tabla pedido_pagos — registra cada PAGO (transfer de USDT) enviado al
-- proveedor para un pedido. Distinto de pedido_conversiones (compra MXN→USDT):
--   · conversión = comprar dólares con pesos (lleva comisión)
--   · pago/transfer = enviar esos dólares al proveedor
-- La barra "Pagado al proveedor" suma estos pagos vs el costo USD del pedido.
--
-- RLS desactivado (sistema interno). Correr en el SQL editor de Supabase.
-- Idempotente: re-correr no duplica los seeds.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.pedido_pagos (
  id            uuid primary key default gen_random_uuid(),
  pedido_id     uuid not null references public.pedidos_compra(id) on delete cascade,
  fecha         timestamptz   not null default now(),
  usdt_enviado  numeric(12,2) not null default 0,
  destinatario  text,
  mensaje       text,
  notas         text,
  created_at    timestamptz   not null default now()
);

create index if not exists idx_pedido_pagos_pedido
  on public.pedido_pagos(pedido_id);

alter table public.pedido_pagos disable row level security;
grant select, insert, update, delete on public.pedido_pagos
  to anon, authenticated, service_role;

-- Seed: los 2 transfers Bitso de USDT al proveedor (Julio Ayarza Delgado).
insert into public.pedido_pagos (pedido_id, fecha, usdt_enviado, destinatario, mensaje)
select '778a43ad-7cd6-4078-86a9-b572373a2c83', timestamptz '2025-12-29 09:51:12-06',
       753.00, 'Julio Ayarza Delgado', 'Pago de Productos Sandra Vargas'
where not exists (
  select 1 from public.pedido_pagos
  where pedido_id = '778a43ad-7cd6-4078-86a9-b572373a2c83'
    and fecha = timestamptz '2025-12-29 09:51:12-06'
);

insert into public.pedido_pagos (pedido_id, fecha, usdt_enviado, destinatario, mensaje)
select '778a43ad-7cd6-4078-86a9-b572373a2c83', timestamptz '2026-04-19 11:57:43-06',
       3731.94, 'Julio Ayarza Delgado', 'Productos Brasil'
where not exists (
  select 1 from public.pedido_pagos
  where pedido_id = '778a43ad-7cd6-4078-86a9-b572373a2c83'
    and fecha = timestamptz '2026-04-19 11:57:43-06'
);
