-- Múltiples proveedores por pedido → proveedor por PRODUCTO (ítem del pedido)
-- Correr en Supabase → SQL Editor. Idempotente.

-- 1) Nueva columna: proveedor por ítem (FK a proveedores, nullable)
ALTER TABLE pedido_compra_items
  ADD COLUMN IF NOT EXISTS proveedor_id uuid REFERENCES proveedores(id);

-- 2) Backfill: cada ítem existente hereda el proveedor por defecto de su producto
UPDATE pedido_compra_items pci
SET proveedor_id = p.proveedor_id
FROM productos p
WHERE pci.producto_id = p.id
  AND pci.proveedor_id IS NULL
  AND p.proveedor_id IS NOT NULL;
