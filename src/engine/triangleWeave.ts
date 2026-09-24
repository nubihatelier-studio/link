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
