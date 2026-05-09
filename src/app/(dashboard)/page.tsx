import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { count: totalProductos },
    { count: alertas },
    { count: totalClientes },
    { data: ventas },
  ] = await Promise.all([
    supabase.from('productos').select('*', { count: 'exact', head: true }),
    supabase.from('inventario').select('*', { count: 'exact', head: true }).in('estatus', ['bajo', 'agotado']),
    supabase.from('clientes').select('*', { count: 'exact', head: true }),
    supabase.from('ventas').select('id, total, fecha, cliente_id').order('fecha', { ascending: false }).limit(5),
  ])

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Piel Canela Spa & Bronceado</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-2xl font-semibold text-gray-900">{totalProductos ?? 0}</p>
          <p className="text-sm text-gray-500 mt-1">Productos</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className={`text-2xl font-semibold ${(alertas ?? 0) > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{alertas ?? 0}</p>
          <p className="text-sm text-gray-500 mt-1">Alertas stock</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-2xl font-semibold text-gray-900">{totalClientes ?? 0}</p>
          <p className="text-sm text-gray-500 mt-1">Clientes</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-2xl font-semibold text-gray-900">{ventas?.length ?? 0}</p>
          <p className="text-sm text-gray-500 mt-1">Ventas recientes</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Últimas ventas</h2>
        </div>
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-gray-400">
            {ventas && ventas.length > 0 ? `${ventas.length} ventas encontradas` : 'No hay ventas registradas aún'}
          </p>
        </div>
      </div>
    </div>
  )
}
