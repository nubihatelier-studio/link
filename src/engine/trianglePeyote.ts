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
 * Con las mostacillas cada dos columnas (ver `triangleBeadPlacement`), este
 * paso es el que hace que los tres lados se junten justo: cada uno abre 60°
 * a cada costado de su bisectriz y entre los tres completan la vuelta. Con
 * menos se encaraman en las puntas; con más se abren huecos.
 *
 * Es también lo que se midió en su plantilla en blanco: las vecinas de cada
 * mostacilla caen a la misma distancia en tres direcciones a 60°.
 */
export const ROUND_PITCH = 1 / Math.sqrt(3)

/**
 * A qué distancia del centro va la primera vuelta, con el ancho de la
 * mostacilla como unidad.
 *
 * Las tres primeras no se tocan entre sí: rodean el triangulito hueco del
 * medio, que es por donde pasa el hilo al empezar, y el hilo se ve entre una
 * y otra. Por eso van un poco más afuera de lo que darían si se tocaran.
 */
export const HOLE_RADIUS = 0.6

/**
 * Cuántas mostacillas lleva un lado en la vuelta `round`.
 *
 * A una distancia d del centro, el lado de un triángulo mide 2·√3·d. Con
 * `d = (round - ½)·ROUND_PITCH` eso da poco más de dos por vuelta, que es lo
 * que se midió en la pieza. La media vuelta de menos es para que la primera
 * sean las tres mostacillas del centro y no más.
 */
/** A qué distancia del centro va una vuelta. */
export function roundDistance(round: number): number {
  // Un paso por vuelta: la nueva mostacilla queda al lado de la vieja y un
  // poco más arriba, no una fila entera encima.
  return HOLE_RADIUS + (Math.max(1, Math.trunc(round)) - 1) * ROUND_PITCH
}

export function beadsInRound(round: number): number {
  const k = Math.max(0, Math.trunc(round))
  if (k === 0) return 0
  // La vuelta k lleva k por lado: 1, 2, 3, 4… — la regla que dio la
  // tejedora y que se está comprobando vuelta por vuelta con ella.
  return k
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

/**
 * Dónde va una mostacilla y hacia dónde corre su fila.
 *
 * El punto peyote, dicho como lo dijo la tejedora: **al lado de cada
 * mostacilla vieja, por la derecha y por la izquierda, va una nueva medio
 * paso más arriba**. De ahí salen las dos cosas que lo definen:
 *
 * - Dentro de una vuelta, las mostacillas van **cada dos columnas**: entre
 *   una y otra queda el lugar donde encajará la vuelta siguiente.
 * - Cada vuelta sube **medio paso**, no uno entero.
 *
 * Es la misma retícula que la app dibuja para peyote —una columna sí y una
 * no, media fila corrida— mirada a lo largo del lado.
 */
export function triangleBeadPlacement(bead: TriangleBead): TriangleBeadPlacement {
  const { sector, round, index } = bead
  const n = beadsInRound(round)
  // Cada dos columnas, centradas en la bisectriz del lado.
  const along = (index - (n - 1) / 2) * 2
  const out = roundDistance(round)
  const giro = (sector * 120 * Math.PI) / 180
  return {
    x: along * Math.cos(giro) + out * Math.sin(giro),
    y: along * Math.sin(giro) - out * Math.cos(giro),
    angle: sector * 120,
    sector,
  }
}

/**
 * Ancho y alto de la pieza, en unidades de mostacilla, sacados de dónde
 * quedaron las mostacillas y no de una fórmula aparte: así el encuadre no se
 * puede desfasar del dibujo.
 *
 * Lleva también `minX`/`minY`, la esquina de arriba a la izquierda: las
 * mostacillas se ubican alrededor del centro (0, 0) y hay coordenadas
 * negativas, así que quien dibuja las corre por ahí para que la pieza parta
 * en el origen del lienzo, como la grilla.
 */
export function triangleBoundsUnits(rounds: number): { width: number; height: number; minX: number; minY: number } {
  const pts = triangleBeads(rounds).map(triangleBeadPlacement)
  if (pts.length === 0) return { width: 1, height: 1, minX: -0.5, minY: -0.5 }
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return {
    width: Math.max(...xs) - minX + 1,
    height: Math.max(...ys) - minY + 1,
    // Media mostacilla más afuera: `minX` es el *centro* de la de más a la
    // izquierda, y el ancho ya cuenta esa mitad de cada lado.
    minX: minX - 0.5,
    minY: minY - 0.5,
  }
}

/**
 * La mostacilla que cae bajo un punto, en unidades de mostacilla, o `null`
 * si el punto cayó en un hueco.
 *
 * Se busca la más cercana en vez de resolverlo con una fórmula: la retícula
 * son tres sectores girados y un punto cerca de una costura pertenece a uno
 * u otro según dónde caiga exactamente. Con unos cientos de mostacillas esto
 * es instantáneo, y no puede desfasarse del dibujo porque pregunta por las
 * mismas posiciones que se dibujan.
 */
export function triangleBeadAt(
  x: number,
  y: number,
  rounds: number,
  maxDistance = 0.6,
): TriangleBead | null {
  let mejor: TriangleBead | null = null
  let mejorDist = maxDistance
  for (const bead of triangleBeads(rounds)) {
    const p = triangleBeadPlacement(bead)
    const d = Math.hypot(p.x - x, p.y - y)
    if (d < mejorDist) {
      mejorDist = d
      mejor = bead
    }
  }
  return mejor
}

/** La clave con que se guarda una mostacilla pintada. */
export function triangleKey(bead: TriangleBead): string {
  return `${bead.sector}:${bead.round}:${bead.index}`
}

export function parseTriangleKey(key: string): TriangleBead {
  const [sector, round, index] = key.split(':').map(Number)
  return { sector: sector as TriangleSector, round, index }
}
