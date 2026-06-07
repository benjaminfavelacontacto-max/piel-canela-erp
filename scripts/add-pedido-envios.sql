-- Desglose del envío por tramos (informativo) + factura adjunta por tramo.
-- Correr a mano en el SQL Editor de Supabase. Usa el bucket `documentos-pedidos`
-- (ya creado por add-documentos-pedidos.sql).

create table if not exists pedido_envios (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos_compra(id) on delete cascade,
  tramo text not null,            -- ej. "Brasil → USA", "USA → México"
  monto_usd numeric not null default 0,
  monto_mxn numeric not null default 0,
  filename text,                  -- factura del tramo (bucket documentos-pedidos)
  notas text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_pedido_envios_pedido on pedido_envios(pedido_id);

-- Comprobante (PDF/imagen) por cada conversión MXN→USDT (mismo bucket privado).
alter table pedido_conversiones add column if not exists comprobante_url text;
