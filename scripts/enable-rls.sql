-- ============================================================================
--  BLINDAJE DE LA BASE DE DATOS — Row Level Security (RLS) "bloqueo total"
-- ============================================================================
--
--  CONTEXTO
--  --------
--  El portal público /order expone el anon key de Supabase (es NEXT_PUBLIC,
--  imposible de esconder). Sin RLS, cualquiera con ese key podía leer/escribir
--  TODAS las tablas (ventas, finanzas, clientes con PII, etc.) vía la REST API.
--
--  Este script activa RLS en las 25 tablas y SIN políticas para el rol `anon`,
--  así que el anon key queda inservible para datos. Toda la app sigue
--  funcionando porque accede vía `service_role` (server.ts + createAdminClient),
--  que BYPASSEA RLS por diseño.
--
--  ⚠️ ORDEN DE EJECUCIÓN (importante, sin downtime):
--    1) PRIMERO despliega el código de la rama `security/rls-lockdown`
--       (mueve todas las lecturas anon a server-side). Verifica que /order y
--       el dashboard funcionan en producción.
--    2) LUEGO corre este script en el SQL Editor de Supabase.
--    Si lo corres antes de desplegar, el dashboard se rompe hasta el deploy.
--
--  Es idempotente: se puede correr varias veces sin error.
-- ============================================================================

-- ── 0. Dropear TODAS las políticas preexistentes del schema public.
--      Algunas tablas (productos, categorias, ventas, clientes, cotizaciones,
--      precios_producto, inventario, etc.) tenían políticas permisivas que
--      dejaban LEER al rol anon — creadas cuando el portal leía con anon antes
--      del candado JWT. En el modelo de "bloqueo total" NO debe existir ninguna
--      política para anon: todo accede vía service_role (que bypassa RLS).
--      Solo toca el schema `public` (NO storage.objects — sus policies se quedan).
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      r.policyname, r.schemaname, r.tablename
    );
  end loop;
end $$;

-- ── 1. Tablas base: activar RLS (sin políticas = anon/authenticated bloqueados)
--      service_role bypassa RLS, así que la app no se ve afectada.
alter table public.categorias              enable row level security;
alter table public.clientes                enable row level security;
alter table public.costos_envio_pedido     enable row level security;
alter table public.cotizacion_items        enable row level security;
alter table public.cotizaciones            enable row level security;
alter table public.gastos                  enable row level security;
alter table public.inventario              enable row level security;
alter table public.inversiones             enable row level security;
alter table public.listas_precios          enable row level security;
alter table public.movimientos_inventario  enable row level security;
alter table public.notificaciones          enable row level security;
alter table public.pedido_compra_items     enable row level security;
alter table public.pedido_conversiones     enable row level security;
alter table public.pedido_documentos       enable row level security;
alter table public.pedido_envios           enable row level security;
alter table public.pedido_pagos            enable row level security;
alter table public.pedidos_compra          enable row level security;
alter table public.precios_producto        enable row level security;
alter table public.productos               enable row level security;
alter table public.proveedores             enable row level security;
alter table public.socios                  enable row level security;
alter table public.tipos_cambio            enable row level security;
alter table public.venta_items             enable row level security;
alter table public.venta_socios            enable row level security;
alter table public.ventas                  enable row level security;

-- ── 2. Vistas: las VIEWS no tienen RLS propio. Dos blindajes a la vez:
--      a) security_invoker = on → la vista respeta el RLS de las tablas base
--         según el rol que consulta (anon queda bloqueado por el paso 1).
--      b) REVOKE explícito a anon/authenticated (cinturón + tirantes).
--      La app las lee con service_role (bypassa), así que sigue funcionando.
alter view public.vista_inventario      set (security_invoker = on);
alter view public.vista_productos_top    set (security_invoker = on);
alter view public.vista_ventas_cliente   set (security_invoker = on);

revoke all on public.vista_inventario     from anon, authenticated;
revoke all on public.vista_productos_top   from anon, authenticated;
revoke all on public.vista_ventas_cliente  from anon, authenticated;

-- ============================================================================
--  VERIFICACIÓN
-- ============================================================================
--
--  (A) Confirmar que TODAS las tablas tienen RLS activado (rowsecurity = true):
--
--      select tablename, rowsecurity
--      from pg_tables
--      where schemaname = 'public'
--      order by rowsecurity, tablename;
--
--  (B) Prueba REAL con el ANON key (desde tu terminal). Debe devolver 0 filas
--      o un error de permiso — NO los datos:
--
--      curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/ventas?select=*&limit=1" \
--        -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
--        -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
--      # Esperado: []   (antes devolvía 46 ventas)
--
--      curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/clientes?select=*&limit=1" \
--        -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
--        -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
--      # Esperado: []   (antes devolvía 33 clientes con PII)
--
--  (C) Confirmar que la APP sigue viva: abre /order (catálogo carga) y el
--      dashboard logueado (ventas/finanzas con datos). Ambos usan service_role.
--
-- ============================================================================
--  ROLLBACK (si algo sale mal y necesitas volver atrás rápido):
--      alter table public.<tabla> disable row level security;   -- por tabla
--  (revierte el bloqueo; la app vuelve al estado anterior con anon abierto)
-- ============================================================================
