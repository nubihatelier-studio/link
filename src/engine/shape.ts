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

/**
 * The column/row combination that lets a shaped preset's silhouette taper
 * by exactly 1 bead per edge on *every* row — no row ever sits still on one
 * side while the other grows, the "diagonales parejas" a hand-charted
 * brick-stitch diamond or triangle always has. `rows` lists every row count
 * that qualifies (rhombus genuinely has two valid answers; the others have
 * one), and `cols` is the nearest odd value to the one passed in (rounding
 * up on a tie, e.g. 12 -> 13) — `cols` must always come out odd, see below.
 *
 * Derivation: growing every edge by exactly 1 bead per transition needs a
 * total growth budget of `cols - 1` split evenly across however many
 * row-to-row transitions the taper has (`widthsAlongTaper`'s `dMax`, 1 bead
 * per edge = 2 beads of total width per transition). That division is only
 * exact — no row ever left with a lone 1-bead (single-edge) growth forced
 * onto it by the leftover remainder — when `cols - 1` is itself even, i.e.
 * `cols` is odd. (An even `cols` isn't invalid — `createShapedRowShape`
 * still produces a valid, hard-cap-respecting silhouette for it, per
 * "Generar bordes, no anchos" — it just can't do it with a perfectly even
 * diagonal, since there's a real half-bead of budget left over somewhere.)
 *
 * - rhombus: the taper only runs from a tip to the *peak*, half the total
 *   climb, needing `(cols - 1) / 2` transitions on each side (an integer
 *   exactly because `cols` is odd). `rows === cols` spends all of them
 *   reaching a single centered peak row; `rows === cols + 1` spends the same
 *   count but leaves the peak as a two-row plateau instead — both are
 *   equally "perfect", just a single point vs. a flat top.
 * - triangle/triangleInverted taper across the *entire* height (there's only
 *   one tip, not two), so all `rows - 1` transitions carry the full climb:
 *   `rows - 1 = (cols - 1) / 2`, i.e. `rows === (cols + 1) / 2`.
 * - rectangle has no taper at all — any `rows` already fits, so this
 *   function isn't meaningful for it (callers should just skip the check).
 */
export function idealDimensionsFor(preset: BodyShapePreset, cols: number): { cols: number; rows: number[] } {
  const oddCols = cols % 2 === 0 ? cols + 1 : cols
  switch (preset) {
    case 'rectangle':
      return { cols: oddCols, rows: [] }
    case 'rhombus':
      return { cols: oddCols, rows: [oddCols, oddCols + 1] }
    case 'triangle':
    case 'triangleInverted':
      return { cols: oddCols, rows: [(oddCols + 1) / 2] }
  }
}

/** Whether `cols`/`rows` already taper by exactly 1 bead per edge per row for `preset` — see `idealDimensionsFor`. Rectangle always fits; it has no taper to break. */
export function fitsPerfectly(preset: BodyShapePreset, cols: number, rows: number): boolean {
  if (preset === 'rectangle') return true
  const ideal = idealDimensionsFor(preset, cols)
  return ideal.cols === cols && ideal.rows.includes(rows)
}

/**
 * The offset (in cell-index space) that centers a row of the given `width`
 * on the pattern's physical vertical axis, computed in *physical*
 * coordinates rather than raw indices: brick's own per-row 0.5 stagger (odd
 * rows sit half a bead to the right, see `geometry.ts#cellPosition`) is
 * folded into the target, so `Math.round` lands on the nearer integer
 * automatically. Can land exactly on a `.5` when the row's parity and
 * `(cols - width)`'s parity mismatch — centering is then mathematically
 * impossible to hit exactly.
 */
function idealOffsetFor(cols: number, width: number, row: number): number {
  const rowXOffset = isOddIndex(row) ? 0.5 : 0
  return (cols - width) / 2 - rowXOffset
}

/**
 * Splits a total width-growth budget evenly across `steps` row-to-row
 * transitions using an error-accumulator (Bresenham-style) distribution,
 * rather than front-loading all the big steps — the same technique used to
 * rasterize a straight line on a pixel grid, applied here to keep a taper's
 * diagonal as even as possible instead of lumping growth into a few rows.
 */
function distributeGrowth(total: number, steps: number): number[] {
  if (steps <= 0) return []
  const base = Math.floor(total / steps)
  const remainder = total % steps
  let error = 0
  const growths: number[] = []
  for (let i = 0; i < steps; i++) {
    error += remainder
    if (error >= steps) {
      growths.push(base + 1)
      error -= steps
    } else {
      growths.push(base)
    }
  }
  return growths
}

/**
 * Turns each transition's total growth (0, 1, or 2 beads) into a left/right
 * split: a growth of 2 always splits evenly (1 bead per edge, real brick
 * stitch never widens a single edge by more than 1 bead in one row); a
 * growth of 1 has to land on one edge, so *which* edge alternates strictly
 * across the sequence of odd-growth transitions — never the same side twice
 * in a row, and never both edges of the same transition (that would be the
 * "double-step" bug: one edge jumping 2 beads while the other holds still).
 */
function splitGrowth(growths: number[], startFavorLeft: boolean): { left: number; right: number }[] {
  let favorLeft = startFavorLeft
  return growths.map((g) => {
    if (g === 2) return { left: 1, right: 1 }
    if (g === 0) return { left: 0, right: 0 }
    const split = favorLeft ? { left: 1, right: 0 } : { left: 0, right: 1 }
    favorLeft = !favorLeft
    return split
  })
}

/**
 * The width at each step `d` (0..`dMax`) of a taper from a single bead (`d
 * = 0`) growing outward, plus `leftCum[d]` — how many beads the left edge
 * has grown by step `d`, the piece `createTaperedRowShape` needs to walk
 * the offset (see there for why offset must be *derived from* this
 * cumulative growth rather than re-centered independently every row).
 * Growth is capped at `2 * dMax` (1 bead per edge per transition, the hard
 * per-row cap real brick stitch has) — for a taper with too few rows to
 * reach `cols` at that rate, the peak simply falls short of full width
 * rather than breaking the cap. When that happens, `cols` itself is left
 * untouched (never shrunk to match the achieved peak) — `bestTaperTrajectory`
 * still centers every row on `cols / 2`, so the unreached columns split
 * evenly as a symmetric margin on both sides rather than piling up on one
 * side. Shrinking `cols` instead would silently change a dimension the
 * user actually typed; a centered, deliberately-empty margin reads as "this
 * shape doesn't reach the edges here" rather than a bug, and the row stays
 * editable to widen it manually regardless.
 */
function widthsAlongTaper(cols: number, dMax: number, startFavorLeft: boolean): { widths: number[]; leftCum: number[] } {
  const totalGrowth = Math.min(cols - 1, 2 * dMax)
  const splits = splitGrowth(distributeGrowth(totalGrowth, dMax), startFavorLeft)
  const leftCum = [0]
  const rightCum = [0]
  for (const s of splits) {
    leftCum.push(leftCum[leftCum.length - 1] + s.left)
    rightCum.push(rightCum[rightCum.length - 1] + s.right)
  }
  const widths = leftCum.map((lc, d) => 1 + lc + rightCum[d])
  return { widths, leftCum }
}

/**
 * Picks the starting tip offset and the growth-alternation's starting side
 * that together keep every affected row's physical center as close as
 * possible to `cols/2`, out of the 4 combinations that matter (2 tip
 * candidates — a tie always rounds `.5` one of two ways — times 2
 * alternation phases). This is a search rather than a formula because a
 * single row-independent centering rule (rounding each row's own ideal
 * offset in isolation, as a previous version of this file did) can't also
 * guarantee the "at most 1 bead per edge per row" cap — the two constraints
 * only reconcile for specific tip/phase choices, so we
 * just try the handful that exist and keep the best one that stays in
 * bounds throughout. `rowsAt(d)` returns every row index sharing tier `d`
 * (a rhombus's two mirrored rows can have different brick parity, so both
 * must be checked, not just one).
 */
function bestTaperTrajectory(
  cols: number,
  dMax: number,
  tipRow: number,
  rowsAt: (d: number) => number[],
): { widths: number[]; leftCum: number[]; tipOffset: number } {
  let best: { widths: number[]; leftCum: number[]; tipOffset: number; maxDev: number } | null = null
  for (const startFavorLeft of [true, false]) {
    const { widths, leftCum } = widthsAlongTaper(cols, dMax, startFavorLeft)
    const tipIdeal = idealOffsetFor(cols, widths[0], tipRow)
    for (const tipOffset of new Set([Math.floor(tipIdeal), Math.ceil(tipIdeal)])) {
      let inBounds = true
      let maxDev = 0
      for (let d = 0; d <= dMax && inBounds; d++) {
        const offset = tipOffset - leftCum[d]
        if (offset < 0 || offset + widths[d] > cols) {
          inBounds = false
          break
        }
        for (const row of rowsAt(d)) {
          const physicalCenter = offset + (isOddIndex(row) ? 0.5 : 0) + widths[d] / 2
          maxDev = Math.max(maxDev, Math.abs(physicalCenter - cols / 2))
        }
      }
      if (!inBounds) continue
      if (best === null || maxDev < best.maxDev - 1e-9) best = { widths, leftCum, tipOffset, maxDev }
    }
  }
  // Falls back to the untapered single-bead tip if every candidate somehow
  // went out of bounds (shouldn't happen for cols >= 1, dMax >= 0).
  return best ?? { widths: [1], leftCum: [0], tipOffset: 0 }
}

/**
 * Assembles a full-height row shape from a taper's width/offset-at-each-`d`
 * trajectory, via `dOfRow` (row index -> tier `d`) and `rowsAtD` (tier `d`
 * -> every row sharing it, for the trajectory search above).
 */
function createTaperedRowShape(
  cols: number,
  rows: number,
  dMax: number,
  tipRow: number,
  dOfRow: (r: number) => number,
  rowsAtD: (d: number) => number[],
): RowShape[] {
  const { widths, leftCum, tipOffset } = bestTaperTrajectory(cols, dMax, tipRow, rowsAtD)
  return Array.from({ length: rows }, (_, r) => {
    const d = dOfRow(r)
    return { offset: tipOffset - leftCum[d], length: widths[d] }
  })
}

/**
 * Generates a centered row shape for a named silhouette preset — the
 * starting point offered at creation time (and re-appliable later); every
 * row stays individually editable afterward via the "forma del cuerpo"
 * editor mode. Tapers from a single bead at the silhouette's point(s) up to
 * (at most) full width, growing each edge by at most 1 bead per row — same
 * as a real brick-stitch increase/decrease — so the diagonal never takes a
 * 2-bead step on one side while the other side holds still.
 *
 * A single row (or single column) has no taper to speak of, so it's handled
 * directly rather than through the edge-growth machinery below, which
 * assumes at least one row-to-row transition exists.
 */
export function createShapedRowShape(preset: BodyShapePreset, cols: number, rows: number): RowShape[] {
  if (cols <= 1) {
    return Array.from({ length: rows }, () => ({ offset: 0, length: Math.max(1, cols) }))
  }
  if (rows <= 1) {
    // No taper is possible with a single row — every preset degenerates to
    // its own fraction-of-1 width (triangleInverted's narrow end lands on 1
    // bead; the others land on full width), same as before this round.
    const width = preset === 'triangleInverted' ? 1 : cols
    return Array.from({ length: rows }, () => ({ offset: Math.max(0, Math.floor((cols - width) / 2)), length: width }))
  }
  switch (preset) {
    case 'rectangle':
      return createRectangleRowShape(cols, rows)
    case 'triangle': // narrow top, full-width bottom
      return createTaperedRowShape(cols, rows, rows - 1, 0, (r) => r, (d) => [d])
    case 'triangleInverted': // full-width top, narrow bottom
      return createTaperedRowShape(
        cols,
        rows,
        rows - 1,
        rows - 1,
        (r) => rows - 1 - r,
        (d) => [rows - 1 - d],
      )
    case 'rhombus': {
      const dMax = Math.floor((rows - 1) / 2)
      return createTaperedRowShape(
        cols,
        rows,
        dMax,
        0,
        (r) => Math.min(r, rows - 1 - r),
        (d) => (d === rows - 1 - d ? [d] : [d, rows - 1 - d]),
      )
    }
  }
}
