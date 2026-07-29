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
 * The row count to actually request when *applying* `preset` fresh (at
 * creation time or when picking a body-shape preset) — not a constraint on
 * `createShapedRowShape` itself, which must always honor whatever `rows`
 * it's given, since a saved pattern or one a weaver freely resized
 * afterward may well have an "unideal" row count and still needs a valid,
 * best-effort silhouette (see `widthAt`/`recenterRowShape` above).
 *
 * `triangle` and `rhombus` each have one row whose width is pinned to a
 * specific value — triangle's widest row (always `cols`) sits at absolute
 * index `rows - 1`; rhombus's peak sits in the middle. In both cases that
 * row's raw offset is *forced* (not a centering choice: a full-width row can
 * only have offset 0; a rhombus peak's own width pins it just as tightly).
 * Its physical position on top of that is `offset + xOf(row)`, and `xOf` is
 * entirely determined by whether that absolute row index is even or odd
 * (`geometry.ts#cellPosition`) — which is fixed by `rows` alone, not
 * choosable by any centering algorithm:
 *
 * - `triangle`: the pinned row is `rows - 1`. When `rows` is even, `rows-1`
 *   is odd, so that row's physical span is forced half a bead right of
 *   where a weaver would expect it (measured and confirmed: `cols=13,
 *   rows=12` centers every row at 7.0 instead of 6.5, with the widest row
 *   spanning physical 0.5–13.5 instead of 0–13). When `rows` is odd,
 *   `rows-1` is even and the bias disappears — verified centering exactly
 *   at 6.5 for `rows=13`.
 * - `triangleInverted`: its pinned (full-width) row is always index 0 —
 *   always even — so it never has this bias, regardless of `rows`.
 * - `rhombus`: with an even `rows`, the peak is a 2-row plateau (both rows
 *   the same width) whose two rows necessarily have *different* parities —
 *   a mirror pair that can never land on the exact same physical center
 *   (documented since Round D/E). An odd `rows` gives a single centered
 *   peak row instead, with no plateau and no mismatched pair.
 *
 * Both are the same underlying issue — an even `rows` forces a parity clash
 * somewhere a centering algorithm can't paper over — so both get the same
 * fix: nudge an even `rows` up by 1 before generating. This only happens
 * when a preset is *chosen* (silently, no dialog — see ConfiguratorPage.tsx);
 * `rows` is never rewritten once a pattern exists, so a weaver adding or
 * removing rows by hand afterward is always free to land on an even count
 * again if they want to (still a fully valid, bounded silhouette — just with
 * the small, physically-forced imperfection above).
 */
export function preferredRowsFor(preset: BodyShapePreset, rows: number): number {
  if (preset === 'rectangle' || preset === 'triangleInverted') return rows
  return isOddIndex(rows) ? rows : rows + 1
}

/**
 * ROOT CAUSE FIX — read this before touching anything below.
 *
 * Real brick stitch increases or decreases a row by exactly ONE bead per
 * edge-change, and brick stitch *itself* already staggers every other row
 * by half a bead (`geometry.ts#cellPosition`'s `xOffset`). A previous
 * version of this generator grew a taper's width by 2 beads per row (1 bead
 * each side, every transition) — stacked on top of brick's own 0.5 stagger,
 * that made each edge alternate advancing 0.5 and 1.5 beads per row instead
 * of a constant 0.5, i.e. a visible sawtooth. The fix has two parts:
 *
 * 1. `widthAt` — the target width at each row is a plain clamped ramp that
 *    changes by *at most 1 bead total* between consecutive rows (never 2).
 *    There is no "growth budget" to distribute any more (no Bresenham, no
 *    left/right split of a 2-bead step) — the slope is fixed at 1, so any
 *    `cols`/`rows` combination tapers perfectly. (This also means there's no
 *    such thing as "dimensions that don't fit" any more — every combination
 *    produces a clean diagonal, just possibly capped below `cols` if there
 *    aren't enough rows to reach it.)
 *
 * 2. `walkOffsets` — which single edge absorbs that 1-bead change is not a
 *    free choice: it's locked to the row's own parity, precisely so the
 *    edge's *physical* position (raw offset + brick's own 0.5 stagger) always
 *    advances by exactly half a bead, matching the other, unchanged edge.
 *    Growing into an odd row must come from the left (raw offset -1);
 *    growing into an even row must come from the right (length +1 only).
 *    Shrinking is the mirror: odd row -> from the right, even row -> from
 *    the left. Get the side wrong for a row's parity and that row's edge
 *    jumps 1.5 beads while the other side holds still — exactly the bug.
 *
 * A pleasant consequence of rule 2: because every non-plateau transition
 * moves both edges by exactly half a bead in lockstep, the silhouette's
 * physical center never drifts once row 0 is centered — every other row
 * inherits the same center for free. `walkOffsets` below still tries both of
 * row 0's centering candidates (a much smaller search than the old
 * generator's `bestTaperTrajectory`, which searched per row-tier, not once
 * per shape) only because a plateau can bounce the center by another half
 * bead in a direction fixed by parity, not choice. See shape.test.ts for the
 * proof-by-exhaustive-check across the required dimension matrix.
 */
function widthAt(preset: BodyShapePreset, cols: number, rows: number, r: number): number {
  switch (preset) {
    case 'rectangle':
      return cols
    case 'triangle': // narrow top, full-width bottom — widest row (rows-1) reaches cols; narrowest (row 0) is cols-(rows-1), floored at 1 (a flat top edge, not a point, once rows-1 >= cols).
      return Math.min(cols, Math.max(1, cols - (rows - 1 - r)))
    case 'triangleInverted': // full-width top, narrow bottom — mirror of triangle.
      return Math.min(cols, Math.max(1, cols - r))
    case 'rhombus': {
      // Grows 1 bead/row from a 1-bead tip up to (at most) cols, then mirrors
      // back down — `d` is the distance to the nearer tip/end.
      const d = Math.min(r, rows - 1 - r)
      return Math.min(cols, 1 + d)
    }
  }
}

/**
 * Walks the offset trajectory forward from a *given* row-0 anchor — see
 * `walkOffsets` for why the anchor itself needs two candidates, not one.
 *
 * `cols` is only needed for the `Math.abs(delta) > 1` fallback: a width jump
 * bigger than 1 bead has no single parity-locked "correct" side (that rule
 * only exists for the ±1-per-row taper `widthAt` produces) — it can only
 * happen when `recenterRowShape` is handed a row shape that didn't come from
 * a fresh preset (e.g. several independent manual edge edits stacked up
 * without a recenter in between), so it just centers that one row on its
 * own rather than guessing a side.
 */
function walkFrom(cols: number, widths: number[], anchor: number): number[] {
  const offsets = [anchor]
  for (let r = 1; r < widths.length; r++) {
    const delta = widths[r] - widths[r - 1]
    if (Math.abs(delta) > 1) {
      const centered = Math.round((cols - widths[r]) / 2 - (isOddIndex(r) ? 0.5 : 0))
      offsets.push(Math.max(0, Math.min(cols - widths[r], centered)))
    } else if (delta === 1 && isOddIndex(r)) offsets.push(offsets[r - 1] - 1) // grow left
    else if (delta === -1 && !isOddIndex(r)) offsets.push(offsets[r - 1] + 1) // shrink left
    else offsets.push(offsets[r - 1]) // grew/shrank right, or no change at all
  }
  return offsets
}

/**
 * Walks a taper's raw offset row by row from a centered anchor at row 0,
 * given its already-computed width sequence — see `widthAt`'s doc comment
 * above for why the growth/shrink side is locked to each row's parity rather
 * than chosen freely.
 *
 * Row 0's own ideal center, `(cols - widths[0]) / 2`, lands exactly on an
 * integer only when `cols - widths[0]` is even; otherwise there are two
 * equally-centered integer candidates (floor and ceil, each half a bead off
 * to either side). A *non-plateau* transition (width changes by ±1) always
 * keeps every row's physical center identical to row 0's — but a *plateau*
 * transition (width unchanged, e.g. a rhombus's flat 2-row peak, or extra
 * rows clamped flat at the top/bottom for a very mismatched `cols`/`rows`)
 * shifts the center by another half bead, in a direction fixed by parity,
 * not by choice. Depending on which of the two row-0 anchors is picked, that
 * shift can land back on-center (best case) or double the deviation to a
 * full bead (worst case) — and one anchor can also simply run out of bounds
 * before the other does. So: try both, discard whichever goes out of bounds,
 * and of what's left keep whichever keeps every row's center closest to
 * `cols / 2`.
 */
function walkOffsets(cols: number, widths: number[]): number[] {
  const ideal = (cols - widths[0]) / 2
  let best: { offsets: number[]; maxDev: number; rawAsymmetry: number } | null = null
  for (const anchor of new Set([Math.floor(ideal), Math.ceil(ideal)])) {
    const offsets = walkFrom(cols, widths, anchor)
    if (!offsets.every((o, r) => o >= 0 && o + widths[r] <= cols)) continue
    const maxDev = Math.max(
      ...offsets.map((o, r) => Math.abs(o + (isOddIndex(r) ? 0.5 : 0) + widths[r] / 2 - cols / 2)),
    )
    // A tie here (both anchors land exactly half a bead off, just to
    // opposite sides — the brick stagger term makes that possible) is broken
    // by raw offset/length symmetry in plain column-index space, ignoring
    // the stagger entirely: physically equivalent, but the one a weaver
    // charting it by column number would call "centered".
    const rawAsymmetry = offsets.reduce((sum, o, r) => sum + Math.abs(2 * o + widths[r] - cols), 0)
    const better =
      best === null || maxDev < best.maxDev - 1e-9 || (Math.abs(maxDev - best.maxDev) < 1e-9 && rawAsymmetry < best.rawAsymmetry)
    if (better) best = { offsets, maxDev, rawAsymmetry }
  }
  // Shouldn't happen for a valid width sequence — fall back rather than crash.
  return best?.offsets ?? walkFrom(cols, widths, Math.round(ideal))
}

/**
 * Recenters a row shape from scratch, given only its widths — the fix for
 * "Agregar/Quitar fila" accumulating drift (Corrección 1). Every previous
 * version of this file computed a fresh preset's offsets this way already,
 * but `addRowAtTop`/`removeRowAtTop`/`growRowEdge`/`shrinkRowEdge` used to
 * patch just the one row they touched and leave every other row's *offset*
 * untouched — which silently breaks, because inserting or removing a row
 * shifts every row below it to a new absolute index, flipping its brick
 * parity (`geometry.ts#cellPosition`'s odd/even stagger). An offset that was
 * correct for the old index is generally wrong for the new one, and the
 * error compounds with every further edit (see shape.test.ts's regression
 * fixture — 5 additions in a row used to skew the whole silhouette into a
 * lopsided parallelogram). The fix is to never patch incrementally: always
 * re-derive every row's offset from its width and its (possibly new)
 * absolute index, treating centeredness as an invariant to restore, not a
 * value to carry forward.
 */
export function recenterRowShape(rowShape: RowShape[], cols: number): RowShape[] {
  const widths = rowShape.map((row) => row.length)
  const offsets = walkOffsets(cols, widths)
  return widths.map((length, r) => ({ offset: offsets[r], length }))
}

function createTaperedRowShape(preset: BodyShapePreset, cols: number, rows: number): RowShape[] {
  const widths = Array.from({ length: rows }, (_, r) => widthAt(preset, cols, rows, r))
  return recenterRowShape(
    widths.map((length) => ({ offset: 0, length })),
    cols,
  )
}

/**
 * Generates a centered row shape for a named silhouette preset — the
 * starting point offered at creation time (and re-appliable later); every
 * row stays individually editable afterward via the "forma del cuerpo"
 * editor mode. See the comment above `widthAt` for the taper rule itself.
 *
 * A single row (or single column) has no taper to speak of, so it's handled
 * directly rather than through the edge-growth machinery above, which
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
  if (preset === 'rectangle') return createRectangleRowShape(cols, rows)
  return createTaperedRowShape(preset, cols, rows)
}
