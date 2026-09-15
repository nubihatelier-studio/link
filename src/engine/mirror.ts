import { cellKey } from './cellKey'
import type { ColorMap } from './types'

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
