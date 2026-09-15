import { cellKey } from './cellKey'
import { cellPosition, type StaggerPhase } from './geometry'
import type { ColorMap, Technique } from './types'

export type GradientDirection = 'vertical' | 'diagonalDR' | 'diagonalDL'

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

function gradientAxisValue(pos: { x: number; y: number }, direction: GradientDirection): number {
  switch (direction) {
    case 'vertical':
      return pos.y
    case 'diagonalDR':
      return pos.x + pos.y
    case 'diagonalDL':
      return pos.y - pos.x
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
  if (cellsToFill.length === 0 || stops.length === 0) return {}

  const withPos = cellsToFill.map((cell) => ({
    cell,
    pos: cellPosition(technique, cell.row, cell.col, bodyRows, staggerPhase),
  }))
  const axisValues = withPos.map(({ pos }) => gradientAxisValue(pos, direction))
  const min = Math.min(...axisValues)
  const max = Math.max(...axisValues)
  const span = max - min || 1
  const bands = stops.length

  const result: ColorMap = {}
  withPos.forEach(({ cell }, i) => {
    const t = (axisValues[i] - min) / span
    // The last cell sits exactly at t = 1; it belongs to the last band, not one past it.
    const position = Math.min(t * bands, bands - 1e-9) + ditherOffset(cell.row, cell.col) * ditherStrength
    const band = Math.max(0, Math.min(bands - 1, Math.floor(position)))
    result[cellKey(cell.row, cell.col)] = stops[band]
  })
  return result
}
