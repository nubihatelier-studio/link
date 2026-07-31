import type { Technique, CellPosition, RowShape } from './types'
import { loopHeightUnits } from './loop'

/**
 * Geometry model for the three supported weaving techniques.
 *
 * All positions are expressed in "bead units" (1 unit = the pitch of one
 * bead along a row for x, or along a column for y). The renderer multiplies
 * these by the physical bead width/height (in mm) and then by a px/mm zoom
 * factor to get screen pixels.
 *
 * Design decisions (documented here because the exact formulas are a
 * deliberate simplification, per product spec):
 *
 * - Loom: a strict rectangle, no offsets, no compaction. Each row has
 *   exactly `cols` beads, each column exactly `rows` beads.
 *
 * - Peyote: beads are threaded in vertical columns; odd columns are
 *   offset down by half a row-pitch, producing the classic "vertical brick"
 *   look. Real hand-charted peyote sometimes drops a bead at the top/bottom
 *   of alternating columns to keep a flat top/bottom edge (±1 bead per
 *   column) - we intentionally do NOT model that jagged edge in v1: every
 *   column has exactly `rows` beads, and the ±1 edge effect is left as a
 *   documented simplification. On screen, the nominal bead height is
 *   compacted to ~75% per additional row (PEYOTE_ROW_COMPACTION) purely so
 *   the canvas render packs columns visually tight — that compaction is
 *   NOT reused for the physical size estimate (see `physicalSizeMm`'s doc
 *   comment): a real, measured piece showed that reusing it there
 *   double-counts the same interlock the column offset already represents.
 *
 * - Brick: beads are threaded in horizontal rows; odd rows are offset right
 *   by half a column-pitch (classic brick-stitch masonry look). Same ±1
 *   simplification as Peyote applies at row edges (not modeled in v1).
 *   Rows nestle into each other vertically, compacted to ~85% per
 *   additional row (BRICK_ROW_COMPACTION) — both on screen and, for now,
 *   in the physical size estimate too (still just the original theoretical
 *   guess there, not calibrated against a real brick piece — see
 *   `WEAVE_THREAD_FACTOR`).
 */

export const PEYOTE_ROW_COMPACTION = 0.75
export const BRICK_ROW_COMPACTION = 0.85

/**
 * Which of the bead's own two physical dimensions (`BeadTypeDef.widthMm` /
 * `.heightMm`) maps to the horizontal (across a row) vs. vertical (down a
 * column, between rows) axis, per technique. This is NOT always
 * width→horizontal — it depends on how the bead physically sits once
 * threaded, so guessing "width" is always horizontal silently swapped the
 * axes for peyote (see `physicalSizeMm`'s doc comment for the real-piece
 * measurement that exposed this).
 *
 * - Loom: the bead sits flat in a square warp/weft grid, hole running the
 *   same direction as the row — a column's width uses the bead's own width,
 *   a row's height uses its height. The "natural" assumption carried over
 *   from the original model; NOT calibrated against a physical loom sample
 *   (see `WEAVE_THREAD_FACTOR`).
 * - Peyote: the bead lies on its side with the hole HORIZONTAL, threaded in
 *   vertical columns — so a column's width is the bead's short side
 *   (`heightMm` on a Delica, its actual width when lying down) and the step
 *   down a column is the bead's long side/diameter (`widthMm`). The exact
 *   reverse of loom's mapping, because the bead itself is rotated 90° to
 *   sit in a column instead of a row. Calibrated against a real measured
 *   piece (peyote, Delica 11/0, 6×60 → 8×102mm) — see `WEAVE_THREAD_FACTOR`.
 * - Brick: the bead also lies on its side (hole horizontal) but threaded in
 *   HORIZONTAL rows instead of columns — so along a row it's the bead's
 *   long side/diameter that repeats (`widthMm`), and the step between rows
 *   is its short side (`heightMm`). Same mapping as loom, but by
 *   coincidence of how brick rows are oriented, not because the bead sits
 *   the same way as in loom. NOT calibrated against a physical brick
 *   sample.
 */
const BEAD_AXIS_MAP: Record<Technique, { horizontal: 'width' | 'height'; vertical: 'width' | 'height' }> = {
  loom: { horizontal: 'width', vertical: 'height' },
  peyote: { horizontal: 'height', vertical: 'width' },
  brick: { horizontal: 'width', vertical: 'height' },
}

function beadAxisMm(
  technique: Technique,
  axis: 'horizontal' | 'vertical',
  beadWidthMm: number,
  beadHeightMm: number,
): number {
  return BEAD_AXIS_MAP[technique][axis] === 'width' ? beadWidthMm : beadHeightMm
}

/**
 * Row-to-row pitch used ONLY by the physical-size estimate
 * (`physicalSizeMm`/`gridFromPhysicalSizeMm`) — deliberately separate from
 * `rowPitch` below (used for on-screen/canvas layout: `cellPosition`,
 * `gridBoundsUnits`, hit-testing). Reusing `rowPitch` here used to
 * double-count peyote's interlock: peyote's column offset (half a bead, in
 * `cellPosition`) *is* the physical representation of how columns nestle
 * together sideways — it doesn't also shrink the vertical distance between
 * two beads stacked in the SAME column, which is what this pitch measures.
 * So peyote's physical pitch is 1 (a full bead), not
 * `PEYOTE_ROW_COMPACTION` — that constant stays exactly as it was for
 * rendering (see the split note on `PEYOTE_ROW_COMPACTION` above).
 *
 * Brick's masonry offset is a genuinely different effect: consecutive rows
 * really do nestle vertically (each row's beads sit partly in the gaps of
 * the row below), so its physical pitch keeps using
 * `BRICK_ROW_COMPACTION` — but that number is still only the original
 * theoretical guess, NOT calibrated against a real piece.
 *
 * Even with both fixes, this is still only the bead's own raw dimension —
 * thread thickness and weaving tension nudge a real piece a bit further;
 * see the thread/tension correction layered on top of this pitch.
 */
function physicalRowPitch(technique: Technique): number {
  switch (technique) {
    case 'loom':
      return 1
    case 'peyote':
      return 1
    case 'brick':
      return BRICK_ROW_COMPACTION
  }
}

export function isOddIndex(i: number): boolean {
  return i % 2 === 1
}

/** Vertical pitch between rows, in row-height units, for a technique. */
export function rowPitch(technique: Technique): number {
  switch (technique) {
    case 'loom':
      return 1
    case 'peyote':
      return PEYOTE_ROW_COMPACTION
    case 'brick':
      return BRICK_ROW_COMPACTION
  }
}

/**
 * Position (in bead units) of the center of cell (row, col).
 *
 * When `bodyRows` is given and `row` falls in the fringe zone (`row >=
 * bodyRows`, see `engine/fringe.ts`), the position instead anchors at the
 * last body row's position for that column (via `fringeAnchorX`, the single
 * source of truth for that X) and continues straight down at the *same* row
 * pitch the body itself uses — a fringe strand is a seamless continuation of
 * the weave, not a separate free-hanging element, so a diagonal of color
 * crossing the body/fringe boundary must not kink. It still carries no
 * row-parity offset (peyote's column stagger, brick's row shift) since a
 * hanging strand doesn't interlock sideways — only the anchor column's own x
 * is carried forward. For loom this is a no-op vs. the plain formula (loom's
 * pitch is already 1 with no offset).
 *
 * `staggerPhase` (0 or 1, default 0) shifts brick's row-parity check from the
 * row's raw index to `row + staggerPhase`. It exists so that inserting or
 * removing a row at the top of a pattern — which reindexes every existing
 * row by ±1 — can flip the phase to exactly cancel that reindex, leaving
 * every pre-existing row's real physical stagger (and thus the pattern's
 * centering) unchanged. See `shape.ts#recenterRowShape` and
 * `editorStore.ts#addRowAtTop`/`removeRowAtTop`.
 */
export function cellPosition(
  technique: Technique,
  row: number,
  col: number,
  bodyRows?: number,
  staggerPhase: 0 | 1 = 0,
): CellPosition {
  if (bodyRows !== undefined && row >= bodyRows) {
    const anchorY = cellPosition(technique, bodyRows - 1, col, undefined, staggerPhase).y
    const pitch = rowPitch(technique)
    return { x: fringeAnchorX(technique, col, bodyRows, staggerPhase), y: anchorY + (row - (bodyRows - 1)) * pitch }
  }
  switch (technique) {
    case 'loom':
      return { x: col, y: row }
    case 'peyote': {
      const pitch = PEYOTE_ROW_COMPACTION
      const yOffset = isOddIndex(col) ? pitch / 2 : 0
      return { x: col, y: row * pitch + yOffset }
    }
    case 'brick': {
      const pitch = BRICK_ROW_COMPACTION
      const xOffset = isOddIndex(row + staggerPhase) ? 0.5 : 0
      return { x: col + xOffset, y: row * pitch }
    }
  }
}

/** The X position (bead units) of the bead at (row, col) — same as `cellPosition(...).x`, named for callers that only need the horizontal position. */
export function beadCenterX(technique: Technique, row: number, col: number, staggerPhase: 0 | 1 = 0): number {
  return cellPosition(technique, row, col, undefined, staggerPhase).x
}

/**
 * The single source of truth for where a fringe strand in column `col`
 * hangs from: the X position (bead units) of the body's own last row
 * (`bodyRows - 1`) in that column, offset and all. Every fringe renderer
 * (editor canvas, weave mode, PNG, Instagram card, PDF) and the fringe
 * hit-test route through `cellPosition`/this function — never recompute a
 * fringe column's X any other way, or two code paths can end up disagreeing
 * about where a given column's fringe hangs from.
 */
export function fringeAnchorX(technique: Technique, col: number, bodyRows: number, staggerPhase: 0 | 1 = 0): number {
  return beadCenterX(technique, bodyRows - 1, col, staggerPhase)
}

/**
 * The single source of truth for where a hanging loop attaches: the
 * horizontal center (bead units) of the body's own top row (row 0) — the
 * opposite end from the fringe, which hangs off the LAST row instead.
 * `rowShape`'s own first entry (a shaped body's top row can be narrower than
 * `cols`, e.g. a triangle's tapered tip) gates which columns row 0 actually
 * reaches; every loop renderer (editor canvas, PNG, Instagram card, PDF)
 * routes through this so the ring is always centered on the same point.
 */
export function loopAnchorX(
  technique: Technique,
  cols: number,
  rowShape: RowShape[] | undefined,
  staggerPhase: 0 | 1 = 0,
): number {
  const topRow = rowShape?.[0]
  const offset = topRow?.offset ?? 0
  const length = topRow?.length ?? cols
  const leftX = beadCenterX(technique, 0, offset, staggerPhase)
  const rightX = beadCenterX(technique, 0, offset + length - 1, staggerPhase)
  return (leftX + rightX) / 2 + 0.5
}

/**
 * Total bounding size, in bead units, for a cols x rows grid of a technique.
 *
 * `maxFringeBeads` (the longest fringe among all columns, see
 * `engine/fringe.ts#maxFringeLength`) extends the height by that many rows
 * at the technique's own row pitch — fringe rows interlock with each other
 * (and with the body's last row) exactly the same way consecutive body rows
 * do, so the transition is seamless. The final `+1` accounts for the
 * deepest row's own full bead-height extent, whichever row that is.
 */
export function gridBoundsUnits(technique: Technique, cols: number, rows: number, maxFringeBeads = 0) {
  const pitch = rowPitch(technique)
  const extraX = technique === 'brick' ? 0.5 : 0
  const extraY = technique === 'peyote' ? pitch / 2 : 0
  return {
    width: cols + extraX,
    height: rows > 0 ? (rows - 1 + maxFringeBeads) * pitch + 1 + extraY : 0,
  }
}

/**
 * Total bead count for a cols x rows grid. See module doc for the ±1
 * simplification. When `rowShape` is given (a shaped brick body), sums each
 * row's own length instead of assuming every row is `cols` wide.
 */
export function beadCount(_technique: Technique, cols: number, rows: number, rowShape?: RowShape[]): number {
  if (!rowShape) return cols * rows
  let total = 0
  for (let r = 0; r < rows; r++) total += rowShape[r]?.length ?? cols
  return total
}

/**
 * Physical size estimate in mm for a cols x rows grid of a given bead's mm
 * dimensions — the finished, real-world size of the piece, NOT the
 * on-screen render size (see `gridBoundsUnits` for that; the two are
 * intentionally independent, see `physicalRowPitch`'s doc comment).
 *
 * `beadWidthMm`/`beadHeightMm` are the bead's own two dimensions in
 * whatever order `BeadTypeDef` stores them (width = diameter, height =
 * short side, on a cylinder bead like Delica) — `beadAxisMm` decides which
 * one is actually horizontal vs. vertical for this technique (see
 * `BEAD_AXIS_MAP`). Passing them straight through as "width→horizontal,
 * height→vertical" is exactly the bug a real measured piece exposed: a
 * peyote bracelet (Miyuki Delica 11/0, 6 cols × 60 rows) measured 8.0 ×
 * 102mm by hand, but the app reported 9.6 × 59.3mm — width +20% and height
 * −42%, from the swapped axes plus double-counting `PEYOTE_ROW_COMPACTION`
 * (see `physicalRowPitch`). Fixed, the same 6×60 grid computes 7.8mm wide
 * (cols × the bead's short side, 2.5% off the real 8.0mm) and 96mm tall
 * (rows × diameter, 6% off the real 102mm) — the residual height error is
 * thread thickness and weaving tension, which no bead-only model can
 * capture; see the calibrated thread/tension factor layered on top of this
 * function.
 *
 * `maxFringeBeads` folds the longest fringe into the total height, at the
 * same per-row pitch as the body, so the configurator/PDF header always
 * show the finished piece's real size, fringe included.
 *
 * `loopBeads` (see `engine/loop.ts#loopBeadCount`) adds a woven hanging
 * loop's own height on top — a ring, not a row, so it uses
 * `loopHeightUnits`'s own estimate instead of the row pitch (a metal loop
 * or no loop at all contributes 0 either way).
 */
export function physicalSizeMm(
  technique: Technique,
  cols: number,
  rows: number,
  beadWidthMm: number,
  beadHeightMm: number,
  maxFringeBeads = 0,
  loopBeads = 0,
) {
  const horizontalMm = beadAxisMm(technique, 'horizontal', beadWidthMm, beadHeightMm)
  const verticalMm = beadAxisMm(technique, 'vertical', beadWidthMm, beadHeightMm)
  const rowMm = physicalRowPitch(technique) * verticalMm
  return {
    widthMm: cols * horizontalMm,
    heightMm: (rows + maxFringeBeads) * rowMm + loopHeightUnits(loopBeads) * verticalMm,
  }
}

/**
 * Inverse of cellPosition: given a point in bead units, finds which cell
 * contains it. Used to hit-test pointer input on the canvas without having
 * to iterate every cell (important for large grids).
 *
 * cellPosition places cell k at the *start* of the unit span [k, k+1) — the
 * renderer draws each cell's rect from `pos * cellPx` forward, not centered
 * on it — so the inverse must floor, not round, to land on the same cell
 * the pointer is visually over. Rounding here previously snapped the cell's
 * own center to the *next* cell, shifting every hit-test one row/col off.
 */
export function cellAtPosition(
  technique: Technique,
  xUnits: number,
  yUnits: number,
  staggerPhase: 0 | 1 = 0,
): { row: number; col: number } {
  switch (technique) {
    case 'loom':
      return { row: Math.floor(yUnits), col: Math.floor(xUnits) }
    case 'peyote': {
      const pitch = PEYOTE_ROW_COMPACTION
      const col = Math.floor(xUnits)
      const yOffset = isOddIndex(col) ? pitch / 2 : 0
      const row = Math.floor((yUnits - yOffset) / pitch)
      return { row, col }
    }
    case 'brick': {
      const pitch = BRICK_ROW_COMPACTION
      const row = Math.floor(yUnits / pitch)
      const xOffset = isOddIndex(row + staggerPhase) ? 0.5 : 0
      const col = Math.floor(xUnits - xOffset)
      return { row, col }
    }
  }
}

/**
 * `cellAtPosition`, extended to correctly invert a click that lands in the
 * fringe zone hanging below a `bodyRows`-tall body (see
 * `cellPosition`/`engine/fringe.ts`). Above the body/fringe boundary this is
 * identical to `cellAtPosition`. Below it, every column's fringe continues
 * straight down from wherever its last body-row bead was, stepping at the
 * same row pitch the body uses (no row parity, no per-row offset — just the
 * pitch), so depth is `(y - anchorY) / pitch` bucketed the same way
 * `cellAtPosition` buckets the body's own rows, and the column is read off
 * the *last body row's* fixed x-offset instead of the (missing) offset a
 * fringe row would otherwise have of its own.
 */
export function cellAtPositionWithFringe(
  technique: Technique,
  bodyRows: number,
  xUnits: number,
  yUnits: number,
  staggerPhase: 0 | 1 = 0,
): { row: number; col: number } {
  const pitch = rowPitch(technique)
  const anchorY = cellPosition(technique, bodyRows - 1, 0, undefined, staggerPhase).y
  if (yUnits < anchorY + pitch) return cellAtPosition(technique, xUnits, yUnits, staggerPhase)

  const depth = Math.max(0, Math.floor((yUnits - anchorY) / pitch) - 1)
  const row = bodyRows + depth
  // fringeAnchorX(technique, 0, bodyRows) gives just the row's own additive
  // offset (brick/loom have no per-column term), so subtracting it out of
  // xUnits recovers the real column — the exact inverse of how cellPosition
  // computes a fringe cell's x. Same anchor function as the renderer, so a
  // click always resolves to the column its fringe was actually drawn at.
  const col = Math.floor(xUnits - fringeAnchorX(technique, 0, bodyRows, staggerPhase))
  return { row, col }
}

/**
 * Inverse of `physicalSizeMm`: given a desired finished size in mm, compute
 * the cols/rows needed for a given bead and technique ("crear desde tamaño
 * final"). Must use the exact same axis mapping and row pitch as
 * `physicalSizeMm` so asking for a size and reading it back round-trips to
 * the same cols/rows.
 */
export function gridFromPhysicalSizeMm(
  technique: Technique,
  widthMm: number,
  heightMm: number,
  beadWidthMm: number,
  beadHeightMm: number,
) {
  const horizontalMm = beadAxisMm(technique, 'horizontal', beadWidthMm, beadHeightMm)
  const verticalMm = beadAxisMm(technique, 'vertical', beadWidthMm, beadHeightMm)
  const rowMm = physicalRowPitch(technique) * verticalMm

  const cols = Math.max(1, Math.round(widthMm / horizontalMm))
  const rows = Math.max(1, Math.round(heightMm / rowMm))

  return { cols, rows }
}
