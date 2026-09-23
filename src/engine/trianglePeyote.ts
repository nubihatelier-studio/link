/**
 * Triángulo de peyote plano — la técnica de los aros triangulares.
 *
 * Medido sobre un gráfico real de la tejedora ("Flat Peyote Triangle Graph"):
 * detectando cada mostacilla, los vecinos de una cualquiera caen siempre a
 * 0°, 60° y 120°, y todos a la misma distancia. O sea que las mostacillas se
 * acomodan en una **retícula triangular pareja** — cada una tocando a seis —
 * y no repartidas a lo largo de cada vuelta, que es lo que las dejaba
 * montadas unas sobre otras.
 *
 * Lo que sí cambia de una zona a otra es **cómo queda parada** cada
 * mostacilla: la pieza se lee como tres sectores, uno por lado, y en cada
 * uno la mostacilla se acuesta a lo largo de ese lado. Por eso un triángulo
 * terminado muestra mostacillas en tres direcciones, y por eso no se puede
 * dibujar con la grilla de filas y columnas del resto de las técnicas.
 *
 * El triángulo apunta hacia abajo, como en los gráficos: la fila 0 es la de
 * arriba y la más larga.
 */

/** Los tres sectores, uno por lado del triángulo. */
export type TriangleSector = 0 | 1 | 2

/** Una mostacilla: su fila (0 es la de arriba) y su lugar dentro de la fila. */
export interface TriangleBead {
  row: number
  index: number
}

export interface TriangleBeadPlacement {
  x: number
  y: number
  /**
   * Hacia dónde corre la fila, en grados; 0 es horizontal, como las del
   * sector de arriba. La mostacilla se dibuja parada cruzada a esto.
   */
  angle: number
  sector: TriangleSector
}

/** Alto de fila de una retícula triangular, con la mostacilla como unidad. */
export const ROW_HEIGHT = Math.sqrt(3) / 2

/** Cuántas mostacillas lleva una fila: la de arriba es la más larga. */
export function beadsInRow(side: number, row: number): number {
  const n = Math.max(0, Math.trunc(side))
  return Math.max(0, n - Math.trunc(row))
}

/** Cuántas mostacillas tiene un triángulo de `side` por lado: 1 + 2 + 3 + … */
export function triangleBeadCount(side: number): number {
  const n = Math.max(0, Math.trunc(side))
  return (n * (n + 1)) / 2
}

/** Todas las mostacillas, de arriba hacia abajo. */
export function triangleBeads(side: number): TriangleBead[] {
  const out: TriangleBead[] = []
  for (let row = 0; row < Math.trunc(side); row++) {
    for (let index = 0; index < beadsInRow(side, row); index++) out.push({ row, index })
  }
  return out
}

/**
 * A qué sector pertenece una mostacilla: al del lado que tiene más cerca,
 * contado **en la retícula** y no por ángulo desde el centro.
 *
 * Para una mostacilla, sus distancias a los tres lados suman siempre lo
 * mismo (`side - 1`), así que el lado más cercano parte la pieza en tres
 * sectores exactamente iguales, con los bordes siguiendo las filas de la
 * retícula. Repartir por ángulo —que fue lo primero que hice— deja los
 * bordes dentados y un sector más grande que los otros dos.
 */
export function triangleSectorOf(bead: TriangleBead, side: number): TriangleSector {
  const n = Math.trunc(side)
  // Arriba, izquierda, derecha.
  const d = [bead.row, bead.index, n - 1 - bead.row - bead.index]
  const menor = Math.min(d[0], d[1], d[2])
  const empatados = ([0, 1, 2] as TriangleSector[]).filter((s) => d[s] === menor)
  if (empatados.length === 1) return empatados[0]
  if (empatados.length === 3) return 0 // el centro exacto de una pieza chica
  // Dos empatados, justo en la costura: se elige el anterior del ciclo, que
  // es la única forma de que girar la pieza un tercio la deje igual.
  const [a, b] = empatados
  return (a + 1) % 3 === b ? a : b
}

function rawPosition(bead: TriangleBead, side: number): { x: number; y: number } {
  const n = beadsInRow(side, bead.row)
  return { x: bead.index - (n - 1) / 2, y: bead.row * ROW_HEIGHT }
}

/** Dónde va una mostacilla y cómo queda parada. */
export function triangleBeadPlacement(bead: TriangleBead, side: number): TriangleBeadPlacement {
  const { x, y } = rawPosition(bead, side)
  const sector = triangleSectorOf(bead, side)
  // `angle` es hacia dónde corre la fila, no hacia dónde apunta la
  // mostacilla: la mostacilla va parada cruzada a su fila, como en peyote,
  // y de eso se encarga quien la dibuja (alta y angosta, girada este
  // ángulo). En el sector de arriba la fila es horizontal y la mostacilla
  // queda vertical.
  return { x, y, angle: sector * 60, sector }
}

/** Ancho y alto de la pieza, en unidades de mostacilla. */
export function triangleBoundsUnits(side: number): { width: number; height: number } {
  const n = Math.max(1, Math.trunc(side))
  return { width: n, height: (n - 1) * ROW_HEIGHT + 1 }
}

/** La clave con que se guarda una mostacilla pintada. */
export function triangleKey(bead: TriangleBead): string {
  return `${bead.row}:${bead.index}`
}

export function parseTriangleKey(key: string): TriangleBead {
  const [row, index] = key.split(':').map(Number)
  return { row, index }
}
