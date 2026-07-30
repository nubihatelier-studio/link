import type { Cell, FringeData, RowShape, Technique } from './types'
import { cellPosition } from './geometry'

/** A fringe bead's step in the traversal order — see `buildWeaveOrder`. */
export interface FringeStep extends Cell {
  isFringe: true
  /** The deepest bead of a fringe column — where the thread turns back up. */
  isTurnBead: boolean
}

/** One step of a weaving traversal: a plain body cell, or a `FringeStep`. */
export type WeaveStep = Cell | FringeStep

export function isFringeStep(step: WeaveStep): step is FringeStep {
  return (step as FringeStep).isFringe === true
}

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
 *
 * When `fringe` is given (brick/loom only, see `engine/fringe.ts`), its
 * beads are appended after the *entire* body traversal, walked column by
 * column, depth-ascending (the bead closest to the body first, the turn
 * bead last) — a weaver finishes the whole body first, since the per-column
 * bead count for row-major techniques is only known once the last body row
 * is done, then adds each column's fringe in one pass: down to the turn
 * bead, then back up (the "back up" is the same thread physically
 * retracing its path, not additional beads, so it isn't a separate step).
 *
 * When `rowShape` is given (a shaped brick body — see `engine/shape.ts`), a
 * row's increase/decrease doesn't change the reading direction, only how
 * much of it exists: each row is still walked left to right, just starting
 * and stopping at that row's own `offset`/`offset + length` instead of the
 * full `0..cols`. A weaver shaping a triangle or rhombus does exactly this —
 * adds or drops beads at a row's edge, but never changes which direction the
 * needle is already moving.
 */
export function buildWeaveOrder(
  technique: Technique,
  cols: number,
  rows: number,
  fringe?: FringeData,
  rowShape?: RowShape[],
): WeaveStep[] {
  const order: WeaveStep[] = []

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

  // loom & brick: row-major, constant left-to-right direction, narrowed to
  // each row's own shape when one is given.
  for (let row = 0; row < rows; row++) {
    const shape = rowShape?.[row]
    const colStart = shape?.offset ?? 0
    const colEnd = shape ? shape.offset + shape.length : cols
    for (let col = colStart; col < colEnd; col++) {
      order.push({ row, col })
    }
  }

  if (fringe) {
    const lastRowShape = rowShape?.[rows - 1]
    for (let col = 0; col < cols; col++) {
      // Same rule as isPaintableCell (engine/fringe.ts): a fringe strand only exists under a column
      // the body's LAST row actually reaches. `fringe.lengths` is expected to already be zero there
      // (see createFringeLengthsForShape), but this stays defensive in case shape and fringe data
      // ever drift apart (e.g. a body reshaped after its fringe was set).
      if (lastRowShape && (col < lastRowShape.offset || col >= lastRowShape.offset + lastRowShape.length)) continue
      const length = fringe.lengths[col] ?? 0
      for (let depth = 0; depth < length; depth++) {
        order.push({
          row: rows + depth,
          col,
          isFringe: true,
          isTurnBead: !!fringe.turnBeads[col] && depth === length - 1,
        })
      }
    }
  }

  return order
}

/**
 * Direction vector (in bead units) from step `index` to `index + 1`, for
 * drawing a "next bead" arrow. Pass `bodyRows` (the pattern's body row
 * count) so a step landing in the fringe zone positions correctly, and
 * `staggerPhase` so the vector matches the pattern's actual physical
 * stagger — see `cellPosition`.
 */
export function directionAtStep(
  technique: Technique,
  order: Cell[],
  index: number,
  bodyRows?: number,
  staggerPhase: 0 | 1 = 0,
): { dx: number; dy: number } | null {
  const next = order[index + 1]
  if (!next) return null
  const current = order[index]
  const p0 = cellPosition(technique, current.row, current.col, bodyRows, staggerPhase)
  const p1 = cellPosition(technique, next.row, next.col, bodyRows, staggerPhase)
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

/**
 * Index of the first fringe bead in the next column after `afterCol` — the
 * fringe-zone counterpart to `firstIndexOfUnit` ("marcar columna de fleco
 * hecha" jumps here instead). Unlike body rows/columns, fringe steps don't
 * have a single, technique-agnostic `unitIndexOf` value to search by (a
 * fringe row number is shared by every column at that same depth), so this
 * searches by `isFringe && col > afterCol` instead. Returns -1 if there's no
 * further fringe column (the last one, or fringe columns are exhausted).
 */
export function firstIndexOfNextFringeColumn(order: WeaveStep[], afterCol: number): number {
  return order.findIndex((step) => isFringeStep(step) && step.col > afterCol)
}

/**
 * A target for the "Ir a" jump selector — either a body row/column (per
 * `weaveUnit`) or a fringe column. Kept as a typed object (rather than the
 * two raw indices `firstIndexOfUnit`/`firstIndexOfNextFringeColumn` each
 * take) so the selector's option-building and index-resolution share one
 * unambiguous shape.
 */
export interface JumpTarget {
  kind: 'body' | 'fringe'
  /** Body row/column index (kind 'body') or fringe column index (kind 'fringe') — both 0-based. */
  index: number
}

/**
 * Resolves a `JumpTarget` to its first step's index in `order` — the single
 * entry point behind the "Ir a" selector, dispatching to whichever of
 * `firstIndexOfUnit` / `firstIndexOfNextFringeColumn` matches `kind`.
 * Returns -1 if the target isn't in `order` (e.g. a fringe column with no
 * beads), same "not found" convention as both underlying functions.
 */
export function jumpTargetToIndex(technique: Technique, order: WeaveStep[], target: JumpTarget): number {
  return target.kind === 'fringe'
    ? firstIndexOfNextFringeColumn(order, target.index - 1)
    : firstIndexOfUnit(technique, order, target.index)
}
