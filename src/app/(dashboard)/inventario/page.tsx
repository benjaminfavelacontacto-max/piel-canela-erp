import { createClient } from '@/lib/supabase/server'

export default async function InventarioPage() {
  const supabase = await createClient()

  const { data: items, error } = await supabase
    .from('vista_inventario')
    .select('sku, nombre, categoria, stock_actual, stock_minimo, estatus, updated_at')
    .order('categoria')

  const agotados = items?.filter(i => i.estatus === 'agotado').length ?? 0
  const bajos    = items?.filter(i => i.estatus === 'bajo').length ?? 0
  const oks      = items?.filter(i => i.estatus === 'ok').length ?? 0

  const porCategoria: Record<string, typeof items> = {}
  items?.forEach(item => {
    if (!porCategoria[item.categoria]) porCategoria[item.categoria] = []
    porCategoria[item.categoria]!.push(item)
  })

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Inventario</h1>
        <p className="text-gray-500 text-sm mt-1">{items?.length ?? 0} productos</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-2xl font-semibold text-green-700">{oks}</p>
          <p className="text-xs text-green-600">Con stock</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4">
          <p className="text-2xl font-semibold text-amber-700">{bajos}</p>
          <p className="text-xs text-amber-600">Stock bajo</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4">
          <p className="text-2xl font-semibold text-red-700">{agotados}</p>
          <p className="text-xs text-red-600">Agotados</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <p className="text-red-600 text-sm">{error.message}</p>
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(porCategoria).map(([categoria, productos]) => (
          <div key={categoria} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{categoria}</span>
              <span className="text-xs text-gray-400">{productos?.length}</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-2 text-xs text-gray-400">SKU</th>
                  <th className="text-left px-5 py-2 text-xs text-gray-400">Producto</th>
                  <th className="text-center px-5 py-2 text-xs text-gray-400">Stock</th>
                  <th className="text-center px-5 py-2 text-xs text-gray-400">Mínimo</th>
                  <th className="text-center px-5 py-2 text-xs text-gray-400">Estatus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {productos?.map(item => (
                  <tr key={item.sku} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-xs font-mono text-gray-400">{item.sku}</td>
                    <td className="px-5 py-3 text-sm text-gray-900">{item.nombre}</td>
                    <td className="px-5 py-3 text-center text-sm font-semibold">{item.stock_actual}</td>
                    <td className="px-5 py-3 text-center text-sm text-gray-400">{item.stock_minimo}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        item.estatus === 'ok'      ? 'bg-green-100 text-green-700' :
                        item.estatus === 'bajo'    ? 'bg-amber-100 text-amber-700' :
                                                     'bg-red-100 text-red-700'
                      }`}>{item.estatus}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
