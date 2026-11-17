#!/usr/bin/env python3
"""
Cintas 2M del Pedido 4 — LOTE 1 (13 modelos, 269 cintas) → inventario.

Cada modelo llega en 3 presentaciones (una fila de `productos` por cada una):
  · entera        → SKU …-CE   (peso "1PZA")
  · 9/9           → SKU …-C9   (peso "9-9mm",  "cortada 9mm")
  · 6/12          → SKU …-C12  (peso "6-12mm", "cortada 12mm")

Qué hace:
  1. Sube la foto (recortada de las capturas del usuario) al bucket `productos`
     SOLO para los modelos nuevos; en BD se guarda únicamente el filename.
  2. Crea los productos que faltan (CINTAS, proveedor 2M-Fortaleza, $150 Pública MXN).
  3. Suma el stock del lote: UPDATE si ya hay fila en `inventario`, INSERT si no
     (stock_inicial = stock_actual, es NOT NULL).

Costeo PROVISIONAL de los productos NUEVOS (igual que CN-DEC en el Pedido 4):
  precio_usd 1.22 · costo_envio_usd 2.18 · tipo_cambio 17.19 → costo MXN ≈ 58.45.
Los productos que YA existían no se tocan de costo (solo stock). Cuando esté el
detalle completo de las cintas 2M ($601.10 USD) hay que llenar CINTAS_ITEMS en
`scripts/pedido-4-brasil.py` y re-correrlo.

Uso:
  python3 scripts/cintas-2m-pedido4-lote1.py            # dry-run (no escribe)
  python3 scripts/cintas-2m-pedido4-lote1.py apply      # escribe
Rollback: scripts/cintas-2m-pedido4-lote1-baseline.json (stock previo + ids creados).
"""
import json, os, sys, urllib.request, urllib.error, urllib.parse, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(ROOT, "scripts", "cintas-2m-pedido4-lote1-baseline.json")
IMG_DIR = os.environ.get("CROPS_DIR", os.path.join(ROOT, "scripts", "cintas-2m-lote1-fotos"))
APPLY = len(sys.argv) > 1 and sys.argv[1] == "apply"

CAT_CINTAS = "6a4ee0f5-5c76-4aa7-b74c-5955c2085178"
PROV_2M_FORTALEZA = "5aca6895-c748-44d2-9f69-ce743a5d02d5"
LISTA_PUBLICA = "89359ef1-e212-4b04-b013-f8e7006c1925"   # 'Pública MXN'
PRECIO_PUBLICO = 150.0
PRECIO_USD, ENVIO_USD, TC = 1.22, 2.18, 17.19
COSTO_MXN = round((PRECIO_USD + ENVIO_USD) * TC, 2)

PESO = {"CE": "1PZA", "C9": "9-9mm", "C12": "6-12mm"}
ETIQ = {"CE": "entera", "C9": "cortada 9mm", "C12": "cortada 12mm"}

# (prefijo SKU, nombre, foto|None si el modelo ya existía, entera, 9/9, 6/12)
MODELOS = [
    ("CN-FUC",  "Fuccia",                   None,                             10, 12, 4),   # ya existía (primero se creó como "Vino"; la factura la llama Rosa Pink)
    ("CN-ROS",  "Rosa Bebe",                None,                             10, 15, 5),   # ya existía (primero se creó como "Rosa palo" y se fusionó)
    ("CN-RMO",  "Roxa-morada",              None,                             10,  6, 4),   # ya existía (primero se creó como "Morado oscuro" y se fusionó)
    ("CN-NAR",  "Naranja",                  None,                             10,  6, 2),   # ya existe
    ("CN-RNB",  "Rombos negros-blanco",     None,                              4, 12, 3),   # ya existe (falta C12)
    ("CN-RCO",  "Roja copos blancos",       "cinta-roja-copos-2m.jpg",         4,  6, 2),
    ("CN-ACO",  "Amarilla corazones",       "cinta-amarilla-corazones-2m.jpg", 5,  8, 2),
    ("CN-APRB", "Animal print rosa blanca", "cinta-ap-rosa-blanca-2m.jpg",    10, 15, 4),
    ("CN-HOJ",  "Hojas negra",              "cinta-hojas-2m.jpg",              5,  8, 3),
    ("CN-RNR",  "Rombo negro-rojo",         None,                              5,  3, 3),   # ya existe (falta C12)
    ("CN-APV",  "Animal print verde",       "cinta-ap-verde-2m.jpg",          10, 13, 4),
    ("CN-APAZ", "Animal print azul",        "cinta-ap-azul-2m.jpg",           10, 13, 4),
]
# Animal print amarilla (ya existe, SKUs distintos al patrón) — sin entera en este lote
EXTRA = [("CN-AP-E", 0), ("CN-AP-C9", 15), ("CN-AP-C12", 4)]

# ───────────────────────── REST ─────────────────────────
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

def http(method, url, body=None, headers=None, raw=False):
    h = {"apikey": KEY, "Authorization": "Bearer " + KEY}
    h.update(headers or {})
    data = body if raw else (json.dumps(body).encode() if body is not None else None)
    if body is not None and not raw:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read().decode()
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        sys.exit("HTTP %s %s → %s" % (e.code, url, e.read().decode()))

def rest(method, path, body=None, prefer=None):
    return http(method, URL + "/rest/v1/" + path, body, {"Prefer": prefer} if prefer else None)

# ───────────────────────── plan ─────────────────────────
items = []  # (sku, nombre_modelo, variante, qty, foto)
for pref, nombre, foto, e, n9, n12 in MODELOS:
    for var, q in (("CE", e), ("C9", n9), ("C12", n12)):
        items.append((pref + "-" + var, nombre, var, q, foto))
for sku, q in EXTRA:
    if q:
        items.append((sku, "Animal print-amarilla", None, q, None))

total_units = sum(i[3] for i in items)
print("Lote 1: %d modelos, %d líneas, %d cintas" % (len(MODELOS) + 1, len(items), total_units))
assert total_units == 269, total_units

skus = [i[0] for i in items]
filt = "(" + ",".join(skus) + ")"
prods = {p["sku"]: p for p in rest("GET", "productos?select=id,sku,nombre,imagen_url&sku=in." + filt)}
inv = {r["producto_id"]: r for r in rest("GET", "inventario?select=id,producto_id,stock_actual,stock_inicial&producto_id=in.(" +
       ",".join(p["id"] for p in prods.values()) + ")")} if prods else {}

if os.path.exists(BASELINE) and APPLY:
    sys.exit("Ya existe %s: el lote ya se aplicó. Revierte primero (o bórralo si lo reviertes a mano)." % BASELINE)

print("\n%-14s %-34s %5s %-8s %s" % ("SKU", "Producto", "+qty", "producto", "stock"))
for sku, nombre, var, q, foto in items:
    p = prods.get(sku)
    nm = (nombre + " (" + ETIQ[var] + ")") if var else (p["nombre"] if p else nombre)
    stock = inv.get(p["id"], {}).get("stock_actual") if p else None
    st = "nuevo prod" if not p else ("nueva fila" if p["id"] not in inv else "%d → %d" % (stock, stock + q))
    print("%-14s %-34s %5d %-8s %s" % (sku, nm[:34], q, "existe" if p else "CREAR", st if p else "0 → %d" % q))

if not APPLY:
    print("\n(dry-run) Para escribir: python3 %s apply" % os.path.relpath(__file__, ROOT))
    sys.exit(0)

# ───────────────────────── apply ─────────────────────────
baseline = {"fecha": datetime.datetime.now().isoformat(), "stock_previo": {}, "productos_creados": [],
            "inventario_creado": [], "precios_creados": [], "imagenes": []}
hoy = datetime.date.today().isoformat()

# 1) imágenes (solo modelos nuevos)
for pref, nombre, foto, *_ in MODELOS:
    if not foto:
        continue
    path = os.path.join(IMG_DIR, foto)
    if not os.path.exists(path):
        sys.exit("Falta la foto " + path)
    with open(path, "rb") as f:
        blob = f.read()
    http("POST", URL + "/storage/v1/object/productos/" + urllib.parse.quote(foto), blob,
         {"Content-Type": "image/jpeg", "x-upsert": "true"}, raw=True)
    baseline["imagenes"].append(foto)
    print("imagen subida:", foto)

foto_de = {pref: foto for pref, _, foto, *_ in MODELOS}
# imagen de un modelo existente (para crear su variante C12): la de su versión entera
for pref in ("CN-RNB", "CN-RNR"):
    ce = prods.get(pref + "-CE")
    foto_de[pref] = ce["imagen_url"] if ce else None

# 2) productos + precio público
for sku, nombre, var, q, _ in items:
    if sku in prods or not var:
        continue
    pref = sku.rsplit("-", 1)[0]
    nm = "%s (%s)" % (nombre, ETIQ[var])
    row = rest("POST", "productos", {
        "sku": sku, "nombre": nm, "nombre_display": nm, "categoria_id": CAT_CINTAS,
        "proveedor_id": PROV_2M_FORTALEZA, "peso": PESO[var], "imagen_url": foto_de.get(pref),
        "activo": True, "costo": COSTO_MXN, "precio_usd": PRECIO_USD, "costo_envio_usd": ENVIO_USD,
        "costo_envio_mxn": 0, "tipo_cambio": TC,
    }, "return=representation")[0]
    prods[sku] = row
    baseline["productos_creados"].append(row["id"])
    pp = rest("POST", "precios_producto", {"producto_id": row["id"], "lista_id": LISTA_PUBLICA,
              "precio": PRECIO_PUBLICO, "vigente_desde": hoy}, "return=representation")[0]
    baseline["precios_creados"].append(pp["id"])
    print("producto creado:", sku, nm)

# 3) stock (releer inventario: algún trigger podría haber creado filas)
ids = ",".join(p["id"] for p in prods.values())
inv = {r["producto_id"]: r for r in rest("GET", "inventario?select=id,producto_id,stock_actual,stock_inicial&producto_id=in.(" + ids + ")")}
for sku, nombre, var, q, _ in items:
    pid = prods[sku]["id"]
    r = inv.get(pid)
    if r:
        baseline["stock_previo"][sku] = {"inventario_id": r["id"], "stock_actual": r["stock_actual"]}
        rest("PATCH", "inventario?id=eq." + r["id"], {"stock_actual": r["stock_actual"] + q})
        print("stock %s: %d → %d" % (sku, r["stock_actual"], r["stock_actual"] + q))
    else:
        new = rest("POST", "inventario", {"producto_id": pid, "stock_actual": q, "stock_inicial": q,
                   "stock_minimo": 0}, "return=representation")[0]
        baseline["inventario_creado"].append(new["id"])
        baseline["stock_previo"][sku] = {"inventario_id": new["id"], "stock_actual": 0, "creada": True}
        print("stock %s: fila nueva = %d" % (sku, q))

with open(BASELINE, "w") as f:
    json.dump(baseline, f, indent=2, ensure_ascii=False)
print("\nListo. Baseline en", os.path.relpath(BASELINE, ROOT))
