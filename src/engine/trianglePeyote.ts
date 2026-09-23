/**
 * Triángulo de peyote plano — la técnica de los aros triangulares.
 *
 * Las proporciones están **medidas sobre una pieza terminada** de la
 * tejedora, no sacadas de los diagramas paso a paso: en su aro, el lado
 * tiene unas 17 mostacillas y hay unas 8 filas desde el borde hasta el
 * centro. De ahí sale todo lo demás.
 *
 * Eso es importante y cuesta un poco creerlo: **el diagrama de enseñanza y
 * la pieza real no coinciden**. Los diagramas (los que van paso a paso
 * mostrando el hilo) dibujan una mostacilla más por lado en cada vuelta y
 * dejan las vueltas bien separadas, porque si las dibujaran encajadas no se
 * entendería el recorrido. En la pieza de verdad cada vuelta suma unas dos
 * por lado: con una sola el triángulo no alcanza a cerrarse y la pieza se
 * enrosca en vez de quedar plana.
 *
 * La pieza se lee como **tres sectores, uno por lado**. En cada uno las
 * filas corren paralelas a su lado y la mostacilla va parada cruzada a la
 * fila, como en cualquier gráfico de peyote; las costuras van de cada punta
 * al centro. En el mismo centro queda un huequito triangular, el que dejan
 * las tres mostacillas con que se parte.
 */

/** Los tres sectores, uno por lado. */
export type TriangleSector = 0 | 1 | 2

/** Una mostacilla: su sector, su vuelta y su lugar en la fila. */
export interface TriangleBead {
  sector: TriangleSector
  /** 1 es la vuelta del centro, la de las tres primeras mostacillas. */
  round: number
  index: number
}

export interface TriangleBeadPlacement {
  x: number
  y: number
  /**
   * Hacia dónde corre la fila, en grados. La mostacilla se dibuja parada
   * cruzada a esto.
   */
  angle: number
  sector: TriangleSector
}

/**
 * Distancia entre vueltas, con el ancho de la mostacilla como unidad.
 *
 * Medida en su aro: 8 filas para cubrir del borde al centro, y en un
 * triángulo de lado 17 esa distancia es 17/(2·√3) ≈ 4,9 mostacillas. Da 0,61
 * — menos de una mostacilla, porque en peyote cada fila se encaja en la
 * anterior en vez de apoyarse encima.
 */
export const ROUND_PITCH = 0.61

/**
 * Cuántas mostacillas lleva un lado en la vuelta `round`.
 *
 * A una distancia d del centro, el lado de un triángulo mide 2·√3·d. Con
 * `d = (round - ½)·ROUND_PITCH` eso da poco más de dos por vuelta, que es lo
 * que se midió en la pieza. La media vuelta de menos es para que la primera
 * sean las tres mostacillas del centro y no más.
 */
export function beadsInRound(round: number): number {
  const k = Math.max(0, Math.trunc(round))
  if (k === 0) return 0
  return Math.max(1, Math.round(2 * Math.sqrt(3) * (k - 0.5) * ROUND_PITCH))
}

/** Cuántas mostacillas tiene la pieza entera. */
export function triangleBeadCount(rounds: number): number {
  let total = 0
  for (let k = 1; k <= Math.trunc(rounds); k++) total += 3 * beadsInRound(k)
  return total
}

/** Cuántas mostacillas tiene el lado de afuera de una pieza de `rounds` vueltas. */
export function beadsPerSide(rounds: number): number {
  return beadsInRound(rounds)
}

/** Todas las mostacillas, en el orden en que se tejen: vuelta por vuelta desde el centro. */
export function triangleBeads(rounds: number): TriangleBead[] {
  const out: TriangleBead[] = []
  for (let round = 1; round <= Math.trunc(rounds); round++) {
    const n = beadsInRound(round)
    for (const sector of [0, 1, 2] as TriangleSector[]) {
      for (let index = 0; index < n; index++) out.push({ sector, round, index })
    }
  }
  return out
}

/** Dónde va una mostacilla y hacia dónde corre su fila. */
export function triangleBeadPlacement(bead: TriangleBead): TriangleBeadPlacement {
  const { sector, round, index } = bead
  const n = beadsInRound(round)
  const along = index - (n - 1) / 2
  const out = (round - 0.5) * ROUND_PITCH
  const giro = (sector * 120 * Math.PI) / 180
  return {
    x: along * Math.cos(giro) + out * Math.sin(giro),
    y: along * Math.sin(giro) - out * Math.cos(giro),
    angle: sector * 120,
    sector,
  }
}

/** Ancho y alto de la pieza, en unidades de mostacilla. */
export function triangleBoundsUnits(rounds: number): { width: number; height: number } {
  const n = Math.max(1, Math.trunc(rounds))
  const lado = beadsInRound(n) + 1
  return { width: lado, height: lado * (Math.sqrt(3) / 2) }
}

/** La clave con que se guarda una mostacilla pintada. */
export function triangleKey(bead: TriangleBead): string {
  return `${bead.sector}:${bead.round}:${bead.index}`
}

export function parseTriangleKey(key: string): TriangleBead {
  const [sector, round, index] = key.split(':').map(Number)
  return { sector: sector as TriangleSector, round, index }
}
