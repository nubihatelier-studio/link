# Leer la cartilla Miyuki

De acá sale `src/data/miyukiDelica11.ts`: los códigos DB y el color de cada
uno, leídos de la cartilla oficial de la tejedora — *MIYUKI Beads Sample
Card*, ©2006, 10 páginas escaneadas en `codigos miyuki db 1.pdf` (en su
carpeta, no en el repo: es material suyo).

No corre en la app ni en el build. Se corre a mano cuando haya que rehacer
el catálogo o sumar otra cartilla.

## Cómo

```bash
python3 -m pip install --user pyobjc-framework-Vision pillow numpy pymupdf
python3 extraer.py "ruta/a/codigos miyuki db 1.pdf" > cartilla.json
```

`ocr.py` usa el reconocimiento de texto que ya trae macOS (Vision): lee los
códigos con sus coordenadas, sin instalar ningún OCR aparte.

`lector.py` busca la hebra que nombra cada código —siempre a su derecha y a
su misma altura— y le saca el color.

## Lo que costó, para no volver a tropezar

- **El color no se mide con una máscara de "más oscuro que el papel".** La
  cara de una mostacilla blanca es tan clara como la hoja: esa máscara se la
  come y deja midiendo sus sombras. De ahí salían los blancos grises del
  catálogo viejo. Se recorta por geometría y se toma la banda 25-90 del
  brillo: fuera las sombras de los huecos, fuera el reflejo especular.
- **Ni el promedio ni el percentil alto sirven.** Promediando la hebra entera
  entra el papel y todo se va al gris; midiendo la parte más brillante se
  mide el reflejo y los rojos salen rosados.
- **No anclarse en las reglas de la tabla.** Cada página tiene su propio
  ancho de columnas; contando reglas fallaba la mitad. El ancla es el código.
- **La regla negra entre columnas** se lleva todo el contraste de la zona de
  búsqueda y hace desaparecer las hebras pálidas. Se reconoce porque cruza la
  franja de arriba abajo, cosa que una hebra nunca hace.
- **Al final se descarta lo que no mide como las demás.** En una página todas
  las hebras son iguales de largas: la caja que se sale de medida se tragó una
  regla o media fila de papel. Un código de menos es mejor que un color
  inventado.

## Lo que falta

Las páginas 5, 7 y 8 entregan pocos códigos y la 6 pierde varios en el
filtro de medida: tienen tablas con otra geometría. Rinden hoy 966 de los
~1.100 códigos que trae la cartilla.
