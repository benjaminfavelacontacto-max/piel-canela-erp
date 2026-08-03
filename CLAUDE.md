# Piel Canela ERP — Contexto del Proyecto

## Stack
- Next.js 15, TypeScript, Tailwind CSS, shadcn/ui
- Supabase (proyecto: szjzaajjpuomvpnghvzu)
- Recharts para gráficas, Framer Motion para animaciones

## Negocio
Distribuidora de productos de bronceado (cremas activadoras, potenciadoras, oxigenantes, cintas).
2 socios: Sandra y Benjamin, 50/50 en cada venta.

## Socios IDs (Supabase)
- Sandra: 4f21084b-dfe9-45f3-be80-935dc1a5e7a5
- Benjamin: 3165fe33-c760-4373-84d0-e1cd14d863b3

## Reglas críticas de Supabase
- cotizaciones.total es columna GENERATED — NUNCA insertarla
- ventas.total, ventas.ganancia, ventas.saldo_pendiente son GENERATED — NUNCA insertarlas
- venta_items.subtotal es GENERATED — NUNCA insertarla
- inventario.estatus es GENERATED (se calcula del stock: ok/bajo/agotado) — NUNCA insertarla/actualizarla
- inventario.stock_inicial es NOT NULL sin default — al crear fila nueva, igualarlo a stock_actual
- No todos los productos tienen fila en `inventario`; `vista_inventario` sintetiza stock 0 vía LEFT JOIN. Al editar stock: UPDATE si existe, INSERT si no
- RLS está ACTIVADO en las 25 tablas (bloqueo total al rol `anon`) — ver `scripts/enable-rls.sql`. Motivo: el portal público /order expone el anon key; sin RLS cualquiera leía/escribía todo. NO hay políticas para `anon`: toda la app accede vía `service_role` (que bypassa RLS)
- `server.ts` (createClient server) usa el **service role** (no anon) → bypassa RLS. Es server-only y solo se usa detrás del candado JWT. NUNCA usar el browser client (`@/lib/supabase/client`) para leer datos: el anon ya no tiene acceso. Mover lecturas/escrituras a server components o server actions
- El portal público /order NO usa anon: catálogo/stock vía server component (admin), búsqueda por teléfono + submitOrder vía server actions (admin)
- RLS en `storage.objects` SÍ está activo → usar `createAdminClient()` (service_role_key) para uploads
- Usar createClient() de @/lib/supabase/server en server components/actions (ya es service role)
- Usar createAdminClient() de @/lib/supabase/admin para queries en server actions / rutas públicas
- Las VISTAS (vista_inventario, vista_productos_top, vista_ventas_cliente) tienen `security_invoker=on` + REVOKE a anon
- Lista de precios se llama exactamente 'Pública MXN'
- Enum `estatus_venta`: `pendiente | pagada_parcial | pagada_total | cancelada` (NO existe 'completada')

## Tablas principales
- productos, inventario, ventas, venta_items, venta_socios
- cotizaciones, cotizacion_items
- clientes, socios, categorias, proveedores
- listas_precios, precios_producto
- inversiones (monto invertido por socio)
- pedidos_compra, pedido_compra_items

## Storage Supabase
- Bucket `productos` (público) → imágenes de productos del inventario
- BD guarda SOLO el filename en `productos.imagen_url` (NO la URL completa)
- `src/lib/storage-images.buildProductoImageUrl()` antepone el prefijo público
- Service role key bypassea RLS de `storage.objects` — usar admin client siempre
- SQL de bucket + policies (por si falla): `scripts/storage-bucket-productos.sql`

## Colores y estilo
- Color primario: teal-600 (#0d9488)
- Acento: pink/rose para ganancias y líneas de gráfica
- Estilo: minimalista premium tipo Stripe/Linear
- Bordes: rounded-2xl, sombras suaves
- NO usar colores oklch o lab en PDFs (usar hex hardcodeado)
- Light theme V1.1 — paleta: emerald-700 `#047857`, indigo-600 `#4F46E5`, amber-700 `#B45309`, rose-700 `#B91C1C`, cyan-700 `#0E7490`, slate `#475569`

## Paleta actual: IA Amatista (módulo Clientes)
- Header banner: `linear-gradient(90deg, #1E1A33, #2A244A)`
- Acento principal: `#8B5CF6` (púrpura eléctrico)
- Acento secundario: `#E9D5FF` (lavanda pálido) — usar solo sobre dark bg; en blanco usar `#7C3AED` para legibilidad
- Acento marca: `#C5A47E` (canela/oro) — Sun icon, HEAT badge
- Glass cards (sobre dark banner): `rgba(255,255,255,0.03)` + `blur(12px)` + `border-radius: 16px`
- Sidebar activo (todas las rutas): bar + icon `#8B5CF6` con `drop-shadow(0 0 6px rgba(139,92,246,0.4))`
- Tokens CSS disponibles en `globals.css`: `--am-deep`, `--am-medium`, `--am-purple`, `--am-lavender`, `--am-canela`

## Para revertir paleta a verde Lujo Silencioso
```
git checkout v-pre-amatista -- "src/app/(dashboard)/clientes/" src/components/sidebar-nav.tsx
git commit -m "revert: paleta amatista → verde original"
```

## Tags de baseline / rollback
- `v1.0` (commit a413eca) — baseline estable inicial
- `v1.1` — baseline post-paleta amatista
- `v-pre-glass-ui`, `v-pre-amatista`, `v-pre-pedidos`, `v-pre-pedidos-polish`, `v-pre-carga-ventas-definitiva` — rollback points antes de cambios invasivos

## Estructura de rutas
- /dashboard → página principal con KPIs
- /ventas → lista + dashboard financiero + VentasPorTipo (barras+dona+ranking)
- /ventas/[id] → detalle venta + widget desglose por tipo
- /ventas/[id]/editar → edición de venta
- /ventas/estadisticas → Financial Command Center
- /ventas/nueva → form crear venta
- /cotizaciones → lista con filtros
- /cotizaciones/[id] → detalle
- /cotizaciones/[id]/confirmar → convertir a venta
- /cotizaciones/[id]/editar → edición
- /clientes → gestión + Revenue Intelligence Panel (predicción de compras)
- /clientes/[id] → ficha cliente
- /inventario → stock + productos + upload imagen + columnas redimensionables
- /pedidos → lista pedidos de compra (importaciones Brasil)
- /pedidos/[id] → detalle pedido
- /pedidos/nuevo → form crear pedido
- /finanzas → inversiones, ROI, recuperación capital

## Archivos clave por módulo

### Ventas
- `src/app/(dashboard)/ventas/ventas-por-tipo.tsx` — BarChart + PieChart + ranking + drill-down 3-col
- `src/app/(dashboard)/ventas/ventas-dashboard.tsx` — gráfica mensual con filtros 3M/6M/1A/TODO
- `src/app/(dashboard)/ventas/[id]/page.tsx` — incluye widget desglose por tipo entre Pago y División socios

### Clientes
- `src/app/(dashboard)/clientes/prediccion-compras.tsx` — Revenue Intelligence Panel (Attio/Linear style)
- `src/app/(dashboard)/clientes/lib-prediccion.ts` — EmpiricalCDFModel, frecuencia, próximas compras

### Inventario
- `src/app/(dashboard)/inventario/image-upload.tsx` — drag&drop upload de imagen producto
- `src/app/(dashboard)/inventario/actions.ts` — `subirImagenProducto`, `eliminarImagenProducto`, `actualizarTipoCambio`
- `src/app/(dashboard)/inventario/inventario-view.tsx` — tabla con columnas redimensionables (drag handles, localStorage)
- `src/app/(dashboard)/inventario/inventory-stats.tsx` — KPIs compactos + dashboard Stock por categoría con click-filter

### Pedidos
- `src/app/(dashboard)/pedidos/page.tsx` — lista con chips metadata + TC con color dinámico

### Libs compartidos
- `src/lib/supabase/admin.ts` — `createAdminClient()` con service_role_key (server-only)
- `src/lib/supabase/server.ts` — `createClient()` para server components/actions
- `src/lib/supabase/client.ts` — `createClient()` browser (anon key)
- `src/lib/storage-images.ts` — `buildProductoImageUrl(filename)`, `findImageFor`, `buildImageMap`
- `src/lib/internal-clientes.ts` — `getInternalClienteIds()` para filtrar Piel Canela
- `src/lib/cotizacion-types.ts` — tipos compartidos cotizaciones
- `src/lib/pdf.ts` — generación PDF cotizaciones
- `src/lib/chart-palette.ts` — paleta consistente para recharts

### Scripts versionados
- `scripts/seed-ventas-from-sheet.sql` — seed idempotente de 42 ventas del Sheet
- `scripts/storage-bucket-productos.sql` — fallback para crear bucket + policies si falla upload

## Lógica financiera
- Al crear venta: auto-insertar venta_socios 50/50 Sandra y Benjamin
- ganancia = total - costo_productos - costo_envio (campo GENERATED)
- ROI Sandra: invertido $157,924 / recuperado de venta_socios
- ROI Benjamin: invertido $141,866 / recuperado de venta_socios

## Clientes frecuentes (IDs)
- Shams Bronceado Natural: 3bc20eae-cd2e-4a32-882b-4e4c87e55c69 (NOMBRE en columna `nombre_negocio`, no en `nombre`)
- Mithra Sun & Spa: 1533ff4d-4d77-4fcc-b9c9-154d3b4bbb89
- The Temple Bronze: cb5b2c42-f709-4ca8-a3a4-39e95ac21242
- Mariela: 9b3f1dc4-7672-4913-b5bb-5d82198b5e8d
- Piel Canela (INTERNO): 08449791-0fab-4bfb-818f-b9dbf077c879

## Convenciones de código
- Server components para data fetching, client components solo para interactividad
- Server actions en actions.ts de cada módulo
- Siempre usar ON CONFLICT DO NOTHING en inserts masivos (o WHERE NOT EXISTS si no hay UNIQUE)
- Formato moneda: `toLocaleString('es-MX', {style:'currency', currency:'MXN'})`
- `'use client'` SIEMPRE en la primera línea absoluta del archivo (antes de cualquier import o comentario)

## Patrones establecidos (mantener)

### Inmutabilidad antes de sort
Arrays que vienen como props son `readonly` en TS strict — clonar antes de mutar:
```ts
[...data].sort((a, b) => b.total - a.total)  // ✓
data.sort(...)  // ✗ Runtime TypeError
```

### Deduplicación con Map (no Array.find)
En drill-down y agrupamientos, usar `Map<id, item>` para deduplicar a nivel de query:
```ts
const ordenesMap = new Map<string, OrdenWithCat>()
for (const item of items) {
  let orden = ordenesMap.get(item.venta_id) ?? { ...nuevo, unidadesCat: 0, subtotalCat: 0 }
  orden.unidadesCat += item.cantidad
  ordenesMap.set(item.venta_id, orden)
}
```

### Formateo moneda con guard
`fmtMXN` siempre tolera null/undefined:
```ts
const fmtMXN = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" })
```

### Colores de gráficas dona
COLORES_CATEGORIA con fallback dinámico por hash de string para categorías nuevas (evita sectores blancos):
- Paleta fija para categorías conocidas (Activadores, Potenciadores, Oxigenantes, Cintas)
- `FALLBACK_COLORS[hash(cat) % N]` para categorías no listadas
- `colorCache` para evitar recálculo

### Label centrado en PieChart
NO usar `<div absolute>` superpuesto (se encima con tooltip). Usar `<text>` SVG dentro del PieChart:
```tsx
<text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
  {label}
</text>
```

### Avatares por hash de nombre
NO indexar por posición en array filtrado (cambia entre filtros). Usar hash estable:
```ts
const AVATAR_GRADIENTS = [...12 colores...]
function getAvatarGradient(nombre: string) {
  let h = 0; for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length]
}
```

### Upload de imágenes
Server action con `createAdminClient()` (service_role bypassea RLS de storage). File → `Uint8Array(await archivo.arrayBuffer())` antes de `.upload()`. BD guarda solo `filename`, no URL completa — `buildProductoImageUrl()` antepone el prefijo al renderizar.

### Defensa contra template literals escapados
Para fechas y labels generados dinámicamente (especialmente cuando vienen de Python heredocs o data externa), preferir string concatenación a template literals: `'Atrasado ' + dias + 'd'` en lugar de `` `Atrasado ${dias}d` `` — evita rebote de `\$` escapado.

## Regla IVA — referencial vs real
- `cotizaciones.iva` = REFERENCIAL, solo para presentar al cliente en el PDF
- `ventas.iva` = REAL, lo que efectivamente se cobró
- Todos los reportes financieros, ganancias y totales usan SIEMPRE `ventas.iva`, nunca `cotizaciones.iva`
- Al crear venta desde una cotización: pre-cargar `ivaActivo` como sugerencia (basado en si la cot tenía IVA), pero permitir al usuario cambiar antes de guardar
- Fórmula ganancia: `ventas.total - ventas.costo_productos - ventas.costo_envio` (donde `total = subtotal + iva − descuento`)
- Banner ámbar en formularios deja claro que el toggle define el IVA real cobrado

## Regla: Descuentos (por producto vs global)
Son DOS cosas distintas y no se suman en la misma columna:
- **Por producto** (`cotizacion_items` / `venta_items`): la partida guarda el precio YA REBAJADO en `precio_unitario`, el de catálogo congelado en `precio_lista` y CÓMO se capturó en `descuento_tipo` (`pct` | `monto`) + `descuento_valor` (15 = 15%, 25 = **$25 por pieza**). Como el precio rebajado es el que se persiste, `subtotal` (GENERATED), `cotizaciones.subtotal`, el IVA, la utilidad y la venta espejo cuadran solos — no hay que tocar ninguna columna generada.
- **Global** (`cotizaciones.descuento`): se resta DESPUÉS del subtotal y antes del IVA. **NUNCA** sumarle el descuento por producto: ya está dentro del subtotal, se descontaría dos veces.
- El subtotal a precio de lista NO se guarda: se reconstruye desde las partidas con `resumenDescuentos()`.
- Regalo ≠ descuento: la cortesía es 100% y se contabiliza aparte (`src/lib/regalos.ts`); al marcar una partida como regalo se limpia su descuento, y los regalos se excluyen del subtotal bruto para no inflar el "descuento por productos".
- **Descuento por lote**: `aplicarDescuentoLote(items, filtro, tipo, valor)` aplica la misma rebaja a toda una familia (típico "10% a todas las cintas"). Siempre calcula sobre `precio_lista`, así que reaplicar NO encadena descuentos. Las familias las define `src/lib/grupos-productos.ts` (`grupoProducto` por prefijo de SKU → categoría → nombre).
- En el PDF, las partidas de la misma familia con el mismo descuento se presentan como UN renglón de lote (`renglonesDescuento`).
- Matemática única en `src/lib/descuentos.ts` (`totalesCotizacion` la usan el form de escritorio, la cotización rápida y el PDF). Verificación: `node scripts/verify-descuentos-math.mjs`.
- Migración: `scripts/add-descuento-por-producto.sql` (columnas + RPC `crear_venta_desde_cotizacion` recreada para copiarlas a la venta). La app degrada si no se ha corrido: guarda el precio rebajado pero pierde la etiqueta "−15%".

## Regla: Costos USD/MXN y tipo de cambio (inventario)
- `productos` tiene 4 columnas dolarizadas:
  - `precio_usd` — precio público referencial en USD por SKU
  - `costo_envio_usd` — SOLO la porción de ENVÍO por unidad en USD (envío prorrateado del pedido, NO incluye el precio del producto). Es el ÚNICO costo de envío que importa escribir
  - `costo_envio_mxn` — columna VESTIGIAL: `vista_inventario` la IGNORA y la deriva (= `costo_envio_usd × tipo_cambio`). Verificado: escribir 500 ahí y la vista igual muestra usd×TC. No vale la pena escribirla
  - `tipo_cambio` — MXN/USD vigente, default `17.50` en BD pero TC actual sincronizado con el Sheet es **$20.70** (segundo pedido)
- `vista_inventario` recalcula campos derivados (verificado contra datos, OJO: NO son × stock):
  - `precio_mxn_calculado = precio_usd × tipo_cambio`
  - `costo_envio_mxn = costo_envio_usd × tipo_cambio` (DERIVADO, ignora el stored)
  - `costo_total_usd = precio_usd + costo_envio_usd` (costo landed por unidad)
  - `costo_total_mxn = costo_total_usd × tipo_cambio`
  - `profit_unitario = precio_publico − costo_total_mxn`
  - `unidades_vendidas` agregado desde venta_items
- Para alimentar el inventario desde un pedido basta escribir en `productos`: `precio_usd`, `costo_envio_usd`, `tipo_cambio`. ⚠️ Pedidos cargados por script/import que NO corren ese snapshot dejan el `costo_envio_usd` viejo (pasó con el Pedido 3 → script `scripts/fix-pedido-3.py`)
- El TC es referencial: NO se recalcula automáticamente cuando cambia `tipo_cambio` masivamente vía el botón, salvo que se reescriba `costo_envio_usd`
- Botón "Actualizar TC" en la pestaña Inventario actualiza `productos.tipo_cambio` masivamente vía server action `actualizarTipoCambio()`
- En la UI mostrar siempre el TC vigente como badge: "TC referencial: $XX.XX MXN/USD"

## Regla: Cotizaciones/Ventas Internas Piel Canela
- El cliente "Piel Canela" (UUID `08449791-0fab-4bfb-818f-b9dbf077c879`) es INTERNO (`is_internal = true` en BD)
- Sus cotizaciones sirven SOLO para descontar inventario (la socia se lleva producto a su propio spa)
- NUNCA incluir en: totales de ventas, KPIs financieros, ROI de socios, ticket promedio, estadísticas de clientes, conversiones reales
- SÍ incluir en: lista de cotizaciones (con badge `🏠 Interno`), descuento de inventario, count total de cotizaciones
- Usar `getInternalClienteIds()` desde `@/lib/internal-clientes` para fetch del Set y filtrar en server components

## Regla: nombres de cintas (medida en mm, no cm)
- `productos.nombre_display` para cintas usa "9mm" y "12mm" (NO "9cm" / "12cm")
- `productos.nombre` mantiene sufijo `-c9` / `-c12` (identificador SKU-like, no medida)
- Se renombraron 59 cintas el 2026-05-11

## Última sesión de trabajo
**Fecha:** Mayo 2026

**Cambios principales:**
- Módulo `VentasPorTipo` con layout 3-col: BarChart + PieChart (label SVG central) + ranking + drill-down compartido. Dedupe con `ordenesMap` (no Array.find). Columna "Unidades" con desglose por categoría.
- `RevenueIntelligencePanel` en `/clientes/prediccion-compras.tsx` — KPIs (revenue semana, activos, en riesgo), 6 filtros pill, tabla 6-col con expandable rows, avatares por hash de nombre, sin top-3 highlight.
- Upload de imagen de producto en `/inventario` con drag & drop, server action con service_role para bypass RLS, BD guarda solo filename.
- Columnas de tabla inventario **redimensionables** con drag desde encabezado + reset por doble click, persistido en localStorage (`inventario-col-widths-v1`).
- Módulo `Pedidos` (lista + detalle + nuevo) para tracking de importaciones desde Brasil. Pedido 1 (TC 18.63) y Pedido 2 (TC 19.94) cargados desde xlsx.
- Inventario: KPI "Items disponibles" con breakdown Cintas/Otros, sortable headers + tfoot totales, Stock por categoría con click-filter.
- Seed de 42 ventas exactas del Google Sheet (1,018 unidades, 373 items, 86 socios). Anti-duplicados case-sensitive + por formato `PC-\d+`.
- Fix `ganancia` en reportes — incluye `costo_envio` (`total - costo_productos - costo_envio`).
- Filtros 3M/6M/1A/TODO en gráfica `Ventas mensuales`.
- Widget "Desglose por tipo" en `/ventas/[id]` entre Pago y División de socios.
- Cintas renombradas: `9cm` → `9mm`, `12cm` → `12mm` en `nombre_display` (59 productos, no se tocó `nombre`).

**Bugs resueltos durante la sesión:**
- `Array.sort` sobre prop readonly → clonar con `[...arr].sort()`
- File no serializable en Server Actions → convertir a `Uint8Array(await file.arrayBuffer())`
- Upload imagen falla con "RLS policy violation" → usar `createAdminClient()` con service_role
- BD guardaba URL completa pero `buildProductoImageUrl()` esperaba filename → guardar solo filename
- Sectores blancos en dona → paleta + FALLBACK dinámico + colorCache
- Drill-down con duplicados → ordenesMap por venta_id, no Array.find
- Template literals con `\$` escapado de heredocs Python → string concat
- Avatares cambiando color al filtrar → hash del nombre, no índice
