import type { jsPDF as JsPDF } from 'jspdf'
import type { ColorMap } from '@/engine/types'
import { triangleBeadPlacement, triangleBeads, triangleBoundsUnits, triangleKey } from '@/engine/trianglePeyote'
import { beadMetrics, contrastTextColor } from './beadStyle'

/** Igual que en el lienzo del editor: la mostacilla es apenas más baja que ancha. */
const BEAD_HEIGHT = 0.92
/** Cuánto se estira la tangente de un cuarto de círculo para dibujarlo con una curva de Bézier. */
const KAPPA = 0.5523

/**
 * Traza una mostacilla girada —un rectángulo de esquinas redondeadas— como un
 * camino cerrado, en milímetros de la hoja.
 *
 * Va por `doc.lines` y no por `doc.roundedRect` porque ese dibuja siempre
 * derecho, y acá cada sector del triángulo va girado 0°, 120° o 240°. Se
 * calculan los puntos ya girados en vez de girar la hoja entera (la matriz de
 * transformación de jsPDF trabaja con el eje Y al revés que el resto del
 * dibujo, y mezclar los dos sistemas es pedir un error silencioso).
 */
export type BeadPathSegment = [number, number] | [number, number, number, number, number, number]

export interface BeadPath {
  /** Dónde se apoya el lápiz, en milímetros de la hoja. */
  start: [number, number]
  /** Saltos desde donde quedó el lápiz: dos números una recta, seis una curva. */
  segments: BeadPathSegment[]
}

/**
 * El contorno de una mostacilla girada —un rectángulo de esquinas
 * redondeadas— como saltos desde donde quedó el lápiz, que es como los pide
 * `doc.lines`.
 *
 * Se calculan los puntos ya girados en vez de girar la hoja entera: la matriz
 * de transformación de jsPDF trabaja con el eje Y al revés que el resto del
 * dibujo, y mezclar los dos sistemas es pedir un error silencioso.
 */
export function rotatedBeadPath(
  cx: number,
  cy: number,
  w: number,
  h: number,
  r: number,
  angleDeg: number,
): BeadPath {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const radio = Math.min(r, w / 2, h / 2)
  const x0 = -w / 2
  const y0 = -h / 2
  const x1 = w / 2
  const y1 = h / 2
  const k = radio * KAPPA
  /** Un punto local, sin girar, a su lugar en la hoja. */
  const at = ([x, y]: [number, number]): [number, number] => [cx + x * cos - y * sin, cy + x * sin + y * cos]

  /** Las ocho esquinas del contorno: recta de par a par, curva de impar a par. */
  const esquinas: [number, number][] = [
    [x0 + radio, y0],
    [x1 - radio, y0],
    [x1, y0 + radio],
    [x1, y1 - radio],
    [x1 - radio, y1],
    [x0 + radio, y1],
    [x0, y1 - radio],
    [x0, y0 + radio],
  ]
  /** Los dos tiradores de cada curva, uno por esquina redondeada. */
  const tiradores: [[number, number], [number, number]][] = [
    [
      [x1 - radio + k, y0],
      [x1, y0 + radio - k],
    ],
    [
      [x1, y1 - radio + k],
      [x1 - radio + k, y1],
    ],
    [
      [x0 + radio - k, y1],
      [x0, y1 - radio + k],
    ],
    [
      [x0, y0 + radio - k],
      [x0 + radio - k, y0],
    ],
  ]

  const start = at(esquinas[0])
  let lapiz = start
  const segments: BeadPathSegment[] = []
  const salto = (destino: [number, number]): [number, number] => {
    const d: [number, number] = [destino[0] - lapiz[0], destino[1] - lapiz[1]]
    lapiz = destino
    return d
  }
  for (let i = 0; i < 4; i++) {
    segments.push(salto(at(esquinas[i * 2 + 1])))
    const [c1, c2] = tiradores[i]
    const p1 = at(c1)
    const p2 = at(c2)
    const fin = at(esquinas[(i * 2 + 2) % 8])
    segments.push([
      p1[0] - lapiz[0],
      p1[1] - lapiz[1],
      p2[0] - lapiz[0],
      p2[1] - lapiz[1],
      fin[0] - lapiz[0],
      fin[1] - lapiz[1],
    ])
    lapiz = fin
  }
  return { start, segments }
}

/** Dibuja ese contorno en la hoja: `S` sólo el borde, `FD` relleno y borde. */
export function rotatedBead(
  doc: JsPDF,
  cx: number,
  cy: number,
  w: number,
  h: number,
  r: number,
  angleDeg: number,
  style: 'S' | 'FD',
): void {
  const { start, segments } = rotatedBeadPath(cx, cy, w, h, r, angleDeg)
  doc.lines(segments, start[0], start[1], [1, 1], style, true)
}

export interface TriangleChartOpts {
  rounds: number
  /** Hacia dónde mira la punta — ver `engine/types.ts#PatternConfig.triangleUp`. */
  pointingUp: boolean
  cells: ColorMap
  letterForHex: Map<string, string>
  showLetters: boolean
  letterFontSize: number
  /** Milímetros por unidad de mostacilla. */
  cellMm: number
  originX: number
  originY: number
}

/**
 * El gráfico del peyote triangular en la hoja.
 *
 * No lleva regla numerada como la grilla: acá no hay filas ni columnas que
 * contar, y numerar las vueltas alrededor del centro ensucia más de lo que
 * ayuda. Lo que sí lleva, igual que el resto, es la letra del color dentro de
 * cada mostacilla, para que el gráfico se lea impreso en blanco y negro.
 */
export function drawTriangleChart(doc: JsPDF, o: TriangleChartOpts): void {
  const { minX, minY } = triangleBoundsUnits(o.rounds, o.pointingUp)
  const m = beadMetrics(o.cellMm, o.cellMm * BEAD_HEIGHT)
  doc.setLineWidth(0.05)
  for (const bead of triangleBeads(o.rounds)) {
    const { x, y, angle } = triangleBeadPlacement(bead, o.pointingUp)
    const cx = o.originX + (x - minX) * o.cellMm
    const cy = o.originY + (y - minY) * o.cellMm
    const hex = o.cells[triangleKey(bead)]
    doc.setDrawColor(200)
    if (hex) {
      doc.setFillColor(hex)
      rotatedBead(doc, cx, cy, m.width, m.height, m.radius, angle, 'FD')
      if (o.showLetters) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(o.letterFontSize)
        doc.setTextColor(contrastTextColor(hex))
        // La letra va derecha aunque la mostacilla esté girada: se lee, no se decora.
        doc.text(o.letterForHex.get(hex) ?? '?', cx, cy, { align: 'center', baseline: 'middle' })
      }
    } else {
      rotatedBead(doc, cx, cy, m.width, m.height, m.radius, angle, 'S')
    }
  }
  doc.setTextColor(0)
}
