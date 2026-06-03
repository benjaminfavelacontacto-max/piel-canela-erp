#!/usr/bin/env python3
"""
Corrige el Pedido 3 (Brasil) según las facturas reales:
- Envío total: 4,119.95 -> 1,843.50 USD (shipping 1,438.50 + pallet 50 + teloenvío 355)
- Prorrateo sobre las 157 unidades reales del embarque = 11.7420 USD/u
- Crea el producto "Choco Paty Praia 100g" (AC-100-CP) y lo agrega al pedido
- Snapshot de costo_envio (USD + MXN) a productos -> alimenta el inventario
Idempotente: re-ejecutar no duplica (guarda por SKU / producto_id).
"""
import os, json, urllib.request, urllib.error

URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
API = URL + "/rest/v1/"
BASE_H = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}

PEDIDO_ID = "778a43ad-7cd6-4078-86a9-b572373a2c83"
TC = 20.7
ENVIO_TOTAL_USD = 1843.50
UNIDADES_EMBARQUE = 157            # incl. 32 cintas pendientes
ENVIO_UNIT_USD = ENVIO_TOTAL_USD / UNIDADES_EMBARQUE   # 11.742038...
ENVIO_UNIT_MXN = ENVIO_UNIT_USD * TC

# Plantilla Choco Paty 850g (AC-850-CP)
CAT_ACTIVADORES = "eebd6227-669b-48bd-9c9f-051d24f18ca7"
PROV_PATRICIA   = "b6dc3d49-313c-41be-b0f4-0b5d9317e155"
NUEVO_SKU = "AC-100-CP"
NUEVO_PRECIO_USD = 7.07
NUEVO_CANT = 15


def req(method, path, body=None, prefer=None):
    headers = dict(BASE_H)
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        print(f"  !! HTTP {e.code} en {method} {path}: {e.read().decode()[:300]}")
        raise


def item_fields(precio_usd, cantidad, precio_publico_mxn):
    precio_mxn = precio_usd * TC
    costo_total_usd = precio_usd + ENVIO_UNIT_USD
    costo_total_mxn = costo_total_usd * TC
    f = {
        "precio_unitario_usd": precio_usd,
        "precio_unitario_mxn": precio_mxn,
        "envio_unitario_usd": ENVIO_UNIT_USD,
        "envio_unitario_mxn": ENVIO_UNIT_MXN,
        "costo_total_unitario_usd": costo_total_usd,
        "costo_total_unitario_mxn": costo_total_mxn,
        "subtotal_usd": precio_usd * cantidad,
        "subtotal_mxn": precio_mxn * cantidad,
        "total_con_envio_usd": costo_total_usd * cantidad,
        "total_con_envio_mxn": costo_total_mxn * cantidad,
    }
    if precio_publico_mxn is not None:
        profit_unit = precio_publico_mxn - costo_total_mxn
        f["profit_unitario"] = profit_unit
        f["profit_total"] = profit_unit * cantidad
    else:
        f["profit_unitario"] = None
        f["profit_total"] = None
    return f, costo_total_mxn


def snapshot_producto(producto_id, precio_usd, costo_total_mxn):
    req("PATCH", f"productos?id=eq.{producto_id}", {
        "precio_usd": precio_usd,
        "costo_envio_usd": ENVIO_UNIT_USD,
        "costo_envio_mxn": ENVIO_UNIT_MXN,
        "tipo_cambio": TC,
        "costo": costo_total_mxn,
    })


print(f"Envío/unidad = {ENVIO_UNIT_USD:.6f} USD  /  {ENVIO_UNIT_MXN:.6f} MXN")
print()

# ── 1) Recalcular los 6 ítems existentes + snapshot a productos ──
items = req("GET", f"pedido_compra_items?pedido_id=eq.{PEDIDO_ID}"
            "&select=id,producto_id,cantidad,precio_unitario_usd,precio_publico_mxn,productos(sku)")
print(f"Ítems existentes: {len(items)}")
for it in items:
    sku = (it.get("productos") or {}).get("sku")
    fields, costo_total_mxn = item_fields(
        float(it["precio_unitario_usd"]), int(it["cantidad"]),
        float(it["precio_publico_mxn"]) if it.get("precio_publico_mxn") is not None else None,
    )
    req("PATCH", f"pedido_compra_items?id=eq.{it['id']}", fields)
    snapshot_producto(it["producto_id"], float(it["precio_unitario_usd"]), costo_total_mxn)
    print(f"  ✓ {sku:14} envío_u={ENVIO_UNIT_USD:.4f} costo_total_mxn={costo_total_mxn:.2f}")

# ── 2) Crear producto Choco Paty Praia 100g (si no existe) ──
print()
existing = req("GET", f"productos?sku=eq.{NUEVO_SKU}&select=id")
if existing:
    nuevo_id = existing[0]["id"]
    print(f"Producto {NUEVO_SKU} ya existe ({nuevo_id}), reuso.")
else:
    costo_total_mxn_nuevo = (NUEVO_PRECIO_USD + ENVIO_UNIT_USD) * TC
    created = req("POST", "productos", {
        "sku": NUEVO_SKU,
        "nombre": "Choco Paty Linha Praia 100g",
        "nombre_display": "Choco Paty Praia 100g",
        "peso": "100g",
        "categoria_id": CAT_ACTIVADORES,
        "proveedor_id": PROV_PATRICIA,
        "precio_usd": NUEVO_PRECIO_USD,
        "costo_envio_usd": ENVIO_UNIT_USD,
        "costo_envio_mxn": ENVIO_UNIT_MXN,
        "tipo_cambio": TC,
        "costo": costo_total_mxn_nuevo,
        "activo": True,
    }, prefer="return=representation")
    nuevo_id = created[0]["id"]
    print(f"  ✓ Producto creado: {NUEVO_SKU} ({nuevo_id})")

# 2b) Fila de inventario para el nuevo producto (si no existe)
inv = req("GET", f"inventario?producto_id=eq.{nuevo_id}&select=id")
if inv:
    print(f"  · inventario ya existe para {NUEVO_SKU}")
else:
    req("POST", "inventario", {
        "producto_id": nuevo_id,
        "stock_actual": NUEVO_CANT,
        "stock_minimo": 3,
        "stock_inicial": NUEVO_CANT,
    })
    print(f"  ✓ inventario creado: stock={NUEVO_CANT}")

# ── 3) Agregar Choco Paty al pedido (si no está) ──
ya = req("GET", f"pedido_compra_items?pedido_id=eq.{PEDIDO_ID}&producto_id=eq.{nuevo_id}&select=id")
if ya:
    print(f"  · Choco Paty ya está en el pedido, recalculo.")
    fields, _ = item_fields(NUEVO_PRECIO_USD, NUEVO_CANT, None)
    req("PATCH", f"pedido_compra_items?id=eq.{ya[0]['id']}", fields)
else:
    fields, _ = item_fields(NUEVO_PRECIO_USD, NUEVO_CANT, None)
    fields.update({
        "pedido_id": PEDIDO_ID,
        "producto_id": nuevo_id,
        "cantidad": NUEVO_CANT,
        "precio_publico_mxn": None,
        "sort_order": len(items),
    })
    req("POST", "pedido_compra_items", fields)
    print(f"  ✓ Choco Paty agregado al pedido ({NUEVO_CANT} u @ ${NUEVO_PRECIO_USD})")

# ── 4) Actualizar header del pedido ──
print()
subtotal_usd = sum(float(it["precio_unitario_usd"]) * int(it["cantidad"]) for it in items) + NUEVO_PRECIO_USD * NUEVO_CANT
total_usd = subtotal_usd + ENVIO_TOTAL_USD
inv_each = total_usd / 2
req("PATCH", f"pedidos_compra?id=eq.{PEDIDO_ID}", {
    "subtotal_usd": subtotal_usd,
    "costo_envio_usd": ENVIO_TOTAL_USD,
    "costo_envio_mxn": ENVIO_TOTAL_USD * TC,
    "total_usd": total_usd,
    "total_mxn": total_usd * TC,
    "inversion_sandra_usd": inv_each,
    "inversion_benjamin_usd": inv_each,
    "inversion_sandra_mxn": inv_each * TC,
    "inversion_benjamin_mxn": inv_each * TC,
})
print(f"Header actualizado: subtotal={subtotal_usd:.2f}  envío={ENVIO_TOTAL_USD:.2f}  total={total_usd:.2f} USD")

# ── 5) Verificación ──
print("\n=== VERIFICACIÓN ===")
ped = req("GET", f"pedidos_compra?id=eq.{PEDIDO_ID}&select=subtotal_usd,costo_envio_usd,total_usd,tipo_cambio")[0]
print(f"Pedido: subtotal={ped['subtotal_usd']} envío={ped['costo_envio_usd']} total={ped['total_usd']} TC={ped['tipo_cambio']}")
verif = req("GET", f"pedido_compra_items?pedido_id=eq.{PEDIDO_ID}"
            "&select=cantidad,precio_unitario_usd,envio_unitario_usd,costo_total_unitario_mxn,"
            "productos(sku,costo_envio_usd,costo_envio_mxn)&order=sort_order")
tot_u = 0
for v in verif:
    p = v.get("productos") or {}
    tot_u += v["cantidad"]
    print(f"  {p.get('sku'):14} {v['cantidad']:>3}u  precio={v['precio_unitario_usd']:>6}  "
          f"envío_u={float(v['envio_unitario_usd']):.4f}  costo_tot_mxn={float(v['costo_total_unitario_mxn']):.2f}  "
          f"| inv.costo_envio={p.get('costo_envio_usd')}usd/{p.get('costo_envio_mxn')}mxn")
print(f"\n{len(verif)} ítems · {tot_u} unidades cargadas (faltan 32 cintas para llegar a 157)")
