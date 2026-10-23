#!/usr/bin/env python3
"""
Carga el Pedido 4 (Brasil, proforma Patricia Lobo #0504 del 04/09/2026) + costo PROMEDIO.

Decisiones (sesión 2026-10-20):
- Costo real = lo que nos costó en pesos: 12 compras MXN→USDT en Bitso (comisión incluida).
  Se enviaron 6,813.95 USDT (4,887.85 productos + 1,926.10 envío y cintas 2M); sobraron
  140.04 USDT que NO entran al costo (se valúan al costo de su lote). TC all-in = 17.1182.
  Como la comisión ya va dentro del TC, las conversiones se guardan con comision_mxn = 0.
- Envío real = $1,325.00 USD (pallet 50 + transporte cintas 25 + Brasil→Texas 1,250.00).
  La nota original decía 1,250.25 pero lo enviado (1,926.10 − cintas 601.10) cuadra con 1,250.00.
  Se prorratea PAREJO por unidad sobre TODAS las unidades del pedido (PL + cintas 2M).
- Costo por producto = PROMEDIO MÓVIL sobre el stock: (stock × costo_anterior_real +
  entrada × costo_nuevo) / (stock + entrada). costo_anterior_real = promedio ponderado de los
  pedidos anteriores en pedido_compra_items (TC reales de cada pedido, NO el 20.70 referencial).
  Se guarda en productos como precio_usd/costo_envio_usd promedio + un tipo_cambio "mezclado"
  tal que (precio_usd + costo_envio_usd) × tipo_cambio = costo promedio en MXN; así
  vista_inventario muestra el promedio sin tocar la vista.
  ⚠️ El botón "Actualizar TC" pisa productos.tipo_cambio → rompería este truco.
- PRECIOS existentes NO se tocan. Productos nuevos: precio fijo (constantes abajo).
- PENDIENTE: detalle de las cintas 2M ($601.10 USD). Mientras CINTAS_ITEMS esté vacío se usa
  CINTAS_UNITS_EST (estimado) solo para el envío por unidad. Al llenar CINTAS_ITEMS y
  re-correr, se recalcula todo desde el baseline (scripts/pedido-4-baseline.json).

IDEMPOTENTE: ítems y costos se recalculan desde el baseline; el stock solo suma el DELTA
contra los ítems que el pedido ya tenía. Conversiones/pagos solo se insertan si no existen.

Uso:
  python3 scripts/pedido-4-brasil.py          # DRY-RUN (solo imprime)
  python3 scripts/pedido-4-brasil.py apply    # aplica los cambios
"""
import sys, os, json, urllib.request, urllib.error, urllib.parse
from datetime import datetime, timedelta, timezone

DRY = "apply" not in sys.argv
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE_PATH = os.path.join(ROOT, "scripts", "pedido-4-baseline.json")

# ───────────────────────── Datos del pedido ─────────────────────────
NUMERO = 4
NOMBRE = "Pedido 4 Brasil"
FECHA = "2026-09-04"
ENVIO_BR_USD = 1325.00             # 50 pallet + 25 transporte cintas + 1250.00 Brasil→Texas (pagado en USDT)
# Tramo EE.UU.→México (La casita deli / teloenvio, factura #008258, 14/10/2026): pagado con TDC Negra
# el 16/10/2026, el banco cobró $6,319.47 MXN por 340.10 USD (TC 18.58, comisión incluida).
USA_MX_USD = 340.10
USA_MX_MXN = 6319.47
ENVIO_TOTAL_USD = round(ENVIO_BR_USD + USA_MX_USD, 2)   # 1,665.10
CINTAS_USD = 601.10                # cintas 2M (detalle pendiente)
CINTAS_UNITS_EST = 490             # ESTIMADO (≈ 601.10 / 1.22) — solo para envío/u provisional
CINTAS_ITEMS = []                  # [(sku, cantidad, precio_usd), ...] ← llenar con el detalle 2M
PL_PROV = "Patricia Lobo"

# Conversiones MXN→USDT (Bitso). (fecha local CST UTC-6, usdt, mxn)
CONVERSIONES = [
    ("2026-09-05 14:51:00", 4887.85, 84100.49),   # hora aprox. (captura de confirmación 2:51 pm)
    ("2026-09-05 14:55:50", 412.10, 6962.59),
    ("2026-09-05 14:57:35", 5.85, 98.96),
    ("2026-09-05 14:58:42", 870.32, 14704.15),
    ("2026-09-05 14:59:45", 0.99, 16.77),
    ("2026-09-05 15:00:24", 33.80, 571.13),
    ("2026-09-05 15:00:49", 1.40, 23.81),
    ("2026-09-05 15:01:01", 150.00, 2534.25),
    ("2026-09-05 15:02:56", 15.91, 268.91),
    ("2026-09-05 15:03:22", 398.00, 6724.21),
    ("2026-09-05 15:03:55", 98.00, 1655.83),
    ("2026-09-05 15:05:06", 79.77, 1347.80),
]
# Pagos (Bitso Transfer). (fecha local, usdt, destinatario, mensaje)
PAGOS = [
    ("2026-09-05 15:55:19", 4887.85, "Julio Ayarza Delgado", "Productos Brasil (proforma 0504 Patricia Lobo)"),
    ("2026-09-08 10:53:50", 1926.10, "Julio Ayarza Delgado", "Envio y cintas"),
]
USDT_ENVIADO = sum(p[1] for p in PAGOS)
USDT_COMPRADO = sum(c[1] for c in CONVERSIONES)
MXN_GASTADO = sum(c[2] for c in CONVERSIONES)
SOBRANTE = USDT_COMPRADO - USDT_ENVIADO
# Lote "chico" (todo menos la compra grande) — a ese costo se valúa el sobrante
_chico_usdt = sum(c[1] for c in CONVERSIONES[1:])
_chico_mxn = sum(c[2] for c in CONVERSIONES[1:])
MXN_PEDIDO = MXN_GASTADO - SOBRANTE * (_chico_mxn / _chico_usdt) + USA_MX_MXN
TC = round(MXN_PEDIDO / (USDT_ENVIADO + USA_MX_USD), 4)   # TC mezclado: USDT Bitso + tarjeta USA→MX

# Líneas de la proforma (qty, precio USD, sku existente | clave de producto nuevo)
LINEAS = [
    (30, 24.20, "AC-900-AM1"),     # Ametista I 900ml
    (15, 16.04, "PO-900-AM2"),     # Ametista II 900ml
    (30, 23.45, "AC-1000-PU"),     # Potência Ultra All Skin Colors (mismo producto)
    (20, 24.55, "PO-850-PM3.0"),   # Potência Máxima Neón 3.0
    (10, 24.40, "PO-850-PM2.0"),   # Potência Máxima Neón 2.0
    (5, 16.62, "AC-850-PES"),      # Pêssego Bronze
    (15, 17.88, "AC-850-CAM"),     # NUEVO Camomila Bronze
    (15, 10.47, "AC-450-TUT"),     # NUEVO Activador crema Tutti Frutti
    (15, 10.47, "AC-450-CAP"),     # NUEVO Activador crema Capuccino
    (30, 14.66, "HI-850-MOR"),     # Hidratante Morango
    (30, 11.39, "OLE-450"),        # Óleo iluminador
    (15, 5.65, "DOL-500"),         # Dolomita
    (5, 15.08, "OX30-900-MOR"),    # OX 30 Morango
    (5, 11.56, "OX40-900-CHO"),    # OX 40 Chocolate
    (3, 85.90, "AE-1L-SEM"),       # Sem Sol Metamorphosis 1L
    (8, 55.90, "AE-500-SEM"),      # NUEVO Sem Sol 500ml
    (10, 8.90, "AE-60-SEM"),       # NUEVO Sem Sol 60ml
    (12, 2.00, "CN-DEC"),          # NUEVO Cintas adhesivas decorativas
]
PROFORMA_TOTAL = 4887.85

# Productos nuevos: sku → (nombre, categoría, peso, precio Pública MXN, proveedor)
NUEVOS = {
    "AC-850-CAM": ("Camomila Bronze", "ACTIVADORES", "850g", 1440.0, PL_PROV),
    "AC-450-TUT": ("Activador Crema Tutti Frutti", "ACTIVADORES", "450g", 900.0, PL_PROV),
    "AC-450-CAP": ("Activador Crema Capuccino", "ACTIVADORES", "450g", 900.0, PL_PROV),
    "AE-500-SEM": ("Sem Sol 500ml", "AEROGRAFÍA", "500ml", 4240.0, PL_PROV),
    "AE-60-SEM": ("Sem Sol 60ml", "AEROGRAFÍA", "60ml", 780.0, PL_PROV),
    "CN-DEC": ("Cintas adhesivas decorativas", "CINTAS", "1PZA", 150.0, PL_PROV),  # = precio de cintas
}
STOCK_MINIMO_NUEVOS = 3

# ───────────────────────── REST helpers ─────────────────────────
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
BASE = ENV["NEXT_PUBLIC_SUPABASE_URL"] + "/rest/v1/"
KEY = ENV["SUPABASE_SERVICE_ROLE_KEY"]

def rest(method, path, body=None, prefer=None):
    h = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise SystemExit("HTTP %s en %s %s: %s" % (e.code, method, path, e.read().decode()))

def get(path): return rest("GET", path)

def utc(local):  # fecha local CST (UTC-6) → ISO UTC
    d = datetime.strptime(local, "%Y-%m-%d %H:%M:%S") + timedelta(hours=6)
    return d.replace(tzinfo=timezone.utc).isoformat()

def r2(x): return round(x + 0.0, 2)
def r4(x): return round(x + 0.0, 4)

# ───────────────────────── Carga de referencias ─────────────────────────
prov = {p["nombre"]: p["id"] for p in get("proveedores?select=id,nombre")}
cat = {c["nombre"]: c["id"] for c in get("categorias?select=id,nombre")}
lista_id = get("listas_precios?select=id&nombre=eq." + urllib.parse.quote("Pública MXN"))[0]["id"]
productos = {p["sku"]: p for p in get("productos?select=*&limit=2000")}
inv = {i["producto_id"]: i for i in get("inventario?select=*&limit=5000")}
ped = get("pedidos_compra?select=*&numero=eq.%d" % NUMERO)
ped = ped[0] if ped else None

def precio_publico(sku):
    if sku in NUEVOS:
        return NUEVOS[sku][3]
    pid = productos[sku]["id"]
    r = get("precios_producto?select=precio&producto_id=eq.%s&lista_id=eq.%s&vigente_hasta=is.null" % (pid, lista_id))
    return float(r[0]["precio"]) if r else None

# ───────────────────────── Validaciones ─────────────────────────
total_pl = round(sum(q * p for q, p, _ in LINEAS), 2)
assert total_pl == PROFORMA_TOTAL, "La suma de líneas %.2f ≠ proforma %.2f" % (total_pl, PROFORMA_TOTAL)
assert abs(CINTAS_USD + ENVIO_BR_USD + PROFORMA_TOTAL - USDT_ENVIADO) < 0.005, "No cuadra con USDT enviados"
for _, _, sku in LINEAS:
    assert sku in NUEVOS or sku in productos, "SKU inexistente: " + sku
for sku in NUEVOS:
    if sku in productos:
        print("ℹ️  %s ya existe (se reutiliza)" % sku)

# ───────────────────────── Baseline (estado previo) ─────────────────────────
if os.path.exists(BASELINE_PATH):
    baseline = json.load(open(BASELINE_PATH))
    print("Baseline existente cargado (%d productos)" % len(baseline))
else:
    baseline = {}
    ped_items_prev = {}
    pedido_prev_id = ped["id"] if ped else None
    for _, _, sku in LINEAS:
        if sku in NUEVOS and sku not in productos:
            continue
        p = productos[sku]
        its = get("pedido_compra_items?select=cantidad,precio_unitario_usd,envio_unitario_usd,costo_total_unitario_mxn,pedido_id&producto_id=eq." + p["id"])
        if pedido_prev_id:
            its = [i for i in its if i["pedido_id"] != pedido_prev_id]
        tq = sum(i["cantidad"] for i in its)
        if tq:
            old_mxn = sum(i["cantidad"] * i["costo_total_unitario_mxn"] for i in its) / tq
            old_prec = sum(i["cantidad"] * i["precio_unitario_usd"] for i in its) / tq
            old_env = sum(i["cantidad"] * i["envio_unitario_usd"] for i in its) / tq
        else:  # sin historial: usar lo que tenga el producto
            old_prec = float(p.get("precio_usd") or 0); old_env = float(p.get("costo_envio_usd") or 0)
            old_mxn = float(p.get("costo") or 0)
        baseline[sku] = {
            "stock_before": int((inv.get(p["id"]) or {}).get("stock_actual") or 0),
            "old_mxn": old_mxn, "old_precio_usd": old_prec, "old_envio_usd": old_env,
            "rollback": {k: p.get(k) for k in ("precio_usd", "costo_envio_usd", "tipo_cambio", "costo")},
        }
    # Cintas existentes del detalle 2M también necesitan baseline (se completa al re-correr)
    if not DRY:
        json.dump(baseline, open(BASELINE_PATH, "w"), indent=2, ensure_ascii=False)
        print("Baseline guardado en", BASELINE_PATH)

# ───────────────────────── Cálculo ─────────────────────────
units_pl = sum(q for q, _, _ in LINEAS)
units_cintas = sum(q for _, q, _ in CINTAS_ITEMS) if CINTAS_ITEMS else CINTAS_UNITS_EST
envio_u = ENVIO_TOTAL_USD / (units_pl + units_cintas)
prov_flag = "" if CINTAS_ITEMS else "  ⚠️ PROVISIONAL (cintas estimadas: %d u)" % CINTAS_UNITS_EST

print("\n=== PEDIDO %d ===" % NUMERO)
print("MXN gastado %.2f · USDT comprado %.2f · enviado %.2f · sobrante %.2f" % (MXN_GASTADO, USDT_COMPRADO, USDT_ENVIADO, SOBRANTE))
print("Costo del pedido en MXN %.2f · TC all-in %.4f" % (MXN_PEDIDO, TC))
print("Envío %.2f USD / %d u (%d PL + %d cintas) = %.4f USD/u%s" % (ENVIO_TOTAL_USD, units_pl + units_cintas, units_pl, units_cintas, envio_u, prov_flag))

calc = []
print("\n%-13s %5s %6s %8s %9s %9s %9s %7s" % ("SKU", "stock", "+ent", "costoNvo", "PROMEDIO", "precio", "margen", ""))
for q, usd, sku in LINEAS:
    nuevo_mxn = (usd + envio_u) * TC
    if sku in NUEVOS and sku not in baseline:  # producto creado por este pedido: stock previo 0
        sb, avg_mxn, avg_prec, avg_env = 0, nuevo_mxn, usd, envio_u
    else:
        b = baseline[sku]; sb = b["stock_before"]
        w = sb + q
        avg_mxn = (sb * b["old_mxn"] + q * nuevo_mxn) / w
        avg_prec = (sb * b["old_precio_usd"] + q * usd) / w
        avg_env = (sb * b["old_envio_usd"] + q * envio_u) / w
    tc_mix = avg_mxn / (avg_prec + avg_env)
    pub = precio_publico(sku) if (sku in productos or sku in NUEVOS) else None
    calc.append(dict(sku=sku, q=q, usd=usd, nuevo_mxn=nuevo_mxn, avg_mxn=avg_mxn, avg_prec=avg_prec,
                     avg_env=avg_env, tc_mix=tc_mix, pub=pub, sb=sb))
    m = ("%.1f%%" % ((pub - avg_mxn) / pub * 100)) if pub else "s/precio"
    print("%-13s %5d %6d %8.1f %9.1f %9s %9s" % (sku, sb, q, nuevo_mxn, avg_mxn, ("%.0f" % pub) if pub else "-", m))

subtotal_usd = PROFORMA_TOTAL + CINTAS_USD
total_usd = subtotal_usd + ENVIO_TOTAL_USD
header = dict(
    numero=NUMERO, nombre=NOMBRE, fecha=FECHA, proveedor_id=prov[PL_PROV], tipo="mixto",
    tipo_cambio=TC, subtotal_usd=r2(subtotal_usd), costo_envio_usd=r2(ENVIO_TOTAL_USD),
    costo_envio_mxn=r2(ENVIO_TOTAL_USD * TC), total_usd=r2(total_usd), total_mxn=r2(total_usd * TC),
    inversion_sandra_usd=r2(total_usd / 2), inversion_benjamin_usd=r2(total_usd / 2),
    inversion_sandra_mxn=r2(total_usd * TC / 2), inversion_benjamin_mxn=r2(total_usd * TC / 2),
    notas=("Pedido 4 Brasil · Proforma Patricia Lobo #0504 (04/09/2026) $4,887.85 USD · 18 líneas / %d u + cintas 2M $601.10 USD%s · "
           "Envío $%.2f USD (pallet 50 + transporte cintas 25 + Brasil→Texas 1,250.00 + EE.UU.→México 340.10 La casita deli, "
           "pagado con TDC por $6,319.47 MXN) · "
           "TC %.4f = costo REAL todo-incluido (comisión Bitso y de tarjeta adentro; conversiones con comision_mxn=0) · "
           "Enviado %.2f USDT a Julio Ayarza Delgado; sobrante %.2f USDT fuera del costo · "
           "Retiro Nu $59,500 c/u. Costos por producto = promedio móvil sobre stock." %
           (units_pl, " (DETALLE CINTAS PENDIENTE)" if not CINTAS_ITEMS else "", ENVIO_TOTAL_USD, TC, USDT_ENVIADO, SOBRANTE)),
)
print("\nHEADER subtotal %.2f envío %.2f total %.2f USD / %.2f MXN · inversión c/u %.2f MXN" %
      (subtotal_usd, ENVIO_TOTAL_USD, total_usd, header["total_mxn"], header["inversion_sandra_mxn"]))

if DRY:
    print("\nDRY-RUN: no se escribió nada. Re-corre con 'apply'.")
    sys.exit(0)

# ───────────────────────── APLICAR ─────────────────────────
# 1) Productos nuevos
for sku, (nombre, c, peso, pub, pv) in NUEVOS.items():
    if sku in productos:
        continue
    x = next(k for k in calc if k["sku"] == sku)
    row = rest("POST", "productos", {
        "sku": sku, "nombre": nombre, "nombre_display": nombre, "categoria_id": cat[c],
        "proveedor_id": prov[pv], "peso": peso, "activo": True,
        "precio_usd": r4(x["avg_prec"]), "costo_envio_usd": r4(x["avg_env"]),
        "tipo_cambio": round(x["tc_mix"], 6), "costo": r2(x["avg_mxn"]),
    }, prefer="return=representation")[0]
    productos[sku] = row
    rest("POST", "precios_producto", {
        "producto_id": row["id"], "lista_id": lista_id, "precio": pub,
        "precio_con_envio": r2(x["avg_mxn"]), "vigente_desde": datetime.now().strftime("%Y-%m-%d"),
    })
    print("＋ producto creado:", sku, nombre)

# 2) Header (upsert por número)
if ped:
    rest("PATCH", "pedidos_compra?id=eq." + ped["id"], header)
    pedido_id = ped["id"]
    prev_items = get("pedido_compra_items?select=producto_id,cantidad&pedido_id=eq." + pedido_id)
else:
    pedido_id = rest("POST", "pedidos_compra", header, prefer="return=representation")[0]["id"]
    prev_items = []
prev_q = {}
for i in prev_items:
    prev_q[i["producto_id"]] = prev_q.get(i["producto_id"], 0) + i["cantidad"]

# 3) Ítems (borra y reinserta) + snapshot de costo promedio + delta de stock
if prev_items:
    rest("DELETE", "pedido_compra_items?pedido_id=eq." + pedido_id)
for n, x in enumerate(calc):
    p = productos[x["sku"]]
    nuevo_total_usd = x["usd"] + envio_u
    pub = x["pub"]
    profit_u = (pub - nuevo_total_usd * TC) if pub else None
    rest("POST", "pedido_compra_items", {
        "pedido_id": pedido_id, "producto_id": p["id"], "cantidad": x["q"],
        "precio_unitario_usd": r4(x["usd"]), "precio_unitario_mxn": r2(x["usd"] * TC),
        "envio_unitario_usd": r4(envio_u), "envio_unitario_mxn": r2(envio_u * TC),
        "costo_total_unitario_usd": r4(nuevo_total_usd), "costo_total_unitario_mxn": r2(nuevo_total_usd * TC),
        "subtotal_usd": r2(x["usd"] * x["q"]), "subtotal_mxn": r2(x["usd"] * x["q"] * TC),
        "total_con_envio_usd": r2(nuevo_total_usd * x["q"]), "total_con_envio_mxn": r2(nuevo_total_usd * TC * x["q"]),
        "precio_publico_mxn": pub, "profit_unitario": r2(profit_u) if profit_u is not None else None,
        "profit_total": r2(profit_u * x["q"]) if profit_u is not None else None,
        "proveedor_id": prov[PL_PROV], "sort_order": n,
    })
    rest("PATCH", "productos?id=eq." + p["id"], {
        "precio_usd": r4(x["avg_prec"]), "costo_envio_usd": r4(x["avg_env"]),
        "tipo_cambio": round(x["tc_mix"], 6), "costo": r2(x["avg_mxn"]),
    })
    delta = x["q"] - prev_q.get(p["id"], 0)
    if delta:
        row = inv.get(p["id"])
        if row:
            rest("PATCH", "inventario?id=eq." + row["id"], {"stock_actual": max(0, row["stock_actual"] + delta)})
        else:
            s = max(0, delta)
            rest("POST", "inventario", {"producto_id": p["id"], "stock_actual": s,
                                        "stock_minimo": STOCK_MINIMO_NUEVOS, "stock_inicial": s})

# 4) Conversiones y pagos (solo si no existen)
if not get("pedido_conversiones?select=id&limit=1&pedido_id=eq." + pedido_id):
    for f, usdt, mxn in CONVERSIONES:
        rest("POST", "pedido_conversiones", {
            "pedido_id": pedido_id, "fecha": utc(f), "mxn_gastado": mxn, "usdt_recibido": usdt,
            "tipo_cambio": round(mxn / usdt, 4), "comision_mxn": 0,
            "notas": "Conversión MXN→USDT (Bitso). Comisión incluida en el monto pagado.",
        })
    print("＋ %d conversiones" % len(CONVERSIONES))
if not get("pedido_pagos?select=id&limit=1&pedido_id=eq." + pedido_id):
    for f, usdt, dest, msg in PAGOS:
        rest("POST", "pedido_pagos", {"pedido_id": pedido_id, "fecha": utc(f), "usdt_enviado": usdt,
                                      "destinatario": dest, "mensaje": msg})
    print("＋ %d pagos" % len(PAGOS))

print("\n✅ Pedido %d aplicado (id %s)%s" % (NUMERO, pedido_id, prov_flag))
