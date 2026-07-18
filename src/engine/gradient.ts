import { deltaE, hexToLab, type Lab } from '@/lib/color'
import { cellKey } from './cellKey'
import { cellPosition } from './geometry'
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

function lerpLab(a: Lab, b: Lab, t: number): Lab {
  return { l: a.l + (b.l - a.l) * t, a: a.a + (b.a - a.a) * t, b: a.b + (b.b - a.b) * t }
}

function nearestHexInPalette(lab: Lab, palette: string[], labCache: Map<string, Lab>): string {
  let best = palette[0]
  let bestDist = Infinity
  for (const hex of palette) {
    let candidateLab = labCache.get(hex)
    if (!candidateLab) {
      candidateLab = hexToLab(hex)
      labCache.set(hex, candidateLab)
    }
    const d = deltaE(lab, candidateLab)
    if (d < bestDist) {
      bestDist = d
      best = hex
    }
  }
  return best
}

/**
 * Computes the gradient-filled hex for each given cell, quantized to
 * `palette` (typically the pattern's existing colors, plus the two
 * endpoints) with soft dithering at the color-band boundaries. Pure and
 * store-agnostic — the caller decides which cells to fill (current
 * selection, or every paintable cell when nothing is selected) and passes
 * `bodyRows` through to `cellPosition` so the gradient's direction stays
 * geometrically continuous across the body/fringe boundary (same continuity
 * fix as the rest of the renderer).
 */
export function computeGradientCells(
  cellsToFill: GradientCellInput[],
  technique: Technique,
  bodyRows: number,
  startHex: string,
  endHex: string,
  direction: GradientDirection,
  palette: string[],
  ditherStrength = 0.2,
): ColorMap {
  if (cellsToFill.length === 0) return {}

  const uniquePalette = Array.from(new Set([startHex, endHex, ...palette]))
  const startLab = hexToLab(startHex)
  const endLab = hexToLab(endHex)
  const labCache = new Map<string, Lab>()

  const withPos = cellsToFill.map((cell) => ({ cell, pos: cellPosition(technique, cell.row, cell.col, bodyRows) }))
  const axisValues = withPos.map(({ pos }) => gradientAxisValue(pos, direction))
  const min = Math.min(...axisValues)
  const max = Math.max(...axisValues)
  const span = max - min || 1

  const result: ColorMap = {}
  withPos.forEach(({ cell }, i) => {
    let t = (axisValues[i] - min) / span
    t += ditherOffset(cell.row, cell.col) * ditherStrength
    t = Math.max(0, Math.min(1, t))
    const lab = lerpLab(startLab, endLab, t)
    result[cellKey(cell.row, cell.col)] = nearestHexInPalette(lab, uniquePalette, labCache)
  })
  return result
}
