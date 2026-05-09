export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ numero?: string }>
}) {
  const { numero } = await searchParams
  const ref = numero ?? "—"
  const wpUrl = `https://wa.me/523332508073?text=${encodeURIComponent(
    `Hola, acabo de hacer un pedido en el portal. Mi referencia es: ${ref}`,
  )}`

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-[#DFF7F4]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#0F766E"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h1 className="mb-2 text-2xl font-bold tracking-tight text-gray-900">
        ¡Pedido recibido!
      </h1>
      <p className="mb-4 text-gray-500">
        Gracias por tu pedido. Nos pondremos en contacto contigo muy pronto con
        tu cotización formal.
      </p>
      <div className="mb-6 rounded-xl border border-[rgba(15,23,42,0.06)] bg-white p-4">
        <p className="text-[10px] uppercase tracking-wider text-gray-400">
          Número de referencia
        </p>
        <p className="mt-1 font-mono text-sm font-bold text-gray-700">{ref}</p>
      </div>
      <a
        href={wpUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-emerald-600 hover:shadow-md"
      >
        Confirmar por WhatsApp
      </a>
      <p className="mt-6">
        <a
          href="/order"
          className="text-xs text-gray-400 hover:text-gray-700 hover:underline"
        >
          ← Volver al catálogo
        </a>
      </p>
    </div>
  )
}
