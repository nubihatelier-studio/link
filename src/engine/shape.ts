import type { RowShape, Technique } from './types'
import { isOddIndex } from './geometry'

/** Peyote and loom don't have a natural "brick-stitch increase/decrease" — only brick stitch adds/drops a bead at a row's edge to taper its width. */
export function isShapeCapable(technique: Technique): boolean {
  return technique === 'brick'
}

/** Every row at full width, starting at column 0 — the shape of every pattern before this feature, and of every technique that isn't shape-capable. */
export function createRectangleRowShape(cols: number, rows: number): RowShape[] {
  return Array.from({ length: rows }, () => ({ offset: 0, length: cols }))
}

/**
 * Ensures a row shape's array matches the pattern's current rows/cols —
 * patterns saved before this feature existed have no `rowShape` at all
 * (treated as a full rectangle, same as `engine/fringe.ts#normalizeFringe`
 * treats a missing fringe as "no fringe"), and a saved shape could in
 * principle be loaded against a stale rows/cols if those ever change. Extra
 * rows are dropped; new ones default to full width. Each row's offset/length
 * is clamped so `offset >= 0`, `length >= 1`, and `offset + length <= cols`.
 */
export function normalizeRowShape(rowShape: RowShape[] | undefined, cols: number, rows: number): RowShape[] {
  return Array.from({ length: rows }, (_, r) => {
    const row = rowShape?.[r]
    const length = Math.min(Math.max(1, row?.length ?? cols), cols)
    const offset = Math.min(Math.max(0, row?.offset ?? 0), cols - length)
    return { offset, length }
  })
}

/** The widest row's length — the effective "how wide does this body actually get" once it has shape (as opposed to `config.cols`, which is the fixed column-index space every row's offset/length lives inside). */
export function maxRowWidth(rowShape: RowShape[]): number {
  return rowShape.reduce((max, r) => Math.max(max, r.length), 0)
}

export type BodyShapePreset = 'rectangle' | 'triangle' | 'triangleInverted' | 'rhombus'

/** Target width for row `r` of `rows` for a given preset — the taper shape, before any centering/offset math. */
function shapeWidthAt(preset: BodyShapePreset, cols: number, rows: number, r: number): number {
  function widthAtFraction(t: number): number {
    return Math.max(1, Math.round(1 + t * (cols - 1)))
  }
  const t = rows <= 1 ? 1 : r / (rows - 1)
  switch (preset) {
    case 'rectangle':
      return cols
    case 'triangle': // narrow top, full-width bottom
      return widthAtFraction(t)
    case 'triangleInverted': // full-width top, narrow bottom
      return widthAtFraction(1 - t)
    case 'rhombus': {
      // widest at the middle row, narrow at both ends. Computed from the
      // integer row distance `|2r - (rows-1)|` rather than `|t - 0.5| * 2` —
      // row `r` and its mirror `rows-1-r` produce the exact same integer
      // here (algebraically, not just approximately), so the resulting
      // width is bit-for-bit identical for both. Going through `t - 0.5`
      // instead let floating-point rounding diverge between a row and its
      // mirror often enough to round to a different integer width on one
      // side, breaking the vertical mirror the preset promises.
      const distFromMid = rows <= 1 ? 0 : Math.abs(2 * r - (rows - 1)) / (rows - 1)
      return widthAtFraction(1 - distFromMid)
    }
  }
}

/**
 * The offset (in cell-index space) that centers a row of the given `width`
 * on the pattern's physical vertical axis, computed in *physical*
 * coordinates rather than raw indices: brick's own per-row 0.5 stagger (odd
 * rows sit half a bead to the right, see `geometry.ts#cellPosition`) is
 * folded into the target, so `Math.round` lands on the nearer integer
 * automatically. Can land exactly on a `.5` when the row's parity and
 * `(cols - width)`'s parity mismatch — centering is then mathematically
 * impossible to hit exactly, and `resolveOffsets` rounds it like any other
 * value (see there for why that's the *correct* choice here, not a
 * shortcut).
 */
function idealOffsetFor(cols: number, width: number, row: number): number {
  const rowXOffset = isOddIndex(row) ? 0.5 : 0
  return (cols - width) / 2 - rowXOffset
}

/**
 * Resolves every row's centering `idealOffset` (see above) down to an
 * integer via a single, stateless `Math.round` — deliberately *not* scanning
 * rows in order and alternating which side a `.5` tie rounds to.
 *
 * That alternation was last round's fix, and it was wrong: QA measured the
 * physical center of each row of a `rhombus 12x10` (in half-bead units, tie
 * broken by row scan order) and got `11,12,12,13,11,12,12,13,11,12` — the
 * whole silhouette's spine zigzags a full bead because *which* row's tie
 * rounds up vs. down depends on how many ties came before it, not on
 * anything about that row itself. `Math.round` is a pure function of
 * `idealOffset` alone, so a `.5` tie always resolves the same direction
 * (JS rounds `.5` up) everywhere in the piece — the spine still isn't
 * perfectly straight (that's provably impossible, see below), but now it
 * only ever leans the *one* consistent way, so it stays within half a bead
 * of the axis instead of swinging a whole bead back and forth.
 *
 * Why a mirror pair (`r`, `rows-1-r`) of equal width can't always land on
 * the *same* physical center: their difference is
 * `offset(r) - offset(mirror) + (xOffset(r) - xOffset(mirror))`. For an
 * even `rows`, every mirror pair has opposite parity, so
 * `xOffset(r) - xOffset(mirror)` is always exactly `±0.5` — but the offsets
 * are integers, so their difference is always a whole number. A whole
 * number can never cancel out a `±0.5`, so the two centers can never be
 * exactly equal; this is brick's own fixed stagger showing through, the
 * same reason a real physical brick-stitch mirror pair of opposite parity
 * can't align either. For an *odd* `rows`, every mirror pair shares parity
 * instead, so `idealOffsetFor` gives them the identical value and
 * `Math.round` — being a pure function — resolves them identically too,
 * landing them on the exact same center automatically.
 */
function resolveOffsets(widths: number[], cols: number): number[] {
  return widths.map((width, r) => Math.round(idealOffsetFor(cols, width, r)))
}

/**
 * Generates a centered row shape for a named silhouette preset — the
 * starting point offered at creation time (and re-appliable later); every
 * row stays individually editable afterward via the "forma del cuerpo"
 * editor mode. Tapers linearly from full width (`cols`) down to 1 bead at
 * the silhouette's point(s), narrowing symmetrically from both edges each
 * row — same as increasing/decreasing 1 bead per side in real brick stitch.
 */
export function createShapedRowShape(preset: BodyShapePreset, cols: number, rows: number): RowShape[] {
  const widths = Array.from({ length: rows }, (_, r) => shapeWidthAt(preset, cols, rows, r))
  const offsets = resolveOffsets(widths, cols)
  return widths.map((width, r) => ({ offset: Math.max(0, Math.min(offsets[r], cols - width)), length: width }))
}
