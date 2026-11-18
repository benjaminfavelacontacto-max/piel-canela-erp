import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import {
  ConsultaSchema,
  NOMBRES_CONJUNTOS,
  consultar,
  diccionarioDeDatos,
  esErrorDeConsulta,
  fichasDeProductos,
  hoyISO,
} from "./datos"
import type { EventoAsistente, MensajeEntrada } from "./tipos"

/**
 * Asistente del ERP: Claude + herramientas de SOLO LECTURA sobre los datos.
 *
 * Pensado para costar fracciones de centavo por pregunta:
 *  - Modelo por defecto Claude Haiku 5.5 ($0.10 / $0.50 USD por millón de tokens).
 *    Se puede subir con la variable de entorno ASISTENTE_MODELO (p. ej. claude-sonnet-5-5).
 *  - La IA nunca recibe tablas completas: pide agregados al motor de `datos.ts`.
 *  - Prompt + herramientas fijos y con cache (las lecturas de cache cuestan 10%).
 *  - El historial viaja solo como texto y recortado.
 */

const MODELO = process.env.ASISTENTE_MODELO || "claude-haiku-5-5"
const MAX_VUELTAS = 8

/** USD por millón de tokens (entrada, salida). */
const PRECIOS: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
}

const SISTEMA = `Eres el asistente inteligente del ERP de Piel Canela, una distribuidora mexicana de productos de bronceado (cremas activadoras, potenciadoras, oxigenantes y cintas adhesivas) que importa de Brasil. Tiene 2 socios: Sandra y Benjamin. Hablas con uno de los socios, por texto o por voz.

# Cómo trabajas
- Para cualquier cifra o dato del negocio usa SIEMPRE la herramienta "consultar". Nunca inventes ni estimes números: si no está en los datos, dilo.
- Pide datos ya agregados (agrupar_por + metricas) en vez de listas largas; lanza varias consultas en paralelo cuando la pregunta lo necesite.
- Solo puedes LEER. Si te piden crear, editar o borrar algo, explica en qué pantalla se hace y pon el enlace.
- Si la pregunta es ambigua (periodo, cliente), asume lo más razonable, dilo en una frase y responde.

# Reglas del negocio
- Moneda: pesos mexicanos (MXN) salvo que la columna diga USD. Escribe los importes así: $12,345.67.
- Ganancia de una venta = total − costo_productos − costo_envio (ya viene calculada en "ganancia").
- "Ventas" es lo vendido de verdad; "cotizaciones" son propuestas y no son ingreso. El IVA de una cotización es solo referencial.
- El cliente interno «Piel Canela» (producto que una socia se lleva a su spa) y las ventas canceladas ya vienen excluidos; inclúyelos solo si te lo piden.
- Lo que un cliente debe = saldo_pendiente. "Cobrado" = cantidad_pagada.
- Capital invertido por socio está en "inversiones"; lo que cada socio ya recibió, en "reparto_socios".
- Las cintas vienen en presentaciones: entera, 9mm y 12mm.

# Datos disponibles (herramienta "consultar")
${diccionarioDeDatos()}

# Cómo respondes
- En español de México, directo y breve: primero la respuesta, luego el detalle indispensable. Puede que se lea en voz alta, así que evita párrafos largos.
- Usa tablas Markdown solo cuando compares varias filas (máximo ~12 filas); resalta en **negritas** la cifra clave.
- Usa "mostrar_grafica" cuando pidan una gráfica o cuando una tendencia o comparación de 3 o más valores se entienda mejor visualmente. La gráfica ya la ve el usuario: no repitas todos sus números, comenta solo lo importante.
- Usa "mostrar_productos" cuando pidan ver fotos o imágenes de productos.
- Si ayuda, enlaza la pantalla del ERP con Markdown: [Ventas](/ventas), [Estadísticas](/ventas/estadisticas), [Nueva venta](/ventas/nueva), [Cotizaciones](/cotizaciones), [Lista de precios](/cotizaciones/lista-precios), [Clientes](/clientes), [Inventario](/inventario), [Pedidos](/pedidos), [Finanzas](/finanzas), [Panorama](/panorama).
- Si detectas algo que el socio debería saber (un producto por agotarse, un saldo vencido grande, un cliente frecuente que dejó de comprar), menciónalo en una línea.
- Termina SIEMPRE con una última línea que empiece con ">>" y proponga 2 o 3 preguntas de seguimiento cortas separadas por " | ". Ejemplo: >> ¿Y comparado con el mes pasado? | Ver por cliente | Mostrar gráfica`

const FILTRO_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "contiene", "en"]

const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: "consultar",
    description:
      "Consulta de solo lectura sobre los datos del ERP. Filtra, agrupa y calcula métricas en el servidor. " +
      "Con agrupar_por y/o metricas devuelve agregados; sin ellos devuelve filas. " +
      "El resultado es JSON: { columnas, filas (arreglos en el orden de columnas), total_filas, notas }.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        datos: { type: "string", enum: NOMBRES_CONJUNTOS, description: "Conjunto de datos a consultar." },
        filtros: {
          type: "array",
          description:
            'Condiciones (se combinan con Y). Fechas como "AAAA-MM-DD". "contiene" ignora mayúsculas y acentos. "en" recibe una lista.',
          items: {
            type: "object",
            properties: {
              columna: { type: "string" },
              op: { type: "string", enum: FILTRO_OPS },
              valor: { description: "Texto, número, booleano, null o lista (para «en»)." },
            },
            required: ["columna", "op", "valor"],
          },
        },
        agrupar_por: {
          type: "array",
          items: { type: "string" },
          description: 'Columnas para agrupar. Las fechas aceptan grano: "fecha:mes", "fecha:anio", "fecha:dia".',
        },
        metricas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["suma", "promedio", "min", "max", "conteo", "conteo_distinto"] },
              columna: { type: "string", description: "No hace falta para «conteo»." },
            },
            required: ["op"],
          },
          description: 'Cada métrica sale en una columna llamada "<op>_<columna>" (o "conteo").',
        },
        columnas: { type: "array", items: { type: "string" }, description: "Solo sin agrupar: columnas a devolver." },
        ordenar_por: {
          type: "object",
          properties: {
            columna: { type: "string", description: "Columna del resultado (p. ej. suma_total)." },
            direccion: { type: "string", enum: ["asc", "desc"] },
          },
          required: ["columna"],
        },
        limite: { type: "integer", description: "Máximo de filas (por defecto 25 sin agrupar, 60 agrupado; tope 300)." },
        incluir_internos: { type: "boolean", description: "Incluir el consumo interno de Piel Canela." },
        incluir_canceladas: { type: "boolean", description: "Incluir ventas canceladas." },
      },
      required: ["datos"],
    },
  },
  {
    name: "mostrar_grafica",
    description:
      "Dibuja una gráfica en el chat del usuario. Úsala después de consultar los datos. " +
      "«barras» para comparar categorías, «lineas»/«area» para evolución en el tiempo, «dona» para partes de un total (una sola serie).",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["barras", "lineas", "area", "dona"] },
        titulo: { type: "string" },
        etiquetas: { type: "array", items: { type: "string" }, description: "Eje X o nombre de cada sector (máx. 40)." },
        series: {
          type: "array",
          description: "1 a 4 series; cada «valores» debe tener un número por etiqueta.",
          items: {
            type: "object",
            properties: {
              nombre: { type: "string" },
              valores: { type: "array", items: { type: "number" } },
            },
            required: ["nombre", "valores"],
          },
        },
        formato: { type: "string", enum: ["moneda", "numero", "porcentaje"] },
      },
      required: ["tipo", "titulo", "etiquetas", "series", "formato"],
    },
  },
  {
    name: "mostrar_productos",
    description: "Muestra en el chat fichas con FOTO, existencia y precio de productos. Recibe los SKU (obténlos con «consultar» en inventario).",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: { skus: { type: "array", items: { type: "string" }, description: "Hasta 12 SKU." } },
      required: ["skus"],
    },
  },
]

const GraficaSchema = z
  .object({
    tipo: z.enum(["barras", "lineas", "area", "dona"]),
    titulo: z.string().max(120),
    etiquetas: z.array(z.string()).min(1).max(40),
    series: z.array(z.object({ nombre: z.string(), valores: z.array(z.number()) })).min(1).max(4),
    formato: z.enum(["moneda", "numero", "porcentaje"]),
  })
  .refine((g) => g.series.every((s) => s.valores.length === g.etiquetas.length), {
    message: "Cada serie debe tener exactamente un valor por etiqueta.",
  })

const ProductosSchema = z.object({ skus: z.array(z.string()).min(1).max(12) })

const ETIQUETA_CONJUNTO: Record<string, string> = {
  ventas: "ventas",
  venta_items: "productos vendidos",
  cotizaciones: "cotizaciones",
  cotizacion_items: "cotizaciones",
  inventario: "inventario",
  clientes: "clientes",
  reparto_socios: "reparto a socios",
  inversiones: "inversiones",
  gastos: "gastos",
  pedidos: "pedidos",
  pedido_items: "pedidos",
  movimientos_inventario: "movimientos de inventario",
}

type Resultado = { contenido: string; error?: boolean; eventos?: EventoAsistente[] }

async function ejecutar(nombre: string, entrada: unknown): Promise<Resultado> {
  try {
    if (nombre === "consultar") {
      const p = ConsultaSchema.safeParse(entrada)
      if (!p.success) return { contenido: "Entrada inválida: " + z.prettifyError(p.error), error: true }
      return { contenido: await consultar(p.data) }
    }
    if (nombre === "mostrar_grafica") {
      const p = GraficaSchema.safeParse(entrada)
      if (!p.success) return { contenido: "Entrada inválida: " + z.prettifyError(p.error), error: true }
      return { contenido: "Gráfica mostrada al usuario.", eventos: [{ t: "grafica", d: p.data }] }
    }
    if (nombre === "mostrar_productos") {
      const p = ProductosSchema.safeParse(entrada)
      if (!p.success) return { contenido: "Entrada inválida: " + z.prettifyError(p.error), error: true }
      const fichas = await fichasDeProductos(p.data.skus)
      if (!fichas.length) return { contenido: "Ningún SKU coincide con el inventario.", error: true }
      return {
        contenido: "Fichas mostradas al usuario: " + fichas.map((f) => f.sku).join(", "),
        eventos: [{ t: "productos", d: fichas }],
      }
    }
    return { contenido: "Herramienta desconocida: " + nombre, error: true }
  } catch (e) {
    if (esErrorDeConsulta(e)) return { contenido: e.message, error: true }
    console.error("[asistente] herramienta " + nombre, e)
    return { contenido: "Error al leer los datos. Intenta de otra forma.", error: true }
  }
}

function fechaLarga(): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date())
}

/** Responde una conversación emitiendo eventos conforme llegan (texto, gráficas, fichas, costo). */
export async function* responder(
  historial: MensajeEntrada[],
  signal?: AbortSignal,
): AsyncGenerator<EventoAsistente> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    yield { t: "error", d: "Falta configurar ANTHROPIC_API_KEY en el servidor para usar el asistente." }
    return
  }
  const client = new Anthropic({ apiKey })

  const messages: Anthropic.MessageParam[] = historial.map((m) => ({
    role: m.rol,
    content: m.texto,
  }))

  const uso = { entrada: 0, cacheEscritura: 0, cacheLectura: 0, salida: 0 }
  let reintentosJson = 0

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const stream = client.messages.stream(
        {
          model: MODELO,
          max_tokens: 8000,
          output_config: { effort: "medium" },
          system: [
            { type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } },
            // Volátil → va DESPUÉS del punto de cache para no invalidarlo cada día.
            { type: "text", text: "Hoy es " + fechaLarga() + " (" + hoyISO() + ")." },
          ],
          tools: HERRAMIENTAS,
          messages,
        },
        { signal },
      )

      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          yield { t: "texto", d: ev.delta.text }
        } else if (ev.type === "content_block_start" && ev.content_block.type === "tool_use") {
          const nombre = ev.content_block.name
          yield {
            t: "estado",
            d:
              nombre === "mostrar_grafica"
                ? "Dibujando la gráfica…"
                : nombre === "mostrar_productos"
                  ? "Buscando las fotos…"
                  : "Consultando los datos…",
          }
        }
      }

      let msg: Anthropic.Message
      try {
        msg = await stream.finalMessage()
        reintentosJson = 0
      } catch (e) {
        // Con eager_input_streaming una entrada de herramienta puede llegar como JSON inválido: se reintenta la vuelta.
        if (e instanceof Anthropic.APIError || reintentosJson++ >= 2) throw e
        continue
      }

      uso.entrada += msg.usage.input_tokens
      uso.cacheEscritura += msg.usage.cache_creation_input_tokens ?? 0
      uso.cacheLectura += msg.usage.cache_read_input_tokens ?? 0
      uso.salida += msg.usage.output_tokens

      if (msg.stop_reason === "refusal") {
        yield { t: "error", d: "No puedo ayudar con esa solicitud. Intenta plantearla de otra forma." }
        break
      }

      const usos = msg.content.filter((bl): bl is Anthropic.ToolUseBlock => bl.type === "tool_use")
      if (!usos.length) break
      if (msg.stop_reason === "max_tokens") {
        yield { t: "error", d: "La respuesta quedó incompleta. Intenta con una pregunta más específica." }
        break
      }

      const primerConjunto = usos
        .map((u) => (u.name === "consultar" ? (u.input as { datos?: string })?.datos : undefined))
        .find(Boolean)
      if (primerConjunto && ETIQUETA_CONJUNTO[primerConjunto]) {
        yield { t: "estado", d: "Consultando " + ETIQUETA_CONJUNTO[primerConjunto] + "…" }
      }

      messages.push({ role: "assistant", content: msg.content })
      const resultados = await Promise.all(usos.map((u) => ejecutar(u.name, u.input)))
      for (const r of resultados) for (const ev of r.eventos ?? []) yield ev
      messages.push({
        role: "user",
        content: usos.map(
          (u, i): Anthropic.ToolResultBlockParam => ({
            type: "tool_result",
            tool_use_id: u.id,
            content: resultados[i].contenido,
            ...(resultados[i].error ? { is_error: true } : {}),
          }),
        ),
      })
      yield { t: "estado", d: "Analizando…" }
    }
  } catch (e) {
    if (signal?.aborted) return
    if (e instanceof Anthropic.AuthenticationError) {
      yield { t: "error", d: "La clave de la IA (ANTHROPIC_API_KEY) no es válida o venció." }
    } else if (e instanceof Anthropic.RateLimitError) {
      yield { t: "error", d: "La IA está saturada en este momento. Espera unos segundos e intenta de nuevo." }
    } else if (e instanceof Anthropic.BadRequestError) {
      console.error("[asistente] 400", e.message)
      yield {
        t: "error",
        d: "La IA rechazó la solicitud. Si se alcanzó el límite mensual de gasto de la clave, auméntalo en la consola de Anthropic.",
      }
    } else if (e instanceof Anthropic.APIError) {
      console.error("[asistente] API", e.status, e.message)
      yield { t: "error", d: "La IA no respondió (error " + (e.status ?? "de red") + "). Intenta de nuevo." }
    } else {
      console.error("[asistente]", e)
      yield { t: "error", d: "Ocurrió un error inesperado. Intenta de nuevo." }
    }
  }

  const [pIn, pOut] = PRECIOS[MODELO] ?? PRECIOS["claude-haiku-5-5"]
  yield {
    t: "fin",
    d: {
      costoUsd:
        (uso.entrada * pIn + uso.cacheEscritura * pIn * 1.25 + uso.cacheLectura * pIn * 0.1 + uso.salida * pOut) /
        1_000_000,
      tokensEntrada: uso.entrada + uso.cacheEscritura + uso.cacheLectura,
      tokensSalida: uso.salida,
      modelo: MODELO,
    },
  }
}
