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
- RLS está DESACTIVADO en todas las tablas (sistema interno)
- Usar createClient() de @/lib/supabase/server en server components/actions
- Lista de precios se llama exactamente 'Pública MXN'

## Tablas principales
- productos, inventario, ventas, venta_items, venta_socios
- cotizaciones, cotizacion_items
- clientes, socios, categorias, proveedores
- listas_precios, precios_producto
- inversiones (monto invertido por socio)

## Colores y estilo
- Color primario: teal-600 (#0d9488)
- Acento: pink/rose para ganancias y líneas de gráfica
- Estilo: minimalista premium tipo Stripe/Linear
- Bordes: rounded-2xl, sombras suaves
- NO usar colores oklch o lab en PDFs (usar hex hardcodeado)

## Estructura de rutas
- /dashboard → página principal con KPIs
- /ventas → lista + dashboard financiero
- /ventas/estadisticas → Financial Command Center
- /cotizaciones → lista con filtros
- /clientes → gestión de clientes
- /inventario → stock y productos
- /finanzas → inversiones, ROI, recuperación capital

## Lógica financiera
- Al crear venta: auto-insertar venta_socios 50/50 Sandra y Benjamin
- ganancia = total - costo_productos - costo_envio
- ROI Sandra: invertido $157,924 / recuperado de venta_socios
- ROI Benjamin: invertido $141,866 / recuperado de venta_socios

## Clientes frecuentes (IDs)
- Shams Bronceado Natural: 3bc20eae-cd2e-4a32-882b-4e4c87e55c69
- Mithra Sun & Spa: 1533ff4d-4d77-4fcc-b9c9-154d3b4bbb89
- The Temple Bronze: cb5b2c42-f709-4ca8-a3a4-39e95ac21242
- Mariela: 9b3f1dc4-7672-4913-b5bb-5d82198b5e8d

## Convenciones de código
- Server components para data fetching, client components solo para interactividad
- Server actions en actions.ts de cada módulo
- Siempre usar ON CONFLICT DO NOTHING en inserts masivos
- Formato moneda: toLocaleString('es-MX', {style:'currency', currency:'MXN'})

## Regla IVA — referencial vs real
- `cotizaciones.iva` = REFERENCIAL, solo para presentar al cliente en el PDF
- `ventas.iva` = REAL, lo que efectivamente se cobró
- Todos los reportes financieros, ganancias y totales usan SIEMPRE `ventas.iva`, nunca `cotizaciones.iva`
- Al crear venta desde una cotización: pre-cargar `ivaActivo` como sugerencia (basado en si la cot tenía IVA), pero permitir al usuario cambiar antes de guardar
- Fórmula ganancia: `ventas.total - ventas.costo_productos - ventas.costo_envio` (donde `total = subtotal + iva − descuento`)
- Banner ámbar en formularios deja claro que el toggle define el IVA real cobrado

## Regla: Cotizaciones/Ventas Internas Piel Canela
- El cliente "Piel Canela" (UUID `08449791-0fab-4bfb-818f-b9dbf077c879`) es INTERNO (`is_internal = true` en BD)
- Sus cotizaciones sirven SOLO para descontar inventario (la socia se lleva producto a su propio spa)
- NUNCA incluir en: totales de ventas, KPIs financieros, ROI de socios, ticket promedio, estadísticas de clientes, conversiones reales
- SÍ incluir en: lista de cotizaciones (con badge `🏠 Interno`), descuento de inventario, count total de cotizaciones
- Usar `getInternalClienteIds()` desde `@/lib/internal-clientes` para fetch del Set y filtrar en server components
