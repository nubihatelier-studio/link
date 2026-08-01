/** Cell side in CSS px at 100% zoom — the canvas's own scale, mirrored from `CanvasGrid`. */
export const BASE_CELL_PX = 30

/**
 * Above this height/width ratio a pattern is a *strip* — a bracelet, a band,
 * a long fringe panel — and framing it whole is the wrong instinct: it shrinks
 * the beads to fit rows nobody is looking at while leaving most of the canvas
 * empty beside them. Nobody edits 41 rows at once; you edit the stretch you're
 * working on. So a strip is fitted to its WIDTH and scrolled vertically.
 *
 * 3 is deliberately well clear of the shapes that should keep the normal
 * framing — a 7 × 7 ring with a full fringe lands near 2.1.
 */
export const TALL_PATTERN_RATIO = 3

/** A strip is never opened smaller than 100% (that would defeat the point) nor blown up past this. */
const MIN_STRIP_ZOOM = 100
const MAX_STRIP_ZOOM = 200
/** Normal patterns are only ever scaled *down* to fit — a small pattern opens at its natural size, as it always has. */
const MAX_FIT_ZOOM = 100
/** Same floor as `editorStore.setZoom`, so the opening zoom is always one the controls can return to. */
const MIN_FIT_ZOOM = 25

export interface FitZoomInput {
  /** Pattern bounds in bead units, fringe and all — see `engine/geometry.ts#gridBoundsUnits`. */
  boundsWidth: number
  boundsHeight: number
  /** Space the canvas has to live in, in CSS px (the scroll container, padding already removed). */
  viewportWidth: number
  viewportHeight: number
  /** Ruler gutter the canvas reserves around the grid. */
  margin: number
}

/** True when the pattern is a strip and should be framed by width — see `TALL_PATTERN_RATIO`. */
export function isTallPattern(boundsWidth: number, boundsHeight: number): boolean {
  if (boundsWidth <= 0) return false
  return boundsHeight / boundsWidth > TALL_PATTERN_RATIO
}

/**
 * The zoom a pattern opens at. Strips are fitted to their width so the beads
 * stay big and readable and you scroll down through them; everything else
 * keeps the framing it has always had — the whole pattern in view, scaled
 * down only if it doesn't already fit.
 *
 * Only ever applied when a pattern is opened. Zoom buttons, pinch and panning
 * are untouched, and this never fights a zoom the weaver set herself.
 */
export function initialFitZoom(input: FitZoomInput): number {
  const { boundsWidth, boundsHeight, viewportWidth, viewportHeight, margin } = input
  if (boundsWidth <= 0 || boundsHeight <= 0) return MAX_FIT_ZOOM

  const usableWidth = viewportWidth - margin * 2
  const usableHeight = viewportHeight - margin * 2
  if (usableWidth <= 0 || usableHeight <= 0) return MAX_FIT_ZOOM

  const widthZoom = (usableWidth / (boundsWidth * BASE_CELL_PX)) * 100
  const heightZoom = (usableHeight / (boundsHeight * BASE_CELL_PX)) * 100

  if (isTallPattern(boundsWidth, boundsHeight)) {
    return clampRound(widthZoom, MIN_STRIP_ZOOM, MAX_STRIP_ZOOM)
  }
  return clampRound(Math.min(widthZoom, heightZoom), MIN_FIT_ZOOM, MAX_FIT_ZOOM)
}

/** Cell size (CSS px) a zoom percentage produces — for checking a framing keeps letters legible. */
export function cellPxAtZoom(zoom: number): number {
  return BASE_CELL_PX * (zoom / 100)
}

function clampRound(zoom: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, zoom)))
}
