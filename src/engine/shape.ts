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
 * automatically. Returns a fractional "exact tie" (`.5`) when the row's
 * parity and `(cols - width)`'s parity mismatch — centering is then
 * mathematically impossible to hit exactly, and the caller must resolve the
 * half-bead itself (see `resolveTiedOffsets`) rather than always rounding
 * the same direction.
 */
function idealOffsetFor(cols: number, width: number, row: number): number {
  const rowXOffset = isOddIndex(row) ? 0.5 : 0
  return (cols - width) / 2 - rowXOffset
}

function isExactTie(idealOffset: number): boolean {
  return Math.abs(idealOffset - Math.floor(idealOffset) - 0.5) < 1e-9
}

/**
 * Resolves every row's centering `idealOffset` (see above) down to an
 * integer, scanning top to bottom and alternating which side absorbs the
 * half-bead whenever a row is an unavoidable tie — never always the same
 * side (the previous bug: a plain `Math.floor((cols - width) / 2)` ignored
 * the stagger entirely and always broke ties the same way, producing a
 * jagged, off-axis silhouette).
 *
 * This only promises two things per row: its own width is centered on the
 * pattern's physical axis (within the unavoidable half-bead tie), and which
 * side absorbs that tie alternates across the piece. It does *not* force
 * `offset(i) === offset(rows-1-i)` for `rhombus` — for an even row count,
 * a mirror pair always has exactly one tied row and one exactly-centered
 * row (their parities differ), so the tied side has no free choice left:
 * copying the exact side's value there would work for that one pair, but
 * doing it for every pair can still end up funneling every tie in the whole
 * piece onto the same side (which side is "exact" vs "tied" in a pair is
 * fixed by parity, not a free choice) — precisely the "always the same
 * side" imbalance this function exists to avoid. A plain top-to-bottom
 * alternation sidesteps that: the *width* still mirrors exactly (see
 * `shapeWidthAt`), and any residual half-bead lean this leaves between a
 * row and its mirror is the same unavoidable slack every other tied row
 * gets, not a bias.
 */
function resolveOffsets(widths: number[], cols: number): number[] {
  let favorCeil = false
  return widths.map((width, r) => {
    const ideal = idealOffsetFor(cols, width, r)
    if (!isExactTie(ideal)) return Math.round(ideal)
    const offset = favorCeil ? Math.ceil(ideal) : Math.floor(ideal)
    favorCeil = !favorCeil
    return offset
  })
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
