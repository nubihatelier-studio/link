import type { RowShape, Technique } from './types'

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
 * Generates a centered row shape for a named silhouette preset — the
 * starting point offered at creation time (and re-appliable later); every
 * row stays individually editable afterward via the "forma del cuerpo"
 * editor mode. Tapers linearly from full width (`cols`) down to 1 bead at
 * the silhouette's point(s), narrowing symmetrically from both edges each
 * row — same as increasing/decreasing 1 bead per side in real brick stitch.
 */
export function createShapedRowShape(preset: BodyShapePreset, cols: number, rows: number): RowShape[] {
  function widthAtFraction(t: number): number {
    return Math.max(1, Math.round(1 + t * (cols - 1)))
  }

  return Array.from({ length: rows }, (_, r) => {
    const t = rows <= 1 ? 1 : r / (rows - 1)
    let width: number
    switch (preset) {
      case 'rectangle':
        width = cols
        break
      case 'triangle': // narrow top, full-width bottom
        width = widthAtFraction(t)
        break
      case 'triangleInverted': // full-width top, narrow bottom
        width = widthAtFraction(1 - t)
        break
      case 'rhombus': {
        // widest at the middle row, narrow at both ends.
        const distFromMid = Math.abs(t - 0.5) * 2
        width = widthAtFraction(1 - distFromMid)
        break
      }
    }
    const offset = Math.floor((cols - width) / 2)
    return { offset, length: width }
  })
}
