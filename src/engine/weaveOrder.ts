import type { Cell, FringeData, RowShape, Technique } from './types'
import { cellPosition, dropOf, type StaggerPhase } from './geometry'

export type WeaveDirection = 'ltr' | 'rtl'

/**
 * One instruction in Weave Mode's traversal — almost always a single bead,
 * but can group more than one when the real technique threads several beads
 * in the same motion (a woven loop's ring, see `appendLoopStep`).
 * `unit` is this technique's weave-unit index for the step: the row for a
 * loom/brick body step, the PASS number for peyote (its passes aren't grid
 * rows — see `buildPeyoteOrder`), or the fringe column for a fringe step.
 * Peyote's foundation is pass 0. A `grouped` step's unit is 0: it doesn't
 * belong to a single row.
 */
export interface WeaveStep {
  /** The physical cell(s) this step strings, in stringing order. */
  cells: Cell[]
  unit: number
  /** Which way the needle moves along this step's row — meaningless for fringe/grouped steps. */
  direction: WeaveDirection
  /** True only for a step that bundles more than one bead into a single instruction (a woven loop's ring). */
  grouped: boolean
  /** True for a fringe strand's steps — see `buildBrickOrder`. */
  isFringe?: true
  /** True when this fringe step's bead is the turn bead (the deepest one, where the thread turns back up). */
  isTurnBead?: true
  /** True on brick's first row (every step of it) — the row the whole body is built from. See `buildBrickOrder`. */
  isBaseRow?: true
  /**
   * True only for the final step — a woven hanging loop's ring, bundled
   * into one `grouped` step (see
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
  // El peyote triangular todavía no tiene modo tejido: cuando lo tenga, parte
  // en 1 porque no hay progreso guardado que invalidar.
  triangle: 1,
  // 3: el cuerpo se teje de arriba hacia abajo. Antes partía por la fila más
  //    ancha y subía hasta la punta, así que un índice guardado apunta a otra
  //    mostacilla.
  brick: 3,
  // 3: peyote walks passes (alternating positions) instead of the drawn zigzag.
  // 4: the foundation is the first drawn row alone, not the first two.
  // 5: the foundation advances bead by bead, and the passes start on the
  //    rightmost column's side. Each time, a saved index points at another bead.
  peyote: 5,
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
 * Brick: the body is woven from the top down — the first row is the ladder
 * row every other row hangs from, and each row after it is added below the
 * previous one, turning the work at the end of every row (serpentine:
 * left-to-right, then right-to-left, alternating). Our data model numbers
 * rows top-down (row 0 = the first row, `rows - 1` = the last — see
 * `shape.ts`), so the weave order simply follows the row numbers. The very
 * first step is flagged `isBaseRow`: it's the row the rest of the body is
 * built from, not just "row 1" like the rest.
 *
 * A shaped row (see `shape.ts#RowShape`) doesn't change the direction, only
 * how much of it exists — the row is still walked start-to-end within its
 * own `offset`/`offset + length` span.
 *
 * Fringe is added only once the whole body is done, one column completed
 * top-to-bottom (body-side bead first, turn bead last) before moving to the
 * next — never interleaved sideways across columns at the same depth. The
 * order columns are visited in follows the thread's own natural direction as
 * the body finishes: the last body row worked is the one the fringe hangs
 * from, and it ends at whichever edge its own direction reaches — picking up
 * fringes from the nearest column and sweeping away from that edge is the one
 * that doesn't make the thread jump back across the whole width first.
 */
function buildBrickOrder(cols: number, rows: number, fringe?: FringeData, rowShape?: RowShape[], drop = 1): WeaveOrder {
  const order: WeaveOrder = []
  let rowsWalked = 0
  let lastDirection: WeaveDirection = 'ltr'

  // 2-drop and 3-drop: a stitch picks up a stack of two or three beads, so a
  // step is that stack, top bead first, and the rows are walked stack by
  // stack. `unit` counts stitch rows. With 1-drop a stack is one row and one
  // bead, which is the order this always was.
  for (let top = 0; top < rows; top += drop) {
    const stackRows: number[] = []
    for (let row = top; row < Math.min(rows, top + drop); row++) stackRows.push(row)
    const spanOf = (row: number) => {
      const shape = rowShape?.[row]
      return shape ? { start: shape.offset, end: shape.offset + shape.length } : { start: 0, end: cols }
    }
    // The rows of a stack share their width; should a hand edit have left
    // them apart, the stitch covers every column any of them reaches.
    const colStart = Math.min(...stackRows.map((row) => spanOf(row).start))
    const colEnd = Math.max(...stackRows.map((row) => spanOf(row).end))
    const direction: WeaveDirection = rowsWalked % 2 === 0 ? 'ltr' : 'rtl'
    const span = colEnd - colStart
    for (let i = 0; i < span; i++) {
      const col = direction === 'ltr' ? colStart + i : colEnd - 1 - i
      const cells = stackRows.filter((row) => col >= spanOf(row).start && col < spanOf(row).end).map((row) => ({ row, col }))
      if (cells.length === 0) continue
      const step: WeaveStep = { cells, unit: rowsWalked, direction, grouped: false }
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
    // The last body row worked — the one the fringe hangs from — ends at the
    // right edge if it went left-to-right, or the left edge if it went
    // right-to-left: pick up the nearest fringe column from there and sweep
    // away from it.
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
 * The grid draws this staggered — half the columns sit half a bead lower
 * (see `geometry.ts#effectiveStaggerPhase`) — so one drawn row holds two
 * passes: its high columns, and its low ones half a bead below.
 *
 * The start, step by step:
 *
 * - The foundation is the first drawn row, strung left to right ONE BEAD
 *   PER STEP. Those beads are already the zigzag base (the "rows 1 and 2" of
 *   every tutorial): on a 6-wide piece, 1 low, 2 high, 3 low… up to 6.
 * - The work turns, and the last bead strung — the rightmost column — rises.
 *   That's why the high columns are the ones the rightmost column belongs
 *   to, and why the first pass goes right to left along them, one bead below
 *   each: on a 6-wide piece, columns 6, 4, 2.
 * - Then left to right along the low columns (1, 3, 5), then back along the
 *   high ones a row lower, and so on — each pass turning the work at its end.
 *
 * `unit` is the pass number (the foundation is pass 0), which is what the UI
 * counts and what the word chart groups its lines by.
 */
function buildPeyoteOrder(cols: number, rows: number): WeaveOrder {
  const order: WeaveOrder = []
  if (rows === 0 || cols === 0) return order

  for (let col = 0; col < cols; col++) {
    order.push({ cells: [{ row: 0, col }], unit: 0, direction: 'ltr', grouped: false })
  }

  // The rightmost column is always high — it's the last bead of the foundation.
  const highParity = (cols - 1) % 2
  let pass = 0
  for (let row = 1; row < rows; row++) {
    for (const parity of [highParity, 1 - highParity]) {
      const columns: number[] = []
      for (let col = parity; col < cols; col += 2) columns.push(col)
      // A one-column pattern has no second set of positions — skip rather
      // than emit an empty pass, which would leave a gap in the numbering.
      if (columns.length === 0) continue
      pass++
      // The foundation went left to right, so pass 1 comes back right to
      // left, pass 2 goes left to right again, and so on.
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
 * Empty for the foundation (there's nothing before it to go through).
 *
 * In grid terms: a high column's bead goes through the low columns' beads of
 * the row above, and a low column's bead through the high columns' beads of
 * its own row — whichever pass sits half a bead higher.
 */
export function peyoteThreadThroughCells(order: WeaveOrder, index: number, cols: number): Cell[] {
  const step = order[index]
  if (!step || step.grouped || step.isFringe || step.isLoop) return []
  const cell = step.cells[0]
  if (!cell || cell.row <= 0) return []

  const highParity = (cols - 1) % 2
  const isHigh = cell.col % 2 === highParity
  const previousRow = isHigh ? cell.row - 1 : cell.row
  const previousParity = isHigh ? 1 - highParity : highParity

  const cells: Cell[] = []
  for (let col = previousParity; col < cols; col += 2) cells.push({ row: previousRow, col })
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
 * `grouped` step, since the ring is strung in one go. `loopBeadCount` is 0 for a metal loop or no
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
  /** Only its drop matters, and only to brick — see `buildBrickOrder`. */
  staggerPhase: StaggerPhase = 0,
): WeaveOrder {
  switch (technique) {
    case 'loom':
      return appendLoopStep(buildLoomOrder(cols, rows, fringe), loopBeadCount)
    case 'brick':
      return appendLoopStep(buildBrickOrder(cols, rows, fringe, rowShape, dropOf(staggerPhase)), loopBeadCount)
    case 'peyote':
      return appendLoopStep(buildPeyoteOrder(cols, rows), loopBeadCount)
    case 'triangle':
      // El peyote triangular todavía no tiene modo tejido: se teje en vueltas
      // desde el centro, no por filas (ver engine/trianglePeyote.ts). Se
      // devuelve un orden vacío, que es lo que significa "sin progreso": la
      // biblioteca pregunta por el avance de cualquier patrón, así que tirar
      // un error acá tumbaba la app entera al crear uno.
      return []
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
  staggerPhase: StaggerPhase = 0,
): { dx: number; dy: number } | null {
  const next = order[index + 1]
  if (!next) return null
  const current = order[index]
  // A brick 2-drop/3-drop stitch is a stack: the needle moves from stack to
  // stack along the row, so measure top bead to top bead, not from the bottom
  // of one stack up to the top of the next.
  const stitchToStitch = !current.grouped && !current.isFringe && !next.isFringe && current.cells.length > 1
  const from = stitchToStitch ? current.cells[0] : current.cells[current.cells.length - 1]
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
 * Index of the first step of whatever comes next after `afterIndex`: the next
 * body row, the first strand of the fringe, or the hanging loop. This is where
 * "marcar hecha" jumps, and it deliberately crosses from one section of the
 * piece into the next — closing the last body row of an earring lands on the
 * first fringe bead, where it used to land on "terminado", skipping every
 * fringe (going back one bead at a time walked them correctly, which is how
 * the weaver noticed). Closing the last fringe strand lands on the hanging
 * loop instead of marking it woven too.
 *
 * Direction-agnostic on purpose: brick walks rows from the widest one to the
 * tip (decreasing), while loom and peyote walk increasing, so "next row" can't
 * be assumed to mean `unit + 1` — this looks for the next step belonging to a
 * different unit or a different section, whichever way the order actually
 * goes. Returns -1 at the end of the order.
 */
export function firstIndexOfNextUnit(order: WeaveOrder, afterIndex: number): number {
  const current = order[afterIndex]
  if (!current) return -1
  const sectionOf = (step: WeaveStep) => (step.isLoop ? 'loop' : step.isFringe ? 'fringe' : 'body')
  const section = sectionOf(current)
  for (let i = afterIndex + 1; i < order.length; i++) {
    const step = order[i]
    if (sectionOf(step) !== section || step.unit !== current.unit) return i
  }
  return -1
}

/** A target for the "Ir a" jump selector: a body unit (row, or peyote pass) or a fringe column. */
export interface JumpTarget {
  kind: 'body' | 'fringe'
  /** Body unit (kind 'body' — a row, or a peyote pass) or fringe column (kind 'fringe') — both 0-based. */
  index: number
}

/**
 * Resolves a `JumpTarget` to its first step's index in `order` — the single
 * entry point behind the "Ir a" selector. Returns -1 if the target isn't in
 * `order` (e.g. a fringe column with no beads), same "not found" convention
 * as the underlying searches.
 */
export function jumpTargetToIndex(order: WeaveOrder, target: JumpTarget): number {
  return target.kind === 'fringe'
    ? order.findIndex((step) => step.isFringe && step.unit === target.index)
    : firstIndexOfUnit(order, target.index)
}

/** One point the thread passes through, in the order it gets there. */
export interface ThreadStop {
  cell: Cell
  /** 'new' — a bead just strung; 'through' — a bead of the previous pass the needle goes back through. */
  kind: 'new' | 'through'
  /** Index of the weave step this stop belongs to. */
  step: number
  /** The pass this stop belongs to (peyote's foundation is 0). */
  pass: number
  /** The thread turns the work right before this stop — it wraps around the edge of the piece to get here. */
  turnBefore?: true
  /** Which side of the piece that turn wraps around. */
  turnSide?: 'left' | 'right'
}

/**
 * The thread's real path through a peyote piece, up to and including step
 * `uptoIndex` — what Weave Mode draws instead of an arrow.
 *
 * The foundation is strung straight across, left to right. From then on each
 * step is two stops: the new bead, and the previous-pass bead sitting next to
 * it in the direction of travel, which the needle goes back through before
 * picking up the next one. That's why the thread waves up and down along a
 * pass instead of running flat. At the end of a pass it wraps around the edge
 * of the piece (`turnBefore`) and comes down to the first bead of the next.
 */
export function peyoteThreadPath(order: WeaveOrder, uptoIndex: number, cols: number): ThreadStop[] {
  const stops: ThreadStop[] = []
  const highParity = (cols - 1) % 2
  let previousPass = -1
  let previousDirection: WeaveDirection = 'ltr'
  for (let i = 0; i <= uptoIndex && i < order.length; i++) {
    const step = order[i]
    if (step.isFringe || step.isLoop) break
    const cell = step.cells[0]
    const startsPass = step.unit !== previousPass && i > 0
    const stop: ThreadStop = { cell, kind: 'new', step: i, pass: step.unit }
    if (startsPass) {
      stop.turnBefore = true
      stop.turnSide = previousDirection === 'ltr' ? 'right' : 'left'
    }
    stops.push(stop)

    if (step.unit > 0) {
      const throughCol = cell.col + (step.direction === 'ltr' ? 1 : -1)
      if (throughCol >= 0 && throughCol < cols) {
        const isHigh = cell.col % 2 === highParity
        stops.push({ cell: { row: isHigh ? cell.row - 1 : cell.row, col: throughCol }, kind: 'through', step: i, pass: step.unit })
      }
    }
    previousPass = step.unit
    previousDirection = step.direction
  }
  return stops
}
