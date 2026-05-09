// Sube imágenes JPG/PNG (recursivo) al bucket "productos" de Supabase Storage.
// Uso: node upload-images.mjs
//
// Requisitos en .env.local:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  (clave secreta — NO publicar)

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

process.loadEnvFile('.env.local')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SOURCE_DIR = '/Users/benjaminfavela/Documents/Piel Canela/Inventario Fotos/'
const BUCKET = 'productos'

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'Faltan variables de entorno. Asegúrate de que .env.local define ' +
      'NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function ensureBucket() {
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true })
  if (!error) {
    console.log(`Bucket "${BUCKET}" creado.`)
    return
  }
  if (/already exists/i.test(error.message)) return
  throw new Error(`No se pudo crear el bucket: ${error.message}`)
}

const CONTENT_TYPE = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}

async function listImages(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && /\.(jpe?g|png)$/i.test(e.name))
    .map((e) => path.join(e.parentPath ?? e.path, e.name))
}

async function uploadOne(absPath) {
  const filename = path.basename(absPath)
  const ext = path.extname(filename).toLowerCase()
  const contentType = CONTENT_TYPE[ext] ?? 'application/octet-stream'
  const body = await readFile(absPath)

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, body, { contentType, upsert: true })

  if (error) {
    return { filename, ok: false, error: error.message }
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
  return { filename, ok: true, url: data.publicUrl }
}

await ensureBucket()

const files = await listImages(SOURCE_DIR)
console.log(`Encontradas ${files.length} imágenes en ${SOURCE_DIR}\n`)

let ok = 0
let fail = 0
for (const file of files) {
  const result = await uploadOne(file)
  if (result.ok) {
    ok++
    console.log(`✓ ${result.filename}\n  ${result.url}`)
  } else {
    fail++
    console.error(`✗ ${result.filename} — ${result.error}`)
  }
}

console.log(`\nListo. Subidas: ${ok}, fallidas: ${fail}.`)
if (fail > 0) process.exit(1)
