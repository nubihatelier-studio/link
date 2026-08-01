import { contrastTextColor } from './color'

/**
 * How a single bead is drawn, in one place, because it was drifting: the
 * editor inset every bead on both axes and rounded its corners, while the
 * PDF filled the whole cell rectangle edge to edge. On a loom chart that
 * erased every gap; on peyote and brick, whose rows sit closer together than
 * one cell tall (see `geometry.ts#rowPitch`), the rectangles actually
 * overlapped and each column read as one continuous bar of colour instead of
 * a stack of beads.
 *
 * The editor is the reference — these are its numbers. Every surface that
 * draws a bead (editor canvas, weave canvas, PNG, Instagram card, PDF) takes
 * its geometry from here so the four can't diverge again.
 */

/** Gap around each bead, as a fraction of the cell — half of it on each side, so beads never touch. */
export const BEAD_GAP_RATIO = 0.05
/** Corner rounding, as a fraction of the cell: beads are rounded, not square pixels. */
export const BEAD_CORNER_RATIO = 0.12

/** On screen a bead has to stay visibly a bead even zoomed right out, so the ratios get a floor in px. */
export const MIN_BEAD_INSET_PX = 0.5
export const MIN_BEAD_RADIUS_PX = 1.5

export interface BeadMetrics {
  /** Distance from the cell edge to the bead on every side. */
  inset: number
  /** Corner radius for the bead's rounded rectangle. */
  radius: number
  /** Drawn bead width — the cell minus the gap. */
  width: number
  /** Drawn bead height — the cell minus the gap. */
  height: number
}

/**
 * Bead geometry for a cell of `cellW` × `cellH`.
 *
 * Pass the real distance to the next bead, not the nominal cell size, when
 * the two differ: peyote and brick step less than a full cell between rows,
 * so a bead sized to the nominal cell would overlap the one below it. Both
 * ratios key off the shorter side, which keeps the gap and the rounding even
 * on a non-square cell instead of stretching with it.
 *
 * `minInset`/`minRadius` default to 0 — right for vector output measured in
 * mm. Canvas callers pass the px floors above.
 */
export function beadMetrics(cellW: number, cellH: number, minInset = 0, minRadius = 0): BeadMetrics {
  const shortSide = Math.min(cellW, cellH)
  const inset = Math.max(minInset, shortSide * BEAD_GAP_RATIO)
  const radius = Math.max(minRadius, shortSide * BEAD_CORNER_RATIO)
  return {
    inset,
    radius,
    width: Math.max(0, cellW - inset * 2),
    height: Math.max(0, cellH - inset * 2),
  }
}

/** Canvas bead geometry — same as `beadMetrics` with the on-screen floors applied. */
export function beadMetricsPx(cellPx: number): BeadMetrics {
  return beadMetrics(cellPx, cellPx, MIN_BEAD_INSET_PX, MIN_BEAD_RADIUS_PX)
}

/**
 * Traces a bead's rounded rectangle on a 2D context. The one copy — this
 * lived three times over (editor canvas, weave canvas, PNG) with the same
 * body each time.
 *
 * Traces only: the caller opens the path (`ctx.beginPath()`) and decides
 * whether to fill it, stroke it, or both.
 */
export function beadPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/**
 * Letter colour for a bead of `hex` — black or white, whichever the bead's
 * own luminance can carry. Re-exported here so a surface drawing beads has
 * one import for the whole bead style, not two.
 */
export { contrastTextColor }
