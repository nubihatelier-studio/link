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
  /** Giro en grados: 0 es acostada horizontal, como las del lado de arriba. */
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

/** El centro de la pieza, en unidades de mostacilla. */
function centre(side: number): { x: number; y: number } {
  return { x: 0, y: ((side - 1) * ROW_HEIGHT) / 3 }
}

/**
 * A qué sector pertenece una mostacilla: al del lado que tiene más cerca.
 * Los tres sectores se reparten la pieza desde el centro, y la frontera cae
 * donde en una pieza tejida se juntan dos lados.
 */
export function triangleSectorOf(bead: TriangleBead, side: number): TriangleSector {
  const { x, y } = rawPosition(bead, side)
  const c = centre(side)
  // 90° es hacia arriba; cada sector se lleva 120° desde ahí.
  const ang = (Math.atan2(y - c.y, x - c.x) * 180) / Math.PI
  const from = (((ang + 90 + 60) % 360) + 360) % 360
  return (Math.floor(from / 120) % 3) as TriangleSector
}

function rawPosition(bead: TriangleBead, side: number): { x: number; y: number } {
  const n = beadsInRow(side, bead.row)
  return { x: bead.index - (n - 1) / 2, y: bead.row * ROW_HEIGHT }
}

/** Dónde va una mostacilla y cómo queda parada. */
export function triangleBeadPlacement(bead: TriangleBead, side: number): TriangleBeadPlacement {
  const { x, y } = rawPosition(bead, side)
  const sector = triangleSectorOf(bead, side)
  // Acostada a lo largo del lado de su sector: arriba horizontal, y los
  // otros dos a 60° de ahí, cada uno hacia su lado.
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
