import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { buildProductoImageUrl } from "@/lib/storage-images"
import { construirHojas, type Hoja } from "@/lib/cintas-hojas"
import { ErrorConfig } from "@/lib/cintas-foto-ia"

/**
 * Identificación de PRODUCTOS (no cintas) en una foto general del mostrador con
 * visión de Claude. SOLO servidor. Mismo esquema que `cintas-foto-ia`: hojas de
 * referencia numeradas + lista «número: nombre — tamaño», la IA devuelve el
 * número de producto y cuántas unidades ve; el usuario lo revisa antes de
 * agregarlo a la cotización. Las cintas tienen su propio flujo (por presentación).
 */

const MODELO_IA = "claude-sonnet-5-5"
const CACHE_MS = 30 * 60 * 1000

type Candidato = { id: string; nombre: string; peso: string | null; categoria: string | null; imagen_url: string | null }
type Catalogo = { key: string; at: number; candidatos: Candidato[]; hojas: Hoja[] }
let cache: Catalogo | null = null

async function cargarCatalogo(): Promise<Catalogo> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("productos")
    .select("id, sku, nombre, nombre_display, imagen_url, peso, activo, categorias(nombre)")
    .not("sku", "like", "CN-%")
    .eq("activo", true)
  if (error) throw new Error("No se pudo leer el catálogo: " + error.message)
  type Row = {
    id: string
    nombre: string
    nombre_display: string | null
    imagen_url: string | null
    peso: string | null
    categorias: { nombre: string } | { nombre: string }[] | null
  }
  const candidatos: Candidato[] = ((data ?? []) as unknown as Row[])
    .map((r) => {
      const cat = Array.isArray(r.categorias) ? r.categorias[0] : r.categorias
      return {
        id: r.id,
        nombre: r.nombre_display ?? r.nombre,
        peso: r.peso,
        categoria: cat?.nombre ?? null,
        imagen_url: r.imagen_url,
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
  const key = candidatos.map((c) => c.id + "|" + c.imagen_url).join(",")
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache
  // Los productos sin foto llevan mosaico gris con su número: se reconocen por la etiqueta/lista.
  const hojas = await construirHojas(candidatos.map((c) => buildProductoImageUrl(c.imagen_url)))
  cache = { key, at: Date.now(), candidatos, hojas }
  return cache
}

export type GrupoProducto = {
  /** Id del producto (`productos.id`); null = no está en el catálogo. */
  productoId: string | null
  alternativas: string[]
  cantidad: number
  descripcion: string
  confianza: "alta" | "media" | "baja"
}

const SISTEMA = `Eres el asistente de una distribuidora de productos de bronceado (marca principal Patrícia Lobo; las etiquetas están en portugués). Tu tarea: reconocer los PRODUCTOS que aparecen en fotos de un mostrador o mesa (botes, frascos, bolsas, botellas) y decir de qué producto del catálogo es cada uno y cuántas unidades hay.

Recibirás:
1) El CATÁLOGO: una lista "número: nombre — tamaño — categoría" y HOJAS DE REFERENCIA (cuadrículas de 5 columnas × 4 filas; cada mosaico trae su NÚMERO en una etiqueta blanca arriba a la izquierda; un mosaico gris es un producto sin foto, se reconoce por su nombre).
2) De 1 a 3 FOTOS del usuario.

Reglas:
- Reporta cada producto DISTINTO con la herramienta "reportar_productos".
- LEE LA ETIQUETA: nombre del producto, sabor/variante (Morango, Pêssego, Chocolate, Camomila, Neutro, Tutti Frutti, Capuccino…), volumen/peso (850g, 900ml, 450g, 500ml, 1kg, 5L, 60ml…) y versión (2.0, 3.0, I, II…). Mismo nombre con distinto tamaño o versión son productos DIFERENTES: elige el que coincide con el tamaño y la versión que se leen. Si no alcanzas a leer el tamaño, da tu mejor opción y baja la confianza.
- "cantidad" = unidades físicas de ese producto que ves (cuenta cada bote, incluidos los apilados y los que están parcialmente tapados por otro). Productos envueltos juntos en plástico se cuentan uno por uno.
- Si varias fotos parecen mostrar los MISMOS productos desde otro ángulo, no los cuentes dos veces: reporta el máximo que ves de cada uno.
- Si un producto NO está en el catálogo, pon numero = null y descríbelo en "descripcion" (nombre que leas en la etiqueta).
- Ignora lo que no sea producto (mesa, piso, estantes, paredes, manos). NO reportes cintas adhesivas: tienen su propio flujo.
- Da hasta 2 "alternativas" (números de mosaico) cuando dudes entre variantes parecidas.
- "descripcion": lo que lees en la etiqueta, en pocas palabras (ej. "OX 40 Chocolate 900ml").`

const TOOL = {
  name: "reportar_productos",
  description: "Reporta los productos identificados en las fotos del usuario.",
  input_schema: {
    type: "object" as const,
    properties: {
      grupos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            numero: { type: ["integer", "null"], description: "Número del catálogo; null si no está en el catálogo." },
            alternativas: { type: "array", items: { type: "integer" }, description: "Hasta 2 números alternativos." },
            cantidad: { type: "integer", description: "Unidades físicas de este producto visibles." },
            descripcion: { type: "string" },
            confianza: { type: "string", enum: ["alta", "media", "baja"] },
          },
          required: ["numero", "alternativas", "cantidad", "descripcion", "confianza"],
        },
      },
    },
    required: ["grupos"],
  },
}

export async function identificarProductos(fotos: { base64: string }[]): Promise<{ grupos: GrupoProducto[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new ErrorConfig()

  const cat = await cargarCatalogo()
  if (cat.candidatos.length === 0) throw new Error("El catálogo no tiene productos.")

  const leyenda = cat.candidatos
    .map((c, i) => `${i + 1}: ${c.nombre}${c.peso ? " — " + c.peso : ""}${c.categoria ? " — " + c.categoria : ""}`)
    .join("\n")
  const hojaBlocks = cat.hojas.flatMap((h, idx) => {
    const imagen = {
      type: "image" as const,
      source: { type: "base64" as const, media_type: "image/jpeg" as const, data: h.base64 },
      ...(idx === cat.hojas.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
    }
    return [{ type: "text" as const, text: `Hoja ${idx + 1} (mosaicos ${h.desde} a ${h.hasta}):` }, imagen]
  })
  const fotoBlocks = fotos.flatMap((f, i) => [
    { type: "text" as const, text: `FOTO ${i + 1}:` },
    { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: f.base64 } },
  ])

  const client = new Anthropic({ apiKey })
  const resp = await client.messages.create({
    model: MODELO_IA,
    // Sonnet 5.5 rechaza forzar la herramienta (400): tool_choice auto + el prompt pide llamarla.
    max_tokens: 8000,
    output_config: { effort: "medium" },
    system: SISTEMA,
    tools: [TOOL],
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "CATÁLOGO — número: nombre — tamaño — categoría\n" + leyenda },
          ...hojaBlocks,
          ...fotoBlocks,
          { type: "text", text: "Identifica los productos de las fotos y repórtalos llamando a la herramienta reportar_productos (es la única forma de responder)." },
        ],
      },
    ],
  })

  const uso = resp.content.find((b) => b.type === "tool_use")
  if (!uso || uso.type !== "tool_use") throw new Error("La IA no devolvió resultados.")
  const crudo = (uso.input as { grupos?: unknown }).grupos
  const lista = Array.isArray(crudo) ? crudo : []

  const idDe = (n: unknown): string | null => {
    const i = typeof n === "number" ? n - 1 : NaN
    return Number.isInteger(i) && cat.candidatos[i] ? cat.candidatos[i].id : null
  }
  const grupos: GrupoProducto[] = []
  for (const g of lista as Record<string, unknown>[]) {
    const productoId = idDe(g.numero)
    const alternativas = (Array.isArray(g.alternativas) ? g.alternativas : [])
      .map(idDe)
      .filter((c): c is string => !!c && c !== productoId)
      .slice(0, 2)
    const conf = g.confianza === "alta" || g.confianza === "media" || g.confianza === "baja" ? g.confianza : "media"
    grupos.push({
      productoId,
      alternativas,
      cantidad: Math.max(1, Math.min(500, Math.round(Number(g.cantidad) || 1))),
      descripcion: String(g.descripcion ?? "").slice(0, 160),
      confianza: conf,
    })
  }
  return { grupos }
}
