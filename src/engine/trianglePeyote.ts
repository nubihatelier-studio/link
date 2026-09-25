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
 * Alto de la mostacilla, en anchos: apenas menor que el ancho, como una
 * Delica de pie. Lo usan el lienzo, el PDF y las imágenes para dibujarla, y
 * `triangleBoundsUnits` para saber cuánto sobresale una girada.
 */
export const BEAD_HEIGHT_UNITS = 0.92

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

/**
 * Hasta dónde llega el deslizador de vueltas, al crear la pieza y en "Forma
 * del triángulo" — más allá de esto ya no es un aro.
 */
export const MAX_TRIANGLE_ROUNDS = 30

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
export function triangleBeadPlacement(bead: TriangleBead, pointingUp = false): TriangleBeadPlacement {
  const { sector, round, index } = bead
  const n = beadsInRound(round)
  // Cada dos columnas, centradas en la bisectriz del lado.
  const along = (index - (n - 1) / 2) * 2
  const out = roundDistance(round)
  // Con la punta hacia arriba la pieza va media vuelta girada. Es un giro, no
  // un espejo: el tejido es el mismo, colgado del otro lado. Por eso basta con
  // sumarle 180° y todo lo demás —vecinas, huecos, costuras— queda igual.
  const media = pointingUp ? 180 : 0
  const giro = ((sector * 120 + media) * Math.PI) / 180
  return {
    x: along * Math.cos(giro) + out * Math.sin(giro),
    y: along * Math.sin(giro) - out * Math.cos(giro),
    angle: (sector * 120 + media) % 360,
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
export function triangleBoundsUnits(
  rounds: number,
  pointingUp = false,
): { width: number; height: number; minX: number; minY: number } {
  if (rounds < 1) return { width: 1, height: 1, minX: -0.5, minY: -0.5 }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const bead of triangleBeads(rounds)) {
    const { x, y, angle } = triangleBeadPlacement(bead, pointingUp)
    const rad = (angle * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    // Las cuatro esquinas de la mostacilla, ya giradas. Antes se sumaba media
    // unidad a cada lado, como si todas estuvieran derechas: en las esquinas
    // del triángulo, donde van giradas 120° y 240°, eso dejaba afuera un
    // pedazo y la pieza salía más chica de lo que es. Con las esquinas de
    // verdad la razón entre ancho y alto da **2/√3 exacto**, que es lo que
    // tiene que dar: los tres lados son iguales.
    for (const [dx, dy] of ESQUINAS_DE_LA_MOSTACILLA) {
      const px = x + dx * cos - dy * sin
      const py = y + dx * sin + dy * cos
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (py < minY) minY = py
      if (py > maxY) maxY = py
    }
  }
  return { width: maxX - minX, height: maxY - minY, minX, minY }
}

/** Las cuatro esquinas de una mostacilla sin girar, en unidades — ver `BEAD_HEIGHT_UNITS`. */
const ESQUINAS_DE_LA_MOSTACILLA: [number, number][] = [
  [-0.5, -BEAD_HEIGHT_UNITS / 2],
  [0.5, -BEAD_HEIGHT_UNITS / 2],
  [0.5, BEAD_HEIGHT_UNITS / 2],
  [-0.5, BEAD_HEIGHT_UNITS / 2],
]

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
  pointingUp = false,
  maxDistance = 0.6,
): TriangleBead | null {
  let mejor: TriangleBead | null = null
  let mejorDist = maxDistance
  for (const bead of triangleBeads(rounds)) {
    const p = triangleBeadPlacement(bead, pointingUp)
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

/**
 * Qué mostacillas siguen a cuál, por su llave: con quiénes se traba cada una
 * al tejer. Se arma una vez por tamaño de pieza y es lo que sigue el balde de
 * pintura (ver `engine/floodFill.ts`).
 *
 * Se sigue el orden del tejido, no la distancia pelada, por la misma razón
 * que el balde de la grilla sigue filas y columnas y no el calce visual de
 * las mostacillas:
 *
 * - **Dentro de una vuelta**, las dos que van antes y después en el hilo. En
 *   la costura de dos sectores eso es la última de uno con la primera del
 *   siguiente —los tres sub-triángulos son un solo tejido, así que una vuelta
 *   da la vuelta entera.
 * - **Hacia afuera**, las dos de la vuelta siguiente en las que ésta se
 *   encaja; y hacia adentro, las que se encajan en ella.
 *
 * Quedan fuera a propósito las de dos vueltas más allá, que en el tejido real
 * se rozan por el hueco que dejan las del medio. Si contaran, una vuelta
 * entera de otro color no frenaría el balde —se escaparía por esos roces— y
 * al pintar un contorno y rellenar adentro se desbordaría toda la pieza.
 *
 * Los vecinos de afuera se buscan por cercanía en vez de con una fórmula de
 * índices: es la misma cuenta con la que se dibuja, así que no se puede
 * desfasar del dibujo ni en las costuras, que es justo donde una fórmula se
 * equivoca.
 */
export function triangleNeighbourMap(rounds: number): Map<string, string[]> {
  const porVuelta = new Map<number, { key: string; x: number; y: number }[]>()
  for (const bead of triangleBeads(rounds)) {
    const p = triangleBeadPlacement(bead)
    const lista = porVuelta.get(bead.round)
    const puesta = { key: triangleKey(bead), x: p.x, y: p.y }
    if (lista) lista.push(puesta)
    else porVuelta.set(bead.round, [puesta])
  }

  const vecinas = new Map<string, Set<string>>()
  const unir = (a: string, b: string) => {
    if (a === b) return
    const va = vecinas.get(a)
    if (va) va.add(b)
    else vecinas.set(a, new Set([b]))
    const vb = vecinas.get(b)
    if (vb) vb.add(a)
    else vecinas.set(b, new Set([a]))
  }

  /** Las `cuantas` más cercanas a `desde` dentro de `entre`. */
  const masCercanas = (
    desde: { x: number; y: number },
    entre: { key: string; x: number; y: number }[],
    cuantas: number,
  ) =>
    entre
      .map((otra) => ({ key: otra.key, d: Math.hypot(otra.x - desde.x, otra.y - desde.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, cuantas)

  for (let round = 1; round <= rounds; round++) {
    const esta = porVuelta.get(round) ?? []
    const siguiente = porVuelta.get(round + 1) ?? []
    for (const bead of esta) {
      // Vacía la vuelta 1, que son tres y cada una toca a las otras dos.
      vecinas.set(bead.key, vecinas.get(bead.key) ?? new Set())
      for (const vecina of masCercanas(bead, esta.filter((o) => o.key !== bead.key), 2)) unir(bead.key, vecina.key)
      for (const vecina of masCercanas(bead, siguiente, 2)) unir(bead.key, vecina.key)
    }
  }

  return new Map([...vecinas].map(([key, set]) => [key, [...set]]))
}
