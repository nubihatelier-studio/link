import type { Cell, Technique } from './types'
import { cellPosition } from './geometry'

/**
 * Weaving traversal order per technique — the sequence in which beads are
 * physically strung, used to drive Weave Mode's bead-by-bead tracker.
 *
 * - Loom: worked row by row, left to right, always the same direction
 *   ("fila por fila en línea recta" — the weft returns underneath, so the
 *   chart-following direction stays constant).
 * - Brick: worked row by row too, left to right, with the per-row offset
 *   only affecting bead position, not the reading direction.
 * - Peyote: worked column by column (columns are the continuous threads in
 *   flat even-count peyote), alternating up/down each column
 *   (boustrophedon), which is the "zigzag" mentioned in the product spec.
 */
export function buildWeaveOrder(technique: Technique, cols: number, rows: number): Cell[] {
  const order: Cell[] = []

  if (technique === 'peyote') {
    for (let col = 0; col < cols; col++) {
      const topToBottom = col % 2 === 0
      for (let i = 0; i < rows; i++) {
        const row = topToBottom ? i : rows - 1 - i
        order.push({ row, col })
      }
    }
    return order
  }

  // loom & brick: row-major, constant left-to-right direction
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      order.push({ row, col })
    }
  }
  return order
}

/** Direction vector (in bead units) from step `index` to `index + 1`, for drawing a "next bead" arrow. */
export function directionAtStep(
  technique: Technique,
  order: Cell[],
  index: number,
): { dx: number; dy: number } | null {
  const next = order[index + 1]
  if (!next) return null
  const current = order[index]
  const p0 = cellPosition(technique, current.row, current.col)
  const p1 = cellPosition(technique, next.row, next.col)
  return { dx: p1.x - p0.x, dy: p1.y - p0.y }
}

/**
 * The "natural" unit of weaving progress for a technique — what a weaver
 * actually thinks of as one pass with the needle. Loom and brick are worked
 * row by row, so that's the grid row. Peyote here is threaded column by
 * column (see `buildWeaveOrder`), so counting by grid row is meaningless —
 * a handful of beads into a wide pattern can already read as "row 3" even
 * though the thread hasn't left the first column. Weave Mode's UI must
 * label progress with this unit, not always "row", or the count looks broken.
 */
export function weaveUnit(technique: Technique): 'row' | 'column' {
  return technique === 'peyote' ? 'column' : 'row'
}

/** Which row or column (whichever is this technique's weave unit) a cell belongs to. */
export function unitIndexOf(technique: Technique, cell: Cell): number {
  return weaveUnit(technique) === 'column' ? cell.col : cell.row
}

/** Index of the first cell belonging to a given row/column (per `weaveUnit`) within the traversal order. */
export function firstIndexOfUnit(technique: Technique, order: Cell[], unit: number): number {
  return order.findIndex((c) => unitIndexOf(technique, c) === unit)
}
