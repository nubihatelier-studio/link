import type { Technique, CellPosition, RowShape } from './types'

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
 *   documented simplification. Because beads interlock vertically, the
 *   nominal bead height is compacted to ~75% per additional row
 *   (PEYOTE_ROW_COMPACTION), which is also reflected in the physical size
 *   estimate shown in the configurator.
 *
 * - Brick: beads are threaded in horizontal rows; odd rows are offset right
 *   by half a column-pitch (classic brick-stitch masonry look). Same ±1
 *   simplification as Peyote applies at row edges (not modeled in v1).
 *   Rows nestle into each other vertically, compacted to ~85% per
 *   additional row (BRICK_ROW_COMPACTION).
 */

export const PEYOTE_ROW_COMPACTION = 0.75
export const BRICK_ROW_COMPACTION = 0.85

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
 * last body row's position for that column and hangs straight down at a
 * full 1.0 bead-pitch per additional row — a fringe strand dangles freely
 * on thread, so unlike body rows it is never compacted or row-parity
 * offset. For loom this is a no-op vs. the plain formula (loom's own pitch
 * is already 1 with no offset); brick's fringe zone is what actually
 * diverges from its body formula.
 */
export function cellPosition(technique: Technique, row: number, col: number, bodyRows?: number): CellPosition {
  if (bodyRows !== undefined && row >= bodyRows) {
    const anchor = cellPosition(technique, bodyRows - 1, col)
    return { x: anchor.x, y: anchor.y + (row - (bodyRows - 1)) }
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
      const xOffset = isOddIndex(row) ? 0.5 : 0
      return { x: col + xOffset, y: row * pitch }
    }
  }
}

/**
 * Total bounding size, in bead units, for a cols x rows grid of a technique.
 *
 * `maxFringeBeads` (the longest fringe among all columns, see
 * `engine/fringe.ts#maxFringeLength`) extends the height by that many whole
 * units — fringe beads hang at a full, uncompacted 1.0 pitch each, and the
 * first fringe bead picks up immediately where the last body row's own
 * bead-height extent ends, so no extra gap or overlap needs accounting for.
 */
export function gridBoundsUnits(technique: Technique, cols: number, rows: number, maxFringeBeads = 0) {
  const pitch = rowPitch(technique)
  const extraX = technique === 'brick' ? 0.5 : 0
  const extraY = technique === 'peyote' ? pitch / 2 : 0
  return {
    width: cols + extraX,
    height: rows > 0 ? (rows - 1) * pitch + 1 + extraY + maxFringeBeads : 0,
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
 * dimensions. `maxFringeBeads` (see `gridBoundsUnits`) folds the longest
 * fringe into the total height so the configurator/PDF header always show
 * the finished piece's real size, fringe included.
 */
export function physicalSizeMm(
  technique: Technique,
  cols: number,
  rows: number,
  beadWidthMm: number,
  beadHeightMm: number,
  maxFringeBeads = 0,
) {
  const bounds = gridBoundsUnits(technique, cols, rows, maxFringeBeads)
  return {
    widthMm: bounds.width * beadWidthMm,
    heightMm: bounds.height * beadHeightMm,
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
export function cellAtPosition(technique: Technique, xUnits: number, yUnits: number): { row: number; col: number } {
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
      const xOffset = isOddIndex(row) ? 0.5 : 0
      const col = Math.floor(xUnits - xOffset)
      return { row, col }
    }
  }
}

/**
 * `cellAtPosition`, extended to correctly invert a click that lands in the
 * fringe zone hanging below a `bodyRows`-tall body (see
 * `cellPosition`/`engine/fringe.ts`). Above the body/fringe boundary this is
 * identical to `cellAtPosition`. Below it, every column's fringe hangs
 * straight down from wherever its last body-row bead was (no row parity, no
 * per-row offset), so depth is a plain linear inverse of y, and the column
 * is read off the *last body row's* fixed x-offset instead of the (missing)
 * offset a fringe row would otherwise have of its own.
 */
export function cellAtPositionWithFringe(
  technique: Technique,
  bodyRows: number,
  xUnits: number,
  yUnits: number,
): { row: number; col: number } {
  const bodyBottomY = cellPosition(technique, bodyRows, 0, bodyRows).y
  if (yUnits < bodyBottomY) return cellAtPosition(technique, xUnits, yUnits)

  const depth = Math.max(0, Math.floor(yUnits - bodyBottomY))
  const row = bodyRows + depth
  const lastBodyRowXOffset = cellPosition(technique, bodyRows - 1, 0).x
  const col = Math.floor(xUnits - lastBodyRowXOffset)
  return { row, col }
}

/**
 * Inverse of physicalSizeMm: given a desired finished size in mm, compute the
 * cols/rows needed for a given bead and technique ("crear desde tamaño final").
 */
export function gridFromPhysicalSizeMm(
  technique: Technique,
  widthMm: number,
  heightMm: number,
  beadWidthMm: number,
  beadHeightMm: number,
) {
  const pitch = rowPitch(technique)
  const extraX = technique === 'brick' ? 0.5 : 0
  const extraY = technique === 'peyote' ? pitch / 2 : 0

  const colsUnits = widthMm / beadWidthMm - extraX
  const cols = Math.max(1, Math.round(colsUnits))

  const rowsUnits = (heightMm / beadHeightMm - extraY - 1) / pitch + 1
  const rows = Math.max(1, Math.round(rowsUnits))

  return { cols, rows }
}
