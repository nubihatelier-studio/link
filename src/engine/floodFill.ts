import { cellKey } from './cellKey'
import type { ColorMap } from './types'

/**
 * Classic 4-connected flood fill over the row/col grid — deliberately grid
 * topology, not the technique's visual stagger/offset (peyote/brick shift
 * cells sideways on screen but stay adjacent in row/col terms, which is what
 * "the same contiguous blob of color" means here). Matches by exact color
 * (including "empty", so an uncolored region can be flood-filled too).
 */
export function floodFillCells(
  cells: ColorMap,
  cols: number,
  rows: number,
  startRow: number,
  startCol: number,
  newHex: string | null,
): ColorMap {
  if (startRow < 0 || startCol < 0 || startRow >= rows || startCol >= cols) return cells

  const targetHex = cells[cellKey(startRow, startCol)] ?? null
  if (targetHex === newHex) return cells

  const next = { ...cells }
  const visited = new Set<string>()
  const stack: [number, number][] = [[startRow, startCol]]

  while (stack.length > 0) {
    const [row, col] = stack.pop()!
    if (row < 0 || col < 0 || row >= rows || col >= cols) continue
    const key = cellKey(row, col)
    if (visited.has(key)) continue
    visited.add(key)
    if ((cells[key] ?? null) !== targetHex) continue

    if (newHex) next[key] = newHex
    else delete next[key]

    stack.push([row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1])
  }

  return next
}
