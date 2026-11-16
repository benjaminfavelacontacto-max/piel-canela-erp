import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { buildProductoImageUrl } from "@/lib/storage-images"
import { construirHojas, type Hoja } from "@/lib/cintas-hojas"
import {
  agruparModelos,
  PRESENTACIONES,
  type ModeloCinta,
  type Presentacion,
  type ProductoCinta,
} from "@/lib/cintas-modelos"

/**
 * Identificación de cintas en una foto con visión de Claude. SOLO servidor.
 *
 * Cómo funciona: el catálogo de cintas (~90 modelos con foto) se arma en "hojas"
 * de referencia numeradas (mosaicos de 5×4 con el número dibujado con
 * rectángulos → no depende de fuentes del servidor). Claude ve las hojas + las
 * fotos del usuario y devuelve, por cada grupo de cintas, el número del modelo,
 * hasta 2 alternativas y cuántas piezas contó. El usuario lo revisa antes de
 * agregarlo a la cotización, así que un error de la IA nunca llega al PDF solo.
 *
 * Las hojas se cachean en memoria (30 min) y el prompt usa cache de Anthropic
 * para que varias fotos seguidas salgan baratas.
 */

const MODELO_IA = "claude-sonnet-5-5"
const CACHE_MS = 30 * 60 * 1000

type Catalogo = {
  key: string
  at: number
  candidatos: ModeloCinta[] // los que tienen foto: el índice + 1 es su número en las hojas
  todos: ModeloCinta[]
  hojas: Hoja[]
}
let cache: Catalogo | null = null

async function cargarCatalogo(): Promise<Catalogo> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("productos")
    .select("id, sku, nombre, nombre_display, imagen_url, activo")
    .like("sku", "CN-%")
    .eq("activo", true)
  if (error) throw new Error("No se pudo leer el catálogo de cintas: " + error.message)
  const todos = agruparModelos((data ?? []) as ProductoCinta[])
  const candidatos = todos.filter((m) => m.imagen_url)
  const key = candidatos.map((m) => m.clave + "|" + m.imagen_url).join(",")
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache
  const hojas = await construirHojas(candidatos.map((m) => buildProductoImageUrl(m.imagen_url)))
  cache = { key, at: Date.now(), candidatos, todos, hojas }
  return cache
}

// ───────────────────────── llamada a Claude ─────────────────────────
export type FotoEntrada = { presentacion: Presentacion; base64: string }

export type GrupoIdentificado = {
  presentacion: Presentacion
  /** Clave del modelo (ver `agruparModelos`); null = no está en el catálogo. */
  clave: string | null
  alternativas: string[]
  cantidad: number
  descripcion: string
  confianza: "alta" | "media" | "baja"
}

const SISTEMA = `Eres el asistente de una distribuidora de productos de bronceado. Tu tarea: reconocer CINTAS ADHESIVAS DE BRONCEADO (rollos de cinta de colores o estampados) en fotos tomadas con el celular y decir de qué modelo del catálogo son y cuántas piezas hay.

Recibirás:
1) HOJAS DE REFERENCIA del catálogo: cuadrículas de 5 columnas × 4 filas; cada mosaico tiene su NÚMERO en una etiqueta blanca arriba a la izquierda. Una lista te dice qué nombre tiene cada número.
2) Una a tres FOTOS del usuario, cada una de UNA presentación (enteras, 9/9 o 6/12). Todas las cintas de una foto están en la presentación que se indica.

Reglas:
- Agrupa las cintas de la foto por diseño/color y reporta cada grupo con la herramienta "reportar_cintas".
- Compara por COLOR y ESTAMPADO. La foto real se ve distinta a la del catálogo (luz, ángulo, rollos apilados, tamaño), así que busca el parecido del diseño, no del encuadre. Colores sólidos parecidos (rosa bebé / rosa fucsia / palo de rosa, azul rey / azul claro, morada / violeta) se distinguen por el tono: si dudas, da la mejor opción en "numero" y las siguientes en "alternativas" y baja la confianza.
- "piezas_visibles" = número de PEDAZOS FÍSICOS de ese diseño que alcanzas a ver, contando cada pedazo por separado (cada rollo de las pilas, incluidos los parcialmente visibles). NO conviertas ni dividas nada: el sistema lo hace. Si no se puede contar con seguridad, da tu mejor estimación y confianza "baja".
- Cómo vienen las presentaciones: una ENTERA es un rollo completo (1 pedazo = 1 unidad). Una unidad "9/9" viene cortada por la mitad en DOS pedazos iguales de 9 mm; una unidad "6/12" viene cortada en DOS pedazos, uno angosto (6 mm) y uno ancho (12 mm). Por eso en las fotos de 9/9 y 6/12 cada unidad se ve como 2 pedazos (a veces pegados uno junto al otro o apilados): cuéntalos todos como pedazos.
- Si un diseño NO aparece en las hojas, pon numero = null y descríbelo en "descripcion".
- No inventes: ignora cualquier objeto que no sea cinta (manos, mesa, cajas, otros productos).
- "descripcion": color y estampado en pocas palabras (ej. "leopardo rosa con negro sobre blanco").`

const TOOL = {
  name: "reportar_cintas",
  description: "Reporta los grupos de cintas identificados en las fotos del usuario.",
  input_schema: {
    type: "object" as const,
    properties: {
      grupos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            foto: { type: "integer", description: "Número de la foto del usuario (1, 2 o 3) donde está este grupo." },
            numero: { type: ["integer", "null"], description: "Número del mosaico del catálogo que más se parece; null si no está en el catálogo." },
            alternativas: { type: "array", items: { type: "integer" }, description: "Hasta 2 números de mosaico alternativos." },
            piezas_visibles: { type: "integer", description: "Pedazos físicos de este diseño visibles en la foto, contando cada pedazo por separado (sin dividir entre 2)." },
            descripcion: { type: "string" },
            confianza: { type: "string", enum: ["alta", "media", "baja"] },
          },
          required: ["foto", "numero", "alternativas", "piezas_visibles", "descripcion", "confianza"],
        },
      },
    },
    required: ["grupos"],
  },
}

export async function identificarCintas(
  fotos: FotoEntrada[],
  opts?: { maxTokens?: number },
): Promise<{ grupos: GrupoIdentificado[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new ErrorConfig()

  const cat = await cargarCatalogo()
  if (cat.hojas.length === 0) throw new Error("El catálogo de cintas no tiene fotos de referencia.")

  const leyenda = cat.candidatos.map((m, i) => `${i + 1}: ${m.nombre}`).join("\n")
  const hojaBlocks = cat.hojas.flatMap((h, idx) => {
    const imagen = {
      type: "image" as const,
      source: { type: "base64" as const, media_type: "image/jpeg" as const, data: h.base64 },
      // El último bloque de referencia marca el final del prefijo cacheable.
      ...(idx === cat.hojas.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
    }
    return [{ type: "text" as const, text: `Hoja ${idx + 1} (mosaicos ${h.desde} a ${h.hasta}):` }, imagen]
  })
  const fotoBlocks = fotos.flatMap((f, i) => {
    const etq = PRESENTACIONES.find((p) => p.id === f.presentacion)?.etiqueta ?? f.presentacion
    return [
      {
        type: "text" as const,
        text: `FOTO ${i + 1} — presentación ${etq.toUpperCase()} (todas las cintas de esta foto son ${etq}):`,
      },
      {
        type: "image" as const,
        source: { type: "base64" as const, media_type: "image/jpeg" as const, data: f.base64 },
      },
    ]
  })

  const client = new Anthropic({ apiKey })
  const resp = await client.messages.create({
    model: MODELO_IA,
    // Claude Sonnet 5.5 rechaza (400) forzar la herramienta con tool_choice any/tool:
    // se usa "auto" y el prompt pide llamarla. El razonamiento adaptativo (siempre
    // activo) cuenta dentro de max_tokens, de ahí el margen; effort medio basta.
    // El cotejo de inventario puede reportar decenas de modelos en una sola foto → más margen.
    max_tokens: opts?.maxTokens ?? 8000,
    output_config: { effort: "medium" },
    system: SISTEMA,
    tools: [TOOL],
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "CATÁLOGO DE REFERENCIA — número: nombre\n" + leyenda },
          ...hojaBlocks,
          ...fotoBlocks,
          { type: "text", text: "Identifica las cintas de las fotos y repórtalas llamando a la herramienta reportar_cintas (es la única forma de responder)." },
        ],
      },
    ],
  })

  const uso = resp.content.find((b) => b.type === "tool_use")
  if (!uso || uso.type !== "tool_use") throw new Error("La IA no devolvió resultados.")
  const crudo = (uso.input as { grupos?: unknown }).grupos
  const lista = Array.isArray(crudo) ? crudo : []

  const claveDe = (n: unknown): string | null => {
    const i = typeof n === "number" ? n - 1 : NaN
    return Number.isInteger(i) && cat.candidatos[i] ? cat.candidatos[i].clave : null
  }

  const grupos: GrupoIdentificado[] = []
  for (const g of lista as Record<string, unknown>[]) {
    const fotoIdx = Number(g.foto) - 1
    const foto = fotos[fotoIdx]
    if (!foto) continue
    const clave = claveDe(g.numero)
    const alternativas = (Array.isArray(g.alternativas) ? g.alternativas : [])
      .map(claveDe)
      .filter((c): c is string => !!c && c !== clave)
      .slice(0, 2)
    // En 9/9 y 6/12 cada unidad son 2 pedazos (cortada en dos): unidades = pedazos / 2.
    // Un pedazo suelto sobrante (cuenta impar) cuenta como una unidad más.
    const piezas = Math.max(1, Math.min(1000, Math.round(Number(g.piezas_visibles ?? g.cantidad) || 1)))
    const cantidad = foto.presentacion === "entera" ? piezas : Math.max(1, Math.ceil(piezas / 2))
    const conf = g.confianza === "alta" || g.confianza === "media" || g.confianza === "baja" ? g.confianza : "media"
    grupos.push({
      presentacion: foto.presentacion,
      clave,
      alternativas,
      cantidad,
      descripcion: String(g.descripcion ?? "").slice(0, 160),
      confianza: conf,
    })
  }
  return { grupos }
}

export class ErrorConfig extends Error {
  constructor() {
    super("Falta configurar ANTHROPIC_API_KEY (en .env.local y en Vercel) para identificar cintas con IA.")
  }
}
