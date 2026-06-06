#!/usr/bin/env python3
"""
Actualiza los COSTOS de las cintas del Pedido 3 (Brasil) con los precios de
lista reales del proveedor (factura 2M / DX), que vienen en REALES (BRL).

Contexto / decisiones (sesión 2026-06-06):
- Pedido 3 = 778a43ad-7cd6-4078-86a9-b572373a2c83 · 53 ítems · 692 u
- TC = 17.60 MXN/USD: tasa REAL del comprobante de conversión MXN→USDT (19 abr 2026,
  1 USDT = 17.60). Esos USDT se enviaron al proveedor. (Antes estaba en 20.70, erróneo.)
- Las 46 cintas (CN-*) tenían precio placeholder plano (~$1.22). Aquí se reescribe
  precio_unitario_usd = preço_lista_BRL × FACTOR.
- FACTOR = 0.1743 (≈ 5.7377 BRL/USD): conversión BRL→USD, INDEPENDIENTE del TC MXN/USD.
  Asunción (deja 7 BRL → $1.22); validar contra la factura USD real / suma de conversiones.
- Mapeo PT→ES confirmado por el dueño:
    Rosa Pink → Fuccia · Floral Branca → Hibisco · Poá Amarela → Rojo lunares (CN-LUN)
- 5 cintas SIN precio en la lista, deducidas por analogía de tipo (estampada 7/8, lisa 6/7):
    CN-CORA, CN-VCEB, CN-ACEB, CN-VE, CN-AZC, CN-AZR
- Solo se tocan cintas que YA están en el Pedido 3 (no se agrega nada nuevo).
- ENVÍO: estaba disparejo (243 u cargaban $7.59/u y 449 u cargaban $0). Por decisión
  del dueño se re-prorratea PAREJO: envío_total $1,843.50 / 692 u = $2.664/u para
  TODOS los ítems (mismo criterio que editarPedido()/agregarItemsPedido()).
- Snapshot de costo a productos → alimenta vista_inventario (no se escribe
  costo_envio_mxn: la vista lo deriva = costo_envio_usd × TC).
Idempotente: recalcula desde el mapa BRL + las cantidades actuales; re-correr no duplica.
"""
import os, json, urllib.request, urllib.error

URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
API = URL + "/rest/v1/"
BASE_H = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}

PEDIDO_ID = "778a43ad-7cd6-4078-86a9-b572373a2c83"
TC = 17.60               # MXN/USD real (conversión MXN->USDT 19 abr 2026)
FACTOR = 0.1743          # BRL -> USD (1 / 5.7377), independiente del TC
ENVIO_TOTAL_USD = 1843.50

# preço lista (BRL) por SKU
BRL = {
    # --- confirmados desde la lista del proveedor ---
    "CN-RMO-CE": 6, "CN-RMO-C9": 7,            # Roxa
    "CN-MA-CE": 6, "CN-MA-C9": 7,              # Marrom
    "CN-FUC-CE": 6, "CN-FUC-C9": 7,            # Rosa Pink -> Fuccia
    "CN-ORO-CE": 6, "CN-ORO-C9": 7,            # Ouro
    "CN-BLAN-CE": 4,                            # Branca
    "CN-NAR-CE": 6, "CN-NAR-C9": 7,            # Laranja
    "CN-AMA-CE": 4, "CN-AMA-C9": 4.5,          # Amarela
    "CN-SAND-CE": 7, "CN-SAND-C9": 8,          # Melancia
    "CN-FRE-CE": 7, "CN-FRE-C9": 8,            # Morango
    "CN-MARF-CE": 7, "CN-MARF-C9": 8,          # Borboletas
    "CN-LUN-CE": 7, "CN-LUN-C9": 8,            # Poá amarela
    "CN-APR-CE": 7, "CN-APR-C9": 8,            # Onça rosa
    "CN-ESV-CE": 7, "CN-ESV-C9": 8,            # Estrela verde
    "CN-ESR-CE": 7, "CN-ESR-C9": 8,            # Estrela rosa
    "CN-HIB-CE": 7, "CN-HIB-C9": 8,            # Floral branca -> Hibisco
    "CN-LV-CE": 7, "CN-LV-C9": 8,              # Louis Vuitton
    "CN-BARB-CE": 7, "CN-BARB-C9": 8,          # Barbie
    "CN-CER-CE": 9, "CN-CER-C9": 9, "CN-CER-C612": 9,  # Cereja (DX)
    # --- deducidos por analogía de tipo ---
    "CN-CORA-CE": 7, "CN-CORA-C9": 8,          # estampada
    "CN-VCEB-CE": 7, "CN-VCEB-C9": 8, "CN-VCEB-C612": 8,  # estampada
    "CN-ACEB-C9": 8,                            # estampada (cebra)
    "CN-VE-C9": 7,                              # lisa
    "CN-AZC-C9": 7, "CN-AZC-C66": 7,           # lisa
    "CN-AZR-C66": 7,                            # lisa
}


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, headers=BASE_H, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            t = resp.read().decode()
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        print(f"  !! HTTP {e.code} {method} {path}: {e.read().decode()[:300]}")
        raise


def r2(x):
    return round(x + 1e-9, 2)


def item_fields(precio, cant, envio_unit, tc, pub):
    precio_mxn = precio * tc
    ct_usd = precio + envio_unit
    ct_mxn = ct_usd * tc
    sub = precio * cant
    pu = (pub - ct_mxn) if pub is not None else None
    return {
        "precio_unitario_usd": precio, "precio_unitario_mxn": precio_mxn,
        "envio_unitario_usd": envio_unit, "envio_unitario_mxn": envio_unit * tc,
        "costo_total_unitario_usd": ct_usd, "costo_total_unitario_mxn": ct_mxn,
        "subtotal_usd": sub, "subtotal_mxn": sub * tc,
        "total_con_envio_usd": ct_usd * cant, "total_con_envio_mxn": ct_mxn * cant,
        "profit_unitario": pu, "profit_total": (pu * cant if pu is not None else None),
    }


items = req("GET", f"pedido_compra_items?pedido_id=eq.{PEDIDO_ID}"
            "&select=id,producto_id,cantidad,precio_unitario_usd,precio_publico_mxn,productos(sku)")

# Sanity: toda cinta del pedido debe tener precio asignado
skus_pedido = {(it.get("productos") or {}).get("sku", "") for it in items if (it.get("productos") or {}).get("sku", "").startswith("CN-")}
faltan = skus_pedido - set(BRL)
assert not faltan, f"Cintas sin precio en el mapa BRL: {sorted(faltan)}"

total_units = sum(int(it["cantidad"]) for it in items)
envio_unit = ENVIO_TOTAL_USD / total_units
print(f"Unidades={total_units}  envío_unit={envio_unit:.6f} USD\n")

cambiadas = 0
subtotal_usd = 0.0
for it in items:
    sku = (it.get("productos") or {}).get("sku", "")
    cant = int(it["cantidad"])
    pub = float(it["precio_publico_mxn"]) if it.get("precio_publico_mxn") is not None else None
    if sku in BRL:
        precio = r2(BRL[sku] * FACTOR)
        cambiadas += 1
    else:
        precio = float(it["precio_unitario_usd"])   # no-cinta: precio intacto
    req("PATCH", f"pedido_compra_items?id=eq.{it['id']}", item_fields(precio, cant, envio_unit, TC, pub))
    req("PATCH", f"productos?id=eq.{it['producto_id']}", {
        "precio_usd": precio, "costo_envio_usd": envio_unit, "tipo_cambio": TC,
        "costo": (precio + envio_unit) * TC,
    })
    subtotal_usd += precio * cant

# Header — preserva el ratio de inversión por socio
hdr = req("GET", f"pedidos_compra?id=eq.{PEDIDO_ID}&select=total_usd,inversion_sandra_usd,inversion_benjamin_usd")[0]
old_total = float(hdr["total_usd"]) or 0
rs = (float(hdr["inversion_sandra_usd"]) / old_total) if old_total else 0.5
rb = (float(hdr["inversion_benjamin_usd"]) / old_total) if old_total else 0.5
total_usd = subtotal_usd + ENVIO_TOTAL_USD
s_usd, b_usd = total_usd * rs, total_usd * rb
req("PATCH", f"pedidos_compra?id=eq.{PEDIDO_ID}", {
    "tipo_cambio": TC,
    "subtotal_usd": subtotal_usd, "costo_envio_usd": ENVIO_TOTAL_USD, "costo_envio_mxn": ENVIO_TOTAL_USD * TC,
    "total_usd": total_usd, "total_mxn": total_usd * TC,
    "inversion_sandra_usd": s_usd, "inversion_benjamin_usd": b_usd,
    "inversion_sandra_mxn": s_usd * TC, "inversion_benjamin_mxn": b_usd * TC,
})
print(f"Ítems={len(items)}  cintas reescritas={cambiadas}/46")
print(f"Header: subtotal=${subtotal_usd:,.2f}  total=${total_usd:,.2f} USD / ${total_usd*TC:,.2f} MXN")
print("✓ OK")
