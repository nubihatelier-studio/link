"""Lee la cartilla MIYUKI anclándose en el código, no en las reglas de la tabla.

Cada página de la cartilla tiene su propio ancho de columnas, así que buscar
la casilla de la muestra contando reglas fallaba en la mitad de las páginas.
El código que nombra la hebra, en cambio, siempre está a su izquierda y a su
misma altura: se busca la hebra a la derecha del texto.
"""
import re
import numpy as np
from PIL import Image
import ocr

CODIGO = re.compile(r'^DB[-\s]?(\d+)([A-Z]?)$')

def codigos(path):
    out = []
    for t in ocr.read(path):
        m = CODIGO.match(t['text'].strip())
        if m:
            t['code'] = 'DB-%s%s' % (m.group(1), m.group(2))
            out.append(t)
    return out

def pitch(vals, lo, hi):
    d = [b - a for a, b in zip(sorted(vals), sorted(vals)[1:]) if lo < b - a < hi]
    return float(np.median(d)) if d else None

def tramos(mask, minimo):
    """Los tramos seguidos de `mask`, descartando los angostos — así una regla
    de la tabla (una línea fina y negrísima) no se hace pasar por la hebra."""
    out, ini = [], None
    for i, v in enumerate(list(mask) + [False]):
        if v and ini is None: ini = i
        elif not v and ini is not None:
            if i - ini >= minimo: out.append((ini, i))
            ini = None
    return out

def caja_hebra(g, t, alto, ancho, paper):
    """Dónde está la hebra que nombra este código: a su derecha, a su altura.

    Dos trampas dentro de la zona de búsqueda, las dos resueltas acá:

    - La regla negra que separa columnas se lleva todo el contraste, así que
      el umbral es absoluto y por tramos anchos, no relativo al máximo: si no,
      las hebras pálidas (los Duracoat claros) quedaban debajo y se perdían.
    - Esa misma regla, siendo oscura, se hacía pasar por hebra y la caja
      terminaba abarcando media fila de papel: el color salía casi blanco. Se
      reconoce porque una regla cruza la franja de arriba abajo, mientras que
      una hebra deja papel por encima y por debajo.
    """
    cy = t['y'] + t['h'] // 2
    y0, y1 = max(0, int(cy - alto * 0.45)), min(g.shape[0], int(cy + alto * 0.45))
    x0 = t['x'] + t['w'] + int(alto * 0.15)
    x1 = min(g.shape[1], int(t['x'] + ancho * 0.98))
    if x1 - x0 < 30 or y1 - y0 < 12: return None
    dif = paper - g[y0:y1, x0:x1]
    fuera_papel = dif > 12
    regla = fuera_papel.mean(axis=0) > 0.9          # cruza la franja entera
    col = (dif.mean(axis=0) > 2.5) & ~regla
    anchos = tramos(col, max(20, int(alto * 0.5)))
    if not anchos: return None
    cx0, cx1 = max(anchos, key=lambda r: r[1] - r[0])
    dif2 = dif[:, cx0:cx1]
    altos = tramos(dif2.mean(axis=1) > 2.5, 6)
    if not altos: return None
    cy0, cy1 = max(altos, key=lambda r: r[1] - r[0])
    return (x0 + cx0, y0 + cy0, x0 + cx1, y0 + cy1)

def color(a, caja, white):
    """El color de la hebra: el interior de su caja, sin la sombra de abajo ni
    los terminales de los costados, y de ahí la banda 25-90 del brillo (fuera
    las sombras de los huecos, fuera el reflejo). Nunca una máscara de "más
    oscuro que el papel": eso se come la cara de una mostacilla blanca."""
    x0, y0, x1, y1 = caja
    h, w = y1 - y0, x1 - x0
    box = a[y0 + int(h * 0.12):y0 + int(h * 0.72), x0 + int(w * 0.15):x0 + int(w * 0.85)]
    px = box.reshape(-1, 3).astype(float)
    if len(px) < 40: return None
    lum = px.mean(axis=1)
    lo, hi = np.percentile(lum, [25, 90])
    core = px[(lum >= lo) & (lum <= hi)]
    if len(core) < 10: core = px
    return tuple(int(round(v)) for v in np.clip(np.median(core, axis=0) * (255.0 / white), 0, 255))

def pagina(path, verbose=False):
    """Todos los códigos de una página con su color.

    Al final se descarta lo que no mide como las demás: en una misma página
    todas las hebras son del mismo largo y alto, así que una caja que se sale
    de medida es una mal leída — se tragó una regla de la tabla o media fila
    de papel — y un color inventado es peor que un código de menos.
    """
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(int)
    g = a.mean(axis=2)
    white = a[g >= np.percentile(g, 90)].reshape(-1, 3).mean(axis=0)
    paper = float(np.percentile(g, 95))
    ts = codigos(path)
    if not ts: return {}
    alto = pitch([t['y'] + t['h']//2 for t in ts], 20, 300) or 70
    ancho = pitch([t['x'] for t in ts], 120, 1200) or 350
    cajas = {}
    for t in ts:
        caja = caja_hebra(g, t, alto, ancho, paper)
        if caja: cajas[t['code']] = caja
    if not cajas: return {}
    anchos = np.array([c[2] - c[0] for c in cajas.values()])
    altos = np.array([c[3] - c[1] for c in cajas.values()])
    ma, mh = float(np.median(anchos)), float(np.median(altos))
    out, fuera = {}, 0
    for code, caja in cajas.items():
        w, h = caja[2] - caja[0], caja[3] - caja[1]
        if not (0.65 * ma <= w <= 1.35 * ma and 0.65 * mh <= h <= 1.35 * mh):
            fuera += 1
            continue
        c = color(a, caja, white)
        if c: out[code] = {'hex': '#%02x%02x%02x' % c, 'box': caja, 'page': path}
    if verbose: print('   %s: %d leídos, %d descartados por medida' % (path, len(out), fuera))
    return out
