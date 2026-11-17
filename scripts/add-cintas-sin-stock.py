#!/usr/bin/env python3
"""
Alta de cintas nuevas SIN stock (para tenerlas listas cuando se compren).

  · Amarilla 2M 6/12   → CN-AMA-C12 (copia foto, proveedor y costos de CN-AMA-C9)
  · Morada clara       → CN-MORC-CE / -C9 / -C12  (sin foto)
  · Animal print blanca manchitas rojas → CN-APBM-CE / -C9 / -C12 (sin foto)

Costo: este script los crea con costo 0. Después se les asignó costo de la
factura 132716 del Pedido 4 (ver "costos_asignados" en el baseline): morada
clara ≈ línea Roxa-morada, animal print blanca ≈ línea Onça branca, precio USD
por pieza + envío 2.45 USD, TC 17.19.

Cada producto va a CINTAS con precio $150 en 'Pública MXN' y NO crea fila en
`inventario`: vista_inventario lo deja en stock 0, así que NO aparece en /order
hasta que se le suba stock desde Inventario.

Uso:
  python3 scripts/add-cintas-sin-stock.py            # dry-run (no escribe)
  python3 scripts/add-cintas-sin-stock.py apply      # escribe
Rollback: scripts/add-cintas-sin-stock-baseline.json (ids creados).
"""
import json, os, sys, urllib.request, urllib.error, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(ROOT, "scripts", "add-cintas-sin-stock-baseline.json")
APPLY = len(sys.argv) > 1 and sys.argv[1] == "apply"

CAT_CINTAS = "6a4ee0f5-5c76-4aa7-b74c-5955c2085178"
LISTA_PUBLICA = "89359ef1-e212-4b04-b013-f8e7006c1925"   # 'Pública MXN'
PRECIO_PUBLICO = 150.0
PESO = {"CE": "1PZA", "C9": "9-9mm", "C12": "6-12mm"}
ETIQ = {"CE": "entera", "C9": "cortada 9mm", "C12": "cortada 12mm"}

# (sku, nombre, peso_var, sibling_sku|None)
# sibling: se copian foto, proveedor y costos de ese SKU existente.
NUEVOS = [
    ("CN-AMA-C12",   "Amarilla 2M (cortada 12mm)",                       "C12", "CN-AMA-C9"),
    ("CN-MORC-CE",   "Morada clara (entera)",                            "CE",  None),
    ("CN-MORC-C9",   "Morada clara (cortada 9mm)",                       "C9",  None),
    ("CN-MORC-C12",  "Morada clara (cortada 12mm)",                      "C12", None),
    ("CN-APBM-CE",   "Animal print blanca manchitas rojas (entera)",     "CE",  None),
    ("CN-APBM-C9",   "Animal print blanca manchitas rojas (cortada 9mm)", "C9",  None),
    ("CN-APBM-C12",  "Animal print blanca manchitas rojas (cortada 12mm)", "C12", None),
]
COPIA = ("imagen_url", "proveedor_id", "costo", "precio_usd", "costo_envio_usd", "tipo_cambio")

def load_env():
    env = {}
    with open(os.path.join(ROOT, ".env.local")) as f:
        for ln in f:
            ln = ln.strip()
            if ln and not ln.startswith("#") and "=" in ln:
                k, v = ln.split("=", 1)
                env[k] = v.strip().strip('"').strip("'")
    return env

ENV = load_env()
URL = ENV["NEXT_PUBLIC_SUPABASE_URL"]
KEY = ENV["SUPABASE_SERVICE_ROLE_KEY"]

def rest(method, path, body=None, prefer=None):
    h = {"apikey": KEY, "Authorization": "Bearer " + KEY}
    if prefer:
        h["Prefer"] = prefer
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(URL + "/rest/v1/" + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read().decode()
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        sys.exit("HTTP %s %s → %s" % (e.code, path, e.read().decode()))

skus = [n[0] for n in NUEVOS]
existentes = {p["sku"] for p in rest("GET", "productos?select=sku&sku=in.(" + ",".join(skus) + ")")}
if existentes:
    sys.exit("Ya existen en BD: %s" % sorted(existentes))

sib_skus = sorted({n[3] for n in NUEVOS if n[3]})
sib = {p["sku"]: p for p in rest("GET", "productos?select=*&sku=in.(" + ",".join(sib_skus) + ")")} if sib_skus else {}
if len(sib) != len(sib_skus):
    sys.exit("Falta algún SKU de referencia: %s" % sib_skus)

print("%-14s %-52s %-6s %s" % ("SKU", "Nombre", "peso", "copia de"))
for sku, nombre, var, s in NUEVOS:
    print("%-14s %-52s %-6s %s" % (sku, nombre, PESO[var], s or "—"))

if not APPLY:
    print("\n(dry-run) Para escribir: python3 %s apply" % os.path.relpath(__file__, ROOT))
    sys.exit(0)

baseline = {"fecha": datetime.datetime.now().isoformat(), "productos_creados": [], "precios_creados": []}
hoy = datetime.date.today().isoformat()
for sku, nombre, var, s in NUEVOS:
    base = {k: sib[s][k] for k in COPIA} if s else {"imagen_url": None, "proveedor_id": None,
            "costo": 0, "precio_usd": 0, "costo_envio_usd": 0, "tipo_cambio": 17.5}
    row = rest("POST", "productos", {
        "sku": sku, "nombre": nombre, "nombre_display": nombre, "categoria_id": CAT_CINTAS,
        "peso": PESO[var], "activo": True, "costo_envio_mxn": 0, **base,
    }, "return=representation")[0]
    baseline["productos_creados"].append(row["id"])
    pp = rest("POST", "precios_producto", {"producto_id": row["id"], "lista_id": LISTA_PUBLICA,
              "precio": PRECIO_PUBLICO, "vigente_desde": hoy}, "return=representation")[0]
    baseline["precios_creados"].append(pp["id"])
    print("creado:", sku, nombre)

with open(BASELINE, "w") as f:
    json.dump(baseline, f, indent=2, ensure_ascii=False)
print("\nListo. Baseline en", os.path.relpath(BASELINE, ROOT))
