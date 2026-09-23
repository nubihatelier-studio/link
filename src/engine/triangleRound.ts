/**
 * Triángulo tejido en vueltas — la técnica de los aros triangulares.
 *
 * Se empieza con 3 mostacillas en un anillo y cada vuelta rodea a la
 * anterior: la vuelta k lleva k mostacillas por lado, 3k en total (3, 6, 9,
 * 12…). Crece del centro hacia afuera, no de arriba hacia abajo.
 *
 * Lo que la hace distinta de todo lo que había en la app: **cada mostacilla
 * queda acostada a lo largo del lado en que va**, así que una pieza tiene
 * mostacillas en tres direcciones a la vez. El resto de las técnicas
 * (peyote, brick, loom) son una grilla de filas y columnas con todas las
 * mostacillas acostadas igual, y por eso esto no se podía dibujar torciendo
 * una de ellas.
 *
 * Como todo gráfico, es una idealización: acá el triángulo es perfecto y las
 * mostacillas de un lado quedan repartidas parejo. En la mano, la tensión
 * del hilo y el grosor real las acomodan un poco distinto — igual que el
 * gráfico de peyote tampoco dibuja la curvatura de una pulsera.
 */

/**
 * Cuánto crece cada vuelta. Dos lecturas de la misma técnica, y no es un
 * detalle: decide cuántas mostacillas lleva la pieza y qué forma tiene cada
 * una en el gráfico.
 *
 * - `dibujo`: una mostacilla más por lado en cada vuelta (3, 6, 9, 12…), que
 *   es lo que muestran los diagramas paso a paso. Cuadra con los dibujos,
 *   pero deja cada mostacilla ocupando un tramo largo y angosto: para que el
 *   triángulo sea perfecto, el lado crece mucho más rápido que el alto.
 * - `plano`: las que quepan de verdad, contando que una mostacilla es casi
 *   cuadrada. El lado de la vuelta k mide 2√3·k, así que lleva unas 3,46·k
 *   mostacillas. Es lo que tiene que pasar para que la pieza quede plana y
 *   las mostacillas se vean cuadradas, como en una pieza terminada.
 */
export type TriangleGrowth = 'dibujo' | 'plano'

/** Cuántas mostacillas lleva un lado de la vuelta `round`. */
export function beadsPerSide(round: number, growth: TriangleGrowth = 'dibujo'): number {
  const k = Math.max(0, Math.trunc(round))
  if (k === 0) return 0
  return growth === 'plano' ? Math.max(1, Math.round(2 * Math.sqrt(3) * k)) : k
}

/** Los tres lados de una vuelta, en el orden en que se tejen. */
export type TriangleSide = 0 | 1 | 2

/** Una mostacilla: en qué vuelta va, en qué lado de esa vuelta, y en qué lugar del lado. */
export interface TriangleBead {
  /** 1 es el anillo del centro. */
  round: number
  side: TriangleSide
  /** 0 … round-1, desde el comienzo del lado. */
  index: number
}

/** Dónde queda una mostacilla y cómo queda parada, en unidades de mostacilla. */
export interface TriangleBeadPlacement {
  x: number
  y: number
  /** Giro en grados: 0 es acostada horizontal, como las del lado de abajo. */
  angle: number
}

/** Cuántas mostacillas tiene una pieza de `rounds` vueltas. */
export function triangleBeadCount(rounds: number, growth: TriangleGrowth = 'dibujo'): number {
  let total = 0
  for (let k = 1; k <= Math.trunc(rounds); k++) total += roundBeadCount(k, growth)
  return total
}

/** Cuántas mostacillas lleva una vuelta suelta: sus tres lados. */
export function roundBeadCount(round: number, growth: TriangleGrowth = 'dibujo'): number {
  return 3 * beadsPerSide(round, growth)
}

/**
 * Las esquinas de la vuelta `round`, en unidades de mostacilla, con el
 * triángulo apuntando hacia arriba y centrado en (0,0). La distancia del
 * centro a cada lado crece una mostacilla por vuelta.
 */
function corners(round: number): [number, number][] {
  const r = round // apotema
  const s = Math.sqrt(3) * r
  return [
    [0, -2 * r], // arriba
    [-s, r], // abajo izquierda
    [s, r], // abajo derecha
  ]
}

/**
 * Los lados de una vuelta, como pares de esquinas y en el orden en que se
 * tejen: izquierdo (sube), derecho (baja) y de abajo (vuelve).
 */
const SIDE_CORNERS: [number, number][] = [
  [1, 0], // izquierdo: de abajo-izquierda a arriba
  [0, 2], // derecho: de arriba a abajo-derecha
  [2, 1], // abajo: de derecha a izquierda
]

/** Dónde va una mostacilla y cómo queda parada. */
export function triangleBeadPlacement(bead: TriangleBead, growth: TriangleGrowth = 'dibujo'): TriangleBeadPlacement {
  const { round, side, index } = bead
  const porLado = beadsPerSide(round, growth)
  const pts = corners(round)
  const [from, to] = SIDE_CORNERS[side]
  const [x0, y0] = pts[from]
  const [x1, y1] = pts[to]
  // Repartidas parejo a lo largo del lado, cada una en el centro de su tramo.
  const t = (index + 0.5) / porLado
  return {
    x: x0 + (x1 - x0) * t,
    y: y0 + (y1 - y0) * t,
    angle: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI,
  }
}

/**
 * Todas las mostacillas de una pieza, en el orden en que se tejen: vuelta por
 * vuelta desde el centro, y dentro de cada vuelta lado por lado.
 */
export function triangleBeads(rounds: number, growth: TriangleGrowth = 'dibujo'): TriangleBead[] {
  const out: TriangleBead[] = []
  for (let round = 1; round <= Math.trunc(rounds); round++) {
    const porLado = beadsPerSide(round, growth)
    for (const side of [0, 1, 2] as TriangleSide[]) {
      for (let index = 0; index < porLado; index++) out.push({ round, side, index })
    }
  }
  return out
}

/** La clave con que se guarda una mostacilla pintada. */
export function triangleKey(bead: TriangleBead): string {
  return `${bead.round}:${bead.side}:${bead.index}`
}

export function parseTriangleKey(key: string): TriangleBead {
  const [round, side, index] = key.split(':').map(Number)
  return { round, side: side as TriangleSide, index }
}

/** Medio ancho y medio alto de la pieza, en unidades de mostacilla. */
export function triangleBoundsUnits(rounds: number): { width: number; height: number } {
  const n = Math.max(1, Math.trunc(rounds))
  return { width: 2 * Math.sqrt(3) * n, height: 3 * n }
}
