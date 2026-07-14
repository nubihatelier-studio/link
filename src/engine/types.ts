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

export interface PatternDoc {
  id: string
  name: string
  config: PatternConfig
  /** sparse map "row,col" -> hex color */
  cells: ColorMap
  createdAt: number
  updatedAt: number
}

export type MeasurementUnit = 'mm' | 'cm' | 'in'
