#!/usr/bin/env python3
"""
Suma el tramo de envío USA→México al costeo del Pedido 3 (Brasil).

Contexto / decisiones (sesión 2026-06-06):
- El envío del Pedido 3 tenía SOLO el tramo Brasil→USA ($1,192.30 USD, derivado de
  los pagos al proveedor). Faltaba el tramo USA→México, que el dueño pagó DIRECTO en
  pesos a un transportista local: $6,170.25 MXN (= $350.58 USD @ TC 17.60).
  Confirmado por el dueño que son PESOS (en USD habría superado el total del pedido).
- Modelo USD-based: el tramo USA→México entra como 6170.25/17.60 USD para que, al
  derivar MXN (× TC), dé EXACTAMENTE $6,170.25 MXN.
- Envío total nuevo = Brasil→USA $1,192.30 + USA→México = $1,542.88 USD / $27,154.73 MXN.
- Se re-prorratea PAREJO sobre las 692 u (mismo criterio que editarPedido()/
  agregarItemsPedido() en pedidos/actions.ts) y se re-snapshotea el costo a productos
  (alimenta vista_inventario → sube el costo/u y baja un poco el margen: refleja lo real).
- Los PRECIOS de productos NO se tocan (solo el envío). Inversión 50/50 preservada.

IDEMPOTENTE: el envío se fija por valores ABSOLUTOS (no se suma al envío actual), así
re-correr da el mismo resultado. Valida subtotal (≈$3,292.64) y unidades (692) antes
de tocar nada.

Uso:
  python3 scripts/fix-pedido-3-envio-usa-mexico.py          # DRY-RUN (solo imprime)
  python3 scripts/fix-pedido-3-envio-usa-mexico.py apply    # aplica los cambios
"""
import sys, json, urllib.request, urllib.error

DRY = "apply" not in sys.argv

PEDIDO_ID = "778a43ad-7cd6-4078-86a9-b572373a2c83"
TC = 17.60
ENVIO_BRASIL_USA_USD = 1192.30          # tramo que ya teníamos (derivado de pagos a Julio)
ENVIO_USA_MEXICO_MXN = 6170.25          # dato exacto del dueño, pagado en pesos
EXPECTED_SUBTOTAL_USD = 3292.64         # productos (no se tocan) — validación
EXPECTED_UNITS = 692                    # validación

envio_usa_mexico_usd = ENVIO_USA_MEXICO_MXN / TC
ENVIO_TOTAL_USD = ENVIO_BRASIL_USA_USD + envio_usa_mexico_usd


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

# --- Validaciones de seguridad (no aplicar si los datos no son los esperados) ---
assert abs(subtotal_usd - EXPECTED_SUBTOTAL_USD) < 1.0, \
    f"Subtotal inesperado: ${subtotal_usd:,.2f} (esperaba ~${EXPECTED_SUBTOTAL_USD})"
assert total_units == EXPECTED_UNITS, f"Unidades inesperadas: {total_units} (esperaba {EXPECTED_UNITS})"

envio_unit = ENVIO_TOTAL_USD / total_units
total_usd = subtotal_usd + ENVIO_TOTAL_USD

# Header — preserva el ratio de inversión por socio
hdr = req("GET", f"pedidos_compra?id=eq.{PEDIDO_ID}"
          "&select=total_usd,inversion_sandra_usd,inversion_benjamin_usd")[0]
old_total = float(hdr["total_usd"]) or 0
rs = (float(hdr["inversion_sandra_usd"]) / old_total) if old_total else 0.5
rb = (float(hdr["inversion_benjamin_usd"]) / old_total) if old_total else 0.5
s_usd, b_usd = total_usd * rs, total_usd * rb

notas = (
    "Pedido 3 Brasil (cintas BRL) · TC 17.60 · 53 ítems / 692 u · "
    f"Envío ${ENVIO_TOTAL_USD:,.2f} USD / ${ENVIO_TOTAL_USD*TC:,.2f} MXN "
    f"(Brasil-USA ${ENVIO_BRASIL_USA_USD:,.2f} USD, "
    f"USA-México ${ENVIO_USA_MEXICO_MXN:,.2f} MXN = ${envio_usa_mexico_usd:,.2f} USD) · "
    f"Total ${total_usd:,.2f} USD / ${total_usd*TC:,.2f} MXN · "
    f"Inversión {rs*100:.0f}/{rb*100:.0f} (Sandra ${s_usd*TC:,.2f} + Benjamin ${b_usd*TC:,.2f} MXN)"
)

print("──────── Pedido 3 · recosteo envío USA→México ────────")
print(f"  Unidades: {total_units}   Ítems: {len(items)}")
print(f"  Subtotal productos:  ${subtotal_usd:,.2f} USD   (sin cambio)")
print(f"  Envío Brasil→USA:    ${ENVIO_BRASIL_USA_USD:,.2f} USD")
print(f"  Envío USA→México:    ${envio_usa_mexico_usd:,.2f} USD  = ${ENVIO_USA_MEXICO_MXN:,.2f} MXN")
print(f"  Envío total:         ${ENVIO_TOTAL_USD:,.2f} USD / ${ENVIO_TOTAL_USD*TC:,.2f} MXN")
print(f"  Envío por unidad:    ${envio_unit:.4f} USD/u")
print(f"  TOTAL pedido:        ${total_usd:,.2f} USD / ${total_usd*TC:,.2f} MXN")
print(f"  Inversión c/socio:   ${s_usd:,.2f} USD / ${s_usd*TC:,.2f} MXN  (ratio {rs:.2f}/{rb:.2f})")
print("──────────────────────────────────────────────────────")

if DRY:
    print("DRY-RUN — no se escribió nada. Re-corre con 'apply' para aplicar.")
    sys.exit(0)

# --- Aplicar ---
for it in items:
    cant = int(it["cantidad"])
    precio = float(it["precio_unitario_usd"])
    pub = float(it["precio_publico_mxn"]) if it.get("precio_publico_mxn") is not None else None
    req("PATCH", f"pedido_compra_items?id=eq.{it['id']}", item_fields(precio, cant, envio_unit, TC, pub))
    req("PATCH", f"productos?id=eq.{it['producto_id']}", {
        "precio_usd": precio, "costo_envio_usd": envio_unit, "tipo_cambio": TC,
        "costo": (precio + envio_unit) * TC,
    })

req("PATCH", f"pedidos_compra?id=eq.{PEDIDO_ID}", {
    "tipo_cambio": TC,
    "subtotal_usd": subtotal_usd,
    "costo_envio_usd": ENVIO_TOTAL_USD, "costo_envio_mxn": ENVIO_TOTAL_USD * TC,
    "total_usd": total_usd, "total_mxn": total_usd * TC,
    "inversion_sandra_usd": s_usd, "inversion_benjamin_usd": b_usd,
    "inversion_sandra_mxn": s_usd * TC, "inversion_benjamin_mxn": b_usd * TC,
    "notas": notas,
})
print(f"✓ Aplicado: {len(items)} ítems + snapshot a productos + header.")
