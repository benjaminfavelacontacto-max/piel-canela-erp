#!/usr/bin/env python3
"""
Cintas DECORBRONZE — LOTE 1 (8 modelos, 159 cintas) → inventario.

Misma convención que `cintas-2m-pedido4-lote1.py`: por modelo, 3 filas en `productos`
(-CE entera "1PZA", -C9 "9-9mm", -C12 "6-12mm"), $150 Pública MXN.

Modelos que YA existían (solo stock; se crean las presentaciones que faltaban):
  Fundo do mar (FDM) · Amarilla cebra (ACEB, la naranja ondulada) · Blanca (BLAN; sus
  3 productos no tenían foto → se les pone la de este lote) · Preta (PRE) · Azul rey (AZR;
  solo tenía 6mm, que no se toca).
Modelos NUEVOS: Anclas rojo y blanco, Mariposas azul marino, Azulejo azul y blanco.

Costeo PROVISIONAL de lo creado (aún no hay factura Decorbronze): precio_usd 1.22 +
costo_envio_usd 2.18, TC 17.19 → ≈ $58.45. Lo ya existente no se toca de costo.

Uso:  python3 scripts/cintas-decorbronze-lote1.py [apply]   (dry-run por defecto)
Rollback: scripts/cintas-decorbronze-lote1-baseline.json
"""
import json, os, sys, urllib.request, urllib.error, urllib.parse, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(ROOT, "scripts", "cintas-decorbronze-lote1-baseline.json")
IMG_DIR = os.path.join(ROOT, "scripts", "cintas-decorbronze-lote1-fotos")
APPLY = len(sys.argv) > 1 and sys.argv[1] == "apply"

CAT_CINTAS = "6a4ee0f5-5c76-4aa7-b74c-5955c2085178"
PROV = "bc5373a2-b76b-4c39-9627-1604fdf4757e"            # Decorbronze
LISTA_PUBLICA = "89359ef1-e212-4b04-b013-f8e7006c1925"   # 'Pública MXN'
PRECIO_PUBLICO = 150.0
PRECIO_USD, ENVIO_USD, TC = 1.22, 2.18, 17.19
COSTO_MXN = round((PRECIO_USD + ENVIO_USD) * TC, 2)

PESO = {"CE": "1PZA", "C9": "9-9mm", "C12": "6-12mm"}
ETIQ = {"CE": "entera", "C9": "cortada 9mm", "C12": "cortada 12mm"}

# (prefijo SKU, nombre, foto a subir | None, entera, 9/9, 6/12)
MODELOS = [
    ("CN-FDM",  "Fundo do mar",             None,                          10, 15, 4),
    ("CN-ACEB", "Amarilla cebra",           None,                          10,  0, 4),
    ("CN-BLAN", "Blanca",                   "cinta-blanca-db.jpg",          8, 15, 5),
    ("CN-PRE",  "Preta",                    None,                           8, 15, 4),
    ("CN-AZR",  "Azul rey",                 None,                          10, 12, 4),
    ("CN-ANC",  "Anclas rojo y blanco",     "cinta-anclas-db.jpg",          3,  7, 2),
    ("CN-MAZ",  "Mariposas azul marino",    "cinta-mariposas-azules-db.jpg", 4,  7, 2),
    ("CN-AZJ",  "Azulejo azul y blanco",    "cinta-azulejo-db.jpg",         3,  5, 2),
]
EXPECTED = 159

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
items = [i for i in items if i[3] > 0]   # presentaciones que no llegaron en este lote

total_units = sum(i[3] for i in items)
print("Lote Decorbronze 1: %d modelos, %d líneas, %d cintas" % (len(MODELOS), len(items), total_units))
assert total_units == EXPECTED, total_units

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
# modelos que ya existían: las presentaciones nuevas heredan la foto de cualquier hermana
for pref, _, foto, *_ in MODELOS:
    if foto:
        continue
    sib = rest("GET", "productos?select=sku,imagen_url&sku=like." + pref + "-*&imagen_url=not.is.null&limit=1")
    foto_de[pref] = sib[0]["imagen_url"] if sib else None
# productos existentes SIN foto (p. ej. Blanca) reciben la de este lote
for sku, nombre, var, q, foto in items:
    p = prods.get(sku)
    if p and not p.get("imagen_url") and foto:
        rest("PATCH", "productos?id=eq." + p["id"], {"imagen_url": foto})
        baseline.setdefault("imagen_asignada", []).append(p["id"])
        print("foto asignada a", sku)

# 2) productos + precio público
for sku, nombre, var, q, _ in items:
    if sku in prods or not var:
        continue
    pref = sku.rsplit("-", 1)[0]
    nm = "%s (%s)" % (nombre, ETIQ[var])
    row = rest("POST", "productos", {
        "sku": sku, "nombre": nm, "nombre_display": nm, "categoria_id": CAT_CINTAS,
        "proveedor_id": PROV, "peso": PESO[var], "imagen_url": foto_de.get(pref),
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
