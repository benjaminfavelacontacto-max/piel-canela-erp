-- ═══════════════════════════════════════════════════════════════════════
-- SEED 42 VENTAS · IDEMPOTENTE · ADAPTADO AL SCHEMA REAL
-- - numero (no numero_orden)
-- - estatus 'pagada_total' (no 'completada')
-- - sin total/ganancia/saldo_pendiente (son GENERATED)
-- - venta_socios sin porcentaje
-- - sin TRUNCATE; ON CONFLICT DO NOTHING + función upsert
-- ═══════════════════════════════════════════════════════════════════════

-- 0) UNIQUE en numero (idempotente, ignora si ya existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ventas_numero_unique' AND conrelid = 'ventas'::regclass
  ) THEN
    ALTER TABLE ventas ADD CONSTRAINT ventas_numero_unique UNIQUE (numero);
  END IF;
END $$;

-- 1) Función upsert idempotente
CREATE OR REPLACE FUNCTION upsert_venta_item(
  p_numero text, p_producto_nombre text, p_cantidad integer,
  p_precio_unitario numeric, p_subtotal numeric
) RETURNS void AS $$
DECLARE
  v_venta_id uuid;
  v_producto_id uuid;
BEGIN
  SELECT id INTO v_venta_id FROM ventas WHERE numero = p_numero LIMIT 1;
  IF v_venta_id IS NULL THEN
    RAISE NOTICE 'Venta no encontrada: %', p_numero;
    RETURN;
  END IF;
  SELECT id INTO v_producto_id FROM productos WHERE nombre = p_producto_nombre LIMIT 1;
  IF v_producto_id IS NULL THEN
    SELECT id INTO v_producto_id FROM productos WHERE nombre ILIKE p_producto_nombre LIMIT 1;
  END IF;
  IF v_producto_id IS NULL THEN
    RAISE NOTICE 'Producto no encontrado: %', p_producto_nombre;
    RETURN;
  END IF;
  INSERT INTO venta_items(venta_id, producto_id, cantidad, precio_unitario, subtotal)
  SELECT v_venta_id, v_producto_id, p_cantidad, p_precio_unitario, p_subtotal
  WHERE NOT EXISTS (
    SELECT 1 FROM venta_items WHERE venta_id = v_venta_id AND producto_id = v_producto_id
  );
END;
$$ LANGUAGE plpgsql;

-- 2) Insertar clientes faltantes (sin ON CONFLICT, con WHERE NOT EXISTS)
INSERT INTO clientes(nombre, telefono, is_internal)
SELECT 'Glendy Escalante','9993331647',false
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE nombre ILIKE 'Glendy Escalante');
INSERT INTO clientes(nombre, telefono, is_internal)
SELECT 'Laura Elena',null,false
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE nombre ILIKE 'Laura Elena');
INSERT INTO clientes(nombre, telefono, is_internal)
SELECT 'Sunbeach','2222385874',false
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE nombre ILIKE 'Sunbeach');
INSERT INTO clientes(nombre, telefono, is_internal)
SELECT 'Fedex Devolución',null,false
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE nombre ILIKE 'Fedex%' OR nombre ILIKE '%Devoluc%');
INSERT INTO clientes(nombre, telefono, is_internal)
SELECT 'Ana Lucia',null,false
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE nombre ILIKE 'Ana Lucia' OR nombre ILIKE 'Ana Lucía');
INSERT INTO clientes(nombre, telefono, is_internal)
SELECT 'Elizabeth Prado','5544525825',false
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE nombre ILIKE 'Elizabeth Prado');
INSERT INTO clientes(nombre, telefono, is_internal)
SELECT 'Karla Sandoval',null,false
WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE nombre ILIKE 'Karla Sandoval');

-- 3) INSERT 42 ventas con ON CONFLICT (numero) DO NOTHING
DO $$
DECLARE
  v_shams uuid; v_mithra uuid; v_temple uuid;
  v_mariela uuid; v_iliana uuid; v_katiuska uuid;
  v_laura uuid; v_glendy uuid; v_sunbeach uuid;
  v_fedex uuid; v_analucia uuid; v_elizabeth uuid; v_karla uuid;
BEGIN
  SELECT id INTO v_shams     FROM clientes WHERE nombre ILIKE '%Shams%' LIMIT 1;
  SELECT id INTO v_mithra    FROM clientes WHERE nombre ILIKE '%Mithra%' LIMIT 1;
  SELECT id INTO v_temple    FROM clientes WHERE nombre ILIKE '%Temple%' LIMIT 1;
  SELECT id INTO v_mariela   FROM clientes WHERE nombre ILIKE '%Mariela%' LIMIT 1;
  SELECT id INTO v_iliana    FROM clientes WHERE nombre ILIKE '%Iliana%' OR nombre ILIKE '%Liliana%' LIMIT 1;
  SELECT id INTO v_katiuska  FROM clientes WHERE nombre ILIKE '%Katiuska%' LIMIT 1;
  SELECT id INTO v_laura     FROM clientes WHERE nombre ILIKE '%Laura Elena%' LIMIT 1;
  SELECT id INTO v_glendy    FROM clientes WHERE nombre ILIKE '%Glendy%' LIMIT 1;
  SELECT id INTO v_sunbeach  FROM clientes WHERE nombre ILIKE '%Sunbeach%' LIMIT 1;
  SELECT id INTO v_fedex     FROM clientes WHERE nombre ILIKE '%Fedex%' OR nombre ILIKE '%Devoluc%' LIMIT 1;
  SELECT id INTO v_analucia  FROM clientes WHERE nombre ILIKE '%Ana Lucia%' OR nombre ILIKE '%Ana Lucía%' LIMIT 1;
  SELECT id INTO v_elizabeth FROM clientes WHERE nombre ILIKE '%Elizabeth%' LIMIT 1;
  SELECT id INTO v_karla     FROM clientes WHERE nombre ILIKE '%Karla%' LIMIT 1;

  INSERT INTO ventas(
    cliente_id, numero, fecha,
    subtotal, iva, descuento,
    costo_productos, cantidad_pagada,
    costo_envio, estatus, notas
  ) VALUES
  (v_glendy,'PC-070925001-V-Glendy Escalante','2025-10-07',5694.58,0,0,1591.42,5694.58,510,'pagada_total','Cliente de Curso primer pedido'),
  (v_mithra,'PC-120625003-C-Mithra','2025-06-13',19676.91,3148.31,0,4556.78,22825.22,612.82,'pagada_total',null),
  (v_shams,'PC-170325003-C-Shams Bronceado Natural','2025-03-25',13526.00,2164.16,0,4497.31,15690.16,671,'pagada_total',null),
  (v_sunbeach,'PC-280525002-V-Sunbeach','2025-06-01',3354.61,0,0,737.55,3354.61,486.39,'pagada_total',null),
  (v_temple,'PC-020126002-V-The Temple Bronze','2026-01-12',6225.18,0,0,null,6225.18,null,'pagada_total',null),
  (v_temple,'PC-020126003-V-The Temple Bronze','2026-01-13',4119.69,659.15,802.73,null,3976.11,null,'pagada_total',null),
  (v_laura,'PC-030925001-C-Laura Elena','2025-09-03',17403.22,0,0,4895.75,17403.22,0,'pagada_total','Venta de Curso con 5% descuento / Pgo de FB Camp'),
  (v_shams,'PC-040425004-V-Shams Bronceado Natural','2025-03-25',8000.00,0,0,2552.63,8000.00,400.45,'pagada_total',null),
  (v_temple,'PC-040526005-V-The Temple Bronze','2026-05-04',4020.17,643.23,0,1043.16,4663.40,1014.26,'pagada_total','Envio caro con DHL'),
  (v_mithra,'PC-060425001-Mitra','2025-03-11',10340.69,1654.51,0,2722.39,10340.69,783,'pagada_parcial','Se le regalo el envío'),
  (v_shams,'PC-060625005-C-Shams Bronceado Natural','2025-06-06',54189.00,8670.24,0,16904.87,62859.24,1671.31,'pagada_total','Se perdio 6 Morango y se dividio el dinero'),
  (v_shams,'PC-071225009-V-Shams Bronceado Natural','2025-12-15',18127.51,0,0,16527.02,15844.51,479,'pendiente','Se le dio credito un Potencia 3.0 saldo pendiente $2242.82'),
  (v_shams,'PC-090226010-V-Shams Bronceado Natural','2026-02-09',7919.09,0,0,null,7919.09,null,'pagada_total',null),
  (v_mithra,'PC-090425002-V-Mithra','2025-06-11',21360.81,3417.73,0,5476.15,24778.54,582.82,'pagada_total',null),
  (v_shams,'PC-090625006-C-Shams Bronceado Natural','2025-06-09',9200.00,0,0,2110.69,9200.00,719.14,'pagada_total','Se le regalo el envío'),
  (v_analucia,'PC-100426001-V-Ana Lucia','2026-04-04',1235.74,0,0,null,1235.74,null,'pagada_total',null),
  (v_temple,'PC-110226003-V-The Temple Bronze','2026-02-11',3937.09,629.93,0,null,4567.02,null,'pagada_total',null),
  (v_temple,'PC-110226004-V-The Temple Bronze','2026-02-11',5825.49,0,0,null,5825.49,null,'pagada_total',null),
  (v_fedex,'PC-110625001-V-Perdidas','2025-06-11',8039.04,0,0,2080.53,8039.04,0,'pagada_total','Devolucion Fedex por 6 Activador Morango'),
  (v_iliana,'PC-120525001-Iliana del Angel','2025-05-13',15885.81,0,0,4656.97,15885.81,374.19,'pagada_total',null),
  (v_mariela,'PC-120625002-V-Mariela','2025-06-13',3150.00,0,0,1590.05,3150.00,0,'pagada_total','Sandra entrego en Pielcanela'),
  (v_shams,'PC-130226011-V-Shams Bronceado Natural','2026-02-13',7775.88,0,0,null,7775.88,null,'pagada_total',null),
  (v_mariela,'PC-130425001-V-Mariela','2025-04-18',11462.37,0,0,3140.63,11462.37,0,'pagada_total',null),
  (v_temple,'PC-130625001-V-The Temple Bronze -2','2025-06-13',2880.02,460.80,0,720.01,0,417.31,'pendiente','Pago en T1 Saldo a Favor $802.73'),
  (v_temple,'PC-130625001-V-The Temple Bronze-1','2025-06-13',3682.83,589.25,0,887.68,7954.83,417.31,'pagada_total','Pago el subtotal y el total'),
  (v_mithra,'PC-131025005-V-Mithra','2025-10-14',18547.69,2967.63,0,4444.59,21515.32,124.50,'pagada_total','Mithra dio el envio Benjamin pago el material'),
  (v_katiuska,'PC-150425001-V-Katiuska','2025-04-21',11415.85,1826.54,0,4438.68,13242.39,727.20,'pagada_total',null),
  (v_shams,'PC-151025007-V-Shams Bronceado Natural','2025-10-16',7165.33,0,0,1748.85,7165.33,null,'pagada_total',null),
  (v_mithra,'PC-151225006-V-Mithra','2025-12-16',20647.69,3303.63,0,null,23951.32,null,'pagada_total',null),
  (v_shams,'PC-180824002-V','2024-08-23',6551.00,0,0,1730.00,6551.00,null,'pagada_total',null),
  (v_shams,'PC-180824002-V-Sams Bronceado Natural','2025-03-06',15702.00,0,0,2585.57,15702.00,633,'pagada_total',null),
  (v_shams,'PC-190226012-V-Shams Bronceado Natural','2026-02-19',5991.88,0,0,null,5991.88,null,'pagada_total',null),
  (v_laura,'PC-190426002-V-Laura Elena','2026-04-19',1500.00,0,0,748.17,1500.00,null,'pagada_total',null),
  (v_shams,'PC-190825006-C-Shams Bronceado Natural','2025-09-20',25584.87,0,0,9324.98,25584.87,null,'pagada_total',null),
  (v_mithra,'PC-200226007-V-Mithra','2026-02-23',19147.69,3063.63,0,null,22211.32,null,'pagada_total',null),
  (v_karla,'PC-210426001-V-Karla Sandoval','2026-04-21',13775.68,0,0,null,13775.68,null,'pagada_total',null),
  (v_iliana,'PC-210625002-C-Liliana del Angel','2025-06-21',2805.54,0,0,957.16,2805.54,397.58,'pagada_total',null),
  (v_shams,'PC-250326013-V-Shams Bronceado Natural','2026-03-25',11438.98,0,0,null,11438.98,null,'pagada_total',null),
  (v_mithra,'PC-270825004-V-Mithra','2025-08-27',9648.99,1543.84,0,2348.56,11192.83,140,'pagada_total','Pago envio con su guia personal'),
  (v_shams,'PC-281025008-V-Shams Bronceado Natural','2025-10-28',5991.88,0,0,1497.97,5991.88,null,'pagada_total',null),
  (v_elizabeth,'PC-301025001-V-Elizabeth Prado','2025-10-30',4200.00,0,0,2055.41,4200.00,null,'pagada_total',null),
  (v_mithra,'PC-310326008-V-Mithra','2026-03-31',18874.86,0,0,null,18874.86,null,'pagada_total',null)
  ON CONFLICT (numero) DO NOTHING;
END $$;

-- 4) Items via upsert (idempotente)
SELECT upsert_venta_item('PC-070925001-V-Glendy Escalante','Morango Bronze',1,1339.84,1339.84);
SELECT upsert_venta_item('PC-070925001-V-Glendy Escalante','Café Fit',1,1497.97,1497.97);
SELECT upsert_venta_item('PC-070925001-V-Glendy Escalante','Potencia Maxima 2.0',1,1956.77,1956.77);
SELECT upsert_venta_item('PC-070925001-V-Glendy Escalante','Verde-e',1,150,150);
SELECT upsert_venta_item('PC-070925001-V-Glendy Escalante','Conejita Roja-e',1,150,150);
SELECT upsert_venta_item('PC-070925001-V-Glendy Escalante','Marrom-e',1,150,150);
SELECT upsert_venta_item('PC-070925001-V-Glendy Escalante','Conejita Roja-c9',1,150,150);
SELECT upsert_venta_item('PC-070925001-V-Glendy Escalante','AnimalPrint Beige-c9',1,150,150);
SELECT upsert_venta_item('PC-070925001-V-Glendy Escalante','Cinta Brasil',1,150,150);
SELECT upsert_venta_item('PC-120625003-C-Mithra','Choco Paty',2,1407.47,2814.94);
SELECT upsert_venta_item('PC-120625003-C-Mithra','Potência Ultra',2,2058.93,4117.86);
SELECT upsert_venta_item('PC-120625003-C-Mithra','Potência 3.0',3,2302.05,6906.15);
SELECT upsert_venta_item('PC-120625003-C-Mithra','Ametista UV 1',2,2164.49,4328.98);
SELECT upsert_venta_item('PC-120625003-C-Mithra','Ametista UV II',1,1508.98,1508.98);
SELECT upsert_venta_item('PC-170325003-C-Shams Bronceado Natural','Potência 3.0',2,2300,4600);
SELECT upsert_venta_item('PC-170325003-C-Shams Bronceado Natural','Ametista UV 1',2,2190,4380);
SELECT upsert_venta_item('PC-170325003-C-Shams Bronceado Natural','Ametista UV II',2,1523,3046);
SELECT upsert_venta_item('PC-170325003-C-Shams Bronceado Natural','Cinta Verde oscuro',2,150,300);
SELECT upsert_venta_item('PC-170325003-C-Shams Bronceado Natural','Cinta Besos rojos',2,150,300);
SELECT upsert_venta_item('PC-170325003-C-Shams Bronceado Natural','Cinta Chiles',2,150,300);
SELECT upsert_venta_item('PC-170325003-C-Shams Bronceado Natural','Cinta Vaca',2,150,300);
SELECT upsert_venta_item('PC-170325003-C-Shams Bronceado Natural','Cinta Corazones',2,150,300);
SELECT upsert_venta_item('PC-280525002-V-Sunbeach','Morango Bronze',1,1406.61,1406.61);
SELECT upsert_venta_item('PC-280525002-V-Sunbeach','Potência Ultra',1,1948,1948);
SELECT upsert_venta_item('PC-020126002-V-The Temple Bronze','Morango Bronze',1,1339.84,1339.84);
SELECT upsert_venta_item('PC-020126002-V-The Temple Bronze','Choco Paty',1,1339.84,1339.84);
SELECT upsert_venta_item('PC-020126002-V-The Temple Bronze','Ametista UV II',1,1440.01,1440.01);
SELECT upsert_venta_item('PC-020126002-V-The Temple Bronze','OX 30 Vol. Morango',1,869.69,869.69);
SELECT upsert_venta_item('PC-020126002-V-The Temple Bronze','Pó Morango',1,1235.79,1235.79);
SELECT upsert_venta_item('PC-020126003-V-The Temple Bronze','Morango Bronze',1,1339.84,1339.84);
SELECT upsert_venta_item('PC-020126003-V-The Temple Bronze','Choco Paty',1,1339.84,1339.84);
SELECT upsert_venta_item('PC-020126003-V-The Temple Bronze','Ametista UV II',1,1440.01,1440.01);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','Hidrat. Pêssego',1,1286,1286);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','Potência 3.0',1,2242.82,2242.82);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','Potencia Maxima 2.0',1,1956.77,1956.77);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','Óleo iluminador',1,1092.25,1092.25);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','Dolomita',1,620.29,620.29);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','Argila Branca',1,636.85,636.85);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','Esfol. Morango',1,937.84,937.84);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','Ametista UV 1',1,2112.72,2112.72);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','Ametista UV II',1,1440.01,1440.01);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','Pêssego Bronze',1,1340.16,1340.16);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','OX 30 Vol. Morango',1,869.69,869.69);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','Pó Morango',1,1235.79,1235.79);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','Café Fit',1,1497.97,1497.97);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','Besos rojos💋-c12',1,150,150);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','Minie Mouse-c12',1,150,150);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','Corazones ♥️-e',1,150,150);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','Rosa flor blanca negra-e',1,150,150);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','AnimalPrint Beige-c9',1,150,150);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','AnimalPrint Morado-c9',1,150,150);
SELECT upsert_venta_item('PC-030925001-C-Laura Elena','Ojos 🧿c9',1,150,150);
SELECT upsert_venta_item('PC-040425004-V-Shams Bronceado Natural','Choco Paty',4,1420,5680);
SELECT upsert_venta_item('PC-040425004-V-Shams Bronceado Natural','Morango Bronze',1,1420,1420);
SELECT upsert_venta_item('PC-040425004-V-Shams Bronceado Natural','Cinta Verde claro',2,150,300);
SELECT upsert_venta_item('PC-040425004-V-Shams Bronceado Natural','Cinta Naranja',2,150,300);
SELECT upsert_venta_item('PC-040425004-V-Shams Bronceado Natural','Cinta Amarilla clara',2,150,300);
SELECT upsert_venta_item('PC-040526005-V-The Temple Bronze','Pêssego Bronze',2,1340.16,2680.33);
SELECT upsert_venta_item('PC-040526005-V-The Temple Bronze','Morango Bronze',1,1339.84,1339.84);
SELECT upsert_venta_item('PC-060425001-Mitra','Café Fit',1,1565.80,1565.80);
SELECT upsert_venta_item('PC-060425001-Mitra','Morango Bronze',1,1407.47,1407.47);
SELECT upsert_venta_item('PC-060425001-Mitra','Potência 3.0',1,2302.05,2302.05);
SELECT upsert_venta_item('PC-060425001-Mitra','Potência Ultra',1,2058.93,2058.93);
SELECT upsert_venta_item('PC-060425001-Mitra','Ametista UV 1',1,2164.49,2164.49);
SELECT upsert_venta_item('PC-060425001-Mitra','Cinta Animal print-amarilla',1,168.39,168.39);
SELECT upsert_venta_item('PC-060425001-Mitra','Cinta Cebra roja',1,168.39,168.39);
SELECT upsert_venta_item('PC-060425001-Mitra','Cinta Besos rojos',1,168.39,168.39);
SELECT upsert_venta_item('PC-060425001-Mitra','Cinta Estrella roja',1,168.39,168.39);
SELECT upsert_venta_item('PC-060425001-Mitra','Cinta Animal print-rosa blanca',1,168.39,168.39);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Café Fit',6,1420,8520);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Choco Paty',6,1420,8520);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Morango Bronze',6,1420,8520);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Ametista UV 1',4,2190,8760);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Ametista UV II',3,1523,4569);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Rosa-c12',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Vermelha-12',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Roxadb-c9',6,150,900);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Animal print-amarilla-c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Fundo do mar-c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Cereja-c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Pimenta-c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Flowers-c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Conejita Roja-c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Conejita negra-c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Malhada-c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Corazones🤍-c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Vermelha-c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Azul-c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Preta-c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Azul Clara-c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Marrom-c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Oro-c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Verde-c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Rosa-c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Azul-e',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Azul Clara-e',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Verde-e',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Rosa-e',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Oro-e',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Fundo do mar-e',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Cereja-e',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Flowers-e',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Mariposa morada 🦋-ce',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','AnimalPrint Morado-ce',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Ojos 🧿-ce',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','Blanca -c9',3,150,450);
SELECT upsert_venta_item('PC-060625005-C-Shams Bronceado Natural','AnimalPrint Beige-c9',3,150,450);
SELECT upsert_venta_item('PC-071225009-V-Shams Bronceado Natural','Ametista UV 1',2,2112.72,4225.45);
SELECT upsert_venta_item('PC-071225009-V-Shams Bronceado Natural','Morango Bronze',2,1339.84,2679.68);
SELECT upsert_venta_item('PC-071225009-V-Shams Bronceado Natural','Potência 3.0',3,2242.82,6728.47);
SELECT upsert_venta_item('PC-071225009-V-Shams Bronceado Natural','Café Fit',3,1497.97,4493.91);
SELECT upsert_venta_item('PC-090226010-V-Shams Bronceado Natural','Café Fit',2,1497.97,2995.94);
SELECT upsert_venta_item('PC-090226010-V-Shams Bronceado Natural','Potência 3.0',1,2242.82,2242.82);
SELECT upsert_venta_item('PC-090226010-V-Shams Bronceado Natural','Pêssego Bronze',2,1340.16,2680.33);
SELECT upsert_venta_item('PC-090425002-V-Mithra','Choco Paty',2,1407.47,2814.94);
SELECT upsert_venta_item('PC-090425002-V-Mithra','Potência Ultra',2,2058.93,4117.86);
SELECT upsert_venta_item('PC-090425002-V-Mithra','Potência 3.0',3,2302.05,6906.15);
SELECT upsert_venta_item('PC-090425002-V-Mithra','Ametista UV 1',2,2164.49,4328.98);
SELECT upsert_venta_item('PC-090425002-V-Mithra','Ametista UV II',1,1508.98,1508.98);
SELECT upsert_venta_item('PC-090425002-V-Mithra','Cinta Corazones',2,168.39,336.78);
SELECT upsert_venta_item('PC-090425002-V-Mithra','Cinta Animal print café',2,168.39,336.78);
SELECT upsert_venta_item('PC-090425002-V-Mithra','Cinta Animal print-amarilla',2,168.39,336.78);
SELECT upsert_venta_item('PC-090425002-V-Mithra','Cinta Animal print-rosa blanca',2,168.39,336.78);
SELECT upsert_venta_item('PC-090425002-V-Mithra','Cinta Cebra roja',2,168.39,336.78);
SELECT upsert_venta_item('PC-090625006-C-Shams Bronceado Natural','Potência 3.0',4,2300,9200);
SELECT upsert_venta_item('PC-100426001-V-Ana Lucia','Choco Paty',1,1235.74,1235.74);
SELECT upsert_venta_item('PC-110226003-V-The Temple Bronze','Potência Ultra',1,1980.32,1980.32);
SELECT upsert_venta_item('PC-110226003-V-The Temple Bronze','Potencia Maxima 2.0',1,1956.77,1956.77);
SELECT upsert_venta_item('PC-110226004-V-The Temple Bronze','Potência 3.0',2,2242.82,4485.65);
SELECT upsert_venta_item('PC-110226004-V-The Temple Bronze','Morango Bronze',1,1339.84,1339.84);
SELECT upsert_venta_item('PC-110625001-V-Perdidas','Morango Bronze',6,1339.84,8039.04);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','OX 30 Vol. Morango',1,883.58,883.58);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','OX 40 Vol. Chocolate',1,883.58,883.58);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','Soft Ox 40 Vol Neutro',1,930.24,930.24);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','Ox 20 Vol. Camomila',1,1342.44,1342.44);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','Pó Morango',1,1237.93,1237.93);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','Pó Chocolate',1,1237.93,1237.93);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','Pó Desc. Camomila',1,1122.89,1122.89);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','Soft Pó Desc. Neutro',1,1237.76,1237.76);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','Aerografía Rosa BaruK',1,5458.56,5458.56);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','Cinta Louis Vuitton',1,155.09,155.09);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','Cinta Animal print-amarilla',2,155.09,310.18);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','Cinta Animal print café',1,155.09,155.09);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','Cinta Brasil',1,155.09,155.09);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','Cinta Negro',1,155.09,155.09);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','Cinta Estrella roja',1,155.09,155.09);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','Cinta Conejita negra',1,155.09,155.09);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','Cinta Amarilla clara',1,155.09,155.09);
SELECT upsert_venta_item('PC-120525001-Iliana del Angel','Cinta Blanca',1,155.09,155.09);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Besos rojos💋-c9',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Roja Punto Blanco⚪️-c9',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Animal print-amarilla-c9',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Pimenta-c9',2,150,300);
SELECT upsert_venta_item('PC-120625002-V-Mariela','AnimalPrint Beige-c9',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Conejita rosada-c9',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Fundo do mar-c9',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Gucci-c9',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Corazones ♥️-c9',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Cinta Blanca',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Rosa-e',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Turquesa-e',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Conejita rosada-e',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Tigresa-e',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Malhada-e',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Fundo do mar-e',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Cereja-e',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Pimenta-e',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Cinta Naranja',1,150,150);
SELECT upsert_venta_item('PC-120625002-V-Mariela','Barbie-ce',1,150,150);
SELECT upsert_venta_item('PC-130226011-V-Shams Bronceado Natural','Ametista UV 1',1,2112.72,2112.72);
SELECT upsert_venta_item('PC-130226011-V-Shams Bronceado Natural','Ametista UV II',1,1440.01,1440.01);
SELECT upsert_venta_item('PC-130226011-V-Shams Bronceado Natural','Potência Ultra',1,1980.32,1980.32);
SELECT upsert_venta_item('PC-130226011-V-Shams Bronceado Natural','Potência 3.0',1,2242.82,2242.82);
SELECT upsert_venta_item('PC-130226011-V-Shams Bronceado Natural','Gucci-e',1,150,150);
SELECT upsert_venta_item('PC-130226011-V-Shams Bronceado Natural','Gucci-c9',1,150,150);
SELECT upsert_venta_item('PC-130226011-V-Shams Bronceado Natural','Animal print-amarilla-e',1,150,150);
SELECT upsert_venta_item('PC-130226011-V-Shams Bronceado Natural','Louis Vuitton-e',1,150,150);
SELECT upsert_venta_item('PC-130425001-V-Mariela','Potencia Maxima 2.0',1,2029.32,2029.32);
SELECT upsert_venta_item('PC-130425001-V-Mariela','Potência Ultra',1,2056.73,2056.73);
SELECT upsert_venta_item('PC-130425001-V-Mariela','Ametista UV 1',1,2166.53,2166.53);
SELECT upsert_venta_item('PC-130425001-V-Mariela','Ametista UV II',1,1505.77,1505.77);
SELECT upsert_venta_item('PC-130425001-V-Mariela','Morango Bronze',1,1404.02,1404.02);
SELECT upsert_venta_item('PC-130425001-V-Mariela','Cinta Louis Vuitton',2,150,300);
SELECT upsert_venta_item('PC-130425001-V-Mariela','Cinta Animal print-amarilla',2,150,300);
SELECT upsert_venta_item('PC-130425001-V-Mariela','Cinta Negro',2,150,300);
SELECT upsert_venta_item('PC-130425001-V-Mariela','Cinta Chiles',2,150,300);
SELECT upsert_venta_item('PC-130425001-V-Mariela','Cinta Blanca',2,150,300);
SELECT upsert_venta_item('PC-130425001-V-Mariela','Sombrilla con proteccion Rayo UV',1,800,800);
SELECT upsert_venta_item('PC-130625001-V-The Temple Bronze -2','Ametista UV II',2,1440.01,2880.02);
SELECT upsert_venta_item('PC-130625001-V-The Temple Bronze-1','Potência 3.0',1,2242.82,2242.82);
SELECT upsert_venta_item('PC-130625001-V-The Temple Bronze-1','Ametista UV II',1,1440.01,1440.01);
SELECT upsert_venta_item('PC-131025005-V-Mithra','Café Fit',2,1497.97,2995.94);
SELECT upsert_venta_item('PC-131025005-V-Mithra','Potência Ultra',2,1980.32,3960.64);
SELECT upsert_venta_item('PC-131025005-V-Mithra','Potência 3.0',2,2242.82,4485.65);
SELECT upsert_venta_item('PC-131025005-V-Mithra','Ametista UV 1',2,2112.72,4225.45);
SELECT upsert_venta_item('PC-131025005-V-Mithra','Ametista UV II',2,1440.01,2880.02);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Pêssego Bronze',1,1340.16,1340.16);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','OX 30 Vol. Morango',1,869.69,869.69);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','OX 40 Vol. Chocolate',1,869.69,869.69);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Ox 20 Vol. Camomila',1,1351.91,1351.91);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Pó Morango',1,1235.79,1235.79);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Pó Chocolate',1,1235.74,1235.74);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Pó Desc. Camomila',1,1109.74,1109.74);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Cinta Rosas negro amarillo',1,150,150);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Cinta Negro',1,150,150);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Cinta Blanca',1,150,150);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Cinta Verde neón',3,150,450);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Cinta Animal print café',2,150,300);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Cinta Conejita rosada',1,150,150);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Cinta Flor negra con blanca',1,150,150);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Cinta Besos rojos',1,150,150);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Cinta Louis Vuitton',1,150,150);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Cinta Brasil',3,150,450);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Cinta Estrella roja',1,150,150);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Cinta Corazones',2,150,300);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Cinta Azul oscuro',2,150,300);
SELECT upsert_venta_item('PC-150425001-V-Katiuska','Cinta Naranja',2,150,300);
SELECT upsert_venta_item('PC-151025007-V-Shams Bronceado Natural','Morango Bronze',2,1339.84,2679.68);
SELECT upsert_venta_item('PC-151025007-V-Shams Bronceado Natural','Potência 3.0',2,2242.82,4485.65);
SELECT upsert_venta_item('PC-151225006-V-Mithra','Ametista UV 1',2,2112.72,4225.45);
SELECT upsert_venta_item('PC-151225006-V-Mithra','Ametista UV II',2,1440.01,2880.02);
SELECT upsert_venta_item('PC-151225006-V-Mithra','Potência 3.0',2,2242.82,4485.65);
SELECT upsert_venta_item('PC-151225006-V-Mithra','Potência Ultra',2,1980.32,3960.64);
SELECT upsert_venta_item('PC-151225006-V-Mithra','Café Fit',2,1497.97,2995.94);
SELECT upsert_venta_item('PC-151225006-V-Mithra','Corazones⚫️❤️-c9',2,150,300);
SELECT upsert_venta_item('PC-151225006-V-Mithra','AnimalPrint Morado-c9',2,150,300);
SELECT upsert_venta_item('PC-151225006-V-Mithra','Ojos 🧿c9',2,150,300);
SELECT upsert_venta_item('PC-151225006-V-Mithra','Tigresa-c9',2,150,300);
SELECT upsert_venta_item('PC-151225006-V-Mithra','Malhada-c9',2,150,300);
SELECT upsert_venta_item('PC-151225006-V-Mithra','Animal print-amarilla-c9',2,150,300);
SELECT upsert_venta_item('PC-151225006-V-Mithra','Corazones🤍-c9',2,150,300);
SELECT upsert_venta_item('PC-180824002-V','Cinta Amarilla clara',1,150,150);
SELECT upsert_venta_item('PC-180824002-V','Cinta Naranja',1,150,150);
SELECT upsert_venta_item('PC-180824002-V','Cinta Negro',1,150,150);
SELECT upsert_venta_item('PC-180824002-V','Choco Paty',1,1333,1333);
SELECT upsert_venta_item('PC-180824002-V','Café Fit',1,1483,1483);
SELECT upsert_venta_item('PC-180824002-V','Morango Bronze',1,1333,1333);
SELECT upsert_venta_item('PC-180824002-V','Potência Ultra',1,1952,1952);
SELECT upsert_venta_item('PC-180824002-V-Sams Bronceado Natural','Potência Ultra',2,2080,4160);
SELECT upsert_venta_item('PC-180824002-V-Sams Bronceado Natural','Café Fit',2,1581,3162);
SELECT upsert_venta_item('PC-180824002-V-Sams Bronceado Natural','Choco Paty',2,1420,2840);
SELECT upsert_venta_item('PC-180824002-V-Sams Bronceado Natural','Morango Bronze',2,1420,2840);
SELECT upsert_venta_item('PC-180824002-V-Sams Bronceado Natural','Cinta Roja',2,150,300);
SELECT upsert_venta_item('PC-180824002-V-Sams Bronceado Natural','Cinta Blanca',2,150,300);
SELECT upsert_venta_item('PC-180824002-V-Sams Bronceado Natural','Cinta Naranja',2,150,300);
SELECT upsert_venta_item('PC-180824002-V-Sams Bronceado Natural','Cinta Conejita negra',2,150,300);
SELECT upsert_venta_item('PC-180824002-V-Sams Bronceado Natural','Cinta Conejita rosada',2,150,300);
SELECT upsert_venta_item('PC-180824002-V-Sams Bronceado Natural','Cinta Louis Vuitton',2,150,300);
SELECT upsert_venta_item('PC-180824002-V-Sams Bronceado Natural','Cinta Rombos negros-blanco',2,150,300);
SELECT upsert_venta_item('PC-180824002-V-Sams Bronceado Natural','Cinta Chiles',2,150,300);
SELECT upsert_venta_item('PC-180824002-V-Sams Bronceado Natural','Cinta Estrella roja',2,150,300);
SELECT upsert_venta_item('PC-190226012-V-Shams Bronceado Natural','Café Fit',4,1497.97,5991.88);
SELECT upsert_venta_item('PC-190426002-V-Laura Elena','Oro-c12',1,150,150);
SELECT upsert_venta_item('PC-190426002-V-Laura Elena','Vermelha-e',1,150,150);
SELECT upsert_venta_item('PC-190426002-V-Laura Elena','Estrella azul⭐️-c9',1,150,150);
SELECT upsert_venta_item('PC-190426002-V-Laura Elena','AnimalPrint Beige-ce',1,150,150);
SELECT upsert_venta_item('PC-190426002-V-Laura Elena','Azul Clara-c9',1,150,150);
SELECT upsert_venta_item('PC-190426002-V-Laura Elena','Blanca Corazon ♥️pequeño-c9',1,150,150);
SELECT upsert_venta_item('PC-190426002-V-Laura Elena','Roja Punto Blanco⚪️-c9',1,150,150);
SELECT upsert_venta_item('PC-190426002-V-Laura Elena','Fuccia-e',1,150,150);
SELECT upsert_venta_item('PC-190426002-V-Laura Elena','Rosa flor blanca negra-9',1,150,150);
SELECT upsert_venta_item('PC-190426002-V-Laura Elena','Cinta Amarilla clara',1,150,150);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Potência Ultra',3,1980.32,5940.95);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Café Fit',3,1497.97,4493.91);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Barbie-ce',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Ojos 🧿-ce',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Cinta Conejita rosada',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Corazones ♥️-e',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Mariposa morada 🦋-ce',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Rosa-e',4,150,600);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Verde-e',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Turquesa-e',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Azul-e',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Azul Clara-e',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Pimenta-e',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Cereja-e',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Fundo do mar-e',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Flowers-e',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','AnimalPrint Morado-ce',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Estrella azul⭐️-ce',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Animal print-amarilla-e',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Corazones🤍-ce',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Rosa-c9',4,150,600);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Preta-c9',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Azul-c9',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Azul Clara-c9',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Blanca -c9',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Vermelha-c9',6,150,900);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Roxadb-c9',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Ojos 🧿c9',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Blanca Corazon ♥️pequeño-c9',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Corazones🤍-c9',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Rombos negros-blanco-c9',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Conejita rosada-c9',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Corazones ♥️-c9',3,150,450);
SELECT upsert_venta_item('PC-190825006-C-Shams Bronceado Natural','Roja Punto Blanco⚪️-c9',3,150,450);
SELECT upsert_venta_item('PC-200226007-V-Mithra','Animal print-amarilla-c12',1,150,150);
SELECT upsert_venta_item('PC-200226007-V-Mithra','Conejita Roja-c12',1,150,150);
SELECT upsert_venta_item('PC-200226007-V-Mithra','Besos rojos💋-c12',1,150,150);
SELECT upsert_venta_item('PC-200226007-V-Mithra','Conejita rosada-c12',1,150,150);
SELECT upsert_venta_item('PC-200226007-V-Mithra','Café Fit',2,1497.97,2995.94);
SELECT upsert_venta_item('PC-200226007-V-Mithra','Potência Ultra',2,1980.32,3960.64);
SELECT upsert_venta_item('PC-200226007-V-Mithra','Potência 3.0',2,2242.82,4485.65);
SELECT upsert_venta_item('PC-200226007-V-Mithra','Ametista UV 1',2,2112.72,4225.45);
SELECT upsert_venta_item('PC-200226007-V-Mithra','Ametista UV II',2,1440.01,2880.02);
SELECT upsert_venta_item('PC-210426001-V-Karla Sandoval','Cinta Vaca',1,150,150);
SELECT upsert_venta_item('PC-210426001-V-Karla Sandoval','Cinta Louis Vuitton',1,150,150);
SELECT upsert_venta_item('PC-210426001-V-Karla Sandoval','Cinta Conejita rosada',1,150,150);
SELECT upsert_venta_item('PC-210426001-V-Karla Sandoval','Cinta Animal print-rosa blanca',1,150,150);
SELECT upsert_venta_item('PC-210426001-V-Karla Sandoval','Cinta Conejita negra',1,150,150);
SELECT upsert_venta_item('PC-210426001-V-Karla Sandoval','Fuccia-e',1,150,150);
SELECT upsert_venta_item('PC-210426001-V-Karla Sandoval','Oro-c9',1,150,150);
SELECT upsert_venta_item('PC-210426001-V-Karla Sandoval','Blanca -c9',2,150,300);
SELECT upsert_venta_item('PC-210426001-V-Karla Sandoval','Óleo iluminador',1,1092.25,1092.25);
SELECT upsert_venta_item('PC-210426001-V-Karla Sandoval','OX 30 Vol. Morango',1,869.69,869.69);
SELECT upsert_venta_item('PC-210426001-V-Karla Sandoval','Pó Morango',1,1235.79,1235.79);
SELECT upsert_venta_item('PC-210426001-V-Karla Sandoval','OX 40 Vol. Chocolate',1,869.69,869.69);
SELECT upsert_venta_item('PC-210426001-V-Karla Sandoval','Pó Chocolate',1,1235.74,1235.74);
SELECT upsert_venta_item('PC-210426001-V-Karla Sandoval','Potência 3.0',1,2242.82,2242.82);
SELECT upsert_venta_item('PC-210426001-V-Karla Sandoval','Choco Paty',1,1339.84,1339.84);
SELECT upsert_venta_item('PC-210426001-V-Karla Sandoval','Morango Bronze',1,1339.84,1339.84);
SELECT upsert_venta_item('PC-210426001-V-Karla Sandoval','Sombrilla con proteccion Rayo UV',2,1100,2200);
SELECT upsert_venta_item('PC-210625002-C-Liliana del Angel','Esfol. Chocolate',1,937.84,937.84);
SELECT upsert_venta_item('PC-210625002-C-Liliana del Angel','Óleo iluminador',1,1092.25,1092.25);
SELECT upsert_venta_item('PC-210625002-C-Liliana del Angel','Cereja-e',1,155.09,155.09);
SELECT upsert_venta_item('PC-210625002-C-Liliana del Angel','Pimenta-e',1,155.09,155.09);
SELECT upsert_venta_item('PC-210625002-C-Liliana del Angel','Poker♠️-e',1,155.09,155.09);
SELECT upsert_venta_item('PC-210625002-C-Liliana del Angel','Corazones ♥️-e',1,155.09,155.09);
SELECT upsert_venta_item('PC-210625002-C-Liliana del Angel','Besos rojos💋-e',1,155.09,155.09);
SELECT upsert_venta_item('PC-250326013-V-Shams Bronceado Natural','Pimenta-c9',3,150,450);
SELECT upsert_venta_item('PC-250326013-V-Shams Bronceado Natural','Barbie-c9',2,150,300);
SELECT upsert_venta_item('PC-250326013-V-Shams Bronceado Natural','Besos rojos💋-c9',2,150,300);
SELECT upsert_venta_item('PC-250326013-V-Shams Bronceado Natural','Turquesa-c9',2,150,300);
SELECT upsert_venta_item('PC-250326013-V-Shams Bronceado Natural','Rosa-c9',3,150,450);
SELECT upsert_venta_item('PC-250326013-V-Shams Bronceado Natural','Verde-c9',3,150,450);
SELECT upsert_venta_item('PC-250326013-V-Shams Bronceado Natural','Tigresa-c9',2,150,300);
SELECT upsert_venta_item('PC-250326013-V-Shams Bronceado Natural','Animal print-amarilla-c9',2,150,300);
SELECT upsert_venta_item('PC-250326013-V-Shams Bronceado Natural','Fundo do mar-c9',2,150,300);
SELECT upsert_venta_item('PC-250326013-V-Shams Bronceado Natural','Estrella azul⭐️-c9',2,150,300);
SELECT upsert_venta_item('PC-250326013-V-Shams Bronceado Natural','Rosa-c12',2,150,300);
SELECT upsert_venta_item('PC-250326013-V-Shams Bronceado Natural','Roxadb-c12',2,150,300);
SELECT upsert_venta_item('PC-250326013-V-Shams Bronceado Natural','Turquesa-c12',2,150,300);
SELECT upsert_venta_item('PC-250326013-V-Shams Bronceado Natural','Ametista UV 1',1,2112.72,2112.72);
SELECT upsert_venta_item('PC-250326013-V-Shams Bronceado Natural','Potência Ultra',1,1980.32,1980.32);
SELECT upsert_venta_item('PC-250326013-V-Shams Bronceado Natural','Café Fit',2,1497.97,2995.94);
SELECT upsert_venta_item('PC-270825004-V-Mithra','Potência 3.0',1,2302.05,2302.05);
SELECT upsert_venta_item('PC-270825004-V-Mithra','Ametista UV 1',2,2164.49,4328.98);
SELECT upsert_venta_item('PC-270825004-V-Mithra','Ametista UV II',2,1508.98,3017.96);
SELECT upsert_venta_item('PC-281025008-V-Shams Bronceado Natural','Café Fit',4,1497.97,5991.88);
SELECT upsert_venta_item('PC-301025001-V-Elizabeth Prado','Flowers-c9',2,150,300);
SELECT upsert_venta_item('PC-301025001-V-Elizabeth Prado','Mariposa morada 🦋-c9',2,150,300);
SELECT upsert_venta_item('PC-301025001-V-Elizabeth Prado','Conejita Roja-c9',2,150,300);
SELECT upsert_venta_item('PC-301025001-V-Elizabeth Prado','Poker♠️-c9',2,150,300);
SELECT upsert_venta_item('PC-301025001-V-Elizabeth Prado','Louis Vuitton-c9',2,150,300);
SELECT upsert_venta_item('PC-301025001-V-Elizabeth Prado','Minie Mouse-c9',2,150,300);
SELECT upsert_venta_item('PC-301025001-V-Elizabeth Prado','Pimenta-c9',2,150,300);
SELECT upsert_venta_item('PC-301025001-V-Elizabeth Prado','Rosa-e',2,150,300);
SELECT upsert_venta_item('PC-301025001-V-Elizabeth Prado','Azul Clara-e',2,150,300);
SELECT upsert_venta_item('PC-301025001-V-Elizabeth Prado','Cinta Azul oscuro',2,150,300);
SELECT upsert_venta_item('PC-301025001-V-Elizabeth Prado','Roxadb-e',2,150,300);
SELECT upsert_venta_item('PC-301025001-V-Elizabeth Prado','Conejita negra-e',2,150,300);
SELECT upsert_venta_item('PC-301025001-V-Elizabeth Prado','Rombo negro-rojo-e',2,150,300);
SELECT upsert_venta_item('PC-301025001-V-Elizabeth Prado','Diablo morado 😈-e',2,150,300);
SELECT upsert_venta_item('PC-310326008-V-Mithra','Café Fit',2,1407.47,2814.94);
SELECT upsert_venta_item('PC-310326008-V-Mithra','Potência 3.0',2,2058.93,4117.86);
SELECT upsert_venta_item('PC-310326008-V-Mithra','Potência Ultra',2,2302.05,4604.10);
SELECT upsert_venta_item('PC-310326008-V-Mithra','Ametista UV 1',2,2164.49,4328.98);
SELECT upsert_venta_item('PC-310326008-V-Mithra','Ametista UV II',1,1508.98,1508.98);
SELECT upsert_venta_item('PC-310326008-V-Mithra','Poker♠️-c12',1,150,150);
SELECT upsert_venta_item('PC-310326008-V-Mithra','Diablo morado 😈-c12',1,150,150);
SELECT upsert_venta_item('PC-310326008-V-Mithra','Louis Vuitton-c12',1,150,150);
SELECT upsert_venta_item('PC-310326008-V-Mithra','AnimalPrint Morado-c9',2,150,300);
SELECT upsert_venta_item('PC-310326008-V-Mithra','Animal print-amarilla-c9',3,150,450);
SELECT upsert_venta_item('PC-310326008-V-Mithra','Roja Punto Blanco⚪️-c9',2,150,300);

-- 5) venta_socios 50/50 (sin porcentaje, sin duplicados)
INSERT INTO venta_socios(venta_id, socio_id, monto)
SELECT v.id, '4f21084b-dfe9-45f3-be80-935dc1a5e7a5', COALESCE(v.total,0)/2
FROM ventas v
WHERE NOT EXISTS (
  SELECT 1 FROM venta_socios vs
  WHERE vs.venta_id = v.id AND vs.socio_id = '4f21084b-dfe9-45f3-be80-935dc1a5e7a5'
);
INSERT INTO venta_socios(venta_id, socio_id, monto)
SELECT v.id, '3165fe33-c760-4373-84d0-e1cd14d863b3', COALESCE(v.total,0)/2
FROM ventas v
WHERE NOT EXISTS (
  SELECT 1 FROM venta_socios vs
  WHERE vs.venta_id = v.id AND vs.socio_id = '3165fe33-c760-4373-84d0-e1cd14d863b3'
);

-- 6) Verificación
SELECT 'Ventas' AS tabla, COUNT(*) AS total FROM ventas
UNION ALL SELECT 'Items', COUNT(*) FROM venta_items
UNION ALL SELECT 'Socios', COUNT(*) FROM venta_socios;

SELECT SUM(cantidad) AS total_unidades FROM venta_items;

DROP FUNCTION IF EXISTS upsert_venta_item(text,text,integer,numeric,numeric);
