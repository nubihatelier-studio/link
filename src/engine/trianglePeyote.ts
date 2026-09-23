/**
 * Triángulo de peyote plano — la técnica de los aros triangulares.
 *
 * Lo confirmó la tejedora, y es lo que decide toda la geometría:
 *
 * - **Cada vuelta lleva las mostacillas que quepan**, no una fija: el lado
 *   se va alargando a medida que la pieza crece, y hay que llenarlo. Por eso
 *   una vuelta lejos del centro lleva muchas más que una cercana.
 * - **Donde se juntan dos lados queda un huequito**, ese rombo blanco que se
 *   ve bajando por la costura en cualquier gráfico de la técnica. Los tres
 *   lados no se encajan entre sí: cada uno es su propio tejido.
 *
 * De ahí el modelo: **tres sectores, uno por lado**, cada uno una tela de
 * peyote con sus filas paralelas a su lado y sus mostacillas paradas
 * cruzadas a la fila. Los tres crecen desde el centro y se juntan en las
 * costuras, donde sobra el espacio que no alcanza para otra mostacilla — el
 * huequito.
 *
 * Esto es lo que ninguna grilla de filas y columnas puede dibujar, y por eso
 * la técnica no se podía hacer con las que ya había.
 */

/** Los tres sectores, uno por lado. */
export type TriangleSector = 0 | 1 | 2

/** Una mostacilla: su sector, a qué vuelta pertenece y su lugar en la fila. */
export interface TriangleBead {
  sector: TriangleSector
  /** 1 es la vuelta más pegada al centro. */
  round: number
  /** 0 … beadsInRound-1, desde un extremo de la fila. */
  index: number
}

export interface TriangleBeadPlacement {
  x: number
  y: number
  /**
   * Hacia dónde corre la fila, en grados. La mostacilla se dibuja parada
   * cruzada a esto, como en cualquier gráfico de peyote.
   */
  angle: number
  sector: TriangleSector
}

/**
 * Distancia entre vueltas, con el ancho de la mostacilla como unidad. Es
 * menor que 1 porque una fila de peyote se encaja en la de al lado en vez de
 * apoyarse encima.
 */
export const ROUND_PITCH = 0.87

/**
 * Cuántas mostacillas caben en un lado, en la vuelta `round`.
 *
 * A una distancia `d` del centro, el lado de un triángulo mide `2·√3·d`. Con
 * `d = round · ROUND_PITCH` y la mostacilla como unidad de ancho, eso da
 * poco más de tres por vuelta. Se redondea hacia abajo: lo que sobra es
 * justamente el huequito de la costura, que no alcanza para otra mostacilla.
 */
export function beadsInRound(round: number): number {
  const k = Math.max(0, Math.trunc(round))
  return k === 0 ? 0 : Math.floor(2 * Math.sqrt(3) * k * ROUND_PITCH)
}

/** Cuántas mostacillas tiene la pieza entera. */
export function triangleBeadCount(rounds: number): number {
  let total = 0
  for (let k = 1; k <= Math.trunc(rounds); k++) total += 3 * beadsInRound(k)
  return total
}

/** Todas las mostacillas, en el orden en que se tejen: vuelta por vuelta, y dentro de cada vuelta lado por lado. */
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
  // En el sector 0 las filas corren horizontales y la pieza crece hacia
  // arriba; los otros dos son lo mismo girado un tercio de vuelta.
  const along = index - (n - 1) / 2
  const out = round * ROUND_PITCH
  const giro = (sector * 120 * Math.PI) / 180
  const x = along * Math.cos(giro) - -out * Math.sin(giro)
  const y = along * Math.sin(giro) + -out * Math.cos(giro)
  return { x, y, angle: sector * 120, sector }
}

/** Ancho y alto de la pieza, en unidades de mostacilla. */
export function triangleBoundsUnits(rounds: number): { width: number; height: number } {
  const pts = triangleBeads(rounds).map(triangleBeadPlacement)
  if (pts.length === 0) return { width: 1, height: 1 }
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { width: Math.max(...xs) - Math.min(...xs) + 1, height: Math.max(...ys) - Math.min(...ys) + 1 }
}

/** La clave con que se guarda una mostacilla pintada. */
export function triangleKey(bead: TriangleBead): string {
  return `${bead.sector}:${bead.round}:${bead.index}`
}

export function parseTriangleKey(key: string): TriangleBead {
  const [sector, round, index] = key.split(':').map(Number)
  return { sector: sector as TriangleSector, round, index }
}
