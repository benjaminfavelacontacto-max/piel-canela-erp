-- ════════════════════════════════════════════════════════════════════
-- "Cinta por escoger" — partida comodín para cotizar cintas sin modelo
-- ════════════════════════════════════════════════════════════════════
--
-- QUÉ HACE
--   Crea UN producto placeholder (SKU CN-POR-ESCOGER) con el precio de las
--   cintas ($150, lista 'Pública MXN'). Se agrega a una cotización con la
--   cantidad que pida la clienta; cuando elige modelos se reemplaza por las
--   cintas reales (editar cotización).
--
-- POR QUÉ UN PRODUCTO Y NO UN CAMPO NUEVO
--   cotizacion_items.producto_id es NOT NULL con FK, y todo el PDF/listados
--   hacen join a productos. Un producto comodín no toca ningún esquema.
--
-- OJO
--   · activo = false → no sale en /order, ventas manuales, buscador global.
--   · La app NO deja convertir a venta una cotización que aún tenga cintas
--     por escoger (no existe stock físico de un modelo que no se eligió).
--   · SKU fijo, referenciado en src/lib/cinta-por-escoger.ts.
--
-- CÓMO CORRERLO
--   SQL Editor de Supabase (proyecto szjzaajjpuomvpnghvzu). Idempotente.
-- ════════════════════════════════════════════════════════════════════

INSERT INTO productos (sku, nombre, nombre_display, categoria_id, peso, costo, activo)
SELECT 'CN-POR-ESCOGER', 'Cinta por escoger', 'Cinta por escoger',
       (SELECT id FROM categorias WHERE nombre = 'CINTAS'), '1PZA', 75, false
WHERE NOT EXISTS (SELECT 1 FROM productos WHERE sku = 'CN-POR-ESCOGER');

INSERT INTO precios_producto (producto_id, lista_id, precio)
SELECT p.id, l.id, 150
FROM productos p, listas_precios l
WHERE p.sku = 'CN-POR-ESCOGER'
  AND l.nombre = 'Pública MXN'
  AND NOT EXISTS (
    SELECT 1 FROM precios_producto pp
    WHERE pp.producto_id = p.id AND pp.lista_id = l.id
  );
