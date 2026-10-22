import { createClient } from "@/lib/supabase/server"
import { cargarProductosCotizables } from "@/lib/productos-cotizables"
import { seccionesCatalogo } from "@/lib/lista-precios"
import { ListaPreciosView } from "./lista-precios-view"

/**
 * Lista de precios completa (Pública MXN) para enseñar al cliente, imprimir o
 * mandar por WhatsApp — y, desde la misma pantalla, marcar cantidades y mandar
 * todo a cotizar de un golpe. Sin 5 L ni Dye Color.
 */
export default async function ListaPreciosPage() {
  const supabase = await createClient()
  const { productos, error } = await cargarProductosCotizables(supabase)
  const secciones = seccionesCatalogo(productos).map((s) => ({
    ...s,
    // Solo lo que la vista necesita (no se serializan imágenes ni costos).
    productos: s.productos.map((p) => ({
      id: p.id,
      sku: p.sku,
      nombre: p.nombre,
      nombre_display: p.nombre_display,
      imagen_url: null,
      peso: p.peso,
      precio: p.precio,
      costo: 0,
      categoria: p.categoria ?? null,
      activo: p.activo,
    })),
  }))
  const hoy = new Date().toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  return <ListaPreciosView secciones={secciones} error={error} fecha={hoy} />
}
