import type { Cell } from './types'

/** Bresenham line, in grid (row,col) space — used by the "Línea" tool. */
export function lineCells(r0: number, c0: number, r1: number, c1: number): Cell[] {
  const cells: Cell[] = []
  let x0 = c0
  let y0 = r0
  const x1 = c1
  const y1 = r1

  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy

  for (;;) {
    cells.push({ row: y0, col: x0 })
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x0 += sx
    }
    if (e2 <= dx) {
      err += dx
      y0 += sy
    }
  }
  return cells
}
