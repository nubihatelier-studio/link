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
  /** 0 or 1, defaults to 0 for legacy patterns. See `geometry.ts#cellPosition`. */
  staggerPhase?: 0 | 1
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

export type LoopVariant = 'woven' | 'metal'

/**
 * The hanging loop at the body's top tip — how the finished piece attaches
 * to an earring hook, keychain ring, etc. Two variants:
 *
 * - `'woven'`: a small ring of `beadCount` beads, all one color, woven onto
 *   the top tip — counted in the pattern's total, listed in materials by its
 *   own DB code, and added to the physical size (see
 *   `engine/loop.ts#loopHeightUnits`). NOT part of the `cells` grid (a ring
 *   isn't addressable by row/col the way the body and fringe are) — its
 *   beads share one uniform color rather than being individually painted.
 * - `'metal'`: a purchased finding (jump ring, clasp…) — no beads to weave
 *   or count, just a materials-list line and an assembly note.
 *
 * Absent/`undefined` = no loop — every pattern created before this feature
 * existed, and any pattern where the weaver hasn't added one, loads and
 * behaves exactly as it did before (see `engine/loop.ts#normalizeLoop`).
 */
export interface LoopData {
  variant: LoopVariant
  /** Bead count forming the ring — only meaningful for `'woven'`, ignored for `'metal'`. */
  beadCount: number
  /** Hex color for the ring's beads, picked from the pattern's own palette — only meaningful for `'woven'`. */
  color: string
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
  /** Hanging loop at the top tip — see `LoopData`. Absent = no loop (default for every pattern). */
  loop?: LoopData
  createdAt: number
  updatedAt: number
}

export type MeasurementUnit = 'mm' | 'cm' | 'in'
