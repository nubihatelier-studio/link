import type { ColorMap, FringeData, PairData, RowShape, Technique } from './types'
import { cellKey, parseCellKey } from './cellKey'
import { isPaintableCell, normalizeFringe } from './fringe'
import { createRectangleRowShape, normalizeRowShape } from './shape'
import { dropOf, effectiveStaggerPhase, flipStagger, type StaggerPhase } from './geometry'
import { mirrorGeometry } from './pair'

/** Where columns are added or taken away. */
export type ColumnSide = 'left' | 'both' | 'right'
/** Where rows are added or taken away. The fringe always hangs from the last row, wherever that ends up. */
export type RowSide = 'top' | 'bottom'

export interface ResizePlan {
  cols: number
  rows: number
  colSide: ColumnSide
  rowSide: RowSide
}

/** The part of a pattern a resize reads and rewrites — the rest (name, palette, letters, loop…) is untouched. */
export interface ResizablePiece {
  technique: Technique
  cols: number
  rows: number
  cells: ColorMap
  fringe?: FringeData
  rowShape?: RowShape[]
  staggerPhase: StaggerPhase
  pair?: PairData
}

export interface ResizeResult {
  cols: number
  rows: number
  cells: ColorMap
  fringe: FringeData
  rowShape: RowShape[]
  staggerPhase: StaggerPhase
  pair?: PairData
  /** Painted beads that fall outside the new size — the number the weaver is warned about before applying. */
  lost: number
}

/**
 * A pattern at a new size, with its design kept where the weaver said: columns
 * added or taken away on the left, the right or both sides (split evenly, the
 * odd one on the right), rows at the top or the bottom. Everything painted
 * moves with the design — body and fringe alike — and whatever falls outside
 * the new size is dropped and counted in `lost`, so the dialog can say so
 * before anything is lost.
 *
 * What moves along with it:
 *
 * - **The fringe** hangs from the last row, so it follows the body down or up
 *   and keeps each strand under its own column.
 * - **A shaped brick body** (triangle, rhombus…) keeps every row's width and
 *   shifts with the columns; rows added copy the nearest row's width, so a
 *   taper grows the way it already goes. A plain rectangle just becomes a
 *   plain rectangle of the new size.
 * - **Brick's half-bead stagger**: rows added or removed at the top renumber
 *   every row below, so the phase flips when that shift is odd (in stacks of
 *   rows, for 2-drop and 3-drop) — every existing row stays exactly where it
 *   was on the chart. Same trick as "Agregar fila arriba".
 * - **The right earring of a split pair** moves as the mirror of the left:
 *   a column added on the left of one is added on the right of the other.
 */
export function resizePiece(piece: ResizablePiece, plan: ResizePlan): ResizeResult {
  const { cols, rows } = piece
  const newCols = Math.max(1, plan.cols)
  const newRows = Math.max(1, plan.rows)
  const dc = newCols - cols
  const dr = newRows - rows
  const dx = plan.colSide === 'right' ? 0 : plan.colSide === 'left' ? dc : Math.trunc(dc / 2)
  const dy = plan.rowSide === 'bottom' ? 0 : dr

  // Fringe: each strand stays under its own column.
  const fringe = normalizeFringe(piece.fringe, cols)
  const newFringe: FringeData = {
    lengths: Array.from({ length: newCols }, (_, nc) => fringe.lengths[nc - dx] ?? 0),
    turnBeads: Array.from({ length: newCols }, (_, nc) => fringe.turnBeads[nc - dx] ?? false),
  }

  // Body shape: a rectangle stays a rectangle; a shape keeps its widths.
  const shape = normalizeRowShape(piece.rowShape, cols, rows)
  const shaped = shape.some((row) => row.offset !== 0 || row.length !== cols)
  const newShape = shaped ? shiftShape(shape, rows, newCols, newRows, dx, dy) : createRectangleRowShape(newCols, newRows)

  // Brick: rows renumbered from the top keep their half-bead shift.
  let staggerPhase = piece.staggerPhase
  // Peyote's isn't a choice: which columns sit high follows from how many
  // there are (see `effectiveStaggerPhase`), so it's recomputed for the new
  // count — an odd number of columns added on the right re-staggers the
  // chart, and the preview shows it before anything is applied.
  if (piece.technique === 'peyote') staggerPhase = effectiveStaggerPhase({ technique: 'peyote', cols: newCols })
  if (piece.technique === 'brick' && dy !== 0) {
    const drop = dropOf(staggerPhase)
    if (dy % drop === 0 && Math.abs(dy / drop) % 2 === 1) staggerPhase = flipStagger(staggerPhase)
  }

  const moved = moveCells(piece.cells, rows, newCols, newRows, dx, dy, newFringe, newShape)
  let lost = moved.lost

  let pair = piece.pair
  if (pair?.mode === 'independent') {
    // The right earring is the left one mirrored: its columns count from the other side.
    const right = mirrorGeometry({ technique: piece.technique, cols: newCols, rows: newRows, fringe: newFringe, rowShape: newShape, staggerPhase })
    const movedRight = moveCells(pair.rightCells, rows, newCols, newRows, dc - dx, dy, right.fringe!, right.rowShape!)
    pair = { mode: 'independent', rightCells: movedRight.cells }
    lost += movedRight.lost
  }

  return { cols: newCols, rows: newRows, cells: moved.cells, fringe: newFringe, rowShape: newShape, staggerPhase, pair, lost }
}

/** Every painted bead moved by (dx, dy) — the fringe by dx only, hanging from the new last row. */
function moveCells(
  cells: ColorMap,
  rows: number,
  newCols: number,
  newRows: number,
  dx: number,
  dy: number,
  fringe: FringeData,
  rowShape: RowShape[],
): { cells: ColorMap; lost: number } {
  const next: ColorMap = {}
  let lost = 0
  for (const [key, hex] of Object.entries(cells)) {
    if (!hex) continue
    const { row, col } = parseCellKey(key)
    const nr = row < rows ? row + dy : newRows + (row - rows)
    const nc = col + dx
    if (isPaintableCell(nr, nc, newCols, newRows, fringe, rowShape)) next[cellKey(nr, nc)] = hex
    else lost++
  }
  return { cells: next, lost }
}

/** A shaped body's rows moved by (dx, dy); rows added copy their nearest neighbour's width. */
function shiftShape(shape: RowShape[], rows: number, newCols: number, newRows: number, dx: number, dy: number): RowShape[] {
  return Array.from({ length: newRows }, (_, nr) => {
    const from = shape[Math.min(rows - 1, Math.max(0, nr - dy))]
    const start = Math.max(0, from.offset + dx)
    const end = Math.min(newCols, from.offset + dx + from.length)
    if (end - start >= 1) return { offset: start, length: end - start }
    // The whole row fell outside: keep one bead at the nearest edge — a row never disappears.
    return { offset: Math.min(newCols - 1, Math.max(0, start)), length: 1 }
  })
}
