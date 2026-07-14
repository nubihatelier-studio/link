import type { Technique, CellPosition } from './types'

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

/** Position (in bead units) of the center of cell (row, col). */
export function cellPosition(technique: Technique, row: number, col: number): CellPosition {
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

/** Total bounding size, in bead units, for a cols x rows grid of a technique. */
export function gridBoundsUnits(technique: Technique, cols: number, rows: number) {
  const pitch = rowPitch(technique)
  const extraX = technique === 'brick' ? 0.5 : 0
  const extraY = technique === 'peyote' ? pitch / 2 : 0
  return {
    width: cols + extraX,
    height: rows > 0 ? (rows - 1) * pitch + 1 + extraY : 0,
  }
}

/** Total bead count for a cols x rows grid. See module doc for the ±1 simplification. */
export function beadCount(_technique: Technique, cols: number, rows: number): number {
  return cols * rows
}

/** Physical size estimate in mm for a cols x rows grid of a given bead's mm dimensions. */
export function physicalSizeMm(
  technique: Technique,
  cols: number,
  rows: number,
  beadWidthMm: number,
  beadHeightMm: number,
) {
  const bounds = gridBoundsUnits(technique, cols, rows)
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
