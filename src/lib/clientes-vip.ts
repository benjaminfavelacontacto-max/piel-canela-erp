/**
 * Clientes VIP del portal /order: envío totalmente gratis.
 *
 * Se identifican por ID (no por nombre) y la lista vive solo en el servidor:
 * el portal únicamente recibe un booleano `vip` cuando el cliente teclea su
 * número. Para sumar a alguien, agrega su UUID de `clientes` aquí.
 */
const CLIENTES_VIP = new Set<string>([
  "3bc20eae-cd2e-4a32-882b-4e4c87e55c69", // Shams Bronceado Natural (Laura Rocío Toledo)
  "1533ff4d-4d77-4fcc-b9c9-154d3b4bbb89", // Mithra Sun & Spa (Ana Clara Taverna)
])

export function esClienteVip(clienteId: string | null | undefined): boolean {
  return !!clienteId && CLIENTES_VIP.has(clienteId)
}
