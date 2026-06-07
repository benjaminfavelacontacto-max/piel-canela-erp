#!/usr/bin/env python3
"""
Recostea el ENVÍO del Pedido 3 con las FACTURAS reales de logística.

Contexto (sesión 2026-06-07):
- El envío del P3 estaba estimado/derivado ($1,542.88). Ahora hay facturas reales:
  · Brasil→USA: Proforma Patricia Lobo #0377 → SHIPPING $1,438.50 + PALET $50 = $1,488.50 USD.
  · USA→México: Factura "La casita deli" #005842 → $355.00 USD (pagado ~$6,170.25 MXN con tarjeta).
  · ENVÍO TOTAL = $1,843.50 USD.
- La factura 0377 es PARCIAL: solo lista 157 u; las demás cintas (hasta 692 u) llegaron en el
  mismo embarque pero sin factura individual (costo de la lista BRL ya cargado). Por eso los
  PRODUCTOS NO se tocan (subtotal $3,292.64 USD / 692 u se mantiene).
- El envío total cubre las 692 u → se re-prorratea parejo ($1,843.50 / 692 = $2.6640/u).
- Total P3 → $5,136.14 USD ; inversión 50/50 ; también se actualiza la 4ª ronda en la tabla
  `inversiones` (Finanzas) al nuevo monto.

IDEMPOTENTE: define el envío por valores ABSOLUTOS (no incrementales). Valida subtotal y unidades.

Uso:
  python3 scripts/fix-pedido-3-envio-facturas.py          # DRY-RUN
  python3 scripts/fix-pedido-3-envio-facturas.py apply     # aplica
"""
import sys, json, urllib.request, urllib.error

DRY = "apply" not in sys.argv

PEDIDO_ID = "778a43ad-7cd6-4078-86a9-b572373a2c83"
SANDRA_ID = "4f21084b-dfe9-45f3-be80-935dc1a5e7a5"
BENJAMIN_ID = "3165fe33-c760-4373-84d0-e1cd14d863b3"
TC = 17.60
RONDA_INV = 4  # ronda del P3 en la tabla inversiones

ENVIO_BRASIL_USA_USD = 1488.50   # Patricia Lobo #0377: shipping 1438.50 + palet 50
ENVIO_USA_MEXICO_USD = 355.00    # La casita deli #005842 (≈ $6,170.25 MXN)
ENVIO_USA_MEXICO_MXN_REAL = 6170.25
ENVIO_TOTAL_USD = ENVIO_BRASIL_USA_USD + ENVIO_USA_MEXICO_USD  # 1843.50

EXPECTED_SUBTOTAL_USD = 3292.64
EXPECTED_UNITS = 692


def load_env():
    env = {}
    with open(".env.local") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


E = load_env()
URL = E["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = E["SUPABASE_SERVICE_ROLE_KEY"]
API = URL + "/rest/v1/"
H = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, headers=H, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            t = resp.read().decode()
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        print(f"  !! HTTP {e.code} {method} {path}: {e.read().decode()[:300]}")
        raise


def item_fields(precio, cant, envio_unit, tc, pub):
    ct_usd = precio + envio_unit
    ct_mxn = ct_usd * tc
    sub = precio * cant
    pu = (pub - ct_mxn) if pub is not None else None
    return {
        "precio_unitario_usd": precio, "precio_unitario_mxn": precio * tc,
        "envio_unitario_usd": envio_unit, "envio_unitario_mxn": envio_unit * tc,
        "costo_total_unitario_usd": ct_usd, "costo_total_unitario_mxn": ct_mxn,
        "subtotal_usd": sub, "subtotal_mxn": sub * tc,
        "total_con_envio_usd": ct_usd * cant, "total_con_envio_mxn": ct_mxn * cant,
        "profit_unitario": pu, "profit_total": (pu * cant if pu is not None else None),
    }


items = req("GET", f"pedido_compra_items?pedido_id=eq.{PEDIDO_ID}"
            "&select=id,producto_id,cantidad,precio_unitario_usd,precio_publico_mxn")
total_units = sum(int(it["cantidad"]) for it in items)
subtotal_usd = sum(float(it["precio_unitario_usd"]) * int(it["cantidad"]) for it in items)

assert abs(subtotal_usd - EXPECTED_SUBTOTAL_USD) < 1.0, f"Subtotal inesperado: ${subtotal_usd:,.2f}"
assert total_units == EXPECTED_UNITS, f"Unidades inesperadas: {total_units}"

envio_unit = ENVIO_TOTAL_USD / total_units
total_usd = subtotal_usd + ENVIO_TOTAL_USD
s_usd = b_usd = total_usd / 2  # inversión 50/50

notas = (
    "Pedido 3 Brasil (cintas BRL) · TC 17.60 · 53 ítems / 692 u · "
    f"Envío ${ENVIO_TOTAL_USD:,.2f} USD (Brasil-USA ${ENVIO_BRASIL_USA_USD:,.2f} "
    f"[Patricia Lobo #0377: shipping $1,438.50 + palet $50] · "
    f"USA-México ${ENVIO_USA_MEXICO_USD:,.2f} USD [La casita deli #005842, "
    f"pagado ${ENVIO_USA_MEXICO_MXN_REAL:,.2f} MXN]) · "
    f"Total ${total_usd:,.2f} USD / ${total_usd*TC:,.2f} MXN · "
    f"Inversión 50/50 (${s_usd*TC:,.2f} MXN c/u). "
    "Factura 0377 es parcial: cintas extra llegaron sin factura (costo lista BRL)."
)

print("──────── Pedido 3 · recosteo envío (facturas reales) ────────")
print(f"  Productos (sin cambio): ${subtotal_usd:,.2f} USD / {total_units} u")
print(f"  Envío Brasil→USA:  ${ENVIO_BRASIL_USA_USD:,.2f} USD  (Patricia Lobo #0377)")
print(f"  Envío USA→México:  ${ENVIO_USA_MEXICO_USD:,.2f} USD  (La casita deli #005842 · ${ENVIO_USA_MEXICO_MXN_REAL:,.2f} MXN)")
print(f"  Envío TOTAL:       ${ENVIO_TOTAL_USD:,.2f} USD  (antes $1,542.88)")
print(f"  Envío por unidad:  ${envio_unit:.4f} USD/u  (antes $2.2296)")
print(f"  TOTAL P3:          ${total_usd:,.2f} USD / ${total_usd*TC:,.2f} MXN  (antes $4,835.52)")
print(f"  Inversión c/socio: ${s_usd*TC:,.2f} MXN  (antes $42,552.79)")
print("──────────────────────────────────────────────────────────────")

if DRY:
    print("DRY-RUN — no se escribió nada. Re-corre con 'apply' para aplicar.")
    sys.exit(0)

# 1) Ítems + snapshot a productos
for it in items:
    cant = int(it["cantidad"])
    precio = float(it["precio_unitario_usd"])
    pub = float(it["precio_publico_mxn"]) if it.get("precio_publico_mxn") is not None else None
    req("PATCH", f"pedido_compra_items?id=eq.{it['id']}", item_fields(precio, cant, envio_unit, TC, pub))
    req("PATCH", f"productos?id=eq.{it['producto_id']}", {
        "precio_usd": precio, "costo_envio_usd": envio_unit, "tipo_cambio": TC,
        "costo": (precio + envio_unit) * TC,
    })

# 2) Header del pedido
req("PATCH", f"pedidos_compra?id=eq.{PEDIDO_ID}", {
    "tipo_cambio": TC,
    "subtotal_usd": subtotal_usd,
    "costo_envio_usd": ENVIO_TOTAL_USD, "costo_envio_mxn": ENVIO_TOTAL_USD * TC,
    "total_usd": total_usd, "total_mxn": total_usd * TC,
    "inversion_sandra_usd": s_usd, "inversion_benjamin_usd": b_usd,
    "inversion_sandra_mxn": s_usd * TC, "inversion_benjamin_mxn": b_usd * TC,
    "notas": notas,
})

# 3) Inversión del P3 en la tabla `inversiones` (4ª ronda) — Finanzas
nueva_inv_mxn = round(s_usd * TC, 2)
for socio_id in (SANDRA_ID, BENJAMIN_ID):
    req("PATCH", f"inversiones?socio_id=eq.{socio_id}&numero_ronda=eq.{RONDA_INV}",
        {"monto_mxn": nueva_inv_mxn})

print(f"✓ Aplicado: {len(items)} ítems + productos + header + inversiones (${nueva_inv_mxn:,.2f} MXN c/u).")
