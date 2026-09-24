import { beadsInRound, triangleKey, type TriangleBead, type TriangleSector } from './trianglePeyote'

/**
 * Un paso del tejido del peyote triangular: las mostacillas que se ensartan
 * de una vez, en el orden en que entran a la aguja.
 */
export interface TriangleWeaveStep {
  beads: TriangleBead[]
  /** La vuelta a la que pertenecen, empezando en 1 (las tres del centro). */
  round: number
  /** Las dos de una esquina, que se toman juntas — ver `buildTriangleWeaveOrder`. */
  isCorner: boolean
}

const SECTORS: TriangleSector[] = [0, 1, 2]

/**
 * En qué orden se teje un peyote triangular, contado por la tejedora:
 *
 * > Primero son las 3 mostacillas del centro. En la segunda pasada se pasan 2
 * > mostacillas en cada esquina, que hacen las esquinas. Al finalizar la
 * > vuelta se pasa la aguja por la última mostacilla que ya está, para
 * > empezar la nueva vuelta desde la esquina, donde otra vez se agarran 2
 * > mostacillas, se hace la esquina, se pasa por una mostacilla de la vuelta
 * > anterior y se pone una mostacilla, se pasa por la que sigue y se vuelve a
 * > agarrar 2 para la esquina.
 *
 * De ahí salen las tres reglas que arma esta función:
 *
 * 1. La vuelta 1 son las tres del centro, ensartadas juntas y cerradas en
 *    aro: un solo paso.
 * 2. En cada esquina van **dos** mostacillas de una vez. La esquina es la
 *    costura entre dos lados: la última mostacilla de un lado y la primera
 *    del siguiente, que son justo las dos que quedan más cerca en la pieza
 *    (ver `trianglePeyote.ts#triangleNeighbourMap`).
 * 3. Entre esquina y esquina va **una** mostacilla por hueco, alternando con
 *    pasar la aguja por una de la vuelta anterior. Esos pasos por lo que ya
 *    está no son mostacillas nuevas, así que no aparecen acá: esta lista es
 *    lo que se ensarta, que es lo que hay que ir contando.
 *
 * Por eso cada vuelta arranca en una esquina y no en el medio de un lado: la
 * vuelta k trae 3 esquinas (6 mostacillas) más un hueco menos que la vuelta
 * por cada lado, 3·(k−2), y suma las 3·k que tiene que tener.
 */
export function buildTriangleWeaveOrder(rounds: number): TriangleWeaveStep[] {
  const pasos: TriangleWeaveStep[] = []
  if (rounds < 1) return pasos

  // Las tres del centro van juntas: se ensartan y se cierran en aro.
  pasos.push({
    beads: SECTORS.map((sector) => ({ sector, round: 1, index: 0 })),
    round: 1,
    isCorner: false,
  })

  for (let round = 2; round <= rounds; round++) {
    const n = beadsInRound(round)
    for (let i = 0; i < SECTORS.length; i++) {
      // La esquina: la última de un lado y la primera del siguiente.
      const anterior = SECTORS[(i + 2) % 3]
      const actual = SECTORS[i]
      pasos.push({
        beads: [
          { sector: anterior, round, index: n - 1 },
          { sector: actual, round, index: 0 },
        ],
        round,
        isCorner: true,
      })
      // El lado: una mostacilla por hueco, entre las de la vuelta anterior.
      for (let index = 1; index <= n - 2; index++) {
        pasos.push({ beads: [{ sector: actual, round, index }], round, isCorner: false })
      }
    }
  }
  return pasos
}

/** Las llaves de lo ensartado, en orden — la misma llave con que se guarda lo pintado. */
export function triangleWeaveKeys(order: TriangleWeaveStep[]): string[] {
  return order.flatMap((paso) => paso.beads.map(triangleKey))
}

/** Una parada del hilo: una mostacilla que se ensarta, o una ya puesta por la que pasa la aguja. */
export interface TriangleThreadStop {
  bead: TriangleBead
  kind: 'new' | 'through'
  /** El paso del orden al que pertenece — para dibujar distinto el tramo que viene ahora. */
  step: number
  round: number
}

/**
 * El camino de verdad del hilo, hasta el paso `uptoIndex` incluido: lo que el
 * modo tejido dibuja en vez de una flecha, igual que en peyote (ver
 * `weaveOrder.ts#peyoteThreadPath`).
 *
 * Entre dos mostacillas nuevas la aguja no salta: pasa por una que ya está,
 * y cuál es no se elige, sale de cómo se traba el tejido.
 *
 * - Dentro de un lado, entre la de índice j y la j+1 va la de índice j de la
 *   **vuelta anterior**: es la única que las toca a las dos. Eso es el "se
 *   pasa por una mostacilla de la vuelta anterior y se pone una".
 * - Las dos de una esquina se toman juntas, así que entre ellas no pasa por
 *   ninguna.
 * - Al cambiar de vuelta, la aguja pasa por la **primera** de la vuelta que
 *   recién termina, que quedó justo en la esquina — "se pasa la aguja por la
 *   última mostacilla que ya está para empezar la nueva vuelta desde la
 *   esquina".
 */
export function triangleThreadPath(order: TriangleWeaveStep[], uptoIndex: number): TriangleThreadStop[] {
  const stops: TriangleThreadStop[] = []
  let previa: { bead: TriangleBead; step: number } | null = null

  for (let i = 0; i <= uptoIndex && i < order.length; i++) {
    const paso = order[i]
    paso.beads.forEach((bead, enElPaso) => {
      const puente = enElPaso > 0 ? null : previa ? beadEntreMedio(previa.bead, bead) : null
      if (puente) stops.push({ bead: puente, kind: 'through', step: i, round: puente.round })
      stops.push({ bead, kind: 'new', step: i, round: paso.round })
      previa = { bead, step: i }
    })
  }
  return stops
}

/**
 * La mostacilla ya puesta por la que pasa la aguja para ir de `desde` a
 * `hasta`, o `null` cuando van una tras otra sin nada en medio (las dos de
 * una esquina, y la salida del aro del centro).
 */
function beadEntreMedio(desde: TriangleBead, hasta: TriangleBead): TriangleBead | null {
  // Dentro de un lado: la de la vuelta anterior, en el hueco entre las dos.
  if (desde.round === hasta.round && desde.sector === hasta.sector && hasta.index === desde.index + 1) {
    return { sector: desde.sector, round: desde.round - 1, index: desde.index }
  }
  // Al cambiar de vuelta: la primera de la vuelta que termina, que está en la esquina.
  if (hasta.round === desde.round + 1 && desde.round >= 2) {
    return { sector: desde.sector, round: desde.round, index: beadsInRound(desde.round) - 1 }
  }
  return null
}
