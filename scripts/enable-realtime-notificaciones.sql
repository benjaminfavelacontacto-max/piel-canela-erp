-- ═══════════════════════════════════════════════════════════════════
-- Habilitar Realtime para la tabla `notificaciones`
--
-- En Vercel/producción, las notificaciones del portal /order no llegan
-- al dashboard en tiempo real. El polling de 10s sí las captura como
-- fallback, pero queremos Realtime para entrega instantánea.
--
-- Ejecutar UNA VEZ en Supabase SQL Editor del proyecto szjzaajjpuomvpnghvzu
-- ═══════════════════════════════════════════════════════════════════

-- 1) Ver tablas actualmente en supabase_realtime publication
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- 2) Si `notificaciones` no aparece arriba → añadirla:
-- (No falla si ya está añadida)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notificaciones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notificaciones;
    RAISE NOTICE 'notificaciones añadida a supabase_realtime';
  ELSE
    RAISE NOTICE 'notificaciones ya estaba en supabase_realtime';
  END IF;
END $$;

-- 3) REPLICA IDENTITY FULL para que el payload de INSERT incluya
-- TODAS las columnas (necesario para que el client reciba `datos` jsonb)
ALTER TABLE notificaciones REPLICA IDENTITY FULL;

-- 4) Verificar
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'notificaciones';
-- Debe regresar 1 fila

-- ALTERNATIVA via Dashboard (UI):
-- Supabase Dashboard → Database → Replication
-- → Encuentra "supabase_realtime"
-- → Toggle ON para la tabla "notificaciones"
