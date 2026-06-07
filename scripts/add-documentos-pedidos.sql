-- Documentos adjuntos a pedidos: comprobantes de pago + facturas (proveedor / envío).
-- Correr a mano en el SQL Editor de Supabase (DDL no va por la API REST).
-- Mismo patrón que scripts/add-pedido-pagos.sql.

-- 1) Bucket PRIVADO para documentos financieros (no público como `productos`).
--    El acceso de lectura se hace con signed URLs generadas server-side con el
--    admin client (service_role). El service_role bypassa RLS de storage.objects,
--    y al ser privado, nadie anónimo puede acceder por URL directa.
insert into storage.buckets (id, name, public)
values ('documentos-pedidos', 'documentos-pedidos', false)
on conflict (id) do nothing;

-- 2) Comprobante (PDF/imagen) por cada pago al proveedor.
alter table pedido_pagos add column if not exists comprobante_url text;

-- 3) Documentos del pedido (facturas de proveedor y de envío, etc.).
create table if not exists pedido_documentos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos_compra(id) on delete cascade,
  nombre text not null,
  tipo text not null default 'otro',  -- factura_proveedor | factura_envio | comprobante | otro
  filename text not null,
  notas text,
  created_at timestamptz not null default now()
);
create index if not exists idx_pedido_documentos_pedido on pedido_documentos(pedido_id);
