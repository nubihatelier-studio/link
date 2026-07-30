import type { Cell, FringeData, RowShape, Technique } from './types'
import { cellPosition } from './geometry'

export type WeaveDirection = 'ltr' | 'rtl'

/**
 * One instruction in Weave Mode's traversal — almost always a single bead,
 * but can group more than one when the real technique threads several beads
 * in the same motion (peyote's foundation pass, see `buildPeyoteOrder`).
 * `unit` is this technique's weave-unit index for the step: the row for a
 * body step (loom/brick/peyote all read row-by-row now — see
 * `buildPeyoteOrder`'s doc comment for why peyote moved off column-major),
 * or the fringe column for a fringe step. It's meaningless (left at 0) for
 * a `grouped` step, since that step doesn't belong to a single row.
 */
export interface WeaveStep {
  /** The physical cell(s) this step strings, in stringing order. */
  cells: Cell[]
  unit: number
  /** Which way the needle moves along this step's row — meaningless for fringe/grouped steps. */
  direction: WeaveDirection
  /** True only for a step that bundles more than one bead into a single instruction (peyote's foundation pass). */
  grouped: boolean
  /** True for a fringe strand's steps — see `buildBrickOrder`. */
  isFringe?: true
  /** True when this fringe step's bead is the turn bead (the deepest one, where the thread turns back up). */
  isTurnBead?: true
  /** True only for brick's very first step — the widest row, adjacent to the fringe, that the whole body is built up from. See `buildBrickOrder`. */
  isBaseRow?: true
}

export type WeaveOrder = WeaveStep[]

export function isFringeStep(step: WeaveStep): boolean {
  return step.isFringe === true
}

/** Total individual beads across an order — sums each step's own bead count, since a grouped step can be more than one. */
export function totalBeadCount(order: WeaveOrder): number {
  return order.reduce((sum, step) => sum + step.cells.length, 0)
}

/** Beads strung through step `index` inclusive (0 if `index` < 0) — "beads woven so far" for progress display, since a grouped step advances the count by more than 1 at once. */
export function beadsThrough(order: WeaveOrder, index: number): number {
  let sum = 0
  for (let i = 0; i <= index && i < order.length; i++) sum += order[i].cells.length
  return sum
}

/**
 * Bumped whenever a technique's traversal algorithm changes in a way that
 * reorders existing beads (not just adds new ones) — a saved `currentIndex`
 * from before the bump points at a completely different bead under the new
 * order, so it must be invalidated rather than silently misread (see
 * `weaveStore.ts`/`WeavePage.tsx`). Loom's order has never changed, so its
 * version stays 1 forever — existing loom progress is never invalidated.
 */
export const WEAVE_ORDER_VERSION: Record<Technique, number> = {
  loom: 1,
  brick: 2,
  peyote: 2,
}

/**
 * Loom: worked row by row, always left to right — the weft returns
 * underneath the work, so the chart-following direction never changes
 * (no serpentine, no turning). Unchanged by this round; loom needed no
 * correction — fringe (loom also supports it, see `engine/fringe.ts`) keeps
 * the same simple ascending-column order it always had, not brick's new
 * direction-aware one.
 */
function buildLoomOrder(cols: number, rows: number, fringe?: FringeData): WeaveOrder {
  const order: WeaveOrder = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      order.push({ cells: [{ row, col }], unit: row, direction: 'ltr', grouped: false })
    }
  }
  if (fringe) {
    for (let col = 0; col < cols; col++) {
      const length = fringe.lengths[col] ?? 0
      for (let depth = 0; depth < length; depth++) {
        order.push({
          cells: [{ row: rows + depth, col }],
          unit: col,
          direction: 'ltr',
          grouped: false,
          isFringe: true,
          ...(fringe.turnBeads[col] && depth === length - 1 ? { isTurnBead: true as const } : {}),
        })
      }
    }
  }
  return order
}

/**
 * Brick: real brick stitch is built bottom-up — you start with a full
 * ladder-stitch row (the widest one, exactly where the fringe will
 * eventually hang) and decrease toward the tip as you go, turning the work
 * at the end of every row (serpentine: left-to-right, then right-to-left,
 * alternating). Our data model numbers rows top-down (row 0 = the tip,
 * `rows - 1` = the widest row — see `shape.ts`), so the WEAVE order walks
 * the data backwards from `rows - 1` to `0`; the row numbers shown to a
 * weaver (`ShapePanel`'s "Fila N") don't change, only the order they're
 * visited in. The very first step (the widest row) is flagged `isBaseRow`
 * — it's the row every other row of the body is decreased from, not just
 * "row N" like the rest.
 *
 * A shaped row (see `shape.ts#RowShape`) doesn't change the direction, only
 * how much of it exists — the row is still walked start-to-end within its
 * own `offset`/`offset + length` span.
 *
 * Fringe is added only once the whole body is done, one column completed
 * top-to-bottom (body-side bead first, turn bead last) before moving to the
 * next — never interleaved sideways across columns at the same depth. The
 * order columns are visited in follows the thread's own natural direction
 * as the body finishes: the last body row worked (the tip, row 0) ends at
 * whichever edge its own direction reaches, and picking up fringes starting
 * from the nearest column and sweeping away from that edge is the one that
 * doesn't require the thread to jump back across the whole width first.
 */
function buildBrickOrder(cols: number, rows: number, fringe?: FringeData, rowShape?: RowShape[]): WeaveOrder {
  const order: WeaveOrder = []
  let rowsWalked = 0
  let lastDirection: WeaveDirection = 'ltr'

  for (let row = rows - 1; row >= 0; row--) {
    const shape = rowShape?.[row]
    const colStart = shape?.offset ?? 0
    const colEnd = shape ? shape.offset + shape.length : cols
    const direction: WeaveDirection = rowsWalked % 2 === 0 ? 'ltr' : 'rtl'
    const span = colEnd - colStart
    for (let i = 0; i < span; i++) {
      const col = direction === 'ltr' ? colStart + i : colEnd - 1 - i
      const step: WeaveStep = { cells: [{ row, col }], unit: row, direction, grouped: false }
      if (rowsWalked === 0) step.isBaseRow = true
      order.push(step)
    }
    lastDirection = direction
    rowsWalked++
  }

  if (fringe) {
    const lastRowShape = rowShape?.[rows - 1]
    const fringeColumns: number[] = []
    for (let col = 0; col < cols; col++) {
      // Same rule as isPaintableCell (engine/fringe.ts): a fringe strand only exists under a column
      // the body's LAST row actually reaches. `fringe.lengths` is expected to already be zero there
      // (see createFringeLengthsForShape), but this stays defensive in case shape and fringe data
      // ever drift apart (e.g. a body reshaped after its fringe was set).
      if (lastRowShape && (col < lastRowShape.offset || col >= lastRowShape.offset + lastRowShape.length)) continue
      fringeColumns.push(col)
    }
    // The tip row (the last body row worked) ends at the right edge if it went
    // left-to-right, or the left edge if it went right-to-left — pick up the
    // nearest fringe column from there and sweep away from it.
    const orderedFringeColumns = lastDirection === 'ltr' ? [...fringeColumns].reverse() : fringeColumns

    for (const col of orderedFringeColumns) {
      const length = fringe.lengths[col] ?? 0
      for (let depth = 0; depth < length; depth++) {
        order.push({
          cells: [{ row: rows + depth, col }],
          unit: col,
          direction: 'ltr',
          grouped: false,
          isFringe: true,
          ...(fringe.turnBeads[col] && depth === length - 1 ? { isTurnBead: true as const } : {}),
        })
      }
    }
  }

  return order
}

/**
 * Peyote: real flat even-count peyote strings the first two rows together
 * as a single foundation pass — a flat strip, alternating between the two
 * rows as you move across the width — and only from row 3 on does the
 * zigzag interlock appear: a new bead, skip one from the previous pass,
 * take the next (see the reference diagram). This app doesn't model
 * peyote's dropped-edge-bead simplification (every column has exactly
 * `rows` beads — see `geometry.ts`'s doc comment), so from row 3 on every
 * column still gets exactly one bead per row; the "skip one, take the
 * next" motion changes how a weaver physically picks up each bead, not
 * which cells exist. Every row from row 3 on turns the work at the end
 * (serpentine) — direction alternates continuously, counting the
 * foundation pass itself as the first turn.
 *
 * This reads row-by-row like brick/loom now — the old column-major
 * boustrophedon (`unit` = column) didn't match how the technique is
 * actually worked, and once the foundation pass and serpentine are row
 * concepts, keeping the body "Columna N" would just be stale UI left over
 * from the old model. Fringe columns are still column-based (a strand
 * hangs from a column regardless of technique) — that terminology stays.
 */
function buildPeyoteOrder(cols: number, rows: number): WeaveOrder {
  const order: WeaveOrder = []
  if (rows === 0 || cols === 0) return order

  if (rows === 1) {
    // No second row to pair with — degrades to a single plain row.
    for (let col = 0; col < cols; col++) order.push({ cells: [{ row: 0, col }], unit: 0, direction: 'ltr', grouped: false })
    return order
  }

  const foundationCells: Cell[] = []
  for (let col = 0; col < cols; col++) {
    foundationCells.push({ row: 0, col })
    foundationCells.push({ row: 1, col })
  }
  order.push({ cells: foundationCells, unit: 1, direction: 'ltr', grouped: true })

  for (let row = 2; row < rows; row++) {
    // Continues the foundation pass's own alternation: the foundation counts as turn 0 (ltr),
    // so row 2 is turn 1 (rtl), row 3 is turn 2 (ltr), and so on.
    const turnIndex = row - 1
    const direction: WeaveDirection = turnIndex % 2 === 0 ? 'ltr' : 'rtl'
    for (let i = 0; i < cols; i++) {
      const col = direction === 'ltr' ? i : cols - 1 - i
      order.push({ cells: [{ row, col }], unit: row, direction, grouped: false })
    }
  }

  return order
}

export function buildWeaveOrder(
  technique: Technique,
  cols: number,
  rows: number,
  fringe?: FringeData,
  rowShape?: RowShape[],
): WeaveOrder {
  switch (technique) {
    case 'loom':
      return buildLoomOrder(cols, rows, fringe)
    case 'brick':
      return buildBrickOrder(cols, rows, fringe, rowShape)
    case 'peyote':
      return buildPeyoteOrder(cols, rows)
  }
}

/**
 * Direction vector (in bead units) from the end of step `index` to the
 * start of step `index + 1`, for drawing a "next bead" arrow — uses each
 * step's last/first cell so it works the same whether either step is a
 * single bead or a grouped pass. Pass `bodyRows` (the pattern's body row
 * count) so a step landing in the fringe zone positions correctly, and
 * `staggerPhase` so the vector matches the pattern's actual physical
 * stagger — see `cellPosition`.
 */
export function directionAtStep(
  technique: Technique,
  order: WeaveOrder,
  index: number,
  bodyRows?: number,
  staggerPhase: 0 | 1 = 0,
): { dx: number; dy: number } | null {
  const next = order[index + 1]
  if (!next) return null
  const current = order[index]
  const from = current.cells[current.cells.length - 1]
  const to = next.cells[0]
  const p0 = cellPosition(technique, from.row, from.col, bodyRows, staggerPhase)
  const p1 = cellPosition(technique, to.row, to.col, bodyRows, staggerPhase)
  return { dx: p1.x - p0.x, dy: p1.y - p0.y }
}

/** Index of the first step whose `unit` matches (excluding fringe/grouped steps) — the jump target for a given row. */
export function firstIndexOfUnit(order: WeaveOrder, unit: number): number {
  return order.findIndex((step) => !step.isFringe && !step.grouped && step.unit === unit)
}

/**
 * Index of the first step of the next body row after `afterIndex` — the
 * "mark row done" jump target. Direction-agnostic on purpose: brick now
 * walks rows from the widest to the tip (decreasing), while loom and
 * peyote's rows from 3 on walk increasing, so "next row" can't be assumed
 * to mean `unit + 1` — this just looks for the next step whose `unit`
 * differs from the current one, in whichever direction the order actually
 * goes. Returns -1 once the fringe section is reached (no more body rows)
 * or at the end of the order.
 */
export function firstIndexOfNextBodyRow(order: WeaveOrder, afterIndex: number): number {
  const current = order[afterIndex]
  if (!current) return -1
  for (let i = afterIndex + 1; i < order.length; i++) {
    const step = order[i]
    if (step.isFringe) return -1
    if (step.unit !== current.unit) return i
  }
  return -1
}

/**
 * Index of the first fringe bead in the next column after `afterCol` — the
 * fringe-zone counterpart to `firstIndexOfUnit` ("marcar columna de fleco
 * hecha" jumps here instead). Fringe columns aren't visited in strictly
 * ascending order any more (see `buildBrickOrder`'s "natural direction"
 * doc comment), so this can't just search by `col > afterCol` — it finds
 * `afterCol`'s own fringe run and returns the index right after it ends.
 * Returns -1 if there's no next fringe run (the last one, or fringe
 * columns are exhausted).
 */
export function firstIndexOfNextFringeColumn(order: WeaveOrder, afterCol: number): number {
  const afterColStart = order.findIndex((step) => step.isFringe && step.unit === afterCol)
  if (afterColStart === -1) return -1
  for (let i = afterColStart; i < order.length; i++) {
    if (order[i].isFringe && order[i].unit !== afterCol) return i
  }
  return -1
}

/**
 * A target for the "Ir a" jump selector: a body row, a fringe column, or
 * (peyote only) the foundation pass — its own kind since it isn't a single
 * row and `index` would be meaningless for it.
 */
export interface JumpTarget {
  kind: 'body' | 'fringe' | 'foundation'
  /** Body row index (kind 'body') or fringe column index (kind 'fringe') — both 0-based. Unused for 'foundation'. */
  index: number
}

/**
 * Resolves a `JumpTarget` to its first step's index in `order` — the single
 * entry point behind the "Ir a" selector. Returns -1 if the target isn't in
 * `order` (e.g. a fringe column with no beads), same "not found" convention
 * as the underlying searches.
 */
export function jumpTargetToIndex(order: WeaveOrder, target: JumpTarget): number {
  if (target.kind === 'foundation') return order.findIndex((step) => step.grouped)
  return target.kind === 'fringe'
    ? order.findIndex((step) => step.isFringe && step.unit === target.index)
    : firstIndexOfUnit(order, target.index)
}
