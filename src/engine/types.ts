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

export interface PatternDoc {
  id: string
  name: string
  config: PatternConfig
  /** sparse map "row,col" -> hex color */
  cells: ColorMap
  /** Absent on patterns created before this feature — treat as "no fringe" (see `engine/fringe.ts#normalizeFringe`). */
  fringe?: FringeData
  createdAt: number
  updatedAt: number
}

export type MeasurementUnit = 'mm' | 'cm' | 'in'
