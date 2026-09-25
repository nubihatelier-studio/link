import { cellKey } from './cellKey'
import { cellPosition, type StaggerPhase } from './geometry'
import type { ColorMap, Technique } from './types'

export type GradientDirection = 'vertical' | 'diagonalDR' | 'diagonalDL' | 'fromCenter'

/** Una mostacilla a la que se le va a dar color, ya ubicada — ver `computeGradientFromTargets`. */
export interface GradientTarget {
  /** La llave con que se guarda: fila,columna en la grilla; sector:vuelta:índice en el peyote triangular. */
  key: string
  x: number
  y: number
  /** Dos enteros que varíen a lo ancho de la pieza, para el tramado. En la grilla son la fila y la columna. */
  ditherRow: number
  ditherCol: number
  /**
   * En qué anillo va esta mostacilla, contando desde el medio, si la pieza
   * tiene anillos propios: la vuelta, en el peyote triangular. Lo usa
   * "desde el centro". Sin esto se mide la distancia al medio, que en un
   * triángulo dibuja círculos y corta las vueltas por la mitad —las esquinas
   * de una vuelta quedan más lejos del centro que el medio de sus lados—.
   */
  ring?: number
}

export interface GradientCellInput {
  row: number
  col: number
}

/**
 * 4x4 Bayer ordered-dither matrix, normalized to roughly [-0.5, 0.5) — nudges
 * each cell's gradient position before quantizing to the palette, so the
 * boundary between two adjacent palette colors reads as a soft, stippled
 * transition (a few interleaved beads of each color) instead of one hard
 * straight line. This is the "turquesa→verde→arena" reference look: the
 * continuous gradient still only ever picks real palette colors, dithering
 * just blurs where one band hands off to the next.
 */
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

function ditherOffset(row: number, col: number): number {
  const v = BAYER_4X4[((row % 4) + 4) % 4][((col % 4) + 4) % 4]
  return (v + 0.5) / 16 - 0.5
}

function gradientAxisValue(
  target: GradientTarget,
  direction: GradientDirection,
  center: { x: number; y: number },
): number {
  switch (direction) {
    case 'vertical':
      return target.y
    case 'diagonalDR':
      return target.x + target.y
    case 'diagonalDL':
      return target.y - target.x
    // En anillos desde el medio de la pieza. Es el degradado que le queda
    // natural al peyote triangular, que se teje justamente así: por eso sigue
    // sus vueltas (`ring`) y no la distancia pelada, que dibujaría círculos
    // sobre una pieza que no los tiene.
    case 'fromCenter':
      return target.ring ?? Math.hypot(target.x - center.x, target.y - center.y)
  }
}

/**
 * The color each given cell gets from a gradient that runs through `stops`,
 * in order: the cells are laid out along `direction` and split into one band
 * per stop, with a soft, stippled hand-off where one band meets the next
 * (see `BAYER_4X4`). Pure and store-agnostic — the caller decides which
 * cells to fill (current selection, or every paintable cell when nothing is
 * selected) and passes `bodyRows` through to `cellPosition` so the gradient
 * stays geometrically continuous across the body/fringe boundary.
 *
 * It used to take only a start and an end color, mix them, and snap each
 * bead to whichever palette color sat closest to the mix: only the colors
 * lying "between" the two ends ever appeared, so a black-to-navy gradient
 * over an eight-color palette came out in three. Every stop given here gets
 * its own band, whatever its hue, in the order the weaver chose.
 *
 * `ditherStrength` is in bands: 0.6 lets a boundary bead fall up to 0.3 of a
 * band either side.
 */
export function computeGradientCells(
  cellsToFill: GradientCellInput[],
  technique: Technique,
  bodyRows: number,
  stops: string[],
  direction: GradientDirection,
  ditherStrength = 0.6,
  staggerPhase: StaggerPhase = 0,
): ColorMap {
  return computeGradientFromTargets(
    cellsToFill.map((cell) => {
      const pos = cellPosition(technique, cell.row, cell.col, bodyRows, staggerPhase)
      return { key: cellKey(cell.row, cell.col), x: pos.x, y: pos.y, ditherRow: cell.row, ditherCol: cell.col }
    }),
    stops,
    direction,
    ditherStrength,
  )
}

/**
 * El mismo degradado, sobre mostacillas ya ubicadas y con su llave puesta.
 *
 * Es la versión que no sabe de filas ni columnas, y por eso sirve también
 * para el peyote triangular, que se guarda por sector, vuelta e índice — ver
 * `engine/trianglePeyote.ts`. `computeGradientCells` es esta misma función
 * con las posiciones sacadas de la grilla.
 */
export function computeGradientFromTargets(
  targets: GradientTarget[],
  stops: string[],
  direction: GradientDirection,
  ditherStrength = 0.6,
): ColorMap {
  if (targets.length === 0 || stops.length === 0) return {}

  // El medio de lo que se va a pintar, no el de la pieza entera: así
  // "desde el centro" sale bien también sobre una selección.
  const center = {
    x: targets.reduce((sum, t) => sum + t.x, 0) / targets.length,
    y: targets.reduce((sum, t) => sum + t.y, 0) / targets.length,
  }
  const axisValues = targets.map((t) => gradientAxisValue(t, direction, center))
  const min = Math.min(...axisValues)
  const max = Math.max(...axisValues)
  const span = max - min || 1
  const bands = stops.length

  const result: ColorMap = {}
  targets.forEach((target, i) => {
    const t = (axisValues[i] - min) / span
    // The last cell sits exactly at t = 1; it belongs to the last band, not one past it.
    const position = Math.min(t * bands, bands - 1e-9) + ditherOffset(target.ditherRow, target.ditherCol) * ditherStrength
    const band = Math.max(0, Math.min(bands - 1, Math.floor(position)))
    result[target.key] = stops[band]
  })
  return result
}
