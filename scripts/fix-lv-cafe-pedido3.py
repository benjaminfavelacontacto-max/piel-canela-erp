#!/usr/bin/env python3
"""
Diferencia las cintas Louis Vuitton CAFÉ (producto nuevo del Pedido 3) de las
BLANCAS (pedidos anteriores) en el inventario, y les sube su foto real.

Contexto (sesión 2026-06-11):
- Pedido 3 trajo 2 cintas LV nuevas, estampado CAFÉ (no blanco como las viejas):
    423b1282 Louis Vuitton (cortada 9mm)  · TC 17.60
    de0169b2 Louis Vuitton (entera)       · TC 17.60
- Las viejas (blancas, TC 20.70):
    317869ea Louis Vuitton (cortada 12mm)
    7c274c6a Cinta Louis Vuitton
- Solo se toca nombre_display (lo que ve la UI/portal); nombre (SKU) intacto.
- Foto: ~/Downloads/lv cafe.png -> bucket productos (service_role bypassa RLS).
  BD guarda SOLO el filename (buildProductoImageUrl antepone el prefijo).
Idempotente: re-correr reescribe los mismos valores.
"""
import os, json, urllib.request

URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
API = URL + "/rest/v1/"
H = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}

IMG_LOCAL = os.path.expanduser("~/Downloads/lv cafe.png")
IMG_NAME = "lv-cafe-pedido3.png"

CAFE = {
    "423b1282-9b99-410b-8f0c-f2a1e7635ab0": "Louis Vuitton Café (cortada 9mm)",
    "de0169b2-a1bb-4b11-b3b4-71366e291dd6": "Louis Vuitton Café (entera)",
}
BLANCA = {
    "317869ea-3290-4747-af08-53a92116220b": "Louis Vuitton Blanca (cortada 12mm)",
    "7c274c6a-89b5-4c58-a59c-73b338d53adc": "Louis Vuitton Blanca (entera)",
}

# 1) Subir la foto al bucket productos (upsert)
with open(IMG_LOCAL, "rb") as f:
    blob = f.read()
up = urllib.request.Request(
    URL + "/storage/v1/object/productos/" + IMG_NAME,
    data=blob, method="POST",
    headers={"apikey": KEY, "Authorization": "Bearer " + KEY,
             "Content-Type": "image/png", "x-upsert": "true"},
)
try:
    r = urllib.request.urlopen(up)
    print("upload:", r.status, IMG_NAME, f"({len(blob)} bytes)")
except urllib.error.HTTPError as e:
    print("upload ERROR:", e.code, e.read().decode())
    raise

def patch(pid, body):
    req = urllib.request.Request(
        API + "productos?id=eq." + pid, data=json.dumps(body).encode(),
        method="PATCH", headers={**H, "Prefer": "return=representation"},
    )
    r = urllib.request.urlopen(req)
    out = json.loads(r.read())
    print("  ->", out[0]["nombre_display"], "| img:", out[0]["imagen_url"])

# 2) Café: renombrar + foto nueva
print("CAFÉ:")
for pid, name in CAFE.items():
    patch(pid, {"nombre_display": name, "imagen_url": IMG_NAME})

# 3) Blanca: solo renombrar para diferenciar
print("BLANCA:")
for pid, name in BLANCA.items():
    patch(pid, {"nombre_display": name})

print("OK")
