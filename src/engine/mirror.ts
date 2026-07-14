import { cellKey } from './cellKey'
import type { ColorMap } from './types'

export type MirrorMode = 'off' | 'horizontal' | 'vertical'

/**
 * The counterpart cell for a symmetry-assisted stroke, reflected across the
 * grid's center line — 'horizontal' mirrors left-right (a vertical center
 * line, matching the existing FlipHorizontal2 icon convention used for
 * paste), 'vertical' mirrors top-bottom (a horizontal center line).
 */
export function mirroredCell(
  row: number,
  col: number,
  cols: number,
  rows: number,
  mode: MirrorMode,
): { row: number; col: number } {
  if (mode === 'horizontal') return { row, col: cols - 1 - col }
  if (mode === 'vertical') return { row: rows - 1 - row, col }
  return { row, col }
}

export interface Rect {
  r0: number
  c0: number
  r1: number
  c1: number
}

/** Flips the cells within `rect` in place — the selection equivalent of the paste tool's H/V flip. */
export function reflectRegion(cells: ColorMap, rect: Rect, axis: 'horizontal' | 'vertical'): ColorMap {
  const width = rect.c1 - rect.c0 + 1
  const height = rect.r1 - rect.r0 + 1

  const block: (string | undefined)[][] = []
  for (let r = 0; r < height; r++) {
    const row: (string | undefined)[] = []
    for (let c = 0; c < width; c++) row.push(cells[cellKey(rect.r0 + r, rect.c0 + c)])
    block.push(row)
  }

  const next = { ...cells }
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const srcR = axis === 'vertical' ? height - 1 - r : r
      const srcC = axis === 'horizontal' ? width - 1 - c : c
      const hex = block[srcR][srcC]
      const key = cellKey(rect.r0 + r, rect.c0 + c)
      if (hex) next[key] = hex
      else delete next[key]
    }
  }
  return next
}
