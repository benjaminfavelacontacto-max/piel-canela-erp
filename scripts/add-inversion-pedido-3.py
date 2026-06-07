#!/usr/bin/env python3
"""
Registra la inversión del Pedido 3 en la tabla `inversiones` (Finanzas).

Contexto (sesión 2026-06-06):
- La tabla `inversiones` (que alimenta "Total invertido" / ROI en /finanzas) solo
  tenía 6 movimientos = Pedidos 1 y 2 ($299,790.74). El Pedido 3 NUNCA se registró
  como inversión, pero sus productos ya se venden → inflaba el ROI (contaba ventas
  del P3 sin su costo).
- Se agrega la inversión del P3 como 4ª ronda, 50/50, leyendo los montos exactos
  de pedidos_compra (inversion_sandra_mxn / inversion_benjamin_mxn) ya recosteados
  con el envío USA→México.
- Efecto: Total invertido 299,790.74 → ~384,896 ; ROI promedio 80.7% → ~40.8% (real).

IDEMPOTENTE: no inserta si ya existe una inversión de ronda 4 para el socio.

Uso:
  python3 scripts/add-inversion-pedido-3.py          # DRY-RUN
  python3 scripts/add-inversion-pedido-3.py apply     # aplica
"""
import sys, json, urllib.request, urllib.error

DRY = "apply" not in sys.argv

PEDIDO_ID = "778a43ad-7cd6-4078-86a9-b572373a2c83"
SANDRA_ID = "4f21084b-dfe9-45f3-be80-935dc1a5e7a5"
BENJAMIN_ID = "3165fe33-c760-4373-84d0-e1cd14d863b3"
RONDA = 4
FECHA = "2026-06-02"  # fecha del Pedido 3


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
KEY = E["SUPABASE_SERVICE_ROLE_KEY"]  # inversiones está RLS-bloqueada para anon
API = URL + "/rest/v1/"
H = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}


def req(method, path, body=None, prefer=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = dict(H)
    if prefer:
        headers["Prefer"] = prefer
    r = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            t = resp.read().decode()
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        print(f"  !! HTTP {e.code} {method} {path}: {e.read().decode()[:300]}")
        raise


# Montos exactos del Pedido 3 (ya recosteado)
ped = req("GET", f"pedidos_compra?id=eq.{PEDIDO_ID}"
          "&select=numero,total_mxn,inversion_sandra_mxn,inversion_benjamin_mxn")[0]
s_mxn = float(ped["inversion_sandra_mxn"])
b_mxn = float(ped["inversion_benjamin_mxn"])

# Estado actual de inversiones
inv = req("GET", "inversiones?select=socio_id,numero_ronda,monto_mxn")
tot_s = sum(float(i["monto_mxn"] or 0) for i in inv if i["socio_id"] == SANDRA_ID)
tot_b = sum(float(i["monto_mxn"] or 0) for i in inv if i["socio_id"] == BENJAMIN_ID)

filas = [
    (SANDRA_ID, "Sandra", s_mxn, "Cuarta inversión Sandra · Pedido 3 (cintas Brasil)"),
    (BENJAMIN_ID, "Benjamin", b_mxn, "Cuarta inversión Benjamin · Pedido 3 (cintas Brasil)"),
]

print("──────── Inversión Pedido 3 → tabla inversiones ────────")
print(f"  Total invertido ANTES: ${tot_s + tot_b:,.2f}  (Sandra ${tot_s:,.2f} | Benjamin ${tot_b:,.2f})")
to_insert = []
for socio_id, nombre, monto, concepto in filas:
    ya = [i for i in inv if i["socio_id"] == socio_id and i.get("numero_ronda") == RONDA]
    if ya:
        print(f"  {nombre}: ya existe ronda {RONDA} (${float(ya[0]['monto_mxn']):,.2f}) → omitir")
    else:
        print(f"  {nombre}: + ${monto:,.2f}  (ronda {RONDA}, {FECHA})  → insertar")
        to_insert.append({
            "socio_id": socio_id, "numero_ronda": RONDA,
            "monto_mxn": monto, "fecha": FECHA, "concepto": concepto,
        })

nuevo_tot = tot_s + tot_b + sum(r["monto_mxn"] for r in to_insert)
print(f"  Total invertido DESPUÉS: ${nuevo_tot:,.2f}")
print("────────────────────────────────────────────────────────")

if not to_insert:
    print("Nada que insertar (ya estaba registrado).")
    sys.exit(0)

if DRY:
    print("DRY-RUN — no se escribió nada. Re-corre con 'apply' para aplicar.")
    sys.exit(0)

req("POST", "inversiones", to_insert, prefer="return=minimal")
print(f"✓ Insertadas {len(to_insert)} inversiones del Pedido 3.")
