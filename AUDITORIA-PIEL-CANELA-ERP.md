# Auditoría de Clase Mundial — Piel Canela ERP

> Auditoría integral generada por un comité multi-agente (PM · CTO · UX Lead · Diseñador Senior · Arquitecto · QA · Especialista ERP/CRM · Especialista IA · Escalabilidad).
> Cobertura: **18 áreas auditadas** (8 módulos + 10 dimensiones transversales) sobre ~36,500 LOC / 103 archivos. Cada hallazgo Crítico/Alto fue verificado adversarialmente contra el código.

**Hallazgos:** 201 verificados en la tabla maestra + 16 del módulo Clientes recuperados aparte (217 totales) · 🔴 6 Críticos · 🟠 36 Altos · 🟡 114 Medios · 🟢 45 Bajos · (1 refutados en verificación, 58 ajustados)

---

## 1. Resumen ejecutivo

# Resumen Ejecutivo — Auditoría Piel Canela ERP

## 1. Veredicto global

Piel Canela ERP es un producto de **dos velocidades**. La **capa de presentación** (tablas premium con TanStack, drawers, dashboards con Recharts, portal `/order` mobile-first, panel de predicción de clientes) está genuinamente cerca del estándar Linear/Attio/Stripe: se ve premium, es coherente módulo a módulo en lo visual y demuestra criterio de diseño. La **capa de datos y lógica de negocio**, en cambio, está a nivel prototipo y arrastra defectos que comprometen lo único que un ERP no puede equivocar: **el dinero y el inventario**. Hoy el sistema corrompe silenciosamente sus propios números financieros (ventas que no aparecen en el ROI, stock que nunca se mueve al vender, ganancia que ignora el descuento) y expone su superficie pública (`/order`) a manipulación de precios desde anónimos. Nada de esto se nota con 42 ventas y 2-3 usuarios — pero son bombas de tiempo: el desajuste se acumula en cada operación y no se descubre hasta que los socios no logran cuadrar las cifras meses después. **Calibrado al negocio real, es una excelente herramienta interna a 5-6 correcciones críticas de ser confiable; calibrado contra "clase mundial / multi-tenant", le falta la columna vertebral de ingeniería de datos** (transaccionalidad, validación, identidad de usuario, auditoría, versionado de esquema). El diagnóstico es alentador: los huecos críticos son acotados, anclados en archivos concretos y mayormente baratos de cerrar — no requieren rediseño, requieren disciplina financiera y atomicidad.

## 2. Puntaje por dimensión

| Dimensión | Nota (1-10) | Veredicto en una frase |
|---|---|---|
| **Seguridad** | 4 | Mecánica de auth sólida (JWT fail-closed, rate-limit, RLS anti-anon), pero `submitOrder` confía en precios del cliente y el `service_role` universal hace que cualquier bug exponga toda la BD. |
| **Arquitectura** | 5 | Rutas y separación server/client bien hechas, pero cero validación (Zod instalado sin usar), cero try/catch, sin tipos de Supabase y lógica cotización→venta triplicada y divergente. |
| **Base de datos** | 4 | Modelo normalizado y columnas GENERATED disciplinadas, pero **ninguna** escritura multi-tabla es transaccional y el esquema real (incluida una RPC crítica) no está versionado en el repo. |
| **UX (flujos)** | 5 | Flujos estrella (cotización, portal) a nivel producto; flujos internos de dinero/stock a nivel prototipo, con dos botones que hacen "lo mismo" con efectos distintos y cero loading/error states. |
| **UI (diseño)** | 6 | Se ve premium pantalla a pantalla, pero conviven 3 paletas, 24 tamaños de fuente y 9 radios; el design system definido (`.pc-*`, Button, GlassCard) está casi sin usar. |
| **Performance** | 5 | Bien con el volumen actual, pero trae tablas completas y agrega en JS/cliente, sin caché, con bundles de 2k+ líneas y `framer-motion` muerto en deps. |
| **Escalabilidad** | 3 | Mono-tenant sin `org_id`; SELECT full-table sin paginación real y límites duros (500/2000) que truncan KPIs en silencio al crecer. |
| **Lógica de negocio** | 4 | IVA fiscalmente correcto y consistente, pero reparto de socios y definición de "ganancia" corrompen el ROI por tres caminos distintos. |
| **IA / Automatización** | 3 | Excelente motor estadístico de predicción/churn, pero cero IA generativa, cero jobs/cron y cero salida automática: predice pero no actúa. |
| **Funcionalidad** | 6 | Cobertura ERP/CRM amplia para el nicho, pero faltan piezas table-stakes: export Excel/CSV, búsqueda global, historial de pagos, recepción parcial de pedidos. |

## 3. Errores críticos

Hallazgos verificados leyendo el código fuente. Todos corrompen datos financieros o abren un hueco explotable.

- **`marcarVendida()` crea la venta sin insertar `venta_socios`** — `src/app/(dashboard)/cotizaciones/actions.ts:202-256`. Verificado: la función inserta `ventas` (línea 204) y `venta_items` (línea 237), descuenta inventario (línea 248) y marca la cotización aceptada (línea 260), pero **nunca** toca `venta_socios`. `saveVenta` sí lo hace (`ventas/actions.ts:108-128`). Consecuencia: **toda venta convertida desde cotización aporta $0 al ROI de ambos socios** y desaparece del capital recuperado en `/finanzas`. *Por qué importa:* es corrupción financiera silenciosa por el camino de conversión más usado del negocio.

- **Vender nunca descuenta inventario en ventas directas ni en el portal** — `src/app/(dashboard)/ventas/actions.ts:43-148`. Verificado: `saveVenta` inserta la venta con `inventario_descontado: false` (línea 66) y crea items, pero **no llama a `descontar_inventario_venta`** ni mueve `stock_actual`. El único camino que descuenta stock es `marcarVendida` (RPC en `cotizaciones/actions.ts:248`). *Por qué importa:* el `stock_actual` miente sistemáticamente, y con él mienten capital invertido, valor de inventario y lo que el portal `/order` muestra como disponible. Rompe la promesa central de un ERP.

- **`submitOrder` confía en el precio y el `producto_id` enviados por el cliente** — `src/app/order/actions.ts:128-294`. Verificado: el `subtotal` se calcula con `i.precio * i.cantidad` (línea 213-214) usando el precio que envía el navegador, y se persiste en `cotizacion_items.precio_unitario`. Como `/order` es público y corre con `service_role`, cualquier anónimo puede inyectar precios arbitrarios (incluso negativos) y `producto_id` no validados. *Por qué importa:* manipulación de precios e inyección de datos directa en la BD productiva desde una superficie sin login.

- **Tres caminos cotización→venta divergentes** — `src/app/(dashboard)/cotizaciones/actions.ts:173-276` y `src/app/(dashboard)/ventas/actions.ts:43`. Verificado: `marcarVendida`, `saveVenta` (con `cotizacion_id`) y el link UI `/ventas/nueva?cotizacion=` construyen ventas con reglas distintas y **ya divergieron** (`marcarVendida` no setea `cantidad_pagada`/`estatus`/`inventario_descontado`, no crea `venta_socios`; `saveVenta` no descuenta inventario). *Por qué importa:* es la causa raíz arquitectónica de los dos primeros errores — sin una sola `crearVentaDesdeCotizacion()` los flujos seguirán derivando.

- **Enumeración de clientes y fuga de PII por búsqueda de teléfono** — `src/app/order/actions.ts:56-72`. Verificado: `buscarClientePorTelefono` usa `.ilike("telefono", "%" + digits + "%")` (match por **substring**, línea 68) y devuelve `nombre, nombre_negocio, email, ciudad` (línea 67). *Por qué importa:* desde el portal público, cualquiera puede sondear sufijos de números y scrapear la cartera de clientes con su PII.

- **Ninguna escritura multi-tabla es transaccional** — `src/app/(dashboard)/ventas/actions.ts:50-134`, `cotizaciones/actions.ts:202-268`, `pedidos/actions.ts:251-272`. Verificado en `saveVenta`: 4 operaciones secuenciales (venta → items → socios → cotización) sin transacción; los `return` intermedios (líneas 102, 132) dejan ventas a medias documentadas en el propio código ("Venta creada pero items fallaron"). *Por qué importa:* un solo fallo de red corrompe la BD financiera con ventas sin items o sin reparto. Supabase-js no abre transacciones multi-statement; la única solución correcta es encapsular en funciones plpgsql vía `.rpc()` (patrón que ya existe con `descontar_inventario_venta`).

- **La columna GENERATED `ganancia` ignora el descuento y se usa en KPIs** — `src/app/(dashboard)/page.tsx:306-316`. Verificado contra producción en la auditoría: `ganancia = subtotal − costo_productos − costo_envio` (no resta descuento), mientras `utilidad_neta` sí. Dashboard y estadísticas consumen `ganancia`. *Por qué importa:* cada venta con descuento **sobreestima** la ganancia y el margen mostrados a los socios.

## 4. Riesgos técnicos

- **No-atomicidad sistémica + esquema fuera del repo**: el DDL real (25 tablas, columnas GENERATED, la RPC `descontar_inventario_venta`) vive **solo** en Supabase, sin `supabase/migrations`. Si se pierde el proyecto, la lógica de inventario no es reproducible. No hay PITR/backup documentado para una BD que es la única fuente de verdad de ~$300k MXN de inversión.
- **Cero validación de input**: `zod` está instalado pero sin un solo uso; las server actions (incluido el público `submitOrder`) insertan números/strings/UUIDs sin validar. Sin try/catch ni observabilidad en los 7 `actions.ts`.
- **`service_role` universal**: toda la app bypassa RLS, así que un bug de validación o IDOR expone/corrompe la base entera; RLS solo protege contra `anon`, no contra tráfico autenticado.
- **Race conditions en stock y folios**: read-modify-write de `stock_actual` (lost updates) y numeración por `count()+1` sin `UNIQUE`, en ventas, cotizaciones y pedidos.
- **No escala por volumen**: SELECT full-table + agregación en JS/cliente, límites duros (500/2000) que truncan KPIs en silencio, sin caché ni índices en columnas calientes.
- **Sin tipos de Supabase ni tests**: queries `any` casteadas a mano en ~30 sitios; cero tests sobre lógica financiera trivialmente testeable (IVA, reparto, estatus, folios).

## 5. Riesgos de negocio

- **ROI y comisiones de socios no confiables**: las ventas desde cotización no entran al ROI (`venta_socios` ausente) y las ventas directas reparten 50/50 sobre el total **con IVA**, contradiciendo el modelo real (reparto por cobrador). Las cifras que ven Sandra y Benjamin están sesgadas — riesgo directo de disputa entre socios.
- **Inventario que miente**: el stock no baja al vender por la mayoría de los caminos, habilitando sobreventa y decisiones de reposición sobre datos falsos.
- **Ganancia/margen sobreestimados** cuando hay descuento, distorsionando decisiones de precio.
- **Superficie pública manipulable**: precios inyectables y PII de clientes filtrable desde `/order` sin autenticación.
- **Sin auditoría ni identidad**: contraseña compartida y borrados destructivos (`eliminarVenta`, `deleteCliente` en cascada) sin rastro de quién/cuándo — imposible forense o rollback, bloqueante para escalar o vender a terceros.
- **Deuda operativa en pedidos**: cargar un pedido correcto todavía requiere scripts Python ad-hoc (BRL, envío multi-tramo, inversión en `/finanzas`), y **editar un pedido en la UI sobreescribe esas correcciones manuales** — riesgo de corromper el costeo del pedido más grande del negocio.
- **Brechas competitivas table-stakes**: sin export Excel/CSV (bloquea conciliación contable), sin búsqueda global, sin facturación CFDI — límites para profesionalizar la operación y para monetizar el producto.

---

## 2. Tabla maestra de hallazgos priorizados

Orden: severidad → impacto → (menor) complejidad. Prioridad: P0 (Crítico) · P1 (Alto) · P2 (Medio) · P3 (Bajo).

| # | Prio | Sev | Área | Hallazgo | Categoría | Archivo | Imp | Cpx | Tiempo |
|---|------|-----|------|----------|-----------|---------|-----|-----|--------|
| 1 | P0 | Crítico | Cotizaciones | marcarVendida() crea la venta SIN insertar venta_socios → corrompe ROI y reportes financieros | Lógica de negocio | src/app/(dashboard)/cotizaciones/actions.ts:202-256 | 10 | 3 | 2h |
| 2 | P0 | Crítico | Inventario | El stock NO se descuenta en ventas directas ni en el portal /order — solo desde cotización confirmada | Lógica de negocio | src/app/(dashboard)/ventas/actions.ts:43-148 | 10 | 5 | 1-2d |
| 3 | P0 | Crítico | Seguridad | submitOrder confía en precio y producto_id del cliente (manipulación de precios + inyección de datos desde anónimos) | Seguridad | src/app/order/actions.ts:128-294 | 9 | 4 | 3-4h |
| 4 | P0 | Crítico | Lógica de negocio y finanzas | marcarVendida no crea venta_socios: las ventas convertidas desde cotización desaparecen del ROI | Lógica de negocio | src/app/(dashboard)/cotizaciones/actions.ts:173-276 | 9 | 4 | 1d |
| 5 | P0 | Crítico | Cotizaciones | Lógica cotización→venta duplicada y divergente (3 caminos, reglas distintas) | Arquitectura | src/app/(dashboard)/cotizaciones/actions.ts:173-276 | 9 | 5 | 1-2d |
| 6 | P0 | Crítico | UX y flujos | Dos caminos cotización→venta con efectos secundarios divergentes (inventario sí / inventario no) | Lógica de negocio | src/app/(dashboard)/cotizaciones/[id]/cotizacion-detail.tsx:193-216 | 9 | 6 | 2-4d |
| 7 | P1 | Alto | Pedidos de compra | Crear un pedido NO registra la inversión en /finanzas — el ROI queda inflado hasta correr un script | Lógica de negocio | src/app/(dashboard)/pedidos/actions.ts:226-273 | 8 | 4 | 1d |
| 8 | P1 | Alto | Base de datos y capa de datos | crearPedido / editarPedido / agregarItemsPedido: stock e items sin atomicidad (loop de awaits) | Base de datos | src/app/(dashboard)/pedidos/actions.ts:226-273 | 8 | 6 | 2d |
| 9 | P1 | Alto | Comparativa mundial | Sin export a Excel/CSV — capacidad table-stakes ausente en todo el ERP | Funcionalidad | src/app/(dashboard)/finanzas/page.tsx:496-578 | 7 | 2 | 1-2d |
| 10 | P1 | Alto | Ventas | Dos definiciones distintas de 'Ganancia' con la misma etiqueta entre pantallas | Lógica de negocio | src/app/(dashboard)/ventas/[id]/page.tsx:221-226 | 7 | 3 | 4-6h |
| 11 | P1 | Alto | Inventario | actualizarTipoCambio reescribe TODO el inventario vía window.prompt sin confirmación ni preview | UX | src/app/(dashboard)/inventario/inventario-view.tsx:1208-1238 | 7 | 3 | 3-5h |
| 12 | P1 | Alto | Finanzas & Dashboard | Ventas canceladas se cuentan en recuperación de capital y reparto de socios (finanzas) | Lógica de negocio | src/app/(dashboard)/finanzas/page.tsx:86-89, 109-111, 166-180 | 7 | 3 | 2h |
| 13 | P1 | Alto | Portal público /order | submitOrder confía en el precio enviado por el cliente y lo persiste | Seguridad | src/app/order/actions.ts:213-216, 278-287 | 7 | 3 | 2-3h |
| 14 | P1 | Alto | Portal público /order | Enumeración de clientes y fuga de PII vía búsqueda por teléfono (substring ilike) | Seguridad | src/app/order/actions.ts:56-72 | 7 | 3 | 2-4h |
| 15 | P1 | Alto | Lógica de negocio y finanzas | La columna GENERATED 'ganancia' ignora el descuento; dashboard y estadísticas la usan → ganancia/margen sobreestimados | Lógica de negocio | src/app/(dashboard)/page.tsx:306-316, 366 | 7 | 3 | 3-4h |
| 16 | P1 | Alto | Base de datos y capa de datos | Sin control de versiones del esquema: el DDL real solo vive en Supabase | Mantenibilidad | scripts/ | 7 | 4 | 2-3d |
| 17 | P1 | Alto | Ventas | Reparto venta_socios 50/50 sobre el TOTAL (con IVA) contradice la regla de negocio y se descuadra al editar | Lógica de negocio | src/app/(dashboard)/ventas/actions.ts:108-134 | 7 | 5 | 1-2d |
| 18 | P1 | Alto | Ventas | Vender NUNCA descuenta inventario — el stock jamás se mueve | Lógica de negocio | src/app/(dashboard)/ventas/actions.ts:43-148 | 7 | 6 | 2-3d |
| 19 | P1 | Alto | Ventas | Creación de venta no es transaccional: fallo a media deja venta huérfana o sin reparto | Base de datos | src/app/(dashboard)/ventas/actions.ts:50-134 | 7 | 6 | 1d |
| 20 | P1 | Alto | Ventas | Pagos parciales sin historial de abonos — solo un acumulado sobreescribible | Funcionalidad | src/app/(dashboard)/ventas/[id]/editar/edit-form.tsx:100-115 | 7 | 6 | 2d |
| 21 | P1 | Alto | Pedidos de compra | El modelo no soporta la moneda real del proveedor (BRL) — cada pedido de cintas requiere un script manual | Arquitectura | src/app/(dashboard)/pedidos/actions.ts:11-15, 138-154 | 7 | 6 | 2-3d |
| 22 | P1 | Alto | Pedidos de compra | Los tramos de envío (pedido_envios) son 'informativos' y NO alimentan el costeo — el envío real se calcula a mano | Lógica de negocio | src/app/(dashboard)/pedidos/[id]/page.tsx:432-433 | 7 | 6 | 2d |
| 23 | P1 | Alto | Base de datos y capa de datos | marcarVendida: inventario descontado sin atomicidad con la venta | Base de datos | src/app/(dashboard)/cotizaciones/actions.ts:173-276 | 7 | 6 | 1-2d |
| 24 | P1 | Alto | Ventas | La página carga TODOS los venta_items 3 veces y filtra en memoria — no escala | Performance | src/app/(dashboard)/ventas/page.tsx:20-94 | 7 | 7 | 3-5d |
| 25 | P1 | Alto | Pedidos de compra | Ninguna operación de pedido es transaccional — fallo a media escritura corrompe stock y costos sin rollback | Base de datos | src/app/(dashboard)/pedidos/actions.ts:251-272, 381-430, 498-544 | 7 | 7 | 1-2d |
| 26 | P1 | Alto | UX y flujos | Venta manual no genera items ni descuenta inventario — corrupción silenciosa de stock y reportes | Lógica de negocio | src/app/(dashboard)/ventas/venta-form.tsx:82-119, 354-405 | 7 | 7 | 3-5d |
| 27 | P1 | Alto | Finanzas & Dashboard | Las ventas canceladas se incluyen en KPIs del mes (ventas, ganancia, ticket) | Lógica de negocio | src/app/(dashboard)/page.tsx:142-150, 305-323 | 6 | 2 | 1h |
| 28 | P1 | Alto | Portal público /order | producto_id y clienteExistenteId no se validan: IDOR y reasignación de pedidos | Seguridad | src/app/order/actions.ts:170-173, 278-287 | 6 | 3 | 2-3h |
| 29 | P1 | Alto | Inventario | El recálculo masivo de TC desincroniza productos.costo (NOT NULL) y deja capital/margen inconsistentes | Base de datos | src/app/(dashboard)/inventario/actions.ts:276-300 | 6 | 4 | 3-4h |
| 30 | P1 | Alto | Inventario | El edit de stock no registra ni valida contra ventas; permite poner stock por debajo de lo ya vendido sin rastro | Lógica de negocio | src/app/(dashboard)/inventario/actions.ts:164-196 | 6 | 4 | 4-6h |
| 31 | P1 | Alto | Portal público /order | Rate-limit por IP es evadible (x-forwarded-for falsificable, no distribuido) | Seguridad | src/lib/rate-limit.ts:69-75 | 6 | 4 | 3-6h |
| 32 | P1 | Alto | Arquitectura y mantenibilidad | Cero validación de input en server actions; zod está instalado pero sin usar | Seguridad | src/app/order/actions.ts:128-211 | 6 | 4 | 1-2d |
| 33 | P1 | Alto | UI / Design System | focus-visible/accesibilidad de teclado ausente en la mayoría de interactivos | Accesibilidad | src/components/sidebar-nav.tsx:34-58 | 6 | 4 | 2-3d |
| 34 | P1 | Alto | IA y automatización | Cero automatización de salida: el churn risk se calcula pero nadie es avisado | Automatización | src/app/(dashboard)/clientes/lib-prediccion.ts:171-176 | 6 | 4 | 2-3d |
| 35 | P1 | Alto | Base de datos y capa de datos | Hard-delete en cascada manual sin auditoría ni soft-delete (ventas, pedidos, items) | Base de datos | src/app/(dashboard)/ventas/actions.ts:530-565 | 6 | 5 | 2-3d |
| 36 | P1 | Alto | Performance | Componentes 'use client' de 1500-2245 líneas con react-table + recharts + predicción en el mismo bundle | Performance | src/app/(dashboard)/clientes/clientes-dashboard.tsx:1-60, 1281-1294 | 6 | 5 | 1d |
| 37 | P1 | Alto | Lógica de negocio y finanzas | saveVenta fuerza reparto 50/50 que contradice el modelo real y corrompe el ROI | Lógica de negocio | src/app/(dashboard)/ventas/actions.ts:108-128 | 6 | 5 | 1-2d |
| 38 | P1 | Alto | Arquitectura y mantenibilidad | Mutaciones multi-paso sin transacción → datos huérfanos (venta sin items, cotización del portal sin items) | Arquitectura | src/app/(dashboard)/ventas/actions.ts:50-134 | 6 | 6 | 1-2d |
| 39 | P1 | Alto | Base de datos y capa de datos | Snapshot de costo global muta el costeo histórico de inventario al editar un pedido | Lógica de negocio | src/app/(dashboard)/pedidos/actions.ts:51-67 | 6 | 6 | 2-3d |
| 40 | P1 | Alto | Seguridad | Modelo de auth sin identidad de usuario: sin revocación, sin MFA, sin auditoría, JWT de 30 días sin jti | Seguridad | src/lib/auth.ts:15-54 | 6 | 6 | 3-5d |
| 41 | P1 | Alto | Comparativa mundial | Sin usuarios, roles ni audit trail — todo bajo una contraseña compartida | Seguridad | src/lib/auth.ts:32 | 6 | 7 | 1-2 sem |
| 42 | P1 | Alto | Seguridad | Uso universal de service_role: cualquier bug de validación expone/corrompe toda la BD | Arquitectura | src/lib/supabase/server.ts:20-43 | 6 | 8 | 1-2 sem |
| 43 | P2 | Medio | IA y automatización | NL→cotización: convertir lenguaje natural / WhatsApp en una cotización completa | IA | src/app/(dashboard)/cotizaciones/nueva/cotizacion-form.tsx | 7 | 5 | 3-4d |
| 44 | P2 | Medio | UX y flujos | Cero loading states / skeletons / error.tsx en toda la app — pantallas en blanco al navegar | UX | src/app/(dashboard) | 6 | 3 | 1-2d |
| 45 | P2 | Medio | IA y automatización | Sin dunning automático de saldos pendientes | Automatización | src/app/(dashboard)/ventas/actions.ts:36-41 | 6 | 3 | 1-2d |
| 46 | P2 | Medio | UX y flujos | Pérdida de datos sin aviso: formularios largos sin beforeunload ni autosave | UX | src/app/(dashboard)/cotizaciones/nueva/cotizacion-form.tsx:62-98 | 6 | 4 | 1-2d |
| 47 | P2 | Medio | IA y automatización | Resumen de cliente con IA + Next-Best-Action accionable en la ficha | IA | src/app/(dashboard)/clientes/cliente-drawer.tsx:321 | 6 | 4 | 2-3d |
| 48 | P2 | Medio | Comparativa mundial | Sin gestión de tareas/actividades ni timeline por cliente (CRM incompleto) | Funcionalidad | src/app/(dashboard)/clientes/lib-prediccion.ts:20-37 | 6 | 4 | 3-5d |
| 49 | P2 | Medio | Inventario | Alertas de stock binarias (bajo/agotado) sin velocidad de venta ni días de cobertura ni reorden real | IA | src/app/(dashboard)/inventario/inventario-view.tsx:997-1014 | 6 | 5 | 1-2d |
| 50 | P2 | Medio | Pedidos de compra | El prorrateo de envío es parejo por unidad — castiga cintas livianas y subsidia cremas pesadas | Lógica de negocio | src/app/(dashboard)/pedidos/actions.ts:216-217 | 6 | 5 | 1-2d |
| 51 | P2 | Medio | Comparativa mundial | Sin automatizaciones/recordatorios — las alertas se calculan pero no se notifican | Automatización | src/app/(dashboard)/page.tsx:434-450 | 6 | 5 | 3-5d |
| 52 | P2 | Medio | Cotizaciones | Envío al cliente inexistente: sin email, sin link compartible, sin WhatsApp con PDF | Funcionalidad | src/app/(dashboard)/cotizaciones/[id]/cotizacion-detail.tsx:126-240 | 6 | 6 | 3-5d |
| 53 | P2 | Medio | Pedidos de compra | No hay recepción parcial: el stock se suma 100% al crear el pedido, no al recibir la mercancía | Funcionalidad | src/app/(dashboard)/pedidos/actions.ts:266-268 | 6 | 6 | 2-3d |
| 54 | P2 | Medio | IA y automatización | OCR de facturas del proveedor brasileño para precargar el pedido | IA | src/app/(dashboard)/pedidos/actions.ts:818-840 | 6 | 6 | 4-5d |
| 55 | P2 | Medio | Comparativa mundial | Todo en MXN aunque el negocio es nativamente USD/BRL — sin multi-moneda transaccional | Lógica de negocio | src/app/(dashboard)/finanzas/page.tsx:16-21 | 6 | 6 | 1 sem |
| 56 | P2 | Medio | Cotizaciones | Generación de PDF 100% en cliente con html2pdf/html2canvas: frágil, lenta y sin multi-página real | Performance | src/lib/pdf.ts:37-74 | 6 | 7 | 3-5d |
| 57 | P2 | Medio | Ventas | updateVenta puede revivir una venta cancelada al recalcular estatus | Lógica de negocio | src/app/(dashboard)/ventas/actions.ts:395-419 | 5 | 2 | 2h |
| 58 | P2 | Medio | Portal público /order | Falta validación/sanitización de formato de email, teléfono y longitud de campos | Seguridad | src/app/order/actions.ts:139-155, 190-211 | 5 | 2 | 2h |
| 59 | P2 | Medio | Arquitectura y mantenibilidad | formatMXN existe en utils.ts pero 42 archivos reinventan el formateo de moneda | Mantenibilidad | src/lib/utils.ts:9-30 | 5 | 2 | 3h |
| 60 | P2 | Medio | Base de datos y capa de datos | Sin estrategia de backups documentada ni point-in-time recovery verificado | Escalabilidad | scripts/enable-rls.sql:117-119 | 5 | 2 | 0.5d |
| 61 | P2 | Medio | Lógica de negocio y finanzas | topProductos en estadísticas no excluye items internos (Piel Canela) ni respeta el filtro de periodo | Lógica de negocio | src/app/(dashboard)/ventas/actions.ts:238-264 | 5 | 2 | 2h |
| 62 | P2 | Medio | Cotizaciones | Editar cotización vendida puede desincronizar venta e inventario | Lógica de negocio | src/app/(dashboard)/cotizaciones/[id]/cotizacion-detail.tsx:217-223 | 5 | 3 | 3h |
| 63 | P2 | Medio | Arquitectura y mantenibilidad | Sin tipos generados de Supabase: queries 100% sin tipar, drift de esquema invisible | Mantenibilidad | src/lib/supabase/server.ts:20 | 5 | 3 | 1d |
| 64 | P2 | Medio | Base de datos y capa de datos | Faltan constraints UNIQUE/CHECK en BD; las invariantes viven solo en JS | Base de datos | src/app/(dashboard)/inventario/actions.ts:199-231 | 5 | 3 | 1d |
| 65 | P2 | Medio | UX y flujos | Página 'Confirmar pedido' no confirma nada — nombre y CTA engañosos | UX | src/app/(dashboard)/cotizaciones/[id]/confirmar/page.tsx:237-265 | 5 | 3 | 0.5d |
| 66 | P2 | Medio | UX y flujos | Formularios sin submit por teclado (Enter) y sin autoFocus | Accesibilidad | src/app/(dashboard)/ventas/venta-form.tsx:466-474 | 5 | 3 | 1d |
| 67 | P2 | Medio | Comparativa mundial | Sin app móvil/PWA real pese a uso de campo (portal y captura desde celular) | UX | src/app/(dashboard)/layout.tsx:36-160 | 5 | 3 | 2-3d |
| 68 | P2 | Medio | Ventas | eliminarVenta hace borrado físico sin restaurar inventario ni soft-delete | Lógica de negocio | src/app/(dashboard)/ventas/actions.ts:530-565 | 5 | 4 | 1d |
| 69 | P2 | Medio | Cotizaciones | Estatus 'vencida' nunca se aplica automáticamente — pipeline siempre desfasado | Lógica de negocio | src/app/(dashboard)/cotizaciones/actions.ts:291-313 | 5 | 4 | 1d |
| 70 | P2 | Medio | Pedidos de compra | agregarItemsPedido infiere el ratio de inversión por socio dividiendo, perdiendo precisión y arrastrando errores | Lógica de negocio | src/app/(dashboard)/pedidos/actions.ts:409-416 | 5 | 4 | 0.5-1d |
| 71 | P2 | Medio | Shell, navegación y notificaciones | Componentes UI base (Button/GlassCard) sin usar — shell construido con estilos inline | Mantenibilidad | src/components/ui/button.tsx:6-41 | 5 | 4 | 1-2d |
| 72 | P2 | Medio | Arquitectura y mantenibilidad | Cero try/catch y cero observabilidad en los 7 server actions | Arquitectura | src/app/(dashboard)/cotizaciones/actions.ts:1-617 | 5 | 4 | 1d |
| 73 | P2 | Medio | Escalabilidad | Rate-limit in-memory no funciona con múltiples instancias serverless | Escalabilidad | src/lib/rate-limit.ts:14-57 | 5 | 4 | 1d |
| 74 | P2 | Medio | Escalabilidad | Restock de inventario con read-modify-write en JS, sin atomicidad | Base de datos | src/app/(dashboard)/cotizaciones/actions.ts:557-578 | 5 | 4 | 1d |
| 75 | P2 | Medio | Escalabilidad | Portal /order con force-dynamic re-lee catálogo completo + vista_inventario en cada visita | Performance | src/app/order/page.tsx:5-39 | 5 | 4 | 1d |
| 76 | P2 | Medio | IA y automatización | Sin envío automático de cotización: PDF solo se descarga y se manda a mano por WhatsApp | Automatización | src/app/(dashboard)/cotizaciones/[id]/confirmar/page.tsx:92 | 5 | 4 | 2-3d |
| 77 | P2 | Medio | IA y automatización | Re-prorrateo de envío sigue dependiendo de scripts Python manuales fuera de la app | Automatización | scripts/fix-pedido-3-envio-facturas.py:95-139 | 5 | 4 | 2-3d |
| 78 | P2 | Medio | IA y automatización | Forecast de ventas/ingresos y detección de anomalías ausentes | IA | src/app/(dashboard)/ventas/actions.ts:267-329 | 5 | 4 | 2-3d |
| 79 | P2 | Medio | Ventas | Sin auditoría de cambios en operaciones financieras sensibles | Arquitectura | src/app/(dashboard)/ventas/actions.ts:451-524 | 5 | 5 | 1-2d |
| 80 | P2 | Medio | Cotizaciones | Race condition + N queries en la numeración consecutiva por cliente | Base de datos | src/app/(dashboard)/cotizaciones/actions.ts:52-90 | 5 | 5 | 1d |
| 81 | P2 | Medio | Pedidos de compra | Las 13 columnas derivadas de pedido_compra_items se calculan a mano en 4 lugares (itemFields + 3 scripts) — duplicación = causa raíz de la fragilidad | Mantenibilidad | src/app/(dashboard)/pedidos/actions.ts:20-47 | 5 | 5 | 1-2d |
| 82 | P2 | Medio | Finanzas & Dashboard | Falta P&L / Estado de resultados — no hay COGS ni gastos consolidados en Finanzas | Funcionalidad | src/app/(dashboard)/finanzas/page.tsx:269-323 | 5 | 5 | 1 sem |
| 83 | P2 | Medio | Shell, navegación y notificaciones | Notificaciones por polling cada 8s a tabla completa, siempre activo y no realtime | Escalabilidad | src/components/notifications.tsx:134-151 | 5 | 5 | 1-2d |
| 84 | P2 | Medio | Shell, navegación y notificaciones | Dos sistemas de notificación paralelos e inconsistentes (campana vs PortalBadge) | UX | src/app/(dashboard)/portal-badge.tsx:27-86 | 5 | 5 | 1-2d |
| 85 | P2 | Medio | Arquitectura y mantenibilidad | Queries Supabase crudas regadas: ausencia de capa de acceso a datos / repositorio | Arquitectura | src/app/(dashboard)/page.tsx:110-223 | 5 | 5 | 2-3d |
| 86 | P2 | Medio | Base de datos y capa de datos | Creación de venta NO transaccional: corrupción financiera si falla a la mitad | Base de datos | src/app/(dashboard)/ventas/actions.ts:50-134 | 5 | 5 | 1-2d |
| 87 | P2 | Medio | Performance | Cero caché en lecturas: cada navegación re-ejecuta 15+ queries a Supabase | Performance | src/app/(dashboard)/page.tsx:125-216 | 5 | 5 | 1d |
| 88 | P2 | Medio | Escalabilidad | Notificaciones por polling global cada 8s — escala con usuarios y full-scan | Escalabilidad | src/components/notifications.tsx:134-144 | 5 | 5 | 2-3d |
| 89 | P2 | Medio | UI / Design System | Tipografía fragmentada en ~24 tamaños arbitrarios en px | UI | src/components/page-header.tsx:177, 197, 217, 239, 298, 314 | 5 | 5 | 2-3d |
| 90 | P2 | Medio | UI / Design System | Estilos pintados con hex inline y style={{}} en vez de tokens — bloquea theming | Mantenibilidad | src/app/(dashboard)/layout.tsx:43-148 | 5 | 5 | 3-4d |
| 91 | P2 | Medio | Comparativa mundial | IA que predice pero no actúa — la predicción de recompra no dispara nada | IA | src/app/(dashboard)/clientes/lib-prediccion.ts:87-255 | 5 | 5 | 1 sem |
| 92 | P2 | Medio | Comparativa mundial | Sin búsqueda global ni command palette (Cmd+K) | UX | src/components/sidebar-nav.tsx:15-23 | 5 | 5 | 3-5d |
| 93 | P2 | Medio | Cotizaciones | Sin transacción atómica: marcarVendida puede dejar estado parcial irrecuperable | Base de datos | src/app/(dashboard)/cotizaciones/actions.ts:202-268 | 5 | 6 | 1d |
| 94 | P2 | Medio | Finanzas & Dashboard | Falta flujo de caja real (entradas cobradas vs salidas de inversión/compras) | Funcionalidad | src/app/(dashboard)/finanzas/page.tsx:182-209 | 5 | 6 | 1 sem |
| 95 | P2 | Medio | Finanzas & Dashboard | Forecast / narrativa IA ausente — Insights son reglas if/else triviales | IA | src/app/(dashboard)/page.tsx:389-450 | 5 | 6 | 1-2 sem |
| 96 | P2 | Medio | Shell, navegación y notificaciones | No existe búsqueda global en todo el shell | UX | src/components/sidebar-nav.tsx:15-23 | 5 | 6 | 3-5d |
| 97 | P2 | Medio | Shell, navegación y notificaciones | No hay command palette (⌘K) ni atajos de teclado en el shell | UX | src/app/(dashboard)/layout.tsx:35-160 | 5 | 6 | 3-4d |
| 98 | P2 | Medio | Arquitectura y mantenibilidad | God components de 1.5k–2.2k líneas concentran tabla + filtros + modales + lógica | Mantenibilidad | src/app/(dashboard)/clientes/clientes-dashboard.tsx:1-2245 | 5 | 6 | 2-3d |
| 99 | P2 | Medio | Performance | Predicción de compras y enriquecimiento de clientes se computan en el navegador con TODAS las ventas/items/cotizaciones | Performance | src/app/(dashboard)/clientes/clientes-dashboard.tsx:328-419 | 5 | 6 | 1-2d |
| 100 | P2 | Medio | Performance | Listas con react-table traen el dataset completo (limit 500/2000) y paginan en cliente | Escalabilidad | src/app/(dashboard)/cotizaciones/page.tsx:16-41 | 5 | 6 | 1-2d |
| 101 | P2 | Medio | UX y flujos | Tablas anchas en móvil: scroll horizontal como única estrategia responsive | UI | src/app/(dashboard)/ventas/ventas-table-premium.tsx:1256-1304 | 5 | 6 | 2-3d |
| 102 | P2 | Medio | Inventario | No existe kardex ni trazabilidad de movimientos de inventario | Arquitectura | src/app/(dashboard)/inventario/actions.ts:161-196 | 5 | 7 | 1 sem |
| 103 | P2 | Medio | UI / Design System | Tres paletas de color conviven sin jerarquía — deriva visual entre módulos | UI | src/app/globals.css:127-186, 454-523 | 5 | 7 | 3-5d |
| 104 | P2 | Medio | Comparativa mundial | Sin facturación fiscal (CFDI) ni capa contable mínima | Funcionalidad | src/app/(dashboard)/ventas/actions.ts | 5 | 8 | 2-4 sem |
| 105 | P2 | Medio | Escalabilidad | Arquitectura mono-tenant sin org_id ni RLS por tenant: imposible multi-empresa sin re-arquitectura | Escalabilidad | src/lib/supabase/server.ts:20-43 | 5 | 9 | 3-6 sem |
| 106 | P2 | Medio | Inventario | Doble query idéntica a precios_producto en page.tsx; preciosBySku se construye y se descarta | Performance | src/app/(dashboard)/inventario/page.tsx:63-92 | 4 | 1 | 30m |
| 107 | P2 | Medio | Performance | framer-motion en dependencias pero nunca importado (peso muerto en el árbol de deps) | Mantenibilidad | package.json | 4 | 1 | 15min |
| 108 | P2 | Medio | Cotizaciones | marcarVendida() no marca inventario_descontado=true → riesgo de doble descuento de stock | Base de datos | src/app/(dashboard)/cotizaciones/actions.ts:202-256 | 4 | 2 | 1h |
| 109 | P2 | Medio | Cotizaciones | El número de cotización es 100% editable en texto libre → corrupción del formato | UX | src/app/(dashboard)/cotizaciones/nueva/cotizacion-form.tsx:553-559 | 4 | 2 | 2-3h |
| 110 | P2 | Medio | Finanzas & Dashboard | KPI 'Sandra / Benjamin' del dashboard etiquetado 'ROI total' pero no muestra ROI | UX | src/app/(dashboard)/page.tsx:510-514 | 4 | 2 | 1h |
| 111 | P2 | Medio | Portal público /order | Número de orden del portal usa Math.random sin chequeo de colisión | Base de datos | src/app/order/actions.ts:232-236 | 4 | 2 | 1h |
| 112 | P2 | Medio | Shell, navegación y notificaciones | Navegación activa sin aria-current y a11y incompleta en el shell | Accesibilidad | src/components/sidebar-nav.tsx:33-78 | 4 | 2 | 0.5d |
| 113 | P2 | Medio | Arquitectura y mantenibilidad | IDs de socios e IVA hardcodeados en múltiples archivos (constantes de negocio dispersas) | Mantenibilidad | src/app/(dashboard)/ventas/actions.ts:9-10 | 4 | 2 | 2h |
| 114 | P2 | Medio | Arquitectura y mantenibilidad | Dependencias instaladas sin usar (react-hook-form, @hookform/resolvers, zod, @radix-ui/react-slot) | Mantenibilidad | package.json:11-37 | 4 | 2 | 2h |
| 115 | P2 | Medio | Arquitectura y mantenibilidad | server.ts usa SERVICE ROLE pero cablea cookies de SSR — combinación contradictoria | Arquitectura | src/lib/supabase/server.ts:26-48 | 4 | 2 | 2-3h |
| 116 | P2 | Medio | Base de datos y capa de datos | Doc engañosa: server.ts dice respetar RLS pero usa service_role (igual que admin.ts) | Mantenibilidad | src/lib/supabase/server.ts:20-43 | 4 | 2 | 3h |
| 117 | P2 | Medio | Performance | getInternalClienteIds() ejecutado secuencialmente antes del Promise.all en 12 sitios (waterfall) | Performance | src/app/(dashboard)/clientes/page.tsx:53 | 4 | 2 | 1-2h |
| 118 | P2 | Medio | Escalabilidad | Sin índices en columnas calientes de ventas/cotizaciones/items | Base de datos | scripts/enable-rls.sql | 4 | 2 | 2h |
| 119 | P2 | Medio | IA y automatización | Sincronización automática del tipo de cambio (hoy manual) | Automatización | src/app/(dashboard)/inventario/actions.ts:336-348 | 4 | 2 | 1d |
| 120 | P2 | Medio | Lógica de negocio y finanzas | ventas-dashboard llama 'ganancia bruta' a subtotal − costo_productos, omitiendo costo_envio | Lógica de negocio | src/app/(dashboard)/ventas/ventas-dashboard.tsx:164-184 | 4 | 2 | 2-3h |
| 121 | P2 | Medio | Ventas | Sin validación de número de venta duplicado | Lógica de negocio | src/app/(dashboard)/ventas/venta-form.tsx:135-148 | 4 | 3 | 3-4h |
| 122 | P2 | Medio | Cotizaciones | duplicarCotizacion genera número '-COPIA-' que rompe cambiarTipoNumero al venderse | Lógica de negocio | src/app/(dashboard)/cotizaciones/actions.ts:336 | 4 | 3 | 3h |
| 123 | P2 | Medio | Inventario | Preview optimista de imagen y subida sin debounce/cancel; el preview persiste si el componente se desmonta tras error | UX | src/app/(dashboard)/inventario/image-upload.tsx:34-75 | 4 | 3 | 2-3h |
| 124 | P2 | Medio | Inventario | Race condition en read-then-write de stock al revertir cotización (y patrón replicado) | Base de datos | src/app/(dashboard)/cotizaciones/actions.ts:557-583 | 4 | 3 | 3-4h |
| 125 | P2 | Medio | Pedidos de compra | El número correlativo de pedido tiene race condition (count+1) y se rompe si se borra un pedido | Base de datos | src/app/(dashboard)/pedidos/actions.ts:181-184 | 4 | 3 | 0.5d |
| 126 | P2 | Medio | Finanzas & Dashboard | Fórmula de ROI promedio del hero difiere de la fórmula por socio | Lógica de negocio | src/app/(dashboard)/finanzas/page.tsx:139-140, 263-267 | 4 | 3 | 1-2h |
| 127 | P2 | Medio | Finanzas & Dashboard | Falta cuentas por cobrar pese a que ventas.saldo_pendiente existe (GENERATED) | Funcionalidad | src/app/(dashboard)/finanzas/page.tsx:86-89 | 4 | 3 | 1-2d |
| 128 | P2 | Medio | Portal público /order | El stock se muestra pero no se valida/reserva en submitOrder (oversell silencioso) | Lógica de negocio | src/app/order/actions.ts:149-155, 278-287 | 4 | 3 | 2-3h |
| 129 | P2 | Medio | Arquitectura y mantenibilidad | Sin error/loading/not-found boundaries en toda la app | UX | src/app/(dashboard) | 4 | 3 | 0.5d |
| 130 | P2 | Medio | Arquitectura y mantenibilidad | Cero tests en un ERP con lógica financiera no trivial | Mantenibilidad | package.json:5-9 | 4 | 3 | 0.5-1d |
| 131 | P2 | Medio | Base de datos y capa de datos | Notificaciones con REPLICA IDENTITY FULL y .select('*') — fuga de PII por Realtime | Seguridad | src/components/notifications-actions.ts:42 | 4 | 3 | 0.5d |
| 132 | P2 | Medio | Seguridad | Inyección de filtro PostgREST en findSimilarClientes (.or con string crudo) | Seguridad | src/app/(dashboard)/clientes/actions.ts:266-272 | 4 | 3 | 1-2h |
| 133 | P2 | Medio | Seguridad | Rate-limit in-memory no distribuido: evadible en Vercel multi-instancia | Seguridad | src/lib/rate-limit.ts:12-57 | 4 | 3 | 2-4h |
| 134 | P2 | Medio | Seguridad | submitOrder/saveCliente: PII de clientes capturada desde anónimos sin validación de formato | Seguridad | src/app/order/actions.ts:189-211 | 4 | 3 | 2-3h |
| 135 | P2 | Medio | UI / Design System | Radios de esquina inconsistentes — 9 valores distintos compitiendo | UI | src/app/globals.css:42-48, 227-422 | 4 | 3 | 1d |
| 136 | P2 | Medio | UX y flujos | Empty states pobres: texto plano sin CTA ni onboarding | UX | src/app/(dashboard)/ventas/ventas-table-premium.tsx:1282-1290 | 4 | 3 | 1d |
| 137 | P2 | Medio | Pedidos de compra | El badge de status (5 estados) nunca se escribe — todos los pedidos muestran 'Recibido' para siempre | Funcionalidad | src/app/(dashboard)/pedidos/page.tsx:44-78, 258-259 | 4 | 4 | 1-2d |
| 138 | P2 | Medio | Shell, navegación y notificaciones | Perfil de usuario hardcodeado a 'Benjamín' — Sandra ve identidad incorrecta | UX | src/app/(dashboard)/layout.tsx:130-143 | 4 | 4 | 0.5-1d |
| 139 | P2 | Medio | Arquitectura y mantenibilidad | Read-modify-write de stock no atómico (race condition, lost updates) | Base de datos | src/app/(dashboard)/pedidos/actions.ts:70-89 | 4 | 4 | 0.5-1d |
| 140 | P2 | Medio | Arquitectura y mantenibilidad | Generación de número de orden consecutivo vía count() es race-prone (colisiones bajo concurrencia) | Base de datos | src/app/order/actions.ts:101-117 | 4 | 4 | 0.5d |
| 141 | P2 | Medio | Base de datos y capa de datos | submitOrder y descuento de inventario sin validación de stock: stock negativo posible | Lógica de negocio | src/app/order/actions.ts:128-294 | 4 | 4 | 1d |
| 142 | P2 | Medio | Seguridad | Falta Content-Security-Policy en los headers de seguridad | Seguridad | next.config.ts:8-26 | 4 | 4 | 3-5h |
| 143 | P2 | Medio | Seguridad | Sin pista de auditoría en operaciones destructivas/financieras | Seguridad | src/app/(dashboard)/clientes/actions.ts:114-233 | 4 | 4 | 4-6h |
| 144 | P2 | Medio | Performance | Doble fetch completo de venta_items en /ventas (segunda query fuera del Promise.all = waterfall) | Performance | src/app/(dashboard)/ventas/page.tsx:47-58, 80-94 | 4 | 4 | 2-3h |
| 145 | P2 | Medio | Performance | Gráfica de ventas mensuales: se trae TODA la tabla ventas para agregar por mes en memoria | Base de datos | src/app/(dashboard)/page.tsx:143-148 | 4 | 4 | 3-4h |
| 146 | P2 | Medio | UI / Design System | Neutral duplicado: el DS define slate, las vistas usan gray exclusivamente | UI | src/app/globals.css:143-145 | 4 | 4 | 1-2d |
| 147 | P2 | Medio | Lógica de negocio y finanzas | cotizaciones.numero sin UNIQUE: la generación de folio por count()+reintento es racy (portal concurrente) | Base de datos | src/app/(dashboard)/cotizaciones/actions.ts:52-76 | 4 | 4 | 4-6h |
| 148 | P2 | Medio | Pedidos de compra | Editar un pedido SOBREESCRIBE silenciosamente las correcciones manuales de los scripts (precios BRL, envío multi-tramo) | Lógica de negocio | src/app/(dashboard)/pedidos/[id]/editar/editar-pedido-form.tsx:84-92, 147-176 | 4 | 5 | 1d |
| 149 | P2 | Medio | Finanzas & Dashboard | Toda la agregación se hace en JS trayendo tablas completas (venta_socios sin filtro) | Performance | src/app/(dashboard)/finanzas/page.tsx:79-90, 132-252 | 4 | 5 | 2-3d |
| 150 | P2 | Medio | Portal público /order | El éxito promete 'pedido recibido' pero no hay tracking ni confirmación automática | UX | src/app/order/success/page.tsx:29-49 | 4 | 5 | 1-2d |
| 151 | P2 | Medio | Base de datos y capa de datos | Race condition en el consecutivo del número de orden (count + 1) | Base de datos | src/app/(dashboard)/cotizaciones/actions.ts:57-76 | 4 | 5 | 1d |
| 152 | P2 | Medio | Base de datos y capa de datos | Lecturas full-table sin paginación: venta_items y ventas se traen completas a memoria | Performance | src/app/(dashboard)/ventas/page.tsx:47-94 | 4 | 5 | 2-3d |
| 153 | P2 | Medio | Base de datos y capa de datos | Patrón N+1 en loops de inventario (snapshot + sumarStock por producto) | Performance | src/app/(dashboard)/pedidos/actions.ts:252-268 | 4 | 5 | 1-2d |
| 154 | P2 | Medio | Seguridad | Validación de inputs ad-hoc y sin esquema (sin Zod) en todas las server actions | Mantenibilidad | src/app/(dashboard)/ventas/actions.ts:43-148 | 4 | 5 | 1-2d |
| 155 | P2 | Medio | UI / Design System | El design system definido (.pc-*, Button, GlassCard) está casi sin usar — código de diseño muerto | Mantenibilidad | src/app/globals.css:222-437 | 4 | 6 | 1-2 sem |
| 156 | P2 | Medio | Base de datos y capa de datos | getInternalClienteIds() ejecuta un query extra en cada render de página | Performance | src/lib/internal-clientes.ts:12-19 | 3 | 2 | 2h |
| 157 | P3 | Bajo | IA y automatización | Reportes financieros narrativos generados con IA | IA | src/app/(dashboard)/ventas/estadisticas | 4 | 3 | 1-2d |
| 158 | P3 | Bajo | IA y automatización | Sugerencia de precios y descuentos asistida por margen | IA | src/app/(dashboard)/cotizaciones/nueva/cotizacion-form.tsx | 4 | 4 | 2-3d |
| 159 | P3 | Bajo | Pedidos de compra | Pagos y Conversiones miden 'cobertura' contra metas distintas sin reconciliación entre las tres fuentes de salida de dinero | UX | src/app/(dashboard)/pedidos/[id]/pagos.tsx:47-51 | 4 | 5 | 1-2d |
| 160 | P3 | Bajo | Escalabilidad | Límites fijos (limit 500/2000) usados como techo en vez de paginación real | Arquitectura | src/app/(dashboard)/ventas/page.tsx:38 | 4 | 5 | 1 sem |
| 161 | P3 | Bajo | IA y automatización | Búsqueda global / semántica y asistente conversacional sobre los datos | IA | src/components/sidebar-nav.tsx | 4 | 6 | 4-6d |
| 162 | P3 | Bajo | Comparativa mundial | Sin reportes/dashboards configurables por el usuario — todo está hardcodeado | Funcionalidad | src/app/(dashboard)/ventas/estadisticas/page.tsx | 4 | 6 | 1-2 sem |
| 163 | P3 | Bajo | Ventas | Inconsistencia de color del badge 'pendiente' entre vistas | UI | src/app/(dashboard)/ventas/[id]/editar/edit-form.tsx:18-22 | 3 | 2 | 2h |
| 164 | P3 | Bajo | Ventas | Estados de carga ausentes en navegación del módulo (sin loading.tsx) | UX | src/app/(dashboard)/ventas/page.tsx:13-58 | 3 | 2 | 3h |
| 165 | P3 | Bajo | Cotizaciones | Fetch de productos+precios duplicado idéntico en nueva y editar | Mantenibilidad | src/app/(dashboard)/cotizaciones/nueva/page.tsx:33-71 | 3 | 2 | 2h |
| 166 | P3 | Bajo | Cotizaciones | html2pdf importado en cliente pesa el bundle; sin lazy ni feedback de carga | Performance | src/lib/pdf.ts:42-43 | 3 | 2 | 1-2h |
| 167 | P3 | Bajo | Inventario | Resize de columnas: drag global sobre window sin throttle, escribe localStorage en cada onSave de ancho | Performance | src/app/(dashboard)/inventario/inventario-view.tsx:934-958 | 3 | 2 | 1-2h |
| 168 | P3 | Bajo | Pedidos de compra | Toda la lógica de costeo confía en inputs del cliente sin validación de servidor (cantidades, precios, TC negativos o absurdos) | Seguridad | src/app/(dashboard)/pedidos/actions.ts:165-178, 461-472 | 3 | 2 | 0.5d |
| 169 | P3 | Bajo | Finanzas & Dashboard | Capital recuperado y ROI cuentan dinero NO cobrado (ignora pagado/fecha_pago) | Lógica de negocio | src/app/(dashboard)/finanzas/page.tsx:79-81, 136-138 | 3 | 2 | 1-2h |
| 170 | P3 | Bajo | Finanzas & Dashboard | invByMonth usa cutoff fijo '-31' que no existe en meses de <31 días | Lógica de negocio | src/app/(dashboard)/finanzas/page.tsx:244-249 | 3 | 2 | 30min |
| 171 | P3 | Bajo | Seguridad | Mensajes de error de Postgres devueltos crudos al cliente (fuga de detalles internos) | Seguridad | src/app/(dashboard)/ventas/actions.ts:71-134 | 3 | 2 | 2-3h |
| 172 | P3 | Bajo | Performance | next.config sin optimizePackageImports ni configuración de imágenes | Performance | next.config.ts:22-28 | 3 | 2 | 2-3h |
| 173 | P3 | Bajo | UI / Design System | Hover implementado en JS (onMouseEnter) en vez de CSS — frágil y sin paralelo de foco | UI | src/components/sidebar-nav.tsx:47-58 | 3 | 2 | 0.5d |
| 174 | P3 | Bajo | UX y flujos | Edición de inventario carece de feedback de éxito y de confirmación al cambiar stock | UX | src/app/(dashboard)/inventario/product-edit-modal.tsx:95-116 | 3 | 2 | 2h |
| 175 | P3 | Bajo | UX y flujos | Drawer móvil y hamburguesa sin atributos ARIA de estado/diálogo | Accesibilidad | src/app/(dashboard)/layout.tsx:38-73 | 3 | 2 | 2-3h |
| 176 | P3 | Bajo | Lógica de negocio y finanzas | Preview de ganancia en el form de venta difiere de la 'ganancia' mostrada tras guardar (por el descuento) | UX | src/app/(dashboard)/ventas/venta-form.tsx:129 | 3 | 2 | 1h |
| 177 | P3 | Bajo | Comparativa mundial | Activity feed del dashboard enlaza a listas, no al registro específico | UX | src/app/(dashboard)/page.tsx:797-800 | 3 | 2 | 2h |
| 178 | P3 | Bajo | Ventas | No hay export de la lista de ventas (CSV/Excel/PDF) | Funcionalidad | src/app/(dashboard)/ventas/ventas-table-premium.tsx:1185-1253 | 3 | 3 | 4-6h |
| 179 | P3 | Bajo | Cotizaciones | Detección de categorías por prefijo de SKU duplicada y divergente entre form y preview | Mantenibilidad | src/components/cotizaciones/CotizacionPreview.tsx:46-59 | 3 | 3 | 3h |
| 180 | P3 | Bajo | Cotizaciones | marcarVendida no excluye al cliente interno Piel Canela del reparto a socios | Lógica de negocio | src/app/(dashboard)/cotizaciones/actions.ts:173-256 | 3 | 3 | 3h |
| 181 | P3 | Bajo | Inventario | TC vigente se infiere por mediana de productos en cliente; frágil y sin fuente única | Mantenibilidad | src/app/(dashboard)/inventario/inventario-view.tsx:428-437 | 3 | 3 | 2-3h |
| 182 | P3 | Bajo | Pedidos de compra | Subir documento/comprobante no valida que el archivo previo se borre si la BD falla, y borrarDocumento es best-effort silencioso (huérfanos en storage) | Mantenibilidad | src/app/(dashboard)/pedidos/actions.ts:683-706, 818-840 | 3 | 3 | 0.5d |
| 183 | P3 | Bajo | Portal público /order | Insert de cliente nuevo no maneja carrera/duplicados por teléfono | Base de datos | src/app/order/actions.ts:176-211 | 3 | 3 | 2-3h |
| 184 | P3 | Bajo | Seguridad | verDocumento genera signed URL para cualquier filename sin verificar pertenencia | Seguridad | src/app/(dashboard)/pedidos/actions.ts:771-778 | 3 | 3 | 1-2h |
| 185 | P3 | Bajo | Performance | 31 ResponsiveContainer de Recharts repartidos en 9 archivos cliente sin lazy-load | Performance | src/app/(dashboard)/clientes/recurrencia-analytics.tsx:5-16 | 3 | 3 | 3-4h |
| 186 | P3 | Bajo | Lógica de negocio y finanzas | Generación de folio usa fecha en zona horaria local del servidor | Lógica de negocio | src/lib/numero-orden.ts:17-24 | 3 | 3 | 2h |
| 187 | P3 | Bajo | Shell, navegación y notificaciones | Breadcrumbs no se derivan del shell; cada página debe pasarlos a mano | Arquitectura | src/components/page-header.tsx:74-88 | 3 | 4 | 1d |
| 188 | P3 | Bajo | UI / Design System | Lenguaje glass exclusivo de un módulo (clientes) sin presencia en el resto | UI | src/app/(dashboard)/clientes/clientes-dashboard.tsx:1690-1719 | 3 | 4 | 1-2d |
| 189 | P3 | Bajo | Escalabilidad | Generación de PDF en el cliente con html2pdf/html2canvas — no apta para volumen ni servidor | Escalabilidad | src/lib/pdf.ts:37-74 | 3 | 5 | 2-3d |
| 190 | P3 | Bajo | Escalabilidad | Analytics carga tablas completas a memoria y agrega en JS (no en SQL) | Performance | src/app/(dashboard)/ventas/actions.ts:242-316 | 3 | 6 | 1-2 sem |
| 191 | P3 | Bajo | Finanzas & Dashboard | Código muerto/engañoso: void invSandra/invBenjamin que sí se usan | Mantenibilidad | src/app/(dashboard)/finanzas/page.tsx:211-214 | 2 | 1 | 15min |
| 192 | P3 | Bajo | Finanzas & Dashboard | Comentario stale: 'ventas legible para anon' contradice la arquitectura RLS | Mantenibilidad | src/app/(dashboard)/finanzas/page.tsx:71-72 | 2 | 1 | 15min |
| 193 | P3 | Bajo | Shell, navegación y notificaciones | Animaciones del shell ignoran prefers-reduced-motion | Accesibilidad | src/components/notifications.tsx:196-202 | 2 | 1 | 0.5d |
| 194 | P3 | Bajo | Shell, navegación y notificaciones | panelRef quedó muerto tras migrar el panel a createPortal | Mantenibilidad | src/components/notifications.tsx:79-79 | 2 | 1 | 15m |
| 195 | P3 | Bajo | Arquitectura y mantenibilidad | README y AGENTS.md son plantillas vacías — todo el conocimiento vive en CLAUDE.md (para agentes, no humanos) | Mantenibilidad | README.md:1-35 | 2 | 1 | 2h |
| 196 | P3 | Bajo | Finanzas & Dashboard | IDs de socios y formateadores MXN duplicados entre dashboard y finanzas | Mantenibilidad | src/app/(dashboard)/page.tsx:23-24 | 2 | 2 | 1h |
| 197 | P3 | Bajo | Shell, navegación y notificaciones | El <title> del documento es estático en toda la app | UX | src/app/layout.tsx:11-14 | 2 | 2 | 0.5d |
| 198 | P3 | Bajo | Arquitectura y mantenibilidad | Helpers de avatar/hash y parseNotas duplicados entre archivos | Mantenibilidad | src/app/(dashboard)/clientes/prediccion-compras.tsx | 2 | 2 | 2h |
| 199 | P3 | Bajo | Shell, navegación y notificaciones | El toast de notificación se posiciona fixed top-right y puede solaparse con el toast global de sonner | UI | src/components/notifications.tsx:193-195 | 2 | 3 | 0.5d |
| 200 | P3 | Bajo | Performance | Memoización ausente en componentes de fila/celda de tablas grandes | Performance | src/app/(dashboard)/clientes/clientes-dashboard.tsx:580 | 2 | 3 | 3-4h |
| 201 | P3 | Bajo | UI / Design System | Dark mode declarado pero no-funcional — trampa para el próximo dev | Mantenibilidad | src/app/layout.tsx:22-31 | 2 | 6 | 1d para limpiar / 1-2 sem para implementar de verdad |

---

## 3. IA y automatización

# IA y Automatización

## Diagnóstico de partida

El ERP ya tiene la **materia prima** que casi ningún competidor genérico trae de fábrica para este nicho: un motor estadístico propio de predicción de recompra y riesgo de churn (`src/app/(dashboard)/clientes/lib-prediccion.ts` — CDF empírica / bell curve / global average según historial), un scoring heurístico de cierre de cotización (`lib-cotizacion-prob.ts`), un catálogo pequeño que cabe entero en un prompt, y datos estructurados de costeo BRL→USD→MXN. El problema no es falta de inteligencia: es que **toda esa inteligencia es pasiva y nadie la acciona**.

Tres ausencias verificadas en código marcan la frontera:

1. **Cero IA generativa.** `package.json` no contiene `openai`, `@ai-sdk/*` ni `@anthropic-ai/sdk`. No hay un solo `generateText`/`generateObject` en el repo.
2. **Cero automatización de salida.** No existe `vercel.json` ni carpeta `src/app/api/` (verificado: `find src/app/api` → no existe). No hay cron, ni endpoint, ni envío real de email/WhatsApp. El churn risk se calcula (`lib-prediccion.ts:171-176`) pero a nadie se le avisa. La cotización solo se descarga a mano (`src/lib/pdf.ts:37`) y se manda por un `wa.me` tecleado (`cotizaciones/[id]/confirmar/page.tsx:92`).
3. **Costeo de importación parchado por fuera de la app.** Cada pedido raro de Brasil terminó en un script Python ad-hoc (`scripts/fix-pedido-3-cintas-brl.py`, `fix-pedido-3-envio-facturas.py`, `fix-pedido-3-envio-usa-mexico.py`, `fix-lv-cafe-pedido3.py`): correcciones sin UI, sin trazabilidad y sin revalidación de inventario.

> **Principio rector:** el motor estadístico determinista **no se reemplaza** por un LLM (es auditable, barato y reproducible). La IA va **encima** para *narrar, decidir y accionar*; la automatización clásica (crons, envíos) convierte cálculo en evento.

## Plataforma recomendada (transversal a todas las iniciativas)

- **Vercel AI Gateway + Vercel AI SDK**, con **modelos Claude por defecto** (`anthropic/claude-sonnet-4` para tareas de razonamiento/narrativa/extracción; `anthropic/claude-haiku` para clasificación barata y de alto volumen). El Gateway da un solo endpoint, *failover* de proveedor y *tracking* de costo sin cambiar código; encaja nativo con el stack Next.js 16 ya desplegado en Vercel.
  - `generateObject` (structured output con schema Zod — ya instalado) para NL→cotización y OCR de facturas.
  - `streamText` para resúmenes de cliente y el asistente conversacional.
  - `generateText` para narrativas y borradores de mensajes.
- **Salida:** Resend para email (integración nativa Vercel) + links `wa.me` pre-rellenados como MVP de WhatsApp; migración a WhatsApp Cloud API cuando se justifique.
- **Jobs:** Vercel Cron Jobs vía `vercel.json` + rutas `src/app/api/cron/*` protegidas por `CRON_SECRET` (header `Authorization: Bearer`).
- **Coste esperado:** con ~42 ventas y ~10 clientes, el volumen de tokens es trivial (centavos/día). El ROI viene de la acción automatizada, no del modelo.

## Tabla maestra de iniciativas

Prioridad = ponderación de Impacto (negocio) y Complejidad (esfuerzo/riesgo), ajustada al contexto real (distribuidora B2B chica, importación Brasil, 2-3 usuarios internos).

| # | Iniciativa | Tipo IA / Auto | Qué reemplaza | Datos que usa | Plataforma sugerida | Impacto | Complejidad | Prioridad |
|---|---|---|---|---|---|---|---|---|
| 1 | **Alertas automáticas de cliente en riesgo (churn)** | Automatización (cron) + IA opcional | Revisión manual diaria del panel | `lib-prediccion.ts` (riesgoAbandono), `clientes`, `ventas` | Vercel Cron + Resend / `wa.me` | 9 | 4 | **P0** |
| 2 | **NL → cotización** ("10 activadores y 5 cintas 9mm") | IA generativa (`generateObject`) | Captura producto por producto en el form | Catálogo (`productos` + `precios_producto`), pg_trgm | AI Gateway + AI SDK (Claude) | 9 | 5 | **P0** |
| 3 | **Resumen de cliente + Next-Best-Action accionable** | IA generativa (`streamText`) | Interpretar números crudos del drawer | `PrediccionResult`, historial ventas/items | AI Gateway (Claude) | 8 | 4 | **P0** |
| 4 | **OCR de factura del proveedor brasileño → pre-llenar pedido** | IA multimodal (`generateObject` con PDF/imagen) | Captura manual + scripts `fix-pedido-*-brl.py` | Facturas en bucket (`subirFacturaEnvio`), `pedido_compra_items` | AI Gateway (Claude multimodal) | 8 | 6 | **P1** |
| 5 | **Dunning automático de saldos pendientes** | Automatización (cron) + IA (texto) | Seguimiento manual de quién debe | `ventas.saldo_pendiente`, `cantidad_pagada`, `clientes.telefono` | Vercel Cron + `wa.me`/Resend | 7 | 3 | **P1** |
| 6 | **Punto de reorden inteligente (días de cobertura)** | IA/heurística (velocidad de venta) | Badge binario bajo/agotado | `unidades_vendidas`, fechas, lead time Brasil | Cálculo server-side + alerta | 7 | 5 | **P1** |
| 7 | **Auto-vencimiento de cotizaciones + follow-up** | Automatización (cron) | Cambio manual del estatus en el select | `cotizaciones.valida_hasta`, `lib-cotizacion-prob.ts` | Vercel Cron | 6 | 4 | P2 |
| 8 | **Envío automático de cotización (1 clic) + tracking "enviada"** | Automatización | Descargar PDF → adjuntar a WhatsApp a mano | `cotizaciones`, `src/lib/pdf.ts` | Resend / Web Share API | 6 | 4 | P2 |
| 9 | **Acción "Re-prorratear costeo" dentro de /pedidos/[id]** | Automatización | Scripts `fix-pedido-3-envio-*.py` | `pedido_envios`, `itemFields()`, `snapshotProducto()` | Server action + revalidate | 6 | 4 | P2 |
| 10 | **Forecast de ingresos + detección de anomalías** | IA/estadística + narrativa | "Insights" if/else triviales del dashboard | `valorFuturo12m`, `getVentasStats` | Cálculo + AI Gateway (Claude) | 6 | 4 | P2 |
| 11 | **Narrativa financiera mensual ("Resumen del mes")** | IA generativa (`generateText`) | Lectura manual de gráficas | `getVentasStats`, ROI socios | AI Gateway (Claude) | 5 | 3 | P3 |
| 12 | **Sincronización automática del tipo de cambio** | Automatización (cron + API FX) | TC tecleado a mano (queda viejo) | `productos.tipo_cambio`, API FX (Banxico) | Vercel Cron | 4 | 2 | P3 |
| 13 | **Sugerencia de descuento/margen asistida** | IA + cálculo de margen | Descuento a ciegas en el form | `vista_inventario.profit_unitario`, historial | Cálculo + AI Gateway (Claude) | 4 | 4 | P3 |
| 14 | **Búsqueda global semántica + asistente "pregunta a tus datos"** | IA (tool-calling) + ⌘K | Navegar módulo por módulo | Todas las tablas vía herramientas tipadas | AI Gateway (Claude) + cmdk | 4 | 6 | P3 |
| 15 | **Anti-spam IA en el portal /order** | IA/heurística | Sin filtro de pedidos basura | `submitOrder` input, IP | Heurística + Claude Haiku | 4 | 3 | P3 |

---

## Fichas detalladas — TOP 6

### 1. Alertas automáticas de cliente en riesgo (churn) — P0

**Problema.** El motor ya calcula `riesgoAbandono` por cliente (`lib-prediccion.ts:171-176`) y el panel lista "clientes en riesgo" (`prediccion-compras.tsx:178`), pero la acción depende 100% de que alguien abra el dashboard y se acuerde de revisar. Para una distribuidora con pocos spas clientes de recompra recurrente, cada cliente que cruza el umbral y nadie contacta es una venta recurrente perdida por olvido.

**Solución técnica.**
- Crear `src/app/api/cron/alertas-clientes/route.ts`, protegida por `CRON_SECRET` (`Authorization: Bearer`), y un `vercel.json` con un cron diario (`"schedule": "0 14 * * *"` → 8am CDMX).
- La ruta corre `predecirCompra()` sobre todos los clientes no internos (excluir Piel Canela vía `getInternalClienteIds()`), filtra `riesgoAbandono > umbral`, y genera:
  - **Email resumen a las socias** (Resend) con la lista priorizada por valor en riesgo (`ingresoEstimadoProx × riesgoAbandono`).
  - Por cada cliente, un **link `wa.me` pre-rellenado** (`https://wa.me/${tel}?text=...`) con un mensaje generado por Claude vía AI Gateway (`generateText`) según su producto top y patrón de recompra.
- Persistir en la tabla `notificaciones` existente (reusar el canal realtime del portal) para que también aparezca en la campana del shell.

**Dónde vive en la UI.** Push diario (email + campana). En `/clientes`, el panel "en riesgo" gana un botón "WhatsApp" por fila que abre el mensaje pre-rellenado (convierte el badge `accionRecomendada` de `prediccion-compras.tsx:712-725` en CTA real).

**Beneficio esperado.** Convierte inteligencia pasiva en revenue. Cero revisión manual; recupera recompras que hoy se pierden por inercia. Es la mejora de mayor ROI/esfuerzo del módulo de IA porque **la inteligencia ya está construida** — solo falta el disparador.

---

### 2. NL → cotización — P0

**Problema.** Crear una cotización exige elegir cliente, buscar cada producto y teclear cantidades uno por uno (`cotizaciones/nueva/cotizacion-form.tsx`). El caso real es que el spa pide por WhatsApp en texto libre: *"quiero 10 activadores grandes y 5 cintas de 9mm"*. Hoy eso se traduce a mano, SKU por SKU, con riesgo de error.

**Solución técnica.**
- Caja "Pegar pedido en texto" en el form de cotización.
- Server action que pase el texto + el catálogo completo (`productos` con `sku`/`nombre_display`/`precio` — cabe entero en el prompt dado el tamaño chico) a `generateObject` del AI SDK vía AI Gateway, modelo `anthropic/claude-sonnet-4`, con un schema Zod:
  ```ts
  z.object({ items: z.array(z.object({ producto_id: z.string().uuid(), cantidad: z.number().int().positive() })) })
  ```
- Matching difuso de nombres respaldado por `pg_trgm` (ya en uso en `clientes/actions.ts findSimilarClientes`) para reforzar la resolución producto↔texto y evitar alucinación de SKUs (el LLM solo puede elegir IDs del catálogo provisto).
- El resultado **pre-llena** el form para confirmación humana (nunca guarda directo).

**Dónde vive en la UI.** Textarea colapsable arriba del picker de productos en `cotizacion-form.tsx`; al pegar y "Interpretar", se cargan los items como filas editables.

**Beneficio esperado.** De 2-3 min de captura a ~5 s + confirmación. Reduce errores de SKU y aprovecha que el catálogo es pequeño. Misma técnica reutilizable para "Nueva venta" si se unifica el motor de captura.

---

### 3. Resumen de cliente + Next-Best-Action accionable — P0

**Problema.** La ficha del cliente (`cliente-drawer.tsx`) tiene datos crudos y la predicción estadística, pero ningún resumen legible ni acción recomendada concreta — solo un `mailto:` a secas (`cliente-drawer.tsx:321`). El operador debe interpretar "riesgo 62%, próxima compra Jul-26" y decidir qué hacer.

**Solución técnica.**
- Tarjeta "Resumen IA" que tome el `PrediccionResult` + historial de ventas/items y los pase a `streamText` (AI Gateway, `anthropic/claude-sonnet-4`) con un prompt que exija 2-3 frases accionables en español, p. ej.: *"Mithra compra cada ~45 días, lleva 60 sin comprar — en riesgo. Su top: activadores. NBA: ofrécele reposición de activadores con 5% por volumen."*
- Botón que dispare el WhatsApp pre-rellenado con esa NBA (`https://wa.me/${cliente.telefono.replace(/\D/g,'')}?text=...`).
- Cachear el resumen por cliente con `revalidate` corto o invalidación al registrar nueva venta, para no regenerar en cada apertura del drawer.

**Dónde vive en la UI.** Bloque "Resumen IA" en la parte superior del `cliente-drawer.tsx`, encima de los KPIs numéricos, con el botón de acción a su derecha.

**Beneficio esperado.** Convierte la predicción en lenguaje y acción. El operador sabe a quién contactar **y qué decirle** sin analizar números — el salto de "CRM analítico" a "CRM operativo" que distingue a HubSpot/Salesforce.

---

### 4. OCR de factura del proveedor brasileño → pre-llenar pedido — P1

**Problema.** Los pedidos desde Brasil (cintas cotizadas en **BRL**, factor 0.1743 BRL→USD) se capturan a mano: producto, cantidad, precio USD, envío. Ya existe infraestructura de documentos (`subirFacturaEnvio`, `subirDocumentoPedido` en `pedidos/actions.ts`) pero los archivos solo se almacenan; nadie extrae datos. Este es el pedido más complejo del negocio y la causa raíz de los scripts `fix-pedido-3-cintas-brl.py`.

**Solución técnica.**
- Al subir una factura/PDF del proveedor, pasarla a un modelo **multimodal de Claude** vía AI Gateway con `generateObject` (acepta imagen/PDF) y schema Zod:
  ```ts
  z.object({
    moneda: z.enum(["USD","BRL"]),
    items: z.array(z.object({ descripcion: z.string(), cantidad: z.number().int(), precio_origen: z.number() })),
    envio: z.number().optional(),
  })
  ```
- Si `moneda === "BRL"`, derivar USD con el `factor_brl_usd` del pedido (esto se acopla con el hallazgo de modelo de datos multi-moneda: agregar `moneda_origen`/`precio_origen` a `pedido_compra_items`).
- Pre-cargar el form de nuevo pedido con los items extraídos **para revisión humana**.

**Dónde vive en la UI.** En `/pedidos/nuevo`, un dropzone "Subir factura del proveedor" arriba de la tabla de items; tras procesar, las filas aparecen pre-llenadas y editables, con un badge "extraído de factura".

**Beneficio esperado.** Elimina por completo la clase de scripts `fix-pedido-*-brl`. Convierte la factura en estructura sin teclear, reduce los errores de costeo que hoy exigen parches Python, y deja todo dentro de la app con trazabilidad.

---

### 5. Dunning automático de saldos pendientes — P1

**Problema.** `ventas.saldo_pendiente` es GENERATED y el enum distingue `pagada_parcial`/`pendiente`, pero no hay ningún recordatorio de cobro. Una venta a crédito parcial se queda esperando a que alguien la note en la lista. Para una distribuidora con flujo de caja apretado y pago diferido a spas, esto es dinero parado.

**Solución técnica.**
- Incluir en el cron diario (mismo `vercel.json` de la iniciativa 1) una pasada sobre ventas con `saldo_pendiente > 0` y antigüedad `> N` días.
- Generar: notificación in-app + **email resumen a las socias** (Resend) con la lista de saldos por cobrar, ordenada por antigüedad/monto, y un **link `wa.me` por cliente** con un recordatorio de tono amable generado por Claude (`generateText`) ajustado a la relación con ese cliente.
- Idempotencia: marcar la fecha del último recordatorio para no spamear (p. ej. máximo 1 cada 7 días por venta).

**Dónde vive en la UI.** Email/campana diario; en `/finanzas` (o `/ventas`), un panel "Por cobrar" con el CTA de WhatsApp por fila. Se acopla con el hallazgo de cuentas por cobrar consolidadas.

**Beneficio esperado.** Acelera la cobranza y mejora el flujo de caja sin seguimiento manual de quién debe — base para un reporte de antigüedad de saldos (aging) que hoy no existe.

---

### 6. Punto de reorden inteligente (días de cobertura) — P1

**Problema.** El estatus de inventario es binario: `agotado`/`bajo`/`ok` contra un `stock_minimo` estático que el usuario fija a mano (default 0). No usa la velocidad de venta, así que no avisa "se te acaba el activador más vendido en 5 días" — justo cuando el lead time de Brasil son semanas. El usuario no sabe **qué** ni **cuánto** reordenar.

**Solución técnica.**
- Calcular server-side `velocidad = unidades_vendidas / meses_activos` por SKU (datos ya disponibles en `vista_inventario` + fechas de `venta_items`) y derivar `dias_cobertura = stock_actual / (velocidad/30)`.
- Alerta priorizada por velocidad: "se agota en ~X días", no por umbral estático.
- Sugerencia de cantidad de reposición = `velocidad × lead_time_Brasil + buffer`, agrupando SKUs bajo umbral para un próximo pedido.
- Exponer también "productos muertos" (`sinMovimiento` ya se calcula pero no se acciona) para liberar capital.
- Capa de IA opcional: una narrativa de Claude que resuma "Esta semana conviene reordenar: 3 SKUs críticos, ~X unidades, ~$Y USD" — pero el cálculo base **no requiere LLM**.

**Dónde vive en la UI.** En `/inventario`, reemplazar/complementar el badge binario por una columna "Cobertura" con días restantes y un panel "Sugerencia de reposición" que alimente un borrador de pedido a Brasil. Integrable con la alerta del cron diario.

**Beneficio esperado.** El usuario sabe qué y cuánto reordenar **antes** de quedarse sin el producto que más rota, y libera capital de productos muertos. Pasa de un badge reactivo a una recomendación proactiva — el comportamiento que un ERP de clase mundial da por sentado.

---

## Secuencia de adopción recomendada

1. **Infra base (1-2 días, habilita todo lo demás):** crear `vercel.json` + `src/app/api/cron/*` con `CRON_SECRET`, instalar `ai` + AI Gateway, configurar Resend. Sin esto, ninguna automatización de salida es posible.
2. **Quick wins de salida (P0/P1 de cron):** alertas de churn (#1) y dunning (#5) reutilizan inteligencia ya calculada — máximo ROI con la infra recién montada.
3. **IA generativa de captura y narrativa (P0):** NL→cotización (#2) y Resumen+NBA (#3) — alto impacto operativo diario, complejidad media.
4. **OCR y costeo (#4, #9):** atacan de raíz la dependencia de scripts Python, el mayor foco de deuda operativa del negocio.
5. **Forecast/narrativa y asistente (#10, #11, #14):** capa de diferenciación una vez estabilizada la operación.

> **Regla de oro para todas las iniciativas IA:** el LLM **sugiere**, el humano **confirma** antes de cualquier escritura financiera o de inventario. Structured output con schema Zod + IDs restringidos al catálogo real eliminan la alucinación; el motor estadístico determinista sigue siendo la fuente de verdad de las predicciones, y la IA solo las traduce a lenguaje y acción.

---

## 4. Roadmaps y Quick Wins

## Quick Wins — Alto impacto, baja complejidad

> Selección de mejoras con **impacto ≥ 6** y **complejidad ≤ 3** (más un par de complejidad 1–2 de altísimo retorno). Cada una está anclada a un hallazgo verificado con su `file:line`.

| # | Mejora | Impacto | Complejidad | Tiempo | Beneficio |
|---|--------|---------|-------------|--------|-----------|
| 1 | **Excluir ventas canceladas de los KPIs del mes** — añadir `.neq("estatus","cancelada")` a `ventasMesRes`/`ventasMesAntRes` en `page.tsx:142-150` | Alto (6) | Muy baja (2) | 1h | Ganancia y ticket del hero dejan de inflarse con ventas anuladas (#27) |
| 2 | **`updateVenta` no debe resucitar ventas canceladas** — preservar estatus `cancelada` al recalcular en `ventas/actions.ts:395-419` | Alto (5) | Muy baja (2) | 2h | Editar notas de una venta cancelada deja de reactivarla en finanzas (#57) |
| 3 | **Eliminar doble query a `precios_producto`** en `inventario/page.tsx:63-92` (`preciosBySku` se construye y se `void`-ea) | Medio (4) | Mínima (1) | 30m | −1 round-trip por carga y −40 líneas de código muerto (#106) |
| 4 | **Desinstalar `framer-motion`** (0 imports reales en todo `src`) | Medio (4) | Mínima (1) | 15m | node_modules/lockfile más livianos, CI más rápido (#107) |
| 5 | **Quitar `void invSandra/invBenjamin`** en `finanzas/page.tsx:211-214` (se usan en el chart) | Bajo (2) | Mínima (1) | 15m | Código honesto; sin señal falsa de "no usado" (#191) |
| 6 | **Excluir cliente interno y respetar periodo en `topProductos`** — filtrar `venta_items` por `ventaIds` ya calculados en `ventas/actions.ts:238-264` | Medio (5) | Baja (2) | 2h | El "producto estrella" deja de inflarse con consumo interno de Piel Canela (#61) |
| 7 | **Centralizar IDs de socios + IVA 0.16** en `src/lib/constants.ts` (hoy duplicados en 6 y 5 archivos) | Medio (4) | Baja (2) | 2h | Una sola fuente de verdad financiera; cambio de tasa en un solo lugar (#113) |
| 8 | **Migrar los 42 formateadores de moneda** a `formatMXN`/`formatMXNshort` de `utils.ts` (ya existen) | Medio (5) | Baja (2) | 3h | Formato consistente, −40 bloques duplicados (#59) |
| 9 | **Marcar `inventario_descontado=true` en `marcarVendida`** tras el RPC (`cotizaciones/actions.ts:202-256`) | Medio (4) | Baja (2) | 1h | El widget de inventario deja de mentir; evita doble descuento (#108) |
| 10 | **Botón "Exportar CSV"** en finanzas (recuperación por venta) e inventario — filas ya están en el server component | Alto (7) | Baja (2) | 1–2d | Cierra brecha table-stakes; habilita conciliación contable (#9) |
| 11 | **Índices en columnas calientes** (`ventas.fecha/cliente_id/cotizacion_id`, `venta_items.venta_id/producto_id`, `cotizaciones.cliente_id/estatus`) | Medio (4) | Baja (2) | 2h | Joins y listas de seq-scan O(n) a index O(log n) (#118) |
| 12 | **Paralelizar `getInternalClienteIds()`** dentro del `Promise.all` (o cachear) en las 4 vistas principales | Medio (4) | Baja (2) | 1–2h | −1 round-trip secuencial por carga; casi nulo si se cachea (#117) |
| 13 | **Una sola definición de "Ganancia"** — helper `gananciaBruta()`/`utilidadNeta()` y usarlo en detalle, dashboard, drawer y tabla | Alto (7) | Baja (3) | 4–6h | Cero ambigüedad: el mismo número en las 4 vistas (#10, #176) |
| 14 | **Reemplazar lecturas de `ganancia` por `utilidad_neta`** en `page.tsx` y `getVentasStats` (la columna GENERATED ignora el descuento) | Alto (7) | Baja (3) | 3–4h | KPIs dejan de sobreestimar la ganancia cuando hay descuento (#15) |
| 15 | **Sanitizar entrada en `findSimilarClientes`** (`.or()` con string crudo, `clientes/actions.ts:266-272`) | Medio (4) | Baja (3) | 1–2h | Cierra inyección de filtro PostgREST / exfiltración (#132) |
| 16 | **Número de orden del portal con loop anti-colisión** (reusar `numeroOrdenExiste`, `order/actions.ts:232-236`) | Medio (4) | Baja (2) | 1h | Elimina colisiones de folio del portal (#111) |
| 17 | **Activity feed enlaza al registro, no a la lista** — incluir `id` en `/ventas/${id}` (`page.tsx:797-800`) | Bajo (3) | Baja (2) | 2h | Navegación predecible en la pantalla más usada (#177) |
| 18 | **Spinner + disable en botón PDF** mientras `html2pdf` genera (`cotizacion-form/detail`) | Bajo (3) | Baja (2) | 1–2h | Feedback claro, sin doble disparo (#166) |

---

## Roadmap de Producto

Funciones faltantes priorizadas por valor de negocio. Cada fase asume que las anteriores cerraron sus dependencias.

### 🔴 Ahora (0–1 mes) — Integridad financiera y de inventario primero

> Nada de UI nueva mientras los números mientan. Estos items son la base de confianza del ERP.

1. **Unificar cotización→venta en `crearVentaDesdeCotizacion()`** — hoy hay 3 caminos divergentes (`marcarVendida`, `saveVenta?cotizacion=`, link "Convertir a Venta") con reglas distintas. *Justificación: drift demostrado (falta `venta_socios`, `cantidad_pagada`, `inventario_descontado`) corrompe ROI según el camino elegido (#1, #4, #5, #6).*
2. **`marcarVendida` debe insertar `venta_socios`** — las ventas convertidas desde cotización aportan $0 al ROI hoy. *Justificación: corrupción silenciosa del capital recuperado de ambos socios (#1, #4).*
3. **Descontar inventario en TODAS las rutas de venta** — `saveVenta` y portal nunca tocan stock; la RPC `descontar_inventario_venta` ya existe. *Justificación: el stock miente sistemáticamente y rompe la promesa central de un ERP (#2, #18).*
4. **Re-resolver precio y validar `producto_id`/`clienteExistenteId` server-side en `submitOrder`** — no confiar en el navegador. *Justificación: manipulación de precios + IDOR desde la superficie pública anónima (#3, #13, #28).*
5. **Excluir ventas canceladas de finanzas y KPIs** (capital recuperado, reparto, hero). *Justificación: ROI y ventas del mes cuentan dinero anulado (#12, #27).*
6. **Quick wins #1–#18** como barrido paralelo de bajo riesgo.

### 🟡 Próximo (1–3 meses) — Cerrar el flujo comercial y de cobranza

1. **Historial de abonos (`venta_pagos`)** — hoy `cantidad_pagada` es un acumulado sobreescribible sin fecha ni monto por pago; el Timeline finge el historial. *Justificación: cobranza auditable y saldos correctos (#20).*
2. **Envío de cotización al cliente** — botón "Compartir" (Web Share API + PDF) y link público read-only con tracking de "enviada/visto". *Justificación: hoy el único camino es descargar el PDF y mandarlo a mano; falta el eslabón comercial central (#52, #76).*
3. **Auto-vencimiento de cotizaciones** vía cron diario (estatus `vencida`). *Justificación: hoy "vencida" es 100% manual; el pipeline siempre miente (#69).*
4. **Cuentas por cobrar en /finanzas** — consolidar `saldo_pendiente` (ya GENERATED) + aging. *Justificación: visibilidad de caja pendiente, hoy invisible en el módulo financiero (#127).*
5. **Recepción parcial de pedidos** — separar pedido de recepción (`cantidad_recibida`); el stock entra al recibir, no al crear. *Justificación: las importaciones de Brasil llegan parciales y semanas después (#53).*
6. **Estado real de pedidos** — escribir el `status` (5 estados ya definidos, nunca se persisten). *Justificación: habilita tracking de importaciones, el propósito declarado del módulo (#137).*
7. **Modelo BRL + tramos de envío en pedidos** — `moneda_origen`, `factor_brl_usd`, `pedido_envios` como fuente del costeo. *Justificación: elimina la clase entera de scripts `fix-pedido-*-brl/envio.py` (#21, #22, #77).*
8. **Venta manual con selector de productos** — reusar el picker de `cotizacion-form`. *Justificación: hoy la venta directa es un cascarón sin items que no descuenta inventario (#26).*
9. **Export CSV/Excel en todas las tablas** (ventas, clientes, pedidos). *Justificación: table-stakes que todo competidor tiene (#9, #178).*

### 🟢 Después (3–6 meses) — CRM operativo, IA accionable y automatización

1. **IA accionable sobre la predicción de churn/recompra** — cron diario que detecte clientes en riesgo y dispare WhatsApp/email con plantilla. *Justificación: el motor ya calcula riesgo pero nadie es avisado (#34, #51, #91).*
2. **Notificaciones/recordatorios** (cotizaciones por vencer, stock agotado, dunning de saldos) reusando la tabla `notificaciones` y realtime existentes. *Justificación: la inteligencia existe pero es pasiva (#45, #51).*
3. **NL→cotización** — pegar "10 activadores y 5 cintas 9mm" → items pre-cargados vía AI SDK + pg_trgm. *Justificación: de 2–3 min de captura a 5s; catálogo chico cabe en el prompt (#43).*
4. **OCR de facturas del proveedor brasileño** — precargar el pedido desde el PDF que ya se sube. *Justificación: elimina la captura manual del pedido más complejo (#54).*
5. **Resumen IA + Next-Best-Action en ficha de cliente** y reportes financieros narrativos. *Justificación: convierte números en lenguaje y acción para socios no técnicos (#47, #95, #157).*
6. **Gestión de tareas/actividades por cliente** (timeline, notas con fecha, seguimiento). *Justificación: pasa de CRM analítico a operativo (#48).*
7. **Punto de reorden dinámico** — velocidad de venta + días de cobertura + sugerencia de reposición. *Justificación: de badge reactivo a recomendación proactiva de qué/cuánto reordenar (#49).*
8. **Forecast de ingresos y detección de anomalías** reusando el motor de predicción de clientes. *Justificación: visión hacia adelante y alerta temprana de caídas (#78).*

### 🔵 Visión (6–12 meses) — De herramienta interna a SaaS vertical

1. **Usuarios + roles + audit trail** — el prerequisito de todo lo demás. *Justificación: trazabilidad financiera, confianza entre socias y base para multi-tenant (#40, #41, #79, #143).*
2. **Facturación CFDI 4.0 + capa contable ligera (P&L, flujo de caja)** — `clientes.rfc` ya existe; falta timbrado + datos del emisor. *Justificación: convierte el ERP en herramienta de operación fiscal real en México (#55, #82, #94, #104).*
3. **Multi-moneda transaccional** (guardar moneda + TC del día por transacción). *Justificación: el negocio es nativamente USD/BRL; congela la utilidad histórica (#55).*
4. **Command palette ⌘K + búsqueda global** y PWA. *Justificación: salto de productividad estilo Linear/Notion; uso de campo desde celular (#92, #96, #97, #67).*
5. **Reportes/dashboards configurables** (date range + dimensión seleccionable). *Justificación: cubre el 80% de preguntas ad-hoc sin un report builder completo (#162).*

---

## Roadmap Técnico

### Deuda inmediata (0–1 mes)
- **Atomicidad de mutaciones multi-paso vía RPC plpgsql** — `crear_venta_completa`, `crear_pedido_completo`, conversión cotización→venta. supabase-js no abre transacciones multi-statement; el patrón correcto ya existe (`descontar_inventario_venta`). *Justificación: hoy un fallo a media escritura deja ventas/pedidos huérfanos sin rollback (#19, #23, #25, #38, #86, #93).*
- **Ajustes de stock atómicos** — reemplazar read-modify-write por `UPDATE … SET stock_actual = stock_actual + delta` (RPC con `GREATEST(0,…)`). *Justificación: lost updates bajo concurrencia corrompen inventario (#74, #124, #139).*
- **Validación de input con Zod en toda server action** (ya instalado, sin usar) + wrapper `validatedAction`. *Justificación: ataca de raíz la inyección de datos/precios en la ruta pública y los crashes con stack (#32, #154).*
- **Tipos generados de Supabase** (`database.types.ts`) y tiparlos en los 3 clientes. *Justificación: elimina ~29 casts manuales y detecta drift de esquema en build (#63).*
- **Constraints UNIQUE/CHECK en BD** — `precios_producto(producto_id,lista_id)`, `cotizaciones.numero`, `CHECK(stock_actual>=0)`, `cantidad>0`, `monto>=0`. *Justificación: las invariantes hoy viven solo en JS; scripts e integraciones pueden corromper (#64, #141, #147).*

### Arquitectura y mantenibilidad (1–3 meses)
- **Versionar el esquema completo** (`supabase/migrations` + CLI; capturar funciones/triggers/vistas a mano). *Justificación: la RPC y el DDL viven solo en Supabase; sin recuperación ante desastre (#16).*
- **Capa de acceso a datos `src/lib/data/`** que encapsule queries + regla de cliente interno. *Justificación: ~30 archivos con queries crudas y criterio inconsistente service-role vs admin (#85).*
- **Wrapper `safeAction` con try/catch + logger** — 0 try/catch en los 7 actions hoy. *Justificación: observabilidad nula y UX de error inconsistente (#72).*
- **`error.tsx`/`loading.tsx`/`not-found.tsx`** en (dashboard) y rutas pesadas. *Justificación: cero boundaries; pantallas en blanco y errores crudos (#44, #129).*
- **Romper God components** (clientes-dashboard 2245, cotizaciones-list 1775, ventas-table-premium 1595) en columns/hooks/modals. *Justificación: testeabilidad, menos re-renders, diffs legibles (#98).*
- **Limpiar deps muertas** (`react-hook-form`, `@hookform/resolvers`, `@radix-ui/react-slot`) o adoptarlas; clarificar/colapsar `server.ts` vs `admin.ts` (ambos service_role). *Justificación: package.json honesto y semántica de seguridad clara (#114, #115, #116).*

### BD / costeo (3–6 meses)
- **Kardex `movimientos_inventario`** (la tabla ya existe sin usar) como fuente de verdad; stock derivado. *Justificación: auditoría, reconstrucción histórica, fin de la race condition (#102, #30).*
- **Columnas derivadas de `pedido_compra_items` como GENERATED/vista** — hoy la fórmula se duplica en 4 lugares (itemFields + 3 scripts). *Justificación: una sola fuente de la fórmula de costeo, fin de la fragilidad (#81).*
- **Costeo histórico por capas/lote** en vez de re-snapshot global al editar pedidos. *Justificación: editar un pedido viejo no debe mutar el costeo de productos que no cambiaron (#39, #148).*
- **Soft-delete + FKs ON DELETE CASCADE** en ventas/pedidos. *Justificación: borrados reversibles y en cascada atómica (#35, #68).*

### Testing y observabilidad
- **Vitest sobre lógica pura financiera** (IVA, reparto, `numero-orden`, estatus, `formatMXN`). *Justificación: red de seguridad sobre los cálculos de dinero; cero tests hoy (#130).*
- **Observabilidad/logging estructurado** + mensajes de error genéricos al cliente (no Postgres crudo). *Justificación: diagnóstico en prod sin fuga de esquema (#171, #72).*

---

## Roadmap de UX/UI

### Design system (la deuda transversal)
- **Resolver la contradicción de marca** — 3 paletas conviven (emerald/teal v2, amatista, teal del CLAUDE.md). Decidir UNA y aplicarla al chrome global. *Justificación: los módulos parecen 3 productos distintos (#103, #188).*
- **Consolidar tipografía a ~7 tokens semánticos** (hoy ~24 tamaños px arbitrarios) y radios a 3 (hoy 9 valores). *Justificación: ritmo visual consistente, base para responsive/theming (#89, #135).*
- **Reemplazar hex/`style={{}}` inline por tokens `--pc-*`** y unificar neutral (gray vs slate). *Justificación: habilita dark mode/white-label tocando tokens, no cientos de clases (#90, #146).*
- **Adoptar `<Button>`/`<GlassCard>` o borrarlos** — el DS definido está casi sin usar. *Justificación: consistencia, menos código, theming centralizado (#71, #155).*
- **Dark mode: implementar o eliminar** — declarado pero no-funcional (trampa para el próximo dev) (#201).

### Accesibilidad
- **`focus-visible` sistémico + `aria-current` en nav** — solo 3 de 35 archivos con onClick tienen focus. *Justificación: navegación por teclado y WCAG AA (#33, #112).*
- **Forms con `<form onSubmit>` (Enter) + autoFocus** y migrar hover JS a CSS `hover:`/`focus-visible:`. *Justificación: captura más rápida y hover/focus declarativo (#66, #173).*
- **ARIA en drawer móvil** (`role=dialog`, foco atrapado, Esc) y `prefers-reduced-motion` global. *Justificación: menú móvil accesible y respeto a preferencias del sistema (#175, #193).*

### Flujos
- **Empty states con CTA** (componente reutilizable) y feedback de éxito/toast en edición de inventario. *Justificación: orientación en pantallas vacías; confirmación consistente (#136, #174).*
- **Autosave de borradores** en cotización y pedido (localStorage debounced) + beforeunload. *Justificación: cero pérdidas de captura larga (#46).*
- **Eliminar la ambigüedad de botones** "Convertir a Venta" vs "Marcar como Vendida" y renombrar /confirmar a "Revisar pedido del portal" con CTA real. *Justificación: dos botones que parecen lo mismo hacen cosas distintas (#6, #65).*
- **Vista de tarjetas en móvil** para tablas anchas (ventas, pedido-nuevo) en lugar de scroll horizontal (#101).
- **Unificar los 2 sistemas de notificación** (campana vs PortalBadge) e identidad de usuario neutra (hoy hardcodeada a "Benjamín") (#84, #138).
- **`<title>` por página + breadcrumbs derivados del shell** (#197, #187).

---

## Roadmap de Escalabilidad

> El sistema mono-tenant es la decisión correcta HOY (2–3 usuarios, ~42 ventas). Estos pasos preparan dos ejes que se rompen distinto: **volumen de datos** y **número de tenants/usuarios**.

### Fase 1 — Higiene de performance (0–3 meses, sin esperar a crecer)
- **Blindar contra truncado silencioso** — límites duros (`limit 500/2000`) cortan KPIs sin avisar; añadir `.range()`/paginación o agregados SQL. *Justificación: KPIs financieros silenciosamente erróneos al crecer (#152, #160).*
- **Agregaciones en SQL, no en JS** — vistas/RPC para ventas-por-mes, ventas-por-tipo, ROI socios, predicción. *Justificación: latencia O(resultado) en vez de O(filas totales) (#24, #145, #149, #190).*
- **Eliminar el doble full-scan de `venta_items`** en `/ventas` (fusionar en el Promise.all) (#144).
- **Caché en lecturas estables** (`unstable_cache`/`use cache` en Next 16) para socios, inversiones, `getInternalClienteIds`, catálogos. *Justificación: de O(visitas) a O(invalidaciones) (#87, #156).*
- **Code-split de Recharts y paneles pesados** vía `next/dynamic` + `optimizePackageImports`. *Justificación: saca ~50KB+ del chunk inicial; mejor TTI (#36, #185, #172).*
- **Precomputar predicción/`enriched` en el server** (no enviar venta_items crudos al cliente) (#99).
- **Cachear catálogo del portal /order** (revalidate 30–60s con tag) en vez de `force-dynamic` (#75).

### Fase 2 — Concurrencia y operación (3–6 meses)
- **Rate-limit distribuido** (Vercel WAF sobre /login y /order, o Upstash/Redis) — el in-memory se evade con múltiples instancias (#31, #73, #133).
- **Notificaciones realtime con RLS** en vez de polling 8s a tabla completa (#83, #88).
- **CSP** (empezar en Report-Only) — única defensa de cabecera que falta (#142).
- **PITR/backups verificados + export financiero versionado** — la BD es fuente única de $300k MXN (#60).
- **PDF server-side** (Puppeteer/@react-pdf) para lotes y email automático (#56, #189).

### Fase 3 — Multi-tenant / multi-empresa (6–12 meses)
- **`org_id` NOT NULL en todas las tablas + claim de tenant en el JWT + RLS real con `auth.jwt()->>'org_id'`** y migrar lecturas a client autenticado. *Justificación: hoy RLS solo bloquea anon; service_role bypassa todo, sin aislamiento por empresa (#42, #105).*
- **RBAC sobre identidad de usuario** (prerequisito: usuarios + roles del roadmap de producto). *Justificación: reduce el radio de explosión de "toda la BD" a "lo que ese usuario podía tocar" (#42, #41).*
- **Numeración de folios a prueba de concurrencia** (secuencia/identity Postgres o UNIQUE + retry, no `count()+1`) en cotizaciones, ventas, pedidos y portal. *Justificación: colisiones de folio bajo concurrencia portal+ERP (#80, #125, #140, #147, #151).*

> **Veredicto integrado del comité:** la capa visual y los flujos de cara al cliente ya están a nivel producto; la integridad financiera/de inventario y la arquitectura de datos están a nivel prototipo. El orden es innegociable: **primero que los números no mientan** (Ahora), luego cerrar el ciclo comercial y de cobranza (Próximo), después la IA accionable (Después) y por último la transformación a SaaS vertical (Visión).

---

## 5. Comparativa mundial

## Qué ES y qué HACE este ERP (mapa de capacidades confirmado en código)

| Módulo | Evidencia | Capacidad |
|---|---|---|
| Dashboard | `src/app/(dashboard)/page.tsx` | KPIs mes vs mes anterior, sparklines, insights heurísticos (mejor cliente/producto), activity feed, ROI por socio, alertas de stock |
| Inventario | `src/app/(dashboard)/inventario/` | Stock con estatus GENERATED, costeo USD/MXN con tipo de cambio, upload de imagen, columnas redimensionables |
| Cotizaciones | `cotizaciones/` + `src/lib/pdf.ts` | Alta, edición, PDF, IVA referencial, conversión a venta |
| Ventas | `ventas/` | Venta con utilidad GENERATED, reparto por socio (no 50/50 fijo), desglose por tipo, IVA real |
| Clientes/CRM | `clientes/lib-prediccion.ts` | Predicción de próxima compra (CDF empírica / bell / global), riesgo de abandono, valor futuro 12m, estacionalidad, ingreso estimado |
| Pedidos | `pedidos/` | Tracking de importación Brasil, costeo BRL→USD→MXN, prorrateo de envío, inversión por socio, estatus en_transito/recibido/vendido |
| Finanzas | `finanzas/page.tsx` | Inversión por socio, capital recuperado, ROI, capital en riesgo, recuperación acumulada |
| Portal público | `src/app/order/` | Catálogo con stock en vivo, reconocimiento por teléfono, anti-spam rate-limit, crea cotización borrador, notificación realtime |
| Auth | `src/lib/auth.ts:32` | Contraseña única compartida → JWT `{role:"erp"}`. Sin usuarios, sin roles, sin audit |

---

## Comparativa competidor por competidor

### 1. Salesforce
| | |
|---|---|
| **Mejor que nosotros** | Pipeline/oportunidades configurable, automatización (Flow), reportes ad-hoc por el usuario, AppExchange, Einstein AI a escala, multi-usuario con roles granulares, API/integraciones masivas |
| **Nosotros igual/mejor** | Time-to-value (Salesforce tarda semanas; esto está vivo). Lógica financiera de utilidad por socio y costeo de importación que Salesforce NO trae. Cero costo por asiento |
| **Copiar (1-3)** | (a) Vistas guardadas/filtros por usuario sobre listas; (b) un objeto "actividad/tarea" ligado a cliente para seguimiento manual; (c) campos calculados visibles en CRM |
| **Jamás copiar** | El modelo de objetos/permisos/setup de Salesforce — mataría la simplicidad. No necesitas un "admin de Salesforce" para un negocio de 42 ventas |

### 2. HubSpot
| | |
|---|---|
| **Mejor que nosotros** | Secuencias de email/marketing automatizadas, formularios y captura de leads, scoring de leads accionable, plantillas de comunicación, inbox compartido, reporting visual self-serve |
| **Nosotros igual/mejor** | La predicción de compra (`lib-prediccion.ts`) es conceptualmente más rica que el lead-scoring básico de HubSpot Free. Portal de pedidos con reconocimiento de cliente es algo que HubSpot no da out-of-box para un distribuidor |
| **Copiar (1-3)** | (a) **Convertir la predicción en acción**: "estos 5 clientes están por recomprar → mandar WhatsApp/email"; (b) plantillas de mensaje por etapa; (c) timeline de interacciones por cliente |
| **Jamás copiar** | El bloat de Marketing Hub (workflows de 40 pasos, lead nurturing multicanal) — irrelevante para ~10 spas clientes |

### 3. Microsoft Dynamics 365
| | |
|---|---|
| **Mejor que nosotros** | ERP+CRM unificado real, contabilidad/finanzas formales, multi-moneda transaccional, multi-almacén, integración Office/Power BI, dimensiones financieras |
| **Nosotros igual/mejor** | Costeo de importación dolarizado por unidad ya resuelto; ROI por socio nativo. Dynamics requiere un partner para configurar esto |
| **Copiar (1-3)** | (a) Multi-almacén/ubicación cuando crezcan; (b) cierre/periodo contable simple; (c) reporte de antigüedad de saldos (aging) — ya tienen `saldo_pendiente` |
| **Jamás copiar** | Las "dimensiones financieras" y el modelo contable completo — sobreingeniería para este tamaño |

### 4. Odoo
| | |
|---|---|
| **Mejor que nosotros** | Suite modular open-source (Compras, Inventario, Contabilidad, POS, eCommerce, Proyecto) integrada; órdenes de compra → recepción → factura encadenadas; multi-empresa; app store |
| **Nosotros igual/mejor** | UX muy superior (Odoo se siente denso/empresarial); el portal `/order` es más limpio que el eCommerce de Odoo; lógica de socios e importación nativa |
| **Copiar (1-3)** | (a) Encadenar **Pedido de compra → recepción → entrada a inventario** automática (hoy `fix-pedido-3.py` lo hace por script, gap real); (b) órdenes de compra con estado de recepción parcial; (c) backorders |
| **Jamás copiar** | La densidad de Odoo y su modelo de módulos/dependencias. Odoo es el anti-ejemplo de simplicidad |

### 5. Monday.com
| | |
|---|---|
| **Mejor que nosotros** | Vistas flexibles (tablero/kanban/timeline/calendario), automatizaciones no-code, colaboración/asignación, notificaciones configurables |
| **Nosotros igual/mejor** | Datos estructurados de negocio real (no celdas libres); cálculos financieros correctos que Monday no hace |
| **Copiar (1-3)** | (a) **Vista calendario/kanban de cotizaciones por estatus** (borrador→enviada→aceptada); (b) recordatorios automáticos ("cotización vence en 3 días" ya se calcula en dashboard, falta notificar); (c) vista kanban de pedidos por estatus de importación |
| **Jamás copiar** | El paradigma "todo es una celda editable" — perdería la integridad de datos financieros |

### 6. ClickUp
| | |
|---|---|
| **Mejor que nosotros** | Tareas, recordatorios, asignaciones, docs, automatizaciones, múltiples vistas |
| **Nosotros igual/mejor** | No es un competidor directo (es gestión de trabajo). Nuestro dominio financiero es ajeno a ClickUp |
| **Copiar (1-3)** | (a) Tareas/recordatorios ligeros ("dar seguimiento a cliente X"); (b) notas/comentarios en venta o cotización |
| **Jamás copiar** | Su sobrecarga de features ("everything app") — es famoso por abrumar |

### 7. Notion
| | |
|---|---|
| **Mejor que nosotros** | Flexibilidad total de bases de datos, vistas, relaciones, documentación interna, plantillas |
| **Nosotros igual/mejor** | Nosotros tenemos lógica de negocio compilada y confiable; Notion no calcula utilidad ni descuenta inventario con integridad |
| **Copiar (1-3)** | (a) **Búsqueda global tipo Cmd+K** (gap grande, no existe); (b) páginas de detalle con bloques de notas libres; (c) plantillas de cotización guardables |
| **Jamás copiar** | Convertir el ERP en "lego" editable — sacrificaría las reglas GENERATED y la consistencia |

### 8. Linear
| | |
|---|---|
| **Mejor que nosotros** | Command palette (Cmd+K), velocidad percibida, atajos de teclado, keyboard-first, diseño impecable |
| **Nosotros igual/mejor** | El panel de predicción de clientes ya está inspirado en Linear/Attio (CLAUDE.md lo dice). UX premium comparable en varias vistas |
| **Copiar (1-3)** | (a) **Command palette Cmd+K** para navegar/crear; (b) atajos de teclado ("N" = nueva venta); (c) navegación optimista/instantánea |
| **Jamás copiar** | Nada tóxico aquí — Linear es buen modelo. Solo no sobre-invertir en keyboard-first para usuarias no técnicas |

### 9. SAP (S/4HANA / Business One)
| | |
|---|---|
| **Mejor que nosotros** | Contabilidad/finanzas de grado auditoría, cumplimiento fiscal, MRP/planeación de demanda, multi-entidad, trazabilidad por lote, controles internos/segregación de funciones |
| **Nosotros igual/mejor** | Absolutamente todo lo de UX, costo y velocidad. SAP para este negocio sería absurdo |
| **Copiar (1-3)** | (a) **Audit trail** (quién cambió qué) — gap crítico aquí; (b) numeración de documentos a prueba de duplicados (ya parcialmente en `numero-orden.ts`); (c) punto de reorden sugerido |
| **Jamás copiar** | Prácticamente toda la complejidad de SAP. Es el epítome del bloat para una PYME |

### 10. Oracle NetSuite
| | |
|---|---|
| **Mejor que nosotros** | ERP cloud completo: contabilidad, facturación, multi-subsidiaria, multi-moneda transaccional, revenue recognition, reportes financieros formales, SuiteAnalytics |
| **Nosotros igual/mejor** | Costeo de importación y reparto por socio nativos; UX y costo. NetSuite cobra decenas de miles al año |
| **Copiar (1-3)** | (a) **Multi-moneda transaccional** (hoy todo es MXN aunque el negocio es USD/BRL nativo); (b) facturación con numeración fiscal; (c) dashboards financieros guardables |
| **Jamás copiar** | Revenue recognition, multi-subsidiaria, el modelo de consultoría/implementación de NetSuite |

---

## Posicionamiento honesto hoy
Es un **ERP/CRM vertical de un solo inquilino, de calidad de producto interno premium**, que ya supera a los genéricos en *fit* de dominio (importación + utilidad por socio + IVA real/referencial) y en UX, pero está por debajo en *capacidades horizontales maduras* (usuarios/roles, contabilidad, export, automatización, móvil). No compite con Salesforce/SAP; compite con "una hoja de Google Sheets + WhatsApp", y a eso le gana por mucho.

## Ventaja diferencial potencial
**Vertical de bronceado/distribución importadora + simplicidad radical + IA accionable.** Ningún competidor entiende de fábrica el costeo BRL→USD→MXN por unidad, el reparto de utilidad entre socios, ni la predicción de recompra de spas. Si la IA pasa de *predecir* a *actuar* (recordar, ofertar, reordenar), se vuelve un asistente que ningún SaaS genérico iguala para este nicho.

## Las 5 features de clase mundial que más cerrarían la brecha
1. **Usuarios + roles + audit trail** — desbloquea confianza financiera y vender a otros distribuidores (multi-tenant).
2. **IA accionable (CRM)** — convertir `lib-prediccion.ts` en campañas: "clientes por recomprar → un clic para WhatsApp/email" + sugerencia de reorden de inventario.
3. **Command palette (Cmd+K) + búsqueda global** — salto de productividad estilo Linear/Notion; hoy inexistente.
4. **Export a Excel/CSV + reportes guardables** — tabla-stakes que todos los competidores tienen y aquí falta por completo.
5. **Facturación/contabilidad ligera (CFDI MX) + multi-moneda transaccional** — el paso de "ERP que mide" a "ERP que opera fiscalmente".

---

## 6. Detalle por área

### Ventas

El módulo de Ventas es el más maduro visualmente del ERP: tabla premium con TanStack (sort, filtros, columnas togglables, paginación, edición inline del reparto), drawer de detalle rico, dashboard con KPIs y gráficas, y manejo cuidadoso de IVA real vs referencial. La lógica de IVA y de exclusión de cliente interno está correcta y consistente con CLAUDE.md. PERO arrastra un agujero funcional crítico: crear una venta NUNCA descuenta inventario (queda `inventario_descontado: false` para siempre y nadie lo procesa), lo que rompe la promesa central de un ERP y desincroniza el stock que el mismo módulo muestra. Además hay corrupción financiera latente: el reparto venta_socios se inserta 50/50 sobre el `total` (con IVA), no sobre la utilidad ni el reparto real, y al editar la venta el total cambia pero el reparto no, dejando descuadres silenciosos. No hay validación de `numero` duplicado, no hay registro de abonos/pagos parciales (solo un campo acumulado), no hay auditoría de cambios, ni devoluciones, ni export. La performance es buena para decenas de ventas pero NO escala: la página carga TODOS los venta_items 3 veces sin paginar y el cliente filtra en memoria.

**¿Completo?** No. Faltan piezas core de un módulo de ventas: (1) descuento de inventario al vender, (2) historial de abonos (hoy `cantidad_pagada` es un solo número acumulado, sin fechas ni montos por pago — el "Timeline" del drawer lo finge poniendo todo en `venta.fecha`), (3) devoluciones/notas de crédito, (4) auditoría de cambios (quién cambió un estatus o un monto de socio y cuándo), (5) export (CSV/Excel/PDF de la lista), (6) validación de número único.

**¿Qué sobra / confunde?** La tabla expone ~20 columnas con dos conceptos de ganancia coexistiendo ("Utilidad bruta" = subtotal−costo_prod en JS, vs `utilidad_neta` y `ganancia` GENERATED en BD con otra fórmula). El propio código admite que `BD.ganancia` tiene "fórmula distinta" y por eso recalcula en JS — esto es una bomba de confusión: el detalle de venta (`[id]/page.tsx`) muestra `venta.ganancia` (BD) mientras el dashboard y el drawer muestran la bruta calculada en JS. Dos números con la misma etiqueta "Ganancia" en pantallas distintas.

**¿Qué simplificar?** Unificar la definición de ganancia en un solo helper compartido y usarlo en TODAS las vistas. Consolidar los 3 fetch de venta_items de `page.tsx` en uno.

**¿Qué automatizar / haría la IA?** (a) Descuento de inventario automático al confirmar venta con transacción atómica. (b) Sugerir el `numero` siguiente automáticamente (hoy se teclea a mano, formato `PC-210526001-V-Cliente` propenso a typos). (c) Detección de anomalías: ya hay un buen "drift detector" del total en la tabla — la IA podría además alertar de márgenes negativos, ventas sin reparto que cuadre, o clientes con saldo vencido. (d) Auto-clasificar el método de pago / extraer referencia de transferencia de las notas. (e) Predicción de cobro de saldos pendientes.

**¿Qué genera fricción?** Crear venta manual exige teclear número, subtotal, descuento, costo productos, costo envío a mano sin autocálculo desde productos (solo el camino vía cotización trae items). Registrar un abono obliga a editar y SOBREESCRIBIR `cantidad_pagada` con el acumulado mental, en vez de "agregar pago de $X".

**Benchmark Stripe/HubSpot:** rechazarían el módulo por: stock que no se mueve al vender, pagos sin historial, y reparto financiero que no se recalcula al editar. La capa de UI sí está a nivel Linear/Attio.

**Hallazgos (13):**

<details>
<summary><strong>[Alto] #10 — Dos definiciones distintas de 'Ganancia' con la misma etiqueta entre pantallas</strong> · Lógica de negocio · Imp 7/Cpx 3 · 4-6h</summary>

- **Archivo:** `src/app/(dashboard)/ventas/[id]/page.tsx:221-226`
- **Problema:** El detalle de venta muestra StatCard 'Ganancia' = `venta.ganancia` (columna GENERATED de BD, que el resto del código describe como 'fórmula distinta = utilidad_neta', ventas-table-premium.tsx:693-695). En cambio el dashboard (ventas-dashboard.tsx:166-170), el drawer (venta-drawer.tsx:165) y la tabla calculan la 'ganancia bruta' = subtotal − costo_productos en JS. Resultado: la MISMA venta muestra un número de 'Ganancia' en /ventas/[id] y otro distinto en el drawer/dashboard. Para el socio que mira ambas pantallas, esto destruye la confianza en los números financieros.
- **Recomendación:** Crear un único helper `gananciaBruta(v)` y `utilidadNeta(v)` en un lib compartido (p.ej. src/app/(dashboard)/ventas/ganancia-util.ts) y usarlo en las 4 vistas. En el detalle, mostrar AMBAS (bruta y neta) con etiquetas explícitas como ya hace el drawer (líneas 461-496), no un solo 'Ganancia' ambiguo apuntando a la columna BD.
- **Beneficio esperado:** Un solo número de ganancia consistente en todo el módulo; cero ambigüedad para los socios.
- **Verificación:** confirmado — CONFIRMADO con matiz. El detalle de venta src/app/(dashboard)/ventas/[id]/page.tsx:221-226 renderiza un StatCard etiquetado solo "Ganancia" con value=mxn.format(Number(venta.ganancia ?? 0)), donde venta.ganancia es la columna GENERATED de BD (seleccionada en línea 47). Por CLAUDE.md esa columna = total − costo_productos − costo_envio. En cambio, las demás superficies NO usan venta.gan

</details>

<details>
<summary><strong>[Alto] #17 — Reparto venta_socios 50/50 sobre el TOTAL (con IVA) contradice la regla de negocio y se descuadra al editar</strong> · Lógica de negocio · Imp 7/Cpx 5 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:108-134`
- **Problema:** saveVenta reparte `total / 2` a cada socio. Pero MEMORY.md ('venta_socios reparto real') y CLAUDE.md dicen que el reparto NO es 50/50 y refleja el cobro real per Sheet, y que el drift vs total = IVA + saldo pendiente. Repartir el TOTAL incluyendo IVA es doblemente incorrecto: (1) el IVA es dinero del fisco, no utilidad a repartir; (2) cuando la venta no está pagada, se asignan montos que aún no se cobraron. Peor: updateVenta (línea 435-437) explícitamente NO toca venta_socios al editar, así que si el usuario cambia el IVA o el descuento, el `total` (GENERATED) cambia pero el reparto sigue con el valor viejo → la suma socios deja de cuadrar con el total. El ExpandedRow de la tabla (ventas-table-premium.tsx:1383-1448) ya detecta y muestra este descuadre ('Restante $X'), confirmando que sucede en la práctica.
- **Recomendación:** La recomendación original es buena; la precision adicional es: el sistema ya soporta el modelo manual per-Sheet (updateVentaSocio + UI editable inline), así que la fuente de verdad de negocio es "captura manual del cobro real", no "50/50 del total". Acciones recomendadas, en orden: (1) Decidir y documentar formalmente la base: el reparto refleja el cobro real per socio (manual), NO 50/50 del total. (2) En saveVenta, dejar de insertar 50/50 sobre `input.total`. Mejor opción: pre-cargar el default sobre la base SIN IVA y SOLO la parte cobrada, p.ej. `((input.subtotal - descuento)/2)` como sugerencia editable, o insertar 0/0 y exigir captura. Como mínimo absoluto, cambiar `input.total / 2` → `(input.subtotal - input.descuento) / 2` para excluir el IVA (dinero del fisco). (3) Definir explícitamente que el descuadre vs total es esperado cuando hay saldo pendiente/IVA, y que el indicador "Restante" de ventas-table-premium.tsx:1383 debería comparar contra la base de reparto correcta (subtotal−descuento, o utilidad), no contra `total` con IVA, para no marcar "descuadre" en ventas legítimamente parciales. (4) No es necesario recalcular venta_socios en updateVenta si se adopta el modelo manual; basta que el default inicial sea coherente y que la UI no falsee descuadres.
- **Beneficio esperado:** El reparto a socios deja de incluir impuestos ajenos y de descuadrarse silenciosamente al editar; el ROI de socios (que alimenta /finanzas) deja de estar inflado por IVA.
- **Verificación:** ajustado — Hallazgo CONFIRMADO en sus hechos, severidad AJUSTADA de Crítico/9 a Alto/7.

Evidencia confirmada:
- src/app/(dashboard)/ventas/actions.ts:108-109 — `const half = Number((input.total / 2).toFixed(2))`. Comentario en :108 dice "División hardcodeada Sandra/Benjamin al 50%". Reparte el TOTAL (= subtotal + iva − descuento, incluye IVA) en partes iguales. Esto contradice la base de reparto 

</details>

<details>
<summary><strong>[Alto] #18 — Vender NUNCA descuenta inventario — el stock jamás se mueve</strong> · Lógica de negocio · Imp 7/Cpx 6 · 2-3d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:43-148`
- **Problema:** saveVenta inserta la venta con `inventario_descontado: false` (línea 66) y crea venta_items, pero NO existe ningún código en todo el repo que decremente `inventario.stock_actual` al vender. Grep confirma que las únicas mutaciones de stock son: pedidos (incoming), edición manual de inventario, y RESTAURACIÓN de stock al cancelar cotización (cotizaciones/actions.ts:567, que SUMA). El confirmar de cotización tampoco descuenta. Resultado: el detalle de venta siempre muestra 'Stock no descontado todavía' ([id]/page.tsx:537) y el stock que el propio drawer pinta junto a cada producto (venta-drawer.tsx:389) está permanentemente sobrevaluado. Para un ERP de distribución esto es el bug central: el inventario nunca refleja lo vendido.
- **Recomendación:** La RPC `descontar_inventario_venta(venta_id)` YA EXISTE en Postgres y ya se usa en marcarVendida (cotizaciones/actions.ts:248) — NO crear una nueva. Acciones: (1) En saveVenta, tras insertar venta_items (ventas/actions.ts:~105), llamar `await supabase.rpc("descontar_inventario_venta", { venta_id: venta.id })` y setear inventario_descontado=true solo si tuvo éxito, replicando el patrón de marcarVendida (incluyendo el guard de error). Cuidado con doble descuento: si una venta se crea con cotizacion_id, asegurar que NO pase también por marcarVendida (verificar que ambas rutas sean mutuamente excluyentes en la UI). (2) Crear RPC inversa `restaurar_inventario_venta(venta_id)` y llamarla en eliminarVenta (530-565) cuando inventario_descontado=true, y en cambiarEstatusVenta al pasar a 'cancelada'. (3) Idealmente envolver venta+items+socios+descuento en una sola función Postgres transaccional para evitar ventas huérfanas (hoy los early-returns 72/83/102/132 dejan estado parcial). (4) Revisar la RPC existente para confirmar que respeta la regla CLAUDE.md (UPDATE si existe fila inventario, INSERT con stock_inicial=stock_actual si no) antes de reusarla.
- **Ejemplo:**

```
// dentro de saveVenta, tras insertar venta_items:
const byProd = new Map<string, number>()
for (const it of ventaItems) byProd.set(it.producto_id, (byProd.get(it.producto_id) ?? 0) + Number(it.cantidad))
for (const [pid, cant] of byProd) {
  const { data: inv } = await supabase.from('inventario').select('id, stock_actual').eq('producto_id', pid).maybeSingle()
  if (inv?.id) await supabase.from('inventario').update({ stock_actual: Math.max(0, Number(inv.stock_actual ?? 0) - cant) }).eq('id', inv.id)
  else await supabase.from('inventario').insert({ producto_id: pid, stock_actual: 0, stock_minimo: 0, stock_inicial: 0 })
}
await supabase.from('ventas').update({ inventario_descontado: true }).eq('id', venta.id)
```

- **Beneficio esperado:** El inventario refleja la realidad; el módulo cumple su función ERP; se evita sobreventa y reportes de stock falsos.
- **Verificación:** ajustado — CONFIRMADO PARCIAL, con un error factual grave del auditor que baja la severidad de Crítico a Alto.

CIERTO:
- src/app/(dashboard)/ventas/actions.ts:43-148 `saveVenta` inserta la venta con `inventario_descontado: false` (línea 66), crea venta_items (98) y venta_socios (128), pero NUNCA decrementa inventario.stock_actual ni llama RPC alguna. Incluso cuando viene de cotización (cotizacion

</details>

<details>
<summary><strong>[Alto] #19 — Creación de venta no es transaccional: fallo a media deja venta huérfana o sin reparto</strong> · Base de datos · Imp 7/Cpx 6 · 1d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:50-134`
- **Problema:** saveVenta hace 4 operaciones secuenciales independientes (insert venta → insert venta_items → insert venta_socios → update cotización). Si venta_items falla devuelve 'Venta creada pero items fallaron' (línea 102) dejando una venta sin productos; si venta_socios falla, queda una venta+items sin reparto. No hay rollback. El usuario ve un toast de error pero la venta YA existe en la lista, corrupta. Con el agregado del descuento de inventario (finding 1) el riesgo de estado parcial empeora.
- **Recomendación:** Mover la creación completa a una función RPC de Postgres (plpgsql) invocada con .rpc(), que inserte venta+items+socios+descuento de stock dentro de una transacción y haga ROLLBACK ante cualquier error. Alternativa de menor esfuerzo: en caso de fallo de items/socios, borrar la venta recién creada antes de devolver el error (compensating delete).
- **Beneficio esperado:** Nunca quedan ventas a medias en la BD; los reportes financieros no se contaminan con registros parciales.
- **Verificación:** confirmado — CONFIRMADO contra src/app/(dashboard)/ventas/actions.ts (saveVenta, líneas 43-148). La función ejecuta 4 grupos de operaciones secuenciales SIN transacción ni rollback:

1. INSERT ventas (líneas 50-69) → si falla retorna sin estado parcial (correcto, líneas 71-73).
2. SELECT cotizacion_items + INSERT venta_items (líneas 75-106). Si cotErr (línea 82-84) o itemsErr (líneas 99-104) falla

</details>

<details>
<summary><strong>[Alto] #20 — Pagos parciales sin historial de abonos — solo un acumulado sobreescribible</strong> · Funcionalidad · Imp 7/Cpx 6 · 2d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/[id]/editar/edit-form.tsx:100-115`
- **Problema:** Registrar un abono = editar la venta y sobreescribir `cantidad_pagada` con el NUEVO total acumulado, calculado mentalmente por el usuario. No hay tabla de pagos, ni fecha, ni monto por abono, ni quién lo registró. El 'Timeline' del drawer (venta-drawer.tsx:546-568) finge un historial poniendo todo el pago en `venta.fecha`, lo que es engañoso. Para ventas a crédito con varios abonos (el negocio claramente las tiene: hay estatus pagada_parcial y filtro de pendientes) esto es insuficiente y propenso a error: si el usuario teclea el monto del abono en vez del acumulado, corrompe el saldo.
- **Recomendación:** Crear tabla `venta_pagos` (venta_id, monto, fecha, metodo, nota) y un flujo 'Registrar abono' que INSERTE un pago y derive `cantidad_pagada` = SUMA de pagos (o columna GENERATED). El Timeline pasa a ser real. Mantener edición directa solo como override administrativo.
- **Beneficio esperado:** Historial de cobranza auditable, saldos correctos, Timeline veraz, base para reportes de antigüedad de saldos.
- **Verificación:** confirmado — CONFIRMADO en todos sus puntos contra el código real.

1) Abono = sobreescritura de acumulado. edit-form.tsx:100-115 expone un único input "Cantidad pagada" que hace `setCantidadPagada(...)` con el valor tecleado (no suma incremental). En actions.ts:414-427, `updateVenta` arma `updatePayload.cantidad_pagada = input.cantidad_pagada` y hace un `.update(updatePayload)` plano sobre la fil

</details>

<details>
<summary><strong>[Alto] #24 — La página carga TODOS los venta_items 3 veces y filtra en memoria — no escala</strong> · Performance · Imp 7/Cpx 7 · 3-5d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/page.tsx:20-94`
- **Problema:** page.tsx hace `select` de venta_items SIN límite tres veces: (1) en el Promise.all con joins a productos (línea 47-53), (2) otra vez para ventas-por-tipo con join a categorías (línea 80-85), y trae ventas con limit(2000). Todo se envía al cliente y VentasDashboard filtra en memoria (filtered useMemo, líneas 380-414). Con 42 ventas funciona; con 10k ventas y sus items (decenas de miles de filas) esto satura el payload del server component, el JSON al cliente y el TanStack table (que aunque pagina, mantiene las 10k filas en estado y re-deriva EnrichedVenta en cada render). getVentasStats (actions.ts:243-249) además trae TODOS los venta_items históricos sin filtro intencional.
- **Recomendación:** Para escalar: (a) paginar/filtrar en servidor (mover from/to/cliente/estatus a query params y .range() en Supabase), (b) calcular ventas-por-tipo y KPIs con agregaciones SQL (vistas o RPC) en vez de traer todos los items, (c) virtualizar la tabla (@tanstack/react-virtual) o usar paginación server-side de TanStack. Hoy NO es urgente (decenas de ventas) pero es el techo de escalabilidad del módulo.
- **Beneficio esperado:** El módulo aguanta miles de ventas sin degradar TTFB ni memoria del navegador; payloads acotados.
- **Verificación:** confirmado — Verificado contra el código real. Las tres lecturas sin límite de venta_items existen:
- page.tsx:47-53 — admin.from("venta_items").select(... productos(id,sku,nombre,peso,imagen_url)) sin .range()/.limit().
- page.tsx:80-85 — segunda lectura admin.from("venta_items").select(... productos(categorias(nombre))) sin límite (await separado, ni siquiera dentro del Promise.all, añade un rou

</details>

<details>
<summary><strong>[Medio] #57 — updateVenta puede revivir una venta cancelada al recalcular estatus</strong> · Lógica de negocio · Imp 5/Cpx 2 · 2h</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:395-419`
- **Problema:** updateVenta recalcula `estatus` con ventaEstatus(total, cantidad_pagada) y lo escribe siempre (línea 417), sin considerar si la venta estaba 'cancelada'. Si un usuario edita las notas o el pago de una venta cancelada, el estatus se sobreescribe a pendiente/parcial/total y la venta 'resucita' silenciosamente, reapareciendo en KPIs y reportes (que filtran cancelada). El edit-form tampoco expone 'cancelada' como estado.
- **Recomendación:** En updateVenta, leer el estatus actual; si es 'cancelada', NO recalcularlo (preservarlo) salvo acción explícita de reactivar. Alternativamente bloquear la edición de ventas canceladas.
- **Beneficio esperado:** Las ventas canceladas no vuelven a contar en finanzas por una edición accidental de notas.

</details>

<details>
<summary><strong>[Medio] #68 — eliminarVenta hace borrado físico sin restaurar inventario ni soft-delete</strong> · Lógica de negocio · Imp 5/Cpx 4 · 1d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:530-565`
- **Problema:** eliminarVenta borra físicamente venta_items, venta_socios y la venta. No hay soft-delete ni papelera: una venta borrada por error es irrecuperable (el modal lo advierte, pero igual). Además, si se implementa el descuento de inventario (finding 1), eliminar una venta DEBERÍA devolver el stock y aquí no lo hace. revalidatePath('/inventario') al final (línea 563) sugiere que se asumió que tocaba inventario, pero no lo toca.
- **Recomendación:** Preferir soft-delete (columna deleted_at) filtrando en todas las queries, o al menos: al eliminar, devolver stock de los items (sumar) antes de borrar. Coordinar con finding 1.
- **Beneficio esperado:** Borrados reversibles y stock consistente tras eliminar ventas.

</details>

<details>
<summary><strong>[Medio] #79 — Sin auditoría de cambios en operaciones financieras sensibles</strong> · Arquitectura · Imp 5/Cpx 5 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:451-524`
- **Problema:** updateVentaSocio (edición inline del monto de un socio desde la tabla), cambiarEstatusVenta y eliminarVenta no dejan rastro de quién/cuándo/valor anterior. Con login de contraseña compartida (sin auth.uid) no hay forma de saber quién tocó el reparto o canceló una venta. Para el corazón financiero de un negocio entre 2 socios, poder editar el monto de Sandra/Benjamin con un click sin log es un riesgo de disputa.
- **Recomendación:** Tabla `venta_audit_log` (venta_id, accion, campo, valor_anterior, valor_nuevo, actor, timestamp). Como no hay usuarios reales, al menos registrar timestamp + IP/sesión del JWT. Escribir un log en updateVentaSocio, cambiarEstatusVenta, eliminarVenta y updateVenta.
- **Beneficio esperado:** Trazabilidad de cambios financieros; resuelve disputas entre socios; base para un futuro multi-usuario.

</details>

<details>
<summary><strong>[Medio] #121 — Sin validación de número de venta duplicado</strong> · Lógica de negocio · Imp 4/Cpx 3 · 3-4h</summary>

- **Archivo:** `src/app/(dashboard)/ventas/venta-form.tsx:135-148`
- **Problema:** handleSave solo valida que `numero` no esté vacío. saveVenta lo inserta sin verificar unicidad ni autogenerarlo. El número se teclea a mano (placeholder 'PC-210526001-V-Cliente', línea 238) — formato largo y propenso a typos. Si la columna tiene UNIQUE en BD, el insert falla con un error críptico de Postgres; si no lo tiene, se crean dos ventas con el mismo número y el grep confirma que no hay ningún chequeo de duplicado en el módulo. MEMORY.md menciona anti-duplicados por formato PC-\d+ solo en el seed, no en el alta normal.
- **Recomendación:** Prioridad real Media (fricción/UX, no corrupción). 1) Garantizar el constraint UNIQUE de forma versionada (no solo dentro del seed) para que nunca dependa de si el seed corrió. 2) En saveVenta, capturar el código 23505 y devolver mensaje amable: 'Ya existe una venta con ese número.' en lugar de ventaErr.message crudo. 3) Mejor aún: reusar construirNumeroOrden() (ya importado en otros módulos) para prerellenar el número en venta-form, dejándolo editable, eliminando el tecleo manual del formato largo. El SELECT count previo es opcional/secundario: con UNIQUE + traducción de 23505 ya se cubre la integridad sin race conditions.
- **Beneficio esperado:** Elimina números duplicados que rompen la trazabilidad y confunden el reparto; reduce fricción del alta manual.
- **Verificación:** ajustado — Mecánica confirmada, pero la severidad declarada (Alto/6) está sobreestimada porque el escenario de corrupción de datos (dos ventas con el mismo número) es improbable.

EVIDENCIA:
- venta-form.tsx:135-148 — handleSave solo valida numero.trim() vacío, clienteId y total>0. No hay chequeo de unicidad. Confirmado.
- venta-form.tsx:236-239 — el número se teclea a mano con placeholder largo '

</details>

<details>
<summary><strong>[Bajo] #163 — Inconsistencia de color del badge 'pendiente' entre vistas</strong> · UI · Imp 3/Cpx 2 · 2h</summary>

- **Archivo:** `src/app/(dashboard)/ventas/[id]/editar/edit-form.tsx:18-22`
- **Problema:** El estado 'pendiente' se pinta con colores distintos según la pantalla: rojo en edit-form (bg-red-100, línea 19) y en el drawer (rose, venta-drawer.tsx:67-72), pero ámbar en venta-form (amber-100, venta-form.tsx:48) y en el detalle ([id]/page.tsx:22), y azul en la tabla premium (blue, ventas-table-premium.tsx:118-124). Cuatro pantallas, tres colores para el mismo estado. Rompe la consistencia visual tipo Linear/Stripe que el resto del módulo logra.
- **Recomendación:** Centralizar el mapa de colores de estatus en un único módulo compartido (ej. estatus-conf.ts) y consumirlo en venta-form, edit-form, [id]/page, drawer y tabla. Elegir un color canónico por estado.
- **Beneficio esperado:** Lenguaje visual consistente; el usuario reconoce el estado por color sin recalibrar entre pantallas.

</details>

<details>
<summary><strong>[Bajo] #164 — Estados de carga ausentes en navegación del módulo (sin loading.tsx)</strong> · UX · Imp 3/Cpx 2 · 3h</summary>

- **Archivo:** `src/app/(dashboard)/ventas/page.tsx:13-58`
- **Problema:** page.tsx, [id]/page.tsx y nueva/page.tsx son server components con awaits y no hay loading.tsx en el módulo (la navegación a /ventas con limit(2000) + 3 cargas de items se siente como un cuelgue sin feedback). Las ediciones inline hacen router.refresh() completo sin indicador global. El único feedback de carga es el spinner dentro del botón de guardar.
- **Recomendación:** Añadir loading.tsx (skeleton) en /ventas, /ventas/[id], /ventas/estadisticas. Para las ediciones inline que hoy hacen router.refresh() completo, considerar revalidación localizada u optimistic UI (ya existe estado optimista parcial en StatusCell).
- **Beneficio esperado:** Percepción de velocidad y pulido; el usuario sabe que la app respondió.

</details>

<details>
<summary><strong>[Bajo] #178 — No hay export de la lista de ventas (CSV/Excel/PDF)</strong> · Funcionalidad · Imp 3/Cpx 3 · 4-6h</summary>

- **Archivo:** `src/app/(dashboard)/ventas/ventas-table-premium.tsx:1185-1253`
- **Problema:** La toolbar de la tabla premium tiene búsqueda y selector de columnas, pero no botón de exportar. Para un negocio que necesita pasar números a contabilidad o conciliar con el Sheet origen, no poder exportar la vista filtrada (respetando columnas visibles y filtros activos) es una carencia. El módulo claramente nació de un Google Sheet, así que el roundtrip a Excel importa.
- **Recomendación:** Añadir botón 'Exportar' que genere CSV/XLSX de table.getFilteredRowModel().rows con las columnas visibles. Reutilizar utilidades existentes si las hay; XLSX para multi-formato.
- **Beneficio esperado:** Conciliación contable y respaldo fácil; cierra el ciclo con el flujo de Sheets del negocio.

</details>


### Cotizaciones

El módulo de cotizaciones es funcional y visualmente pulido (preview fiel al PDF, editor spreadsheet, KPIs de pipeline, probabilidad heurística de cierre, reversión segura de ventas). Pero esconde un bug financiero crítico: marcarVendida() crea la venta SIN insertar venta_socios, corrompiendo silenciosamente todo el ROI de socios y reportes financieros para cada cotización vendida por esa vía. Además duplica la lógica de creación de venta entre cotizaciones/actions.ts y ventas/actions.ts, que ya divergieron (campos faltantes: cantidad_pagada, estatus, inventario_descontado, costo_total). El flujo de "envío al cliente" es esencialmente inexistente: no hay email, ni link compartible, ni WhatsApp con el PDF — el PDF solo se descarga localmente vía html2pdf en cliente. La generación de PDF es frágil (html2canvas en cliente, imágenes con riesgo CORS, sin manejo de multi-página real). Hay oportunidad enorme de IA (generar cotización desde texto/voz, sugerir precios, follow-up automático de cotizaciones por vencer).

**¿Completo?** Como herramienta interna para 2-3 personas, cubre lo básico (crear, editar, PDF, convertir a venta). Pero falta el eslabón comercial central de un módulo de cotizaciones: **enviar la cotización al cliente**. Hoy el único camino es descargar el PDF y mandarlo a mano por WhatsApp/correo. No hay link público de cotización (read-only), ni botón "Enviar por email", ni "Compartir por WhatsApp con PDF adjunto". HubSpot/Stripe nunca aprobarían un quoting module sin tracking de "visto por el cliente" ni aceptación online.

**¿Qué sobra / duplicación?** La lógica de cotización→venta vive DOS veces: `marcarVendida()` (cotizaciones/actions.ts:173) y `saveVenta()` (ventas/actions.ts:43), más una tercera ruta UI "Convertir a Venta" → `/ventas/nueva?cotizacion=`. Las tres construyen ventas con reglas distintas y ya divergieron (ver hallazgos). Debe existir UNA sola función `crearVentaDesdeCotizacion()`.

**¿Qué simplificar?** El fetch de productos+precios está copiado idéntico en `nueva/page.tsx` y `[id]/editar/page.tsx` (40 líneas duplicadas). Extraer a `lib`.

**¿Qué automatizar / IA?**
1. **Generar cotización desde texto/voz**: "3 cintas 9mm, 2 activadores 200ml para Mithra" → items pre-cargados. Trivial con tool-calling sobre el catálogo.
2. **Sugerir precio/descuento** según historial del cliente y margen mínimo.
3. **Follow-up automático**: cotizaciones "enviada" vigentes a punto de vencer → recordatorio (la heurística de probabilidad en lib-cotizacion-prob.ts ya calcula esto, pero nadie la acciona).
4. **Auto-vencimiento**: hoy "vencida" es 100% manual (un option del select); una cotización vencida sigue diciendo "enviada" hasta que alguien la cambie a mano. Un cron diario debería marcarlas.

**¿Qué confunde / fricción?** El usuario tiene DOS botones que hacen casi lo mismo en el detalle ("Marcar como Vendida" vs "Convertir a Venta") con semánticas distintas e inconsistentes. La nota de IVA referencial es buena, pero el toggle IVA en el form no deja claro que ese IVA NO es el que se cobrará. La numeración consecutiva por cliente hace N queries y tiene una race condition.

**¿Qué haría la IA / clase mundial?** Cotización con aceptación online (cliente hace click → se convierte a venta), e-sign opcional, tracking de apertura, plantillas, y generación asistida. El preview ya es bueno; el gap está en distribución y automatización.

**Hallazgos (15):**

<details>
<summary><strong>[Crítico] #1 — marcarVendida() crea la venta SIN insertar venta_socios → corrompe ROI y reportes financieros</strong> · Lógica de negocio · Imp 10/Cpx 3 · 2h</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/actions.ts:202-256`
- **Problema:** Al 'Marcar como Vendida' una cotización se inserta la fila en `ventas` y sus `venta_items`, pero NUNCA se insertan las filas en `venta_socios`. La regla de negocio (CLAUDE.md: 'Al crear venta: auto-insertar venta_socios 50/50') se cumple en saveVenta() (ventas/actions.ts:108-134) pero NO aquí. No existe trigger en BD que lo haga (el seed lo inserta manualmente: scripts/seed-ventas-from-sheet.sql:533). Resultado: toda venta originada por este botón queda sin reparto a socios → el ROI de Sandra/Benjamin (recuperado de venta_socios) y cualquier reporte de comisiones queda subvaluado de forma silenciosa. Es corrupción financiera real, difícil de detectar porque la venta SÍ aparece en totales.
- **Recomendación:** Tras crear la venta en marcarVendida(), insertar venta_socios 50/50 idéntico a saveVenta(). Mejor aún: extraer una única función `crearVentaDesdeCotizacion(cotizacionId, opts)` reutilizada por marcarVendida y por /ventas/nueva?cotizacion=, para que NUNCA puedan divergir. Además, auditar la BD por ventas con cotizacion_id que no tengan filas en venta_socios y backfill.
- **Ejemplo:**

```
// después del insert de venta_items, antes del RPC:
const half = Number((Number(cot.total) / 2).toFixed(2))
await supabase.from('venta_socios').insert([
  { venta_id: venta.id, socio_id: SANDRA_ID, monto: half, concepto: `Comisión venta ${numeroVenta}`, pagado: false },
  { venta_id: venta.id, socio_id: BENJAMIN_ID, monto: half, concepto: `Comisión venta ${numeroVenta}`, pagado: false },
])
// OJO: reparto real puede no ser 50/50 (ver memoria venta-socios-reparto); como mínimo igualar a saveVenta.
```

- **Beneficio esperado:** Integridad financiera: ROI de socios y comisiones correctos para toda venta, sin importar el camino de creación.
- **Verificación:** confirmado — CONFIRMADO. marcarVendida() en src/app/(dashboard)/cotizaciones/actions.ts:173: inserta en `ventas` (líneas 202-218) y `venta_items` (227-246), llama RPC descontar_inventario_venta (248-250), actualiza estatus de la cotización (258-261), y retorna (275). NUNCA inserta `venta_socios`. Contrasta con saveVenta() en src/app/(dashboard)/ventas/actions.ts:108-134, que sí inserta el reparto 

</details>

<details>
<summary><strong>[Crítico] #5 — Lógica cotización→venta duplicada y divergente (3 caminos, reglas distintas)</strong> · Arquitectura · Imp 9/Cpx 5 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/actions.ts:173-276`
- **Problema:** Existen tres rutas para convertir cotización en venta: (1) marcarVendida() aquí, (2) saveVenta() en ventas/actions.ts:43 con input.cotizacion_id, (3) el link UI 'Convertir a Venta' → /ventas/nueva?cotizacion= (cotizacion-detail.tsx:194). Ya divergieron: marcarVendida NO setea cantidad_pagada (saveVenta sí), NO setea estatus (saveVenta calcula pendiente/parcial/total), NO setea inventario_descontado=true tras el RPC (saveVenta arranca en false y el flujo de ventas lo maneja), NO escribe venta_items.costo_total (saveVenta sí, línea 94), y usa fecha=hoy en vez de la fecha de la cotización. El resultado son dos tipos de ventas con shapes distintos en la misma tabla, lo que rompe reportes y reconciliación de inventario.
- **Recomendación:** Unificar en una sola función `crearVentaDesdeCotizacion()` en un lib compartido, que: copie items con costo_total, calcule estatus desde cantidad_pagada, inserte venta_socios, dispare el RPC de inventario y marque inventario_descontado consistentemente. marcarVendida y la ruta /ventas/nueva deben llamarla. Eliminar uno de los dos botones del detalle para no confundir.
- **Beneficio esperado:** Una sola fuente de verdad para la conversión: sin drift, ventas homogéneas, reportes confiables.
- **Verificación:** confirmado — Confirmados los 3 caminos cotizacion→venta:
1) marcarVendida() — cotizaciones/actions.ts:173-276. Inserta en ventas (204-216) SIN cantidad_pagada, SIN estatus, SIN inventario_descontado; copia venta_items SIN costo_total (228-236); usa fecha=hoy `new Date()` (207).
2) saveVenta() — ventas/actions.ts:43-148. Setea estatus vía estatusFor (48,64), cantidad_pagada (63), inventario_descont

</details>

<details>
<summary><strong>[Medio] #52 — Envío al cliente inexistente: sin email, sin link compartible, sin WhatsApp con PDF</strong> · Funcionalidad · Imp 6/Cpx 6 · 3-5d</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/[id]/cotizacion-detail.tsx:126-240`
- **Problema:** El único modo de hacer llegar la cotización al cliente es handlePdf() que descarga el PDF localmente (downloadCotizacionPdf). No hay: botón 'Enviar por email', link público read-only de la cotización, ni 'Compartir por WhatsApp'. La página /confirmar tiene un wa.me pero solo con texto 'te enviaremos tu cotización en breve' (confirmar/page.tsx:90), NO adjunta ni enlaza el documento. Para un módulo de cotizaciones esto es la función central faltante: el usuario debe descargar, abrir WhatsApp/correo, adjuntar a mano. El estatus 'enviada' se marca manualmente sin que el sistema realmente envíe nada.
- **Recomendación:** La recomendación original es buena y la mantengo, con un orden de fases ajustado al contexto real (negocio chico, sin email infra hoy):

FASE 1 (alto valor / bajo costo): Botón "Compartir" en cotizacion-detail.tsx que (a) genere el PDF y use la Web Share API (navigator.share con files) en móvil para adjuntarlo directo a WhatsApp/correo, con fallback a (b) copiar al portapapeles un mensaje + abrir wa.me con el teléfono del cliente (ya se tiene preview.cliente.telefono y el patrón formatPhoneIntl de confirmar/page.tsx). Esto elimina el paso manual sin requerir backend.

FASE 2 (link público read-only): ruta /cotizacion/[token] con token firmado (HS256, reutilizar patrón de src/lib/auth.ts) renderizada por server component con createAdminClient() — NUNCA exponer anon (RLS bloquea anon, ver CLAUDE.md). Reusar <CotizacionPreview> en modo read-only. Botón "Compartir" copia ese link y/o abre wa.me con él.

FASE 3 (email): enviar por correo con Resend adjuntando el PDF generado server-side, y trackear "visto" (timestamp de primera apertura del link) para alimentar el pipeline/estatus. Esto haría que el estatus "enviada" deje de ser puramente manual.

Consideración financiera/IVA: el link/PDF público debe mostrar el IVA REFERENCIAL de cotizaciones.iva (regla CLAUDE.md), no el de ventas — CotizacionPreview ya opera sobre datos de cotización, así que se respeta automáticamente.
- **Beneficio esperado:** Cierra el flujo comercial: el cliente recibe, ve (tracking) y acepta la cotización; menos pasos manuales y datos de conversión reales.
- **Verificación:** ajustado — CONFIRMADO EN CÓDIGO (los hechos del hallazgo son correctos):

1) src/app/(dashboard)/cotizaciones/[id]/cotizacion-detail.tsx:126-137 — handlePdf() solo llama downloadCotizacionPdf(previewRef.current, numero, nombreCliente). Descarga local del PDF, nada más.

2) Botones de acción (mismo archivo, líneas 170-252): "Ver venta"/"Revertir" (171-189), "Convertir a Venta" (193-201), "Marcar co

</details>

<details>
<summary><strong>[Medio] #56 — Generación de PDF 100% en cliente con html2pdf/html2canvas: frágil, lenta y sin multi-página real</strong> · Performance · Imp 6/Cpx 7 · 3-5d</summary>

- **Archivo:** `src/lib/pdf.ts:37-74`
- **Problema:** El PDF se genera en el navegador con html2pdf.js (html2canvas + jsPDF) a scale:2 sobre un nodo de 816px. Problemas: (1) html2canvas es notoriamente lento y bloquea el hilo principal en cotizaciones grandes; (2) las imágenes de producto se cargan desde Supabase con crossOrigin='anonymous' (CotizacionPreview.tsx:759) — si el bucket/CDN no responde con los headers CORS correctos, html2canvas falla o produce thumbnails en blanco sin error claro; (3) el page-break depende de pageBreakInside:avoid en una sola tarjeta (línea 419), una cotización con muchos items se cortará feo entre páginas; (4) el PDF_RESET_CSS parchea oklch a mano — cualquier color oklch nuevo no listado revienta el render. Es un punto único de fragilidad para el entregable más importante del módulo.
- **Recomendación:** Priorizar por costo/beneficio, no migrar todo de golpe. CORTO PLAZO (1 commit, arregla el daño real): (a) añadir pageBreakInside:"avoid"+breakInside:"avoid" a cada fila de item (CotizacionPreview.tsx:327) y a cada grupo de categoría, para que no se corten entre páginas; (b) dar estado loading al botón PDF (deshabilitar + spinner en handlePdf, cotizacion-detail.tsx:233-240 y nueva/cotizacion-form.tsx:332) ya que html2canvas bloquea el hilo; (c) precargar/validar las imágenes (Promise.all de img.decode()) antes de invocar html2pdf y, si una falla, caer al placeholder de iniciales en vez de un thumb en blanco silencioso. MEDIANO PLAZO (solo si crece el volumen o se quiere enviar PDF por email): mover la generación a server con @react-pdf/renderer o Puppeteer en un route handler (service_role resuelve imágenes server-side sin CORS, paginación real, fidelidad de fuente, adjuntable a email). NO es urgente migrar al servidor para 2-3 usuarios con cotizaciones cortas; el fix de page-break + loading + fallback de imagen elimina el 80% del riesgo con 1/10 del esfuerzo.
- **Beneficio esperado:** PDFs consistentes, multi-página correcta, reutilizables para email, sin fallos silenciosos por CORS u oklch.
- **Verificación:** ajustado — Citas verificadas, todas exactas. src/lib/pdf.ts:42-73 genera el PDF en cliente con html2pdf.js (html2canvas+jsPDF), html2canvas.scale:2, width:816 (pdf.ts:53-58). CORS: CotizacionPreview.tsx:759 usa crossOrigin="anonymous" + useCORS:true (pdf.ts:55). Parche oklch: PDF_RESET_CSS (pdf.ts:20-35) sobrescribe una lista FIJA de CSS vars; cualquier var/utility oklch fuera de esa lista en el á

</details>

<details>
<summary><strong>[Medio] #62 — Editar cotización vendida puede desincronizar venta e inventario</strong> · Lógica de negocio · Imp 5/Cpx 3 · 3h</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/[id]/cotizacion-detail.tsx:217-223`
- **Problema:** El botón 'Editar' está SIEMPRE visible, incluso cuando yaVendida=true (existe venta vinculada). updateCotizacion (actions.ts:408) hace DELETE+INSERT de cotizacion_items y reescribe totales, pero NO toca la venta espejo ni venta_items ni el inventario ya descontado. Resultado: una cotización vendida puede quedar con items/totales distintos a su venta, descuadrando reportes y la trazabilidad cotización↔venta.
- **Recomendación:** Si yaVendida, deshabilitar 'Editar' (o mostrar aviso 'revierte la venta primero'). El revertirCotizacion ya existe para ese caso. Alternativamente, bloquear updateCotizacion server-side cuando exista venta vinculada.
- **Beneficio esperado:** Coherencia entre cotización y su venta; evita descuadres silenciosos de totales e inventario.

</details>

<details>
<summary><strong>[Medio] #69 — Estatus 'vencida' nunca se aplica automáticamente — pipeline siempre desfasado</strong> · Lógica de negocio · Imp 5/Cpx 4 · 1d</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/actions.ts:291-313`
- **Problema:** El único modo de que una cotización pase a 'vencida' es que un humano lo elija en el select (cotizaciones-list.tsx StatusCell). Una cotización 'enviada' con valida_hasta ya pasada sigue mostrándose como 'enviada' en BD. El código lo compensa en dos lugares distintos (page.tsx:97-98 filtra por valida_hasta>=hoy para activas/perdidas; lib-cotizacion-prob.ts:82 resta score si diasParaVencer<0), o sea hay lógica de vencimiento dispersa y derivada en cada lectura, mientras el dato persistido miente. Genera inconsistencia entre la columna 'Estatus' de la tabla y los KPIs.
- **Recomendación:** Cron diario (Vercel cron) que marque estatus='vencida' donde estatus IN ('borrador','enviada') AND valida_hasta < hoy AND no tenga venta. O una vista/columna generada. Centralizar la regla de 'está vencida' en un solo helper consumido por list y prob.
- **Beneficio esperado:** Estatus persistido coherente con la realidad; KPIs y badges dejan de mentir; base para follow-ups automáticos.

</details>

<details>
<summary><strong>[Medio] #80 — Race condition + N queries en la numeración consecutiva por cliente</strong> · Base de datos · Imp 5/Cpx 5 · 1d</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/actions.ts:52-90`
- **Problema:** generarNumeroCotizacion cuenta cotizaciones del cliente (count) y luego, en un loop de hasta 50 iteraciones, hace 4 queries por iteración (numeroOrdenExiste: 2 a cotizaciones + 2 a ventas) hasta encontrar un número libre. Para clientes con varias cotizaciones esto son decenas de round-trips. Además NO hay constraint UNIQUE en cotizaciones.numero (de haberlo, el insert sería atómico): dos cotizaciones creadas casi simultáneamente para el mismo cliente pueden recibir el mismo consecutivo y ambas insertar. La 'garantía de unicidad' del loop es best-effort, no atómica.
- **Recomendación:** Agregar UNIQUE(numero) en cotizaciones y ventas (o un secuencial por cliente en BD). En código, manejar el error de unique-violation con retry en vez de pre-chequear con N queries. Reduce de ~decenas de queries a 1-2 y elimina la race.
- **Beneficio esperado:** Numeración garantizada única bajo concurrencia y latencia drásticamente menor al crear cotización.

</details>

<details>
<summary><strong>[Medio] #93 — Sin transacción atómica: marcarVendida puede dejar estado parcial irrecuperable</strong> · Base de datos · Imp 5/Cpx 6 · 1d</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/actions.ts:202-268`
- **Problema:** marcarVendida ejecuta secuencialmente: insert venta → insert venta_items → RPC descontar inventario → update cotización. Si falla a mitad (p.ej. el RPC de inventario tras crear venta+items), queda una venta huérfana con inventario sin descontar y cotización aún en borrador, sin rollback. Cada return de error deja datos parciales que requieren limpieza manual. Supabase JS no abre transacción; cada llamada es autónoma.
- **Recomendación:** Envolver toda la conversión en una función Postgres (RPC) transaccional que inserte venta, items, venta_socios, descuente inventario y actualice estatus en un solo BEGIN/COMMIT. El cliente solo llama un RPC. Esto además resuelve de raíz la duplicación de lógica.
- **Beneficio esperado:** Atomicidad: o se convierte todo o nada; sin ventas huérfanas ni inventario descuadrado por fallos parciales.

</details>

<details>
<summary><strong>[Medio] #108 — marcarVendida() no marca inventario_descontado=true → riesgo de doble descuento de stock</strong> · Base de datos · Imp 4/Cpx 2 · 1h</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/actions.ts:202-256`
- **Problema:** marcarVendida llama al RPC descontar_inventario_venta() (línea 248) pero NO inserta `inventario_descontado` en la venta (saveVenta lo arranca en false explícitamente, ventas/actions.ts:66). Si la venta queda con inventario_descontado=NULL/false pero el stock YA se descontó vía RPC, cualquier flujo posterior que use ese flag como guard (p.ej. editar/recalcular la venta) puede volver a descontar, dejando inventario negativo. Es inconsistente con el resto del sistema que sí trackea ese flag.
- **Recomendación:** 1) En marcarVendida (cotizaciones/actions.ts), tras el RPC exitoso (después de línea 256) hacer UPDATE ventas SET inventario_descontado=true WHERE id=venta.id, para que el widget de page.tsx:537 no mienta. 2) Decidir la política de stock para saveVenta (ventas/actions.ts): hoy crea ventas SIN descontar inventario y deja el flag en false — confirmar si eso es intencional; si lo es, el flag ya es consistente ahí; si no, falta llamar el RPC. 3) Antes de añadir cualquier flujo futuro de edición/recalculo que descuente stock, usar inventario_descontado como guard real (WHERE inventario_descontado IS NOT TRUE) e idealmente hacer idempotente al RPC en BD. 4) Versionar la definición del RPC descontar_inventario_venta en scripts/*.sql para poder auditar su idempotencia.
- **Beneficio esperado:** Evita doble descuento de inventario y mantiene el flag coherente con saveVenta.
- **Verificación:** ajustado — VERIFICADO PARCIAL. La premisa fáctica del hallazgo es correcta, pero la cadena de impacto ("doble descuento → inventario negativo") NO existe en el código.

Hechos confirmados:
1. marcarVendida() (src/app/(dashboard)/cotizaciones/actions.ts:202-256) inserta la venta SIN el campo inventario_descontado (líneas 204-216 no lo incluyen) y luego llama el RPC descontar_inventario_venta (línea

</details>

<details>
<summary><strong>[Medio] #109 — El número de cotización es 100% editable en texto libre → corrupción del formato</strong> · UX · Imp 4/Cpx 2 · 2-3h</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/nueva/cotizacion-form.tsx:553-559`
- **Problema:** El campo 'Número de orden' es un input de texto libre que el usuario puede sobrescribir con cualquier cosa. Si lo edita y rompe el patrón PC-...-C-..., cambiarTipoNumero al vender no encontrará '-C-' y devolverá el número sin cambiar (numero-orden.ts:59), dejando una venta con número de cotización. También permite duplicados (no hay UNIQUE) y números que no parsean en reportes.
- **Recomendación:** Hacer el número readonly por defecto con un botón 'editar' explícito, o validar el patrón antes de guardar. Mostrar advertencia si el formato no cumple PC-DDMMYY-NNN-C-Nombre.
- **Beneficio esperado:** Garantiza que el número siga siendo parseable y convertible a venta sin sorpresas.

</details>

<details>
<summary><strong>[Medio] #122 — duplicarCotizacion genera número '-COPIA-' que rompe cambiarTipoNumero al venderse</strong> · Lógica de negocio · Imp 4/Cpx 3 · 3h</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/actions.ts:336`
- **Problema:** Al duplicar, el número nuevo es `${orig.numero}-COPIA-${ts}` (ej. PC-020626001-C-Mithra-COPIA-123456). Cuando esa copia se marque como vendida, cambiarTipoNumero (numero-orden.ts:58) hace replace(/-(?:C|V)-/, '-V-') que reemplaza el PRIMER -C-, produciendo PC-020626001-V-Mithra-COPIA-123456: un número de venta con sufijo -COPIA- pegado, feo y no parseable. Además el consecutivo de la copia colisiona conceptualmente con el original.
- **Recomendación:** Al duplicar, regenerar el número con generarNumeroCotizacion(cliente, hoy) en vez de concatenar '-COPIA-'. Así la copia obtiene un consecutivo limpio y vendible.
- **Beneficio esperado:** Números de orden consistentes y parseables incluso para cotizaciones duplicadas que terminan en venta.

</details>

<details>
<summary><strong>[Bajo] #165 — Fetch de productos+precios duplicado idéntico en nueva y editar</strong> · Mantenibilidad · Imp 3/Cpx 2 · 2h</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/nueva/page.tsx:33-71`
- **Problema:** El bloque que busca la lista 'Pública MXN', consulta productos con precios_producto!inner y mapea a Producto[] está copiado byte a byte en nueva/page.tsx:33-71 y [id]/editar/page.tsx:67-108 (incluido el placeholder UUID '00000000-...' y el manejo de nombre_display). Cualquier cambio de catálogo/precios hay que hacerlo en dos lugares; ya es deuda.
- **Recomendación:** Extraer `getProductosParaCotizacion()` a un lib (server) y llamarlo desde ambas páginas. Misma idea para el fetch de clientes.
- **Beneficio esperado:** Una sola definición de catálogo cotizable; menos riesgo de drift entre crear y editar.

</details>

<details>
<summary><strong>[Bajo] #166 — html2pdf importado en cliente pesa el bundle; sin lazy ni feedback de carga</strong> · Performance · Imp 3/Cpx 2 · 1-2h</summary>

- **Archivo:** `src/lib/pdf.ts:42-43`
- **Problema:** downloadCotizacionPdf hace import('html2pdf.js') dinámico (bien), pero el handlePdf en form/detail no muestra spinner ni deshabilita el botón mientras se genera (cotizacion-form.tsx:327, cotizacion-detail.tsx:126). En cotizaciones grandes html2canvas tarda varios segundos: el usuario puede pensar que no pasó nada y clickear de nuevo, disparando dos generaciones.
- **Recomendación:** Estado pendingPdf que deshabilite el botón y muestre 'Generando PDF…' durante la promesa. (Se vuelve trivial si se migra a generación server-side.)
- **Beneficio esperado:** Feedback claro y sin doble disparo en la acción de PDF.

</details>

<details>
<summary><strong>[Bajo] #179 — Detección de categorías por prefijo de SKU duplicada y divergente entre form y preview</strong> · Mantenibilidad · Imp 3/Cpx 3 · 3h</summary>

- **Archivo:** `src/components/cotizaciones/CotizacionPreview.tsx:46-59`
- **Problema:** El resumen del PDF agrupa en solo 2 categorías (Cintas/Otros) vía esCinta() con heurísticas de SKU/nombre (CotizacionPreview.tsx:46), mientras el resumen del formulario usa un mapa de 11 regex de SKU distintas (cotizacion-form.tsx:160-172). Dos taxonomías diferentes para el 'mismo' resumen del pedido: el usuario ve 'Activadores/Potenciadores/...' al crear y solo 'Cintas/Otros' en el PDF final. Inconsistencia confusa y dos fuentes de verdad para categorizar.
- **Recomendación:** Centralizar la categorización por SKU en un helper (idealmente leyendo categorias reales de BD, que el detalle ya trae vía join). Usar la misma taxonomía en form, preview y PDF.
- **Beneficio esperado:** Resumen del pedido coherente entre la captura y el documento entregado al cliente.

</details>

<details>
<summary><strong>[Bajo] #180 — marcarVendida no excluye al cliente interno Piel Canela del reparto a socios</strong> · Lógica de negocio · Imp 3/Cpx 3 · 3h</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/actions.ts:173-256`
- **Problema:** Las cotizaciones del cliente interno Piel Canela (08449791-...) sirven solo para descontar inventario y NO deben contar en KPIs/ROI (CLAUDE.md). marcarVendida no distingue cliente interno: crearía una venta normal (que, una vez arreglado el bug de venta_socios, generaría reparto de comisiones para una 'venta' que en realidad es consumo interno). Hoy el bug de venta_socios lo enmascara, pero al corregirlo hay que decidir el tratamiento del interno.
- **Recomendación:** Al convertir, si cliente_id ∈ getInternalClienteIds(), saltar venta_socios (o marcar la venta como interna) para no inflar comisiones. Validar que las ventas internas ya se excluyen de ROI por su cliente_id en los reportes.
- **Beneficio esperado:** Las cotizaciones internas no contaminan comisiones de socios al venderse.

</details>


### Clientes / CRM (módulo)

_Sección recuperada en una segunda pasada (el auditor original del módulo superó el límite de salida estructurada). Estos 16 hallazgos son **adicionales** a los 201 de la tabla maestra y a la cobertura transversal de Clientes en Arquitectura, Performance, UX, UI e IA._



El módulo de Clientes es visualmente el más ambicioso del ERP —tabla TanStack con 18 columnas configurables, drawer de 600px, heatmap predictivo, dos paneles de "AI Revenue Intelligence" y un modelo de recompra propio— pero es también el que más promete y menos sostiene. El problema raíz es estadístico: el negocio tiene ~42 ventas repartidas entre poquísimos clientes, y aun así la UI muestra "Probabilidad 60d = 73%", "Riesgo de abandono = 81%" y "Próxima compra: 14 jun" con la misma autoridad visual que un dato real, cuando la mayoría de clientes tienen 1–3 compras (n insuficiente para cualquier CDF o curva). En arquitectura, todo el cómputo —enrichment, predicción por cliente, series mensuales, heatmaps— corre en el navegador dentro de un componente cliente de 2,245 líneas que recibe las tablas `ventas`, `venta_items` y `cotizaciones` casi crudas; hay además ~1,056 líneas de código muerto (`prediccion-compras.tsx`). La exclusión del cliente interno está bien resuelta en `page.tsx` y `deleteCliente`, ese es el punto más sólido. Los flujos de alta/edición/borrado son correctos y cuidados (dedup en vivo, borrado con guardas financieras), pero el módulo NO es un CRM: no hay timeline de actividad editable, notas con historial, tareas/recordatorios, segmentos, tags, ni integración WhatsApp/email más allá de `tel:`/`mailto:`. Apple/Linear/HubSpot rechazarían las pantallas por una razón concreta: presentan pseudo-precisión predictiva como verdad, sin honestidad sobre la incertidumbre.

**Assessment**

- **¿Está completo?** Como *catálogo de clientes con analítica*, sí. Como *CRM*, no: falta la capa relacional (actividad, tareas, notas con timestamp, dueño de cuenta funcional, pipeline de prospectos, recordatorios). El `vendedor_socio_id` se captura pero no se usa para filtrar ni para vistas "mis clientes".
- **¿Qué falta?** (1) Honestidad estadística en la predicción (intervalos, "n insuficiente" mucho más agresivo); (2) timeline de actividad real y notas append-only; (3) tareas/follow-ups accionables (los botones "Contactar HOY" no hacen nada); (4) la **ficha de cliente `/clientes/[id]` no existe** —CLAUDE.md la documenta pero solo hay `[id]/editar`; (5) estados de carga/error (no hay `loading.tsx` ni Suspense).
- **¿Qué sobra?** `prediccion-compras.tsx` entero (dead code). Tres superficies que dicen lo mismo (`EstimadoIngresos`, `PrediccionInsights`, heatmap predictivo, + columnas de predicción en la tabla) — redundancia de "AI". Campo `redes_sociales` que se guarda pero **nunca se muestra**.
- **¿Qué simplificar?** Mover enrichment + predicción a SQL/server (vistas materializadas), partir el God component, colapsar las 4 superficies predictivas en una.
- **¿Qué automatizar / qué haría la IA?** Resumen en lenguaje natural por cliente ("compra cada ~45d, lleva 60 sin pedir, riesgo medio, suele comprar oxigenantes"), next-best-action que cree una tarea real, detección de duplicados con merge sugerido, redacción de mensaje de re-enganche por WhatsApp.
- **¿Qué genera fricción / confunde?** La pseudo-precisión (porcentajes de 2 cifras sobre n=2), las acciones que no ejecutan nada, y los KPIs de tendencia "vs mes anterior" calculados sobre meses con datos diminutos (saltan ±100% sin significado).

**Hallazgos (16):**

<details>
<summary><strong>[Crítico] — Predicción con falsa precisión sobre n<5: CDF/bell/global presentan ruido como certeza</strong> · IA · Imp 9/Cpx 6 · 1-2 días</summary>

- **Archivo:** `src/app/(dashboard)/clientes/lib-prediccion.ts:144-165`
- **Problema:** El método se elige por número de ventas: `N>=4` empírico, `N>=2` bell, `N===1` global. Con n=2 hay **un solo gap** entre compras; `stdDev` de un array de 1 elemento devuelve 0, la "curva" colapsa a un pico, y se emite `probabilidadProx60` con 2 cifras significativas (ej. "73%"). La CDF empírica con 3 gaps tiene cuantiles de resolución 1/3. Para un negocio con ~42 ventas y pocos clientes, casi todos caen en n=1–3: la app muestra predicciones que son esencialmente azar disfrazado de modelo. El `metodo` se imprime literal en el drawer ("Modelo: bell · 2 datos históricos") lo que delata el problema pero no lo neutraliza.
- **Recomendación:** Subir el umbral de "predicción mostrable" a n≥5 gaps reales (n≥6 compras). Para n menor, mostrar **rango** ("~cada 30–60d") en vez de fecha exacta y **ocultar** el porcentaje de 60d (o mostrar "datos insuficientes para %"). Añadir intervalo de confianza visible. Nunca renderizar % con resolución mayor a la que los datos permiten.
- **Ejemplo:** `confianza: N>=5?"alta": N>=3?"media": "insuficiente"` — y en UI: `if (confianza==="insuficiente") render rango, no %`.
- **Beneficio esperado:** Decisiones comerciales basadas en señal, no en ruido; credibilidad del módulo ante las socias.

</details>

<details>
<summary><strong>[Crítico] — God component cliente de 2,245 líneas: todo el cómputo y render en el navegador</strong> · Arquitectura · Imp 9/Cpx 7 · 3-5 días</summary>

- **Archivo:** `src/app/(dashboard)/clientes/clientes-dashboard.tsx:1-2245`
- **Problema:** Es el archivo más grande del proyecto y es 100% `"use client"`. Recibe `ventas`, `venta_items` y `cotizaciones` casi crudas (`page.tsx:28-50`) y hace en cliente: enrichment por cliente (`:328-408`), predicción por cliente en bucle (`:412-419`), series mensuales de 12 meses (`:479-524`), KPIs, sparklines SVG, tabla, drawer, dialog. Mezcla 8+ responsabilidades en un solo módulo: tipos compartidos, formato, tabla, `HeroMetric`/`SplitMetric`/`InsightPill`/`Avatar`/`MicroSpark`/`ExpandedClienteRow`/`TipoCell`. El JS de predicción + recharts + framer + TanStack viaja entero al navegador y se recalcula en cada render/filtro.
- **Recomendación:** Extraer (1) tipos a `tipos-cliente.ts`/un `types.ts`; (2) enrichment + predicción a un server component / función server (o vista SQL) que entregue ya `EnrichedCliente[]` y `PrediccionResult` precomputados; (3) subcomponentes de presentación a archivos propios. Objetivo: este archivo <500 líneas y solo orquestación.
- **Beneficio esperado:** Mantenibilidad, menos JS al cliente, recomputación más barata, posibilidad de testear el modelo aislado.

</details>

<details>
<summary><strong>[Alto] — 1,056 líneas de código muerto: `prediccion-compras.tsx` no se importa en ningún lado</strong> · Mantenibilidad · Imp 7/Cpx 1 · 15 min</summary>

- **Archivo:** `src/app/(dashboard)/clientes/prediccion-compras.tsx:1-1056`
- **Problema:** Exporta `PrediccionCompras`, `ClienteRowCRM`, `RiesgoRow`, `HealthDot`, `AiTile`, `getInitials` — y **ninguno se importa** fuera del propio archivo (verificado por grep). Contiene además `void TrendingUp` para silenciar un warning de import sin usar. Es ~14% de todo el módulo en bytes. Confunde a cualquiera que audite "dónde se predice", porque hay tres archivos con lógica de predicción casi idéntica (`prediccion-compras`, `prediccion-insights`, `estimado-ingresos`).
- **Recomendación:** Borrar el archivo. Si algo de su UI es deseable, portarlo explícitamente a `prediccion-insights.tsx`.
- **Beneficio esperado:** −1,056 líneas, claridad inmediata sobre qué predicción está viva.

</details>

<details>
<summary><strong>[Alto] — No es un CRM: faltan actividad/notas/tareas/segmentos; las "acciones" no hacen nada</strong> · Funcionalidad · Imp 8/Cpx 8 · 1-2 sem</summary>

- **Archivo:** `src/app/(dashboard)/clientes/prediccion-compras.tsx:300-361` (lógica de `accionRecomendada`) y `clientes-dashboard.tsx:943-948` (badge "Contactar"/"Preparar")
- **Problema:** El módulo calcula "next-best-action" ("Contactar HOY", "Reenganchar", "Upsell potencial") pero son **etiquetas decorativas**: no crean tarea, no registran contacto, no abren WhatsApp. No existe tabla de actividad/tareas, ni notas con timestamp (solo un campo `notas` plano que se sobrescribe en cada edición — sin historial). No hay segmentación guardable ni tags. El `vendedor_socio_id` no filtra vistas. Comparado con HubSpot/Attio, falta toda la capa relacional que define un CRM.
- **Recomendación:** Añadir tablas `cliente_actividad` (tipo, nota, fecha, autor) y `cliente_tareas` (due_date, estado, asignado). Convertir cada acción recomendada en un botón que cree una tarea o abra `https://wa.me/<telefono>`. Notas append-only en timeline.
- **Beneficio esperado:** Pasa de "dashboard de clientes" a CRM operativo; el equipo actúa sobre las predicciones en vez de solo verlas.

</details>

<details>
<summary><strong>[Alto] — La ficha de cliente `/clientes/[id]` no existe (solo `editar`); CLAUDE.md la documenta como ruta real</strong> · Funcionalidad · Imp 7/Cpx 4 · 1-2 días</summary>

- **Archivo:** `src/app/(dashboard)/clientes/[id]/` (solo contiene `editar/page.tsx`)
- **Problema:** CLAUDE.md afirma "`/clientes/[id] → ficha cliente`", pero el único contenido de `[id]/` es `editar`. No hay `[id]/page.tsx`. La única "ficha" es el drawer, que no es enlazable (no tiene URL propia), no es compartible, no sobrevive a un refresh, y se pierde al navegar. Ningún `href` apunta a `/clientes/[id]` (grep vacío). En un CRM, la cuenta debe ser una página direccionable.
- **Recomendación:** Crear `[id]/page.tsx` server component que reutilice el contenido del drawer como vista completa (deep-linkable, SSR). El drawer puede quedar como preview rápido con un "Ver ficha completa →".
- **Beneficio esperado:** URLs compartibles, SSR (no recalcular en cliente), coherencia con la documentación.

</details>

<details>
<summary><strong>[Alto] — KPIs de "activos acumulados" usan cutoff de string `-31` que rompe el conteo histórico</strong> · Lógica de negocio · Imp 6/Cpx 2 · 1 h</summary>

- **Archivo:** `src/app/(dashboard)/clientes/clientes-dashboard.tsx:516-519`
- **Problema:** `const cutoff = m.key + "-31"` construye `"2026-02-31"` y compara fechas como **strings** (`f <= cutoff`). Para febrero el cutoff es un día inexistente; la comparación lexicográfica funciona por casualidad la mayoría de las veces pero es frágil y conceptualmente incorrecta (depende de que `fecha` siempre venga `YYYY-MM-DD`). El sparkline "Total clientes" y el `trend` `dActivos` (que alimenta el header) se derivan de aquí; con n pequeño el % de tendencia salta ±100% sin significado (`:1113-1117`, `pct(a,b)` devuelve 100 si `b===0`).
- **Recomendación:** Comparar por `m.key` (YYYY-MM) directamente: `f.slice(0,7) <= m.key`. Y suavizar/ocultar trends cuando el denominador es muy pequeño (mostrar "—" en vez de "+100%").
- **Beneficio esperado:** KPIs de cabecera correctos y tendencias que no engañan.

</details>

<details>
<summary><strong>[Alto] — Predicción recalculada para TODOS los clientes en cliente, repetida en 4 superficies</strong> · Performance · Imp 6/Cpx 5 · 1-2 días</summary>

- **Archivo:** `clientes-dashboard.tsx:412-419`, `estimado-ingresos.tsx:255-289`, `recurrencia-analytics.tsx:270-324`, `prediccion-insights.tsx:62-110`
- **Problema:** `predecirCompra` se ejecuta por cliente en el dashboard; el heatmap predictivo vuelve a instanciar `EmpiricalCDFModel` y predice de nuevo por cliente (`recurrencia-analytics.tsx:284`), filtrando `ventas` por cliente dentro de un `.map` anidado (`:301-305`, O(clientes×buckets×ventas)). `EstimadoIngresos` recomputa otra noción de "probable recompra". Cuatro fuentes de verdad para la misma pregunta, todas en el navegador, todas en cada render. Hoy con 42 ventas no duele; el patrón no escala y ya hay trabajo duplicado evidente.
- **Recomendación:** Predecir **una vez** (idealmente en server) y pasar `Map<id,PrediccionResult>` a todos los hijos (ya se hace para `prediccion-insights` vía `predByCliente`; extenderlo a heatmap y estimado). Pre-agrupar ventas por cliente en un `Map` una sola vez en vez de `.filter` repetidos.
- **Beneficio esperado:** Un único modelo, un único cálculo, consistencia entre paneles, base para mover a SQL.

</details>

<details>
<summary><strong>[Alto] — Sin estados de carga/error: la página bloquea en Promise.all sin streaming ni skeleton</strong> · UX · Imp 6/Cpx 3 · medio día</summary>

- **Archivo:** `src/app/(dashboard)/clientes/page.tsx:17-50` (no hay `loading.tsx` ni `error.tsx` en el módulo)
- **Problema:** `page.tsx` hace `Promise.all` de 5 queries + `getInternalClienteIds()` (una sexta query secuencial, `:53`) y solo entonces renderiza. No hay `loading.tsx` ni `<Suspense>`, así que el usuario ve pantalla en blanco hasta que todo resuelve. El `error` se propaga como banner pero los datos vacíos (`?? []`) hacen que un fallo parcial se vea como "0 clientes" en vez de error claro. No hay skeleton para la tabla.
- **Recomendación:** Añadir `loading.tsx` con skeleton de tabla/KPIs. Considerar `<Suspense>` por sección para que KPIs y tabla aparezcan progresivamente. Distinguir "cargando" de "vacío" de "error".
- **Beneficio esperado:** Percepción de velocidad, claridad ante fallos.

</details>

<details>
<summary><strong>[Medio] — `getInternalClienteIds()` hace una query extra cuando los clientes ya traen `is_internal`</strong> · Base de datos · Imp 4/Cpx 2 · 1 h</summary>

- **Archivo:** `src/lib/internal-clientes.ts:12-19` + `clientes/page.tsx:53`
- **Problema:** Después del `Promise.all` se hace una **sexta query secuencial** solo para traer los `id` con `is_internal=true`. Pero `page.tsx` ya está consultando la tabla `clientes`; bastaría con añadir `is_internal` al `select` (`:21-26`) y filtrar en memoria. La query separada añade un round-trip a Supabase en serie (no en paralelo) en cada carga.
- **Recomendación:** Incluir `is_internal` en el select de clientes y derivar el Set localmente; reservar `getInternalClienteIds()` para módulos que no ya consultan `clientes` (ventas, etc.).
- **Beneficio esperado:** −1 round-trip serializado por carga de la página.

</details>

<details>
<summary><strong>[Medio] — `redes_sociales` se captura pero nunca se muestra (campo huérfano)</strong> · Funcionalidad · Imp 4/Cpx 2 · 1-2 h</summary>

- **Archivo:** `cliente-form.tsx:432-459` (captura Instagram/Facebook/web) vs `cliente-drawer.tsx` (no las renderiza); `clientes-dashboard.tsx:77` solo lo declara en el tipo
- **Problema:** El form pide y persiste Instagram, Facebook y sitio web, pero el drawer ("Contacto y datos", `:344-383`) no los muestra, la tabla no los muestra y la ficha no existe. Para un negocio B2B que llega a spas por Instagram, esto es esfuerzo de captura tirado: nadie ve ni acciona esos enlaces.
- **Recomendación:** Renderizar redes como iconos enlazables en el drawer/ficha (y opcionalmente columna). Quitar del form lo que de verdad no se vaya a usar.
- **Beneficio esperado:** Dato de contacto realmente útil para alcance comercial.

</details>

<details>
<summary><strong>[Medio] — Doble conteo de estacionalidad en la proyección de ingresos</strong> · Lógica de negocio · Imp 5/Cpx 4 · medio día</summary>

- **Archivo:** `lib-prediccion.ts:204-224` y `estimado-ingresos.tsx:142-163`
- **Problema:** `probMesesFuturos` ya aplica un `seasonalBoost` por mes-del-año (`lib-prediccion.ts:218-222`). En paralelo, `EstimadoIngresos` proyecta ingreso aplicando **otro** `indiceEstacional` sobre el promedio (`estimado-ingresos.tsx:152, 156`). El "Revenue proyectado" agregado y el "Estimado del mes" provienen de modelos distintos que ambos inflan por verano, con riesgo de sobreestimar la temporada alta (Jun-Ago) y de que dos tarjetas contiguas muestren cifras incoherentes entre sí.
- **Recomendación:** Decidir una sola fuente de estacionalidad. Si `EstimadoIngresos` es el agregado oficial, que la predicción por cliente no re-aplique boost, o viceversa. Documentar cuál manda.
- **Beneficio esperado:** Proyecciones internamente consistentes y no infladas.

</details>

<details>
<summary><strong>[Medio] — Riesgo de churn duro (texto "podría abandonar") basado en >90 días, sin contexto de frecuencia</strong> · Lógica de negocio · Imp 5/Cpx 3 · 2-4 h</summary>

- **Archivo:** `clientes-dashboard.tsx:383` (`diasSinCompra>90 → inactivo`) y `:1249-1256` (insight "N clientes podrían abandonar")
- **Problema:** El estado `inactivo` usa un umbral fijo de 90 días igual para todos, ignorando la frecuencia propia. Un cliente que compra cada 120d a los 95 días no está en riesgo; uno que compra cada 20d a los 40 sí. La tarjeta de insight afirma "podrían abandonar" con tono asertivo sobre n pequeño. El modelo SÍ tiene `riesgoAbandono` relativo a la frecuencia (`lib-prediccion.ts:172-176`), pero el status y el insight no lo usan.
- **Recomendación:** Definir `inactivo` relativo: `dias_sin_compra > frecuencia_dias × 1.5` (con fallback 90 solo si no hay frecuencia). Alinear el texto del insight con `riesgoAbandono` real.
- **Beneficio esperado:** Alertas de churn accionables y no falsas.

</details>

<details>
<summary><strong>[Medio] — Edición inline de tipo dispara `router.refresh()` que recarga y recomputa todo el dashboard</strong> · Performance · Imp 4/Cpx 3 · 2-4 h</summary>

- **Archivo:** `clientes-dashboard.tsx:2204-2213` (`TipoCell.handleChange`)
- **Problema:** Cambiar el tipo de un cliente hace update optimista + `actualizarTipoCliente` + `router.refresh()`. El refresh re-fetcha las 5 tablas y re-ejecuta todo el enrichment/predicción en cliente para un cambio de una sola celda. Con la cantidad de cómputo en este componente, es un martillo para un clavo.
- **Recomendación:** Como ya es optimista y el server action revalida, omitir el `router.refresh()` (o usar `revalidatePath` solo). El estado local ya refleja el cambio.
- **Beneficio esperado:** Edición de tipo instantánea sin recomputar todo el panel.

</details>

<details>
<summary><strong>[Medio] — Accesibilidad: filas-acordeón con `onClick` en `<tr>`/`<div>`, sin rol ni teclado; drawer sin focus trap</strong> · Accesibilidad · Imp 5/Cpx 4 · medio día</summary>

- **Archivo:** `clientes-dashboard.tsx:1478-1481` (`<tr onClick>`), `prediccion-compras.tsx:590-593` (`<div onClick>` expandible), `cliente-drawer.tsx:232-237` (aside dialog)
- **Problema:** Las filas abren el drawer / se expanden con `onClick` en elementos no interactivos: sin `role="button"`, `tabIndex`, ni manejo de `Enter/Space`; inaccesibles por teclado y para lectores de pantalla. El drawer (`role="dialog" aria-modal`) cierra con Esc y bloquea scroll, pero **no atrapa el foco** ni lo devuelve al disparador al cerrar. Muchos textos a 9–10px (`text-[9.5px]`) bajan contraste/legibilidad.
- **Recomendación:** Hacer la celda "Cliente" un `<button>`/link para abrir, no toda la fila; añadir teclado a expandibles; focus trap + restore en drawer y dialog; subir el mínimo tipográfico.
- **Beneficio esperado:** Operable por teclado, cumple expectativas mínimas de un producto serio.

</details>

<details>
<summary><strong>[Bajo] — Sin validación de email/teléfono/RFC; merge de clientes sin UI</strong> · UX · Imp 3/Cpx 3 · 2-4 h</summary>

- **Archivo:** `actions.ts:26-59` (solo valida `nombre` no vacío), `cliente-form.tsx:99-103`; `mergeClientes` en `actions.ts:212-233` sin consumidor
- **Problema:** El único check es nombre requerido. Email/teléfono/RFC se guardan sin formato ni validación (un email inválido entra tal cual). El RFC se uppercasea pero no se valida patrón. Existe `mergeClientes` (server action lista para deduplicar) pero **ninguna UI** la invoca — el dedup en vivo (`findSimilarClientes`) solo avisa, no fusiona.
- **Recomendación:** Validar formato de email/RFC en cliente y server. Exponer "Fusionar con…" en la tarjeta de duplicados que ya detecta `findSimilarClientes`.
- **Beneficio esperado:** Datos más limpios y deduplicación cerrando el loop que ya está medio construido.

</details>

<details>
<summary><strong>[Bajo] — Tres formateadores `mxn`/`mxn2` y gradientes de avatar duplicados por archivo</strong> · Mantenibilidad · Imp 3/Cpx 2 · 1-2 h</summary>

- **Archivo:** `AVATAR_GRADIENTS` idéntico en `prediccion-compras.tsx:72-85` y `prediccion-insights.tsx:15-28`; `mxn`/`mxn2`/`fechaFmt` redefinidos en 6 archivos del módulo
- **Problema:** Cada componente redeclara los `Intl.NumberFormat` y la paleta de avatares con su propia función de hash (algunas `hash += charCodeAt`, otras `hash*31+charCodeAt|0`), por lo que el mismo cliente puede recibir colores distintos en paneles distintos. Es deriva silenciosa de presentación.
- **Recomendación:** Centralizar `fmtMXN`, `getAvatarGradient` y `getInitials` en un util compartido del módulo (o `@/lib`). Un solo hash → color consistente en todo el módulo.
- **Beneficio esperado:** Consistencia visual del cliente entre superficies y menos duplicación.

</details>

---

**Notas para el reporte (fuera del formato):** Lo mejor del módulo es la disciplina de exclusión del cliente interno (`page.tsx:54-61`, `deleteCliente` en `actions.ts:118-125`) y las guardas del borrado (ventas bloquean, cotizaciones piden confirmación, soft-delete como alternativa). Los dos riesgos dominantes son: (1) **honestidad estadística** del modelo predictivo dado el tamaño de datos, y (2) **arquitectura** (God component de 2,245 líneas + 1,056 líneas muertas + cómputo en cliente). Si solo se pudieran atacar tres cosas: borrar `prediccion-compras.tsx`, mover predicción/enrichment a server con umbral n≥5 honesto, y crear la ficha `/clientes/[id]` real.

### Inventario

El módulo de inventario es visualmente excelente (tabla densa redimensionable, KPIs, dashboard por categoría, drawer, upload drag&drop) y la lógica de costeo USD/MXN está bien encapsulada en vista_inventario con escrituras limpias en las 3 tablas base. PERO tiene un agujero de integridad de datos crítico: el inventario solo se descuenta cuando una venta nace de una cotización confirmada (RPC descontar_inventario_venta); la venta directa (saveVenta) y el portal /order NO tocan el stock, así que el "stock_actual" miente sistemáticamente. No existe kardex/trazabilidad de movimientos: el stock es un único número mutable sin historial, sin auditoría, sin guard de stock negativo, y editable a mano sin registro. El recálculo masivo de TC corrompe el campo costo (NOT NULL) de productos creados desde la app porque queda congelado al TC del día de creación. No hay punto de reorden real ni alertas accionables más allá del badge bajo/agotado. Para 2-3 usuarios hoy funciona; para escalar o confiar en los números financieros (que dependen de capital_invertido = stock × costo), el stock debe ser una proyección de movimientos, no un número editable suelto.

**¿Completo?** No. Falta lo esencial de un módulo de inventario serio: (1) descuento de stock consistente en TODAS las rutas de venta, (2) un libro de movimientos (kardex) que sea la fuente de verdad, (3) trazabilidad entradas/salidas/ajustes, (4) puntos de reorden y sugerencia de reposición.

**¿Qué sobra?** La columna `costo` en `productos` (escrita en crearProducto como (precio+envío)×TC) duplica lo que `vista_inventario.costo_total_mxn` ya deriva, y queda desincronizada en cuanto cambia el TC. La doble query a `precios_producto` en page.tsx (preciosBySku se construye y se `void`-ea sin usar). `costo_envio_mxn` ya documentada como vestigial pero todavía se selecciona y arrastra por toda la cadena de tipos.

**¿Qué simplificar?** El stock debería derivarse: `stock_actual = stock_inicial + Σ entradas − Σ salidas`. Eso elimina toda la lógica frágil de "UPDATE si existe / INSERT si no" repartida en 3 archivos (inventario/actions, cotizaciones/actions revertir, RPC) y los read-then-write con race condition.

**¿Qué automatizar / qué haría la IA?** (1) Punto de reorden dinámico: con 42 ventas + fechas ya disponibles en salesBySku, calcular velocidad de venta (unidades/mes) por SKU y días-de-cobertura restantes → alerta "se agota en ~X días" en vez del binario bajo/agotado. (2) Sugerencia de reposición por pedido a Brasil: agrupar SKUs bajo umbral, estimar cantidad óptima por lead time. (3) Detección de productos muertos (sinMovimiento ya se calcula pero no se expone como acción). (4) Anomalías de margen: marcar SKUs con margen <35% o costo sin cargar. Todo esto es factible con los datos que el módulo YA trae a memoria.

**¿Qué genera fricción / confunde?** El botón "Actualizar TC" usa `window.prompt`/`alert` (estética 1998, rompe el look Stripe/Linear) y reescribe el TC de TODOS los productos sin confirmación ni vista previa del impacto — un fat-finger recalcula todo el inventario. El stock se edita a mano en un modal sin registrar quién/cuándo/por qué (no hay auth.uid de todos modos, pero ni un timestamp de ajuste). El usuario no tiene forma de saber por qué el stock no bajó tras vender (porque depende de la ruta de venta).

**Hallazgos (11):**

<details>
<summary><strong>[Crítico] #2 — El stock NO se descuenta en ventas directas ni en el portal /order — solo desde cotización confirmada</strong> · Lógica de negocio · Imp 10/Cpx 5 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:43-148`
- **Problema:** saveVenta() inserta la venta con `inventario_descontado: false` (línea 66), crea venta_items y venta_socios, pero NUNCA llama a `descontar_inventario_venta` ni actualiza `inventario.stock_actual`. El único lugar que descuenta stock es el flujo confirmar-cotización (cotizaciones/actions.ts:248 vía RPC). El portal público /order (order/actions.ts:128) solo crea una cotización, tampoco toca stock. Resultado: toda venta que no nazca de una cotización confirmada deja el stock intacto → `stock_actual` sobreestima permanentemente las existencias. Como `capital_invertido = stock × costo` y `valor_inventario = stock × precio` alimentan los KPIs financieros (inventario-view.tsx:303-311) y los reportes, los números financieros del negocio están inflados de forma silenciosa. Es corrupción de datos financieros, no un bug cosmético.
- **Recomendación:** Unificar el descuento de stock en UN solo punto que cubra todas las rutas. Opción mínima: en saveVenta(), tras insertar venta_items, llamar `supabase.rpc('descontar_inventario_venta', { venta_id })` y marcar `inventario_descontado: true` (idempotencia vía el flag para no descontar dos veces). Verificar que la RPC tenga guard de stock no-negativo. A mediano plazo, mover a un trigger en la BD sobre venta_items (AFTER INSERT/DELETE) o a un kardex (ver hallazgo de movimientos) para que sea imposible olvidarlo en una ruta nueva.
- **Ejemplo:**

```
// en saveVenta, tras insertar venta_items (línea ~105)
const { error: rpcErr } = await supabase.rpc('descontar_inventario_venta', { venta_id: venta.id })
if (rpcErr) return { ok: false as const, error: `Venta creada pero inventario no se descontó: ${rpcErr.message}` }
await supabase.from('ventas').update({ inventario_descontado: true }).eq('id', venta.id)
```

- **Beneficio esperado:** El stock refleja la realidad sin importar cómo se registró la venta; los KPIs de capital invertido, valor de inventario y utilidad potencial dejan de mentir; se elimina la causa raíz de discrepancias de inventario.
- **Verificación:** confirmado — CONFIRMADO con matiz. Evidencia leída:

1) saveVenta() en src/app/(dashboard)/ventas/actions.ts:43-148 inserta la venta con `inventario_descontado: false` (L66), crea venta_items (L98) y venta_socios (L128), actualiza la cotización a 'aceptada' (L137-141), pero NUNCA llama `descontar_inventario_venta` ni hace UPDATE a inventario.stock_actual. Verificado por grep: el único `rpc("descon

</details>

<details>
<summary><strong>[Alto] #11 — actualizarTipoCambio reescribe TODO el inventario vía window.prompt sin confirmación ni preview</strong> · UX · Imp 7/Cpx 3 · 3-5h</summary>

- **Archivo:** `src/app/(dashboard)/inventario/inventario-view.tsx:1208-1238`
- **Problema:** El botón 'Actualizar TC' abre un `window.prompt` (línea 1212) y, al aceptar, hace un UPDATE masivo de `tipo_cambio` en TODAS las filas de productos (.not('id','is',null), actions.ts:341-344). No hay diálogo de confirmación que avise 'esto recalculará el costo MXN de N productos', ni preview del impacto, ni undo. Un dedo gordo (escribir 207 en vez de 20.7) recalcula al instante todo el valor del inventario, los márgenes y el capital invertido del negocio. Además window.prompt/alert (líneas 1212, 1219, 1224) rompen la estética premium del resto del módulo y bloquean el hilo.
- **Recomendación:** Reemplazar el prompt por un modal propio con: input validado, rango sano (ej. 10–40 MXN/USD con warning fuera de rango), preview del nuevo costo MXN total y delta vs actual, y confirmación explícita. Guardar el TC anterior para ofrecer 'deshacer'. Registrar el cambio (quién/cuándo) cuando exista el kardex.
- **Ejemplo:**

```
// Modal con validación de rango
if (num < 10 || num > 40) { setWarn(`$${num} parece fuera de rango (10-40). ¿Seguro?`) }
// mostrar: 'Costo MXN total: actual $X → nuevo $Y (Δ ${delta})'
```

- **Beneficio esperado:** Se elimina el riesgo de corromper el costeo de todo el inventario con un typo; UX consistente con el resto del módulo; el usuario entiende el impacto antes de confirmar.
- **Verificación:** confirmado — Confirmado contra el código real. inventario-view.tsx:1212 usa window.prompt para capturar el TC; 1219 y 1224 usan alert() para errores — efectivamente rompen la estética premium y bloquean el hilo. actions.ts:341-344: `.from("productos").update({ tipo_cambio: nuevoTC }).not("id","is",null)` ejecuta un UPDATE masivo sobre TODAS las filas de productos. NO existe diálogo de confirmación

</details>

<details>
<summary><strong>[Alto] #29 — El recálculo masivo de TC desincroniza productos.costo (NOT NULL) y deja capital/margen inconsistentes</strong> · Base de datos · Imp 6/Cpx 4 · 3-4h</summary>

- **Archivo:** `src/app/(dashboard)/inventario/actions.ts:276-300`
- **Problema:** crearProducto escribe `costo = (precio_usd + costo_envio_usd) × tipo_cambio` en la tabla productos (línea 277-278, 293) — un snapshot congelado al TC del día de creación. Pero `actualizarTipoCambio` (línea 336-348) solo actualiza `productos.tipo_cambio`, NO recalcula `costo` ni `costo_envio_usd`. Resultado: tras un cambio masivo de TC, el campo `costo` de productos creados por la app queda con el costo viejo, mientras `vista_inventario.costo_total_mxn` sí refleja el TC nuevo (lo deriva). Dos fuentes de verdad para el costo que divergen. Cualquier reporte que lea `productos.costo` (no la vista) usará el valor obsoleto. Esto ya pasó documentado con el Pedido 3 (scripts/fix-pedido-3.py) y el patrón se repite aquí.
- **Recomendación:** Decidir UNA fuente de verdad para el costo. Recomendado: dejar de escribir `productos.costo` como derivado y, si la columna es NOT NULL, hacerla GENERATED o calcularla siempre desde la vista. Si debe persistir, en actualizarTipoCambio recalcular `costo = (precio_usd + costo_envio_usd) × nuevoTC` en el mismo UPDATE masivo. Documentar que `productos.costo` es derivado de los 3 inputs dolarizados.
- **Ejemplo:**

```
// actualizarTipoCambio — recalcular costo junto al TC
await admin.rpc('recalcular_costos_por_tc', { nuevo_tc: nuevoTC })
// o, sin RPC, traer precio_usd+costo_envio_usd y bulk-update costo = (sum)*tc
```

- **Beneficio esperado:** Costo coherente con el TC vigente en toda la app; capital_invertido y márgenes dejan de divergir según se haya o no tocado el TC desde la creación del producto.
- **Verificación:** confirmado — Confirmado contra el código. crearProducto calcula y persiste un snapshot congelado: src/app/(dashboard)/inventario/actions.ts:277-278 `const tc = data.tipo_cambio ?? 0; const costo = ((data.precio_usd ?? 0) + (data.costo_envio_usd ?? 0)) * tc` y lo escribe en la tabla en la línea 293 (`costo,` dentro del insert a `productos`). actualizarTipoCambio (líneas 336-348) hace SOLO `update({

</details>

<details>
<summary><strong>[Alto] #30 — El edit de stock no registra ni valida contra ventas; permite poner stock por debajo de lo ya vendido sin rastro</strong> · Lógica de negocio · Imp 6/Cpx 4 · 4-6h</summary>

- **Archivo:** `src/app/(dashboard)/inventario/actions.ts:164-196`
- **Problema:** actualizarProducto sobrescribe `stock_actual` con el valor del modal (solo aplica Math.max(0, round), línea 172) sin registrar que fue un ajuste manual, sin motivo, y sin reconciliar contra movimientos. Combinado con que las ventas directas no descuentan (hallazgo crítico) y que no hay kardex, el stock es un número que cualquiera ajusta a ojo y pierde toda relación con la realidad de compras-ventas. No hay forma de distinguir 'ajuste por conteo físico' de 'corrección de error' de 'el sistema nunca descontó'.
- **Recomendación:** Cuando exista el kardex, todo cambio de stock vía el modal debe generar un movimiento tipo 'ajuste' con motivo obligatorio (conteo físico, merma, corrección) y guardar el delta, no el valor absoluto silenciosamente. Mientras tanto, como mínimo, registrar `updated_at` del ajuste y mostrar en el drawer 'último ajuste manual: fecha'.
- **Ejemplo:**

```
// con kardex:
insert inventario_movimientos({ tipo:'ajuste', cantidad: nuevo - viejo, motivo, producto_id })
// y stock_actual = stock_actual + (nuevo - viejo) atómico
```

- **Beneficio esperado:** Trazabilidad de ajustes manuales; separación clara entre flujo automático de ventas y correcciones humanas; base para confiar en el número de stock.
- **Verificación:** confirmado — CONFIRMADO en todos los puntos factuales.

1) Sobrescritura silenciosa del valor absoluto: src/app/(dashboard)/inventario/actions.ts:170-178. `actualizarProducto` toma `data.stock_actual` del modal y hace UPDATE con valor absoluto (`Math.max(0, Math.round(...))` línea 172), sin calcular delta, sin motivo, sin tipo de ajuste. El UPDATE (líneas 180-183) o INSERT (187-193) no escribe nin

</details>

<details>
<summary><strong>[Medio] #49 — Alertas de stock binarias (bajo/agotado) sin velocidad de venta ni días de cobertura ni reorden real</strong> · IA · Imp 6/Cpx 5 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/inventario/inventario-view.tsx:997-1014`
- **Problema:** El estatus es puramente binario: agotado (stock≤0), bajo (stock≤stock_minimo), ok (líneas 997-1014; mismo cálculo en inventory-stats stockCritico). stock_minimo es un umbral estático que el usuario fija a mano y por defecto es 0 (create-modal:69-70, edit:102). No usa la velocidad de venta — y el módulo YA tiene los datos: salesBySku con fechas y cantidades mensuales (page.tsx:146-162) y unidades_vendidas por SKU. Un SKU con 2 unidades que vende 30/mes está 'ok' si su mínimo es 1, cuando en realidad se agota en 2 días. No hay 'días de cobertura', ni sugerencia de cuánto reordenar, ni detección de productos muertos accionable (sinMovimiento se calcula en kpis línea 325 pero no se expone).
- **Recomendación:** Calcular velocidad = unidades_vendidas / meses_activos por SKU (datos ya en memoria) y derivar días_cobertura = stock_actual / (velocidad/30). Alerta 'se agota en ~X días' priorizada por velocidad, no por umbral estático. Sugerir cantidad de reposición = velocidad × lead_time_Brasil + buffer. Exponer un panel 'Reponer pronto' y otro 'Sin movimiento (capital muerto)'. Esto es exactamente lo que automatizaría una IA y es factible con los datos actuales.
- **Ejemplo:**

```
const mesesActivos = monthly.length || 1
const velocidad = unidades_vendidas / mesesActivos // u/mes
const diasCobertura = velocidad > 0 ? (stock_actual / velocidad) * 30 : Infinity
// alerta si diasCobertura < leadTimeBrasil
```

- **Beneficio esperado:** El usuario sabe QUÉ y CUÁNTO reordenar antes de quedarse sin stock del producto que más rota, y libera capital de productos muertos. Pasa de un badge reactivo a una recomendación proactiva.

</details>

<details>
<summary><strong>[Medio] #102 — No existe kardex ni trazabilidad de movimientos de inventario</strong> · Arquitectura · Imp 5/Cpx 7 · 1 sem</summary>

- **Archivo:** `src/app/(dashboard)/inventario/actions.ts:161-196`
- **Problema:** El stock vive como un único número mutable (`inventario.stock_actual`) que se sobrescribe directamente desde 3 lugares: el modal de edición (actualizarProducto, inventario/actions.ts:164-196), la reversión de cotización (cotizaciones/actions.ts:557-583) y la RPC. No hay tabla de movimientos (entradas por pedido, salidas por venta, ajustes manuales). Grep confirma cero referencias a kardex/movimiento/stock_movement en src/. Consecuencias: imposible auditar por qué cambió un stock, imposible reconstruir existencias a una fecha, imposible detectar mermas/robos/errores, y los read-then-write (SELECT stock_actual → UPDATE +cant) tienen race condition bajo concurrencia (dos ventas simultáneas del mismo SKU pierden un decremento). Un ERP de clase mundial (lo que pide el benchmark Stripe/HubSpot) trata el stock como proyección de un log inmutable.
- **Recomendación:** No "crear" la tabla — ya existe `public.movimientos_inventario` en BD (ver enable-rls.sql:59); está sin usar. Plan: (1) Verificar su esquema real y poblarla en cada mutación de stock desde los 4 sitios: inventario/actions.ts (ajuste manual y alta), cotizaciones/actions.ts:557-583 (reversa), pedidos/actions.ts:70-89 (entrada), y dentro de la RPC descontar_inventario_venta (salida por venta). (2) Convertir los read-then-write de JS en UPDATE atómico de una sola sentencia (`stock_actual = stock_actual + n`) vía RPC/SQL para cerrar la race en reversa y pedidos. (3) Confirmar que descontar_inventario_venta ya hace el decremento atómico (revisar el cuerpo de la función en BD); si lo hace, el camino de ventas ya está cubierto. (4) Exponer un tab "Movimientos" en product-drawer.tsx. Prioridad realista: media — primero auditabilidad (poblar la tabla), la atomicidad es secundaria dado el volumen actual.
- **Ejemplo:**

```
-- update atómico en vez de read-then-write
UPDATE inventario SET stock_actual = stock_actual + $1 WHERE producto_id = $2;
-- + INSERT inventario_movimientos(...) en la misma transacción
```

- **Beneficio esperado:** Auditoría completa, reconstrucción histórica, detección de mermas, base para forecasting de reposición, y eliminación de la race condition que pierde decrementos concurrentes.
- **Verificación:** ajustado — PARCIALMENTE CONFIRMADO con dos imprecisiones materiales del auditor.

CONFIRMADO — el stock vive como un único número mutable y la trazabilidad NO se usa:
- Edición manual: src/app/(dashboard)/inventario/actions.ts:164-196 hace SELECT stock_actual → UPDATE con valor absoluto (read-then-write).
- Reversión de cotización/venta: src/app/(dashboard)/cotizaciones/actions.ts:557-583 hace SEL

</details>

<details>
<summary><strong>[Medio] #106 — Doble query idéntica a precios_producto en page.tsx; preciosBySku se construye y se descarta</strong> · Performance · Imp 4/Cpx 1 · 30m</summary>

- **Archivo:** `src/app/(dashboard)/inventario/page.tsx:63-92`
- **Problema:** El server component hace DOS veces la misma query `from('precios_producto').select('producto_id, precio').eq('lista_id', listaId)`: una en líneas 66-69 para construir `preciosBySku` (un Map<sku,precio>) que tras llenarse se marca `void preciosBySku` (línea 79) y NUNCA se usa; y otra idéntica en líneas 85-88 para `idToPriceMap`, que sí se usa (línea 200). Es un round-trip a la BD desperdiciado en cada render de /inventario y ~40 líneas de código muerto.
- **Recomendación:** Eliminar el bloque 63-80 (preciosBySku + su query + el void) por completo y conservar solo idToPriceMap. Idealmente meter esa query dentro del Promise.all inicial para no serializar un round-trip extra después.
- **Ejemplo:**

```
// borrar líneas 63-80; en el Promise.all agregar:
//   listaId ? supabase.from('precios_producto').select('producto_id,precio').eq('lista_id', listaId) : null
// y construir idToPriceMap desde ese resultado
```

- **Beneficio esperado:** Una query menos por carga de página, menos latencia, y ~40 líneas de código muerto eliminadas que confunden a quien mantenga el archivo.

</details>

<details>
<summary><strong>[Medio] #123 — Preview optimista de imagen y subida sin debounce/cancel; el preview persiste si el componente se desmonta tras error</strong> · UX · Imp 4/Cpx 3 · 2-3h</summary>

- **Archivo:** `src/app/(dashboard)/inventario/image-upload.tsx:34-75`
- **Problema:** procesarArchivo pinta un preview optimista vía FileReader (línea 48-50) antes de confirmar el upload. Si el server action falla (línea 70-73) revierte a imagenActual, pero la URL pública del bucket se hardcodea otra vez aquí (línea 65-66) duplicando STORAGE_URL de storage-images.ts en vez de usar buildProductoImageUrl(). Además no hay cancelación si el usuario arrastra dos archivos seguidos (dos startTransition compitiendo, el último en resolver gana, posible mismatch preview/realidad). El validador de tipo/tamaño está duplicado en el cliente (image-upload.tsx:13-19) y en el server (actions.ts:6-12) — aceptable como defensa, pero divergen si uno cambia.
- **Recomendación:** Importar y usar buildProductoImageUrl(result.filename) en vez de re-hardcodear la URL del bucket. Deshabilitar el dropzone mientras isPending para evitar uploads concurrentes. Centralizar la lista TIPOS_PERMITIDOS/MAX_SIZE en un módulo compartido importado por cliente y server.
- **Ejemplo:**

```
import { buildProductoImageUrl } from '@/lib/storage-images'
if (result.filename) setImagen(buildProductoImageUrl(result.filename))
```

- **Beneficio esperado:** Una sola fuente para la URL del bucket y los límites de archivo; sin estados de preview inconsistentes ante uploads rápidos sucesivos.

</details>

<details>
<summary><strong>[Medio] #124 — Race condition en read-then-write de stock al revertir cotización (y patrón replicado)</strong> · Base de datos · Imp 4/Cpx 3 · 3-4h</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/actions.ts:557-583`
- **Problema:** revertirCotizacion restaura stock con SELECT stock_actual → UPDATE (stock_actual + cant) (líneas 559-568). Entre el SELECT y el UPDATE otra operación puede mutar el mismo registro y se pierde un incremento (lost update). El mismo anti-patrón read-then-write existe en inventario/actions.ts (actualizarProducto lee invRow.stock_actual para decidir, edit toma valor absoluto del form). En un negocio chico el riesgo es bajo hoy, pero es deuda que escala mal y rompe silenciosamente.
- **Recomendación:** Sustituir todos los read-then-write de stock por UPDATE atómico (`SET stock_actual = stock_actual + $delta`) vía RPC o SQL crudo, o envolver en transacción con lock. El kardex propuesto resuelve esto de raíz al hacer el delta atómico.
- **Ejemplo:**

```
await supabase.rpc('ajustar_stock', { p_producto: productoId, p_delta: cant })
-- RPC: UPDATE inventario SET stock_actual = stock_actual + p_delta WHERE producto_id = p_producto
```

- **Beneficio esperado:** Sin pérdida de incrementos/decrementos bajo concurrencia; base correcta para cuando haya más usuarios o automatizaciones simultáneas.

</details>

<details>
<summary><strong>[Bajo] #167 — Resize de columnas: drag global sobre window sin throttle, escribe localStorage en cada onSave de ancho</strong> · Performance · Imp 3/Cpx 2 · 1-2h</summary>

- **Archivo:** `src/app/(dashboard)/inventario/inventario-view.tsx:934-958`
- **Problema:** ResizeHandle registra mousemove en window y en cada pixel llama setColWidth → persistColWidths → setState + localStorage.setItem (líneas 213-221, 945-948). Durante un drag se dispara una escritura a localStorage y un re-render de toda la tabla (potencialmente cientos de filas) por cada evento de mouse. Con ~17 columnas y muchas filas esto puede generar jank perceptible en el arrastre.
- **Recomendación:** Durante el drag actualizar solo un estado ligero (o un ref + CSS var en el <col>) y persistir a localStorage únicamente en onUp (mouseup). Memoizar ProductRow con React.memo para que el re-render por cambio de ancho no recalcule todas las celdas.
- **Ejemplo:**

```
const onUp = () => { persistColWidths(pendingWidthsRef.current); ... }
// durante onMove solo: colRef.current.style.width = next + 'px'
```

- **Beneficio esperado:** Arrastre fluido sin jank, menos escrituras a localStorage, mejor con tablas grandes.

</details>

<details>
<summary><strong>[Bajo] #181 — TC vigente se infiere por mediana de productos en cliente; frágil y sin fuente única</strong> · Mantenibilidad · Imp 3/Cpx 3 · 2-3h</summary>

- **Archivo:** `src/app/(dashboard)/inventario/inventario-view.tsx:428-437`
- **Problema:** tcVigente se calcula como la mediana de productos[].tipo_cambio en el cliente (líneas 429-437), con fallback hardcodeado 20.7 (también hardcodeado en tfoot línea 354 y en ProductRow línea 992). Si distintos productos tienen TC distintos (cargas por script con TC viejo, como documenta CLAUDE.md), la mediana puede no representar el TC real y el badge 'TC referencial' engaña. No hay una tabla/config single-source para el TC del negocio.
- **Recomendación:** Guardar el TC vigente del negocio en una tabla de configuración (o en una fila settings) como fuente única; el badge y los defaults lo leen de ahí. actualizarTipoCambio actualiza ese setting y opcionalmente propaga a productos. Eliminar los 3 literales 20.7 dispersos a una constante única.
- **Ejemplo:**

```
// config.tipo_cambio_vigente leído en page.tsx y pasado como prop
// const TC_FALLBACK = 20.7 en un solo lugar
```

- **Beneficio esperado:** Un solo TC de verdad para todo el módulo; el badge deja de depender de una heurística de mediana y no engaña cuando hay TCs mixtos.

</details>


### Pedidos de compra

El módulo de Pedidos es sorprendentemente completo a nivel de UI (costeo multi-moneda USD/MXN, prorrateo de envío, pagos, conversiones MXN→USDT con comisiones, documentos en bucket privado con signed URLs, tramos de envío, edición completa). Es claramente el módulo más sofisticado del ERP en lógica financiera. PERO su robustez es frágil: la razón de los ~7 scripts Python de corrección manual (fix-pedido-3-*) es que faltan tres conceptos de modelo de datos clave — (1) una moneda de proveedor real (BRL) que la UI no soporta, así que las cintas se cargan con precio placeholder y se reescriben por script; (2) múltiples tramos de envío con su propia moneda (el envío "total USD" es un solo número, los tramos viven en una tabla informativa desconectada del costeo); y (3) ninguna escritura transaccional — cada acción hace 3-5 N+1 awaits sin transacción, así que un fallo a media operación corrompe stock/costos sin rollback. Además hay desconexiones graves: el badge de `status` (5 estados) nunca se escribe (todo aparece "Recibido"); no hay recepción parcial ni tracking; el pedido NO alimenta automáticamente la tabla `inversiones` (se hizo por script, inflaba el ROI); y editar un pedido en la UI SOBREESCRIBE silenciosamente todas las correcciones manuales de los scripts. El costeo asume envío prorrateado parejo por unidad, lo cual es incorrecto para cintas livianas vs. cremas pesadas.

**¿Está completo?** Para 2-3 usuarios internos y 3 pedidos históricos, funciona. Como producto de clase mundial, no: le falta el modelo de datos que evitaría los scripts manuales.

**Por qué tantos scripts de corrección (la pregunta central):** Cada script revela un hueco del modelo, no un bug puntual:
- `fix-pedido-3-cintas-brl.py`: el proveedor cotiza cintas en **REALES (BRL)**. La UI solo tiene un campo `precio_usd`. No existe moneda de origen ni factor BRL→USD. Resultado: 46 cintas se cargaron con un placeholder de $1.22 y se reescribieron a mano (BRL × 0.1743). Esto se repetirá en cada pedido de cintas.
- `fix-pedido-3-envio-usa-mexico.py` + `fix-pedido-3-envio-facturas.py`: el envío real tiene **múltiples tramos en distintas monedas** (Brasil→USA en USD, USA→México en MXN pagado directo). El modelo solo guarda `costo_envio_usd` como número único. La tabla `pedido_envios` existe pero es "informativa" — NO alimenta el costeo. Hubo que derivar el total a mano y re-prorratear.
- `add-inversion-pedido-3.py`: crear un pedido **no registra la inversión** en la tabla `inversiones` que alimenta /finanzas y el ROI. El P3 vendía productos sin contar su costo → ROI inflado de 80.7% a 40.8% real. Acoplamiento manual peligroso.
- `fix-lv-cafe-pedido3.py`: diferenciar SKUs nuevos de viejos + subir fotos. Caso de "crear producto desde pedido" mal soportado.

**El gran problema oculto:** `editarPedido()` hace `delete().eq("pedido_id")` y reinserta todos los ítems desde lo que el form cargó (`precio_unitario_usd` original). Si alguien abre "Editar pedido" del Pedido 3 y guarda, **borra todas las correcciones BRL y de envío de los scripts** y re-snapshotea costos basura a `productos` → corrompe el inventario y los márgenes. No hay advertencia.

**¿Qué simplificar/automatizar/IA?**
- Automatizar: pedido→inversiones (trigger o en la misma server action), pedido→status (avanzar al recibir), captura de factura del proveedor con IA (OCR del PDF que ya se sube → extraer SKU/cantidad/precio BRL y prellenar ítems, eliminando los scripts).
- IA: el prorrateo de envío por PESO (no por unidad) usando `productos.peso`; sugerir precio público / margen objetivo; conciliar pagos USDT contra total esperado y alertar drift.
- Simplificar: las 13 columnas derivadas de `pedido_compra_items` (precio_mxn, costo_total_mxn, etc.) son redundantes — todas son funciones de precio×cant×TC×envío. Deberían ser GENERATED o una vista, no escritas a mano en 4 lugares (actions.ts itemFields + 3 scripts que la duplican). Esa duplicación ES la causa raíz de la fragilidad.

**¿Qué confunde / fricción?** El usuario tiene que entender la diferencia entre Pagos (USDT al proveedor, solo mercancía), Conversiones (MXN→USDT con comisión, define costo real) y Tramos de envío (informativo, no cuenta) — tres conceptos solapados de "dinero que sale" sin reconciliación entre ellos. Un PM de HubSpot/Stripe rechazaría esto: no hay una sola "verdad" del costo del pedido.

**¿Lo aprobarían Apple/Linear/Stripe?** La UI sí (es premium). El modelo de datos no: requiere intervención de ingeniería (scripts Python) para cargar un pedido correctamente. Eso es deuda operativa, no producto.

**Hallazgos (14):**

<details>
<summary><strong>[Alto] #7 — Crear un pedido NO registra la inversión en /finanzas — el ROI queda inflado hasta correr un script</strong> · Lógica de negocio · Imp 8/Cpx 4 · 1d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/actions.ts:226-273`
- **Problema:** crearPedido escribe inversion_sandra/benjamin en `pedidos_compra` pero NO inserta nada en la tabla `inversiones`, que es la que alimenta 'Total invertido' y el ROI de socios en /finanzas (confirmado: grep de 'inversiones' en pedidos/ no devuelve nada). add-inversion-pedido-3.py documenta el síntoma: el P3 vendía productos sin que su costo contara como inversión → ROI promedio inflado de 80.7% a 40.8% real. Cada pedido nuevo arrastra este error hasta que alguien recuerde correr el script con 'apply'.
- **Recomendación:** En crearPedido (y al recibir, según el flujo de negocio), insertar las 2 filas en `inversiones` (Sandra/Benjamin) en la misma operación atómica. Manejar el número_ronda automáticamente (max ronda + 1) e idempotencia por pedido_id. Considerar una FK pedido_id en `inversiones` para trazabilidad y para evitar duplicados al editar.
- **Ejemplo:**

```
await admin.from('inversiones').insert([
  { socio_id: SANDRA, pedido_id, monto_mxn: sandraUsd*tc, numero_ronda, fecha },
  { socio_id: BENJAMIN, pedido_id, monto_mxn: benjaminUsd*tc, numero_ronda, fecha },
])
```

- **Beneficio esperado:** ROI y capital recuperado correctos en tiempo real. Elimina el script add-inversion y el riesgo de KPIs financieros mentirosos para los socios.
- **Verificación:** confirmado — Confirmado contra el código. crearPedido (src/app/(dashboard)/pedidos/actions.ts:226-249) inserta inversion_sandra_usd/mxn e inversion_benjamin_usd/mxn SOLO en la tabla pedidos_compra; nunca toca inversiones. grep -n "inversiones\|numero_ronda" sobre las 906 líneas de pedidos/actions.ts no devuelve NADA → el módulo entero (crearPedido y agregarItemsPedido:282+) jamás escribe en invers

</details>

<details>
<summary><strong>[Alto] #21 — El modelo no soporta la moneda real del proveedor (BRL) — cada pedido de cintas requiere un script manual</strong> · Arquitectura · Imp 7/Cpx 6 · 2-3d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/actions.ts:11-15, 138-154`
- **Problema:** El proveedor de cintas cotiza en REALES brasileños (BRL), confirmado en fix-pedido-3-cintas-brl.py (FACTOR 0.1743 = 1/5.7377 BRL/USD). El payload y el form solo aceptan `precio_usd`. Resultado documentado: las 46 cintas del P3 se cargaron con un placeholder plano ~$1.22 USD y luego se reescribieron a mano. No existe campo `moneda_origen`, `precio_origen` ni `factor_brl_usd` en pedido_compra_items ni en el form. Esto garantiza que el próximo pedido de cintas vuelva a necesitar un script.
- **Recomendación:** Agregar a pedido_compra_items: `moneda_origen` ('USD'|'BRL'), `precio_origen` y al pedido `factor_brl_usd`. El form de nuevo/editar pedido debe permitir capturar precio en BRL y derivar USD = precio_brl × factor. itemFields recibe el USD ya derivado. Así las cintas se cargan correctas de origen.
- **Ejemplo:**

```
// payload item: { precio_origen, moneda_origen, ... }
const precioUsd = moneda_origen === 'BRL' ? precio_origen * factorBrlUsd : precio_origen
```

- **Beneficio esperado:** Elimina por completo la clase de scripts fix-pedido-*-brl. El costeo de cintas queda correcto al crear el pedido.
- **Verificación:** confirmado — Verificado contra el código real. Confirmado en todos los puntos:

1. El payload y el tipo de ítem solo aceptan USD, sin moneda de origen:
- `src/app/(dashboard)/pedidos/actions.ts:11-15` → `NuevoItemEntrada = { producto_id, cantidad, precio_usd }`.
- `src/app/(dashboard)/pedidos/actions.ts:148-154` (CrearPedidoPayload.items) y `:448-453` (EditarPedidoPayload.items) → solo `{ producto

</details>

<details>
<summary><strong>[Alto] #22 — Los tramos de envío (pedido_envios) son 'informativos' y NO alimentan el costeo — el envío real se calcula a mano</strong> · Lógica de negocio · Imp 7/Cpx 6 · 2d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/[id]/page.tsx:432-433`
- **Problema:** El envío real del P3 tiene varios tramos en distintas monedas (Brasil→USA en USD derivado de pagos, USA→México $6,170.25 MXN pagado directo). El header solo guarda un `costo_envio_usd` único. La tabla `pedido_envios` (componente DesgloseEnvio) existe pero está explícitamente etiquetada 'informativo' y desconectada: agregarEnvioTramo (actions.ts:782) solo inserta filas, nunca recalcula el costo del pedido ni re-prorratea. Por eso fix-pedido-3-envio-usa-mexico.py tuvo que sumar el tramo MXN a mano, convertirlo a USD/TC y re-snapshotear los 692 ítems. El usuario ve los tramos pero no afectan ningún número.
- **Recomendación:** Hacer que `pedido_envios` sea la FUENTE de verdad del envío: costo_envio_usd del pedido = suma de tramos (cada uno con su moneda y TC propio, convertidos a USD). Al agregar/borrar un tramo, recalcular y re-prorratear automáticamente (misma rutina que editarPedido). Eliminar el campo manual 'Envío total USD' del form o derivarlo de los tramos.
- **Ejemplo:**

```
// agregarEnvioTramo -> tras insert: recomputeEnvioPedido(pedidoId)
// que suma tramos en USD y llama el re-prorrateo + snapshot
```

- **Beneficio esperado:** Elimina los scripts fix-pedido-*-envio. El envío multi-tramo multi-moneda queda correcto y auditable sin intervención manual.
- **Verificación:** confirmado — Hallazgo CONFIRMADO en todos sus puntos, con severidad ajustada a la baja por contexto.

EVIDENCIA:
1. Etiqueta "informativo" explícita y desconexión confirmadas:
   - src/app/(dashboard)/pedidos/[id]/page.tsx:432 — comentario "Desglose del envío por tramos (informativo)"; :233 "desglose informativo".
   - src/app/(dashboard)/pedidos/actions.ts:780 — sección "Desglose del envío por tr

</details>

<details>
<summary><strong>[Alto] #25 — Ninguna operación de pedido es transaccional — fallo a media escritura corrompe stock y costos sin rollback</strong> · Base de datos · Imp 7/Cpx 7 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/actions.ts:251-272, 381-430, 498-544`
- **Problema:** crearPedido, agregarItemsPedido y editarPedido ejecutan 3-5 escrituras secuenciales (insert header, loop de insert/update items, snapshotProducto a `productos`, sumarStock a `inventario`) sin ninguna transacción. Si una falla a mitad (red, RLS, constraint), el header puede quedar sin ítems, el stock sumado sin el snapshot de costo, o ítems reescritos pero el header con totales viejos. Peor: editarPedido (línea 524) hace `delete().eq(pedido_id)` ANTES de reinsertar — si el insert falla, el pedido queda SIN ítems y el stock ya fue ajustado por delta. Es corrupción financiera/inventario irreversible. Los return temprano `{ok:false}` no revierten lo ya escrito.
- **Recomendación:** La recomendación original es buena y la confirmo, con matices de prioridad. (1) Solución correcta a largo plazo: mover cada acción a una función Postgres RPC (p.ej. crear_pedido_completo(jsonb), editar_pedido_completo(jsonb)) que corra dentro de una transacción server-side; supabase-js NO soporta transacciones multi-statement desde el cliente, así que envolver con BEGIN/COMMIT vía .rpc() es la única forma atómica real. (2) Fix de mayor ROI inmediato y barato: en editarPedido, NO borrar items hasta tener todo validado — reordenar para (a) calcular y validar todos los itemFields en memoria, (b) hacer el delete+insert, y (c) aplicar el delta de stock AL FINAL, no antes (hoy el delta en línea 501 corre antes del delete/insert, que es exactamente lo que vuelve irreversible el fallo). Mejor aún: reemplazar delete+insert por upsert/diff por item para no destruir filas. (3) Hacer que snapshotProducto y sumarStock devuelvan/propaguen su .error y abortar la acción si fallan (hoy se tragan errores). (4) Validar TODO antes de la primera escritura (productos existen, precios, TC>0). Prioridad práctica: implementar ya el #2 y #3 (horas de trabajo, eliminan el peor escenario), y planear la RPC #1 como hardening definitivo.
- **Ejemplo:**

```
-- supabase RPC
create function crear_pedido(p jsonb) returns uuid language plpgsql as $$
begin
  -- insert header, loop items, snapshot productos, sumar stock
  -- todo dentro de la transacción implícita de la función
end; $$;
-- actions.ts:
const { data, error } = await admin.rpc('crear_pedido', { p: payload })
```

- **Beneficio esperado:** Elimina la posibilidad de corrupción parcial de stock/costos. Hace el módulo confiable para escalar a más pedidos/usuarios concurrentes.
- **Verificación:** ajustado — CONFIRMADO el patrón no-transaccional en las 3 funciones. crearPedido (src/app/(dashboard)/pedidos/actions.ts:226-272): inserta header (226), luego loop que inserta item (256), snapshotProducto (266) y sumarStock (267) por iteración. Si falla un item insert hace return ok:false (265) dejando header huérfano + items/stock parciales de iteraciones previas. agregarItemsPedido:381-430: upda

</details>

<details>
<summary><strong>[Medio] #50 — El prorrateo de envío es parejo por unidad — castiga cintas livianas y subsidia cremas pesadas</strong> · Lógica de negocio · Imp 6/Cpx 5 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/actions.ts:216-217`
- **Problema:** envioUnit = envioTotal / totalUnidades reparte el flete por igual entre cada unidad sin importar el peso. Una cinta de ~20g y una crema de 850g cargan el mismo costo de envío/u. Como el flete internacional se cobra por peso/volumen, esto sobrecostea las cintas (infla su costo landed, baja su margen real) y subcostea las cremas. La BD ya tiene `productos.peso` (se selecciona en page.tsx:121) pero no se usa para el prorrateo. Distorsiona profit_unitario, margen y las decisiones de precio por SKU.
- **Recomendación:** Ofrecer prorrateo por peso como opción (envioUnit_i = envioTotal × peso_i / Σpeso). Parsear `productos.peso` ('100g','850g') a gramos. Mantener 'parejo' como fallback cuando falte el peso. Mostrar el método usado en la UI del pedido.
- **Ejemplo:**

```
const pesoTotal = items.reduce((s,i)=>s+gramos(i.peso),0)
const envioUnit_i = pesoTotal>0 ? envioTotal*gramos(i.peso)/pesoTotal/i.cantidad : parejo
```

- **Beneficio esperado:** Costo landed y márgenes por SKU realistas. Mejores decisiones de precio, especialmente para el mix cintas/cremas.

</details>

<details>
<summary><strong>[Medio] #53 — No hay recepción parcial: el stock se suma 100% al crear el pedido, no al recibir la mercancía</strong> · Funcionalidad · Imp 6/Cpx 6 · 2-3d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/actions.ts:266-268`
- **Problema:** crearPedido suma el stock completo en el mismo instante (sumarStock por cada ítem). Pero estas son importaciones de Brasil que tardan semanas y a veces llegan parciales (el propio fix-pedido-3.py menciona 'faltan 32 cintas para llegar a 157'). El inventario refleja stock que físicamente aún no llegó, falseando 'items disponibles' y permitiendo vender producto inexistente. No hay campo cantidad_recibida ni acción de recepción.
- **Recomendación:** Separar 'pedido' de 'recepción': pedido_compra_items.cantidad = pedido; agregar cantidad_recibida. El stock se suma solo al recibir (acción 'Recibir' total o parcial), que también avanza el status. Hasta recibir, mostrar como 'en tránsito' sin tocar inventario vendible.
- **Ejemplo:**

```
// recibirItems(pedidoId, [{itemId, cantidad}]) -> sumarStock + update cantidad_recibida + recompute status
```

- **Beneficio esperado:** El inventario vendible refleja lo que físicamente existe. Soporta el caso real de embarques parciales sin scripts.

</details>

<details>
<summary><strong>[Medio] #70 — agregarItemsPedido infiere el ratio de inversión por socio dividiendo, perdiendo precisión y arrastrando errores</strong> · Lógica de negocio · Imp 5/Cpx 4 · 0.5-1d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/actions.ts:409-416`
- **Problema:** Al agregar productos a un pedido existente, el split de socios se re-deriva como ratio: rSandra = inversion_sandra_usd / total_usd_viejo, luego se aplica al total nuevo. Si el split original no era exactamente proporcional al total (caso común: la nota del proyecto dice 'venta_socios NO siempre es 50/50', y los pedidos pueden tener aportes desiguales fijos en MXN), este recálculo distorsiona los montos reales aportados por cada socia. Un aporte fijo de Sandra de $X se convierte en un porcentaje flotante que cambia con cada producto agregado.
- **Recomendación:** Decidir el modelo: si la inversión es un monto fijo por socio, NO recalcular al agregar ítems (solo subir el total y dejar que el saldo lo cubra quien corresponda, o pedir al usuario el nuevo split). Si es proporcional, documentarlo. No inferir un ratio de datos que pueden no ser proporcionales.
- **Ejemplo:**

```
// preservar montos absolutos; el incremento se asigna explícitamente, no por ratio
```

- **Beneficio esperado:** Los montos de inversión por socia se mantienen fieles a lo aportado, base correcta para ROI y reparto.

</details>

<details>
<summary><strong>[Medio] #81 — Las 13 columnas derivadas de pedido_compra_items se calculan a mano en 4 lugares (itemFields + 3 scripts) — duplicación = causa raíz de la fragilidad</strong> · Mantenibilidad · Imp 5/Cpx 5 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/actions.ts:20-47`
- **Problema:** itemFields() escribe precio_unitario_mxn, envio_unitario_mxn, costo_total_unitario_usd/mxn, subtotal_usd/mxn, total_con_envio_usd/mxn, profit_unitario/total — todas funciones puras de (precio, cantidad, envioUnit, tc, pub). La MISMA fórmula está re-implementada en fix-pedido-3.py, fix-pedido-3-cintas-brl.py y fix-pedido-3-envio-usa-mexico.py. Cualquier cambio de fórmula obliga a tocar 4 archivos; un olvido produce datos inconsistentes entre ítems. Esta duplicación es precisamente por qué corregir un pedido requiere reimplementar la matemática en Python.
- **Recomendación:** Convertir esas columnas en GENERATED en Postgres (precio_unitario_mxn = precio_unitario_usd * (SELECT tc del pedido)... o materializadas vía trigger desde precio/cantidad/envio_unit/tc), o exponerlas en una vista calculada. Así solo se escriben los inputs base (precio, cantidad, envio_unit) y la derivación es única. Los scripts dejarían de necesitar reimplementarla.
- **Ejemplo:**

```
ALTER TABLE pedido_compra_items ADD COLUMN costo_total_unitario_mxn numeric GENERATED ALWAYS AS ((precio_unitario_usd + envio_unitario_usd) * <tc>) STORED; -- o vía trigger leyendo tc del header
```

- **Beneficio esperado:** Una sola fuente de la fórmula de costeo. Imposible que ítems queden con derivados inconsistentes. Scripts mucho más simples (solo escriben inputs).

</details>

<details>
<summary><strong>[Medio] #125 — El número correlativo de pedido tiene race condition (count+1) y se rompe si se borra un pedido</strong> · Base de datos · Imp 4/Cpx 3 · 0.5d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/actions.ts:181-184`
- **Problema:** numero = (count de pedidos_compra) + 1. Dos pedidos creados casi simultáneamente obtienen el mismo número. Si se borra un pedido intermedio, el siguiente reusa un número ya usado (colisión) o salta. Con 2-3 usuarios el riesgo es bajo pero el patrón es incorrecto y la lista se ordena por `numero` (page.tsx:114), así que un duplicado desordena la vista.
- **Recomendación:** Usar una secuencia/identity de Postgres para `numero` (auto-increment a nivel BD, inmune a borrados y concurrencia), o derivar el correlativo de MAX(numero)+1 dentro de una transacción/RPC. No contar filas en el cliente.
- **Ejemplo:**

```
ALTER TABLE pedidos_compra ALTER COLUMN numero ADD GENERATED BY DEFAULT AS IDENTITY;
```

- **Beneficio esperado:** Numeración única y monótona garantizada por la BD, sin colisiones ni huecos problemáticos.

</details>

<details>
<summary><strong>[Medio] #137 — El badge de status (5 estados) nunca se escribe — todos los pedidos muestran 'Recibido' para siempre</strong> · Funcionalidad · Imp 4/Cpx 4 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/page.tsx:44-78, 258-259`
- **Problema:** STATUS_CONFIG define 5 estados ricos (en_transito, recibido, vendido, parcial, pendiente) con colores, y la card hace `pedido.status ?? 'recibido'`. Pero NINGUNA acción ni form escribe `status` (verificado: grep de update/insert con status en todo pedidos/ devuelve vacío). El campo es de solo-lectura muerto: todo pedido aparece 'Recibido' aunque esté en tránsito o vendido. Es una promesa de UI sin backend — un usuario asume que el estado refleja la realidad logística y toma decisiones sobre datos falsos.
- **Recomendación:** La recomendación original es buena; la refino y corrijo un detalle de scope. El auditor citó page.tsx (258-259) pero omitió que existe un form de edición completo (src/app/(dashboard)/pedidos/[id]/editar/page.tsx + editarPedido en actions.ts:552-568) — ahí es donde más natural cabe un selector de status, además del insert de crearPedido.

Opción recomendada (implementar el ciclo de vida, mínimo viable):
1. Agregar un <select> de status en nuevo/page.tsx y en [id]/editar/page.tsx (valores: pendiente, en_transito, recibido), incluirlo en los payloads y persistirlo en el insert (actions.ts:228-245) y el update de editarPedido (actions.ts:552-568).
2. NO almacenar `vendido`/`parcial` como estado manual: derivarlos en read-time comparando unidades vendidas (venta_items) vs. compradas (pedido_compra_items.cantidad), de forma análoga al patrón ya usado para profit. Así el badge nunca miente por desincronización.
3. Verificar el default de la columna `status` en BD; si no tiene default coherente, fijarlo a 'pendiente' o 'recibido' para que el fallback de page.tsx:258 deje de enmascarar datos faltantes.

Alternativa de bajo esfuerzo (si no se va a usar el ciclo de vida ahora): quitar el badge de STATUS_CONFIG y su render (page.tsx:291-300) para no mostrar un estado falso. Preferible la opción de implementarlo, ya que es la base para recepción parcial/tracking.
- **Ejemplo:**

```
// actions.ts
export async function actualizarStatusPedido(id, status) {
  await admin.from('pedidos_compra').update({ status }).eq('id', id)
  revalidatePath('/pedidos'); revalidatePath(`/pedidos/${id}`)
}
```

- **Beneficio esperado:** El estado refleja la realidad. Habilita tracking de importaciones (que es el propósito declarado del módulo) y reportes de mercancía en tránsito.
- **Verificación:** ajustado — CONFIRMADO el hecho central: el badge de status nunca se escribe. Evidencia:

- src/app/(dashboard)/pedidos/page.tsx:44-78 — STATUS_CONFIG define 5 estados (en_transito, recibido, vendido, parcial, pendiente).
- page.tsx:258-259 — `const status = pedido.status ?? "recibido"` y `STATUS_CONFIG[status] ?? STATUS_CONFIG.recibido`: doble fallback a "recibido".
- page.tsx:39 + query `select *

</details>

<details>
<summary><strong>[Medio] #148 — Editar un pedido SOBREESCRIBE silenciosamente las correcciones manuales de los scripts (precios BRL, envío multi-tramo)</strong> · Lógica de negocio · Imp 4/Cpx 5 · 1d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/[id]/editar/editar-pedido-form.tsx:84-92, 147-176`
- **Problema:** El form de edición carga `envio_total_usd` de `costo_envio_usd` y los precios de `precio_unitario_usd`, recalcula con prorrateo PAREJO por unidad y al guardar (editarPedido) re-snapshotea esos costos a la tabla `productos`. El Pedido 3 fue corregido a mano por 3 scripts: cintas con precio BRL×0.1743, envío Brasil→USA + USA→México con TC 17.60, prorrateo derivado del pago real. Si cualquier usuario abre 'Editar pedido' del P3 y pulsa 'Guardar cambios' (aunque no cambie nada), borra y reinserta los 53 ítems recalculando envío/u parejo y reescribe el costo de cada producto en inventario — destruyendo el costeo real validado contra las facturas. No hay aviso ni bloqueo.
- **Recomendación:** Bajar de Crítico/9 a Medio/4. El form ya preserva precio_unitario_usd, costo_envio_usd y tipo_cambio en un guardado sin cambios, así que no hay corrupción "silenciosa" por abrir+Guardar. Mejoras reales: (1) Mostrar un banner de solo-lectura cuando el pedido tiene costeo derivado de moneda extranjera (P3 = BRL) advirtiendo que editar precios USD a mano rompe la trazabilidad BRL×0.1743. (2) Modelar la moneda de origen por ítem (moneda + precio_origen + factor) para que la edición use la misma fuente de verdad que los scripts. (3) Añadir audit/log al re-snapshot de productos (qué costos cambiaron y a qué valores) para poder revertir. No es necesario "preservar envio_unitario_usd por ítem" como propone el hallazgo original: tanto editarPedido como los scripts usan prorrateo parejo, así que ese valor se reproduce igual.
- **Ejemplo:**

```
// editar-pedido-form: cargar precio_usd y envío por ítem desde BD
// y NO re-prorratear salvo que cambie envioTotal o cantidades.
// Idealmente marcar pedidos 'recosteados por script' como locked.
```

- **Beneficio esperado:** Evita corrupción de costos de inventario y márgenes en el pedido más grande del negocio (692 u). Elimina la trampa de 'editar = destruir'.
- **Verificación:** ajustado — El MECANISMO existe: editarPedido() borra y reinserta los ítems y re-snapshotea costos a productos. Evidencia: actions.ts:524 `await admin.from("pedido_compra_items").delete().eq("pedido_id", pedidoId)`; actions.ts:523 `envioUnit = totalUnidades>0 ? envioTotal/totalUnidades : 0` (prorrateo PAREJO); actions.ts:542 `await snapshotProducto(admin, pid, precio, envioUnit, tc)`; snapshotProdu

</details>

<details>
<summary><strong>[Bajo] #159 — Pagos y Conversiones miden 'cobertura' contra metas distintas sin reconciliación entre las tres fuentes de salida de dinero</strong> · UX · Imp 4/Cpx 5 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/[id]/pagos.tsx:47-51`
- **Problema:** Pagos compara total USDT enviado vs productosUsd (mercancía sin envío). Conversiones compara MXN gastado vs total del pedido + comisiones. Tramos de envío es informativo. Son tres tableros de 'dinero que salió' con denominadores distintos y ninguna vista que reconcilie: ¿lo enviado en pagos coincide con lo convertido en USDT? ¿el envío pagado en tramos cuadra con costo_envio? El usuario debe cruzar mentalmente tres secciones. fix-pedido-3-cintas-brl.py tuvo que validar el total contra la suma de transfers Bitso a mano — justo la reconciliación que la UI no ofrece.
- **Recomendación:** Añadir un panel de conciliación: Costo total esperado (productos+envío+comisiones) vs. Total efectivamente pagado (Σ pagos USDT×TC + Σ tramos envío + Σ comisiones), con un delta resaltado en verde/ámbar. Una sola 'verdad' del dinero del pedido.
- **Ejemplo:**

```
const pagadoReal = pagosUsdt*tcEfectivo + enviosMxn + comisionesMxn
const delta = costoRealMXN - pagadoReal // mostrar con semáforo
```

- **Beneficio esperado:** El usuario ve de un vistazo si el pedido está totalmente pagado y si los números cuadran, sin reconciliar a mano ni con scripts.

</details>

<details>
<summary><strong>[Bajo] #168 — Toda la lógica de costeo confía en inputs del cliente sin validación de servidor (cantidades, precios, TC negativos o absurdos)</strong> · Seguridad · Imp 3/Cpx 2 · 0.5d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/actions.ts:165-178, 461-472`
- **Problema:** crearPedido/editarPedido aceptan tipo_cambio, precio_usd, envio_total_usd y cantidad directo del payload con solo `Number(x) || 0`. No hay límites: un TC de 0 deja todo en MXN=0; un precio negativo produce profit/costos absurdos; cantidades enormes inflan stock. Al ser service_role detrás del JWT compartido el riesgo de abuso externo es bajo, pero un error de tipeo (TC 2070 en vez de 20.70) corrompe el snapshot a `productos` y por ende el inventario y los márgenes de toda la app sin ninguna barrera.
- **Recomendación:** Validar en el server: tc en rango (p.ej. 10-30), precios y envío >= 0, cantidades enteras positivas y < tope razonable. Rechazar con error claro antes de escribir. Idealmente confirmar el snapshot a productos solo en recepción, no al crear.
- **Ejemplo:**

```
if (tc < 5 || tc > 40) return { ok:false, error:'TC fuera de rango (5-40)' }
if (items.some(i => i.precio_usd < 0)) return { ok:false, error:'Precio negativo' }
```

- **Beneficio esperado:** Un typo no corrompe el inventario global. Defensa básica de integridad financiera.

</details>

<details>
<summary><strong>[Bajo] #182 — Subir documento/comprobante no valida que el archivo previo se borre si la BD falla, y borrarDocumento es best-effort silencioso (huérfanos en storage)</strong> · Mantenibilidad · Imp 3/Cpx 3 · 0.5d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/actions.ts:683-706, 818-840`
- **Problema:** subirComprobantePago/subirFacturaEnvio/subirComprobanteConversion suben el archivo nuevo, luego borran el previo, luego actualizan la BD. Si el update de BD falla (return error), el archivo NUEVO ya está en storage y el VIEJO ya fue borrado → queda un huérfano y el registro apunta a un comprobante inexistente. borrarDocumento (storage-docs.ts:60) ignora errores en silencio, acumulando huérfanos sin telemetría. subirDocumentoPedido sí hace rollback del archivo (línea 748), pero los comprobantes no.
- **Recomendación:** Reordenar: actualizar la BD primero (apuntando al filename nuevo), y solo tras éxito borrar el previo. Si la BD falla, borrar el archivo recién subido (rollback) como ya hace subirDocumentoPedido. Loggear fallos de borrado para limpieza posterior.
- **Ejemplo:**

```
const { error } = await admin.from('pedido_pagos').update({comprobante_url: sub.filename}).eq('id', pagoId)
if (error) { await borrarDocumento(sub.filename); return {ok:false,error:error.message} }
if (prev?.comprobante_url) await borrarDocumento(prev.comprobante_url)
```

- **Beneficio esperado:** Sin comprobantes huérfanos ni registros que apuntan a archivos borrados. Storage consistente con la BD.

</details>


### Finanzas & Dashboard

El módulo de Finanzas y el Dashboard están bien construidos visualmente y la exclusión del cliente interno (Piel Canela) está correctamente aplicada en ambos. Sin embargo, hay errores de corrección financiera que comprometen la confiabilidad de los números mostrados: el "capital recuperado" y el ROI cuentan asignaciones de venta_socios independientemente de si están pagadas (columnas pagado/fecha_pago se leen pero se ignoran), las ventas canceladas se incluyen en los KPIs del mes y en el reparto de socios, y la fórmula de ROI promedio del hero difiere de la fórmula por socio. Falta lo más importante para "salud financiera real": no hay estado de resultados (P&L), ni flujo de caja, ni cuentas por cobrar (saldo_pendiente), ni márgenes consolidados, ni proyecciones — el módulo mide recuperación de capital de socios, no la salud del negocio. Todo el cómputo se hace en JS trayendo tablas completas (venta_socios, ventas, inversiones), lo que escala mal pero es tolerable hoy con ~42 ventas. No hay capa de IA (narrativa financiera, anomalías, forecast) pese a que el negocio lo pide.

**¿Completo?** No como "centro financiero". Finanzas hoy = ROI/recuperación de capital de 2 socios. Falta el núcleo de un ERP financiero: P&L (ingresos − COGS − gastos = utilidad), flujo de caja (entradas/salidas reales por mes), cuentas por cobrar (`ventas.saldo_pendiente` existe y es GENERATED pero NO se muestra en ningún lado financiero), cuentas por pagar (pedidos_compra a Brasil), y márgenes consolidados del negocio (el dashboard sí muestra margen del mes, finanzas no muestra ningún margen).

**¿Qué sobra / confunde?** El KPI "Sandra / Benjamin … recuperado · ROI total" en el dashboard (page.tsx:510-514) muestra dos montos recuperados pero el sub dice "ROI total" — no muestra ROI, confunde. En finanzas, `void invSandra/invBenjamin` (líneas 213-214) delata código muerto/confuso: se calculan, se anulan con void, y luego SÍ se usan en el chart (líneas 491-492) — el `void` es engañoso y debe quitarse.

**¿Qué simplificar/automatizar?** La agregación mensual se reimplementa 3 veces (monthly, monthly12, chartData) con bucles casi idénticos en finanzas, y otra vez en dashboard. Extraer un helper `bucketByMonth()`. La definición de IDs de socios está hardcodeada y duplicada en page.tsx, finanzas/page.tsx (y seguramente más) — centralizar en `@/lib/socios.ts`.

**¿Qué genera fricción / qué haría la IA?** El negocio pidió explícitamente "análisis financiero narrativo, anomalías, forecast". Hoy los "Insights" del dashboard son reglas if/else triviales (mejor cliente, top producto, % vs mes pasado). Una capa IA real generaría: (1) narrativa mensual ("Junio cerró 18% abajo; impulsado por caída en Cintas 12mm y un cliente que no recompró"), (2) detección de anomalías (venta sin ganancia, margen negativo, cliente en riesgo de churn), (3) forecast de recuperación de capital ("a este ritmo Sandra recupera el 100% en ~4 meses"). El módulo de clientes ya tiene un EmpiricalCDFModel; ese motor de predicción debería alimentar un forecast de ingresos en finanzas.

**Veredicto de clase mundial:** Stripe/Mercury no aprobarían llamar "Finanzas" a una vista que ignora si el dinero realmente entró (pagado) e incluye ventas canceladas. La corrección de los números es prerequisito antes que cualquier pulido de UI.

**Hallazgos (14):**

<details>
<summary><strong>[Alto] #12 — Ventas canceladas se cuentan en recuperación de capital y reparto de socios (finanzas)</strong> · Lógica de negocio · Imp 7/Cpx 3 · 2h</summary>

- **Archivo:** `src/app/(dashboard)/finanzas/page.tsx:86-89, 109-111, 166-180`
- **Problema:** La query de ventas (líneas 86-89) trae todas sin filtrar estatus, y `venta_socios` (línea 109-111) solo se filtra por cliente interno, no por estatus de la venta. Si una venta se cancela pero sus filas en venta_socios persisten, su monto sigue sumando en `capitalRecuperado`, en la tabla 'Recuperación por venta' y en los totales Sandra/Benjamin (líneas 178-180). Una venta cancelada no recupera capital.
- **Recomendación:** Traer `estatus` en la query de ventas y construir un Set de venta_ids cancelados; excluirlo de venta_socios igual que ya se hace con internalVentaIds. Confirmar además que la cancelación de una venta borra/marca sus venta_socios (revisar la server action de cancelar).
- **Ejemplo:**

```
const canceladasIds = new Set(ventasRaw.filter(v => v.estatus === 'cancelada').map(v => v.id))
const ventaSocios = (vsRes.data ?? []).filter(vs => !internalVentaIds.has(vs.venta_id) && !canceladasIds.has(vs.venta_id))
```

- **Beneficio esperado:** ROI y capital recuperado por socio dejan de contar ventas anuladas.
- **Verificación:** confirmado — Confirmado contra el código real.

1) Query de ventas NO trae ni filtra estatus: src/app/(dashboard)/finanzas/page.tsx:86-89 selecciona solo `id, numero, fecha, total, notas, cliente_id` con `.order("fecha")`. No hay `.neq("estatus","cancelada")` ni se lee la columna estatus en ninguna parte del archivo.

2) venta_socios solo se filtra por cliente interno, NO por estatus: page.tsx:109

</details>

<details>
<summary><strong>[Alto] #27 — Las ventas canceladas se incluyen en KPIs del mes (ventas, ganancia, ticket)</strong> · Lógica de negocio · Imp 6/Cpx 2 · 1h</summary>

- **Archivo:** `src/app/(dashboard)/page.tsx:142-150, 305-323`
- **Problema:** Las queries `ventasMesRes` (líneas 142-145) y `ventasMesAntRes` (148-150) NO filtran `estatus != 'cancelada'`. Luego `totalVentasMes`, `gananciaMes`, `ticketMes` (líneas 305-323) suman todas las ventas del mes incluidas las canceladas. Una venta cancelada infla las 'Ventas del mes', la 'Ganancia neta' y distorsiona el 'Ticket promedio' (y su cuenta de órdenes). Inconsistencia interna grave: la serie del chart mensual SÍ excluye canceladas (`if (v.estatus === 'cancelada') continue`, línea 359), así que el número del hero y la barra del mismo mes en la gráfica se contradicen.
- **Recomendación:** Añadir .neq("estatus", "cancelada") a AMBAS queries: ventasMesRes (page.tsx:142-145) y ventasMesAntRes (page.tsx:146-150). Esta es la solución más limpia porque los selects actuales ni siquiera traen la columna estatus, así que el filtrado en JS requeriría además agregarla al select. Verificar consistencia con el resto del dashboard: el chart (:358-359) ya excluye canceladas, así que ambos quedarían alineados. Recomendación adicional: revisar venta_socios/ROI y "Últimas ventas" (recentVentas) para mostrar badge de estatus y evitar mezclar canceladas sin marca. Considerar extraer un helper compartido (ej. excluirCanceladas) para no repetir la regla en cada query de ventas del módulo.
- **Ejemplo:**

```
supabase.from('ventas').select('id, total, ganancia, cliente_id, clientes(...)').gte('fecha', monthStart).neq('estatus','cancelada')
```

- **Beneficio esperado:** KPIs del hero consistentes con la gráfica y con la realidad; ganancia y ticket no inflados por ventas anuladas.
- **Verificación:** ajustado — CONFIRMADO el defecto técnico. src/app/(dashboard)/page.tsx:142-145 (ventasMesRes) y :146-150 (ventasMesAntRes) solo filtran por fecha (.gte/.lte sobre "fecha"), sin .neq("estatus","cancelada"). Es más: el select de ambas (línea 144 "id, total, ganancia, cliente_id, clientes(...)" y línea 148 "total, ganancia, cliente_id") NI SIQUIERA trae la columna estatus, así que no se puede filtrar

</details>

<details>
<summary><strong>[Medio] #82 — Falta P&L / Estado de resultados — no hay COGS ni gastos consolidados en Finanzas</strong> · Funcionalidad · Imp 5/Cpx 5 · 1 sem</summary>

- **Archivo:** `src/app/(dashboard)/finanzas/page.tsx:269-323`
- **Problema:** El módulo titulado 'Finanzas' no contiene ningún estado de resultados del negocio: no muestra ingresos totales, costo de productos (ventas.costo_productos), costo de envío (ventas.costo_envio), ni utilidad bruta/neta agregada. Solo trata recuperación de capital de socios. La 'Ganancia neta' del hero (línea 263) es en realidad recuperado − invertido (un concepto de socio), NO la ganancia operativa del negocio (total − costo_productos − costo_envio). Dos cosas distintas con el mismo nombre, en la misma app, generan confusión financiera real.
- **Recomendación:** Dos acciones independientes: (1) RENOMBRADO inmediato (bajo esfuerzo, alto valor): en finanzas/page.tsx:300 cambiar el label "Ganancia neta" a "Resultado neto del socio" (o "Capital neto recuperado"), reusando el término que ya existe internamente en :139 (resultadoNeto). Igual en la tarjeta por socio (:371 ya dice "Ganancia neta" para resultadoNeto). Esto elimina la colisión con la "Utilidad neta" operativa de ventas-dashboard.tsx. (2) CONSOLIDACIÓN (esfuerzo medio): añadir en Finanzas una sección P&L del negocio reutilizando la lógica YA existente de ventas-dashboard.tsx:164-186 — Ingresos (Σ ventas.total no canceladas), − COGS (Σ costo_productos), − Envío (Σ costo_envio), = Utilidad bruta/neta, con margen % y comparativa mes a mes. OJO: respetar reglas del repo — excluir cliente interno Piel Canela con getInternalClienteIds() (ya se hace en finanzas :92-108) y filtrar estatus 'cancelada'. No reescribir la fórmula: ventas.ganancia/utilidad_neta son GENERATED; usar los campos o replicar la fórmula del Sheet ya validada en ventas-dashboard.tsx:164-169.
- **Beneficio esperado:** Finanzas mide salud del negocio, no solo el reparto entre socias. Base para decisiones de precio y compra.
- **Verificación:** ajustado — VERIFICADO parcialmente. (1) El módulo Finanzas efectivamente NO tiene estado de resultados operativo: grep de costo_productos/costo_envio/utilidad/margen/COGS sobre src/app/(dashboard)/finanzas/ devuelve CERO coincidencias. La página solo trata inversiones, capital recuperado y ROI por socio (finanzas/page.tsx:67-323). CONFIRMADO. (2) La colisión de nombre es REAL y es lo más sólido de

</details>

<details>
<summary><strong>[Medio] #94 — Falta flujo de caja real (entradas cobradas vs salidas de inversión/compras)</strong> · Funcionalidad · Imp 5/Cpx 6 · 1 sem</summary>

- **Archivo:** `src/app/(dashboard)/finanzas/page.tsx:182-209`
- **Problema:** La 'serie acumulada' (líneas 199-209) grafica recuperación de capital por socio, pero no existe un flujo de caja del negocio: entradas (cobros reales) vs salidas (inversiones en inversiones + pagos a pedidos_compra de Brasil). pedidos_compra existe en el schema y representa la mayor salida de efectivo (importaciones), pero no aparece en finanzas. Sin esto no se puede responder '¿tengo efectivo este mes?'.
- **Recomendación:** Agregar vista de flujo de caja mensual: + cobros (venta_socios.pagado por fecha_pago), − inversiones (inversiones.fecha), − pagos de pedidos_compra. Usar fecha_pago (que ya se trae pero se ignora, línea 81) como eje temporal de las entradas reales.
- **Beneficio esperado:** Responde la pregunta de liquidez del negocio; aprovecha fecha_pago ya disponible.

</details>

<details>
<summary><strong>[Medio] #95 — Forecast / narrativa IA ausente — Insights son reglas if/else triviales</strong> · IA · Imp 5/Cpx 6 · 1-2 sem</summary>

- **Archivo:** `src/app/(dashboard)/page.tsx:389-450`
- **Problema:** Los 'Insights' (líneas 389-450) son 4 reglas estáticas: top cliente, top producto, % vs mes pasado, próxima cotización por vencer. No hay narrativa financiera, ni detección de anomalías (margen negativo, venta sin ganancia, caída atípica), ni forecast — todo lo que el negocio pidió explícitamente. El módulo de clientes ya tiene un EmpiricalCDFModel (lib-prediccion.ts) que no se aprovecha para proyectar ingresos/recuperación de capital en finanzas.
- **Recomendación:** Capa IA en 3 niveles: (1) anomalías deterministas baratas (venta con ganancia<0, mes con caída >X desviaciones, cliente que dejó de comprar) — sin LLM; (2) forecast de recuperación reusando el motor de predicción de clientes ('Sandra recupera 100% en ~N meses al ritmo actual'); (3) narrativa mensual generada por LLM con los agregados como contexto. Empezar por (1)+(2), que son determinísticos y verificables.
- **Beneficio esperado:** Insights accionables en vez de descriptivos; diferenciador de producto; reutiliza modelo ya construido.

</details>

<details>
<summary><strong>[Medio] #110 — KPI 'Sandra / Benjamin' del dashboard etiquetado 'ROI total' pero no muestra ROI</strong> · UX · Imp 4/Cpx 2 · 1h</summary>

- **Archivo:** `src/app/(dashboard)/page.tsx:510-514`
- **Problema:** El KPI muestra `${recuperado} / ${recuperado}` con sub 'recuperado · ROI total'. El valor son dos montos recuperados, no un ROI. El sub promete 'ROI total' que nunca aparece. Además sin contexto de invertido, dos cifras sueltas no comunican salud (¿es bueno o malo recuperar X?). Para usuarios reales (las socias) este es el dato más personal y está ambiguo.
- **Recomendación:** Mostrar el ROI o el % de recuperación que ya se calcula (sandra.roi / benjamin.roi, sandra.pct), o reformular: 'Recuperado: 78% / 91%'. Las tarjetas SocioCard de más abajo ya muestran esto bien; el KPI del hero debe alinearse y no prometer un dato que no enseña.
- **Beneficio esperado:** KPI honesto y accionable; las socias ven su retorno real de un vistazo.

</details>

<details>
<summary><strong>[Medio] #126 — Fórmula de ROI promedio del hero difiere de la fórmula por socio</strong> · Lógica de negocio · Imp 4/Cpx 3 · 1-2h</summary>

- **Archivo:** `src/app/(dashboard)/finanzas/page.tsx:139-140, 263-267`
- **Problema:** ROI por socio (líneas 139-140): `(capitalRecuperado − totalInvertido)/totalInvertido * 100`. ROI promedio del hero (líneas 263-267): `(totalRecuperado/totalInvertido − 1) * 100`. Algebraicamente son iguales, lo cual está bien — PERO el sparkline del KPI 'ROI promedio' (líneas 315-319) usa `(m.recuperadoAcum/invByMonth[i] − 1)*100` con `invByMonth` = inversión acumulada HASTA ese mes (snapshot), mientras el número grande usa la inversión TOTAL de hoy. La última barra del sparkline no coincide con el número mostrado salvo que ya no haya inversiones futuras. Es una inconsistencia sutil entre el valor y su mini-tendencia.
- **Recomendación:** Unificar: o el número grande usa la misma serie snapshot (último punto del sparkline), o el sparkline usa inversión total fija. Recomendado el snapshot (más correcto financieramente: el ROI en cada mes debe medirse contra el capital invertido a esa fecha).
- **Beneficio esperado:** El número y su sparkline cuentan la misma historia; ROI temporalmente correcto.

</details>

<details>
<summary><strong>[Medio] #127 — Falta cuentas por cobrar pese a que ventas.saldo_pendiente existe (GENERATED)</strong> · Funcionalidad · Imp 4/Cpx 3 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/finanzas/page.tsx:86-89`
- **Problema:** El schema tiene `ventas.saldo_pendiente` (columna GENERATED, documentada en CLAUDE.md) y `venta_socios.pagado`, pero ni el módulo de finanzas ni el dashboard muestran cuánto dinero está pendiente de cobro. Para una distribuidora que vende a spas (pago diferido/parcial — el enum tiene pagada_parcial), 'cuánto me deben' es un KPI de caja de primer orden y está ausente. La query de ventas en finanzas ni siquiera trae saldo_pendiente.
- **Recomendación:** Reformular: NO es que falte el KPI (ya existe "Cobrado/Saldo" en /ventas y "Por cobrar" por venta). El gap real es doble y menor: (1) el módulo /finanzas no consolida cuentas por cobrar — añadir saldo_pendiente y cantidad_pagada a la query de ventas en finanzas/page.tsx:86-89 y mostrar un KPI "Por cobrar" = Σ saldo_pendiente de ventas no canceladas, para coherencia con la vista de caja por socio; (2) en ningún módulo hay desglose de antigüedad (aging 0-30/30-60/60+ días desde fecha) ni por cliente — agregarlo como tabla/panel (idealmente en /ventas o /clientes donde ya viven los datos de saldo). Excluir siempre cliente interno Piel Canela vía getInternalClienteIds() como ya hace el resto del código.
- **Beneficio esperado:** Visibilidad de caja pendiente; permite priorizar cobranza, evita asumir que toda venta = efectivo recibido.
- **Verificación:** ajustado — La premisa central ("ni el dashboard muestran cuánto está pendiente de cobro") es FALSA. El saldo por cobrar YA está expuesto en varios lugares:
- src/app/(dashboard)/ventas/ventas-dashboard.tsx:191-198 calcula `saldo` (Σ saldo_pendiente) y `pendientes` (count de ventas con saldo>0), y los renderiza como KPI "Cobrado" (sub "X% del total · N pend.", línea 461-463) y "Saldo {monto}" en la

</details>

<details>
<summary><strong>[Medio] #149 — Toda la agregación se hace en JS trayendo tablas completas (venta_socios sin filtro)</strong> · Performance · Imp 4/Cpx 5 · 2-3d</summary>

- **Archivo:** `src/app/(dashboard)/finanzas/page.tsx:79-90, 132-252`
- **Problema:** Se traen venta_socios completa (línea 79-81, sin where), ventas completa (86-89) e inversiones completa (75-78), y se agregan en JS con múltiples .filter().reduce() repetidos por socio (líneas 132-180, 244-249 recorre inversiones 12 veces). Con ~42 ventas/~86 filas socio es trivial, pero el patrón no escala: a miles de ventas se descarga toda la tabla por cada render del server component. El dashboard repite el patrón (page.tsx:166-167 trae inversiones y venta_socios enteras).
- **Recomendación:** Mover las agregaciones a SQL: una vista/RPC `vista_roi_socios` (SUM monto FILTER WHERE pagado GROUP BY socio_id) y `vista_recuperacion_mensual`. Reemplaza 5+ pasadas en JS por una query indexada. Mientras tanto, al menos evitar recorrer inversionesData 12 veces (línea 244) precomputando un acumulado ordenado una sola vez.
- **Beneficio esperado:** Escala a multi-tenant/miles de ventas; menos transferencia de datos; cómputo financiero centralizado y testeable en BD.

</details>

<details>
<summary><strong>[Bajo] #169 — Capital recuperado y ROI cuentan dinero NO cobrado (ignora pagado/fecha_pago)</strong> · Lógica de negocio · Imp 3/Cpx 2 · 1-2h</summary>

- **Archivo:** `src/app/(dashboard)/finanzas/page.tsx:79-81, 136-138`
- **Problema:** La query selecciona `monto, pagado, fecha_pago` de venta_socios (línea 81) y el tipo declara `pagado: boolean` y `fecha_pago` (líneas 50-51), pero al calcular `capitalRecuperado` (líneas 136-138) se suma `vs.monto` de TODAS las filas sin filtrar por `pagado === true`. Resultado: 'Capital recuperado', 'ROI', 'Ganancia neta' y 'Capital en riesgo' incluyen montos asignados a un socio que el cliente aún NO ha pagado. Para un módulo cuyo propósito literal es 'recuperación de capital', esto reporta dinero que no ha entrado como si ya estuviera recuperado — corrupción del dato financiero más sensible del producto. El mismo bug existe en el dashboard (page.tsx:376-378, socioStats no filtra pagado).
- **Recomendación:** NO aplicar `.filter(vs => vs.pagado)`: dejaría todo en cero porque `pagado` siempre es false (ventas/actions.ts:116,124,486) y nada en el código lo pone en true. Antes de tocar finanzas hay que decidir el modelo de datos con el usuario:

Opción A (recomendada, mínimo riesgo): documentar que `venta_socios.monto` YA representa el reparto real distribuido (no impagos), dejar el cálculo actual, y ELIMINAR los campos vestigiales `pagado`/`fecha_pago` del select y del tipo (finanzas/page.tsx:50-51,81; [id]/page.tsx:77) o marcarlos como deprecados, para quitar la trampa. Esto cierra el hallazgo sin romper nada.

Opción B (si se quiere Cuentas por Cobrar de verdad): primero hacer que `pagado`/`fecha_pago` sean REALES — poblarlos al registrar cobros (hoy el cobro vive en ventas.cantidad_pagada/estatus, no en venta_socios). Recién entonces exponer dos métricas: 'Asignado' (todo `monto`) y 'Cobrado' (`pagado=true`), con 'Por cobrar' = asignado − cobrado. Sin ese trabajo previo de escritura, la métrica 'Cobrado' es siempre 0 y carece de sentido.

En ambos casos, alinear el dashboard (page.tsx:376-378) con la decisión.
- **Ejemplo:**

```
const capitalCobrado = ventaSocios.filter(vs => vs.socio_id === s.id && vs.pagado).reduce((sum, vs) => sum + Number(vs.monto ?? 0), 0)
const capitalAsignado = ventaSocios.filter(vs => vs.socio_id === s.id).reduce((sum, vs) => sum + Number(vs.monto ?? 0), 0)
const porCobrar = capitalAsignado - capitalCobrado
```

- **Beneficio esperado:** Los KPIs financieros reflejan caja real, no promesas. Habilita el módulo de cuentas por cobrar sin nueva infraestructura.
- **Verificación:** ajustado — La OBSERVACIÓN DE CÓDIGO del auditor es correcta, pero su severidad y recomendación son erróneas (peligrosas).

CONFIRMADO en código:
- finanzas/page.tsx:81 selecciona `monto, pagado, fecha_pago`; tipo declara `pagado: boolean` / `fecha_pago` (50-51).
- finanzas/page.tsx:136-138: `capitalRecuperado` suma `vs.monto` de TODAS las filas del socio sin filtrar por `pagado`. Igual en totalRec

</details>

<details>
<summary><strong>[Bajo] #170 — invByMonth usa cutoff fijo '-31' que no existe en meses de <31 días</strong> · Lógica de negocio · Imp 3/Cpx 2 · 30min</summary>

- **Archivo:** `src/app/(dashboard)/finanzas/page.tsx:244-249`
- **Problema:** El snapshot de inversión acumulada construye el cutoff como `m.key + '-31'` (ej. '2026-02-31'). La comparación es string-lexicográfica sobre `i.fecha`, así que funciona por accidente (cualquier fecha de febrero '2026-02-xx' < '2026-02-31' como string). Es frágil: depende de que las fechas sean ISO y de comparación textual; si alguna fecha viniera con timestamp o formato distinto, el filtro fallaría silenciosamente. Patrón también visible en el fallback '0000-00-00' (línea 247).
- **Recomendación:** Usar el último día real del mes o comparar por Date. Mejor: precomputar inversiones ordenadas por fecha y un acumulado, luego binary-search/scan por mes — más robusto y elimina la pasada O(meses×inversiones).
- **Beneficio esperado:** Snapshot de inversión correcto independiente del formato de fecha; sin dependencia de comparación lexicográfica frágil.

</details>

<details>
<summary><strong>[Bajo] #191 — Código muerto/engañoso: void invSandra/invBenjamin que sí se usan</strong> · Mantenibilidad · Imp 2/Cpx 1 · 15min</summary>

- **Archivo:** `src/app/(dashboard)/finanzas/page.tsx:211-214`
- **Problema:** Se calculan `invSandra`/`invBenjamin` (líneas 211-212), inmediatamente se anulan con `void invSandra; void invBenjamin` (213-214) — señal de 'no usado' para el linter — pero luego SÍ se pasan al RecoveryChart (líneas 491-492). El `void` es residuo confuso que miente sobre el uso real de la variable y puede inducir a alguien a borrarlas.
- **Recomendación:** Eliminar las líneas `void invSandra` y `void invBenjamin`. Las variables se usan legítimamente en el chart.
- **Beneficio esperado:** Menos ruido y confusión; intención del código clara.

</details>

<details>
<summary><strong>[Bajo] #192 — Comentario stale: 'ventas legible para anon' contradice la arquitectura RLS</strong> · Mantenibilidad · Imp 2/Cpx 1 · 15min</summary>

- **Archivo:** `src/app/(dashboard)/finanzas/page.tsx:71-72`
- **Problema:** El comentario dice 'Ventas usan el cliente normal (legible para anon)'. Según CLAUDE.md, RLS bloquea totalmente a anon y `createClient()` de server ya usa service_role (bypassa RLS). El cliente 'normal' aquí NO es anon. El comentario describe un modelo de seguridad que ya no existe y puede inducir a error a quien mantenga el código (p.ej. asumir que mover esto al browser client funcionaría — no funcionaría).
- **Recomendación:** Actualizar el comentario: 'ventas vía createClient() server (service_role, bypassa RLS)'. Considerar usar `admin` también aquí por consistencia, ya que ambos son service_role.
- **Beneficio esperado:** Documentación interna coherente con la arquitectura real de seguridad.

</details>

<details>
<summary><strong>[Bajo] #196 — IDs de socios y formateadores MXN duplicados entre dashboard y finanzas</strong> · Mantenibilidad · Imp 2/Cpx 2 · 1h</summary>

- **Archivo:** `src/app/(dashboard)/page.tsx:23-24`
- **Problema:** SANDRA_ID/BENJAMIN_ID están hardcodeados en page.tsx (23-24) y de nuevo en finanzas/page.tsx (7-8), y los formateadores Intl.NumberFormat('es-MX',...) se redefinen en cada archivo (page.tsx:26-37, finanzas:16-35, recovery-chart:15-19). Riesgo de divergencia si cambia un ID o el formato.
- **Recomendación:** Centralizar en `@/lib/socios.ts` (SANDRA_ID, BENJAMIN_ID, SOCIO_COLOR) y usar el `formatMXN` ya existente en utils.ts en lugar de redefinir formateadores locales.
- **Beneficio esperado:** Una sola fuente de verdad para IDs y formato; cambios en un solo lugar.

</details>


### Portal público /order

El portal /order es la única superficie expuesta a internet sin login y, en general, está mejor blindado que el promedio de un proyecto chico: corre 100% server-side con service_role detrás del candado de Next, tiene rate-limiting in-memory en ambas server actions, valida tamaño de carrito y cantidades, y no expone el anon key. Sin embargo tiene fallas reales: (1) submitOrder confía en el `precio` enviado por el cliente y lo persiste como `precio_unitario` de la cotización — un atacante puede inyectar precios arbitrarios (incluso negativos); (2) `producto_id` y `clienteExistenteId` NO se validan contra la BD, permitiendo IDOR/injerto de IDs y reasignación de pedidos a cualquier cliente; (3) la búsqueda por teléfono usa `ilike %digits%` (substring), lo que permite enumeración parcial de la base de clientes y filtra PII (nombre, negocio, email, ciudad); (4) el número de orden "portal" usa Math.random sin verificar colisión, a diferencia del estándar. El rate-limit es best-effort no-distribuido y se evade trivialmente falsificando x-forwarded-for en next dev / sin WAF. Falta validación de formato de email/teléfono y sanitización. UX del catálogo es sólida y mobile-first; el "tracking" del pedido es inexistente (solo número de referencia + WhatsApp manual).

**Completo / qué falta:**
- El flujo es: catálogo → carrito → checkout → crea cotización "borrador" → success con número + botón WhatsApp. NO hay tracking real del pedido (el cliente no puede consultar estado), ni confirmación por email/SMS automática. La notificación es interna (tabla `notificaciones`). Para un negocio chico es aceptable, pero el "número de referencia" da falsa sensación de seguimiento: no hay página donde consultarlo.
- No hay anti-bot (captcha/turnstile) en el único endpoint de escritura público. Para B2B con pocos spas esto es suficiente HOY, pero el `submitOrder` crea filas en `clientes` + `cotizaciones` + `cotizacion_items` + `notificaciones` sin fricción → un bot puede inflar la BD con clientes/cotizaciones basura.

**Qué sobra / simplificar:**
- `buscarClientePorTelefono` y la rama 2 de `submitOrder` duplican la lógica `ilike %digits%`. Unificar en un helper `findClienteByTel(digits)` con match EXACTO normalizado.
- El `precio` y `nombre` viajan del cliente al server innecesariamente: el server debería re-resolver precio y nombre desde `precios_producto`/`productos` por `producto_id`. Hoy `nombre` ni se usa (solo `precio`, `cantidad`, `producto_id`).

**Qué automatizar / IA:**
- Auto-confirmación: hoy un humano convierte el borrador a venta. Se podría auto-clasificar pedidos de clientes reconocidos vs nuevos y pre-rellenar IVA/envío sugerido.
- Detección de spam: un check IA/heurístico simple (mismo IP, items idénticos, nombres random) antes de persistir.

**Qué confunde / fricción:**
- En checkout, todo el formulario (nombre, negocio, etc.) está oculto hasta que el teléfono tiene ≥10 dígitos. Bien para guiar, pero si el cliente pega un número con extensión/país largo puede quedar confundido. La copy "* Precio sin IVA ni envío" es buena y honesta.
- El botón de éxito empuja a WhatsApp manual: razonable para el negocio, pero significa que el pedido NO está realmente "confirmado" hasta intervención humana — el cliente cree que terminó.

**Veredicto Apple/Stripe:** la UX pasaría; la capa de confianza del backend (precio del cliente, IDs sin validar, enumeración por substring) NO pasaría una revisión de seguridad de Stripe.

**Hallazgos (9):**

<details>
<summary><strong>[Alto] #13 — submitOrder confía en el precio enviado por el cliente y lo persiste</strong> · Seguridad · Imp 7/Cpx 3 · 2-3h</summary>

- **Archivo:** `src/app/order/actions.ts:213-216, 278-287`
- **Problema:** El precio unitario viene del cliente (OrderInput.items[].precio) y se usa tal cual para calcular `subtotal` y se guarda en `cotizacion_items.precio_unitario`. El portal envía el precio leído del DOM (order-catalog.tsx:262 `precio: i.producto.precio`), pero un atacante puede llamar la server action directamente (POST a la ruta de la action) con cualquier precio: 0, 1, o NEGATIVO. No hay validación de que `precio` sea finito, no-negativo, ni que coincida con el precio real del producto en `precios_producto`. Aunque la cotización nazca en 'borrador' y un humano la revise, (a) el subtotal/total mostrado se corrompe, (b) un precio negativo puede romper reportes/sumatorias, (c) si alguien confirma el borrador sin revisar línea por línea, se vende a precio inyectado. Esto es corrupción financiera explotable.
- **Recomendación:** La recomendación original es correcta y la mantengo, con dos precisiones:

1. Re-resolver precio server-side en submitOrder: hacer la MISMA query que page.tsx (productos + precios_producto donde listas_precios.nombre === 'Pública MXN'), construir un Map<producto_id, precioCanonico> e IGNORAR por completo input.items[].precio e input.items[].nombre. Calcular subtotal y precio_unitario solo con el precio canónico.

2. Validar cada item contra el catálogo permitido server-side: rechazar el pedido si algún producto_id (a) no existe, (b) no está activo, (c) no tiene precio>0 en 'Pública MXN', o (d) está oculto (aplicar ocultoEnCatalogoPublico de page.tsx — extraerla a un módulo compartido para no duplicar la lógica 5lt). Esto cierra además el vector de pedir SKUs ocultos por id directo.

Precisión adicional (más allá del hallazgo): el `nombre` mostrado en la notificación (actions.ts:308-309, 315) también viene del cliente; al re-resolver server-side, derivar el label del producto del catálogo, no del input, para evitar inyección de texto engañoso en la notificación interna.
- **Ejemplo:**

```
// Resolver precios reales en el server
const ids = input.items.map(i => i.producto_id)
const { data: prods } = await supabase.from('productos')
  .select('id, activo, precios_producto(precio, listas_precios(nombre))')
  .in('id', ids).eq('activo', true)
const precioReal = new Map<string, number>()
for (const p of prods ?? []) {
  const pr = p.precios_producto?.find(x => x.listas_precios?.nombre === 'Pública MXN')?.precio ?? 0
  if (pr > 0) precioReal.set(p.id, Number(pr))
}
for (const it of input.items) {
  if (!precioReal.has(it.producto_id))
    return { success: false, error: 'Producto no disponible' }
}
// usar precioReal.get(it.producto_id) en subtotal e insert, NO it.precio
```

- **Beneficio esperado:** Elimina la inyección de precios; las cotizaciones del portal siempre reflejan precios reales, evitando ventas a precio manipulado y reportes corruptos.
- **Verificación:** ajustado — CONFIRMADO el mecanismo, AJUSTADA la severidad de Crítico/9 a Alto/7.

Evidencia:
- src/app/order/actions.ts:21-26 — OrderInput.items[] incluye `precio: number` y `nombre: string` provenientes del cliente.
- src/app/order/actions.ts:213-216 — `subtotal = input.items.reduce((s,i)=> s + i.precio*i.cantidad, 0)` usa el precio del cliente tal cual. Este subtotal se inserta en cotizaciones (

</details>

<details>
<summary><strong>[Alto] #14 — Enumeración de clientes y fuga de PII vía búsqueda por teléfono (substring ilike)</strong> · Seguridad · Imp 7/Cpx 3 · 2-4h</summary>

- **Archivo:** `src/app/order/actions.ts:56-72`
- **Problema:** buscarClientePorTelefono usa `.ilike('telefono', '%' + digits + '%')` — match por SUBSTRING, no exacto. Con solo 10 dígitos cualquiera puede sondear: como es substring, un teléfono guardado con prefijo país (52..., +52 1...) hace match con sufijos parciales, y peor: la función DEVUELVE nombre, nombre_negocio, email y ciudad del cliente. Es una fuga directa de PII: dado un teléfono (o fragmento que matchee), un tercero obtiene el nombre del negocio + email del cliente. Combinado con el rate-limit de 20/min y la base chica (~pocos spas), se puede enumerar/scrapear toda la cartera de clientes probando rangos de números. El comentario del código dice 'match exacto' pero el código hace substring — discrepancia peligrosa.
- **Recomendación:** La recomendación original es acertada; la afino con detalle de implementación:
1) Match EXACTO sobre dígitos normalizados de AMBOS lados (no substring). En Postgres `telefono` puede venir con formato variado, así que comparar `regexp_replace(telefono,'\D','','g') = digits`. Como PostgREST no expresa eso directamente, lo más limpio es un RPC/función SQL `buscar_cliente_por_tel(digits text)` que normalice en la BD y compare por igualdad (idealmente sobre una columna/índice `telefono_normalizado` para evitar full scan). Evitar `ilike '%...%'` por completo.
2) Minimizar el PII devuelto al portal público: NO devolver email, ciudad ni teléfono. Para "¡Te reconocemos!" basta `{ reconocido: true, id, primerNombre }` (o solo el primer nombre del negocio). El auto-fill de email/ciudad es el vector de fuga — que el cliente reescriba esos campos. El `id` que se reusa en submitOrder es un UUID opaco, aceptable devolverlo, pero idealmente mantener el reuse server-side por teléfono normalizado y no exponer ni siquiera el id.
3) Bajar el rate-limit de buscarClientePorTelefono (línea 61) a ~5/min y exigir teléfono completo (ya exige 10 dígitos; con match exacto esto deja de ser enumerable por rangos).
4) Como el limiter in-memory no es distribuido (src/lib/rate-limit.ts:5-7), añadir regla de rate-limit en Vercel WAF sobre /order para una capa dura. Considerar también log/alerta ante ráfagas de lookups fallidos.
5) Aplicar el mismo cambio de match exacto en submitOrder (actions.ts:180) para consistencia y para no reintroducir el reuse cruzado de cliente por substring.
- **Ejemplo:**

```
// normalizar y comparar exacto (últimos 10 dígitos)
const norm = digits.slice(-10)
const { data } = await supabase.from('clientes')
  .select('id, nombre, nombre_negocio')
  .filter('telefono', 'ilike', '%' + norm)  // o columna normalizada
  .limit(1).maybeSingle()
// devolver SOLO { id, nombre, nombre_negocio } — no email/ciudad
```

- **Beneficio esperado:** Evita el scraping de la cartera de clientes y la fuga de email/ciudad/negocio a cualquiera con un número; alinea el código con su intención declarada de 'match exacto'.
- **Verificación:** ajustado — CONFIRMADO el núcleo técnico. src/app/order/actions.ts:68 — `.ilike("telefono", `%${digits}%`)` es match por SUBSTRING, no exacto. La discrepancia con el comentario es real y peligrosa: el docstring línea 50-51 dice "Devuelve SOLO el match exacto por teléfono completo (no permite listar clientes)" y línea 47 "match exacto", pero el código hace `%...%`. Validación previa: línea 56-57 `di

</details>

<details>
<summary><strong>[Alto] #28 — producto_id y clienteExistenteId no se validan: IDOR y reasignación de pedidos</strong> · Seguridad · Imp 6/Cpx 3 · 2-3h</summary>

- **Archivo:** `src/app/order/actions.ts:170-173, 278-287`
- **Problema:** (1) `clienteExistenteId` se acepta del cliente y se usa directo como `cliente_id` de la cotización (línea 170-173) sin verificar que sea un UUID válido ni que exista. Un atacante puede pasar el UUID de CUALQUIER cliente (incluido el interno Piel Canela 08449791-...) y crear cotizaciones a su nombre, ensuciando su historial y, peor, el consecutivo `generarNumeroEstandar` cuenta sus cotizaciones reales → puede inflar/alterar la numeración de un cliente legítimo. (2) `producto_id` se inserta en cotizacion_items sin validar que exista/esté activo: con FK fallará si el UUID no existe, pero permite inyectar productos OCULTOS del catálogo público (5lt mayoreo) que el portal nunca debería cotizar, o productos inactivos. Es un IDOR clásico: el cliente controla referencias a objetos sin autorización.
- **Recomendación:** En submitOrder, antes de insertar, re-derivar TODO server-side en vez de confiar en el cliente: (1) clienteExistenteId: validar formato UUID y hacer SELECT id, is_internal FROM clientes; reusar solo si existe y is_internal=false; si no, ignorar y caer al match por teléfono (actions.ts:176-187). NUNCA permitir asignar a un cliente interno desde el portal. (2) producto_id Y precio: cargar una sola vez el catálogo público real (mismo filtro que page.tsx: activo=true, precio Pública MXN>0, !ocultoEnCatalogoPublico) en un Map<id, {precio}>; rechazar cualquier item cuyo producto_id no esté en ese Map; e IGNORAR item.precio del cliente, usando SIEMPRE el precio del Map para subtotal (línea 214) y precio_unitario (línea 283). Esto cierra de paso la manipulación de precios no detectada por el auditor.
- **Ejemplo:**

```
if (input.clienteExistenteId) {
  const { data: cli } = await supabase.from('clientes')
    .select('id, is_internal').eq('id', input.clienteExistenteId).maybeSingle()
  if (cli && !cli.is_internal) { clienteId = cli.id; reconocido = true }
  // si no existe o es interno → ignorar, seguir flujo normal
}
```

- **Beneficio esperado:** Cierra el IDOR: nadie puede crear pedidos a nombre de otro cliente ni meter SKUs fuera del catálogo público; protege la numeración y el cliente interno.
- **Verificación:** ajustado — CONFIRMADO el mecanismo del IDOR, AJUSTADA la severidad de Crítico→Alto.

(1) clienteExistenteId sin validar: src/app/order/actions.ts:29 lo declara como input opcional; líneas 170-173 lo asignan directo a clienteId (clienteId = input.clienteExistenteId) sin verificar formato UUID, existencia, ni is_internal. Fluye a cotizaciones.cliente_id (línea 255) y a generarNumeroEstandar() que cu

</details>

<details>
<summary><strong>[Alto] #31 — Rate-limit por IP es evadible (x-forwarded-for falsificable, no distribuido)</strong> · Seguridad · Imp 6/Cpx 4 · 3-6h</summary>

- **Archivo:** `src/lib/rate-limit.ts:69-75`
- **Problema:** clientIp toma `x-forwarded-for`.split(',')[0] tal cual. En Vercel ese header lo fija el edge, PERO la confianza depende de que no se acepte el header del usuario. Un atacante puede rotar x-forwarded-for (o IPs reales con proxies baratos) para resetear el bucket por-IP en cada request, anulando ambos límites (cliente-lookup 20/min y order 10/h). Además el Map es por-instancia (no distribuido): con Fluid Compute múltiples instancias multiplican el límite efectivo. Sin un WAF/captcha encima, el endpoint de escritura público (submitOrder) y el de enumeración (buscarClientePorTelefono) son abusables a escala. El propio comentario admite que es best-effort.
- **Recomendación:** 1) Añadir una regla de rate-limit en Vercel WAF sobre /order (cubre ambas actions a nivel edge, antes de la función, y usa la IP real verificada). 2) Para anti-spam de escritura, agregar Cloudflare Turnstile / hCaptcha invisible en el checkout (1 token validado server-side en submitOrder). 3) En clientIp, en producción confiar solo en el primer valor de x-forwarded-for que Vercel garantiza, y documentar que no se debe usar para decisiones de seguridad duras sin WAF.
- **Beneficio esperado:** Convierte el rate-limit de cosmético a real: frena enumeración de clientes y spam de pedidos a escala, protegiendo la BD y el costo de funciones.
- **Verificación:** confirmado — Confirmado contra el código. src/lib/rate-limit.ts:69-75 — clientIp() devuelve `h.get("x-forwarded-for")?.split(",")[0]?.trim()`, es decir el PRIMER valor de la lista. En Vercel ese primer valor es el que controla el cliente (Vercel agrega/garantiza la IP real en x-real-ip / al final de la cadena, no al inicio), así que un atacante que envía su propio header `x-forwarded-for` controla

</details>

<details>
<summary><strong>[Medio] #58 — Falta validación/sanitización de formato de email, teléfono y longitud de campos</strong> · Seguridad · Imp 5/Cpx 2 · 2h</summary>

- **Archivo:** `src/app/order/actions.ts:139-155, 190-211`
- **Problema:** submitOrder solo valida que nombre y telefono no estén vacíos. No valida: formato de email (se guarda cualquier string como email del cliente), formato/longitud de teléfono (acepta '1234567890123456789...' o letras), ni longitud máxima de nombre/negocio/ciudad/notas. Un atacante puede inyectar campos enormes (DoS suave de almacenamiento) o basura. Las notas se concatenan a un string libre que luego se muestra en el ERP y en la notificación (datos JSON) — si en el futuro se renderiza sin escape, es un vector de XSS almacenado. Hoy React escapa, pero el dato sucio queda persistido para siempre y contamina la cartera de clientes con registros inválidos.
- **Recomendación:** Validar y truncar en submitOrder: email con regex básica (o vaciar si no matchea), teléfono solo dígitos con largo 10-15, nombre/negocio/ciudad max ~120 chars, notas max ~1000. Considerar zod para el OrderInput completo. Esto también protege contra el caso donde la action se llama fuera del form del portal.
- **Ejemplo:**

```
const clean = (s: string, max: number) => s.trim().slice(0, max)
const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const email = emailOk.test(input.cliente.email.trim()) ? input.cliente.email.trim() : null
if (telDigits.length < 10 || telDigits.length > 15) return { success:false, error:'Teléfono inválido' }
// usar clean(nombre,120), clean(notas,1000), etc.
```

- **Beneficio esperado:** Datos limpios y acotados en la cartera de clientes; reduce superficie de inyección y registros basura; defensa en profundidad si la action se invoca fuera del form.

</details>

<details>
<summary><strong>[Medio] #111 — Número de orden del portal usa Math.random sin chequeo de colisión</strong> · Base de datos · Imp 4/Cpx 2 · 1h</summary>

- **Archivo:** `src/app/order/actions.ts:232-236`
- **Problema:** Para clientes NO reconocidos, el número es `PC-DDMMYY + rand(100-999) + -P-Portal` con `Math.floor(Math.random()*900)+100`. Solo 900 valores posibles por día y NO se verifica que el número no exista ya (a diferencia de generarNumeroEstandar que sí usa numeroOrdenExiste con loop). Con ~30 pedidos nuevos en un día la probabilidad de colisión es ~40% (paradoja del cumpleaños). Si `cotizaciones.numero` tiene UNIQUE, el insert falla y el cliente ve un error genérico tras llenar todo el checkout (mala UX + pedido perdido). Si NO tiene UNIQUE, hay dos cotizaciones con el mismo número → confusión en el ERP y en la referencia que el cliente manda por WhatsApp.
- **Recomendación:** La recomendación original es buena; la más simple y consistente con el resto del código es reutilizar el helper que ya existe. Envolver la generación del número de portal en el mismo loop anti-colisión:

let numero = "";
for (let i = 0; i < 50; i++) {
  const rand = Math.floor(Math.random() * 900) + 100;
  const cand = `PC-${dd}${mm}${yy}${rand}-P-Portal`;
  if (!(await numeroOrdenExiste(supabase, cand))) { numero = cand; break; }
}
if (!numero) numero = `PC-${dd}${mm}${yy}${Date.now().toString().slice(-5)}-P-Portal`; // fallback ancho

Adicionalmente (independiente del fix de colisión): manejar el error de insert de duplicado en actions.ts:270-275 con un mensaje amable al cliente en vez de exponer errCot.message crudo. Y considerar agregar el UNIQUE en cotizaciones.numero (igual que ventas_numero_unique) para que la BD sea la última línea de defensa — sin eso, las colisiones quedan silenciosas.
- **Ejemplo:**

```
let numero = ''
for (let i = 0; i < 50; i++) {
  const rand = Math.floor(Math.random()*9000)+1000
  numero = 'PC-' + dd+mm+yy + rand + '-P-Portal'
  if (!(await numeroOrdenExiste(supabase, numero))) break
}
```

- **Beneficio esperado:** Elimina colisiones de número de pedido del portal, evitando inserts fallidos visibles al cliente y referencias duplicadas en el ERP.
- **Verificación:** ajustado — CONFIRMADO el defecto técnico, AJUSTADA la severidad de Alto(6) a Medio(4).

Evidencia del código:
- src/app/order/actions.ts:235-236 — rama de cliente NO reconocido: `const rand = Math.floor(Math.random() * 900) + 100; numero = \`PC-${dd}${mm}${yy}${rand}-P-Portal\``. Sin verificación de colisión. Exactamente 900 valores posibles por día (100-999).
- src/app/order/actions.ts:112-116 (g

</details>

<details>
<summary><strong>[Medio] #128 — El stock se muestra pero no se valida/reserva en submitOrder (oversell silencioso)</strong> · Lógica de negocio · Imp 4/Cpx 3 · 2-3h</summary>

- **Archivo:** `src/app/order/actions.ts:149-155, 278-287`
- **Problema:** El catálogo marca 'Agotado' y bloquea addToCart cuando stock<=0 (order-catalog.tsx:181-182), pero submitOrder NO revalida stock server-side: acepta cantidad hasta 10,000 por ítem sin comparar contra stock_actual. Como la página es force-dynamic el stock está fresco al cargar, pero entre carga y submit puede agotarse, o un atacante llama la action directo pidiendo 10,000 de un producto con stock 3. El pedido entra como borrador y un humano lo revisa, así que no hay venta directa, pero genera cotizaciones imposibles y un cliente que cree que pidió algo disponible. La cantidad máxima 10,000 por línea × 50 líneas también es un payload absurdo permitido.
- **Recomendación:** En submitOrder, leer vista_inventario para los producto_id del pedido y rechazar (o capar con aviso) ítems cuya cantidad supere stock_actual. Como el flujo es 'borrador para revisión', basta con marcar/advertir; si se quiere estricto, rechazar líneas sin stock. Bajar el tope por línea a algo realista (p.ej. 500).
- **Beneficio esperado:** Evita cotizaciones imposibles desde el portal y alinea lo que el cliente ve (agotado) con lo que el server acepta.

</details>

<details>
<summary><strong>[Medio] #150 — El éxito promete 'pedido recibido' pero no hay tracking ni confirmación automática</strong> · UX · Imp 4/Cpx 5 · 1-2d</summary>

- **Archivo:** `src/app/order/success/page.tsx:29-49`
- **Problema:** La pantalla de éxito da un 'número de referencia' y empuja a confirmar manualmente por WhatsApp. No existe ninguna página donde el cliente consulte el estado de ese número, ni se envía email/SMS de confirmación automático. El pedido queda como 'borrador' interno hasta que un humano lo procese. Para el cliente, el número de referencia es decorativo (no consultable) y el 'pedido' realmente no está confirmado hasta intervención humana. Esto genera expectativa incorrecta ('Te contactaremos en menos de 24 horas' es una promesa sin SLA automatizado).
- **Recomendación:** Mínimo viable: enviar email/WhatsApp de confirmación automático al cliente al crear el pedido (si dio email). Medio plazo: una página de tracking pública /order/track?ref=... que muestre estado (recibido → cotizado → confirmado) consultando por número + último-4-dígitos del teléfono como anti-IDOR. Ajustar la copy para no prometer SLA que no se cumple automáticamente.
- **Beneficio esperado:** Cierra el loop de confianza del cliente, reduce mensajes de '¿llegó mi pedido?' y profesionaliza el portal.

</details>

<details>
<summary><strong>[Bajo] #183 — Insert de cliente nuevo no maneja carrera/duplicados por teléfono</strong> · Base de datos · Imp 3/Cpx 3 · 2-3h</summary>

- **Archivo:** `src/app/order/actions.ts:176-211`
- **Problema:** El flujo busca cliente por teléfono y, si no encuentra, inserta uno nuevo. Sin UNIQUE en telefono ni ON CONFLICT, dos pedidos casi simultáneos del mismo cliente nuevo (doble submit, dos pestañas) crean dos filas cliente duplicadas — exactamente lo que la feature 'anti-duplicados' intenta evitar. Además la búsqueda por substring (ilike %digits%) puede 'reconocer' por error a otro cliente cuyo teléfono contenga esos dígitos, asignándole el pedido al cliente equivocado.
- **Recomendación:** Añadir índice UNIQUE sobre teléfono normalizado y usar upsert/ON CONFLICT, o re-consultar dentro de una transacción. Cambiar la búsqueda a match exacto normalizado (ver hallazgo de enumeración) para no reconocer al cliente equivocado.
- **Beneficio esperado:** Evita clientes duplicados y pedidos asignados al cliente equivocado por coincidencia parcial de dígitos.

</details>


### Shell, navegación y notificaciones

El shell es funcional y visualmente pulido (sidebar glass, header KPI premium, login con rate-limit + comparación en tiempo constante, drawer móvil correcto), pero está lejos del nivel Linear/Notion en navegación e interacción. Faltan piezas estructurales: no hay búsqueda global ni command palette (⌘K), no hay atajos de teclado, no hay breadcrumbs en el shell (sólo opt-in por página), y el "perfil de usuario" está hardcodeado a "Benjamín". El sistema de notificaciones funciona pero usa polling cada 8s a tabla completa siempre activo, no es realtime, y mezcla dos UIs de notificación inconsistentes (campana + PortalBadge) que consultan datos distintos. Hay deuda de accesibilidad real (sin aria-current en nav activo, login sin region de error en vivo, sin prefers-reduced-motion) y deuda de consistencia de UI (componentes base shadcn/ui prácticamente sin usar; todo el shell usa estilos inline). Nada es crítico para 2-3 usuarios internos hoy, pero la ausencia de búsqueda/command-K y el polling permanente son los mayores obstáculos para escalar.

**¿Completo?** El shell cubre lo mínimo: navegación lateral, login, logout, notificaciones, header. Pero le faltan piezas que cualquier ERP/CRM de clase mundial da por sentadas:

- **Búsqueda global AUSENTE.** `grep` confirma cero componentes de búsqueda en `src/components`. En un ERP con ventas, cotizaciones, clientes, productos y pedidos, no poder saltar a "cotización PC-42" o "Shams Bronceado" desde cualquier pantalla es la fricción #1. HubSpot, Stripe y Linear tienen búsqueda omnipresente.
- **Command palette (⌘K) AUSENTE.** El único `metaKey` en el repo está en `spreadsheet-items.tsx` (Excel paste), no en el shell. Para power-users internos que viven en la app todo el día, ⌘K para "nueva venta / nueva cotización / ir a cliente X" multiplicaría la velocidad.
- **Atajos de teclado AUSENTES** en navegación y acciones.
- **Breadcrumbs sólo opt-in.** `page-header.tsx:74` soporta `breadcrumb` pero cada página debe pasarlo manualmente; el shell no deriva la jerarquía del pathname. Resultado: navegación inconsistente entre módulos.
- **Perfil de usuario falso.** `(dashboard)/layout.tsx:138-142` hardcodea avatar "B" y nombre "Benjamín". Si Sandra entra, ve "Benjamín". El JWT (`auth.ts`) ni siquiera lleva identidad de usuario (`{ role: "erp" }`), así que no hay a quién mostrar — el login compartido lo impide por diseño.
- **Ayuda / onboarding AUSENTES.** No hay "?" ni docs ni atajos visibles.

**¿Qué sobra / qué confunde?**
- **Dos sistemas de notificación paralelos e inconsistentes.** `NotificationBell` (campana en sidebar, tabla `notificaciones`, polling 8s) y `PortalBadge` (badge rojo sobre un KPI del dashboard, prop `cotizaciones` server-rendered). Ambos muestran "pedidos del portal" pero con datos, estilos y comportamiento distintos. El usuario ve el mismo evento en dos lugares con conteos potencialmente divergentes.
- **Estilos inline masivos.** Todo el shell (sidebar, notif panel, login, portal-badge) está construido con `style={{...}}` inline en vez de los componentes `Button`/`GlassCard` que existen. `button.tsx` (base-ui + cva, bien hecho) está esencialmente sin usar en el shell. Esto es lo opuesto a un design system consistente.

**¿Qué simplificar / automatizar?**
- El polling de notificaciones debería ser realtime (Supabase Realtime con un canal server-authenticated, o al menos pausar cuando no hay foco — hoy sólo refetchea al volver, pero el intervalo de 8s corre indefinidamente).
- Breadcrumbs y `<title>` por página deberían derivarse del router automáticamente.

**¿Qué haría la IA aquí?** Un command palette con búsqueda semántica sobre clientes/ventas/productos + acciones ("crea cotización para Mithra con 10 cintas 9mm") sería el salto de clase mundial. Hoy no existe la infraestructura.

**Veredicto de marca:** Apple/Linear NO aprobarían: navegación sin command-K ni búsqueda, identidad de usuario falsa, dos sistemas de notificación, y a11y incompleta. Stripe/HubSpot tampoco enviarían un ERP sin búsqueda global. La capa visual sí está cerca del estándar; la capa de interacción y arquitectura de navegación, no.

**Hallazgos (12):**

<details>
<summary><strong>[Medio] #71 — Componentes UI base (Button/GlassCard) sin usar — shell construido con estilos inline</strong> · Mantenibilidad · Imp 5/Cpx 4 · 1-2d</summary>

- **Archivo:** `src/components/ui/button.tsx:6-41`
- **Problema:** Existe un Button bien hecho (base-ui + cva con variantes default/outline/ghost/destructive y tamaños), pero el shell no lo usa: login (page.tsx:102), logout-button.tsx:9, sidebar-nav.tsx, notifications.tsx y portal-badge.tsx construyen botones a mano con style inline y handlers onMouseEnter/onMouseLeave para hover. Lo mismo con GlassCard, que no se usa en el footer del sidebar pese a ser exactamente un glass card. Resultado: cero consistencia de design system, hover gestionado por JS en vez de CSS, y duplicación de tokens de color hex por todo el shell.
- **Recomendación:** Migrar botones del shell a <Button variant=...> y tarjetas glass a <GlassCard>. Reemplazar los onMouseEnter/onMouseLeave que mutan style por clases hover: de Tailwind (ya se usan en sidebar parcialmente). Centralizar la paleta amatista/teal en CSS variables (ya existen --am-* en globals) en vez de hex repetidos.
- **Beneficio esperado:** Consistencia visual, menos código, hover accesible por CSS, theming centralizado, base para escalar la UI.

</details>

<details>
<summary><strong>[Medio] #83 — Notificaciones por polling cada 8s a tabla completa, siempre activo y no realtime</strong> · Escalabilidad · Imp 5/Cpx 5 · 1-2d</summary>

- **Archivo:** `src/components/notifications.tsx:134-151`
- **Problema:** refetchNuevas() corre cada 8s vía setInterval indefinidamente mientras la pestaña está abierta, ejecutando getNotificacionesNoLeidas() que hace un SELECT * de notificaciones (notifications-actions.ts:38-51, trae todas las columnas incluyendo PII). Con 2-3 usuarios es ~3000 requests/día/usuario aunque no pase nada. No es push/realtime: hay latencia de hasta 8s y carga constante en el servidor + Supabase. El comentario justifica que con RLS no se puede usar el anon key por websocket, pero Supabase Realtime se puede autorizar server-side o con un canal dedicado.
- **Recomendación:** Opción mínima: aumentar el intervalo a 20-30s y hacer SELECT sólo de columnas usadas (id, tipo, titulo, mensaje, datos, leida, created_at ya es *; restringir) y filtrar por created_at > último visto para no re-traer todo. Opción correcta: Supabase Realtime con postgres_changes en un canal server-authenticated, o un endpoint SSE. También pausar el setInterval cuando document.hidden (hoy sólo refetchea al volver, pero el intervalo sigue corriendo).
- **Ejemplo:**

```
// pausar polling en background
const onVis = () => {
  if (document.hidden) { clearInterval(polling); polling = null }
  else if (!polling) { void refetchNuevas(); polling = setInterval(refetchNuevas, 15000) }
}
```

- **Beneficio esperado:** Menos carga constante, latencia de notificación casi cero, mejor escalabilidad a más usuarios/eventos.

</details>

<details>
<summary><strong>[Medio] #84 — Dos sistemas de notificación paralelos e inconsistentes (campana vs PortalBadge)</strong> · UX · Imp 5/Cpx 5 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/portal-badge.tsx:27-86`
- **Problema:** Coexisten dos UIs para el mismo evento ('pedido del portal'): NotificationBell (campana en el footer del sidebar, fuente = tabla notificaciones, polling 8s, panel oscuro vía portal) y PortalBadge (badge rojo sobre un KPI del dashboard en page.tsx:549, fuente = prop cotizaciones server-rendered, dropdown oscuro propio). Tienen estilos casi idénticos pero código duplicado (formatPhoneIntl, dropdown WhatsApp, mxn0 repetidos), datos potencialmente divergentes (la campana sólo cuenta no-leídas; el badge cuenta cotizaciones del portal) y conteos que pueden no coincidir. Confunde sobre cuál es la fuente de verdad.
- **Recomendación:** Consolidar en un solo centro de notificaciones (la campana). Eliminar PortalBadge o reducirlo a un deep-link que abra la campana. Extraer formatPhoneIntl/whatsappUrl/mxn0 a un util compartido (hoy duplicados en notifications.tsx y portal-badge.tsx).
- **Beneficio esperado:** Una sola fuente de verdad, conteos consistentes, menos código duplicado, UX más clara.

</details>

<details>
<summary><strong>[Medio] #96 — No existe búsqueda global en todo el shell</strong> · UX · Imp 5/Cpx 6 · 3-5d</summary>

- **Archivo:** `src/components/sidebar-nav.tsx:15-23`
- **Problema:** El sidebar sólo tiene 7 links de módulo y no hay ningún componente de búsqueda en src/components (grep confirma cero). En un ERP/CRM con ventas, cotizaciones, clientes, productos y pedidos, no hay forma de saltar directo a 'cotización PC-42' o 'cliente Shams' desde cualquier pantalla. Es la fricción de navegación más grande de la app y el patrón base de Linear/Stripe/HubSpot/Notion. Escala mal: con 100+ ventas/clientes la navegación por listas se vuelve insostenible.
- **Recomendación:** Agregar un command palette (⌘K) en el shell del dashboard, montado en (dashboard)/layout.tsx junto a NotificationBell. Implementación alineada a las reglas del repo: (1) server action en un actions.ts con createAdminClient() (NO browser/anon client) que haga búsqueda unificada sobre clientes (nombre + nombre_negocio), cotizaciones y ventas (numero PC-\d+), productos (nombre/nombre_display/SKU) y pedidos; (2) input con debounce (~250ms) y límite (p.ej. 8 por categoría) para no traer todo; (3) en los resultados de clientes/cotizaciones/ventas, marcar o excluir el cliente interno Piel Canela (08449791-...) usando getInternalClienteIds() para no contaminar resultados financieros; (4) cada resultado navega a la ruta de detalle existente (/clientes/[id], /cotizaciones/[id], /ventas/[id], /pedidos/[id], /inventario). Usar cmdk (compatible con shadcn) para accesibilidad de teclado. Priorizar como mejora de productividad de severidad Media, no como bloqueo.
- **Ejemplo:**

```
// server action
export async function buscarGlobal(q: string) {
  const s = createAdminClient()
  const [cots, clientes, ventas] = await Promise.all([
    s.from('cotizaciones').select('id,numero,total').ilike('numero', `%${q}%`).limit(5),
    s.from('clientes').select('id,nombre,nombre_negocio').or(`nombre.ilike.%${q}%,nombre_negocio.ilike.%${q}%`).limit(5),
    s.from('ventas').select('id,numero_orden').ilike('numero_orden', `%${q}%`).limit(5),
  ])
  return { cots: cots.data, clientes: clientes.data, ventas: ventas.data }
}
```

- **Beneficio esperado:** Reduce a 1-2 segundos lo que hoy toma navegar lista + filtrar. Habilita el uso de power-user diario que es el modo real de operación.
- **Verificación:** ajustado — Hechos confirmados. src/components/sidebar-nav.tsx:15-23 define exactamente 7 links de módulo (Dashboard, Inventario, Cotizaciones, Ventas, Clientes, Pedidos, Finanzas) sin ningún input de búsqueda. El shell (src/app/(dashboard)/layout.tsx:1-60) solo monta SidebarNav + NotificationBell + LogoutButton; grep de "header|topbar|<input" en el layout no devuelve nada. ls src/components: solo 

</details>

<details>
<summary><strong>[Medio] #97 — No hay command palette (⌘K) ni atajos de teclado en el shell</strong> · UX · Imp 5/Cpx 6 · 3-4d</summary>

- **Archivo:** `src/app/(dashboard)/layout.tsx:35-160`
- **Problema:** El layout no registra ningún listener de teclado global. El único metaKey del repo está en cotizaciones/spreadsheet-items.tsx:143 (paste de Excel), no en navegación. Para usuarios internos que viven en la app, la ausencia de ⌘K (ir a módulo, nueva venta, nueva cotización, buscar cliente) y de atajos es lo que más separa a esta app de Linear/Notion/Superhuman. Acciones frecuentes como 'crear venta' requieren navegar + click.
- **Recomendación:** La recomendación original es buena y técnicamente correcta (montar CommandDialog de shadcn/cmdk en (dashboard)/layout.tsx, abierto con ⌘K/Ctrl+K vía useEffect con listener global). Refinamientos: (1) Encapsular en su propio client component <CommandPalette/> en vez de inflar el layout, ya que layout.tsx ya es 'use client' pero conviene aislar la lógica; (2) Las acciones de navegación pueden derivarse de la misma fuente que SidebarNav para no duplicar rutas; (3) Búsqueda global de clientes/ventas requiere un server action (los datos viven detrás del service_role, el browser anon ya no tiene acceso por RLS) — no consultarlo desde el cliente directamente. Priorizar como mejora de pulido, no urgente.
- **Ejemplo:**

```
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(true) }
  }
  document.addEventListener('keydown', onKey)
  return () => document.removeEventListener('keydown', onKey)
}, [])
```

- **Beneficio esperado:** Salto de velocidad de power-user; alinea la app con el estándar de productividad moderno. Reutiliza la server action de búsqueda global.
- **Verificación:** ajustado — Confirmado el hecho central: src/app/(dashboard)/layout.tsx (1-160) NO registra ningún listener de teclado global — sus dos useEffect solo manejan el drawer móvil (cierre por cambio de ruta, bloqueo de scroll del body). No hay CommandDialog ni dependencia cmdk en el repo. Verificación de todos los keydown/metaKey del codebase: son listeners LOCALES, no de navegación: Escape-para-cerrar 

</details>

<details>
<summary><strong>[Medio] #112 — Navegación activa sin aria-current y a11y incompleta en el shell</strong> · Accesibilidad · Imp 4/Cpx 2 · 0.5d</summary>

- **Archivo:** `src/components/sidebar-nav.tsx:33-78`
- **Problema:** El link activo del sidebar se distingue sólo por color/peso/sombra pero no expone aria-current='page' (grep confirma cero aria-current en src). Lectores de pantalla no saben en qué sección estás. Además el color de link inactivo es rgba(0,0,0,0.55) sobre fondo glass claro, contraste bajo (riesgo WCAG AA). En login (page.tsx:89-100) el bloque de error no es aria-live, así que un usuario con lector no es notificado del error de contraseña.
- **Recomendación:** Añadir aria-current={active ? 'page' : undefined} en el Link del sidebar. En login, envolver el error en role='alert' / aria-live='assertive'. Subir el contraste del texto inactivo a ~0.62-0.7 alpha o un slate sólido. Verificar contraste de los textos del panel de notificaciones (rgba blancos muy bajos como 0.25/0.30) contra AA.
- **Ejemplo:**

```
<Link aria-current={active ? 'page' : undefined} ...>
// login:
{state.error && <p role="alert" aria-live="assertive" ...>{state.error}</p>}
```

- **Beneficio esperado:** Cumplimiento WCAG AA, navegación usable con lector de pantalla, errores anunciados.

</details>

<details>
<summary><strong>[Medio] #138 — Perfil de usuario hardcodeado a 'Benjamín' — Sandra ve identidad incorrecta</strong> · UX · Imp 4/Cpx 4 · 0.5-1d</summary>

- **Archivo:** `src/app/(dashboard)/layout.tsx:130-143`
- **Problema:** El footer del sidebar pinta avatar 'B' y nombre 'Benjamín' literalmente en el JSX. Como el login es contraseña compartida y el JWT sólo lleva { role: 'erp' } (auth.ts:32), no hay identidad de sesión, así que Sandra (la otra socia) verá 'Benjamín' al entrar. Para un ERP de 2 socias 50/50 esto es desconcertante y poco profesional. También impide cualquier futura atribución de acciones por usuario.
- **Recomendación:** Mínimo: reemplazar por una identidad neutra ('Piel Canela' / iniciales de la marca) hasta que haya login por usuario. Mejor: introducir selección de usuario al login (Sandra/Benjamin) guardada en el JWT, mostrando el nombre real y habilitando atribución. Esto también desbloquea métricas por socio.
- **Ejemplo:**

```
// auth.ts: incluir quién es
new SignJWT({ role: 'erp', user: chosenUser })
```

- **Beneficio esperado:** Evita mostrar identidad incorrecta; base para atribución de acciones y multi-usuario real.

</details>

<details>
<summary><strong>[Bajo] #187 — Breadcrumbs no se derivan del shell; cada página debe pasarlos a mano</strong> · Arquitectura · Imp 3/Cpx 4 · 1d</summary>

- **Archivo:** `src/components/page-header.tsx:74-88`
- **Problema:** PageHeader soporta breadcrumb como prop opcional, pero el shell no genera la jerarquía a partir del pathname. Esto garantiza inconsistencia: unas pantallas tendrán breadcrumb y otras no, según se acuerde el desarrollador. En rutas anidadas (/ventas/[id]/editar) la orientación se pierde si no se pasa.
- **Recomendación:** Derivar breadcrumbs automáticamente del segmento de ruta en el shell o en un wrapper, con un mapa de labels por ruta, permitiendo override por página para nombres dinámicos (PC-42). Así todo el ERP tiene breadcrumbs consistentes sin esfuerzo por página.
- **Beneficio esperado:** Navegación consistente en todos los módulos, mejor orientación en rutas profundas.

</details>

<details>
<summary><strong>[Bajo] #193 — Animaciones del shell ignoran prefers-reduced-motion</strong> · Accesibilidad · Imp 2/Cpx 1 · 0.5d</summary>

- **Archivo:** `src/components/notifications.tsx:196-202`
- **Problema:** El shell usa animaciones (barra de progreso del toast pc-shrink 8s linear en notifications.tsx:199, transiciones del drawer móvil, hover -translate-y en GlassCard, drop-shadow pulsante en sidebar) pero grep confirma que globals.css no tiene ninguna media query prefers-reduced-motion. Usuarios con sensibilidad al movimiento no tienen escape.
- **Recomendación:** Agregar en globals.css un bloque @media (prefers-reduced-motion: reduce) que neutralice animaciones/transiciones globalmente.
- **Ejemplo:**

```
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
}
```

- **Beneficio esperado:** Respeta preferencias de accesibilidad del sistema; estándar de productos serios.

</details>

<details>
<summary><strong>[Bajo] #194 — panelRef quedó muerto tras migrar el panel a createPortal</strong> · Mantenibilidad · Imp 2/Cpx 1 · 15m</summary>

- **Archivo:** `src/components/notifications.tsx:79-79`
- **Problema:** panelRef se declara (línea 79) y se asigna al div wrapper del bell (línea 258), pero el cierre por click-fuera ya no lo usa: el handler (líneas 156-161) detecta por [data-notif-panel] + bellRef porque el panel ahora vive en document.body vía createPortal. panelRef es código muerto que confunde sobre cómo funciona el cierre.
- **Recomendación:** Eliminar panelRef y el ref={panelRef} del wrapper, o documentar por qué se conserva. Limpieza menor.
- **Beneficio esperado:** Menos confusión, código más limpio.

</details>

<details>
<summary><strong>[Bajo] #197 — El <title> del documento es estático en toda la app</strong> · UX · Imp 2/Cpx 2 · 0.5d</summary>

- **Archivo:** `src/app/layout.tsx:11-14`
- **Problema:** metadata.title = 'Piel Canela ERP' es el único título del proyecto (grep confirma que ninguna página bajo (dashboard) exporta metadata ni generateMetadata). Todas las pestañas del navegador se ven idénticas, lo que rompe el cambio entre pestañas, el historial y los marcadores. Linear/Notion titulan cada vista.
- **Recomendación:** Definir un title template en el root (title: { template: '%s · Piel Canela', default: 'Piel Canela ERP' }) y exportar metadata por página/módulo (Ventas, Inventario, etc.), o generateMetadata en rutas dinámicas (ej. 'Cotización PC-42').
- **Ejemplo:**

```
export const metadata = { title: { template: '%s · Piel Canela', default: 'Piel Canela ERP' } }
```

- **Beneficio esperado:** Pestañas, historial y marcadores distinguibles; mejor orientación del usuario.

</details>

<details>
<summary><strong>[Bajo] #199 — El toast de notificación se posiciona fixed top-right y puede solaparse con el toast global de sonner</strong> · UI · Imp 2/Cpx 3 · 0.5d</summary>

- **Archivo:** `src/components/notifications.tsx:193-195`
- **Problema:** El toast custom de nueva notificación se renderiza fixed top-4 right-4 z-[100]. El <Toaster/> de sonner (layout.tsx:28) por defecto también vive en la esquina superior/inferior derecha. Si llega una notificación del portal al mismo tiempo que un toast de sonner (ej. tras guardar algo), se solapan o compiten por el espacio. Son dos sistemas de toast independientes.
- **Recomendación:** Unificar usando sonner para el toast de nueva notificación (toast.custom con el mismo contenido) en vez de un toast hecho a mano, así hay un solo stack gestionado y sin colisiones de posición/z-index.
- **Beneficio esperado:** Sin solapamientos, un solo sistema de toasts, menos código.

</details>


### Arquitectura y mantenibilidad

El proyecto está bien organizado a nivel de rutas (App Router con grupo (dashboard), server actions por módulo, separación server/client correcta) y tiene aciertos notables: middleware fail-closed, headers de seguridad, RPC atómico para descuento de inventario, y un patrón de exclusión de cliente interno bien encapsulado. Sin embargo arrastra deuda técnica estructural seria para escalar: NO hay capa de acceso a datos (queries Supabase crudas regadas en ~30 archivos), NO hay tipos generados de Supabase (todo casteado a mano con `as {}`), CERO try/catch y cero observabilidad en server actions, y varias mutaciones multi-paso sin transacción que pueden dejar datos huérfanos (venta sin items, cotización del portal sin items, stock con read-modify-write race-prone). Hay duplicación masiva y de bajo costo de eliminar: 42 formateadores de moneda reinventados pese a existir `formatMXN` en utils, IDs de socios hardcodeados en 6 archivos, IVA 0.16 en 5 lugares. Cuatro dependencias instaladas (react-hook-form, @hookform/resolvers, zod, @radix-ui/react-slot) no se usan en absoluto — y la ausencia de zod es la causa raíz de que ninguna server action valide su input. God components de 1.5k-2.2k líneas (clientes-dashboard, cotizaciones-list, ventas-table-premium) concentran tabla+filtros+modales+lógica de negocio. README y AGENTS son plantillas sin contenido real del proyecto, y no existe ni un solo test ni boundaries error.tsx/loading.tsx. Apple/Linear/Stripe no aprobarían el estado de validación, tipado de datos y manejo de errores; sí aprobarían la disciplina de rutas y seguridad.

**¿Completo?** Funcionalmente sí para 2-3 usuarios internos. Estructuralmente le falta la columna vertebral de un producto que escale: capa de datos tipada, validación de entrada, manejo de errores observable y tests.

**¿Qué falta?**
- Tipos generados de Supabase (`database.types.ts` vía `supabase gen types`). Hoy cada query se castea a mano (`as { is_internal?: boolean }`), lo que silencia drift de esquema. Un rename de columna en la BD no rompe el build, rompe en producción.
- Una capa `src/lib/data/` o `src/services/` (repositorio) que centralice las queries. Hoy `from("ventas")`, `from("clientes")`, etc. están repetidas en server components, server actions y hasta en otros server actions (`getInternalClienteIds` se llama por separado en 3+ sitios).
- Validación de input en server actions con zod (que YA está instalado). `saveVenta`, `submitOrder`, `crearPedido` confían en el shape del input sin validar; el portal `/order` es público y solo tiene checks manuales sueltos.
- Manejo de errores: 0 try/catch en los 7 actions.ts. Si Supabase lanza (no devuelve `{error}` sino throw — p.ej. timeout de red), el server action revienta con stack al cliente. No hay logging estructurado ni Sentry/observabilidad.
- Carpetas `src/hooks`, `src/types`, `src/services` no existen (sí están aliased en components.json y tsconfig pero vacías).
- `error.tsx`, `loading.tsx`, `not-found.tsx`: ninguno en toda la app. Cualquier excepción no capturada muestra la pantalla de error genérica de Next.
- Tests: cero. Sin runner. La lógica financiera (IVA, reparto socios, estatus de pago, generación de número) es exactamente lo que debería tener tests unitarios.

**¿Qué sobra?**
- 4 dependencias muertas: `react-hook-form`, `@hookform/resolvers`, `zod` (no importado, aunque DEBERÍA usarse), `@radix-ui/react-slot`, y `next-themes` solo lo toca el wrapper de sonner. Peso de bundle + confusión.
- `costo_envio_mxn` vestigial (documentado en CLAUDE.md) y `client.ts` (browser anon) casi sin uso real.

**¿Qué simplificar?**
- 42 reimplementaciones de formato moneda → usar `formatMXN`/`formatMXNshort` de utils.ts (ya existen).
- IDs de socios y IVA 0.16 → constantes en `src/lib/constants.ts`.
- God components → extraer columnas de tabla, modales y hooks a archivos vecinos.

**¿Qué automatizar?** `supabase gen types` en CI; un lint rule que prohíba `new Intl.NumberFormat(...MXN...)` fuera de utils; pre-commit con typecheck.

**¿Qué genera fricción / confunde?** `server.ts` usa el SERVICE ROLE pero cablea cookies de SSR (combinación sin sentido: el service role no tiene sesión de usuario que refrescar). Mezclar `createClient()` (cookie) y `createAdminClient()` en el MISMO archivo (page.tsx dashboard) sin un criterio claro confunde a cualquiera que llegue nuevo. README y AGENTS son plantillas de create-next-app — un dev nuevo no aprende nada del proyecto (todo el conocimiento real vive en CLAUDE.md, que es para agentes, no humanos onboarding).

**¿Qué haría la IA / clase mundial?** Generar tipos de BD, envolver cada server action en un helper `action()` que valida con zod, captura errores y los loguea, y mover las mutaciones multi-paso a funciones RPC de Postgres (como ya se hizo bien con `descontar_inventario_venta`) para garantizar atomicidad.

**Hallazgos (16):**

<details>
<summary><strong>[Alto] #32 — Cero validación de input en server actions; zod está instalado pero sin usar</strong> · Seguridad · Imp 6/Cpx 4 · 1-2d</summary>

- **Archivo:** `src/app/order/actions.ts:128-211`
- **Problema:** submitOrder es un server action PÚBLICO (ruta /order sin auth) que recibe `OrderInput` y lo inserta en la BD con el service_role (bypassa RLS). La validación es un puñado de checks manuales (length>50, cantidad>10000) pero no valida tipos, ni precios, ni que `producto_id` exista, ni longitud de strings (nombre/negocio/notas se insertan crudos). Un atacante puede enviar precios arbitrarios (input.items[i].precio se usa tal cual en subtotal, order/actions.ts:213) o strings gigantes. zod ESTÁ en package.json pero no se importa en ningún archivo de src. saveVenta y crearPedido tampoco validan su shape.
- **Recomendación:** La recomendación original es buena; la refuerzo y priorizo:

1) PRIORIDAD MÁXIMA — submitOrder (público): NUNCA confiar en input.items[i].precio. En el servidor, tras validar, re-leer el precio real de precios_producto (lista 'Pública MXN') por cada producto_id y recalcular subtotal y precio_unitario con ESE valor. El precio del cliente se ignora por completo. Esto cierra el vector de manipulación de precio aunque la cotización sea solo borrador.

2) Validar producto_id contra catálogo: hacer un SELECT de los producto_id recibidos y rechazar cualquiera que no exista o esté oculto del catálogo público (ya hay ocultoEnCatalogoPublico en page.tsx:81) — no depender solo del FK.

3) zod schema para submitOrder como PRIMERA línea: cap de longitud en todos los strings (nombre ≤120, negocio ≤120, telefono ≤30, email validado y ≤120, ciudad ≤80, notas ≤1000), cantidad int 1..10000, items 1..50. Devolver error uniforme.

4) Verificar escape al renderizar notas/nombre en el dashboard de cotizaciones (riesgo XSS almacenado): React escapa por defecto, pero confirmar que no haya dangerouslySetInnerHTML en /cotizaciones.

5) Para saveVenta/crearPedido (internos, tras JWT): aplicar zod también, pero como mejora de robustez (Medio), no como urgencia de seguridad.

6) Wrapper action(schema, handler): bueno como patrón transversal una vez existan los schemas; no bloquea los puntos 1-3.
- **Ejemplo:**

```
import { z } from 'zod'
const OrderSchema = z.object({
  cliente: z.object({ nombre: z.string().min(1).max(120), telefono: z.string().max(30), /*...*/ }),
  items: z.array(z.object({ producto_id: z.string().uuid(), cantidad: z.number().int().positive().max(10000) })).min(1).max(50),
})
// en submitOrder: const parsed = OrderSchema.safeParse(input); if(!parsed.success) return {success:false, error:'Datos inválidos'}
// y recalcular precio server-side, NO usar item.precio del cliente
```

- **Beneficio esperado:** Cierra la inyección de precios/datos en la ruta pública, da errores claros en vez de crashes, y aprovecha una dependencia ya pagada.
- **Verificación:** ajustado — CONFIRMADO en lo técnico, AJUSTADA la severidad de Crítico(8) a Alto(6).

Hechos verificados:
- zod instalado pero sin usar: package.json:34 ("zod":"^4.4.3"); grep de `from "zod"` en todo src/ = 0 resultados. Correcto.
- submitOrder es público sin auth: src/app/order/actions.ts:128, "use server" línea 1, ruta /order fuera del candado JWT del middleware. Usa createAdminClient() (service_

</details>

<details>
<summary><strong>[Alto] #38 — Mutaciones multi-paso sin transacción → datos huérfanos (venta sin items, cotización del portal sin items)</strong> · Arquitectura · Imp 6/Cpx 6 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:50-134`
- **Problema:** saveVenta inserta la venta, luego venta_items, luego venta_socios como llamadas PostgREST independientes sin transacción. Si el insert de items o de socios falla (timeout, constraint), la venta YA quedó creada y se devuelve `{ok:false, error:'Venta creada pero items fallaron'}`. El resultado es una venta huérfana sin items ni reparto de socios que contamina KPIs financieros, ROI y ticket promedio. Lo mismo en submitOrder (order/actions.ts:251-294): si cotizacion_items falla tras crear la cotización, queda una cotización del portal público sin líneas. Esto es corrupción financiera silenciosa.
- **Recomendación:** Mover cada flujo multi-paso a una función RPC de Postgres (SECURITY DEFINER) que haga todos los INSERT dentro de una sola transacción y haga rollback atómico ante cualquier error — exactamente el patrón que ya usas bien con `descontar_inventario_venta` (cotizaciones/actions.ts:248). Crear `crear_venta_completa(payload jsonb)` y `crear_cotizacion_portal(payload jsonb)`. Mientras tanto, mínimo: si items falla, borrar la venta recién creada (compensating delete) antes de retornar el error.
- **Ejemplo:**

```
-- SQL
create or replace function crear_venta_completa(p jsonb) returns uuid
language plpgsql security definer as $$
declare v_id uuid;
begin
  insert into ventas (...) values (...) returning id into v_id;
  insert into venta_items (...) select ... from jsonb_array_elements(p->'items');
  insert into venta_socios (...) values (...);
  return v_id; -- cualquier excepción hace rollback de todo
end; $$;
```

- **Beneficio esperado:** Elimina la posibilidad de ventas/cotizaciones huérfanas. KPIs financieros confiables. Atomicidad real garantizada por la BD.
- **Verificación:** ajustado — CONFIRMADO el mecanismo. saveVenta (src/app/(dashboard)/ventas/actions.ts:50-148) hace 3 escrituras PostgREST independientes sin transacción: INSERT ventas (50-69), luego INSERT venta_items (98-104) y luego INSERT venta_socios (128-134). Si items o socios fallan, la venta YA quedó creada y solo se retorna {ok:false, error:'Venta creada pero items fallaron'} (99-104) / 'distribución de s

</details>

<details>
<summary><strong>[Medio] #59 — formatMXN existe en utils.ts pero 42 archivos reinventan el formateo de moneda</strong> · Mantenibilidad · Imp 5/Cpx 2 · 3h</summary>

- **Archivo:** `src/lib/utils.ts:9-30`
- **Problema:** utils.ts ya exporta `formatMXN` y `formatMXNshort` (con guards null/NaN, patrón documentado en CLAUDE.md). Pero 42 archivos crean su propio `new Intl.NumberFormat(...'MXN'...)` o `fmtMXN` local (verificado: 42 definiciones independientes en ventas-por-tipo.tsx:127, inventory-stats.tsx:46, order/actions.ts:301, etc.). Inconsistencias reales: unos usan maximumFractionDigits:0, otros no → mismo monto se ve '$1,234' o '$1,234.00' según la pantalla. Cambiar el formato global es imposible sin tocar 42 archivos.
- **Recomendación:** Migrar las ~30 definiciones locales a import { formatMXN, formatMXNshort } from "@/lib/utils" (NO 42). Antes de migrar, DECIDIR el estándar de decimales: hoy hay split real entre "$1,234" (la mayoría + utils) y "$1,234.00" (formularios de venta/cotización, preview PDF, modales de producto). Recomendado: 0 decimales para KPIs/listas/dashboards, pero formularios de captura y PDF de cotización probablemente SÍ quieren 2 decimales (montos exactos al peso). Por eso añadir a utils.ts una tercera variante explícita formatMXNexact (maximumFractionDigits:2) en vez de forzar todo a 0, y migrar cada sitio a la variante correcta — si no, la migración "rompería" la presentación de centavos en cotizaciones/PDF. Después, regla ESLint no-restricted-syntax que prohíba new Intl.NumberFormat con currency:'MXN' y toLocaleString(...currency:'MXN') fuera de src/lib/utils.ts. OJO con CotizacionPreview.tsx (PDF): CLAUDE.md prohíbe oklch/lab en PDFs, no afecta esto, pero verificar que el helper no introduzca dependencias no compatibles con la generación PDF.
- **Ejemplo:**

```
// reemplazar en cada archivo:
// const mxn = new Intl.NumberFormat('es-MX', {style:'currency', currency:'MXN'})
import { formatMXN } from '@/lib/utils'
// uso: formatMXN(venta.total)
```

- **Beneficio esperado:** Formato consistente en toda la app, un único punto de cambio, -40 bloques de código duplicado.
- **Verificación:** ajustado — TESIS CONFIRMADA, CONTEO EXAGERADO. El helper canónico existe: src/lib/utils.ts:14-17 (formatMXN con guard null/!isFinite → "$0") y :20-26 (formatMXNshort). Está documentado en CLAUDE.md ("Formateo moneda con guard").

ADOPCIÓN CASI NULA: grep muestra que formatMXN de utils NO lo importa NADIE. Solo formatMXNshort se importa en 1 archivo (src/app/(dashboard)/page.tsx:18). El resto reinv

</details>

<details>
<summary><strong>[Medio] #63 — Sin tipos generados de Supabase: queries 100% sin tipar, drift de esquema invisible</strong> · Mantenibilidad · Imp 5/Cpx 3 · 1d</summary>

- **Archivo:** `src/lib/supabase/server.ts:20`
- **Problema:** No existe database.types.ts. `createServerClient`/`createClient` se llaman sin el genérico `<Database>`, así que TODA query devuelve `any`/sin tipar y el código castea a mano en ~30 sitios (`as { is_internal?: boolean }` en ventas/estadisticas/page.tsx:103, `as unknown[]` en pedidos/actions.ts:132). Un rename o cambio de tipo de columna en Supabase NO rompe el build — rompe en runtime en producción. Para un ERP financiero con columnas GENERATED y enums sensibles (estatus_venta), esto es frágil.
- **Recomendación:** Generar tipos y tiparlos en los TRES clientes (no solo server.ts): `npx supabase gen types typescript --project-id szjzaajjpuomvpnghvzu > src/lib/supabase/database.types.ts`, luego `createServerClient<Database>(...)` en server.ts, `createClient<Database>(...)` en admin.ts y client.ts. Añadir script `gen:types` a package.json y un check de drift en CI (gen + git diff --exit-code). Reemplazar progresivamente los ~30 casts manuales (`as { is_internal }`, `as unknown[]`) por `Tables<'ventas'>` / `Views<'vista_inventario'>`. Asegurar que las vistas y joins anidados queden tipados, ya que ahí se concentran varios de los casts actuales.
- **Ejemplo:**

```
// package.json scripts
"gen:types": "supabase gen types typescript --project-id szjzaajjpuomvpnghvzu > src/lib/supabase/database.types.ts"
// server.ts
import type { Database } from './database.types'
return createServerClient<Database>(url, key, {...})
```

- **Beneficio esperado:** Autocompletado real, el compilador detecta cambios de esquema en build, se eliminan ~29 casts manuales propensos a error.
- **Verificación:** ajustado — Hallazgo factualmente CORRECTO en todos sus puntos verificables:

1. No existe database.types.ts: `find src -name "*.types.ts"` no devuelve nada; src/lib/supabase/ solo tiene admin.ts, client.ts, server.ts.

2. server.ts:20-43 — `createServerClient(...)` se llama SIN el genérico `<Database>`. Lo mismo en admin.ts:16 (`createClient(...)` de supabase-js sin genérico) y client.ts:3. `grep 

</details>

<details>
<summary><strong>[Medio] #72 — Cero try/catch y cero observabilidad en los 7 server actions</strong> · Arquitectura · Imp 5/Cpx 4 · 1d</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/actions.ts:1-617`
- **Problema:** Ningún actions.ts tiene un solo try/catch (verificado: try=0 en los 7 archivos). Solo manejan el `{error}` que devuelve PostgREST, pero si el cliente Supabase LANZA (timeout de red, DNS, service_role inválido) la excepción sube sin capturar y Next la serializa al cliente con stack. No hay logging estructurado: hay 10 archivos con console.error sueltos y ninguna integración de observabilidad (Sentry/Logflare). En producción en Vercel no hay forma de saber qué actions fallan ni con qué frecuencia.
- **Recomendación:** La recomendación original es buena en dirección (wrapper safeAction + logger central); se ajusta el framing y la prioridad. (1) Corregir la justificación: el driver NO es fuga de stack al cliente (Next ya redacta en prod) sino observabilidad nula + UX de error inconsistente. (2) Crear wrapper `safeAction(handler)` que envuelva en try/catch, loguee con contexto (nombre de action + input redactado, sin PII/montos sensibles) y devuelva el mismo `{ok:false, error}` que ya retornan los happy-paths actuales — así se unifica el shape ya existente en saveCotizacion en vez de inventar uno nuevo. (3) Observabilidad: para este tamaño NO hace falta Sentry de entrada; basta un logger central minimal (un módulo `lib/log.ts` que en prod emita JSON estructurado a stdout — Vercel lo captura) y sustituir los console.error dispersos. Sentry free-tier queda como mejora opcional para cuando crezca el equipo, no como bloqueante. (4) Reconocer que la rama PostgREST ya está bien manejada; el wrapper es defensa para el caso excepción (red/DNS/credencial), no un rediseño del manejo de errores existente.
- **Ejemplo:**

```
export function safeAction<I,O>(fn:(i:I)=>Promise<O>) {
  return async (input:I) => {
    try { return await fn(input) }
    catch (e) { logger.error('action_failed', { err: String(e) }); return { ok:false as const, error:'Error interno' } }
  }
}
```

- **Beneficio esperado:** Ningún crash con stack al usuario; visibilidad de fallos en producción; forma consistente de retornar errores que la UI ya consume.
- **Verificación:** ajustado — DATO BASE CONFIRMADO. Verificado por script: try=0/catch=0 en los 7 actions.ts (order/actions.ts, login/actions.ts, pedidos/actions.ts, ventas/actions.ts, cotizaciones/actions.ts, inventario/actions.ts, clientes/actions.ts). En cotizaciones/actions.ts el patrón real es manejo de `{error}` de PostgREST, no excepciones: saveCotizacion (cotizaciones/actions.ts:121-127 y :144-150) solo cheq

</details>

<details>
<summary><strong>[Medio] #85 — Queries Supabase crudas regadas: ausencia de capa de acceso a datos / repositorio</strong> · Arquitectura · Imp 5/Cpx 5 · 2-3d</summary>

- **Archivo:** `src/app/(dashboard)/page.tsx:110-223`
- **Problema:** No hay capa de datos. page.tsx del dashboard mezcla `createClient()` (cookie/service-role) Y `createAdminClient()` en el mismo bloque Promise.all (líneas 141-212) sin criterio claro de cuándo usar cuál, y luego corre `getInternalClienteIds()` por separado (línea 223) que abre OTRA conexión admin para una query que pudo ir en el batch. La misma query (ventas del mes, cotizaciones por estatus) se reescribe en page.tsx, ventas/page.tsx y estadisticas/page.tsx. Sin repositorio, la lógica de exclusión de cliente interno y los filtros de negocio se reimplementan ad-hoc en cada sitio (a veces con getInternalClienteIds, a veces con join `clientes!left(is_internal)` — dos técnicas distintas para lo mismo).
- **Recomendación:** Crear `src/lib/data/` con módulos por agregado (ventas.ts, clientes.ts, cotizaciones.ts) que expongan funciones tipadas (`getVentasDelMes()`, `getKpisDashboard()`) encapsulando la query Y la regla de exclusión interno de UNA sola forma. Unificar el criterio service-role vs admin (probablemente todo admin, ver hallazgo de server.ts). Esto también facilita los tests.
- **Beneficio esperado:** Una sola fuente de verdad por query, regla de cliente interno aplicada consistentemente, queries tipadas y testeables, menos conexiones redundantes.

</details>

<details>
<summary><strong>[Medio] #98 — God components de 1.5k–2.2k líneas concentran tabla + filtros + modales + lógica</strong> · Mantenibilidad · Imp 5/Cpx 6 · 2-3d</summary>

- **Archivo:** `src/app/(dashboard)/clientes/clientes-dashboard.tsx:1-2245`
- **Problema:** clientes-dashboard.tsx (2245 líneas), cotizaciones-list.tsx (1775), ventas-table-premium.tsx (1595) son client components monolíticos que mezclan: definición de columnas de react-table, estado de filtros/sorting/paginación, modales de confirmación/edición, helpers de formato, lógica de negocio y render. Module augmentation de @tanstack inline (clientes-dashboard.tsx:23-29) con un import suelto DESPUÉS de la augmentation (línea 31). Son inmantenibles, irreutilizables y disparan re-renders de todo el árbol ante cualquier cambio de estado.
- **Recomendación:** Extraer por archivo vecino: `columns.tsx` (defs de columnas), `use-<modulo>-table.ts` (hook con estado de tabla), `<Modulo>Modals.tsx`, y mover helpers compartidos a lib. Crear `src/hooks/` (ya aliased en tsconfig/components.json pero inexistente). Objetivo: ningún componente >500 líneas.
- **Beneficio esperado:** Componentes testeables y reutilizables, menos re-renders, onboarding más rápido, diffs de PR legibles.

</details>

<details>
<summary><strong>[Medio] #113 — IDs de socios e IVA hardcodeados en múltiples archivos (constantes de negocio dispersas)</strong> · Mantenibilidad · Imp 4/Cpx 2 · 2h</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:9-10`
- **Problema:** SANDRA_ID y BENJAMIN_ID están copiados literalmente en 6 archivos (page.tsx:23-24, ventas/actions.ts:9-10, ventas-dashboard.tsx:88-89, ventas-table-premium.tsx:63-64, venta-drawer.tsx:29-30, finanzas/page.tsx:7-8). La tasa de IVA 0.16 está hardcodeada en 5 lugares (ventas/actions.ts:396, edit-form.tsx:61, venta-form.tsx:99 y :110, cotizacion-form.tsx:142). Un cambio de socio o de tasa de IVA exige editar todos. Es la clase de constante de negocio que DEBE vivir en un solo sitio.
- **Recomendación:** Crear src/lib/constants.ts con: export const SOCIOS = { SANDRA: '4f21084b-...', BENJAMIN: '3165fe33-...' } as const; export const IVA_RATE = 0.16; export const CLIENTE_INTERNO_ID = '08449791-...'. Importar en los 6+5+1 sitios. Centralizar también una helper calcIva(subtotal, descuento) para encapsular la fórmula (subtotal-descuento)*IVA_RATE y eliminar la duplicación de la lógica, no solo de la constante. MATIZ sobre la sugerencia de leer socios desde la tabla `socios`: NO recomendable para este proyecto — los IDs son fijos (2 socios, 50/50 inmutable), ya están en CLAUDE.md y en scripts de seed, y una lectura async a BD añade complejidad sin beneficio real. El archivo de constantes es la solución pragmática correcta. Para el ID interno, lo ideal es usar el getInternalClienteIds() ya existente en server actions (consistencia con el resto de la app) y reservar la constante solo como fallback/literal donde no se pueda hacer fetch async.
- **Ejemplo:**

```
// src/lib/constants.ts
export const IVA_RATE = 0.16
export const SOCIOS = { SANDRA: '4f21084b-...', BENJAMIN: '3165fe33-...' } as const
export const calcIVA = (base: number) => Number((base * IVA_RATE).toFixed(2))
```

- **Beneficio esperado:** Una sola fuente de verdad para constantes financieras; cambio de tasa de IVA o socio en un solo lugar; menos riesgo de inconsistencia (p.ej. cambiar IVA en venta-form pero olvidar en actions).
- **Verificación:** ajustado — CONFIRMADO el hecho central. SANDRA_ID/BENJAMIN_ID están duplicados literalmente en exactamente 6 archivos: src/app/(dashboard)/page.tsx:23-24, src/app/(dashboard)/ventas/actions.ts:9-10, src/app/(dashboard)/ventas/ventas-dashboard.tsx:88-89, src/app/(dashboard)/ventas/venta-drawer.tsx:29-30, src/app/(dashboard)/ventas/ventas-table-premium.tsx:63-64, src/app/(dashboard)/finanzas/page.ts

</details>

<details>
<summary><strong>[Medio] #114 — Dependencias instaladas sin usar (react-hook-form, @hookform/resolvers, zod, @radix-ui/react-slot)</strong> · Mantenibilidad · Imp 4/Cpx 2 · 2h</summary>

- **Archivo:** `package.json:11-37`
- **Problema:** Verificado por grep en src: `react-hook-form`, `@hookform/resolvers`, `zod` y `@radix-ui/react-slot` no se importan en ningún archivo. Todos los formularios usan useState manual (venta-form.tsx, cotizacion-form.tsx, cliente-form.tsx). Es deuda doble: peso/ruido de dependencias muertas + señal de que la validación (zod) y el manejo de forms (rhf) que el stack 'pretende' tener no existen. shadcn coexiste con @base-ui/react (la única lib de UI realmente usada) — relación poco clara.
- **Recomendación:** O bien adoptar react-hook-form + zod en los formularios (recomendado: estandariza validación cliente Y servidor con el mismo schema), o desinstalar las 4 deps muertas. @radix-ui/react-slot probablemente entró con shadcn — verificar si button.tsx lo necesita (usa @base-ui, no radix) y quitar.
- **Beneficio esperado:** package.json honesto, bundle más liviano, y si se adoptan: validación uniforme client+server con schemas zod compartidos.

</details>

<details>
<summary><strong>[Medio] #115 — server.ts usa SERVICE ROLE pero cablea cookies de SSR — combinación contradictoria</strong> · Arquitectura · Imp 4/Cpx 2 · 2-3h</summary>

- **Archivo:** `src/lib/supabase/server.ts:26-48`
- **Problema:** createClient() usa createServerClient (@supabase/ssr, diseñado para auth basada en cookies del USUARIO) pero le pasa el SERVICE_ROLE_KEY. El service role no tiene sesión de usuario, así que todo el wiring de getAll/setAll de cookies es código muerto/confuso: no refresca ninguna sesión porque no hay auth.uid(). Es funcionalmente equivalente a createAdminClient() pero con 25 líneas extra y semántica engañosa. Coexisten dos clientes que hacen lo mismo (admin.ts y server.ts), elegidos arbitrariamente entre archivos (page.tsx usa ambos).
- **Recomendación:** Colapsar a un solo cliente admin server-only (createAdminClient) y eliminar server.ts, o si se anticipa migrar a Supabase Auth real (auth.uid + RLS por usuario), documentar que server.ts es el placeholder para ESE futuro y NO usar service role en él. Hoy la duplicación con semántica falsa confunde y es un riesgo: alguien podría creer que server.ts respeta RLS de usuario cuando no.
- **Beneficio esperado:** Un solo cliente con semántica clara; elimina el malentendido de que server.ts aplica RLS por usuario; -1 archivo y -25 líneas de cookie-wiring inútil.

</details>

<details>
<summary><strong>[Medio] #129 — Sin error/loading/not-found boundaries en toda la app</strong> · UX · Imp 4/Cpx 3 · 0.5d</summary>

- **Archivo:** `src/app/(dashboard)`
- **Problema:** No existe ni un error.tsx, loading.tsx, global-error.tsx ni not-found.tsx en toda la app (verificado por find). Cualquier excepción no capturada en un server component (p.ej. una query Supabase que lanza) muestra la pantalla de error cruda de Next sin branding ni recuperación. Las páginas con fetches pesados (dashboard page.tsx hace ~15 queries) no tienen estado de carga con Suspense → el usuario ve pantalla en blanco hasta que todo resuelve.
- **Recomendación:** Añadir error.tsx (con reset()) y loading.tsx en (dashboard) y en rutas pesadas (ventas, clientes, pedidos), un not-found.tsx global, y considerar <Suspense> con skeletons para los KPIs del dashboard. Reutilizar GlassCard/PageHeader para consistencia visual.
- **Ejemplo:**

```
// src/app/(dashboard)/error.tsx
'use client'
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <div className='p-8'><p>Algo salió mal.</p><button onClick={reset}>Reintentar</button></div>
}
```

- **Beneficio esperado:** Fallos degradan con gracia y opción de reintentar; percepción de velocidad con skeletons; UX de clase producto.

</details>

<details>
<summary><strong>[Medio] #130 — Cero tests en un ERP con lógica financiera no trivial</strong> · Mantenibilidad · Imp 4/Cpx 3 · 0.5-1d</summary>

- **Archivo:** `package.json:5-9`
- **Problema:** No hay test runner ni un solo archivo de test (verificado). La lógica más sensible es pura y trivialmente testeable: calcIVA = (subtotal-descuento)*0.16, estatusFor (pendiente/parcial/total), construirNumeroOrden/cambiarTipoNumero/nombreCorto (numero-orden.ts), reparto 50/50 con .toFixed(2). Estos son exactamente los puntos donde un bug = dinero mal calculado, y donde un regression test cuesta minutos.
- **Recomendación:** Añadir Vitest y escribir tests para las funciones puras de cálculo (lib/numero-orden.ts, calcIVA, estatusFor, reparto socios, formatMXN edge cases null/NaN/negativos). No buscar 100% coverage; cubrir la lógica financiera y de generación de identificadores.
- **Ejemplo:**

```
// numero-orden.test.ts
import { cambiarTipoNumero, nombreCorto } from './numero-orden'
expect(cambiarTipoNumero('PC-020626009-C-Mithra','V')).toBe('PC-020626009-V-Mithra')
expect(nombreCorto({nombre_negocio:'Café Sol'})).toBe('CafeSol')
```

- **Beneficio esperado:** Red de seguridad sobre los cálculos de dinero; refactors (extraer constantes, mover a RPC) sin miedo a romper IVA/reparto.

</details>

<details>
<summary><strong>[Medio] #139 — Read-modify-write de stock no atómico (race condition, lost updates)</strong> · Base de datos · Imp 4/Cpx 4 · 0.5-1d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/actions.ts:70-89`
- **Problema:** sumarStock lee stock_actual y luego escribe stock_actual + delta en dos llamadas separadas (líneas 78-79). Mismo patrón en cotizaciones/actions.ts:561-567 (devolución de stock). Si dos operaciones concurren (un alta de pedido + una venta que descuenta), una sobreescribe a la otra → stock corrupto (lost update). Hoy con 2-3 usuarios el riesgo es bajo, pero es exactamente lo que impide escalar y el tipo de bug imposible de reproducir.
- **Recomendación:** Mover la suma a un solo statement atómico en BD vía RPC de Postgres: CREATE FUNCTION ajustar_stock(p_producto_id uuid, p_delta int) que haga INSERT ... ON CONFLICT (producto_id) DO UPDATE SET stock_actual = GREATEST(0, inventario.stock_actual + p_delta). El UNICO statement con UPSERT resuelve tanto la atomicidad como el caso fila-inexistente sin el SELECT previo (requiere UNIQUE/PK en inventario.producto_id; verificar que exista o crearlo). Llamarlo con admin.rpc('ajustar_stock', {...}). REEMPLAZAR los TRES read-then-write: pedidos/actions.ts:70-89 (sumarStock), cotizaciones/actions.ts:559-583 (devolución) y el omitido inventario/actions.ts:~167 (edición manual). Nota: stock_inicial es NOT NULL sin default (CLAUDE.md) → en la rama INSERT del upsert poner stock_inicial = GREATEST(0, p_delta).
- **Ejemplo:**

```
create or replace function ajustar_stock(p_producto_id uuid, p_delta int)
returns void language sql as $$
  update inventario set stock_actual = greatest(0, stock_actual + p_delta)
  where producto_id = p_producto_id; $$;
```

- **Beneficio esperado:** Stock consistente bajo concurrencia; elimina lost updates; menos round-trips (1 query en vez de 2).
- **Verificación:** ajustado — Patrón confirmado en ambos spots citados. pedidos/actions.ts:72-79 (sumarStock): SELECT id, stock_actual (l.74) → UPDATE stock_actual = nuevo (l.79) en dos llamadas separadas, no atómico. cotizaciones/actions.ts:559-567 (devolución de stock al borrar venta): SELECT stock_actual (l.561) → UPDATE stock_actual + cant (l.567), mismo patrón. No existe RPC ajustar_stock (grep confirma 0 resul

</details>

<details>
<summary><strong>[Medio] #140 — Generación de número de orden consecutivo vía count() es race-prone (colisiones bajo concurrencia)</strong> · Base de datos · Imp 4/Cpx 4 · 0.5d</summary>

- **Archivo:** `src/app/order/actions.ts:101-117`
- **Problema:** generarNumeroEstandar calcula el consecutivo como count(*) de cotizaciones del cliente + 1, y luego itera comprobando existencia (loop de 50). Bajo dos submits concurrentes del mismo cliente (portal público + alta manual a la vez) ambos pueden leer el mismo count y generar el mismo número antes de insertar — colisión. El loop de existencia mitiga pero no elimina la carrera (TOCTOU entre el check y el insert). Para identificadores de documentos financieros esto es frágil.
- **Recomendación:** Usar una secuencia de Postgres por cliente o generar el número dentro del mismo RPC transaccional que crea la cotización (con un UNIQUE constraint en cotizaciones.numero que ya parece existir + retry). Idealmente el número se asigna en la BD, no en JS leyendo un count.
- **Beneficio esperado:** Números de orden únicos garantizados sin colisiones bajo concurrencia; elimina el loop heurístico de 50 intentos.

</details>

<details>
<summary><strong>[Bajo] #195 — README y AGENTS.md son plantillas vacías — todo el conocimiento vive en CLAUDE.md (para agentes, no humanos)</strong> · Mantenibilidad · Imp 2/Cpx 1 · 2h</summary>

- **Archivo:** `README.md:1-35`
- **Problema:** README.md es el boilerplate intacto de create-next-app ('bootstrapped with create-next-app', referencia a app/page.tsx que no existe). AGENTS.md solo trae las reglas genéricas de Next. Un humano nuevo (o un futuro socio técnico) no encuentra: cómo correr el proyecto con las env vars reales, qué es el portal /order, las reglas de IVA/columnas GENERATED, ni el modelo de datos. Todo eso está en CLAUDE.md, que está escrito para agentes IA. Onboarding humano = cero.
- **Recomendación:** Escribir un README real: stack, setup (.env.example ya es bueno), comandos, arquitectura de alto nivel (App Router + server actions + service role + portal público), reglas de negocio clave (IVA referencial vs real, cliente interno, columnas GENERATED) y enlaces a scripts/. Mantener CLAUDE.md como guía para agentes pero que el README sea la puerta de entrada humana.
- **Beneficio esperado:** Onboarding humano posible; reduce el bus-factor (hoy el conocimiento está en la cabeza del dueño + un archivo para IA).

</details>

<details>
<summary><strong>[Bajo] #198 — Helpers de avatar/hash y parseNotas duplicados entre archivos</strong> · Mantenibilidad · Imp 2/Cpx 2 · 2h</summary>

- **Archivo:** `src/app/(dashboard)/clientes/prediccion-compras.tsx`
- **Problema:** getAvatarGradient/AVATAR_GRADIENTS están duplicados en prediccion-compras.tsx y prediccion-insights.tsx (mismo patrón de hash documentado en CLAUDE.md, copiado). parseNotas vive en ventas/notas-util.ts pero el patrón de parseo de notas se consume desde 4 sitios; conviene confirmar que no haya reimplementaciones. Son utilidades de presentación que deberían vivir en lib/ compartido.
- **Recomendación:** Mover getAvatarGradient/AVATAR_GRADIENTS a `src/lib/avatar.ts` y notas helpers a `src/lib/notas.ts`, importar desde ambos consumidores. Crear el directorio `src/lib/ui/` o `src/hooks/` para utilidades de presentación compartidas.
- **Beneficio esperado:** Avatares y parseo consistentes garantizados; un punto de cambio; menos drift entre componentes hermanos.

</details>


### Base de datos y capa de datos

El modelo relacional está razonablemente normalizado (productos/inventario/ventas/venta_items/venta_socios, cotizaciones/cotizacion_items, pedidos y sus tablas hijas) y el manejo de columnas GENERATED es disciplinado y bien documentado. Sin embargo, la capa de datos tiene un defecto estructural grave: NINGUNA escritura multi-tabla es transaccional. saveVenta, marcarVendida, crearPedido, editarPedido, updateCotizacion, eliminarVenta y revertirCotizacion encadenan 3-8 INSERT/UPDATE/DELETE secuenciales sin transacción ni rollback; si cualquiera falla a la mitad, la BD queda corrupta (venta sin items, sin socios, inventario descontado pero venta borrada, etc.). A esto se suma: cero control de versiones del esquema (todo el DDL real vive en Supabase, los scripts son parches sueltos e idempotentes), una RPC crítica (descontar_inventario_venta) que no está versionada en el repo, generación de número de orden con race condition (count+1), ausencia de validación de stock en el portal público, lecturas full-table sin paginación real, y hard-delete sin auditoría/historial. Para 2-3 usuarios internos es operable hoy, pero la no-atomicidad ya puede corromper datos financieros con un solo fallo de red, y nada de esto escala a producto multi-tenant de clase mundial.

**Lo que está bien:** el modelo de columnas GENERATED está bien entendido y respetado en todo el código; las inserciones masivas usan WHERE NOT EXISTS / ON CONFLICT; el portal público está correctamente aislado vía service_role detrás de rate-limit; las vistas tienen security_invoker + REVOKE. El uso de Map para deduplicar y los patrones de inmutabilidad están bien.

**Lo que falta (crítico):** transaccionalidad. Supabase-js NO soporta transacciones multi-statement desde el cliente; la única forma correcta es encapsular cada operación compuesta (crear venta, marcar vendida, crear/editar pedido) en una FUNCTION plpgsql invocada por .rpc(), de modo que Postgres garantice atomicidad. Hoy NADA de esto existe salvo descontar_inventario_venta — y esa función ni siquiera está en el repo, lo que significa que el esquema/lógica de BD no es reproducible: si se pierde el proyecto Supabase, no se puede recrear. Esto es lo primero que arreglaría.

**Lo que sobra / friccion:** getInternalClienteIds() hace un round-trip extra a la BD en CADA render de página (es un Set casi constante — debería cachearse con unstable_cache o un flag); las páginas traen TODAS las filas de venta_items/ventas a memoria y filtran en JS (los internos deberían filtrarse en la query con .not('cliente_id','in',...)). El re-prorrateo de envío en editarPedido reescribe productos.costo_envio_usd globalmente en cada edición, lo que muta el costo histórico de inventario (un pedido viejo editado contamina el costeo de productos que no cambiaron).

**Qué automatizaría:** (1) migraciones declarativas con `supabase db diff` / carpeta supabase/migrations bajo git; (2) constraints CHECK (stock_actual>=0, cantidad>0, monto>=0) en BD en vez de solo Math.max en JS; (3) UNIQUE en (cliente_id, lista_id) en precios_producto y en numero de cotizaciones/ventas; (4) un trigger o secuencia atómica para el consecutivo por cliente; (5) soft-delete (deleted_at) + tabla de auditoría para ventas/pedidos.

**Qué haría la IA:** nada de esto requiere IA; es higiene de ingeniería de datos. Pero una vez con auditoría/historial, un agente podría detectar anomalías financieras (ventas con ganancia negativa, inventario descontado dos veces, drift entre venta_socios y ventas.total).

**Qué confunde:** el doble cliente (server.ts service_role vs admin.ts service_role) — ambos son service_role hoy, la distinción documentada ("server respeta RLS") es FALSA y engañosa para un dev nuevo. costo_envio_mxn vestigial en productos pero SÍ se escribe en pedidos_compra. La RPC fantasma.

**Hallazgos (15):**

<details>
<summary><strong>[Alto] #8 — crearPedido / editarPedido / agregarItemsPedido: stock e items sin atomicidad (loop de awaits)</strong> · Base de datos · Imp 8/Cpx 6 · 2d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/actions.ts:226-273`
- **Problema:** crearPedido inserta el header, luego en un loop hace por cada producto: INSERT pedido_compra_items + UPDATE productos (snapshot costo) + UPDATE/INSERT inventario (sumar stock). Si falla en el ítem 3 de 8, ya se sumó stock real de 2 productos y se creó un pedido a medias; el return de error deja el inventario inflado sin forma de saber qué se aplicó. editarPedido es peor: hace DELETE de todos los items (línea 524) y luego reinserta uno por uno — si falla a mitad, el pedido pierde items permanentemente Y el stock ya se ajustó por delta antes (línea 499-502). Son entradas de inventario reales corrompibles.
- **Recomendación:** Recomendación original es correcta; afino la implementación: crear una FUNCTION plpgsql `crear_pedido_compra(payload jsonb)` / `editar_pedido_compra(...)` / `agregar_items_pedido(...)` que reciba header + array de items como jsonb y ejecute TODOS los INSERT/UPDATE de pedidos_compra, pedido_compra_items, productos (snapshot) e inventario dentro de la misma transacción (atómica por defecto en una función). Invocarla con admin.rpc('crear_pedido_compra', { payload }). Mientras tanto, mitigación de bajo costo: en editarPedido, NO aplicar el delta de stock (499-502) antes del DELETE/reinsert; reordenar para calcular y aplicar todos los efectos al final, y/o snapshotear los items viejos en memoria para poder re-insertarlos si la reescritura falla. Para los GENERATED cols (ver CLAUDE.md: ventas/cotizaciones/subtotal) la función debe respetar las mismas reglas (no escribir columnas generadas).
- **Beneficio esperado:** El stock de inventario deja de poder quedar inflado/desfasado por un fallo a mitad de un pedido. Los items de un pedido nunca se pierden por un error en edición.
- **Verificación:** ajustado — Hallazgo TÉCNICAMENTE CORRECTO en todos sus puntos, verificado contra src/app/(dashboard)/pedidos/actions.ts.

crearPedido (actions.ts:226-273): inserta el header (226-247), luego loop (252-268) que por cada producto hace 3 escrituras independientes y auto-committed: INSERT pedido_compra_items (256), snapshotProducto = UPDATE productos (266→58-67), sumarStock = UPDATE/INSERT inventario 

</details>

<details>
<summary><strong>[Alto] #16 — Sin control de versiones del esquema: el DDL real solo vive en Supabase</strong> · Mantenibilidad · Imp 7/Cpx 4 · 2-3d</summary>

- **Archivo:** `scripts/`
- **Problema:** No existe carpeta supabase/migrations ni ningún CREATE TABLE versionado. El esquema completo (25 tablas, columnas GENERATED, FKs, enums, 3 vistas, la RPC descontar_inventario_venta, los triggers de columnas generadas) vive ÚNICAMENTE en el proyecto Supabase szjzaajjpuomvpnghvzu. Los scripts/ son parches sueltos (enable-rls.sql, add-pedido-*.sql) y .py one-off. Si se borra o corrompe el proyecto Supabase, o se quiere clonar a staging, NO se puede recrear la BD. descontar_inventario_venta — lógica de negocio crítica que descuenta inventario — no está en ningún archivo del repo (grep confirma 0 definiciones).
- **Recomendación:** Adoptar Supabase CLI y versionar el esquema completo, con un matiz importante respecto a la recomendación original: `supabase db pull` NO captura de forma fiable funciones, triggers ni vistas con security_invoker en todos los casos. Pasos concretos: (1) `supabase init` + `supabase link --project-ref szjzaajjpuomvpnghvzu`; (2) generar el snapshot real con `supabase db dump --schema public -f supabase/migrations/00000000000000_baseline.sql` (incluye tablas, FKs, enums, columnas GENERATED, vistas y FUNCIONES como descontar_inventario_venta) y un dump separado de RLS/roles si aplica; (3) commitear ese baseline a git como migración 0; (4) volcar explícitamente descontar_inventario_venta y upsert_venta_item a archivos SQL revisables; (5) de ahí en adelante toda evolución vía `supabase migration new` versionada, retirando los parches .py one-off de scripts/. Beneficio inmediato y de bajo costo (negocio chico): habilita crear un staging clonable y deja auditable la lógica financiera/inventario que hoy vive solo en producción.
- **Ejemplo:**

```
supabase link --project-ref szjzaajjpuomvpnghvzu
supabase db pull   # genera supabase/migrations/<ts>_remote_schema.sql con TODO
git add supabase/migrations && git commit -m 'capture baseline schema'
```

- **Beneficio esperado:** Recuperación ante desastre, entorno de staging reproducible, revisión en PR de cambios de esquema, y la lógica de inventario deja de ser una caja negra fuera del repo.
- **Verificación:** ajustado — CONFIRMADO en lo sustancial. No existe supabase/migrations ni config.toml: `find . -name config.toml` y `find . -name migrations -type d` devuelven vacío; supabase no está en package.json (solo @supabase/ssr y supabase-js). El DDL del repo es parcial y disperso: las únicas CREATE TABLE son tablas AUXILIARES agregadas a posteriori — scripts/add-pedido-envios.sql:5 (pedido_envios), script

</details>

<details>
<summary><strong>[Alto] #23 — marcarVendida: inventario descontado sin atomicidad con la venta</strong> · Base de datos · Imp 7/Cpx 6 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/actions.ts:173-276`
- **Problema:** Convertir cotización a venta encadena: INSERT ventas → INSERT venta_items → RPC descontar_inventario_venta → UPDATE cotizaciones. No hay transacción. Si la RPC de inventario tiene éxito pero el UPDATE de estatus falla, el inventario queda descontado y la cotización sigue en estado previo: el usuario reintenta y descuenta el stock DOS VECES. Si la RPC falla tras crear venta+items, queda una venta real sin inventario descontado. La propia revertirCotizacion (línea 522) admite que 'descontar_inventario_venta no tiene RPC inversa' — el rollback es manual y frágil.
- **Recomendación:** Mover los 4 pasos a una FUNCTION plpgsql única invocada por una sola rpc() (la app actual NO puede abrir transacciones multi-statement vía supabase-js: cada llamada es HTTP independiente — por eso la atomicidad SOLO se logra dentro de Postgres). La función debe: (1) recibir cotizacion_id; (2) hacer SELECT ... FOR UPDATE sobre la cotización y abortar si estatus ya = 'aceptada' (guard server-side de idempotencia que hoy NO existe); (3) crear venta + venta_items + descontar inventario + UPDATE estatus en el mismo BEGIN/COMMIT implícito de la función, de modo que cualquier excepción haga rollback total automático. Adicionalmente, agregar UNIQUE constraint sobre ventas.cotizacion_id (NOT NULL parcial) para que a nivel BD sea imposible generar dos ventas desde la misma cotización aunque se reintente. Esto cubre tanto el doble descuento como la venta huérfana sin necesidad de un flag inventario_descontado separado.
- **Beneficio esperado:** Evita doble descuento de stock y ventas inconsistentes con inventario. El conteo de inventario deja de poder corromperse por un reintento del usuario.
- **Verificación:** ajustado — CONFIRMADO el defecto de atomicidad. En src/app/(dashboard)/cotizaciones/actions.ts:202-268, marcarVendida() encadena 4 operaciones independientes sin transacción usando supabase-js (cada await es un round-trip HTTP separado): INSERT ventas (202-218) → INSERT venta_items (237-239) → rpc('descontar_inventario_venta') (248-250) → UPDATE cotizaciones.estatus='aceptada' (258-261). Cada paso

</details>

<details>
<summary><strong>[Alto] #35 — Hard-delete en cascada manual sin auditoría ni soft-delete (ventas, pedidos, items)</strong> · Base de datos · Imp 6/Cpx 5 · 2-3d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:530-565`
- **Problema:** eliminarVenta borra físicamente venta_items, venta_socios y la venta en 3 DELETE separados (no transaccionales: si falla el 3ro, items y socios ya se borraron pero la venta queda). No hay deleted_at ni tabla de historial: una venta financiera borrada por error es irrecuperable y no deja rastro de quién/cuándo. Lo mismo en eliminarCotizacion, editarPedido (DELETE masivo de items línea 524), y updateCotizacion (DELETE+INSERT de items, 440-470). En un ERP financiero, el borrado físico sin auditoría es un riesgo serio de pérdida de datos y de cumplimiento.
- **Recomendación:** Priorizar atomicidad y reversibilidad sobre el audit_log con autor (que es poco accionable con login compartido):

1. ATOMICIDAD (lo más barato y de mayor impacto): definir FKs `ON DELETE CASCADE` de venta_items/venta_socios → ventas (y cotizacion_items → cotizaciones, pedido_compra_items → pedidos) en migración SQL, y reemplazar los 3 DELETE manuales por un único `DELETE FROM ventas WHERE id=?`. Postgres borra los hijos en la misma transacción. Para updateCotizacion/editarPedido (DELETE+INSERT de items), envolver en una RPC/función Postgres (transaccional) en lugar de dos llamadas PostgREST separadas.

2. SOFT-DELETE / REVERSIBILIDAD (alto valor en dato financiero): añadir `estatus='cancelada'` (ya existe en el enum estatus_venta) o columna `deleted_at` a ventas/cotizaciones; "eliminar" = marcar, no borrar físicamente; excluir de KPIs vía filtro en los server components. Esto da recuperación ante error humano, que es el riesgo dominante en un equipo de 2-3 personas.

3. AUDITORÍA (opcional, menor prioridad aquí): si se quiere historial, basta un trigger que registre tabla+operación+timestamp+snapshot del row. El campo "autor" no aporta mientras la auth sea contraseña compartida; tendría sentido recién al introducir usuarios reales.
- **Beneficio esperado:** Recuperabilidad de datos financieros, trazabilidad de cambios (quién anuló qué venta), y borrado en cascada atómico vía FK en vez de secuencial frágil.
- **Verificación:** ajustado — CONFIRMADO el núcleo del hallazgo: borrado físico en cascada manual, no transaccional, sin soft-delete ni auditoría.

EVIDENCIA:
- eliminarVenta (src/app/(dashboard)/ventas/actions.ts:530-565): 3 DELETE secuenciales separados — venta_items (534-540), venta_socios (543-549), ventas (556-559). No hay transacción/RPC que los envuelva; cada uno es un round-trip independiente al PostgREST. S

</details>

<details>
<summary><strong>[Alto] #39 — Snapshot de costo global muta el costeo histórico de inventario al editar un pedido</strong> · Lógica de negocio · Imp 6/Cpx 6 · 2-3d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/actions.ts:51-67`
- **Problema:** snapshotProducto reescribe productos.precio_usd, costo_envio_usd, tipo_cambio y costo en CADA crear/editar/agregar de pedido. Como vista_inventario deriva el costo del producto de estos campos, editar un pedido VIEJO recalcula el envío prorrateado (envioUnit cambia al cambiar el total de unidades, línea 217/379/523) y sobreescribe el costo de TODOS los productos de ese pedido con el nuevo prorrateo. Resultado: el costo landed y el profit de productos que existen en inventario desde pedidos anteriores se contaminan por una edición no relacionada. El propio CLAUDE.md documenta este patrón como fuente de bugs (fix-pedido-3.py). No hay snapshot inmutable de costo por lote/pedido.
- **Recomendación:** El costo de inventario debería ser un promedio ponderado por capas (lotes) o tomar el costo del último pedido sin reescribir el del producto en ediciones retroactivas. Guardar el costo en pedido_compra_items (ya existe) como verdad histórica y derivar el costo de inventario de la entrada más reciente, no de un campo global mutable en productos.
- **Beneficio esperado:** El costeo y la ganancia históricos dejan de cambiar al editar pedidos antiguos; reportes financieros estables y auditables.
- **Verificación:** confirmado — Mecanismo confirmado en código real:

1) snapshotProducto reescribe campos GLOBALES del producto en cada operación de pedido: actions.ts:58-66 hace UPDATE productos SET precio_usd, costo_envio_usd, tipo_cambio, costo. Se invoca en crearPedido (266), agregarItemsPedido (403) y editarPedido (542).

2) El envío prorrateado por unidad depende del total de unidades del pedido, recalculado 

</details>

<details>
<summary><strong>[Medio] #60 — Sin estrategia de backups documentada ni point-in-time recovery verificado</strong> · Escalabilidad · Imp 5/Cpx 2 · 0.5d</summary>

- **Archivo:** `scripts/enable-rls.sql:117-119`
- **Problema:** No hay nada en el repo sobre política de backups, retención ni PITR. El único 'rollback' documentado es a nivel de git tags del código (CLAUDE.md) y deshacer RLS por tabla. Para una BD que es la única fuente de verdad financiera (ventas, ROI de socios, inversiones reales de $300k MXN), depender del backup por defecto del plan Supabase sin verificarlo es un riesgo. Combinado con el hard-delete sin auditoría y la no-transaccionalidad, un error operativo puede ser irreversible.
- **Recomendación:** Verificar/activar PITR en el plan de Supabase, documentar la política de retención y probar una restauración. Complementar con un export periódico (pg_dump o supabase db dump) versionado/almacenado fuera de Supabase para los datos financieros.
- **Beneficio esperado:** Capacidad real de recuperar datos financieros ante borrado accidental o corrupción; tranquilidad operativa para una BD de fuente única.

</details>

<details>
<summary><strong>[Medio] #64 — Faltan constraints UNIQUE/CHECK en BD; las invariantes viven solo en JS</strong> · Base de datos · Imp 5/Cpx 3 · 1d</summary>

- **Archivo:** `src/app/(dashboard)/inventario/actions.ts:199-231`
- **Problema:** Invariantes críticas se garantizan solo en application code y no en la BD: no se observa UNIQUE en precios_producto(producto_id, lista_id) — actualizarProducto hace SELECT+UPDATE/INSERT manual (200-228) que sin UNIQUE puede crear precios duplicados bajo concurrencia; no hay UNIQUE en cotizaciones.numero (solo en ventas.numero, seed:17); cantidad>0, monto>=0, stock>=0 se validan con Math.max/Number.isFinite en JS pero no con CHECK en BD. Cualquier escritura fuera de la app (script .py, SQL manual, futura API) puede violarlas.
- **Recomendación:** Añadir constraints en BD: UNIQUE(producto_id, lista_id) en precios_producto, UNIQUE en cotizaciones.numero, CHECK(stock_actual>=0), CHECK(cantidad>0) en items, CHECK(monto>=0). Convertir el SELECT+UPDATE/INSERT de precios en un upsert con ON CONFLICT.
- **Beneficio esperado:** La integridad deja de depender de que toda escritura pase por el código TS; los scripts y futuras integraciones no pueden corromper datos.

</details>

<details>
<summary><strong>[Medio] #86 — Creación de venta NO transaccional: corrupción financiera si falla a la mitad</strong> · Base de datos · Imp 5/Cpx 5 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:50-134`
- **Problema:** saveVenta hace 3 escrituras secuenciales independientes (INSERT ventas → INSERT venta_items → INSERT venta_socios) sin transacción. Si el segundo o tercer INSERT falla (timeout, FK, RLS, deploy a mitad de request), la venta ya quedó creada pero sin items y/o sin reparto de socios. El código retorna 'Venta creada pero items fallaron' pero NO revierte la venta huérfana: queda contabilizada en KPIs financieros, ROI y ticket promedio con total pero sin productos ni costo real. Es corrupción de datos financieros silenciosa.
- **Recomendación:** Implementar RPC plpgsql `crear_venta_completa` (versionada en scripts/) invocada con supabase.rpc(), replicando el patrón ya existente de `descontar_inventario_venta` (cotizaciones/actions.ts:248). La función inserta ventas + venta_items + venta_socios en una sola transacción atómica. Como mitigación inmediata de bajo costo mientras se crea la RPC: añadir rollback manual (DELETE de la venta por id) en cada rama de error tras el primer INSERT, eliminando así la fila huérfana que hoy queda contabilizada en KPIs.
- **Ejemplo:**

```
-- supabase/migrations/xxxx_crear_venta.sql
create or replace function crear_venta_completa(p jsonb) returns uuid as $$
declare v_id uuid;
begin
  insert into ventas(...) values (...) returning id into v_id;
  insert into venta_items(...) select ... from jsonb_array_elements(p->'items');
  insert into venta_socios(...) values (v_id, ...), (v_id, ...);
  return v_id;
end; $$ language plpgsql; -- toda la fn corre en una sola transacción
```

- **Beneficio esperado:** Elimina ventas huérfanas y desajustes financieros por fallos parciales. Garantiza integridad referencial real entre venta, items y reparto de socios.
- **Verificación:** ajustado — CONFIRMADO el patrón no-transaccional. saveVenta (src/app/(dashboard)/ventas/actions.ts:43-148) hace 3 escrituras secuenciales con createAdminClient (sin transacción): INSERT ventas (50-69), INSERT venta_items (98), INSERT venta_socios (128). Cada fallo intermedio hace `return {ok:false}` SIN borrar la venta ya creada (líneas 83, 100-104, 130-133). La venta huérfana queda persistida.

C

</details>

<details>
<summary><strong>[Medio] #116 — Doc engañosa: server.ts dice respetar RLS pero usa service_role (igual que admin.ts)</strong> · Mantenibilidad · Imp 4/Cpx 2 · 3h</summary>

- **Archivo:** `src/lib/supabase/server.ts:20-43`
- **Problema:** server.ts y admin.ts usan ambos SUPABASE_SERVICE_ROLE_KEY → ambos bypassan RLS por completo. La distinción no existe en runtime, pero el comentario de admin.ts:11-13 sugiere migrar a 'server client normal con políticas auth.uid()' implicando que server.ts respeta RLS — es falso. Un dev nuevo asumirá que las queries en server.ts están protegidas por RLS cuando NO lo están. Tener dos factorías idénticas con semántica distinta documentada es una trampa de mantenibilidad y un riesgo si algún día se intenta endurecer RLS confiando en server.ts.
- **Recomendación:** Unificar en un solo factory o documentar honestamente que ambos son service_role y NINGUNO respeta RLS hoy. Cuando se agregue auth real por usuario, separar de verdad (anon+RLS para lecturas de usuario, service_role solo para operaciones admin).
- **Beneficio esperado:** Elimina una suposición de seguridad falsa; claridad sobre qué realmente protege los datos (hoy: solo el candado JWT del middleware, no RLS).

</details>

<details>
<summary><strong>[Medio] #131 — Notificaciones con REPLICA IDENTITY FULL y .select('*') — fuga de PII por Realtime</strong> · Seguridad · Imp 4/Cpx 3 · 0.5d</summary>

- **Archivo:** `src/components/notifications-actions.ts:42`
- **Problema:** enable-realtime-notificaciones.sql:36 pone REPLICA IDENTITY FULL en notificaciones y la añade a la publication supabase_realtime, y el payload incluye datos jsonb con PII del cliente (teléfono, email, ciudad — order/actions.ts:316-326). notifications-actions.ts:42 hace .select('*'). Si la suscripción Realtime se hiciera con el anon key (o si RLS de notificaciones se relaja), ese payload con PII viajaría a clientes no autenticados. Hoy RLS bloquea anon, pero Realtime + REPLICA FULL + PII en jsonb es una superficie a vigilar.
- **Recomendación:** Confirmar que la suscripción Realtime corre solo server-side/autenticada; no meter PII cruda en notificaciones.datos (guardar solo IDs y resolver al abrir). Seleccionar columnas explícitas en vez de '*'.
- **Beneficio esperado:** Reduce el riesgo de exposición de PII vía el canal Realtime y limita el blast radius si RLS cambia.

</details>

<details>
<summary><strong>[Medio] #141 — submitOrder y descuento de inventario sin validación de stock: stock negativo posible</strong> · Lógica de negocio · Imp 4/Cpx 4 · 1d</summary>

- **Archivo:** `src/app/order/actions.ts:128-294`
- **Problema:** El portal público crea cotizaciones sin verificar stock disponible (el catálogo lee vista_inventario solo para mostrar, order/page.tsx:38, pero submitOrder no revalida). Al marcarVendida, descontar_inventario_venta resta del stock. Como no hay constraint CHECK (stock_actual >= 0) en BD ni validación previa de disponibilidad, el inventario puede quedar NEGATIVO si se vende más de lo que hay (varios pedidos del mismo producto entre revalidaciones). El código usa Math.max(0, ...) solo al sumar (pedidos/actions.ts:78) pero la RPC de descuento no está en el repo para verificar que también lo haga.
- **Recomendación:** Recomendación principal (alta relación valor/esfuerzo): añadir un CHECK (stock_actual >= 0) en la tabla inventario para que la BD rechace, dentro de la transacción de venta, cualquier descuento que dejaría negativo. Esto blinda TODOS los caminos (RPC descontar_inventario_venta, reverso manual, ajustes), no solo el portal. Antes de aplicarlo: auditar la RPC descontar_inventario_venta (NO está en el repo — exportarla y versionarla en scripts/) para confirmar si clampa a 0 o usa GREATEST; con el CHECK puesto, si no clampa, marcarVendida fallará limpio (ya devuelve error en cotizaciones/actions.ts:251-256) en vez de corromper stock.

Secundario (opcional, UX): validar disponibilidad en el punto donde SÍ se descuenta —idealmente dentro de la RPC o en marcarVendida— y mostrar al operador interno qué SKUs no alcanzan antes de confirmar. Validar en submitOrder es menos prioritario porque ese paso solo crea un borrador no vinculante; sería solo una mejora de feedback al cliente ("sin stock"), no una protección de integridad.

NO enmarcar esto como bug del portal/submitOrder: el riesgo de stock negativo vive en la ruta de confirmación interna + la RPC ausente, no en submitOrder.
- **Beneficio esperado:** Inventario nunca negativo; integridad del costeo y de los KPIs de stock; el cliente del portal no pide lo que no hay.
- **Verificación:** ajustado — PARCIALMENTE CONFIRMADO, severidad ajustada a la baja.

Confirmado:
- src/app/order/actions.ts:128-344 (submitOrder): NO valida stock en ningún punto. Solo valida cantidad>0 y <=10000 (actions.ts:149-155), límite de 50 items (146) y rate-limit (131). No consulta vista_inventario ni inventario. Correcto el hallazgo.
- src/app/order/page.tsx:38-47: el catálogo lee vista_inventario.stock_a

</details>

<details>
<summary><strong>[Medio] #151 — Race condition en el consecutivo del número de orden (count + 1)</strong> · Base de datos · Imp 4/Cpx 5 · 1d</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/actions.ts:57-76`
- **Problema:** generarNumeroCotizacion calcula el consecutivo como count(cotizaciones del cliente)+1, luego itera verificando existencia. Esto NO es atómico: dos cotizaciones simultáneas del mismo cliente (p.ej. portal /order + alta manual) leen el mismo count y generan el mismo número. El bucle de verificación (línea 70) mitiga pero también tiene TOCTOU: entre el check de existencia y el INSERT otra request puede insertar. Si ventas.numero tiene UNIQUE (lo agrega seed-ventas-from-sheet.sql:17 pero solo en ventas, no se ve UNIQUE en cotizaciones.numero), el segundo INSERT falla; si no, se duplican números. Misma lógica replicada en order/actions.ts:96-118.
- **Recomendación:** Para el contexto actual (negocio chico): agregar `ALTER TABLE cotizaciones ADD CONSTRAINT cotizaciones_numero_unique UNIQUE (numero);` como red de seguridad barata — convierte un duplicado silencioso en un error capturable. Luego, en saveCotizacion/submitOrder, envolver el INSERT en un retry: si vuelve error de violación de unicidad (code 23505), regenerar el consecutivo (count+1) y reintentar 2-3 veces. Esto resuelve el TOCTOU sin necesidad de tabla contador ni función plpgsql, que serían sobre-ingeniería para 2-3 usuarios. Para escalar (multi-tenant / alta concurrencia): mover la generación a una FUNCTION plpgsql con `INSERT ... RETURNING` usando una tabla contador por cliente con `UPDATE ... RETURNING` o una secuencia, todo dentro de la misma transacción de creación. Nota: el UNIQUE debe contemplar que numeroOrdenExiste compara tanto variante C como V (cambiarTipoNumero); un UNIQUE solo sobre cotizaciones.numero no previene colisión C-cotización vs V-venta, pero ese cruce ya es defendido por el loop y por ventas_numero_unique.
- **Beneficio esperado:** Elimina números de orden duplicados o colisiones bajo concurrencia portal+ERP, evitando confusión contable y fallos de UNIQUE en producción.
- **Verificación:** ajustado — Confirmado el patrón no-atómico y la falta de UNIQUE. Evidencia exacta:

1) src/app/(dashboard)/cotizaciones/actions.ts:58-68 — `generarNumeroCotizacion` hace count(*) por cliente y `let consecutivo = (count ?? 0) + 1`. Líneas 70-74: loop de verificación TOCTOU `numeroOrdenExiste()` + `consecutivo++`. No hay lock ni transacción.

2) numeroOrdenExiste (líneas 38-50) solo hace SELECTs (`.

</details>

<details>
<summary><strong>[Medio] #152 — Lecturas full-table sin paginación: venta_items y ventas se traen completas a memoria</strong> · Performance · Imp 4/Cpx 5 · 2-3d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/page.tsx:47-94`
- **Problema:** La página de ventas hace DOS selects completos de venta_items (líneas 47-53 y 80-85, sin .limit ni .range) además de ventas con .limit(2000). clientes/page.tsx (28-50) trae ventas, cotizaciones y venta_items SIN límite alguno. getVentasStats (ventas/actions.ts:243) hace 'pull TODOS los venta_items históricos'. Hoy son ~373 items y 42 ventas, pero cada fila pasa por la red y se filtra en JS (filtro de internos en memoria, líneas 63-77). No hay paginación real en ninguna lista: a 10x el volumen, cada carga de página descarga toda la tabla. El default de Supabase (1000 filas) además truncaría silenciosamente venta_items sin que nadie lo note.
- **Recomendación:** Prioridad por riesgo, no por perf:

1. (Mayor riesgo real) Blindar contra truncado silencioso AHORA, aunque el volumen sea bajo: en clientes/page.tsx y getVentasStats agregar .limit() explícito alto y/o paginar con .range() hasta agotar, para no depender del max-rows implícito de PostgREST. Un truncado en agregados financieros (top productos / ventas por mes) corrompe reportes sin avisar.

2. Filtrar internos en la query, no en JS: usar .not('cliente_id','in',`(${ids.join(',')})`) — reduce red y evita el patrón filter-after-fetch en ventas/page (63-77, 92-94) y clientes/page (54-62).

3. Eliminar el round-trip extra: el segundo SELECT de venta_items en ventas/page.tsx:80-85 puede fusionarse en una sola consulta con joins de categoría (el primer select 47-53 ya trae venta_items) o al menos moverse dentro del Promise.all para no serializar.

4. Mover agregados a Postgres (vista/RPC con GROUP BY): top productos, ventas por mes, ventas por tipo — ya hay precedente de vistas (vista_inventario, vista_productos_top). Es la solución correcta para escalar, pero es la de MENOR urgencia dado el volumen actual; hacerla cuando el volumen lo justifique o de paso al tocar estos módulos.

5. Paginación real con .range()+count en las listas: deseable para escalar, baja urgencia hoy.
- **Beneficio esperado:** Páginas que no se degradan con el volumen, evita el corte silencioso a 1000 filas de venta_items, menos transferencia y memoria en el server component.
- **Verificación:** ajustado — Hallazgo factualmente correcto en todos sus puntos. Verificado:

- ventas/page.tsx:47-53 — primer SELECT de venta_items (en el Promise.all), sin .limit/.range.
- ventas/page.tsx:80-85 — SEGUNDO SELECT de venta_items, además FUERA del Promise.all (await secuencial), o sea un round-trip extra evitable. Trae cantidad/subtotal/venta_id/categorias sin límite.
- ventas/page.tsx:38 — ventas co

</details>

<details>
<summary><strong>[Medio] #153 — Patrón N+1 en loops de inventario (snapshot + sumarStock por producto)</strong> · Performance · Imp 4/Cpx 5 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/actions.ts:252-268`
- **Problema:** En crearPedido/editarPedido/agregarItemsPedido, por cada producto del pedido se hacen 3-4 round-trips secuenciales (INSERT item, UPDATE producto, SELECT inventario + UPDATE/INSERT inventario). sumarStock (70-89) hace SELECT+UPDATE por producto. Para un pedido de 40 SKUs son ~160 queries secuenciales con await individual. revertirCotizacion (cotizaciones/actions.ts:557-583) y getInternalClienteIds en cada página añaden round-trips. Hoy es tolerable por el bajo volumen pero es lento y multiplica la ventana de fallo no-transaccional.
- **Recomendación:** Batch: leer todo el inventario de los productos del pedido en UN select (.in('producto_id', ids)), calcular deltas en memoria y hacer un upsert batch. O resolverlo dentro de la FUNCTION plpgsql transaccional propuesta (un solo round-trip).
- **Beneficio esperado:** Pedidos grandes mucho más rápidos, menos carga en Supabase y ventana de inconsistencia minimizada.

</details>

<details>
<summary><strong>[Medio] #156 — getInternalClienteIds() ejecuta un query extra en cada render de página</strong> · Performance · Imp 3/Cpx 2 · 2h</summary>

- **Archivo:** `src/lib/internal-clientes.ts:12-19`
- **Problema:** Cada página del dashboard (ventas, clientes, finanzas, estadísticas, dashboard) llama getInternalClienteIds() que hace un SELECT a clientes WHERE is_internal=true en cada render. Es un dato casi estático (un solo cliente interno conocido por UUID en CLAUDE.md). Es un round-trip evitable por request y además se usa solo para filtrar en JS post-fetch en vez de en la query.
- **Recomendación:** Cachear con unstable_cache/React cache() por la duración del request o un TTL corto, o filtrar directamente en la query con .neq('cliente_id', INTERNAL_ID)/.not(...,'in',...). El UUID interno ya es conocido y estable.
- **Beneficio esperado:** Un round-trip menos por página y posibilidad de mover el filtro de internos a la BD.

</details>


### Seguridad

El modelo de seguridad es coherente para su escala actual (2-3 usuarios internos): candado JWT HS256 fail-closed, comparación de contraseña en tiempo constante, rate-limit anti fuerza bruta, RLS de bloqueo total al rol anon, portal /order sin anon key, headers de defensa (HSTS/X-Frame/nosniff), buckets de documentos privados con signed URLs y validación de tipo/tamaño, y React escapa por defecto (cero dangerouslySetInnerHTML). Sin embargo hay un hueco CRÍTICO en la superficie pública: submitOrder confía en el `precio` y `producto_id` enviados desde el navegador sin re-validarlos contra la BD, permitiendo a cualquier visitante anónimo inyectar precios arbitrarios y filas en `cotizaciones`/`clientes`/`notificaciones`. Estructuralmente, el uso universal del service_role significa que cualquier bug de validación en una server action expone TODA la base de datos, y NO existe autorización ni auditoría: la cookie es un pase total sin identidad de usuario, sin revocación, sin MFA y sin registro de quién hizo qué. Una inyección de filtro PostgREST en findSimilarClientes y la ausencia de CSP completan el cuadro. Para el negocio chico de hoy el riesgo real concentrado está en el portal público y en la fragilidad operativa (un secreto débil = acceso total); para escalar a multi-tenant el modelo entero debe reconstruirse sobre identidad por usuario + RLS basada en auth.uid().

**Modelo de auth (contraseña única compartida).** Funciona y está bien implementado a nivel mecánico: JWT firmado HS256 con `jose` (Edge-compatible), verificación fail-closed (`src/lib/auth.ts:44-54`), comparación de contraseña en tiempo constante con doble hash SHA-256 (`src/app/login/actions.ts:21-25`), cookie httpOnly + secure + sameSite=lax. Pero el modelo de fondo no tiene identidad: una sola contraseña compartida → imposible saber quién entró, imposible revocar el acceso de una persona sin rotar el secreto de todos, sin MFA, sin caducidad de contraseña. El JWT no tiene `jti` ni lista de revocación: si la cookie se filtra (XSS en otra parte, logs, dispositivo robado), es válida 30 días sin forma de invalidarla salvo rotar `ERP_AUTH_SECRET` (lo que desloguea a todos). No hay enforcement de robustez de `ERP_PASSWORD` ni de entropía de `ERP_AUTH_SECRET` (solo se exige length>=16 del secret en `auth.ts:22`); un secreto débil = forja de tokens.

**Autorización: CERO.** Ninguna de las ~30 server actions revalida permisos; todas confían exclusivamente en el middleware. Verificado: `grep verifySessionToken/SESSION_COOKIE/lib/auth` sobre los actions del dashboard no arroja nada. Hoy es aceptable (todos los internos son admin de facto), pero significa que (a) no hay defensa en profundidad si una ruta se escapa del matcher, y (b) es imposible introducir roles (ej. un empleado que solo capture pedidos sin ver finanzas) sin reescribir cada action. Para producto de clase mundial esto es bloqueante.

**Service_role en toda la app = radio de explosión máximo.** Cada server action usa `createAdminClient()`/`createClient()` con service_role que bypassa RLS. La consecuencia: RLS NO protege nada para usuarios autenticados; es solo un muro contra el anon key. Si una sola action tiene un bug de validación o IDOR, expone/corrompe la BD entera. El comentario en `admin.ts:11-13` ya reconoce que esto es deuda ("Cuando agregues auth, migra estas queries al server client normal con políticas auth.uid()").

**Superficie pública /order — el punto más peligroso.** Tres server actions corren con service_role sin sesión: `buscarClientePorTelefono`, `submitOrder` (`src/app/order/actions.ts`). Tienen rate-limit y validación de tamaño, pero `submitOrder` CONFÍA en `precio` y `producto_id` del cliente (ver hallazgo crítico). Además crea clientes y cotizaciones reales en la BD productiva desde anónimos: es un vector de spam/contaminación de datos (mitigado parcialmente por 10/hora por IP, pero IP es trivial de rotar).

**Validación de inputs: sin Zod, ad-hoc.** No hay un esquema declarativo en ninguna action; la validación es manual y dispar (algunas validan, otras no). `saveVenta`, `updateCliente`, `crearProducto`, `agregarPago`, etc. insertan números/strings directo. Falta validación de UUID (cualquier string pasa como id), de rangos numéricos (montos negativos en varias), de longitud de notas/nombres.

**XSS / CSRF / inyección.** XSS: bien — cero `dangerouslySetInnerHTML`, React escapa nombres/notas. CSRF: las server actions de Next 15 están protegidas por el chequeo de Origin integrado y el logout es un `<form action>` POST, no GET (`logout-button.tsx:8`) — correcto. Inyección: una instancia real de inyección de filtro PostgREST en `findSimilarClientes` (`.or()` con string interpolado, ver hallazgo).

**Headers / CSP.** Hay HSTS, X-Frame DENY, nosniff, Referrer-Policy, Permissions-Policy (`next.config.ts:8-20`), pero NO hay Content-Security-Policy. Sin CSP, cualquier XSS futuro (o dependencia comprometida) tiene vía libre para exfiltrar. Es la defensa más barata que falta.

**Rate-limit in-memory.** Honesto sobre su limitación (no distribuido). En Vercel con varias instancias/regiones el límite es por instancia → un atacante distribuido lo evade. El propio archivo recomienda Vercel WAF; debería implementarse para /login y /order.

**Auditoría / logs.** No existe registro de quién hizo qué (imposible sin identidad de usuario). Borrados destructivos (`eliminarVenta`, `deleteCliente` cascada, `mergeClientes`) no dejan rastro. Para un ERP financiero esto es una carencia seria de cara a escalar.

**Qué simplificar/automatizar.** (1) Centralizar validación con Zod por action elimina la inconsistencia actual. (2) Un único wrapper `withAuth(action)` que revalide la sesión dentro de cada action daría defensa en profundidad barata. (3) Mover el catálogo/precios a una fuente de verdad server-side para /order cierra el hueco de precios de raíz.

**Hallazgos (11):**

<details>
<summary><strong>[Crítico] #3 — submitOrder confía en precio y producto_id del cliente (manipulación de precios + inyección de datos desde anónimos)</strong> · Seguridad · Imp 9/Cpx 4 · 3-4h</summary>

- **Archivo:** `src/app/order/actions.ts:128-294`
- **Problema:** El portal público /order es accesible sin sesión. `submitOrder` recibe `items[].precio` y `items[].producto_id` directamente del navegador (order-catalog.tsx:259-262 envía `precio: i.producto.precio`) y los inserta tal cual en `cotizacion_items.precio_unitario` y en el `subtotal` de la cotización (actions.ts:213-216, 278-287), SIN re-leer el precio real desde `precios_producto` ni validar que el `producto_id` exista/esté activo. Cualquier visitante anónimo puede hacer un POST a la server action (son endpoints HTTP) con precio 0.01 o negativo, o con un producto_id arbitrario, y crear cotizaciones reales en la BD productiva con precios falsos. Como además crea filas en `clientes` y `notificaciones`, es también un vector de contaminación/spam de datos. El radio de explosión es total porque corre con service_role. El rate-limit (10/h por IP) no impide la manipulación, solo el volumen.
- **Recomendación:** Nunca confiar en el precio del cliente. En submitOrder: (1) recolectar los producto_id, (2) leer el precio vigente real desde precios_producto (lista 'Pública MXN') con el admin client, (3) calcular subtotal/precio_unitario SOLO con esos valores server-side, (4) rechazar cualquier producto_id que no exista o esté inactivo. Validar también que cada producto_id sea un UUID. El `precio` del payload del cliente debe ignorarse por completo (a lo sumo usarse para mostrar una advertencia de discrepancia).
- **Ejemplo:**

```
// en submitOrder, antes de construir items:
const ids = input.items.map(i => i.producto_id)
if (ids.some(id => !/^[0-9a-f-]{36}$/i.test(id))) return {success:false,error:'Producto inválido'}
const { data: lista } = await supabase.from('listas_precios').select('id').eq('nombre','Pública MXN').single()
const { data: precios } = await supabase.from('precios_producto').select('producto_id, precio').eq('lista_id', lista.id).in('producto_id', ids)
const priceMap = new Map(precios.map(p => [p.producto_id, Number(p.precio)]))
const items = input.items.map(i => {
  const precio = priceMap.get(i.producto_id)
  if (precio == null) throw new Error('Producto no disponible')
  return { producto_id: i.producto_id, cantidad: i.cantidad, precio_unitario: precio }
})
const subtotal = items.reduce((s,i)=> s + i.precio_unitario*i.cantidad, 0)
```

- **Beneficio esperado:** Elimina la manipulación de precios y la inyección de productos inexistentes desde la superficie pública; las cotizaciones del portal pasan a reflejar precios reales y auditables.
- **Verificación:** confirmado — CONFIRMADO el núcleo técnico del hallazgo, con severidad AJUSTADA de Crítico(9) a Alto(7) por mitigantes reales.

EVIDENCIA — el server confía en datos del cliente sin re-validar:
- src/app/order/actions.ts:21-26 — OrderInput.items incluye `producto_id` y `precio` provenientes del navegador.
- src/app/order/actions.ts:213-216 — `subtotal` se calcula con `i.precio * i.cantidad` (precio

</details>

<details>
<summary><strong>[Alto] #40 — Modelo de auth sin identidad de usuario: sin revocación, sin MFA, sin auditoría, JWT de 30 días sin jti</strong> · Seguridad · Imp 6/Cpx 6 · 3-5d</summary>

- **Archivo:** `src/lib/auth.ts:15-54`
- **Problema:** La autenticación es una contraseña ÚNICA compartida que emite un JWT de 30 días (SESSION_MAX_AGE, auth.ts:16) sin `jti` ni mecanismo de revocación (auth.ts:31-37). Consecuencias: (1) imposible saber/auditar quién hizo cada acción — para un ERP financiero con borrados destructivos (eliminarVenta, deleteCliente cascada, mergeClientes) es una carencia grave; (2) si una cookie se filtra (dispositivo robado, log, etc.) es válida 30 días y la única forma de invalidarla es rotar ERP_AUTH_SECRET, lo que desloguea a todos; (3) sin MFA; (4) revocar el acceso de una persona obliga a cambiar la contraseña de todos. No hay enforcement de robustez de ERP_PASSWORD (login/actions.ts:32 solo verifica que exista).
- **Recomendación:** Priorizar por impacto real, no todo junto:

HOY (lo único Alto): agregar tabla de auditoría mínima `audit_log(id, ts, action, entity, entity_id, payload_jsonb, ip)` escrita por un wrapper común en las server actions destructivas (eliminarVenta, deleteCliente, mergeClientes). Aun sin identidad de usuario, registra el qué/cuándo/desde-qué-IP. Es la mitigación de mayor valor para un ERP financiero y es barata. Documentar/forzar ERP_AUTH_SECRET de 32 bytes aleatorios (subir el guard de auth.ts:22 de >=16 a >=32) y ERP_PASSWORD fuerte.

OPCIONAL barato: reducir SESSION_MAX_AGE de 30d a 7-14d (auth.ts:16) acota la ventana de una cookie filtrada. Bajo esfuerzo.

ESCALADO (cuando entren más personas / multi-tenant): migrar a usuarios individuales (Supabase Auth) con identidad real en el JWT, jti + tabla de sesiones revocables, y MFA opcional. Solo entonces tiene sentido el costo; hoy con 2-3 personas y contraseña compartida por diseño, identidad/MFA/revocación-por-persona no aportan valor proporcional.
- **Beneficio esperado:** Permite auditar acciones financieras, limita la ventana de una cookie filtrada, y sienta la base para revocación granular y roles.
- **Verificación:** ajustado — CONFIRMADO en su mayoría contra el código real:

1) JWT de 30 días sin jti: src/lib/auth.ts:16 `SESSION_MAX_AGE = 60*60*24*30`. createSessionToken (auth.ts:31-37) firma solo `{ role: "erp" }` + setIssuedAt() + setExpirationTime(); NO hay jti ni claim de identidad de usuario. Confirmado.

2) Sin revocación: verifySessionToken (auth.ts:44-54) es 100% stateless — solo `jwtVerify(token, get

</details>

<details>
<summary><strong>[Alto] #42 — Uso universal de service_role: cualquier bug de validación expone/corrompe toda la BD</strong> · Arquitectura · Imp 6/Cpx 8 · 1-2 sem</summary>

- **Archivo:** `src/lib/supabase/server.ts:20-43`
- **Problema:** Toda la app (server components y las ~30 server actions) accede a Supabase con el SERVICE_ROLE key, que bypassa RLS por diseño (server.ts:7, admin.ts:3-4). RLS por tanto NO ofrece ninguna protección para tráfico autenticado: es solo un muro contra el anon key. Combinado con la ausencia total de autorización dentro de las actions, esto significa que un único fallo (un IDOR, un filtro mal construido, una validación faltante) tiene radio de explosión = base de datos completa: ventas, finanzas, PII de clientes, comprobantes. Es un anti-patrón de 'todo o nada' que el propio admin.ts:11-13 documenta como deuda pendiente.
- **Recomendación:** El plan por capas del auditor es correcto pero necesita re-priorizacion segun el contexto real (negocio chico, contrasena compartida, sin usuarios). CORTO PLAZO (alto valor, bajo costo): 1) Validar TODOS los inputs de server actions con Zod (.parse en la primera linea de cada action) — esto ataca la causa de probabilidad #1 del hallazgo (bug de validacion) y es independiente de auth. 2) NO invertir aun en withAuth() que revalide JWT dentro de cada action: con UNA sola contrasena compartida y sin roles, re-verificar el mismo JWT en cada action es defensa-en-profundidad de bajo retorno (no hay segregacion de privilegios que proteger). Mas util: helper requireSession() solo en las actions mas destructivas (deletes masivos, cambios financieros) como cinturon-y-tirantes contra un middleware mal configurado. MEDIANO PLAZO (prerequisito para escalar/multi-tenant, NO urgente hoy): migrar a auth de usuario real de Supabase (cada socia/empleado = usuario), reescribir queries con el client autenticado + politicas RLS por auth.uid()/rol, y reservar service_role solo para tareas administrativas puntuales (lo que admin.ts:11-13 ya anticipa). Ese paso es el unico que convierte RLS en segunda linea de defensa efectiva, pero solo rinde cuando haya >1 nivel de privilegio que distinguir.
- **Beneficio esperado:** Reduce el radio de explosión de 'toda la BD' a 'lo que ese usuario podía tocar'; habilita roles, auditoría y multi-tenant; convierte RLS en protección real, no decorativa.
- **Verificación:** ajustado — CLAIMS VERIFICADOS contra el codigo:

1) Uso universal de service_role bypassa RLS: CONFIRMADO. server.ts:24-25 pasa SUPABASE_SERVICE_ROLE_KEY a createServerClient (no el anon). admin.ts:16-18 igual. Los propios comentarios lo documentan: server.ts:7 "Usa el SERVICE ROLE key -> bypassa RLS (acceso total a la BD)"; admin.ts:4 "bypassa RLS"; admin.ts:11-13 documenta la deuda: "Cuando agre

</details>

<details>
<summary><strong>[Medio] #132 — Inyección de filtro PostgREST en findSimilarClientes (.or con string crudo)</strong> · Seguridad · Imp 4/Cpx 3 · 1-2h</summary>

- **Archivo:** `src/app/(dashboard)/clientes/actions.ts:266-272`
- **Problema:** `.or(\`nombre.ilike.%${q}%,nombre_negocio.ilike.%${q}%,rfc.ilike.%${q}%\`)` interpola la entrada del usuario `q` directamente en la mini-DSL de filtros de PostgREST. Caracteres de control de esa sintaxis (coma, paréntesis, punto) en `q` permiten alterar la estructura del filtro: inyectar condiciones adicionales o referenciar otras columnas (p.ej. `q = 'a),id.eq.<uuid>'` rompe el OR y agrega cláusulas), pudiendo exfiltrar/filtrar filas fuera de la intención. Aunque hoy solo lo llama un usuario autenticado, es una inyección genuina y un mal patrón que, con service_role, opera sin RLS de contención.
- **Recomendación:** Mantener la corrección propuesta: sanear `q` antes de interpolar. Como es un término de búsqueda fuzzy, no hay necesidad legítima de metacaracteres de PostgREST, así que basta con neutralizarlos. En actions.ts, reemplazar la línea 264 por algo como: `const raw = query.trim().toLowerCase(); const q = raw.replace(/[(),.*%\\"]/g, " ").trim(); if (q.length < 3) return []`. Esto elimina coma, paréntesis, punto, comodines y comillas (los caracteres de control de la DSL) y revalida longitud. Alternativa más robusta a futuro (recomendada solo si el patrón se generaliza o se vuelve público): mover a una función RPC SQL con parámetros tipados (ilike con bind params) en vez de construir el filtro como string. No es urgente dado el contexto actual (solo usuarios internos autenticados), pero el fix de 2 líneas es barato y elimina el mal patrón.
- **Ejemplo:**

```
const safe = q.replace(/[,()*%\\]/g, ' ').trim()
if (safe.length < 3) return []
.or(`nombre.ilike.%${safe}%,nombre_negocio.ilike.%${safe}%,rfc.ilike.%${safe}%`)
```

- **Beneficio esperado:** Cierra el vector de inyección de filtros y previene exfiltración por manipulación de la query.
- **Verificación:** ajustado — Confirmado el sink técnico. src/app/(dashboard)/clientes/actions.ts:264 hace `const q = query.trim().toLowerCase()` y :269-271 lo interpola crudo: `.or(`nombre.ilike.%${q}%,nombre_negocio.ilike.%${q}%,rfc.ilike.%${q}%`)`. supabase-js (^2.105.4) pasa el argumento de `.or()` casi verbatim como `or=(...)` en PostgREST, cuya mini-DSL usa coma como separador de condiciones y punto como separ

</details>

<details>
<summary><strong>[Medio] #133 — Rate-limit in-memory no distribuido: evadible en Vercel multi-instancia</strong> · Seguridad · Imp 4/Cpx 3 · 2-4h</summary>

- **Archivo:** `src/lib/rate-limit.ts:12-57`
- **Problema:** El rate limiter mantiene un Map por proceso (rate-limit.ts:14). En Vercel con Fluid Compute hay varias instancias/regiones; los contadores no se comparten, así que un atacante que distribuya peticiones (o simplemente caiga en instancias distintas) obtiene N×límite intentos de login o de submitOrder. El propio archivo lo reconoce (líneas 4-7). Protege ráfagas triviales pero no un ataque dirigido de fuerza bruta contra la contraseña única (que es la llave maestra del sistema).
- **Recomendación:** Implementar una regla de rate limit en Vercel Firewall (WAF) sobre /login y /order como capa dura distribuida, tal como sugiere el comentario. Alternativa: rate-limit con Upstash/Redis para estado compartido. Mantener el in-memory como complemento.
- **Beneficio esperado:** Convierte el límite en una barrera real contra fuerza bruta de la contraseña maestra y abuso del portal público, independiente del número de instancias.

</details>

<details>
<summary><strong>[Medio] #134 — submitOrder/saveCliente: PII de clientes capturada desde anónimos sin validación de formato</strong> · Seguridad · Imp 4/Cpx 3 · 2-3h</summary>

- **Archivo:** `src/app/order/actions.ts:189-211`
- **Problema:** submitOrder inserta clientes nuevos (nombre, teléfono, email, ciudad) tomados de input anónimo con solo `.trim()` — sin validar formato de email/teléfono, sin límite de longitud de campos ni de notas. Un anónimo puede inflar la tabla `clientes` con PII basura/maliciosa, y notas largas. La búsqueda por teléfono usa `ilike(%${digits}%)` (actions.ts:68, 180): un teléfono parcial hace match de subcadena, lo que puede mezclar/reusar el registro de OTRO cliente (asociar el pedido a un cliente equivocado) además de permitir cierta enumeración pese al rate-limit.
- **Recomendación:** Validar formato y longitud máxima de cada campo (email regex, teléfono 10-15 dígitos, nombre/notas con cap de caracteres) en submitOrder y saveCliente. Cambiar el match de teléfono de `ilike %digits%` a igualdad sobre dígitos normalizados (comparar la versión solo-dígitos exacta) para evitar colisiones por subcadena.
- **Beneficio esperado:** Evita contaminación de datos y la asociación incorrecta de pedidos a clientes ajenos; reduce enumeración.

</details>

<details>
<summary><strong>[Medio] #142 — Falta Content-Security-Policy en los headers de seguridad</strong> · Seguridad · Imp 4/Cpx 4 · 3-5h</summary>

- **Archivo:** `next.config.ts:8-26`
- **Problema:** Los headers incluyen HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy y Permissions-Policy, pero NO hay Content-Security-Policy. Sin CSP, cualquier XSS futuro (vía una dependencia comprometida, un render no escapado que se introduzca después, o el portal público que renderiza datos de anónimos) puede cargar scripts externos y exfiltrar la cookie de sesión o datos. CSP es la mitigación de defensa-en-profundidad más costo-efectiva que falta, especialmente relevante porque /order es público y recibe input de cualquiera.
- **Recomendación:** Añadir CSP, pero la recomendación original sobre nonces es desproporcionada para un ERP interno de 2-3 usuarios y agrega complejidad real de wiring en Next 15/16 (nonce vía middleware + reenvío a todos los <script>). Plan pragmático:

1) Empezar en Content-Security-Policy-Report-Only para no romper render (Next inyecta scripts inline de bootstrap):
   default-src 'self'; img-src 'self' https://szjzaajjpuomvpnghvzu.supabase.co data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://szjzaajjpuomvpnghvzu.supabase.co; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'

2) Añadir como sexto objeto en el array securityHeaders (next.config.ts:8-20), mismo source '/:path*'. Incluir 'unsafe-inline' en style-src es obligatorio por Tailwind/shadcn. El valor real de seguridad aquí está en connect-src (limita exfiltración a tu propio dominio + Supabase) y frame-ancestors/object-src, no en bloquear scripts inline.

3) Tras validar sin violaciones en prod, promover a Content-Security-Policy (enforcing). El endurecimiento a nonce en script-src queda como mejora opcional futura, no requisito.

Verificar el subdominio exacto de Supabase (szjzaajjpuomvpnghvzu.supabase.co per CLAUDE.md) y dominio de Vercel antes de enforce.
- **Beneficio esperado:** Contiene el impacto de cualquier XSS o dependencia comprometida; bloquea exfiltración a dominios no autorizados; complementa el resto de headers ya presentes.
- **Verificación:** ajustado — CONFIRMADO el hecho base: no existe Content-Security-Policy. En next.config.ts:8-20 el array securityHeaders define exactamente 5 headers (Strict-Transport-Security, X-Frame-Options:DENY, X-Content-Type-Options:nosniff, Referrer-Policy, Permissions-Policy) aplicados a /:path* (next.config.ts:23-24). grep de "content-security-policy"/"csp" en src/ y next.config.ts: cero resultados. src/m

</details>

<details>
<summary><strong>[Medio] #143 — Sin pista de auditoría en operaciones destructivas/financieras</strong> · Seguridad · Imp 4/Cpx 4 · 4-6h</summary>

- **Archivo:** `src/app/(dashboard)/clientes/actions.ts:114-233`
- **Problema:** deleteCliente borra cotizaciones en cascada (cotizacion_items → cotizaciones → cliente), mergeClientes re-apunta ventas/cotizaciones y borra el origen, y eliminarVenta borra venta_items/venta_socios/venta — todo sin registrar quién, cuándo ni el estado previo. Sumado a la ausencia de identidad de usuario, una acción destructiva (accidental o maliciosa con la cookie) es irreversible y no rastreable. Para datos financieros (afectan ROI/KPIs) es un riesgo de integridad y de cumplimiento al escalar.
- **Recomendación:** Crear una tabla `audit_log` (action, entidad, entidad_id, payload_anterior jsonb, timestamp, ip) y escribir desde un wrapper común en las acciones destructivas/financieras. Idealmente registrar también el usuario una vez exista identidad. Considerar soft-delete (ya hay setClienteActivo) como default en vez de borrado físico para registros financieros.
- **Beneficio esperado:** Trazabilidad de cambios financieros, capacidad de forense/rollback y base para cumplimiento al escalar.

</details>

<details>
<summary><strong>[Medio] #154 — Validación de inputs ad-hoc y sin esquema (sin Zod) en todas las server actions</strong> · Mantenibilidad · Imp 4/Cpx 5 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:43-148`
- **Problema:** Ninguna server action usa un esquema de validación declarativo; la validación es manual e inconsistente. saveVenta inserta subtotal/iva/descuento/costo_* sin verificar que sean finitos o no-negativos; cliente_id no se valida como UUID; updateCliente/crearProducto confían en los tipos de TS (que no existen en runtime — el payload llega por la red). Esto multiplica la probabilidad de los bugs de validación que, con service_role, tienen radio de explosión total.
- **Recomendación:** Adoptar Zod por action: definir un schema, hacer `schema.parse(input)` al entrar y derivar el tipo del schema (z.infer). Centralizar en un helper `validatedAction(schema, fn)` que valide y, de paso, revalide la sesión (defensa en profundidad). Validar UUIDs con z.string().uuid() y montos con z.number().nonnegative().finite().
- **Beneficio esperado:** Una sola fuente de verdad de validación por action; elimina la dependencia de tipos TS inexistentes en runtime; reduce sistemáticamente la superficie de bugs explotables.

</details>

<details>
<summary><strong>[Bajo] #171 — Mensajes de error de Postgres devueltos crudos al cliente (fuga de detalles internos)</strong> · Seguridad · Imp 3/Cpx 2 · 2-3h</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:71-134`
- **Problema:** Múltiples actions devuelven `error.message` de Supabase/Postgres directamente al cliente (saveVenta:72,83,102; submitOrder:207,273,293; pedidos/clientes varios). Esos mensajes exponen nombres de tablas/columnas, constraints y a veces fragmentos de la query, dando a un atacante información sobre el esquema. En el portal público (submitOrder) esto es especialmente indeseable porque llega a usuarios anónimos.
- **Recomendación:** Devolver mensajes genéricos al cliente ('No se pudo guardar, intenta de nuevo') y registrar el detalle solo en server logs (console.error ya se usa en algunos). Mapear errores conocidos (p.ej. unique violation → 'Ya existe') sin exponer el texto crudo de Postgres.
- **Beneficio esperado:** Evita la fuga de detalles del esquema, sobre todo en la superficie pública, sin perder capacidad de diagnóstico en logs.

</details>

<details>
<summary><strong>[Bajo] #184 — verDocumento genera signed URL para cualquier filename sin verificar pertenencia</strong> · Seguridad · Imp 3/Cpx 3 · 1-2h</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/actions.ts:771-778`
- **Problema:** verDocumento(filename) recibe un filename arbitrario del cliente y devuelve un signed URL de 1h al bucket privado (storage-docs.ts:48-56) sin comprobar que ese filename corresponda a un documento existente en pedido_documentos/pedido_pagos. Hoy el impacto es bajo porque todos los usuarios internos ven todo, pero es un patrón de IDOR latente: cuando se introduzcan roles, un usuario podría enumerar/obtener documentos de pedidos que no le corresponden adivinando nombres (formato `doc-<pedidoId>-<timestamp>.<ext>` es predecible).
- **Recomendación:** Antes de firmar, verificar que el filename existe en pedido_documentos.filename / pedido_pagos.comprobante_url / etc. (y, cuando haya roles, que el pedido sea accesible para el usuario). Rechazar nombres no encontrados. Usar nombres con sufijo aleatorio (no solo Date.now()) para que no sean adivinables.
- **Beneficio esperado:** Cierra el IDOR latente de documentos antes de introducir roles y endurece la privacidad de comprobantes/facturas.

</details>


### Performance

El ERP funciona bien hoy porque los volúmenes son diminutos (~42 ventas, pocos clientes), pero la arquitectura de rendimiento está construida sobre dos antipatrones sistémicos que NO escalan: (1) las páginas servidoras traen tablas completas sin filtrar (ventas, venta_items, cotizacion_items, todas las ventas para gráficas) y las agregaciones/predicciones se hacen en JS en lugar de SQL; (2) los dashboards son componentes "use client" gigantes (2245, 1775, 1595 líneas) que arrastran @tanstack/react-table + recharts + el motor de predicción CDF al bundle del navegador, sin code-splitting ni memoización del lado servidor. Hay cero capacidad de caché (ningún unstable_cache/revalidate/React cache en lecturas), un waterfall recurrente con getInternalClienteIds() ejecutándose secuencialmente antes del Promise.all en 12 sitios, y un doble fetch completo de venta_items en /ventas. Además framer-motion (~50KB+) está en dependencias pero NUNCA se importa: peso muerto. Apple/Linear/Stripe no aprobarían enviar el motor de cálculo financiero al cliente ni traer la tabla entera para paginar 10 filas. Para 2-3 usuarios internos es tolerable; como producto de clase mundial o multi-tenant, es deuda de rendimiento seria.

**¿Qué falta?** Una capa de caché (ninguna lectura usa `unstable_cache`/`revalidate`/`React cache`; cada navegación re-ejecuta 15+ queries). Agregaciones en SQL (RPC/vistas materializadas) en lugar de traer tablas enteras y reducir en JS/cliente. Code-splitting con `next/dynamic` para Recharts y los drawers/modales pesados. `optimizePackageImports` en next.config para lucide-react/recharts.

**¿Qué sobra?** `framer-motion` en package.json (0 imports reales — verificado con grep). El doble fetch de `venta_items` en `/ventas/page.tsx`. La columna `costo_envio_mxn` vestigial (no es performance pero es ruido). Probablemente parte del JS de react-table que viaja al cliente para listas de <50 filas.

**¿Qué simplificar?** Mover los `enriched`/`predByCliente`/`tiposData` del cliente al servidor (o a SQL): hoy el navegador recibe TODAS las ventas + items + cotizaciones y reconstruye métricas con Maps y un modelo CDF empírico por cliente. Eso debería precomputarse server-side y mandar solo el resultado.

**¿Qué automatizar / qué haría la IA?** Reemplazar las agregaciones manuales (ventas mensuales, ventas por tipo, ticket promedio, frecuencia, predicción de próxima compra) por funciones SQL o vistas, dejando al cliente solo el render. La predicción de compras es el candidato #1: es lógica determinista que puede vivir en una RPC de Postgres o en un endpoint cacheado, no recalcularse en cada render del navegador.

**¿Qué genera fricción?** El waterfall `getInternalClienteIds()` → `Promise.all` añade un round-trip a Supabase en CADA carga de /dashboard, /ventas, /clientes, /cotizaciones (12 sitios). Los componentes de 2000+ líneas tienen TTI alto: el navegador debe parsear/hidratar ~60KB+ de JS de tabla+charts+predicción antes de ser interactivo.

**¿Qué confunde?** Tener `precio_mxn_calculado` y agregaciones tanto en la vista SQL como recalculadas en JS duplica la fuente de verdad. Y mezclar `supabase` (service role) con `admin` en la misma página sin un patrón claro de por qué uno u otro.

**Veredicto de prioridad:** ninguno es Crítico (no hay pérdida de datos ni caída con el volumen actual), pero el conjunto de "traer todo + computar en cliente + sin caché + bundles gigantes" es lo que impediría escalar. Empezar por: quitar framer-motion, arreglar el doble fetch de venta_items, paralelizar getInternalClienteIds, y mover predicción/agregaciones a servidor.

**Hallazgos (11):**

<details>
<summary><strong>[Alto] #36 — Componentes 'use client' de 1500-2245 líneas con react-table + recharts + predicción en el mismo bundle</strong> · Performance · Imp 6/Cpx 5 · 1d</summary>

- **Archivo:** `src/app/(dashboard)/clientes/clientes-dashboard.tsx:1-60, 1281-1294`
- **Problema:** clientes-dashboard.tsx (2245 líneas), cotizaciones-list.tsx (1775) y ventas-table-premium.tsx (1595) son client components monolíticos. clientes-dashboard importa @tanstack/react-table completo, lib-prediccion, y renderiza RecurrenciaAnalytics/EstimadoIngresos/PrediccionInsights (que importan recharts) sin code-splitting. Todo ese JS (react-table ~14KB + recharts pesado + d3 deps + el árbol de componentes) se descarga y parsea antes de la interactividad, en cada una de estas rutas. No hay un solo `next/dynamic`/`React.lazy` en el repo (verificado por grep).
- **Recomendación:** Cargar los sub-paneles con charts vía `next/dynamic(() => import(...), { ssr: false })` (RecurrenciaAnalytics, EstimadoIngresos, ventas-por-tipo, chart-historico-proyeccion) para que recharts solo entre cuando se rendericen. Extraer la definición de columnas y celdas a archivos separados. Considerar reemplazar react-table por render simple cuando la lista es <100 filas.
- **Beneficio esperado:** Recharts y paneles analíticos dejan de bloquear el render inicial de la tabla. Bundle inicial de estas rutas baja notablemente; TTI mejora.
- **Verificación:** confirmado — Hechos técnicos verificados, todos ciertos:

1) Tamaños exactos (wc -l): clientes-dashboard.tsx = 2245, cotizaciones-list.tsx = 1775, ventas-table-premium.tsx = 1595 líneas. Los tres son client components ("use client" en línea 1).

2) clientes-dashboard.tsx:7-21 importa @tanstack/react-table completo (useReactTable + 5 row models: core/expanded/filtered/pagination/sorted). package.js

</details>

<details>
<summary><strong>[Medio] #87 — Cero caché en lecturas: cada navegación re-ejecuta 15+ queries a Supabase</strong> · Performance · Imp 5/Cpx 5 · 1d</summary>

- **Archivo:** `src/app/(dashboard)/page.tsx:125-216`
- **Problema:** Ninguna lectura usa `unstable_cache`, `revalidate`, `React.cache` ni etiquetas de caché (verificado por grep: solo aparecen `revalidatePath` en pedidos/actions y un `force-dynamic` en /order). El dashboard principal dispara 15 queries en cada visita; /ventas, /clientes, /cotizaciones repiten sus baterías completas en cada navegación. Datos como inversiones, socios, categorías y catálogos casi nunca cambian pero se re-leen siempre.
- **Recomendación:** Envolver lecturas estables (socios, inversiones, getInternalClienteIds, catálogos) en `unstable_cache`/`React cache` con `revalidate` razonable y `revalidateTag` al mutar (ya hay infra de revalidatePath en pedidos). Para Next 16, usar `use cache` + cacheTag/updateTag. Empezar por getInternalClienteIds (cambia casi nunca).
- **Beneficio esperado:** Menos round-trips a Supabase por navegación, TTFB más bajo y menor costo de base de datos al crecer el tráfico.

</details>

<details>
<summary><strong>[Medio] #99 — Predicción de compras y enriquecimiento de clientes se computan en el navegador con TODAS las ventas/items/cotizaciones</strong> · Performance · Imp 5/Cpx 6 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/clientes/clientes-dashboard.tsx:328-419`
- **Problema:** /clientes/page.tsx manda al cliente TODAS las ventas, TODOS los venta_items (sin filtro, línea 40-45 de page.tsx) y todas las cotizaciones. El componente 'use client' reconstruye Maps por cliente (`enriched`, líneas 328-407) y luego ejecuta el modelo CDF empírico `predecirCompra` por cada cliente (líneas 412-419). Todo ese cómputo financiero/predictivo corre en el hilo principal del navegador en cada render inicial, y el payload de hidratación incluye datasets completos. Con cientos de clientes y miles de ventas esto bloquea el hilo y dispara el tamaño del HTML/JSON de RSC.
- **Recomendación:** La recomendacion original es buena y se mantiene: precomputar `enriched` y `predByCliente` en el server component (lib-prediccion.ts es logica pura, corre igual en server) y pasar al cliente solo el resultado agregado por cliente (ltv, ticket, frecuencia, prediccion). El cliente solo renderiza/ordena/pagina/filtra. Mejora adicional NO mencionada por el auditor: independientemente de donde corra, refactorizar predecirCompra para recibir las ventas YA agrupadas por cliente (o un Map<cliente_id, ventas[]>) en vez de re-filtrar todo el arreglo por cada cliente — eso elimina la complejidad O(clientes x ventas) y la baja a O(ventas). Tambien: venta_items NO necesita enviarse completo a /clientes; solo se usa en drill-down, asi que cargarlo bajo demanda (server action por cliente al expandir) reduce el payload de hidratacion. Dada la escala actual, tratar como deuda tecnica de escalabilidad, no como fix urgente.
- **Beneficio esperado:** Reduce drásticamente el payload de hidratación (no se mandan venta_items crudos), libera el hilo principal, y permite cachear el resultado. Mejora directa de TTI en la vista más pesada.
- **Verificación:** ajustado — Las afirmaciones tecnicas del hallazgo son CORRECTAS y verificadas en codigo:

1) page.tsx envia datasets completos al cliente sin filtro de tamano:
- ventas: admin.from("ventas").select(...).order("fecha") — src/app/(dashboard)/clientes/page.tsx:28-35 (sin limit ni rango)
- cotizaciones: select(...).order("fecha") — page.tsx:36-39 (sin limit)
- venta_items: admin.from("venta_items").se

</details>

<details>
<summary><strong>[Medio] #100 — Listas con react-table traen el dataset completo (limit 500/2000) y paginan en cliente</strong> · Escalabilidad · Imp 5/Cpx 6 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/page.tsx:16-41`
- **Problema:** cotizaciones-list, ventas-table-premium y clientes-dashboard usan `getPaginationRowModel` (paginación client-side). La página servidora trae hasta 500 cotizaciones + TODOS los cotizacion_items + TODAS las ventas (líneas 31-41), y ventas/page trae hasta 2000 ventas. Es decir: se descarga el universo completo para mostrar 10-25 filas paginadas en el navegador. El filtrado/búsqueda también ocurre sobre el array completo en cliente.
- **Recomendación:** Cuando el volumen lo justifique, migrar a paginación/búsqueda server-side (range() de Supabase + count exact) con searchParams en el server component, devolviendo solo la página visible. A corto plazo, dejar de traer cotizacion_items completos solo para KPIs: agregarlos en SQL.
- **Beneficio esperado:** Payload y memoria del navegador acotados independientemente del crecimiento de datos; búsqueda escalable.

</details>

<details>
<summary><strong>[Medio] #107 — framer-motion en dependencias pero nunca importado (peso muerto en el árbol de deps)</strong> · Mantenibilidad · Imp 4/Cpx 1 · 15min</summary>

- **Archivo:** `package.json`
- **Problema:** framer-motion ^12.38.0 está declarado pero grep no encuentra NINGÚN import de 'framer-motion' ni uso de `motion.` en todo src (0 resultados). CLAUDE.md lo menciona en el stack pero el código actual usa animaciones CSS. Es una dependencia pesada (~50-100KB) que infla node_modules, lockfile y tiempos de instalación/CI, y arriesga que alguien la importe 'porque está'.
- **Recomendación:** `npm uninstall framer-motion`. Verificar build. Actualizar la línea del stack en CLAUDE.md si ya no se usa.
- **Beneficio esperado:** node_modules y lockfile más livianos, instalaciones/CI más rápidos, sin riesgo de re-introducir una dep pesada por inercia.

</details>

<details>
<summary><strong>[Medio] #117 — getInternalClienteIds() ejecutado secuencialmente antes del Promise.all en 12 sitios (waterfall)</strong> · Performance · Imp 4/Cpx 2 · 1-2h</summary>

- **Archivo:** `src/app/(dashboard)/clientes/page.tsx:53`
- **Problema:** En /clientes/page.tsx (línea 53) y /cotizaciones/page.tsx (línea 45) la llamada `await getInternalClienteIds()` ocurre DESPUÉS del Promise.all, y en /ventas/page.tsx (línea 18) y /dashboard ANTES, pero en todos los casos es un round-trip secuencial extra a Supabase, fuera del paralelismo. Son 12 call sites (grep). Es una query trivial (`select id where is_internal`) que añade latencia en serie a cada página.
- **Recomendación:** Incluir getInternalClienteIds() DENTRO del Promise.all de cada página (o cachearla con React.cache/unstable_cache ya que el set es prácticamente estático). El filtrado por internalIds puede hacerse después en memoria igual que ahora.
- **Beneficio esperado:** Elimina un round-trip secuencial por carga en las 4 vistas principales; cacheado, lo elimina casi por completo.

</details>

<details>
<summary><strong>[Medio] #144 — Doble fetch completo de venta_items en /ventas (segunda query fuera del Promise.all = waterfall)</strong> · Performance · Imp 4/Cpx 4 · 2-3h</summary>

- **Archivo:** `src/app/(dashboard)/ventas/page.tsx:47-58, 80-94`
- **Problema:** La página trae venta_items DOS veces: primero en el Promise.all (líneas 47-53, con productos.peso/imagen_url) y luego OTRA VEZ la tabla completa de venta_items fuera del Promise.all (líneas 80-85, con productos.categorias) para construir 'Ventas por Tipo'. La segunda query es secuencial (await suelto tras el Promise.all), añadiendo un round-trip extra, y duplica la transferencia de toda la tabla de items. Con miles de items esto escala linealmente mal y duplica el ancho de banda Supabase.
- **Recomendación:** Fusionar las dos queries de venta_items en UNA sola dentro del Promise.all, seleccionando el superset: `venta_id, cantidad, precio_unitario, costo_unitario, subtotal, productos(id, sku, nombre, peso, imagen_url, categorias(nombre))` con `.order("sort_order")`. Derivar en memoria tanto `venta_items` (VentaItemRow) como `itemsConCat` del mismo array, aplicando el filtro internalVentaIds una sola vez. Esto elimina el round-trip secuencial y la doble transferencia con riesgo casi nulo. La vista/RPC con GROUP BY categoria queda como optimización futura solo si el volumen de venta_items crece a miles; hoy (~373 items) no se justifica la complejidad SQL adicional.
- **Beneficio esperado:** Elimina un round-trip secuencial y ~50% de la transferencia de la tabla de items en esta página. TTFB más bajo y costo Supabase reducido.
- **Verificación:** ajustado — CONFIRMADO el doble fetch de venta_items. En src/app/(dashboard)/ventas/page.tsx:47-53 el Promise.all trae venta_items con `venta_id, cantidad, precio_unitario, costo_unitario, subtotal, productos(id, sku, nombre, peso, imagen_url)` (sin filtro, tabla completa). Luego en page.tsx:80-85, FUERA del Promise.all y con `await` suelto, se vuelve a traer venta_items con `cantidad, subtotal, ve

</details>

<details>
<summary><strong>[Medio] #145 — Gráfica de ventas mensuales: se trae TODA la tabla ventas para agregar por mes en memoria</strong> · Base de datos · Imp 4/Cpx 4 · 3-4h</summary>

- **Archivo:** `src/app/(dashboard)/page.tsx:143-148`
- **Problema:** `ventasAllRes` hace `select(id, fecha, total, ganancia, estatus, cliente_id)` de TODAS las ventas sin límite (líneas 143-148) solo para construir la serie mensual del MonthlyChart. Es una agregación `GROUP BY mes` clásica que se está haciendo trayendo filas crudas al servidor Node y reduciéndolas en JS. Mismo patrón en /ventas (limit 2000) y /clientes (sin límite).
- **Recomendación:** Crear una vista o RPC SQL `vista_ventas_por_mes` que devuelva (mes, total, ganancia, count) ya agregado y traer solo eso. Para KPIs del mes/mes anterior ya se usa `.gte/.lte` correctamente; aplicar el mismo principio a la serie histórica.
- **Beneficio esperado:** La carga del dashboard deja de crecer con el número total de ventas; transferencia y CPU constantes.

</details>

<details>
<summary><strong>[Bajo] #172 — next.config sin optimizePackageImports ni configuración de imágenes</strong> · Performance · Imp 3/Cpx 2 · 2-3h</summary>

- **Archivo:** `next.config.ts:22-28`
- **Problema:** next.config.ts solo define security headers. No usa `experimental.optimizePackageImports` para lucide-react/recharts/@tanstack (lucide-react se importa por icono en docenas de archivos y sin tree-shaking dirigido puede arrastrar más de lo necesario), ni define `images` (remotePatterns para el bucket de Supabase). El proyecto usa <img> directo (0 usos de next/image en src), perdiendo optimización/lazy/responsive de imágenes de producto.
- **Recomendación:** Añadir `experimental: { optimizePackageImports: ['lucide-react', 'recharts', '@tanstack/react-table'] }` y configurar `images.remotePatterns` para el dominio del bucket Supabase, luego migrar las imágenes de producto a next/image (con buildProductoImageUrl). Verificar bundle con `next build`.
- **Beneficio esperado:** Tree-shaking más agresivo de íconos/charts, imágenes optimizadas y lazy por defecto, menor bundle y mejor LCP en inventario/order.

</details>

<details>
<summary><strong>[Bajo] #185 — 31 ResponsiveContainer de Recharts repartidos en 9 archivos cliente sin lazy-load</strong> · Performance · Imp 3/Cpx 3 · 3-4h</summary>

- **Archivo:** `src/app/(dashboard)/clientes/recurrencia-analytics.tsx:5-16`
- **Problema:** Recharts se importa estáticamente en 9 componentes (grep: 9 archivos, 31 ResponsiveContainer). Recharts arrastra dependencias de d3 y es de las libs más pesadas del bundle. Al importarse estáticamente en dashboards que también contienen la tabla principal, su peso entra en el chunk de la ruta aunque el usuario no haya hecho scroll hasta la gráfica.
- **Recomendación:** Envolver cada componente que use recharts en `next/dynamic(..., { ssr: false, loading: skeleton })`. Así recharts se carga en un chunk aparte bajo demanda. Combinable con el finding de code-splitting de paneles.
- **Beneficio esperado:** Recharts sale del chunk inicial de las rutas; descarga diferida mejora TTI sin afectar funcionalidad.

</details>

<details>
<summary><strong>[Bajo] #200 — Memoización ausente en componentes de fila/celda de tablas grandes</strong> · Performance · Imp 2/Cpx 3 · 3-4h</summary>

- **Archivo:** `src/app/(dashboard)/clientes/clientes-dashboard.tsx:580`
- **Problema:** Aunque hay buen uso de useMemo para agregados (enriched, predByCliente, kpis), las definiciones de columnas de react-table y los renderers de celda no están envueltos en componentes memoizados; cualquier cambio de estado en el dashboard gigante (filtro, búsqueda, expand) re-renderiza todo el árbol de celdas. Con paginación client-side sobre 500+ filas esto puede causar jank al escribir en el buscador.
- **Recomendación:** Extraer las celdas pesadas a componentes con React.memo, estabilizar callbacks con useCallback, y considerar debounce en el input de búsqueda. Mayor beneficio cuando crezcan las filas.
- **Beneficio esperado:** Menos renders por interacción, escritura fluida en buscadores de tablas grandes.

</details>


### Escalabilidad

El sistema es una app mono-tenant de un solo negocio: contraseña compartida, sin org_id, sin RBAC, y todo el acceso a datos vía service_role que bypassa RLS. Para 2-3 usuarios internos y ~42 ventas funciona perfecto y es la decisión correcta HOY. Pero no escala en dos ejes: (1) volumen de datos — casi todas las páginas (dashboard, ventas, clientes, cotizaciones, inventario, estadísticas) hacen SELECT de tablas completas sin paginación y agregan en JS, degradándose entre 5k-50k filas y rompiéndose más allá; (2) número de tenants/usuarios — multi-empresa exige rediseñar auth, aislamiento y permisos desde cero. Cuellos secundarios: rate-limit in-memory inútil con varias instancias serverless, notificaciones por polling cada 8s, ausencia total de índices en tablas calientes, PDF en cliente, y restock de stock con read-modify-write sin atomicidad. El primer punto que duele al crecer es dashboard/estadísticas; el primer punto que duele al monetizar es la auth mono-tenant.

**¿Soportaría 100/1.000/10.000/100.000/1.000.000?** Dos dimensiones que se rompen distinto:

**Eje A — Volumen (un negocio que crece):**
- 100-1.000 ventas: OK. SELECT completos (ventas.limit(2000), venta_items sin límite, cotizaciones.limit(500)) caben en memoria. Falta de índices no se nota.
- 10.000 ventas (~80k venta_items): primer dolor. /ventas/estadisticas, /inventario y /clientes traen TODOS los venta_items históricos a la función y agregan en JS. Transfiere MB Postgres→función por render, latencia 2-8s, riesgo timeout/OOM. Sin índices, seq-scan.
- 100.000 ventas: se rompe. SELECT completos saturan memoria o exceden payload RSC; analytics falla o tarda >30s. /order con force-dynamic re-lee todo el catálogo en cada visita pública.
- 1.000.000: inviable sin re-arquitectura (agregaciones SQL/vistas materializadas, paginación, cursores).

**Eje B — Usuarios/tenants:**
- 100 usuarios del mismo negocio: auth de contraseña única ya es problema (sin auditoría, no se revoca a uno solo) pero aguanta; rate-limit in-memory ya NO sirve; polling de notificaciones genera ~12 req/s constantes.
- 1.000+ / multi-empresa: imposible sin rediseño. Sin org_id, RLS solo es deny-anon, service_role bypassa RLS. Límite más duro.

**Falta para clase mundial:** agregaciones SQL en vez de JS; paginación/cursores; índices; camino multi-tenant (org_id + RLS por tenant + JWT con claim + RBAC); rate-limit distribuido; notificaciones realtime con RLS; PDF server-side; atomicidad de stock.

**Simplificar:** el patrón traer-todo + filtrar Piel Canela interno en JS se repite en 5+ lugares; debería ser un WHERE en SQL.

**Hallazgos (9):**

<details>
<summary><strong>[Medio] #73 — Rate-limit in-memory no funciona con múltiples instancias serverless</strong> · Escalabilidad · Imp 5/Cpx 4 · 1d</summary>

- **Archivo:** `src/lib/rate-limit.ts:14-57`
- **Problema:** El rate-limiter guarda buckets en un Map de módulo en memoria del proceso (línea 14). En Vercel cada instancia tiene su proceso; con varias instancias un atacante distribuye intentos y cada una cuenta desde 0, multiplicando el límite efectivo. Protege /login (login/actions.ts:43), /order (order/actions.ts:131) y lookup por teléfono (order/actions.ts:61). El propio comentario lo admite. Hoy con 1 instancia funciona; al escalar el tráfico del portal deja de ser garantía.
- **Recomendación:** Mover el contador a store distribuido (Vercel KV / Upstash Redis con INCR+EXPIRE) o complementar con regla de rate-limit en Vercel WAF sobre /login y /order (el WAF sí es global). Mantener in-memory como fallback.
- **Ejemplo:**

```
const { success } = await ratelimit.limit(`login:${ip}`); if(!success) return {error:'Demasiados intentos'}
```

- **Beneficio esperado:** Límite anti fuerza-bruta y anti-spam efectivo independiente del número de instancias.

</details>

<details>
<summary><strong>[Medio] #74 — Restock de inventario con read-modify-write en JS, sin atomicidad</strong> · Base de datos · Imp 5/Cpx 4 · 1d</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/actions.ts:557-578`
- **Problema:** El restock al cancelar lee stock_actual y luego escribe stock_actual = leído + cant en pasos separados por producto (559-568), en loop secuencial. Read-modify-write no atómico: dos operaciones concurrentes sobre el mismo producto pueden pisarse (lost update) y corromper inventario. Además 1 SELECT + 1 UPDATE por producto en serie (2N round-trips). El decremento de venta sí usa RPC (línea 248), pero el restock manual no. Hoy con un operador el riesgo es bajo; el portal /order y varios vendedores introducen concurrencia.
- **Recomendación:** Ajuste atómico en SQL: UPDATE inventario SET stock_actual = stock_actual + cant (incremento relativo en BD), idealmente en una RPC que reciba arrays (producto_id, cantidad) en una transacción. Eliminar el SELECT previo.
- **Ejemplo:**

```
update inventario set stock_actual=stock_actual+d.cant from (select unnest($1::uuid[]) producto_id, unnest($2::int[]) cant) d where inventario.producto_id=d.producto_id;
```

- **Beneficio esperado:** Elimina lost updates bajo concurrencia (integridad de inventario) y reduce round-trips de 2N a 1.

</details>

<details>
<summary><strong>[Medio] #75 — Portal /order con force-dynamic re-lee catálogo completo + vista_inventario en cada visita</strong> · Performance · Imp 5/Cpx 4 · 1d</summary>

- **Archivo:** `src/app/order/page.tsx:5-39`
- **Problema:** La página pública declara dynamic=force-dynamic (línea 5) y en cada request hace SELECT de productos activos con joins anidados (categorias, precios_producto, listas_precios) + SELECT completo de vista_inventario (28-39), todo con service_role. Es la página más expuesta a tráfico (clientes, campañas). Sin caché, cada visitante dispara 2 queries pesadas; vista_inventario recalcula derivados. Sin paginación del catálogo. A cientos de visitas simultáneas carga la BD innecesariamente.
- **Recomendación:** Cachear el catálogo con revalidación corta (revalidate 30-60s con tag invalidado al cambiar stock/precios) en vez de force-dynamic; el stock casi-en-tiempo-real tolera 30-60s. Alternativa: separar catálogo (caché largo) de stock (consulta ligera). Paginar/virtualizar si crece.
- **Ejemplo:**

```
export const revalidate = 45 // + revalidateTag('catalogo') al editar productos/stock
```

- **Beneficio esperado:** Reduce carga de BD del endpoint público (de O(visitas) a O(invalidaciones)); páginas más rápidas y menor costo Supabase.

</details>

<details>
<summary><strong>[Medio] #88 — Notificaciones por polling global cada 8s — escala con usuarios y full-scan</strong> · Escalabilidad · Imp 5/Cpx 5 · 2-3d</summary>

- **Archivo:** `src/components/notifications.tsx:134-144`
- **Problema:** Cada campanita hace polling cada 8s llamando getNotificacionesNoLeidas, un SELECT * de notificaciones leida=false (notifications-actions.ts:38-50) vía service_role. Con N usuarios abiertos son N/8 req/s constantes, todas trayendo hasta 20 filas con PII, sin filtro por usuario ni tenant. A 100 usuarios ~12 req/s permanentes. Sin índice sobre notificaciones.leida/created_at. Razonable hoy con 2-3 personas, no escala.
- **Recomendación:** Para escala: Supabase Realtime con RLS por tenant/usuario (websocket único) cuando exista org_id. Mientras: subir intervalo, detectar 'hay nuevas' barato con count:'exact',head:true y traer detalle solo al abrir el panel; indexar notificaciones(leida, created_at desc).
- **Ejemplo:**

```
create index if not exists idx_notif on notificaciones(leida, created_at desc);
supabase.from('notificaciones').select('id',{count:'exact',head:true}).eq('leida',false)
```

- **Beneficio esperado:** Elimina carga constante O(usuarios) sobre la BD; menor latencia (push vs poll) y costo acotado.

</details>

<details>
<summary><strong>[Medio] #105 — Arquitectura mono-tenant sin org_id ni RLS por tenant: imposible multi-empresa sin re-arquitectura</strong> · Escalabilidad · Imp 5/Cpx 9 · 3-6 sem</summary>

- **Archivo:** `src/lib/supabase/server.ts:20-43`
- **Problema:** Toda la app lee/escribe con SERVICE_ROLE key (server.ts y admin.ts), que bypassa RLS. RLS solo bloquea al rol anon, NO aisla por empresa. No hay org_id en ninguna tabla ni claim de tenant en el JWT (auth.ts firma {role:'erp'} fijo). Correcto para un negocio, pero multi-empresa/SaaS no es parche: requiere rediseñar auth, aislamiento y permisos. Cualquier feature multi-tenant sobre service_role filtraría datos entre clientes. Techo arquitectónico más duro.
- **Recomendación:** La recomendación original es sólida y correcta en lo técnico (org_id NOT NULL, org_id como claim JWT, RLS real con auth.jwt()->>'org_id', migrar lecturas a client autenticado, RBAC). Ajuste de prioridad: dado que NO se vende como SaaS hoy, la acción correcta AHORA es la opción (5) que el propio auditor menciona: documentar formalmente la decisión mono-tenant como límite arquitectónico conocido (en CLAUDE.md o un ADR), para que cualquier futura solicitud de "agregar otra empresa/sucursal" dispare un proyecto de re-arquitectura consciente y no un parche peligroso sobre service_role. No invertir en (1)-(4) hasta que exista un requisito multi-tenant real — sería sobre-ingeniería para 2-3 usuarios. Si llega ese requisito: el orden correcto es JWT con identidad de usuario real (reemplazar el {role:'erp'} compartido) ANTES que org_id/RLS, porque sin identidad de usuario el RLS por tenant no tiene de dónde leer el claim.
- **Ejemplo:**

```
alter table ventas add column org_id uuid not null;
create policy tenant on ventas using (org_id=(auth.jwt()->>'org_id')::uuid);
```

- **Beneficio esperado:** Habilita vender el ERP a múltiples empresas con aislamiento por la BD.
- **Verificación:** ajustado — Hallazgo técnicamente CORRECTO en todos sus puntos, verificado contra el código:

1. server.ts:23-25 — createServerClient se instancia con SUPABASE_SERVICE_ROLE_KEY (no anon). El propio docblock (líneas 7, 17) confirma "Usa el SERVICE ROLE key → bypassa RLS (acceso total a la BD)" y "Antes este cliente usaba el ANON key, pero con RLS activado el anon ya no tiene acceso".

2. admin.ts:16

</details>

<details>
<summary><strong>[Medio] #118 — Sin índices en columnas calientes de ventas/cotizaciones/items</strong> · Base de datos · Imp 4/Cpx 2 · 2h</summary>

- **Archivo:** `scripts/enable-rls.sql`
- **Problema:** Los únicos CREATE INDEX del repo son para tablas de pedidos. No hay índices en ventas.fecha (order/gte/lte en page.tsx:154, ventas/page.tsx:37, actions.ts:219-223), ventas.cliente_id, venta_items.venta_id, venta_items.producto_id, cotizaciones.cliente_id/estatus/numero, ni clientes.telefono (ilike '%digits%' en order/actions.ts:68 y 180). Sin índices cada filtro/order es seq-scan; el ilike '%...%' nunca usa índice. A 10k-100k filas multiplica la latencia de todas las páginas.
- **Recomendación:** Mantener la lista de índices propuesta como mejora preventiva (no urgente al volumen actual): CREATE INDEX en ventas(fecha desc), ventas(cliente_id), ventas(cotizacion_id), venta_items(venta_id), venta_items(producto_id), cotizaciones(cliente_id), cotizaciones(estatus). El índice en cotizaciones(numero) probablemente ya está cubierto si numero es UNIQUE — verificar antes de duplicar. Para el portal /order: agregar columna generada telefono_digits (regexp_replace(telefono,'\\D','','g')) con índice btree y cambiar order/actions.ts:68 y :180 de ilike('telefono','%x%') a eq por telefono_digits (o prefijo con LIKE 'x%'), que sí usa índice. Priorizar todo esto por debajo de hallazgos con impacto presente; reevaluar a Alto cuando ventas/venta_items superen ~10k filas o se habilite multi-tenant.
- **Ejemplo:**

```
create index if not exists idx_ventas_fecha on ventas(fecha desc);
create index if not exists idx_venta_items_venta on venta_items(venta_id);
create index if not exists idx_venta_items_producto on venta_items(producto_id);
```

- **Beneficio esperado:** Queries de listas y joins de seq-scan O(n) a index O(log n); mejora directa de latencia. Bajísimo costo.
- **Verificación:** ajustado — Hechos técnicos VERIFICADOS y correctos. Los únicos CREATE INDEX del repo son para tablas de pedidos: scripts/add-pedido-pagos.sql:23, scripts/add-pedido-envios.sql:16, scripts/add-pedido-conversiones.sql:23, scripts/add-documentos-pedidos.sql:26. enable-rls.sql no crea ningún índice. No hay índice declarado para ventas/cotizaciones/venta_items/clientes en ningún .sql.

Patrones de quer

</details>

<details>
<summary><strong>[Bajo] #160 — Límites fijos (limit 500/2000) usados como techo en vez de paginación real</strong> · Arquitectura · Imp 4/Cpx 5 · 1 sem</summary>

- **Archivo:** `src/app/(dashboard)/ventas/page.tsx:38`
- **Problema:** Las listas grandes usan límites arbitrarios: ventas .limit(2000) (ventas/page.tsx:38), cotizaciones .limit(500) (cotizaciones/page.tsx:27). No es paginación, es corte duro: superado el límite las páginas muestran datos incompletos SILENCIOSAMENTE (KPIs y dashboards sobre subconjunto truncado → números incorrectos sin aviso). /clientes y /inventario no tienen límite (traen todo). A miles de ventas el dashboard mostraría cifras erróneas sin que nadie lo note.
- **Recomendación:** Sustituir límites duros por paginación server-side real (range/cursor) y mover KPIs/totales a agregados SQL que no dependan de cuántas filas se cargaron. Así los números son siempre correctos.
- **Ejemplo:**

```
supabase.from('ventas').select('*').order('fecha',{ascending:false}).range(from,to)
```

- **Beneficio esperado:** Evita KPIs financieros silenciosamente erróneos al crecer la data y elimina el techo arbitrario.

</details>

<details>
<summary><strong>[Bajo] #189 — Generación de PDF en el cliente con html2pdf/html2canvas — no apta para volumen ni servidor</strong> · Escalabilidad · Imp 3/Cpx 5 · 2-3d</summary>

- **Archivo:** `src/lib/pdf.ts:37-74`
- **Problema:** El PDF de cotizaciones se genera en el navegador con html2pdf.js + html2canvas a scale 2 (42-65). Depende del dispositivo (lento/crash en móviles con cotizaciones grandes), no permite generar en lote ni desde el servidor (adjuntar a email automático o API), y rasteriza a imagen (PDF pesado, texto no seleccionable). Para 2-3 usuarios uno a la vez es aceptable; no escala a automatización.
- **Recomendación:** Cuando se necesite automatizar/escalar, mover a server-side (Puppeteer en función con más memoria, o @react-pdf/renderer para PDF vectorial) y/o cola para lotes. Mantener html2pdf solo como descarga rápida del cliente.
- **Ejemplo:**

```
// función server: const buf = await page.pdf({format:'A4'}); return new Response(buf)
```

- **Beneficio esperado:** PDFs consistentes, ligeros, con texto seleccionable, generables en servidor/lote para automatización (emails, API).

</details>

<details>
<summary><strong>[Bajo] #190 — Analytics carga tablas completas a memoria y agrega en JS (no en SQL)</strong> · Performance · Imp 3/Cpx 6 · 1-2 sem</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:242-316`
- **Problema:** getVentasStats trae TODOS los venta_items históricos sin filtro ni paginación (243-247) y reduce en JS (268-316). Mismo patrón en ventas/page.tsx (48-94), clientes/page.tsx (28-50), inventario/page.tsx (41-92). Con 80k+ items transfiere MB Postgres→función por render, consume memoria serverless y serializa todo al RSC. Latencia 2-8s a 10k ventas, timeout/OOM a 100k.
- **Recomendación:** Recomendación válida pero priorizada al contexto real:
1) HOY (quick win, sin esperar escala): eliminar el doble full-scan de venta_items en ventas/page.tsx — reutilizar el resultado de 47-53 para derivar itemsConCat en vez de la segunda query 80-85. Una sola lectura.
2) Top-N en BD donde ya se hace slice tras ordenar en JS: `.order(...).limit(N)` para top productos/clientes.
3) DIFERIR (no urgente a 373 filas): mover agregaciones (ventas/mes, top productos, stock/categoría) a vistas SQL con GROUP BY o RPC, y KPIs con count:'exact',head:true. Hacerlo solo si venta_items supera ~5-10k filas o si aparece latencia medible. Documentarlo como deuda técnica, no bloquear features por esto.
4) Añadir .limit() defensivo a las queries sin tope (clientes/page.tsx ventas/cotizaciones) por consistencia con el .limit(2000) ya presente en ventas/page.tsx:38.
- **Ejemplo:**

```
create view vista_top_productos as select p.id,p.nombre,sum(vi.cantidad) c,sum(vi.cantidad*vi.precio_unitario) t from venta_items vi join productos p on p.id=vi.producto_id group by 1,2 order by t desc;
```

- **Beneficio esperado:** Latencia O(resultado) en vez de O(filas totales); elimina OOM/timeout y baja el payload RSC de MB a KB.
- **Verificación:** ajustado — PATRÓN CONFIRMADO técnicamente, SEVERIDAD SOBREESTIMADA para el contexto real.

Evidencia del patrón (todo leído):
- src/app/(dashboard)/ventas/actions.ts:243-249 — getVentasStats hace `admin.from("venta_items").select(...)` SIN filtro/paginación/limit, trae TODOS los items históricos (comentario explícito en 238-241: "Pull TODOS los venta_items históricos... sin filtro"). Agrega en JS 

</details>


### UI / Design System

El ERP tiene un design system ambicioso y bien intencionado en globals.css (tokens `--pc-*`, clases `.pc-card`/`.pc-btn-*`/`.pc-table`, escala de radios, 3 niveles de sombra) que en la práctica casi nadie usa: las clases `.pc-btn-*` aparecen en 6 archivos, `.pc-card` en 2, el componente shadcn `<Button>` en 0, el componente `<GlassCard>` en 0, y el token `--primary` en 0. En su lugar las vistas pintan con utilidades Tailwind crudas (`gray-*`, hex inline, `style={{}}`) y CADA módulo improvisa su propio acento. Conviven DOS sistemas de color formales (Light theme V1.1 emerald/indigo/amber y la paleta IA Amatista púrpura) MÁS un tercero de facto (teal del CLAUDE.md), y los módulos los mezclan sin criterio: clientes = emerald+violet+teal, pedidos = indigo+emerald+teal, ventas = emerald+teal. La tipografía está fragmentada en ~24 tamaños arbitrarios en px (text-[10.5px], text-[12.5px], text-[9.5px]...) que conviven con la escala Tailwind. El dark mode está declarado (.dark en CSS, next-themes instalado) pero es no-funcional: no hay ThemeProvider ni toggle, y solo el botón shadcn (que nadie usa) trae variantes dark. focus-visible para accesibilidad existe en 3 archivos de un total con 35 archivos con onClick. No es que "se vea mal" —se ve premium en pantallas sueltas— sino que NO hay un sistema: hay 3 paletas, 24 tamaños de fuente y 9 valores de radio compitiendo, y el costo es deriva visual entre módulos y deuda que bloquea cualquier theming/dark-mode/multi-tenant futuro. Linear/Stripe NO aprobarían: su fortaleza es exactamente la restricción tonal y tipográfica que aquí falta.

**¿Completo?** Visualmente sí — todas las vistas están estilizadas y con cuidado. **¿Qué sobra?** Muchísimo: un design system entero (`.pc-*`, `<Button>`, `<GlassCard>`, tokens `--primary`/chart oklch de shadcn) definido pero no consumido. Es código muerto de diseño que confunde a quien edita ("¿uso `.pc-btn-primary` o pinto `bg-teal-600`?"). **¿Qué falta?** (1) Una sola fuente de verdad de color: hoy hay 3 paletas. (2) Escala tipográfica con nombres (no 24 px sueltos). (3) Un componente Button/Badge/Card real y obligatorio. (4) Dark mode funcional o eliminarlo. (5) focus-visible sistémico.

**¿Qué simplificar?** El número de decisiones por pantalla. Un dev hoy elige entre `gray-*` y `slate` (tokens), entre emerald/teal/indigo, entre `rounded-lg`/`xl`/`2xl`, entre `text-[11px]`/`text-[10.5px]`/`text-xs`. Esa carga cognitiva es la raíz de la inconsistencia.

**¿Qué automatizar / qué haría la IA?** Lo de mayor ROI: un agente que (a) consolide los 24 tamaños px en ~7 tokens semánticos vía codemod, (b) reemplace hex inline por var(--pc-*), (c) unifique gray→un solo neutral. Es trabajo mecánico, anclado, perfecto para codemod jscodeshift/regex con revisión.

**¿Qué genera fricción / confunde?** El CLAUDE.md dice "color primario teal-600" pero el design system v2 define `--pc-accent: #0F766E` (teal-700/emerald) y la paleta V1.1 dice emerald-700, y clientes es púrpura. Tres documentos, tres respuestas. Un dev nuevo no sabe cuál es EL color de marca.

**Calibración al contexto (2-3 usuarios internos):** Nada de esto es Crítico para operar hoy — la app funciona y se ve bien. Pero el encargo pide evaluar clase mundial / escalabilidad, y ahí la deuda de design-system es real: el día que quieran dark mode, white-label multi-tenant, o simplemente un rediseño coherente, hay que tocar cientos de hex inline y 24 tamaños sueltos en vez de cambiar tokens. Severidades calibradas: la mayoría Medio (mejora notable de mantenibilidad/coherencia), un par Alto (accesibilidad focus + dark mode roto que es trampa para el próximo dev), nada Crítico.

**Propuesta de tokens unificados (lo que recomendaría adoptar):**
- Color: UNA paleta. Si la marca es canela/bronceado, el primario debería ser `--pc-accent` (emerald/teal actual) consistente en TODOS los módulos; el púrpura amatista debería ser decisión global (toda la app) o eliminarse de clientes. No "verde en ventas, púrpura en clientes".
- Tipografía: `--text-xs/sm/base/lg/xl/2xl/display` (7 niveles) mapeados a las clases Tailwind; prohibir px arbitrarios.
- Radio: estandarizar a 3 (`rounded-lg` controles, `rounded-2xl` cards, `rounded-full` pills) — hoy hay 9.
- Neutral: un solo set (gray O slate, no ambos en CSS vs vistas).

**Hallazgos (10):**

<details>
<summary><strong>[Alto] #33 — focus-visible/accesibilidad de teclado ausente en la mayoría de interactivos</strong> · Accesibilidad · Imp 6/Cpx 4 · 2-3d</summary>

- **Archivo:** `src/components/sidebar-nav.tsx:34-58`
- **Problema:** Solo 3 archivos usan focus-visible (los forms de ventas/cotizaciones), frente a 35 archivos con onClick. El SidebarNav (componente de navegación principal) maneja hover vía onMouseEnter/onMouseLeave inline (líneas 47-58) y no define ningún estado focus para teclado: un usuario que navega con Tab no ve dónde está. El layout dashboard tiene botones (hamburger, cerrar drawer) sin focus ring. El `<Button>` shadcn SÍ trae focus-visible correcto (button.tsx:7) pero no se usa. Hay 10 archivos con onMouseEnter inline (anti-patrón: hover en JS en vez de CSS, además sin equivalente focus).
- **Recomendación:** Añadir `focus-visible:ring-2 focus-visible:ring-[var(--pc-accent)] focus-visible:outline-none` a todos los interactivos (Link, button). Reemplazar los onMouseEnter/onMouseLeave inline del sidebar por clases hover: + focus-visible: de Tailwind (CSS, no JS). Establecer un foco visible global en @layer base para a/button. WCAG 2.4.7 exige indicador de foco visible.
- **Ejemplo:**

```
// sidebar-nav.tsx: hover en JS (líneas 47-58) → CSS
// className="... hover:bg-white/45 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none"
```

- **Beneficio esperado:** Navegación por teclado usable, cumplimiento WCAG, requisito para vender a clientes enterprise/gobierno.
- **Verificación:** confirmado — Verificado contra el código real:

1. SidebarNav SÍ carece de foco de teclado. src/components/sidebar-nav.tsx:34-58 — el <Link> define hover vía onMouseEnter/onMouseLeave inline (47-58) que mutan element.style.background/color; NO hay ninguna clase focus-visible ni outline, y los estilos inline de active (38-46) no cubren :focus. Un usuario con Tab no recibe indicador visible. La barr

</details>

<details>
<summary><strong>[Medio] #89 — Tipografía fragmentada en ~24 tamaños arbitrarios en px</strong> · UI · Imp 5/Cpx 5 · 2-3d</summary>

- **Archivo:** `src/components/page-header.tsx:177, 197, 217, 239, 298, 314`
- **Problema:** Conviven la escala Tailwind (text-xs ×367, text-sm ×248) con ~600 usos de tamaños px arbitrarios en 24 valores distintos: text-[10px]×151, text-[11px]×125, text-[10.5px]×79, text-[9.5px]×50, text-[12.5px]×43, text-[12px]×33, text-[11.5px]×16, text-[8.5px], text-[7px], etc. page-header.tsx solo ya usa 10.5/26/34/9.5/11/10px. No existe escala tipográfica nombrada: cada componente elige el px que 'se ve bien'. Esto es exactamente lo que Linear/Stripe evitan con una escala fija de ~6-7 pasos.
- **Recomendación:** Definir ~7 tokens tipográficos semánticos (--text-caption 11px, --text-body 14px, --text-h3, etc.) y consolidar los 24 valores px a esos pasos vía codemod (regex de text-[Npx] → clase semántica). Prohibir px arbitrarios en lint. Diferencias de 0.5px (10 vs 10.5 vs 11) son ruido invisible que solo genera deuda.
- **Ejemplo:**

```
grep -rhoE 'text-\[[0-9.]+px\]' src | sort | uniq -c | sort -rn
# 151 text-[10px] / 125 text-[11px] / 79 text-[10.5px] / 50 text-[9.5px] ...(24 valores)
```

- **Beneficio esperado:** Ritmo tipográfico consistente, menos decisiones por componente, base para escalado responsivo y theming.

</details>

<details>
<summary><strong>[Medio] #90 — Estilos pintados con hex inline y style={{}} en vez de tokens — bloquea theming</strong> · Mantenibilidad · Imp 5/Cpx 5 · 3-4d</summary>

- **Archivo:** `src/app/(dashboard)/layout.tsx:43-148`
- **Problema:** 31 archivos usan `style={{}}` inline con colores hex hardcodeados en vez de los tokens var(--pc-*) que el DS ya define. El propio layout principal pinta rgba(255,255,255,0.85), #0F172A, #1B3022, #2D5A43, rgba(0,0,0,0.06) a mano (líneas 43-148). page-header.tsx hardcodea #64748B, #0F172A, #047857 en lugar de var(--pc-text-secondary)/var(--pc-accent). Esto significa que cambiar la marca o el modo oscuro requiere editar cientos de literales, no un token. Es la causa raíz de que el dark mode sea inviable.
- **Recomendación:** Sustituir hex/rgba inline por var(--pc-*) existentes (ya están definidos: --pc-text, --pc-accent, --pc-border, --pc-bg-card...). Donde falte token, añadirlo. Regla de lint/review: prohibir colores hex literales en componentes; deben venir de tokens.
- **Ejemplo:**

```
// layout.tsx:48 color:'#0F172A' → color:'var(--pc-text)'
// page-header.tsx:177 text-[#64748B] → text-[var(--pc-text-secondary)]
grep -rln 'style={{' src/app | wc -l  # 31
```

- **Beneficio esperado:** Cambiar marca/tema desde :root; habilita dark mode real; reduce drift (hoy el mismo verde aparece como #1B3022 aquí y #0F766E allá).

</details>

<details>
<summary><strong>[Medio] #103 — Tres paletas de color conviven sin jerarquía — deriva visual entre módulos</strong> · UI · Imp 5/Cpx 7 · 3-5d</summary>

- **Archivo:** `src/app/globals.css:127-186, 454-523`
- **Problema:** Coexisten 3 sistemas de color formales: (1) shadcn oklch grises (--primary etc, líneas 51-118), (2) 'Premium v2' emerald/teal `--pc-accent:#0F766E` (127-186), (3) 'IA Amatista' púrpura `--am-purple:#8B5CF6` (515-523). El CLAUDE.md además declara 'color primario teal-600' y la 'Light theme V1.1' declara emerald-700/indigo-600/amber-700. Resultado medido por módulo: clientes mezcla emerald(48)+violet(41)+teal(16), pedidos indigo(26)+emerald(22)+teal(16), ventas emerald(48)+teal(40), inventario emerald(25)+teal(15)+indigo(4). No hay UN color de marca: cada módulo improvisa. Linear/Stripe se basan en restricción tonal estricta; esto es lo contrario.
- **Recomendación:** La recomendación original es buena en dirección, pero el orden está invertido respecto a la evidencia. Priorizar así: (1) Resolver primero la contradicción de MARCA en el chrome global: decidir si la app es emerald (design system actual, charts, body) o amatista (sidebar). Hoy el sidebar (sidebar-nav.tsx:40,64,71,73) impone púrpura en todas las rutas mientras el resto es emerald — esa es la disonancia más visible y barata de arreglar. (2) Confinar amatista a una decisión global (re-skin completo) o eliminarla de clientes/sidebar; no dejarla como acento de un módulo + sidebar. (3) Recién entonces mapear utilidades crudas a tokens semánticos. Importante: el sistema de tokens ya existe (--pc-accent, --pc-info, --pc-warning) pero tiene adopción casi nula (1 archivo vs 318 usos crudos de teal/emerald); el trabajo real no es 'crear tokens' sino MIGRAR los 318 usos a tokens y añadir una regla de lint (ej. eslint-plugin-tailwindcss / clase prohibida) que impida volver a usar utilidades de color de marca crudas. (4) Actualizar CLAUDE.md: hoy declara simultáneamente 'primario teal-600', 'Light theme V1.1 emerald-700/indigo-600/amber-700' y 'Paleta actual IA Amatista' — tres fuentes de verdad que se contradicen; dejar una sola.
- **Ejemplo:**

```
// Hoy (3 verdades):
// CLAUDE.md: 'primario teal-600'
// globals.css: --pc-accent:#0F766E (emerald-ish)
// clientes: bg-violet-500
// Propuesta: un solo token semántico
:root { --pc-accent:#0F766E; --pc-accent-fg:#fff; }
// y en TODAS las vistas: className="bg-[var(--pc-accent)]" o util mapeada
```

- **Beneficio esperado:** Coherencia visual entre módulos (hoy parecen 3 productos distintos). Permite theming/white-label y cambios de marca tocando tokens, no cientos de clases.
- **Verificación:** ajustado — CONFIRMADO el hecho central: coexisten 3 sistemas de color sin jerarquía. Evidencia leída:

1) globals.css define 3 capas de tokens en 3 bloques :root separados: (a) shadcn oklch grises (globals.css:51-118), (b) 'Premium v2' emerald/teal con --pc-accent:#0F766E (globals.css:147-168), (c) 'IA Amatista' púrpura --am-purple:#8b5cf6 (globals.css:515-523). Las 3 paletas son reales y conviven

</details>

<details>
<summary><strong>[Medio] #135 — Radios de esquina inconsistentes — 9 valores distintos compitiendo</strong> · UI · Imp 4/Cpx 3 · 1d</summary>

- **Archivo:** `src/app/globals.css:42-48, 227-422`
- **Problema:** CLAUDE.md establece 'Bordes: rounded-2xl' como estándar, pero el uso real es: rounded-lg ×188, rounded-full ×177, rounded-xl ×173, rounded-md ×88, rounded-2xl ×82, rounded-sm ×5, rounded-[14px] ×4, rounded-[11px] ×1, rounded-3xl ×1. Además el DS mezcla unidades: la escala @theme usa múltiplos de --radius (0.625rem) pero las clases .pc-* hardcodean px (border-radius:20px en .pc-card, 14px en botones/inputs, 16px en kpi). Hay al menos 3 radios distintos para 'card' (20px pc-card, rounded-2xl glass-card, 16px kpi inline). No hay un radio canónico por tipo de superficie.
- **Recomendación:** Definir 3 radios canónicos por tipo: controles (botón/input) = 12-14px, cards = 16-20px, pills = full. Mapear a tokens (--radius-control, --radius-card) y unificar pc-card/glass-card/kpi al MISMO radio de card. Eliminar rounded-[11px]/rounded-3xl puntuales.
- **Ejemplo:**

```
grep -rhoE 'rounded-(2xl|xl|lg|md|sm|3xl|full|\[[0-9]+px\])' src | sort | uniq -c | sort -rn
# 188 lg / 177 full / 173 xl / 88 md / 82 2xl ... (9 valores)
```

- **Beneficio esperado:** Lenguaje de formas consistente; cards y botones con la misma 'familia' de esquinas en toda la app.

</details>

<details>
<summary><strong>[Medio] #146 — Neutral duplicado: el DS define slate, las vistas usan gray exclusivamente</strong> · UI · Imp 4/Cpx 4 · 1-2d</summary>

- **Archivo:** `src/app/globals.css:143-145`
- **Problema:** El design system define los grises de texto como slate (`--pc-text:#0F172A slate-900`, `--pc-text-secondary:#64748B slate-500`, `--pc-text-muted:#94A3B8 slate-400`), pero las vistas usan `gray-*` masivamente (gray-500 ×278, gray-400 ×242, gray-900 ×210...) y `slate-*` 0 veces como clase Tailwind. gray y slate son neutrales DISTINTOS (gray es puro, slate tiene tinte azul). El resultado: los textos de page-header (que usa #64748B = slate) no combinan exactamente con los textos de las vistas (gray-500 ≠ slate-500). Es una inconsistencia sutil pero presente en cada pantalla.
- **Recomendación:** Elegir UN neutral. Si el DS dice slate, migrar gray-*→slate-* vía codemod (o exponer --pc-text* como utilidades y usar esas). Lo importante: que el texto secundario del header y el de las tablas sean el MISMO tono.
- **Ejemplo:**

```
grep -rho 'gray-[0-9]+' src/app | wc -l  # cientos
grep -rho 'slate-[0-9]+' src/app | wc -l  # 0
// pero globals.css comenta 'slate-900', 'slate-500'...
```

- **Beneficio esperado:** Coherencia de los grises en toda la app; los textos dejan de tener tintes ligeramente distintos entre header y body.

</details>

<details>
<summary><strong>[Medio] #155 — El design system definido (.pc-*, Button, GlassCard) está casi sin usar — código de diseño muerto</strong> · Mantenibilidad · Imp 4/Cpx 6 · 1-2 sem</summary>

- **Archivo:** `src/app/globals.css:222-437`
- **Problema:** globals.css define un DS completo (.pc-card, .pc-card-elevated, .pc-btn-primary/secondary/glass, .pc-input, .pc-table, .pc-kpi-card) pero la adopción real es casi nula: `.pc-btn-*` aparece en 6 archivos, `.pc-card` en 2 (pedidos), el componente shadcn `<Button>` (src/components/ui/button.tsx) se importa en 0 vistas, `<GlassCard>` (src/components/ui/glass-card.tsx) en 0 vistas, y el token `--primary` en 0. Las vistas pintan con Tailwind crudo + hex inline + style={{}} (31 archivos con style inline). Tener un DS que nadie usa es peor que no tenerlo: confunde sobre cuál es el patrón correcto y se desincroniza.
- **Recomendación:** Acción de bajo costo y alto retorno, en 2 pasos:
1) BORRAR ya lo que está 100% muerto sin debate (cero uso confirmado): src/components/ui/glass-card.tsx, src/components/ui/button.tsx (shadcn), y la regla .pc-table de globals.css. No requieren migración porque nadie los usa.
2) Para las clases .pc-* que SÍ se usan parcialmente (pc-btn-*, pc-card, pc-input, pc-kpi-card): NO emprender una migración masiva ahora (no la justifica un ERP de 1 dev / 2-3 usuarios). En su lugar, documentar en CLAUDE.md una sola fuente de verdad ('botones y cards nuevos usan .pc-btn-*/.pc-card; prohibido nuevo style={{ }} inline para color/spacing salvo valores dinámicos') y migrar oportunistamente cada vista al tocarla. Evitar la recomendación original de 'convertir .pc-card/.pc-btn en componentes React <Card>/<Button>' como tarea grande: introduce más superficie sin beneficio inmediato a esta escala. El verdadero problema accionable es el código muerto (paso 1) + la deriva de inline styles (paso 2 vía convención), no rehacer el DS.
- **Ejemplo:**

```
grep -rln 'from "@/components/ui/button"' src/app  # → 0
grep -rln 'GlassCard' src/app  # → 0 (solo definido)
grep -rln 'pc-card' src/app  # → 2 archivos
```

- **Beneficio esperado:** Un solo lugar para cambiar el look de todos los botones/cards. Onboarding de devs claro. Elimina la duda 'pc-btn vs bg-teal-600'.
- **Verificación:** ajustado — Hechos del auditor CONFIRMADOS contra el código:
- Definiciones del DS en src/app/globals.css: @layer components abre en :222 y cierra en :437. Contiene .pc-card (:224), .pc-card-elevated (:238), .pc-btn-primary (:247), .pc-btn-secondary (:268), .pc-input (:288), .pc-input-glass (:306), .pc-label (:327), .pc-table (:336), .pc-btn-glass (:378), .pc-kpi-card (:419). El rango 222-437 citad

</details>

<details>
<summary><strong>[Bajo] #173 — Hover implementado en JS (onMouseEnter) en vez de CSS — frágil y sin paralelo de foco</strong> · UI · Imp 3/Cpx 2 · 0.5d</summary>

- **Archivo:** `src/components/sidebar-nav.tsx:47-58`
- **Problema:** El SidebarNav y 9 archivos más implementan estados hover mutando style en onMouseEnter/onMouseLeave (sidebar-nav.tsx:47-58 cambia background y color por JS). Esto re-renderiza/manipula el DOM en cada hover, no respeta prefers-reduced-motion, no tiene equivalente :focus, y es más verboso que `hover:` de Tailwind. Es un anti-patrón frente al estándar declarativo CSS.
- **Recomendación:** Migrar hover JS a utilidades CSS `hover:` + `focus-visible:` de Tailwind. Para casos con variables CSS, usar grupos (`group`/`group-hover:`). Esto además resuelve de paso el gap de foco del hallazgo de accesibilidad.
- **Ejemplo:**

```
// sidebar-nav.tsx onMouseEnter (47-58) → 
// className="hover:bg-white/45 hover:text-slate-900 focus-visible:..."
```

- **Beneficio esperado:** Menos JS, hover/focus consistentes y declarativos, mejor rendimiento y mantenibilidad.

</details>

<details>
<summary><strong>[Bajo] #188 — Lenguaje glass exclusivo de un módulo (clientes) sin presencia en el resto</strong> · UI · Imp 3/Cpx 4 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/clientes/clientes-dashboard.tsx:1690-1719`
- **Problema:** clientes-dashboard usa KPI cards glass `rgba(255,255,255,0.03)` + blur(12px) + texto blanco (líneas 1693-1719) que SOLO son legibles sobre el banner amatista oscuro. Es un lenguaje visual (dark glass + lavanda) que no existe en ningún otro módulo (que usan KPI cards blancas vía page-header.tsx). Además globals.css define DOS sistemas glass distintos: `.glass-card` (rgba blanco 0.75, líneas 483-500) y los tokens `--am-glass` (0.03). Un mismo concepto 'glass card' tiene 2-3 implementaciones. En contexto el contraste es correcto (texto blanco sobre banner oscuro), pero rompe la unidad del producto.
- **Recomendación:** Decidir si el lenguaje glass-oscuro es global (entonces llevar el banner amatista a todos los módulos como sistema) o local de clientes (entonces aceptarlo como excepción documentada). Unificar las 2-3 definiciones de 'glass card' en una sola con variantes (light/dark). Verificar contraste AA del texto rgba(255,255,255,0.5) sobre el banner (línea 1706) — el muted al 50% puede no pasar AA.
- **Ejemplo:**

```
// clientes: cards dark glass (texto blanco)  vs  resto: KpiCard blanca (page-header.tsx)
// globals.css: .glass-card (0.75 blanco) vs --am-glass (0.03) → 2 verdades
```

- **Beneficio esperado:** Producto que se siente unificado; una sola definición de glass card mantenible; contraste verificado.

</details>

<details>
<summary><strong>[Bajo] #201 — Dark mode declarado pero no-funcional — trampa para el próximo dev</strong> · Mantenibilidad · Imp 2/Cpx 6 · 1d para limpiar / 1-2 sem para implementar de verdad</summary>

- **Archivo:** `src/app/layout.tsx:22-31`
- **Problema:** next-themes está instalado (package.json:25) y globals.css define un bloque `.dark` completo (líneas 86-118), y sonner.tsx llama `useTheme()` (línea 8). PERO no hay `<ThemeProvider>` en ningún layout (RootLayout no lo monta), no hay toggle, y `<html>` no recibe la clase. Solo 4 ocurrencias de `dark:` en todo src, todas en el `<Button>` shadcn que nadie usa. Es decir: el dark mode está 50% cableado y 0% funcional. Un dev que vea `.dark` en CSS y next-themes en deps asumirá que funciona; al activarlo verá la app rota (todas las vistas usan hex claros hardcodeados y gray-* sin variante dark).
- **Recomendación:** Tratar como nit de limpieza opcional (Bajo), no como deuda urgente. Si molesta: borrar el bloque `.dark {}` (globals.css:86-117) y, ya que button.tsx no se usa en ningún lado, eliminar src/components/ui/button.tsx por completo (es dead code, no solo sus dark: variants). Dejar next-themes/useTheme en sonner.tsx es inofensivo y es el patrón estándar shadcn — no requiere acción. NO invertir esfuerzo en montar ThemeProvider + migrar superficies a tokens: no hay demanda de dark mode hoy. Alternativa de costo cero: no hacer nada — el scaffold inerte no rompe nada.
- **Ejemplo:**

```
grep -rn 'ThemeProvider' src  # → 0
grep -rn 'dark:' src | wc -l  # → 4 (todas en button.tsx no usado)
```

- **Beneficio esperado:** Elimina expectativa falsa; si se implementa bien, accesibilidad/preferencia de usuario. Hoy es deuda silenciosa.
- **Verificación:** ajustado — Hechos confirmados: next-themes está en deps (package.json:25). sonner.tsx:3,8 importa y llama useTheme(). globals.css:5 declara `@custom-variant dark (&:is(.dark *))` y :86-117 define el bloque `.dark {}` completo (con oklch). RootLayout (src/app/layout.tsx:21-31) NO monta ningún ThemeProvider y `<html>` solo recibe `${inter.variable} h-full overflow-x-hidden antialiased` (línea 24) — 

</details>


### UX y flujos

La capa de UX está sorprendentemente pulida en los flujos "estrella" (cotización nueva, portal /order, alta de cliente con dedup en vivo): tienen búsqueda con autocomplete, resúmenes en tiempo real, validación con toasts y diseño tipo Stripe/Linear que sí pasaría revisión. Pero hay grietas profundas y peligrosas en los flujos secundarios: (1) el formulario de "Nueva Venta" manual no tiene selector de productos — se capturan subtotales y costos a mano, y NO genera venta_items ni descuenta inventario, lo que rompe reportes y stock; (2) existen DOS caminos para convertir cotización→venta ("Convertir a Venta" vs "Marcar como Vendida") con efectos secundarios distintos (uno descuenta inventario, el otro no), un foso de inconsistencia de datos; (3) cero loading states / skeletons / error.tsx en toda la app — navegación con pantallas en blanco; (4) ningún formulario protege contra pérdida de datos al navegar (sin beforeunload, sin autosave) ni soporta Enter para enviar. La accesibilidad de teclado y los empty states son mínimos. Para 2-3 usuarios internos hoy "funciona", pero los flujos de venta manual e inventario son una bomba de tiempo financiera y nada de esto escalaría a un producto multi-tenant.

**¿Está completo el conjunto de flujos?** Casi. El flujo crítico que FALTA por completo es un "registrar venta directa con productos reales que descuente inventario". Hoy la venta manual (`venta-form.tsx`) es un cascarón financiero: captura cifras agregadas a mano sin items.

**¿Qué sobra / qué confunde?** Sobran caminos paralelos: la página `/cotizaciones/[id]/confirmar` se llama "Confirmar pedido" pero NO confirma nada — solo enlaza a editar/ver (engañoso). Y conviven "Convertir a Venta" + "Marcar como Vendida" con semántica divergente. Eso es exactamente lo que Linear/Stripe nunca permitirían: dos botones que parecen lo mismo y hacen cosas distintas.

**¿Qué genera fricción?** La venta manual obliga a teclear subtotal, IVA-base, costo de productos y costo de envío sin ayuda. Comparado con la cotización (que tiene picker + resumen + preview live), es un retroceso de 10 años de UX dentro de la misma app.

**¿Qué simplificar?** Unificar el motor de captura: el `cotizacion-form` ya tiene el picker de productos perfecto; la venta debería reutilizarlo en lugar de un form de cifras manuales. Un solo componente "DocumentoForm" para cotización y venta eliminaría la divergencia de inventario y de items.

**¿Qué automatizar / qué haría la IA?** (a) Autosave de borradores en localStorage para no perder una cotización a medio armar si se cierra la pestaña. (b) Sugerencia de cantidades/productos por cliente basada en `lib-prediccion.ts` que ya existe — al elegir cliente, precargar "lo que suele pedir". (c) Detección de venta sin items y bloqueo o aviso.

**Verdad incómoda:** los flujos de cara al cliente (portal, cotización, PDF) están a nivel producto; los flujos internos de dinero/stock están a nivel prototipo. El riesgo no es estético, es de integridad de datos financieros.

**Hallazgos (10):**

<details>
<summary><strong>[Crítico] #6 — Dos caminos cotización→venta con efectos secundarios divergentes (inventario sí / inventario no)</strong> · Lógica de negocio · Imp 9/Cpx 6 · 2-4d</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/[id]/cotizacion-detail.tsx:193-216`
- **Problema:** En el detalle de cotización conviven 'Convertir a Venta' (Link a /ventas/nueva?cotizacion=… → saveVenta) y 'Marcar como Vendida' (handleMarkSold → marcarVendida). saveVenta (ventas/actions.ts) NO descuenta inventario; marcarVendida (cotizaciones/actions.ts:248) SÍ llama al RPC descontar_inventario_venta. Además generan números distintos (saveVenta conserva el número tal cual; marcarVendida cambia el sufijo -C- a -V-, línea 199). El usuario no tiene forma de saber que un botón mueve stock y el otro no. Resultado: dependiendo de qué botón se presione, el inventario queda correcto o inflado, con el mismo objetivo aparente.
- **Recomendación:** Unificar en UN solo flujo de conversión. Recomendado: que 'Convertir a Venta' abra la venta-form precargada (para ajustar IVA/pago reales) y que al guardar SIEMPRE descuente inventario y renumere -V-. Eliminar 'Marcar como Vendida' o convertirlo en un atajo que use exactamente el mismo backend. Como mínimo inmediato: hacer que saveVenta descuente inventario como marcarVendida para que ambos caminos sean equivalentes.
- **Beneficio esperado:** Un único camino predecible; cero ventas con inventario sin descontar por elegir el botón 'equivocado'.
- **Verificación:** confirmado — Confirmado en código real. Coexisten dos caminos:

1) "Convertir a Venta" (Link a /ventas/nueva?cotizacion=…) en cotizacion-detail.tsx:193-201 — solo se renderiza si currentEstatus==="aceptada". Ese form (venta-form.tsx:8,150) llama saveVenta.
2) "Marcar como Vendida" (handleMarkSold) en cotizacion-detail.tsx:202-214 → marcarVendida.

Efectos divergentes verificados:
- marcarVendida S

</details>

<details>
<summary><strong>[Alto] #26 — Venta manual no genera items ni descuenta inventario — corrupción silenciosa de stock y reportes</strong> · Lógica de negocio · Imp 7/Cpx 7 · 3-5d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/venta-form.tsx:82-119, 354-405`
- **Problema:** El formulario de Nueva Venta SIN cotización solo captura subtotal/IVA/costos como cifras agregadas a mano (manualSubtotal, manualCostoProductos…). No hay selector de productos. En saveVenta (ventas/actions.ts:75-106) los venta_items SOLO se insertan si hay cotizacion_id; una venta manual queda con CERO líneas. Consecuencia: (a) el inventario NUNCA se descuenta para ventas manuales (inventario_descontado se queda en false, ventas/actions.ts:66, y no hay RPC); (b) el widget 'Desglose por tipo', VentasPorTipo, productos top y unidades_vendidas quedan vacíos para esa venta; (c) el stock mostrado al cliente en /order queda inflado. Para un ERP, una venta que no mueve inventario es un defecto de integridad financiera, no un detalle de UX.
- **Recomendación:** La recomendación original es correcta pero incompleta. Corrección: (1) Bloqueo inmediato (P0 barato): en venta-form.tsx deshabilitar guardado de venta manual o mostrar banner rojo "Esta venta NO descontará inventario" — el negocio hoy crea casi todas las ventas vía cotización, así que esto contiene el riesgo sin reescribir el form. (2) Extraer ItemsPicker compartido de cotizacion-form.tsx y montarlo en la rama manual, derivando subtotal/costos de las líneas en vez de capturarlos a mano. (3) En saveVenta, insertar venta_items SIEMPRE que haya líneas (no solo con cotizacion_id) y llamar `rpc("descontar_inventario_venta", { venta_id })` + set `inventario_descontado: true` tras crear la venta, ENVOLVIENDO inserts+RPC de forma transaccional/idempotente. (4) IMPORTANTE (omitido por el auditor): aplicar ese mismo RPC también a la rama CON cotizacion_id de saveVenta — hoy crea items pero no descuenta stock, igual que el flujo manual. Excluir cliente interno Piel Canela del descuento solo si corresponde a la regla de negocio (su cotización SÍ descuenta inventario per CLAUDE.md, así que NO excluirlo aquí).
- **Ejemplo:**

```
// en saveVenta, tras insertar la venta manual con items:
if (!input.cotizacion_id && ventaItems.length) {
  await supabase.from('venta_items').insert(ventaItems)
  const { error } = await supabase.rpc('descontar_inventario_venta', { venta_id: venta.id })
  if (!error) await supabase.from('ventas').update({ inventario_descontado: true }).eq('id', venta.id)
}
```

- **Beneficio esperado:** Stock y reportes consistentes para el 100% de las ventas; elimina el desfase entre lo vendido y lo que el portal muestra como disponible.
- **Verificación:** ajustado — CONFIRMADO en lo esencial. (1) El form de Nueva Venta sin cotización NO tiene picker de productos: la rama `else` (venta-form.tsx:354-405) solo expone NumberInputs agregados (manualSubtotal/manualDescuento/manualCostoProductos/manualCostoEnvio, declarados en :83-91). No hay estado de líneas ni selector de SKU. (2) saveVenta inserta venta_items SOLO dentro de `if (input.cotizacion_id)` (

</details>

<details>
<summary><strong>[Medio] #44 — Cero loading states / skeletons / error.tsx en toda la app — pantallas en blanco al navegar</strong> · UX · Imp 6/Cpx 3 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)`
- **Problema:** Búsqueda en todo src/app: 0 archivos loading.tsx, 0 error.tsx, 0 not-found.tsx, y 0 usos de skeleton/animate-pulse. Todas las páginas son server components que hacen fetch a Supabase sin fallback de Suspense. En conexión lenta o con la cold-start de Supabase, el usuario ve la pantalla anterior congelada o un flash en blanco sin feedback. Cuando una query falla (p.ej. confirmar/page.tsx:48 devuelve un div rojo crudo en vez de un estado de error con reintentar), la experiencia es abrupta. Apple/Linear/Notion nunca muestran transiciones sin estado intermedio.
- **Recomendación:** Priorizar por impacto/esfuerzo, en este orden:

1. (Mayor ROI) `error.tsx` en `src/app/(dashboard)/` y en `src/app/order/` con mensaje amable + botón "Reintentar" (`reset()` del error boundary de Next) + `'use client'`. Esto cubre de golpe los 19 server components y captura errores lanzados, no solo los retornados manualmente. Reemplazar el div rojo crudo de confirmar/page.tsx:48 por `throw` (que lo capture el error.tsx) o por un componente de estado de error reutilizable.

2. `not-found.tsx` en `(dashboard)` para que los `notFound()` (ya usados, p.ej. confirmar/page.tsx:57) muestren un 404 con marca y link de regreso, en vez del default de Next.

3. `loading.tsx` con skeleton por ruta pesada (/ventas, /clientes, /inventario, /pedidos, dashboard raíz). Antes de esto verificar si las páginas usan `export const dynamic`/cold-start real; en muchas un skeleton simple de tabla/cards basta. Opcionalmente envolver subsecciones lentas en <Suspense> con fallback en vez de loading.tsx de ruta completa para no parpadear el chrome ya cargado.

Crear un componente compartido `<TableSkeleton/>` y `<ErrorState onRetry/>` para no duplicar markup en cada ruta.
- **Ejemplo:**

```
// src/app/(dashboard)/ventas/loading.tsx
export default function Loading() {
  return <div className='p-6 space-y-3'>{Array.from({length:8}).map((_,i)=>(<div key={i} className='h-12 rounded-xl bg-gray-100 animate-pulse'/>))}</div>
}
```

- **Beneficio esperado:** Percepción de velocidad y solidez; elimina los flashes en blanco y los errores crudos sin recuperación.
- **Verificación:** ajustado — Todos los hechos del hallazgo se confirman empíricamente. Búsqueda en `src/`: 0 archivos `loading.tsx`, 0 `error.tsx`, 0 `not-found.tsx`, 0 `global-error.tsx` (find sobre src no devuelve ninguno). 0 usos de Suspense y 0 de Skeleton/animate-pulse (grep -rl sin resultados). Confirmadas 19 páginas `export default async function` en `src/app/(dashboard)/**/page.tsx` que hacen fetch directo 

</details>

<details>
<summary><strong>[Medio] #46 — Pérdida de datos sin aviso: formularios largos sin beforeunload ni autosave</strong> · UX · Imp 6/Cpx 4 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/nueva/cotizacion-form.tsx:62-98`
- **Problema:** Las cotizaciones (con N items, descuentos, notas) y los pedidos (nuevo/page.tsx, con tabla de items + prorrateo) viven 100% en useState sin persistencia. No hay window.beforeunload ni guardado de borrador. Un clic accidental en el sidebar, un refresh, o cerrar la pestaña descarta todo el trabajo sin confirmación. En pedido-form esto puede ser 30+ minutos de captura de un pedido de importación. Tampoco hay confirmación al usar 'Cambiar cliente' (cotizacion-form.tsx:390) que no borra items pero sí podría descolocar el contexto.
- **Recomendación:** Implementar autosave de borrador (es la pieza que realmente protege). 1) En cotizacion-form y pedidos/nuevo, un useEffect que serialice el estado relevante a localStorage con key por tipo y por contexto de edición (p.ej. `cotizacion-draft:nueva`, `pedido-draft:nuevo`), debounced ~500ms, solo si hay items o campos no vacíos. 2) Al montar, si existe draft, mostrar banner no intrusivo "Tienes un borrador sin terminar — Continuar / Descartar". 3) Limpiar la key tras guardar con éxito (en el callback de saveCotizacion/submit del pedido). 4) Como red de seguridad para refresh/cierre de pestaña, añadir window.beforeunload con un flag `dirty` (hay items o cambios) que muestre el prompt nativo — pero entendiendo que NO cubre la navegación interna por sidebar; para eso el draft de localStorage es lo que evita la pérdida. 5) Reutilizar el patrón ya presente en el repo (localStorage de inventario-col-widths-v1) por consistencia.
- **Ejemplo:**

```
useEffect(() => {
  const h = (e: BeforeUnloadEvent) => { if (items.length) { e.preventDefault(); e.returnValue = '' } }
  window.addEventListener('beforeunload', h)
  return () => window.removeEventListener('beforeunload', h)
}, [items.length])
```

- **Beneficio esperado:** Cero pérdidas de captura larga; reduce frustración en el flujo de mayor carga cognitiva.
- **Verificación:** ajustado — CONFIRMADO el núcleo del hallazgo. cotizacion-form.tsx (líneas 67-91): todo el estado del formulario (clienteId, fecha, ivaActivo, descuentoTipo/Valor, costoEnvio, notas, items) vive 100% en useState, sin persistencia. pedidos/nuevo/page.tsx (líneas 67-84): igual — items, envioTotalUSD, división socios, notas, tc, todo en useState. Grep en TODO src/ confirma: cero ocurrencias de `before

</details>

<details>
<summary><strong>[Medio] #65 — Página 'Confirmar pedido' no confirma nada — nombre y CTA engañosos</strong> · UX · Imp 5/Cpx 3 · 0.5d</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/[id]/confirmar/page.tsx:237-265`
- **Problema:** La ruta se llama /confirmar y el header dice 'Pedido del portal', pero las únicas acciones son 'Editar antes de enviar', 'Ver cotización completa' y 'Contactar por WhatsApp'. No hay ninguna acción de confirmar/aceptar/convertir. El usuario que llega esperando cerrar el pedido se queda sin saber cuál es el siguiente paso real (que está en otra pantalla: el detalle con 'Marcar como Vendida'). Total solicitado muestra solo subtotal (línea 228) sin IVA/envío, con nota al pie — correcto, pero el nombre de la página crea expectativa equivocada.
- **Recomendación:** Renombrar a 'Revisar pedido del portal' y añadir el CTA real ('Aceptar y convertir a venta' o 'Generar cotización formal') que dispare el mismo flujo unificado del hallazgo #2. Que el botón primario sea la acción de avance, no 'Ver cotización completa'.
- **Beneficio esperado:** Claridad de siguiente paso.

</details>

<details>
<summary><strong>[Medio] #66 — Formularios sin submit por teclado (Enter) y sin autoFocus</strong> · Accesibilidad · Imp 5/Cpx 3 · 1d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/venta-form.tsx:466-474`
- **Problema:** Ningún formulario usa <form onSubmit>; todos disparan con onClick en un <button type='button'> (venta-form.tsx:466, cotizacion-form.tsx:773, cliente-form.tsx:186). Resultado: presionar Enter en un input NO guarda — fricción para usuarios de teclado y power users que capturan rápido. Tampoco hay autoFocus en el primer campo al abrir un form o modal (p.ej. el número de venta o el buscador de cliente), obligando a un clic extra. El picker de cantidad+Agregar en cotización tampoco responde a Enter para agregar el item.
- **Recomendación:** Envolver en <form onSubmit={(e)=>{e.preventDefault(); handleSave()}}> con el botón como type='submit'. Añadir autoFocus al primer campo significativo de cada form/modal. En el picker de cotización, onKeyDown Enter → addItem().
- **Ejemplo:**

```
<form onSubmit={(e) => { e.preventDefault(); handleSave() }}> … <button type='submit'>Guardar</button> </form>
```

- **Beneficio esperado:** Captura más rápida con teclado; cumple expectativa básica de UX de formularios.

</details>

<details>
<summary><strong>[Medio] #101 — Tablas anchas en móvil: scroll horizontal como única estrategia responsive</strong> · UI · Imp 5/Cpx 6 · 2-3d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/ventas-table-premium.tsx:1256-1304`
- **Problema:** La tabla de ventas (10+ columnas) y la de pedido-nuevo (10 columnas con inputs, pedidos/nuevo/page.tsx:431-561) se resuelven en móvil solo con overflow-auto + primera columna sticky. En un teléfono el usuario debe hacer scroll horizontal extenso para ver totales/profit, y editar cantidades en una celda diminuta dentro de una tabla con scroll es muy frustrante (pedido-nuevo es la peor: inputs numéricos de 64px dentro de tabla scrolleable). No hay vista de tarjetas alternativa para < md.
- **Recomendación:** Para < md, renderizar una vista de tarjetas (una card por venta/item con los 3-4 datos clave + acción) en lugar de la tabla. En pedido-nuevo, la edición de cantidad/precio por item debería ser un panel/acordeón por producto en móvil, no celdas en tabla scrolleable.
- **Beneficio esperado:** Captura y lectura usables en celular, que el prompt identifica como caso de uso real.

</details>

<details>
<summary><strong>[Medio] #136 — Empty states pobres: texto plano sin CTA ni onboarding</strong> · UX · Imp 4/Cpx 3 · 1d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/ventas-table-premium.tsx:1282-1290`
- **Problema:** Cuando una tabla está vacía solo aparece 'Sin resultados.' (ventas-table-premium.tsx:1288), 'No hay pedidos registrados todavía.' (pedidos/page.tsx:236) o 'Sin productos con esos filtros.' (order-catalog.tsx:417). No hay ilustración, explicación ni CTA para crear el primer registro. Un usuario nuevo (o escalando a multi-tenant con cuentas vacías) no recibe guía sobre qué hacer. Notion/HubSpot siempre convierten el vacío en un punto de activación.
- **Recomendación:** Componente EmptyState reutilizable con icono, título, descripción y botón primario ('Crear primera venta', 'Registrar pedido'). Distinguir vacío-por-filtro (ofrecer 'Limpiar filtros') de vacío-real (ofrecer crear).
- **Beneficio esperado:** Mejor activación y orientación; pantallas vacías que guían en vez de frustrar.

</details>

<details>
<summary><strong>[Bajo] #174 — Edición de inventario carece de feedback de éxito y de confirmación al cambiar stock</strong> · UX · Imp 3/Cpx 2 · 2h</summary>

- **Archivo:** `src/app/(dashboard)/inventario/product-edit-modal.tsx:95-116`
- **Problema:** Al guardar el modal de producto (onSave) en caso de éxito solo hace router.refresh() + onClose() sin ningún toast de confirmación (a diferencia de venta/cotización/cliente que sí muestran toast.success). El usuario no recibe confirmación explícita de que el stock/precio se guardó. Además, modificar stock_actual (que recalcula estatus ok/bajo/agotado y afecta lo que ve el portal) no pide confirmación ni muestra el delta — un typo (poner 5 en vez de 50) pasa sin fricción.
- **Recomendación:** Añadir toast.success('Producto actualizado') tras res.ok. Opcional: si stock_actual cambia drásticamente o cae a 0, mostrar un microaviso inline 'Quedará Agotado en el portal' antes de guardar.
- **Ejemplo:**

```
if (res.ok) { toast.success('Producto actualizado'); router.refresh(); onClose() }
```

- **Beneficio esperado:** Confirmación consistente con el resto de la app; menos errores de captura de stock.

</details>

<details>
<summary><strong>[Bajo] #175 — Drawer móvil y hamburguesa sin atributos ARIA de estado/diálogo</strong> · Accesibilidad · Imp 3/Cpx 2 · 2-3h</summary>

- **Archivo:** `src/app/(dashboard)/layout.tsx:38-73`
- **Problema:** El botón hamburguesa (línea 38) tiene aria-label pero no aria-expanded ni aria-controls; el <aside> drawer (línea 63) no tiene role='dialog' ni aria-modal, y el foco no se mueve al drawer al abrirlo ni se atrapa dentro. Para lectores de pantalla y navegación por teclado el menú móvil no anuncia su estado abierto/cerrado.
- **Recomendación:** Añadir aria-expanded={mobileOpen} y aria-controls='sidebar' al botón; role='dialog' aria-modal='true' al aside; mover foco al primer link al abrir y devolverlo al hamburger al cerrar; soportar Esc para cerrar.
- **Beneficio esperado:** Menú móvil accesible por teclado y lectores de pantalla; base para cumplir WCAG si se escala.

</details>


### IA y automatización

El ERP tiene una base de datos estructurada y rica (ventas, items, cotizaciones, clientes, inventario USD/MXN, pedidos de Brasil con conversiones/pagos/documentos) y un excelente motor estadístico propio para predicción de recompra y riesgo de churn (lib-prediccion.ts) y scoring de probabilidad de cierre de cotización (lib-cotizacion-prob.ts). PERO no existe NINGUNA capa de IA generativa (cero dependencias openai/@ai-sdk/anthropic en package.json), NINGUNA automatización de salida (cero email/WhatsApp/SMS de envío real; solo links wa.me/mailto manuales) y NINGÚN job programado (no hay vercel.json, ni cron, ni /api/). El sistema es 100% reactivo y manual: el churn risk se calcula pero nadie es notificado; los PDF de cotización solo se descargan a mano; el seguimiento de cotizaciones, recompras y dunning de saldos es manual; y el flujo pedido→inventario→costo todavía se parchea con scripts Python ad-hoc (fix-pedido-3-*.py, fix-lv-cafe-pedido3.py). Hay enorme palanca: ya existe la inteligencia, falta convertirla en acciones automáticas y agregar una capa de IA generativa (resúmenes, NBA, NL→cotización, OCR de facturas brasileñas, asistente conversacional). La recomendación de plataforma es Vercel AI Gateway + AI SDK, que encaja perfecto con el stack Next.js 16 ya desplegado en Vercel.

**¿Completo?** Funcionalmente el CRUD y la analítica están maduros, pero la dimensión IA/automatización está esencialmente vacía: hay inteligencia *calculada* (predicción, churn, scoring) que nunca se convierte en *acción automática*. Es un tablero de instrumentos sin piloto automático.

**¿Qué falta (lo grande)?**
1. **Capa de salida automatizada (lo #1):** no existe envío de email/WhatsApp. `submitOrder` ya crea una notificación in-app (src/app/order/actions.ts:310) pero nadie recibe un correo/WhatsApp. Las cotizaciones se mandan a mano por wa.me (confirmar/page.tsx:92). No hay recordatorios de recompra, ni follow-up de cotizaciones, ni dunning de saldos pendientes, ni alertas de stock bajo — todo lo cual el sistema YA SABE calcular.
2. **Jobs programados:** sin `vercel.json` ni Cron Jobs. Toda la inteligencia es "pull" (alguien abre la página). Debe ser "push" (el sistema avisa).
3. **IA generativa: cero.** No hay resumen de cliente, next-best-action accionable, NL→cotización, OCR de facturas brasileñas, búsqueda semántica, ni asistente sobre los datos.
4. **Automatización del flujo pedido→inventario:** `crearPedido`/`editarPedido` ya hacen snapshot de costo + suma de stock (pedidos/actions.ts:266-267), pero el re-prorrateo de envío disparejo y correcciones siguen haciéndose con scripts Python manuales (5 scripts fix-pedido-3-*.py + fix-lv-cafe-pedido3.py).

**¿Qué sobra / qué simplificar?** Los scripts Python ad-hoc son deuda: cada corrección de costeo se hace fuera de la app, sin trazabilidad ni UI. Deberían volverse una acción "Re-prorratear envío" dentro de /pedidos/[id].

**¿Qué haría la IA aquí?** Con ~42 ventas el volumen es bajo para ML pesado, pero PERFECTO para LLMs: (a) resumir el historial de un cliente en 2 frases accionables; (b) convertir "Mithra quiere 10 activadores y 5 cintas 9mm" en una cotización completa; (c) leer una factura PDF/foto del proveedor brasileño y precargar el pedido (OCR + extracción estructurada con structured output del AI SDK); (d) generar el texto de WhatsApp de follow-up personalizado; (e) un chat "pregúntale a tus datos". El motor estadístico existente NO debe reemplazarse por IA — es determinista, auditable y barato; la IA va ENCIMA para narrar y accionar.

**¿Qué genera fricción / confunde?** El usuario tiene que recordar manualmente a quién dar seguimiento, qué stock reponer, qué saldo cobrar. La inteligencia existe pero está enterrada en paneles que hay que ir a mirar. Convertir cálculos en notificaciones/colas de acción es la mejora de mayor ROI.

**Plataforma recomendada:** Vercel AI Gateway (un solo endpoint, failover de proveedor, tracking de costo) + Vercel AI SDK (`generateText`, `generateObject` para structured output, `streamText` para el chat). Para salidas: Resend (email, integración nativa Vercel) + WhatsApp Cloud API o links wa.me pre-rellenados como MVP. Para jobs: Vercel Cron Jobs vía `vercel.json` + rutas `/api/cron/*` protegidas por `CRON_SECRET`.

**Hallazgos (12):**

<details>
<summary><strong>[Alto] #34 — Cero automatización de salida: el churn risk se calcula pero nadie es avisado</strong> · Automatización · Imp 6/Cpx 4 · 2-3d</summary>

- **Archivo:** `src/app/(dashboard)/clientes/lib-prediccion.ts:171-176`
- **Problema:** El motor ya calcula riesgoAbandono por cliente (lib-prediccion.ts:171-176) y el panel lista 'clientes en riesgo' (prediccion-compras.tsx:178). Pero NO existe ningún disparador: nadie recibe un correo/WhatsApp/notificación cuando un cliente cruza el umbral de riesgo. La acción depende 100% de que un humano abra la página /clientes y la mire. Con 2-3 personas internas, los avisos se pierden y se pierde recompra recurrente (el corazón del negocio B2B a spas).
- **Recomendación:** La dirección es correcta pero conviene escalonar y bajar fricción de infra (hoy NO hay ni un endpoint API). Fase 1 (alto valor, bajo costo): crear src/app/api/cron/alertas-clientes/route.ts protegida por CRON_SECRET (Authorization: Bearer) + vercel.json con un cron diario; correr predecirCompra() sobre todos los clientes excluyendo getInternalClienteIds() (Piel Canela 08449791- no debe alertar) y, para riesgo>=0.6 o ventana de recompra, insertar una notificación in-app reutilizando exactamente el patrón de order/actions.ts:310 (tipo nuevo p.ej. 'cliente_en_riesgo', con url a /clientes/[id]). Esto ya da disparador sin depender de email externo. Fase 2 (cuando se quiera push real): resumen diario por email (Resend) a Sandra/Benjamin con lista priorizada + link wa.me pre-rellenado por cliente. Notas: (a) idempotencia — no re-alertar el mismo cliente a diario; guardar última fecha de alerta o usar ON CONFLICT por (cliente_id, dia). (b) usar createAdminClient() (service_role) en el cron, no anon. (c) umbral: alinear a 0.6 (el de insights) en vez de 0.5 para evitar ruido. (d) excluir clientes con ventas_count==0 como ya hace la UI.
- **Ejemplo:**

```
// /api/cron/alertas-clientes/route.ts
export async function GET(req: Request){
  if(req.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`) return new Response('no',{status:401})
  const enRiesgo = clientes.map(c=>({c,p:predecirCompra(c,ventas,new Date())}))
    .filter(x=>x.p.riesgoAbandono>=0.6 || (x.p.diasParaProxima!=null && Math.abs(x.p.diasParaProxima)<=7))
  // insert notificaciones + resend.emails.send({...resumen})
}
```

- **Beneficio esperado:** Convierte inteligencia pasiva en acción. Recupera ventas recurrentes que hoy se pierden por olvido. Cero trabajo manual de revisión diaria.
- **Verificación:** ajustado — Premisa confirmada. (1) El motor calcula riesgo en lib-prediccion.ts:172-176 y lo expone como `riesgoAbandono` en :247 (default 0 en :114). (2) El consumo de "en riesgo" es 100% in-page vía useMemo, sin efectos secundarios: prediccion-compras.tsx:176-181 (filter riesgoAbandono>=0.5, slice 6) y prediccion-insights.tsx:79-82 (KPI, umbral 0.6) y :103-107. cliente-drawer.tsx:708-719 solo lo

</details>

<details>
<summary><strong>[Medio] #43 — NL→cotización: convertir lenguaje natural / WhatsApp en una cotización completa</strong> · IA · Imp 7/Cpx 5 · 3-4d</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/nueva/cotizacion-form.tsx`
- **Problema:** Crear una cotización exige seleccionar cliente, buscar cada producto y teclear cantidades una por una en el form. El caso real es que el spa pide por WhatsApp en texto libre ('quiero 10 activadores grandes y 5 cintas de 9mm'). Hoy eso se traduce a mano, producto por producto.
- **Recomendación:** Caja 'Pegar pedido en texto' en cotizacion-form. Server action que pase el texto + el catálogo (productos con sku/nombre_display/precio) a generateObject del AI SDK con un schema Zod {items:[{producto_id,cantidad}]} y matching difuso de nombres (ya existe pg_trgm, ver clientes/actions.ts findSimilarClientes). Devuelve los items para que el humano confirme antes de guardar.
- **Ejemplo:**

```
const {object} = await generateObject({ model: gateway('openai/gpt-4o-mini'), schema: z.object({items: z.array(z.object({producto_id:z.string(), cantidad:z.number()}))}), prompt:`Catálogo:\n${catalogoJson}\n\nPedido del cliente:\n${texto}\nDevuelve los items que mejor coincidan.` })
```

- **Beneficio esperado:** De 2-3 min de captura a 5 segundos + confirmación. Reduce errores de SKU. Aprovecha que el catálogo es chico (cabe entero en el prompt).

</details>

<details>
<summary><strong>[Medio] #45 — Sin dunning automático de saldos pendientes</strong> · Automatización · Imp 6/Cpx 3 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:36-41`
- **Problema:** ventas.saldo_pendiente es GENERATED y el estatus distingue pagada_parcial/pendiente (actions.ts:36-41), pero no hay ningún recordatorio automático de cobro. Una venta a crédito parcial se queda esperando a que alguien la note manualmente en la lista. Para un negocio chico con flujo de caja apretado (capital atado en pedidos de Brasil), cobrar a tiempo importa.
- **Recomendación:** Incluir en el cron diario una pasada sobre ventas con saldo_pendiente>0 y antigüedad>N días: notificación in-app + email resumen a socios con la lista de saldos por cobrar y link wa.me por cliente. Texto del recordatorio generable con IA según tono/relación.
- **Ejemplo:**

```
const porCobrar = ventas.filter(v=>Number(v.saldo_pendiente)>0 && diasDesde(v.fecha)>15)
// resend resumen + notificacion
```

- **Beneficio esperado:** Acelera cobranza, mejora flujo de caja, cero seguimiento manual de quién debe.

</details>

<details>
<summary><strong>[Medio] #47 — Resumen de cliente con IA + Next-Best-Action accionable en la ficha</strong> · IA · Imp 6/Cpx 4 · 2-3d</summary>

- **Archivo:** `src/app/(dashboard)/clientes/cliente-drawer.tsx:321`
- **Problema:** La ficha del cliente tiene los datos crudos y la predicción estadística, pero ningún resumen legible ni una acción recomendada concreta. El drawer ofrece un mailto: a secas (cliente-drawer.tsx:321). El usuario tiene que interpretar números (riesgo 62%, próxima compra Jul-26) y decidir qué hacer.
- **Recomendación:** Tarjeta 'Resumen IA' que tome PrediccionResult + historial de ventas/items y genere con streamText 2-3 frases ('Mithra compra cada 45d, lleva 60 sin comprar—en riesgo. Su top: activadores. NBA: ofrécele reposición de activadores con 5% por volumen.') + un botón que dispare el WhatsApp pre-rellenado con ese texto. Cachear el resumen (revalidate) para no re-llamar al LLM en cada render.
- **Ejemplo:**

```
const {textStream}=await streamText({model:gateway('openai/gpt-4o-mini'), prompt:`Cliente:${nombre}. Ventas:${ventasJson}. Predicción:${JSON.stringify(pred)}. Da un resumen de 2 frases y 1 acción comercial concreta en español.`})
```

- **Beneficio esperado:** Convierte la predicción en lenguaje y acción. El operador sabe a quién contactar y QUÉ decirle sin analizar números.

</details>

<details>
<summary><strong>[Medio] #54 — OCR de facturas del proveedor brasileño para precargar el pedido</strong> · IA · Imp 6/Cpx 6 · 4-5d</summary>

- **Archivo:** `src/app/(dashboard)/pedidos/actions.ts:818-840`
- **Problema:** Los pedidos desde Brasil (cintas cotizadas en BRL, ver MEMORY pedidos-costeo-brl) se capturan a mano: producto, cantidad, precio USD, envío. Ya existe infra de documentos (subirFacturaEnvio, subirDocumentoPedido) pero los archivos solo se almacenan; nadie extrae datos de ellos. El costeo correcto es delicado (re-prorrateo de envío disparejo) y por eso hubo 5 scripts Python de corrección.
- **Recomendación:** Al subir una factura/PDF del proveedor, pasarla a un modelo multimodal vía AI Gateway (generateObject con imagen/PDF) y extraer {items:[{descripcion,cantidad,precio}], envio, moneda}. Precargar el form de nuevo pedido con esos datos para revisión humana. Convierte la factura en estructura sin teclear.
- **Ejemplo:**

```
const {object} = await generateObject({ model: gateway('anthropic/claude-3-5-sonnet'), schema: facturaSchema, messages:[{role:'user',content:[{type:'text',text:'Extrae los items y envío de esta factura'},{type:'image',image: fileBytes}]}] })
```

- **Beneficio esperado:** Elimina captura manual del pedido más complejo del negocio y reduce los errores de costeo que hoy requieren scripts de parche.

</details>

<details>
<summary><strong>[Medio] #76 — Sin envío automático de cotización: PDF solo se descarga y se manda a mano por WhatsApp</strong> · Automatización · Imp 5/Cpx 4 · 2-3d</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/[id]/confirmar/page.tsx:92`
- **Problema:** downloadCotizacionPdf (pdf.ts:37) solo genera el PDF en el browser para descarga. El envío al cliente es manual: se construye un link wa.me a mano (confirmar/page.tsx:92). No hay forma de enviar la cotización por email con el PDF adjunto desde la app, ni de registrar 'enviada el X'. En un flujo B2B esto es fricción diaria y pierde el timestamp de envío que el propio scoring de probabilidad necesita (lib-cotizacion-prob.ts:77 premia estatus 'enviada').
- **Recomendación:** Implementación por fases priorizando el ROI: (FASE 1, barata y alto valor) Server action que al disparar el envío escriba cotizaciones.estatus='enviada' + un timestamp (agregar columna fecha_envio si no existe) — esto arregla la señal del scoring (lib-cotizacion-prob.ts:77) sin necesidad de integración de email completa. (FASE 2) Render del PDF server-side (o subir el blob a storage bucket) y botón "Enviar por WhatsApp" que abra wa.me con texto + link al PDF en storage, ya que adjuntar PDF directo por wa.me no es posible. (FASE 3, opcional) Email con Resend a cliente.email. OJO: el portal /order hace el email opcional, así que cliente.email suele venir null (confirmar/page.tsx:149-151 ya lo maneja con fallback "—"); el envío por email debe degradar a la ruta WhatsApp cuando no haya email. No bloquear el envío por falta de email.
- **Ejemplo:**

```
import { Resend } from 'resend'
await resend.emails.send({ from, to: cliente.email, subject:`Cotización ${numero}`, attachments:[{filename:`${numero}.pdf`, content: pdfBuffer}], html })
await admin.from('cotizaciones').update({estatus:'enviada'}).eq('id',id)
```

- **Beneficio esperado:** Un clic en vez de descargar→abrir WhatsApp→adjuntar→escribir. Captura automática del estado 'enviada' que alimenta el scoring de cierre.
- **Verificación:** ajustado — Hallazgo confirmado en lo técnico, severidad ajustada a la baja por contexto real (ERP interno 2-3 usuarios, ~42 ventas, pocos clientes spa).

EVIDENCIA:
1. PDF solo descarga: src/lib/pdf.ts:37 downloadCotizacionPdf importa html2pdf.js y llama .save() (pdf.ts:73) = descarga en browser. Archivo marcado "use client" (pdf.ts:1), no puede correr server-side. Únicos callers son client compon

</details>

<details>
<summary><strong>[Medio] #77 — Re-prorrateo de envío sigue dependiendo de scripts Python manuales fuera de la app</strong> · Automatización · Imp 5/Cpx 4 · 2-3d</summary>

- **Archivo:** `scripts/fix-pedido-3-envio-facturas.py:95-139`
- **Problema:** crearPedido/editarPedido ya prorratean el envío parejo (pedidos/actions.ts:217,379,523), pero las correcciones reales se siguen haciendo con scripts Python ad-hoc (fix-pedido-3.py, fix-pedido-3-envio-facturas.py, fix-pedido-3-envio-usa-mexico.py, fix-pedido-3-cintas-brl.py, fix-lv-cafe-pedido3.py — este último sin commitear, en git status). Cada corrección de costeo ocurre fuera de la UI, sin trazabilidad, escribiendo directo a PostgREST. Es deuda operativa y riesgo de corrupción de costos.
- **Recomendación:** Exponer en /pedidos/[id] una acción 'Recalcular costeo' que reciba el envío total (o por tramos, ya existe pedido_envios) y re-prorratee + re-snapshotee usando exactamente itemFields()/snapshotProducto() que ya están en actions.ts. Así toda corrección queda en la app, auditada y revalidando inventario, sin scripts.
- **Ejemplo:**

```
export async function recalcularCosteoPedido(pedidoId, envioTotalUsd){ /* misma lógica de editarPedido pasos 5-6, sin tocar cantidades */ }
```

- **Beneficio esperado:** Elimina la dependencia de Python manual, da trazabilidad y evita que cada pedido raro requiera código nuevo.

</details>

<details>
<summary><strong>[Medio] #78 — Forecast de ventas/ingresos y detección de anomalías ausentes</strong> · IA · Imp 5/Cpx 4 · 2-3d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:267-329`
- **Problema:** getVentasStats agrega ventasPorMes, mejorMes, ticketPromedio (actions.ts:267-329) pero todo es retrospectivo: no hay proyección de ingresos del próximo mes/trimestre ni detección de anomalías (caída brusca de ventas, ticket fuera de rango, cliente que dejó de comprar). El motor de predicción por cliente existe (lib-prediccion.ts valorFuturo12m) pero no se agrega a nivel negocio.
- **Recomendación:** Sumar los valorFuturo12m/ingresoEstimadoProx por cliente (ya se calculan, lib-prediccion.ts:192-197) para un forecast agregado de ingresos en la página /ventas/estadisticas. Para anomalías: regla simple (mes actual vs media móvil 3M) + un narrador IA que explique el desvío. No requiere ML pesado dado el volumen.
- **Ejemplo:**

```
const forecast = clientes.reduce((s,c)=>s+predecirCompra(c,ventas).ingresoEstimadoProx,0) // ingreso esperado prox 60d
```

- **Beneficio esperado:** Da visión hacia adelante (cuánto se espera facturar) y alerta temprana de caídas, hoy invisibles.

</details>

<details>
<summary><strong>[Medio] #119 — Sincronización automática del tipo de cambio (hoy manual)</strong> · Automatización · Imp 4/Cpx 2 · 1d</summary>

- **Archivo:** `src/app/(dashboard)/inventario/actions.ts:336-348`
- **Problema:** actualizarTipoCambio() reescribe productos.tipo_cambio masivamente, pero el valor lo teclea un humano (CLAUDE.md: 'TC actual sincronizado con el Sheet $20.70'). El TC referencial queda desactualizado hasta que alguien se acuerda de actualizarlo, distorsionando precio_mxn_calculado y costo_total_mxn de vista_inventario.
- **Recomendación:** Cron semanal que consulte una API de FX (ej. exchangerate.host / banxico) y, si el TC vigente difiere >X% del guardado, notifique 'TC desactualizado: guardado 20.70, hoy 21.40, ¿actualizar?'. No auto-aplicar (el TC es referencial y se ancla al pedido), solo avisar y dejar el botón a un clic.
- **Ejemplo:**

```
const fx = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=MXN').then(r=>r.json())
// comparar fx.rates.MXN vs tipo_cambio guardado → notificar
```

- **Beneficio esperado:** Mantiene la referencia de costos/precios fiel sin vigilancia manual; evita decisiones de precio sobre TC viejo.

</details>

<details>
<summary><strong>[Bajo] #157 — Reportes financieros narrativos generados con IA</strong> · IA · Imp 4/Cpx 3 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/estadisticas`
- **Problema:** El Financial Command Center y /finanzas muestran KPIs, ROI por socio y gráficas, pero no hay un resumen ejecutivo en prosa ('Mayo cerró +18% vs abril impulsado por cintas; el cliente X representa 40% del riesgo; capital recuperado de Sandra al 62%'). Los socios tienen que leer gráficas para entender el mes.
- **Recomendación:** Botón 'Resumen del mes' que pase los agregados de getVentasStats + ROI de socios a generateText y produzca 1 párrafo ejecutivo en español. Opcionalmente entregarlo por email mensual vía el cron.
- **Ejemplo:**

```
await generateText({model:gateway('openai/gpt-4o-mini'),prompt:`Datos del mes:${JSON.stringify(stats)}. Escribe un resumen ejecutivo de 4-5 frases para los socios.`})
```

- **Beneficio esperado:** Comprensión instantánea del desempeño sin interpretar dashboards; ideal para socios no técnicos.

</details>

<details>
<summary><strong>[Bajo] #158 — Sugerencia de precios y descuentos asistida por margen</strong> · IA · Imp 4/Cpx 4 · 2-3d</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/nueva/cotizacion-form.tsx`
- **Problema:** Al cotizar, el descuento se teclea sin que el sistema avise el impacto en margen. vista_inventario ya tiene profit_unitario/costo_total_mxn por producto, pero el form no sugiere un descuento máximo seguro ni alerta si una línea cae bajo costo. Riesgo de vender con margen erosionado o negativo.
- **Recomendación:** En el form, mostrar margen en vivo por línea y total usando costo_total_mxn de vista_inventario; alerta si margen<umbral. Sugerencia de descuento por IA según historial del cliente (frecuencia, ticket) — opcional, el cálculo de margen base no necesita IA.
- **Ejemplo:**

```
const margenLinea = (precioUnit - costoTotalMxn)/precioUnit; if(margenLinea<0.15) warn('Margen bajo en esta línea')
```

- **Beneficio esperado:** Protege la rentabilidad en el punto de decisión; evita descuentos que matan el margen.

</details>

<details>
<summary><strong>[Bajo] #161 — Búsqueda global / semántica y asistente conversacional sobre los datos</strong> · IA · Imp 4/Cpx 6 · 4-6d</summary>

- **Archivo:** `src/components/sidebar-nav.tsx`
- **Problema:** No existe una búsqueda global ni un asistente para preguntar a los datos en lenguaje natural ('¿cuánto me compró Mithra este año?', '¿qué cintas tengo en stock bajo?'). Encontrar info exige navegar módulo por módulo. Para 3 personas internas con datos en múltiples tablas, un comando-K con respuestas sería gran palanca de productividad.
- **Recomendación:** Fase 1 (barato): paleta de comandos cmd-K que busque clientes/productos/cotizaciones por texto (reusa pg_trgm). Fase 2: asistente con AI SDK + tool calling donde el LLM tiene herramientas tipadas (getCliente, getVentasStats, getStockBajo) y responde con datos reales —sin texto-a-SQL para evitar riesgo. Dado el service_role, restringir las tools a lecturas.
- **Ejemplo:**

```
const result = await generateText({model, tools:{getStockBajo:tool({...}), getVentasCliente:tool({...})}, maxSteps:5, prompt: pregunta})
```

- **Beneficio esperado:** Acceso instantáneo a cualquier dato; reduce navegación. Diferencia el producto hacia un ERP 'con IA' de clase HubSpot/Notion.

</details>


### Lógica de negocio y finanzas

La lógica fiscal de IVA está correcta y consistente en TODOS los puntos de captura (cotización, venta nueva, edición): siempre es (subtotal − descuento) × 0.16 sobre la base gravable, y los reportes usan ventas.iva (real) y nunca cotizaciones.iva (referencial) — verificado en venta-form.tsx:99/110, edit-form.tsx:61, cotizacion-form.tsx:141-143 y actions.ts:396. La exclusión del cliente interno Piel Canela está bien aplicada en dashboard, finanzas, estadísticas y clientes. Sin embargo hay dos defectos CRÍTICOS en el reparto de socios (venta_socios) que corrompen el ROI: saveVenta fuerza un 50/50 que contradice los datos reales (la mayoría de ventas tienen un solo socio), y marcarVendida ni siquiera crea filas de venta_socios. Además la columna GENERATED ganancia ignora el descuento (difiere de utilidad_neta), y se usa inconsistentemente entre módulos. La generación de número de orden es racy por falta de UNIQUE en cotizaciones.numero. Los estados de venta y saldo_pendiente son coherentes.

**Lo que está bien (no tocar):**
- Fórmula IVA homogénea y fiscalmente correcta en los 3 formularios + server action. La regla referencial vs real está respetada: el form de venta pre-carga ivaActivo desde la cotización pero permite cambiarlo, y guarda en ventas.iva.
- Exclusión de Piel Canela (is_internal) correctamente propagada a KPIs de dashboard, finanzas (filtra ventas Y venta_socios vía internalVentaIds), estadísticas (filtra en prev-period e IVA recaudado) y clientes.
- saldo_pendiente / cantidad_pagada / enum estatus coherentes; estatusFor y ventaEstatus idénticos y correctos. updateVenta NO reescribe venta_socios (comentario explícito correcto), respetando que el reparto no es 50/50.
- Validación de enum de estatus en cambiarEstatusVenta/cambiarEstatusCotizacion. revertirCotizacion restaura inventario antes de borrar (orden correcto).

**El problema de fondo (financiero):** Hay TRES conceptos de utilidad conviviendo sin un único origen de verdad:
1. DB `ganancia` (GENERATED) = subtotal − costo_productos − costo_envio. **Ignora el descuento** (verificado contra datos reales: una venta con descuento 802.73 tiene ganancia = subtotal completo).
2. DB `utilidad_neta` (GENERATED) = subtotal − descuento − costo_productos − costo_envio. Esta es la correcta.
3. ventas-dashboard "ganancia bruta" JS = subtotal − costo_productos (sin envío, sin descuento).
El dashboard principal y estadísticas consumen (1), que sobreestima la ganancia cada vez que hay descuento. Otros módulos consumen (2). No hay forma de que un usuario sepa cuál cifra de "ganancia" está viendo. **Recomendación arquitectónica:** elegir utilidad_neta como única métrica de "Ganancia neta" en TODA la app y reservar "ganancia bruta" (sin envío) solo si se etiqueta explícitamente. Idealmente, redefinir la columna ganancia en BD para que reste descuento, o dejar de usarla en favor de utilidad_neta.

**Reparto de socios — el riesgo más caro:** El modelo de negocio real NO es 50/50 (CLAUDE.md y datos lo confirman: filas de un solo socio con el monto completo). Pero saveVenta hardcodea 50/50 y marcarVendida no crea nada. Como finanzas/dashboard calculan capital recuperado y ROI sumando venta_socios.monto directamente, toda venta nueva creada por la app va a desviar el ROI. Esto es justo el tipo de corrupción silenciosa de datos financieros que no se nota hasta que los números no cuadran meses después.

**Qué simplificaría/automatizaría la IA:** (a) un solo helper getUtilidadNeta() reutilizado en todos los reportes, eliminando las 3 fórmulas divergentes; (b) un selector de reparto en el form de venta (slider Sandra/Benjamin con default configurable y validación de que sume el total) en vez del 50/50 ciego; (c) generación de folio vía secuencia Postgres o constraint UNIQUE + reintento atómico, eliminando la carrera por count(). 

**Lo que genera fricción/confunde:** topProductos en estadísticas mezcla histórico completo + items internos de Piel Canela (no se filtra por ventaIds ni por internalIds), así que el "producto estrella" puede estar inflado con consumo interno de la socia. El feed de actividad del dashboard enlaza siempre a /ventas o /cotizaciones genérico (sin ID), fricción menor de UX.

**Hallazgos (8):**

<details>
<summary><strong>[Crítico] #4 — marcarVendida no crea venta_socios: las ventas convertidas desde cotización desaparecen del ROI</strong> · Lógica de negocio · Imp 9/Cpx 4 · 1d</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/actions.ts:173-276`
- **Problema:** El flujo cotización→venta (marcarVendida) inserta la venta y venta_items, descuenta inventario y marca la cotización como aceptada, pero NUNCA inserta filas en venta_socios. Resultado: una venta convertida desde cotización aporta $0 al capital recuperado y al ROI de ambos socios, mientras que una venta creada con saveVenta aporta 50/50. Dos caminos de creación con dos comportamientos distintos, ambos incorrectos. Peor: revertirCotizacion (línea 586) hace delete de venta_socios que marcarVendida jamás creó, evidenciando la inconsistencia.
- **Recomendación:** Unificar la creación de reparto en un solo helper compartido (mismo que saveVenta tras corregir el hallazgo anterior) e invocarlo también en marcarVendida tras crear la venta. Mientras no exista captura de reparto, al menos crear una fila con el cobrador real o dejar explícito el reparto pendiente, pero nunca dejar la venta sin filas si las demás sí las tienen.
- **Ejemplo:**

```
// tras el insert de venta en marcarVendida:
await insertarRepartoSocios(supabase, venta.id, cot.total, repartoElegido)
// donde insertarRepartoSocios es el helper único usado también por saveVenta
```

- **Beneficio esperado:** Consistencia entre ambos caminos de creación; las ventas desde cotización dejan de ser invisibles para el ROI.
- **Verificación:** confirmado — CONFIRMADO con todas las evidencias.

1) marcarVendida NO crea venta_socios. En src/app/(dashboard)/cotizaciones/actions.ts:173-276 el flujo: lee la cotización (176-186), crea la venta (202-218), copia venta_items (227-246), llama RPC descontar_inventario_venta (248-256) y marca la cotización aceptada (258-268). NO hay NINGÚN insert a venta_socios entre esos pasos. Confirmado además p

</details>

<details>
<summary><strong>[Alto] #15 — La columna GENERATED 'ganancia' ignora el descuento; dashboard y estadísticas la usan → ganancia/margen sobreestimados</strong> · Lógica de negocio · Imp 7/Cpx 3 · 3-4h</summary>

- **Archivo:** `src/app/(dashboard)/page.tsx:306-316, 366`
- **Problema:** Verificado contra producción: ventas.ganancia = subtotal − costo_productos − costo_envio y NO resta el descuento (una venta con descuento 802.73 reporta ganancia = subtotal íntegro, mientras utilidad_neta sí descuenta y da 3316.96 vs 4119.69). El dashboard principal (gananciaMes, cambioGanancia, sparkline, margen) y getVentasStats (ventas/actions.ts:273, consumido por estadisticas) usan esta columna 'ganancia'. Por tanto la 'Ganancia neta' y el '% margen' que ve el dueño están inflados cada vez que hubo descuento. En cambio ventas-dashboard, ventas-table, clientes y cotizaciones usan utilidad_neta (correcta). Misma etiqueta 'Ganancia neta', tres fórmulas distintas según el módulo.
- **Recomendación:** Definir utilidad_neta como la única fuente de verdad para 'Ganancia neta' y sustituir todas las lecturas de 'ganancia' por 'utilidad_neta' en page.tsx y getVentasStats. Alternativa de fondo: redefinir la columna BD ganancia para restar descuento (o eliminarla) y así evitar que cualquier consumidor futuro vuelva a equivocarse.
- **Ejemplo:**

```
// page.tsx: cambiar el select y los reduce
.select('id, total, utilidad_neta, cliente_id, ...')
const gananciaMes = ventasMes.reduce((s,v)=>s+Number(v.utilidad_neta ?? 0),0)
// actions.ts getVentasStats: select utilidad_neta y acumular en cur.ganancia
```

- **Beneficio esperado:** Una sola cifra de ganancia consistente en toda la app; los KPIs dejan de sobreestimar cuando hay descuentos.
- **Verificación:** confirmado — CONFIRMADO. El dashboard principal lee la columna GENERATED `ganancia` y la presenta como "Ganancia neta" + "% margen":
- src/app/(dashboard)/page.tsx:144,148,153 — los 3 SELECT a `ventas` traen solo `ganancia`, NUNCA `utilidad_neta`.
- page.tsx:306 `gananciaMes = Σ ganancia`; :312-316 gananciaMesAnt y cambioGanancia idem.
- page.tsx:366 sparkline mensual usa `ganancia`; :508 sparklin

</details>

<details>
<summary><strong>[Alto] #37 — saveVenta fuerza reparto 50/50 que contradice el modelo real y corrompe el ROI</strong> · Lógica de negocio · Imp 6/Cpx 5 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:108-128`
- **Problema:** Toda venta creada por el formulario inserta DOS filas venta_socios con monto = total/2 para Sandra y Benjamin. Pero el negocio real NO reparte 50/50: verificado contra producción, la mayoría de ventas tienen UNA sola fila venta_socios con el monto completo asignado a quien cobró ('A quien se le dio' del Sheet). Como finanzas/page.tsx (capitalRecuperado, ROI) y dashboard/page.tsx (socioStats) suman venta_socios.monto directamente, cada venta nueva desvía el ROI por socio y el capital recuperado. Es corrupción financiera silenciosa: los KPIs dejan de cuadrar con la realidad y nadie lo nota hasta una conciliación.
- **Recomendación:** La dirección del auditor es correcta pero la opción "no asumir 50/50, insertar fila 'sin asignar'" choca con la preferencia documentada del dueño (memory: 50/50 default aceptable si es editable). Recomendación afinada: (1) Capturar el reparto en el formulario: extender SaveVentaInput con `reparto: {socioId: string, monto: number}[]` opcional. venta-form.tsx ya tiene el panel "División de socios" (494-527) — convertirlo de read-only a inputs editables con default sugerido (no impuesto) y validar que sum(monto) = subtotal SIN IVA (no el total con IVA, para alinear con el modelo real de la nota de memoria). (2) En saveVenta, si viene `reparto`, escribirlo vía el mismo mecanismo que updateVentaSocio (reusar/extraer su lógica UPSERT como función compartida, evitando dos rutas de escritura divergentes). (3) Si NO viene reparto, mantener un fallback pero corregir la BASE: usar `subtotal` (no `total`) para el 50/50, y marcarlo visualmente como "default sin asignar" para que el usuario lo corrija. (4) Mostrar en /ventas un indicador cuando sum(venta_socios.monto) de una venta no cuadra con su base esperada, para detectar repartos sin revisar antes de una conciliación.
- **Ejemplo:**

```
// En SaveVentaInput añadir reparto: { socioId: string; monto: number }[]
// y en saveVenta, en vez del 50/50:
const filas = input.reparto.length > 0 ? input.reparto : [{ socioId: cobradorDefault, monto: input.total }]
const suma = filas.reduce((s,r)=>s+r.monto,0)
if (Math.abs(suma - input.total) > 0.5) return { ok:false, error:'El reparto no suma el total' }
await supabase.from('venta_socios').insert(filas.map(r=>({ venta_id: venta.id, socio_id: r.socioId, monto: Number(r.monto.toFixed(2)), pagado:false })))
```

- **Beneficio esperado:** ROI y capital recuperado por socio reflejan el cobro real; se elimina la deriva acumulada en cada venta nueva.
- **Verificación:** ajustado — MECÁNICA CONFIRMADA. saveVenta inserta DOS filas venta_socios a `total/2` para Sandra y Benjamin sin importar quién cobró: src/app/(dashboard)/ventas/actions.ts:109 `const half = Number((input.total / 2).toFixed(2))` y el array ventaSocios líneas 110-127 con `monto: half` para SANDRA_ID y BENJAMIN_ID (constantes líneas 9-10), insertado en línea 128.

CONSUMIDORES CONFIRMADOS (suman vent

</details>

<details>
<summary><strong>[Medio] #61 — topProductos en estadísticas no excluye items internos (Piel Canela) ni respeta el filtro de periodo</strong> · Lógica de negocio · Imp 5/Cpx 2 · 2h</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts:238-264`
- **Problema:** El query de venta_items para topProductos trae TODOS los items históricos sin filtrar por ventaIds (se calcula ventaIds excluyendo internos pero luego se hace 'void ventaIds' y no se usa). Por tanto: (1) los items de ventas internas de Piel Canela cuentan en el ranking de productos top, contradiciendo la regla de excluir lo interno de las estadísticas; y (2) el ranking ignora el filtro de fecha desde/hasta de la página, así que 'producto estrella del periodo' realmente muestra el histórico completo. El comentario justifica (2) deliberadamente, pero (1) es un olvido real de exclusión interna.
- **Recomendación:** Filtrar venta_items por los ventaIds ya calculados (que excluyen internos) con .in('venta_id', ventaIds). Si se quiere mantener el ranking histórico, calcular ventaIds históricos no-internos en un query aparte y filtrar por ellos; pero nunca dejar entrar los items de Piel Canela.
- **Ejemplo:**

```
const r1 = await admin.from('venta_items').select('cantidad, precio_unitario, producto_id, productos!inner(nombre, sku, categorias(nombre))').in('venta_id', ventaIdsNoInternos)
```

- **Beneficio esperado:** El ranking de productos deja de inflarse con el consumo interno de la socia; consistente con el resto de KPIs que excluyen Piel Canela.

</details>

<details>
<summary><strong>[Medio] #120 — ventas-dashboard llama 'ganancia bruta' a subtotal − costo_productos, omitiendo costo_envio</strong> · Lógica de negocio · Imp 4/Cpx 2 · 2-3h</summary>

- **Archivo:** `src/app/(dashboard)/ventas/ventas-dashboard.tsx:164-184`
- **Problema:** El KPI 'ganancia' del dashboard de ventas se calcula como Σ(subtotal − costo_productos), sin restar costo_envio ni descuento, y se muestra como 'margen bruto' (línea 780). Coexiste con utilidadNeta (que sí resta todo). Aunque el comentario lo declara intencional ('fórmula Sheet'), tener una métrica de ganancia que ignora el envío junto a otra que no lo hace, en la misma pantalla, confunde y se presta a leer la cifra equivocada. El envío es un costo real ya prorrateado por unidad.
- **Recomendación:** Etiquetar sin ambigüedad: si se mantiene la métrica bruta, llamarla literalmente 'Ganancia bruta (sin envío)' y mostrar la utilidad neta como la cifra principal de ganancia. Idealmente usar un único concepto (utilidad_neta) en los KPIs destacados y dejar el desglose bruto solo como detalle secundario.
- **Ejemplo:**

```
// renombrar label y/o:
const gananciaNeta = activos.reduce((s,v)=>s+Number(v.utilidad_neta ?? 0),0)
// usar gananciaNeta como KPI principal y la bruta como sub-línea explícita
```

- **Beneficio esperado:** Evita que el dueño confunda margen bruto sin-envío con ganancia real; coherencia con el resto de la app.

</details>

<details>
<summary><strong>[Medio] #147 — cotizaciones.numero sin UNIQUE: la generación de folio por count()+reintento es racy (portal concurrente)</strong> · Base de datos · Imp 4/Cpx 4 · 4-6h</summary>

- **Archivo:** `src/app/(dashboard)/cotizaciones/actions.ts:52-76`
- **Problema:** generarNumeroCotizacion calcula el consecutivo como count(cotizaciones del cliente)+1 y verifica unicidad con un bucle de SELECTs (numeroOrdenExiste). No hay UNIQUE en cotizaciones.numero (solo ventas.numero lo tiene, vía seed-ventas-from-sheet.sql:17). El patrón leer-contar-verificar-insertar no es atómico: dos cotizaciones del mismo cliente creadas casi simultáneamente (típico en el portal público /order, que es internet-facing y rate-limita a 10/hora pero permite ráfagas) pueden obtener el mismo número. Igual riesgo en order/actions.ts:96-118 (generarNumeroEstandar) y submitOrder. Hoy no hay duplicados (76 cotizaciones, 0 dups) pero es cuestión de tiempo/carga.
- **Recomendación:** Añadir constraint UNIQUE a cotizaciones.numero (idempotente, mismo patrón DO $$ que ventas_numero_unique en seed-ventas-from-sheet.sql:11-19). Envolver el INSERT de saveCotizacion/submitOrder en un loop acotado (ej. 5 intentos) que ante violación 23505 recalcule consecutivo+1 y reintente — esto traslada la garantía de unicidad a la BD en vez de la lectura previa numeroOrdenExiste, que puede eliminarse (o mantenerse solo como sugerencia de preview en siguienteNumeroCotizacion). Mantener la semántica consecutivo POR CLIENTE en el reintento. Nota: como numero mezcla -C-/-V- y el seed ya impone UNIQUE solo en ventas, validar que ningún flujo dependa de que un mismo string exista en ambas tablas (cambiarTipoNumero crea variantes -C-/-V- distintas, así que no colisionan entre tablas). A futuro, si crece el volumen, un contador por cliente (tabla o secuencia) evita el count() y la carrera de raíz.
- **Ejemplo:**

```
ALTER TABLE cotizaciones ADD CONSTRAINT cotizaciones_numero_unique UNIQUE (numero);
// en saveCotizacion: try insert; if (error?.code === '23505') { consecutivo++; reintentar }
```

- **Beneficio esperado:** Imposibilita folios duplicados aunque haya concurrencia; elimina los 4 SELECTs por intento de numeroOrdenExiste.
- **Verificación:** ajustado — Mecanismo CONFIRMADO. generarNumeroCotizacion (src/app/(dashboard)/cotizaciones/actions.ts:52-76) calcula consecutivo = count(cotizaciones del cliente)+1 (líneas 58-61, 68) y verifica unicidad con numeroOrdenExiste (líneas 38-50), que hace SELECTs separados (Promise.all de 4 maybeSingle, líneas 44-47). Es read-check-write sin transacción ni constraint → TOCTOU real. Patrón DUPLICADO en 

</details>

<details>
<summary><strong>[Bajo] #176 — Preview de ganancia en el form de venta difiere de la 'ganancia' mostrada tras guardar (por el descuento)</strong> · UX · Imp 3/Cpx 2 · 1h</summary>

- **Archivo:** `src/app/(dashboard)/ventas/venta-form.tsx:129`
- **Problema:** El form calcula ganancia = total − iva − costo_productos − costo_envio, que algebraicamente = subtotal − descuento − costo_productos − costo_envio (= utilidad_neta, correcta). Pero la página de detalle /ventas/[id] muestra venta.ganancia (la columna BD que NO resta descuento). Cuando hay descuento, el usuario ve una ganancia en el preview y otra distinta (mayor) al abrir la venta guardada, sin explicación.
- **Recomendación:** Mostrar venta.utilidad_neta en /ventas/[id]/page.tsx en vez de venta.ganancia, alineándolo con el preview del form y con el resto de la app. Es el mismo fix de fondo del hallazgo de la columna ganancia.
- **Ejemplo:**

```
// page.tsx:223
value={mxn.format(Number(venta.utilidad_neta ?? 0))}
```

- **Beneficio esperado:** La ganancia que el usuario vio antes de guardar coincide con la que ve después; elimina desconcierto.

</details>

<details>
<summary><strong>[Bajo] #186 — Generación de folio usa fecha en zona horaria local del servidor</strong> · Lógica de negocio · Imp 3/Cpx 3 · 2h</summary>

- **Archivo:** `src/lib/numero-orden.ts:17-24`
- **Problema:** fechaDDMMYY usa getDate/getMonth/getFullYear (hora local del runtime). En Vercel el runtime corre en UTC; un folio generado a las 19:00 hora de México (UTC-6, ya 01:00 UTC del día siguiente) tendrá la fecha de mañana en el número. Inconsistencia menor entre la fecha del folio y la fecha real del negocio, y posible salto de día en el segmento DDMMYY.
- **Recomendación:** Fijar la zona horaria a America/Mexico_City al derivar DDMMYY (usar Intl.DateTimeFormat con timeZone, o pasar siempre la fecha de negocio ya normalizada). Mantener consistencia con cómo se guardan las fechas de venta/cotización.
- **Ejemplo:**

```
const parts = new Intl.DateTimeFormat('es-MX',{ timeZone:'America/Mexico_City', day:'2-digit', month:'2-digit', year:'2-digit'}).formatToParts(d)
// recomponer dd,mm,yy desde parts
```

- **Beneficio esperado:** El folio refleja siempre el día de negocio mexicano, sin saltos por UTC.

</details>


### Comparativa mundial

Piel Canela ERP es un ERP/CRM vertical, monolítico y monoempresa, hecho a la medida de una microdistribuidora de bronceado con 2 socias. Cubre de punta a punta un flujo que los grandes solo logran con muchos módulos y consultores: importación (pedidos Brasil con costeo BRL/USD/MXN), inventario dolarizado, cotización con PDF, venta con reparto de utilidad por socio, CRM con predicción de compra ML-ready, finanzas/ROI por socio y un portal público de pedidos con reconocimiento por teléfono y notificaciones realtime. Su ventaja real frente a Salesforce/SAP/NetSuite no es funcionalidad sino ausencia de fricción: cero configuración, cero licencias, cero curva de aprendizaje, y lógica de negocio (utilidad por socio, costeo de importación, IVA referencial vs real) que ningún SaaS genérico trae de fábrica. Sus brechas de clase mundial son las esperables en un MVP de un solo desarrollador: sin usuarios/roles ni audit trail (riesgo financiero y de cumplimiento), sin facturación CFDI/contabilidad, sin export a Excel/CSV, sin búsqueda global, sin app móvil/PWA real, sin automatizaciones/workflows, y un módulo de IA potente pero sin acción (predice pero no dispara campañas ni reordenes). Posicionamiento honesto hoy: producto interno excelente para 2-3 personas, a 5 features de convertirse en un SaaS vertical defendible para distribuidores chicos de LatAm.

**Hallazgos (11):**

<details>
<summary><strong>[Alto] #9 — Sin export a Excel/CSV — capacidad table-stakes ausente en todo el ERP</strong> · Funcionalidad · Imp 7/Cpx 2 · 1-2d</summary>

- **Archivo:** `src/app/(dashboard)/finanzas/page.tsx:496-578`
- **Problema:** Ninguna tabla (ventas, recuperación por venta, inventario, clientes, pedidos) ofrece exportar a CSV/Excel. La búsqueda en el repo solo encuentra 'export' como keyword de JS, no como feature. El contador, el banco o cualquier análisis externo obligan a copiar a mano. Cada competidor (de Notion a NetSuite) exporta. Es además el formato en que el negocio ya vivía (Google Sheets).
- **Recomendación:** Botón 'Exportar' en cada tabla principal que genere CSV client-side (las filas ya están en el server component). Empezar por finanzas (recuperación por venta) e inventario.
- **Ejemplo:**

```
const csv = rows.map(r => [r.numero, r.fecha, r.total].join(',')).join('\n'); const blob = new Blob([csv], {type:'text/csv'}); // descargar
```

- **Beneficio esperado:** Cierra una brecha universal con cero costo; habilita conciliación contable y análisis externo.
- **Verificación:** confirmado — Confirmado. La tabla "Recuperación por venta" en src/app/(dashboard)/finanzas/page.tsx:496-578 tiene header con conteo de filas (línea 503-505) pero ningún botón de exportar; los datos (ventasFilas) ya están materializados en el server component. Barrido del repo: grep de csv|exportar|.xlsx|toBlob|download=|createObjectURL|blob en src/ → 0 resultados. grep de download|excel|sheet → so

</details>

<details>
<summary><strong>[Alto] #41 — Sin usuarios, roles ni audit trail — todo bajo una contraseña compartida</strong> · Seguridad · Imp 6/Cpx 7 · 1-2 sem</summary>

- **Archivo:** `src/lib/auth.ts:32`
- **Problema:** La autenticación es una sola contraseña compartida que emite un JWT con role:"erp". No hay identidad de usuario, ni roles, ni registro de quién creó/editó/borró ventas, cotizaciones o inversiones. En un sistema que mueve dinero (utilidad por socio, capital recuperado, edición de ventas), la imposibilidad de saber quién hizo qué es un hueco de integridad financiera y un bloqueador absoluto para multi-tenant. TODOS los competidores (incluso HubSpot Free) tienen usuarios y registro de actividad.
- **Recomendación:** La recomendación original es buena y de bajo costo; la priorizaría así para no sobre-ingeniar un negocio de 2-3 usuarios: (1) FASE 1 barata e inmediata — agregar identidad mínima sin RBAC: que el login acepte 2-3 contraseñas (una por persona) o un selector de "quién eres" + PIN, e incrustar `actor` (p.ej. 'sandra'|'benjamin') en el JWT de createSessionToken(); luego leer ese claim en las server actions y escribir `created_by`/`updated_by` (text) en ventas, cotizaciones, inversiones e inventario. Esto da el 80% del valor (saber quién tocó el dinero) con muy poco código. (2) FASE 2 — tabla `audit_log` (entidad, entidad_id, accion, actor, diff_jsonb, timestamp) escrita desde las server actions de escritura ya que TODO pasa por ahí (service_role), evitando triggers de Postgres que no verían el actor de app. (3) NO introducir Supabase Auth/RBAC completo todavía: es desproporcionado hoy y se puede diferir hasta que realmente se necesite multi-tenant. Nota técnica: como toda la app usa service_role y bypassa RLS, el audit trail DEBE implementarse en la capa de server actions (no depender de auth.uid() ni de triggers que lean el rol de DB).
- **Ejemplo:**

```
ALTER TABLE ventas ADD COLUMN created_by uuid, ADD COLUMN updated_by uuid; -- + tabla audit_log(id, entidad, entidad_id, accion, usuario_id, datos jsonb, created_at). Registrar en cada server action de actions.ts.
```

- **Beneficio esperado:** Trazabilidad financiera, confianza entre socias, y prerequisito para vender el producto a otros distribuidores (multi-tenant).
- **Verificación:** ajustado — CONFIRMADO en los hechos. src/lib/auth.ts:31-37 emite un JWT con payload fijo `{ role: "erp" }` — sin sub/uid/identidad de usuario. src/app/login/actions.ts:32,51,60 valida una sola contraseña compartida (`process.env.ERP_PASSWORD`) y al pasar llama createSessionToken() sin distinguir quién entró. No existe NINGÚN rastro de actor: `grep -rniE "created_by|updated_by|audit_log|auditoria"`

</details>

<details>
<summary><strong>[Medio] #48 — Sin gestión de tareas/actividades ni timeline por cliente (CRM incompleto)</strong> · Funcionalidad · Imp 6/Cpx 4 · 3-5d</summary>

- **Archivo:** `src/app/(dashboard)/clientes/lib-prediccion.ts:20-37`
- **Problema:** El CRM predice compras pero no registra interacciones: no hay log de llamadas/mensajes, ni tareas de seguimiento, ni notas con fecha por cliente. La ficha de cliente muestra histórico de compras y predicción, pero no 'qué hablamos la última vez' ni 'a quién hay que llamar'. Es la diferencia entre un panel analítico y un CRM operativo (HubSpot/Salesforce giran alrededor del timeline de actividad).
- **Recomendación:** Tabla actividades(cliente_id, tipo, nota, fecha, usuario_id) y un timeline en clientes/[id]. Empezar minimal: notas con fecha + checkbox de 'seguimiento pendiente'.
- **Ejemplo:**

```
CREATE TABLE actividades (id uuid, cliente_id uuid, tipo text, nota text, completada bool, fecha date, created_at timestamptz);
```

- **Beneficio esperado:** Convierte el CRM analítico en operativo; combinado con la predicción, cierra el loop comercial completo.

</details>

<details>
<summary><strong>[Medio] #51 — Sin automatizaciones/recordatorios — las alertas se calculan pero no se notifican</strong> · Automatización · Imp 6/Cpx 5 · 3-5d</summary>

- **Archivo:** `src/app/(dashboard)/page.tsx:434-450`
- **Problema:** El dashboard calcula 'cotización X vence en N días' y 'stock bajo', pero son insights pasivos: nadie recibe nada si no abre el dashboard. La infraestructura de notificaciones existe (tabla notificaciones, realtime para pedidos del portal en order/actions.ts) pero solo se usa para el portal. Monday/HubSpot/ClickUp automatizan recordatorios. Una cotización puede vencer sin que nadie se entere.
- **Recomendación:** Job diario (cron Vercel) que inserte notificaciones para cotizaciones por vencer, stock agotado y clientes en riesgo (reutilizar lib-prediccion). Reusar el canal realtime ya construido.
- **Ejemplo:**

```
app/api/cron/alertas/route.ts -> select cotizaciones donde valida_hasta entre hoy y +3d -> insert notificaciones.
```

- **Beneficio esperado:** Reaprovecha infraestructura existente para evitar cotizaciones vencidas y quiebres de stock; sensación de 'sistema proactivo'.

</details>

<details>
<summary><strong>[Medio] #55 — Todo en MXN aunque el negocio es nativamente USD/BRL — sin multi-moneda transaccional</strong> · Lógica de negocio · Imp 6/Cpx 6 · 1 sem</summary>

- **Archivo:** `src/app/(dashboard)/finanzas/page.tsx:16-21`
- **Problema:** Las ventas, cotizaciones e inversiones se llevan en MXN, pero los costos reales son USD (envío, precio) y BRL (proveedor), convertidos vía tipo_cambio referencial estático ($20.70). No hay registro de la moneda original de la transacción ni del TC del día, así que la utilidad real se mueve con cada cambio de TC y no es auditable históricamente. NetSuite/Dynamics manejan multi-moneda transaccional con TC fechado.
- **Recomendación:** Guardar moneda + tipo_cambio_aplicado por transacción (al menos en pedidos e inversiones) para congelar la utilidad histórica y permitir reportes en USD/MXN sin recalcular.
- **Ejemplo:**

```
pedidos.moneda_origen, pedidos.tc_aplicado ya parcialmente existen; extender a inversiones y congelar en ventas el TC usado para costos.
```

- **Beneficio esperado:** Utilidad histórica estable y auditable; reportes en la moneda real de costeo; base para crecer a más proveedores/monedas.

</details>

<details>
<summary><strong>[Medio] #67 — Sin app móvil/PWA real pese a uso de campo (portal y captura desde celular)</strong> · UX · Imp 5/Cpx 3 · 2-3d</summary>

- **Archivo:** `src/app/(dashboard)/layout.tsx:36-160`
- **Problema:** El layout tiene drawer responsive, pero no hay manifest PWA, ni instalación a home screen, ni modo offline. Para un negocio donde se cotiza/vende desde el celular y el portal es móvil-first, depender del navegador es fricción. Salesforce/HubSpot/Monday tienen apps nativas; el mínimo competitivo hoy es una PWA instalable.
- **Recomendación:** Añadir manifest.json + service worker básico (next-pwa) para instalación a home screen y caché de assets. No requiere reescritura — Next 15 lo soporta nativo.
- **Ejemplo:**

```
app/manifest.ts export default manifest con name/icons/display:standalone.
```

- **Beneficio esperado:** Acceso tipo-app desde el celular de las socias y mejor experiencia del portal sin construir nativo.

</details>

<details>
<summary><strong>[Medio] #91 — IA que predice pero no actúa — la predicción de recompra no dispara nada</strong> · IA · Imp 5/Cpx 5 · 1 sem</summary>

- **Archivo:** `src/app/(dashboard)/clientes/lib-prediccion.ts:87-255`
- **Problema:** El modelo calcula probabilidad de compra a 30/60/90 días, riesgo de abandono, ventana estimada e ingreso esperado, pero el resultado solo se muestra en un panel. No genera ninguna acción: ni recordatorio, ni borrador de WhatsApp/email, ni alerta de 'cliente en riesgo'. HubSpot/Salesforce convierten el scoring en secuencias. Esta es justamente la ventaja diferencial declarada (IA) desperdiciada a la mitad.
- **Recomendación:** Convertir el badge de `accionRecomendada` (prediccion-compras.tsx:712-725) en un CTA real. Como el cliente tiene `telefono` (page.tsx:22 lo trae), añadir un botón "WhatsApp" que abra `https://wa.me/${telefono.replace(/\D/g,'')}?text=${encodeURIComponent(plantilla)}` con plantilla según el estado de la acción (Reenganchar / Contactar HOY / Upsell / Follow-up). Normalizar el teléfono a E.164 (anteponer 52 MX si falta). Reutilizar el patrón tel:/mailto: ya existente en cliente-drawer.tsx:310-327 y agregar ahí también el botón WhatsApp ligado a la predicción. Bonus realista: en prediccion-insights.tsx (que ya arma la lista priorizada por revenue/riesgo, 91-107) renderizar cada fila con el botón WhatsApp directo, materializando "Para contactar esta semana" como vista accionable. Opcional fase 2: persistir un "último contacto" para no repetir mensajes. No requiere infra nueva (link wa.me en cliente, sin enviar nada server-side).
- **Ejemplo:**

```
const msg = encodeURIComponent('Hola ' + nombre + ', ¿te resurtimos tu pedido habitual?'); const url = 'https://wa.me/52' + telDigits + '?text=' + msg;
```

- **Beneficio esperado:** Convierte un modelo bonito en revenue real; difícil de igualar por SaaS genéricos en este nicho.
- **Verificación:** ajustado — CONFIRMADO el núcleo del hallazgo, pero la severidad estaba inflada. El modelo en lib-prediccion.ts (87-255) sí calcula probabilidadProx30/60/90, riesgoAbandono (172-176), ventana (179-188), ingresoEstimadoProx (192) y valorFuturo12m (197), y NINGUNO dispara una acción.

Evidencia de que la salida es solo visual:
- prediccion-compras.tsx:300-360 — `accionRecomendada()` produce un objeto

</details>

<details>
<summary><strong>[Medio] #92 — Sin búsqueda global ni command palette (Cmd+K)</strong> · UX · Imp 5/Cpx 5 · 3-5d</summary>

- **Archivo:** `src/components/sidebar-nav.tsx:15-23`
- **Problema:** La navegación es solo el sidebar de 7 enlaces. No hay forma de buscar 'cliente Mithra', 'cotización PC-...', o un producto desde cualquier pantalla. La única instancia de 'command' en el código es product-drawer, no un palette real. Linear/Notion/Salesforce hacen de la búsqueda global el atajo central de productividad; su ausencia obliga a navegar y filtrar manualmente en cada módulo.
- **Recomendación:** Command palette Cmd+K SÍ es la dirección correcta, pero: (1) Corregir la premisa — `cmdk` NO está instalado; hay que `npm i cmdk` y agregar el componente shadcn `command` (no existe en src/components/ui). (2) Implementarlo como mejora de productividad de prioridad Media, no urgente. (3) La búsqueda unificada debe hacerse vía server action con createClient()/createAdminClient() (service_role) — NO con el browser client, ya que el anon está bloqueado por RLS (ver CLAUDE.md). (4) Buscar clientes (ojo: Shams usa nombre_negocio, no nombre), ventas (formato PC-\d+), cotizaciones y productos. (5) Acciones rápidas 'Nueva venta'/'Nueva cotización' como ítems del palette. Alternativa de menor esfuerzo si se quiere ROI inmediato: empezar por un buscador en el header que abra resultados, antes de invertir en el palette completo.
- **Ejemplo:**

```
Server action searchGlobal(q) -> Promise.all sobre clientes/ventas/cotizaciones/productos con ilike; render con cmdk.
```

- **Beneficio esperado:** Salto de productividad percibido enorme con bajo esfuerzo; iguala el estándar Linear/Notion que el propio CLAUDE.md ya admira.
- **Verificación:** ajustado — PREMISA CORE CONFIRMADA: La navegación es solo el sidebar con exactamente 7 enlaces estáticos (src/components/sidebar-nav.tsx:15-23: Dashboard, Inventario, Cotizaciones, Ventas, Clientes, Pedidos, Finanzas). No existe búsqueda global ni command palette. Verifiqué todos los `keydown` del repo (grep): los 16 hits son handlers de Escape-para-cerrar modales/drawers (ej. product-drawer.tsx:1

</details>

<details>
<summary><strong>[Medio] #104 — Sin facturación fiscal (CFDI) ni capa contable mínima</strong> · Funcionalidad · Imp 5/Cpx 8 · 2-4 sem</summary>

- **Archivo:** `src/app/(dashboard)/ventas/actions.ts`
- **Problema:** El ERP calcula IVA real (ventas.iva) y utilidad, pero no emite facturas fiscales (CFDI 4.0, obligatorio en México) ni lleva libro de ingresos/egresos para el SAT. Hoy registra dinero pero no lo formaliza fiscalmente. NetSuite/Dynamics/Odoo/SAP tienen facturación nativa. Para un negocio mexicano con IVA esto es la frontera entre 'sistema que mide' y 'sistema que opera'.
- **Recomendación:** No partir de "RFC falta": clientes.rfc ya existe y está cableado (cliente-form, cotizaciones list/nueva/page). El gap real es timbrado + datos CFDI faltantes. Plan por fases: (1) Completar el dataset fiscal mínimo que SÍ falta hoy: RFC/Razón social/Régimen fiscal y CP fiscal del EMISOR (Piel Canela), y por cliente añadir uso_cfdi y regimen_fiscal_receptor (clientes.rfc solo no basta para CFDI 4.0). (2) Modelar la capa contable: tabla `facturas` (1:1 o 1:N con ventas) con uuid_sat, serie/folio, status_timbrado, xml_url, pdf_url, fecha_timbrado, separando el comprobante fiscal del registro comercial (ventas) — clave porque una venta puede ir sin factura. (3) Integrar un PAC (Facturama por DX en MX) vía server action con createAdminClient, timbrando desde ventas.iva (el REAL, no cotizaciones.iva) y guardando el XML/PDF en Storage como ya se hace con documentos de pedidos. (4) Excluir ventas del cliente interno Piel Canela (08449791-…) del timbrado. Priorizar fase 1-2 ahora (barato, prepara el terreno) y diferir el PAC hasta que el volumen lo justifique.
- **Ejemplo:**

```
ALTER TABLE clientes ADD COLUMN rfc text, uso_cfdi text; -- server action timbrarCFDI(ventaId) -> POST al PAC.
```

- **Beneficio esperado:** Convierte el ERP en herramienta de operación fiscal real; requisito para venderlo a cualquier negocio formal en MX.
- **Verificación:** ajustado — CONFIRMADO el núcleo del hallazgo: no existe ninguna emisión de CFDI 4.0 ni capa contable. Verificado por ausencia total de PAC/timbrado en el repo:
- package.json NO contiene facturama/finkok/sw-sapien/timbr/cfdi (grep exit:1, sin dependencias).
- scripts/ sin tablas factura/cfdi/timbrado (grep vacío).
- src/lib/pdf.ts (2373 bytes) genera el PDF de la cotización pero NO contiene rfc/cf

</details>

<details>
<summary><strong>[Bajo] #162 — Sin reportes/dashboards configurables por el usuario — todo está hardcodeado</strong> · Funcionalidad · Imp 4/Cpx 6 · 1-2 sem</summary>

- **Archivo:** `src/app/(dashboard)/ventas/estadisticas/page.tsx`
- **Problema:** Los KPIs, rangos de fecha y agrupaciones están fijados en código (ventas por tipo, mensual con filtros 3M/6M/1A/TODO). El usuario no puede crear su propia vista ('ventas por ciudad este trimestre' o 'utilidad por producto'). Todo competidor de gama media (HubSpot, Monday, NetSuite) ofrece report builder self-serve. Para 2-3 usuarios hoy es aceptable, pero limita análisis ad-hoc y es brecha clara vs el mercado.
- **Recomendación:** No construir un report builder completo (sería bloat). Empezar por filtros de fecha personalizables (date range picker) y agrupar por dimensión seleccionable (cliente/producto/ciudad/categoría) en la pantalla de estadísticas.
- **Ejemplo:**

```
Selector <Group by: cliente|producto|categoría|ciudad> + <rango fechas> que recomputa la agregación en el server component.
```

- **Beneficio esperado:** Cubre el 80% de las preguntas ad-hoc sin la complejidad de un report builder genérico; mantiene la simplicidad.

</details>

<details>
<summary><strong>[Bajo] #177 — Activity feed del dashboard enlaza a listas, no al registro específico</strong> · UX · Imp 3/Cpx 2 · 2h</summary>

- **Archivo:** `src/app/(dashboard)/page.tsx:797-800`
- **Problema:** En el feed de actividad reciente, los items de venta enlazan a /ventas (la lista completa) en lugar de /ventas/[id], con un comentario en el código que lo admite ('no tenemos ID directo aquí pero es OK'). El usuario hace clic esperando ir al detalle y aterriza en la lista. Linear/Notion nunca rompen ese contrato de navegación.
- **Recomendación:** Incluir el id en allVentasRecientes/allCotsRecientes (ya se seleccionan) y enlazar a /ventas/${id} y /cotizaciones/${id} en el feed.
- **Ejemplo:**

```
Añadir id al ActivityItem y href = a.tipo==='venta' ? `/ventas/${a.id}` : `/cotizaciones/${a.id}`
```

- **Beneficio esperado:** Navegación predecible y profesional en la pantalla más usada.

</details>


---

## 7. Metodología

Auditoría multi-agente en 3 fases: (1) 8 auditores de módulo + 10 auditores de dimensión transversal en paralelo, cada uno leyendo el código real y reportando hallazgos con file:line; (2) verificación adversarial de los 82 hallazgos Crítico/Alto contra el código (1 refutados, 58 ajustados); (3) síntesis (resumen ejecutivo, IA, roadmaps) + ensamblado determinista de tablas y priorización. Escalas Impacto/Complejidad 1-10; Prioridad por severidad verificada.
