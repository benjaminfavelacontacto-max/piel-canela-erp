import { createClient } from "@/lib/supabase/server"

export const STORAGE_URL =
  "https://szjzaajjpuomvpnghvzu.supabase.co/storage/v1/object/public/productos/"

export function buildProductoImageUrl(filename: string | null | undefined): string | null {
  if (!filename) return null
  return `${STORAGE_URL}${encodeURIComponent(filename)}`
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function stem(filename: string): string {
  return normalize(filename.replace(/\.[^.]+$/, ""))
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter((t) => t.length > 1)
}

function score(productName: string, fileStem: string): number {
  const productTokens = tokens(productName)
  if (productTokens.length === 0) return 0
  let hits = 0
  for (const t of productTokens) {
    if (fileStem.includes(t)) hits++
  }
  return hits / productTokens.length
}

export async function buildImageMap(): Promise<Map<string, string>> {
  const supabase = await createClient()
  const { data } = await supabase.storage.from("productos").list("", {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  })

  const map = new Map<string, string>()
  if (!data) return map

  for (const file of data) {
    if (file.id === null) continue
    const url = buildProductoImageUrl(file.name)
    if (url) map.set(stem(file.name), url)
  }
  return map
}

export function findImageFor(
  productName: string,
  imagenUrl: string | null,
  imageMap: Map<string, string>,
): string | null {
  if (imagenUrl) return buildProductoImageUrl(imagenUrl)

  let best: { url: string; score: number } | null = null
  for (const [fileStem, url] of imageMap) {
    const s = score(productName, fileStem)
    if (s >= 0.5 && (!best || s > best.score)) {
      best = { url, score: s }
    }
  }
  return best?.url ?? null
}
