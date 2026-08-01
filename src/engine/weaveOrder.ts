import type { Cell, FringeData, RowShape, Technique } from './types'
import { cellPosition } from './geometry'

export type WeaveDirection = 'ltr' | 'rtl'

/**
 * One instruction in Weave Mode's traversal — almost always a single bead,
 * but can group more than one when the real technique threads several beads
 * in the same motion (peyote's foundation pass, see `buildPeyoteOrder`).
 * `unit` is this technique's weave-unit index for the step: the row for a
 * loom/brick body step, the PASS number for peyote (its passes aren't grid
 * rows — see `buildPeyoteOrder`), or the fringe column for a fringe step.
 * Peyote's foundation is pass 0; every other technique leaves a `grouped`
 * step's unit at 0 too, since it doesn't belong to a single row.
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
  /**
   * True only for the final step — a woven hanging loop's ring, bundled
   * into one `grouped` step the same way peyote's foundation pass is (see
   * `buildWeaveOrder`'s `loopBeadCount` param). Its `cells` use `row: -1`
   * (never a real body/fringe row) purely as a distinct bookkeeping key —
   * a ring isn't addressable by row/col, so these coordinates are never fed
   * to `cellPosition`/the `cells` color map, only counted and (in
   * `wordChart.ts`) matched to the loop's own uniform color.
   */
  isLoop?: true
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
  // 3: peyote walks passes (alternating positions) instead of the drawn
  // zigzag — a saved index points at a different bead entirely.
  peyote: 3,
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
 * Peyote is worked in PASSES, and a pass is not a row of the grid.
 *
 * The needle's real motion is: string one new bead, then pass through the
 * hole of a bead from the previous pass, skipping the one between. So the
 * beads you actually add in a single pass are the alternating positions —
 * every other column — and the beads in between aren't steps at all: they're
 * the previous pass's beads, the ones you thread *through*. They're the
 * reference you look for while weaving, not something you string.
 *
 * The grid draws this staggered: `geometry.ts#cellPosition` puts odd columns
 * half a pitch lower than even ones, so one drawn row `r` actually holds two
 * different passes — the even columns sitting at height `r`, and the odd
 * columns half a bead below them. Beads of one pass are all at the same
 * height and therefore all in the same logical row, even though the chart
 * draws them as a zigzag. Walking the drawn zigzag cell by cell (what this
 * did before) followed the picture instead of the needle.
 *
 * So, after the foundation, each grid row from row 3 on yields two passes:
 * its even columns, then its odd columns. Each pass turns the work at its end
 * (serpentine), continuing the alternation the foundation starts.
 *
 * Unchanged, and deliberately so: the first two rows are still strung
 * together as one grouped foundation pass — a flat strip alternating between
 * the two rows across the width — and directions still alternate. `unit` is
 * the pass number now (foundation = 0), which is what the UI counts and what
 * the word chart groups its lines by. Fringe columns stay column-based (a
 * strand hangs from a column regardless of technique).
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
  order.push({ cells: foundationCells, unit: 0, direction: 'ltr', grouped: true })

  let pass = 0
  for (let row = 2; row < rows; row++) {
    // Even columns first: they sit half a bead higher than the odd ones in the
    // same drawn row (see `cellPosition`), so that's the pass the needle
    // reaches first coming down the work.
    for (const parity of [0, 1]) {
      const columns: number[] = []
      for (let col = parity; col < cols; col += 2) columns.push(col)
      // A one-column pattern has no odd positions at all — skip rather than
      // emit an empty pass, which would leave a gap in the numbering.
      if (columns.length === 0) continue
      pass++
      // The foundation counts as turn 0 (ltr), so pass 1 turns to rtl, pass 2
      // back to ltr, and so on.
      const direction: WeaveDirection = pass % 2 === 1 ? 'rtl' : 'ltr'
      const ordered = direction === 'ltr' ? columns : [...columns].reverse()
      for (const col of ordered) {
        order.push({ cells: [{ row, col }], unit: pass, direction, grouped: false })
      }
    }
  }

  return order
}

/**
 * The beads a peyote pass threads *through* — the previous pass's beads,
 * sitting between the ones this pass adds. Not steps (nothing is strung into
 * them), but the landmark a weaver looks for, so Weave Mode outlines them.
 * Empty for any other technique, and for the foundation pass (there is no
 * previous pass to go through).
 */
export function peyoteThreadThroughCells(order: WeaveOrder, index: number): Cell[] {
  const step = order[index]
  if (!step || step.grouped || step.isFringe || step.isLoop) return []
  const cell = step.cells[0]
  if (!cell || cell.row < 0) return []

  // The pass sitting half a bead above this one, in grid terms: the odd
  // columns of a row are threaded through its own even columns, and the even
  // columns of a row are threaded through the odd columns of the row above.
  // Derived from the geometry rather than from the previous `unit` so it also
  // works for the first real pass, whose predecessor lives inside the grouped
  // foundation step rather than in a pass of its own.
  const parity = cell.col % 2
  const previousRow = parity === 1 ? cell.row : cell.row - 1
  const previousParity = parity === 1 ? 0 : 1
  if (previousRow < 0) return []

  const seen = new Set<string>()
  const cells: Cell[] = []
  for (const other of order) {
    if (other.isFringe || other.isLoop) continue
    for (const c of other.cells) {
      if (c.row !== previousRow || c.col % 2 !== previousParity) continue
      const key = `${c.row},${c.col}`
      if (seen.has(key)) continue
      seen.add(key)
      cells.push(c)
    }
  }
  return cells
}

/** Every cell belonging to the same unit (pass/row) as the step at `index` — what Weave Mode highlights as "the current pass". */
export function cellsInSameUnit(order: WeaveOrder, index: number): Cell[] {
  const step = order[index]
  if (!step || step.isLoop) return []
  return order
    .filter((s) => s.isFringe === step.isFringe && s.grouped === step.grouped && !s.isLoop && s.unit === step.unit)
    .flatMap((s) => s.cells)
}

/**
 * A woven hanging loop is worked last of all, once the body and fringe are
 * both done — its own final step, bundling every ring bead into one
 * `grouped` step the same way peyote's foundation pass bundles its first two
 * rows (see `buildPeyoteOrder`). `loopBeadCount` is 0 for a metal loop or no
 * loop at all, in which case nothing is appended (a metal loop has no beads
 * to weave — see `engine/loop.ts`).
 */
function appendLoopStep(order: WeaveOrder, loopBeadCount: number): WeaveOrder {
  if (loopBeadCount <= 0) return order
  const cells: Cell[] = Array.from({ length: loopBeadCount }, (_, i) => ({ row: -1, col: i }))
  return [...order, { cells, unit: 0, direction: 'ltr', grouped: true, isLoop: true }]
}

export function buildWeaveOrder(
  technique: Technique,
  cols: number,
  rows: number,
  fringe?: FringeData,
  rowShape?: RowShape[],
  loopBeadCount = 0,
): WeaveOrder {
  switch (technique) {
    case 'loom':
      return appendLoopStep(buildLoomOrder(cols, rows, fringe), loopBeadCount)
    case 'brick':
      return appendLoopStep(buildBrickOrder(cols, rows, fringe, rowShape), loopBeadCount)
    case 'peyote':
      return appendLoopStep(buildPeyoteOrder(cols, rows), loopBeadCount)
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
  // `grouped` alone isn't unique to peyote's foundation pass any more — a woven loop's
  // step is grouped too (see `appendLoopStep`) — so this excludes it explicitly rather
  // than relying on the loop always sorting after the one real foundation pass.
  if (target.kind === 'foundation') return order.findIndex((step) => step.grouped && !step.isLoop)
  return target.kind === 'fringe'
    ? order.findIndex((step) => step.isFringe && step.unit === target.index)
    : firstIndexOfUnit(order, target.index)
}
