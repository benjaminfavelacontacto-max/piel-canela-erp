"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Hash,
  Mail,
  MapPin,
  Phone,
  Save,
  Sparkles,
  Trash2,
  User,
  Users,
  Wallet,
} from "lucide-react"
import {
  saveCliente,
  updateCliente,
  findSimilarClientes,
  type ClienteInput,
} from "./actions"
import type { ClienteRow, SocioBasic } from "./clientes-dashboard"
import { ClienteDeleteDialog, type DeleteTarget } from "./cliente-delete-dialog"
import { TIPOS_CLIENTE } from "./tipos-cliente"

const METODOS_PAGO = [
  "Transferencia",
  "Efectivo",
  "Tarjeta",
  "Otro",
]

export function ClienteForm({
  initial,
  socios,
  ventasCount = 0,
  cotizacionesCount = 0,
}: {
  initial?: ClienteRow
  socios: SocioBasic[]
  ventasCount?: number
  cotizacionesCount?: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const isEdit = !!initial
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)

  const [nombre, setNombre] = useState(initial?.nombre ?? "")
  const [nombreNegocio, setNombreNegocio] = useState(
    initial?.nombre_negocio ?? "",
  )
  const [tipo, setTipo] = useState(initial?.tipo ?? "particular")
  const [telefono, setTelefono] = useState(initial?.telefono ?? "")
  const [email, setEmail] = useState(initial?.email ?? "")
  const [direccion, setDireccion] = useState(initial?.direccion ?? "")
  const [colonia, setColonia] = useState(initial?.colonia ?? "")
  const [codigoPostal, setCodigoPostal] = useState(initial?.codigo_postal ?? "")
  const [ciudad, setCiudad] = useState(initial?.ciudad ?? "")
  const [estado, setEstado] = useState(initial?.estado ?? "")
  const [pais, setPais] = useState(initial?.pais ?? "México")
  const [rfc, setRfc] = useState(initial?.rfc ?? "")
  const [redes, setRedes] = useState<Record<string, string>>(
    initial?.redes_sociales ?? {},
  )
  const [vendedorSocioId, setVendedorSocioId] = useState(
    initial?.vendedor_socio_id ?? "",
  )
  const [metodoPago, setMetodoPago] = useState(initial?.metodo_pago_pref ?? "")
  const [notas, setNotas] = useState(initial?.notas ?? "")
  const [activo, setActivo] = useState(initial?.activo ?? true)

  // ─── Dedup en vivo ─────────────────────────────────────────────────
  const [similares, setSimilares] = useState<
    Awaited<ReturnType<typeof findSimilarClientes>>
  >([])
  const searchTerm = useMemo(
    () => nombreNegocio.trim() || nombre.trim(),
    [nombre, nombreNegocio],
  )
  useEffect(() => {
    if (searchTerm.length < 3) {
      setSimilares([])
      return
    }
    const t = setTimeout(async () => {
      const result = await findSimilarClientes(searchTerm, initial?.id)
      setSimilares(result)
    }, 350) // debounce
    return () => clearTimeout(t)
  }, [searchTerm, initial?.id])

  function handleSave() {
    if (!nombre.trim()) {
      toast.error("El nombre es requerido")
      return
    }
    const payload: ClienteInput = {
      nombre,
      nombre_negocio: nombreNegocio || null,
      tipo,
      telefono: telefono || null,
      email: email || null,
      direccion: direccion || null,
      colonia: colonia || null,
      codigo_postal: codigoPostal || null,
      ciudad: ciudad || null,
      estado: estado || null,
      pais: pais || "México",
      rfc: rfc.toUpperCase() || null,
      redes_sociales: Object.keys(redes).length ? redes : null,
      vendedor_socio_id: vendedorSocioId || null,
      metodo_pago_pref: metodoPago || null,
      notas: notas || null,
      activo,
    }
    startTransition(async () => {
      const result = isEdit
        ? await updateCliente(initial!.id, payload)
        : await saveCliente(payload)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(isEdit ? "Cliente actualizado" : "Cliente creado")
      router.push("/clientes")
      router.refresh()
    })
  }

  function setRed(key: string, value: string) {
    setRedes((prev) => {
      const next = { ...prev }
      if (value.trim()) next[key] = value.trim()
      else delete next[key]
      return next
    })
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/clientes"
            className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {isEdit ? "Editar cliente" : "Nuevo cliente"}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {isEdit
                ? `Última actualización: ${new Date(initial!.updated_at).toLocaleDateString("es-MX")}`
                : "Crea un nuevo cliente para usarlo en cotizaciones y ventas"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEdit && (
            <button
              type="button"
              onClick={() =>
                setDeleteTarget({
                  id: initial!.id,
                  nombre: initial!.nombre_negocio ?? initial!.nombre,
                  ventas: ventasCount,
                  cotizaciones: cotizacionesCount,
                })
              }
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#FEE2E2] bg-white px-3 py-1.5 text-sm font-medium text-[#DC2626] transition hover:bg-[#FEE2E2] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="size-3.5" />
              Eliminar
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#115E59] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="size-4" />
            {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear cliente"}
          </button>
        </div>
      </header>

      {/* Aviso duplicados */}
      {similares.length > 0 && !isEdit && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <header className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-900">
              ¿Quizás ya existe?
            </h3>
          </header>
          <p className="mt-1 text-xs text-amber-700">
            Encontré {similares.length}{" "}
            {similares.length === 1 ? "cliente parecido" : "clientes parecidos"}
            . Verifica antes de crear un duplicado.
          </p>
          <ul className="mt-2 space-y-1">
            {similares.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/clientes/${s.id}/editar`}
                  className="flex items-center justify-between rounded-md bg-white/70 px-2 py-1 text-xs hover:bg-white"
                >
                  <span>
                    <strong className="text-gray-900">
                      {s.nombre_negocio ?? s.nombre}
                    </strong>
                    {s.nombre_negocio && (
                      <span className="ml-1 text-gray-500">— {s.nombre}</span>
                    )}
                    {s.rfc && (
                      <span className="ml-2 font-mono text-[10px] text-blue-700">
                        {s.rfc}
                      </span>
                    )}
                  </span>
                  <span className="text-amber-700 hover:text-amber-900">
                    abrir →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Identificación */}
        <Card icon={User} title="Identificación">
          <Field label="Nombre del contacto *" required>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Juan Pérez"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            />
          </Field>
          <Field label="Empresa / Negocio">
            <input
              type="text"
              value={nombreNegocio}
              onChange={(e) => setNombreNegocio(e.target.value)}
              placeholder="Spa Belleza Total"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            />
          </Field>
          <Field
            label="Tipo de cliente"
            hint="Clasifica para filtros y reportes"
          >
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            >
              {TIPOS_CLIENTE.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="RFC" hint="Datos fiscales (mayúsculas)">
            <div className="relative">
              <Hash className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={rfc}
                onChange={(e) => setRfc(e.target.value.toUpperCase())}
                placeholder="XAXX010101000"
                maxLength={13}
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 font-mono text-sm uppercase focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
              />
            </div>
          </Field>
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="activo"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="size-4 accent-pink-600"
            />
            <label htmlFor="activo" className="text-sm text-gray-700">
              Cliente activo
            </label>
          </div>
        </Card>

        {/* Contacto */}
        <Card icon={Phone} title="Contacto">
          <Field label="Teléfono">
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="55 1234 5678"
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm tabular-nums focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
              />
            </div>
          </Field>
          <Field label="Email">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@email.com"
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
              />
            </div>
          </Field>
          <Field label="Método de pago preferido">
            <div className="relative">
              <Wallet className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
              >
                <option value="">Sin preferencia</option>
                {METODOS_PAGO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="Vendedor asignado">
            <div className="relative">
              <Users className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
              <select
                value={vendedorSocioId}
                onChange={(e) => setVendedorSocioId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
              >
                <option value="">Sin asignar</option>
                {socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          </Field>
        </Card>

        {/* Ubicación */}
        <Card icon={MapPin} title="Ubicación">
          <Field label="Dirección">
            <input
              type="text"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="Calle Falsa 123"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Colonia">
              <input
                type="text"
                value={colonia}
                onChange={(e) => setColonia(e.target.value)}
                placeholder="Roma Norte"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
              />
            </Field>
            <Field label="Código Postal">
              <input
                type="text"
                value={codigoPostal}
                onChange={(e) => setCodigoPostal(e.target.value)}
                placeholder="06700"
                maxLength={10}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm tabular-nums focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ciudad">
              <input
                type="text"
                value={ciudad}
                onChange={(e) => setCiudad(e.target.value)}
                placeholder="Ciudad de México"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
              />
            </Field>
            <Field label="Estado">
              <input
                type="text"
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                placeholder="CDMX"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
              />
            </Field>
          </div>
          <Field label="País">
            <input
              type="text"
              value={pais}
              onChange={(e) => setPais(e.target.value)}
              placeholder="México"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            />
          </Field>
        </Card>

        {/* Redes sociales y notas */}
        <Card icon={Sparkles} title="Redes y notas">
          <Field label="Instagram">
            <input
              type="text"
              value={redes.instagram ?? ""}
              onChange={(e) => setRed("instagram", e.target.value)}
              placeholder="@usuario"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            />
          </Field>
          <Field label="Facebook">
            <input
              type="text"
              value={redes.facebook ?? ""}
              onChange={(e) => setRed("facebook", e.target.value)}
              placeholder="usuario / página"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            />
          </Field>
          <Field label="Sitio web">
            <input
              type="url"
              value={redes.web ?? ""}
              onChange={(e) => setRed("web", e.target.value)}
              placeholder="https://"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            />
          </Field>
          <Field label="Notas">
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              placeholder="Información extra sobre el cliente…"
              className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F766E] focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
            />
          </Field>
        </Card>
      </div>

      <ClienteDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDone={() => router.push("/clientes")}
      />
    </div>
  )
}

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <header className="mb-3 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-[#F9FAFB] text-[#0F766E]">
          <Icon className="size-3.5" />
        </span>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </header>
      <div className="space-y-3">{children}</div>
    </article>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700">
          {label}
          {required && <span className="ml-0.5 text-[#DC2626]">*</span>}
        </span>
        {hint && <span className="text-[10px] text-gray-500">{hint}</span>}
      </div>
      {children}
    </label>
  )
}
