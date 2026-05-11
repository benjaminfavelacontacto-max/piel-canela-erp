-- ═══════════════════════════════════════════════════════════════════
-- Bucket Storage: productos
-- Ejecutar en Supabase SQL Editor si el upload de imágenes falla
-- ═══════════════════════════════════════════════════════════════════

-- 1) Ver si el bucket existe
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'productos';

-- 2) Crear bucket (o actualizar a público si ya existe)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'productos',
  'productos',
  true,
  5242880,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp'];

-- 3) Limpiar políticas previas
DROP POLICY IF EXISTS "Imágenes públicas de productos" ON storage.objects;
DROP POLICY IF EXISTS "Subir imágenes de productos" ON storage.objects;
DROP POLICY IF EXISTS "Actualizar imágenes de productos" ON storage.objects;
DROP POLICY IF EXISTS "Eliminar imágenes de productos" ON storage.objects;
DROP POLICY IF EXISTS "productos_select" ON storage.objects;
DROP POLICY IF EXISTS "productos_insert" ON storage.objects;
DROP POLICY IF EXISTS "productos_update" ON storage.objects;
DROP POLICY IF EXISTS "productos_delete" ON storage.objects;

-- 4) Políticas permisivas (sistema interno, sin auth)
CREATE POLICY "productos_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'productos');

CREATE POLICY "productos_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'productos');

CREATE POLICY "productos_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'productos');

CREATE POLICY "productos_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'productos');

-- 5) Asegurar RLS habilitado
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 6) Verificar
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'productos_%';
