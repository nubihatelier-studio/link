import type { FringeData, RowShape, Technique } from './types'

/** Initial shape offered at creation time — purely a starting point, every length stays editable afterward. */
export type FringeShape = 'straight' | 'v' | 'cascade'

/** Peyote's column-major zigzag traversal doesn't have a clean "last body row" to hang a fringe from — brick and loom do. */
export function isFringeCapable(technique: Technique): boolean {
  return technique !== 'peyote'
}

export function createEmptyFringe(cols: number): FringeData {
  return {
    lengths: Array.from({ length: cols }, () => 0),
    turnBeads: Array.from({ length: cols }, () => false),
  }
}

/**
 * Ensures a fringe's arrays match the pattern's current column count —
 * patterns saved before this feature existed have no `fringe` at all
 * (treated as fully empty), and even patterns that do have one could in
 * principle be loaded against a stale `cols` if that ever changes. Extra
 * columns are dropped; new ones start at 0 (no fringe).
 */
export function normalizeFringe(fringe: FringeData | undefined, cols: number): FringeData {
  if (!fringe) return createEmptyFringe(cols)
  const lengths = Array.from({ length: cols }, () => 0)
  const turnBeads = Array.from({ length: cols }, () => false)
  for (let i = 0; i < cols; i++) {
    lengths[i] = fringe.lengths[i] ?? 0
    turnBeads[i] = fringe.turnBeads[i] ?? false
  }
  return { lengths, turnBeads }
}

export function maxFringeLength(fringe: FringeData | undefined): number {
  if (!fringe || fringe.lengths.length === 0) return 0
  return Math.max(0, ...fringe.lengths)
}

export function totalFringeBeadCount(fringe: FringeData | undefined): number {
  if (!fringe) return 0
  return fringe.lengths.reduce((sum, n) => sum + n, 0)
}

/** Whether a grid row index falls in the fringe zone (hanging below the `bodyRows`-tall body). */
export function isFringeRow(bodyRows: number, row: number): boolean {
  return row >= bodyRows
}

/** 0-based distance below the body for a fringe row (0 = the bead closest to the body). */
export function fringeDepthOf(bodyRows: number, row: number): number {
  return row - bodyRows
}

/**
 * Whether (row, col) is a real, paintable cell — in the body (respecting a
 * shaped row's own offset/length, if given), or in that column's current
 * fringe (row/col tools all share this one check, so "does painting work on
 * fringe" reduces to "does this function know about `fringe`", see
 * engine/editorStore.ts).
 *
 * A fringe strand can only hang from a column the body's LAST row actually
 * reaches — for a shaped (triangle/rhombus) body that's not every column,
 * just that row's own span — so `rowShape`'s last entry gates the fringe
 * branch too, even though fringe rows themselves have no shape of their own.
 */
export function isPaintableCell(
  row: number,
  col: number,
  cols: number,
  bodyRows: number,
  fringe?: FringeData,
  rowShape?: RowShape[],
): boolean {
  if (row < 0 || col < 0 || col >= cols) return false
  if (row < bodyRows) {
    const shape = rowShape?.[row]
    if (!shape) return true
    return col >= shape.offset && col < shape.offset + shape.length
  }
  const lastRowShape = rowShape?.[bodyRows - 1]
  if (lastRowShape && (col < lastRowShape.offset || col >= lastRowShape.offset + lastRowShape.length)) return false
  const fringeLength = fringe?.lengths[col] ?? 0
  return row < bodyRows + fringeLength
}

/**
 * Initial per-column lengths for the three starter shapes offered at
 * creation. All three are just a starting point — every length is
 * individually editable afterward, so these don't need to be anything more
 * than a reasonable-looking default.
 */
export function createFringeLengths(shape: FringeShape, cols: number, maxLength: number): number[] {
  const clampedMax = Math.max(0, Math.round(maxLength))
  if (cols <= 0 || clampedMax === 0) return Array.from({ length: Math.max(0, cols) }, () => 0)

  switch (shape) {
    case 'straight':
      return Array.from({ length: cols }, () => clampedMax)

    case 'v': {
      // Longest at the center column, tapering linearly down to 1 bead at
      // the two edge columns — the classic "V" fringe silhouette.
      const center = (cols - 1) / 2
      const maxDist = center || 1
      return Array.from({ length: cols }, (_, i) => {
        const distFromCenter = Math.abs(i - center)
        const t = distFromCenter / maxDist
        return Math.max(1, Math.round(clampedMax - (clampedMax - 1) * t))
      })
    }

    case 'cascade': {
      // Repeating ascending staircase — groups of 4 columns stepping
      // 1/4, 2/4, 3/4, 4/4 of maxLength, then resetting — a staggered
      // "waterfall" look instead of a flat or symmetric edge.
      const STEPS = 4
      return Array.from({ length: cols }, (_, i) => {
        const fraction = ((i % STEPS) + 1) / STEPS
        return Math.max(1, Math.round(clampedMax * fraction))
      })
    }
  }
}
