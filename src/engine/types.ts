export type Technique = 'loom' | 'peyote' | 'brick'

export interface BeadTypeDef {
  id: string
  brand: string
  line: string
  size: string
  label: string
  /** physical width of one bead, in mm, as woven (left-right in a row) */
  widthMm: number
  /** physical height of one bead, in mm, as woven (row pitch) */
  heightMm: number
  shape: 'cylinder' | 'round'
}

export interface PatternConfig {
  technique: Technique
  cols: number
  rows: number
  beadTypeId: string
}

export interface Cell {
  row: number
  col: number
}

/** A cell's pixel-space center position within the abstract bead grid, in "bead units" (1 unit = 1 bead pitch). */
export interface CellPosition {
  x: number
  y: number
}

export type ColorMap = Record<string, string | undefined>

/**
 * Fringe hanging off the last body row — brick/loom only (see
 * `engine/fringe.ts`). Bead colors live in the same `PatternDoc.cells` map
 * as the body: a fringe cell at depth `d` (0 = closest to the body) under
 * body column `col` is addressed as `cellKey(config.rows + d, col)`, so
 * every existing color tool (paint, fill, replace…) already works on
 * fringe cells with zero changes.
 */
export interface FringeData {
  /** Bead count hanging below each body column; always `lengths.length === config.cols`. 0 = no fringe for that column. */
  lengths: number[]
  /** Whether a column's deepest fringe bead is a turn bead — only meaningful where `lengths[i] > 0`. Same length as `lengths`. */
  turnBeads: boolean[]
}

/**
 * One row's active column span for a shaped brick-stitch body — real
 * brick-stitch increases/decreases narrow a row by dropping beads off its
 * edges, so a shape is just "which columns exist" per row, not a different
 * coordinate system (see `engine/geometry.ts#cellPosition`, which needs no
 * shape awareness at all — a column's x position is the same whether or not
 * a given row happens to reach that far). `offset` is the leftmost active
 * column, `length` how many columns wide the row is; `offset + length` never
 * exceeds `config.cols`, which for a shaped body means the WIDEST row, not
 * every row's width (see `engine/shape.ts#maxRowWidth`).
 */
export interface RowShape {
  offset: number
  length: number
}

export interface PatternDoc {
  id: string
  name: string
  config: PatternConfig
  /** sparse map "row,col" -> hex color */
  cells: ColorMap
  /** Absent on patterns created before this feature — treat as "no fringe" (see `engine/fringe.ts#normalizeFringe`). */
  fringe?: FringeData
  /**
   * Absent means every row is full-width (a rectangle) — true for every
   * pattern created before this feature, and for peyote/loom, which aren't
   * shape-capable (see `engine/shape.ts#isShapeCapable`/`normalizeRowShape`).
   * Only brick bodies can have increases/decreases.
   */
  rowShape?: RowShape[]
  /** Free-text note (materials, gift recipient, gauge tweaks…) — shown on the PDF's ficha page. Absent/empty means no note. */
  note?: string
  createdAt: number
  updatedAt: number
}

export type MeasurementUnit = 'mm' | 'cm' | 'in'
