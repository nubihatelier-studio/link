import type { FringeData, PatternConfig, RowShape } from './types'
import { buildWeaveOrder, isFringeStep, unitIndexOf, weaveUnit } from './weaveOrder'

export interface WeaveProgressSummary {
  unit: 'row' | 'column'
  /** 0-based index of the current row/column — pinned to the last body unit while `isFringe` is true (see below). */
  unitIndex: number
  /** total rows or columns, whichever is this technique's weave unit. */
  unitCount: number
  /** 0-100, rounded. */
  percent: number
  /** True once progress has moved past the body into the fringe zone — callers should show a fringe-specific label instead of "unit X of Y" (unitIndex/unitCount stop advancing here). */
  isFringe: boolean
}

/**
 * Turns a raw `currentIndex` (position in the technique's bead traversal
 * order — see `buildWeaveOrder`) into the "Columna 23 de 50 · 46%" summary
 * shown on the home screen. Returns null when there's no real progress yet
 * (`currentIndex` < 0, i.e. weaving hasn't started) or the pattern has no
 * cells to weave at all. `fringe` and `rowShape`, when given, are folded
 * into the total so `percent` stays accurate for a pattern with fringe
 * and/or a shaped (triangle/rhombus) body.
 */
export function summarizeWeaveProgress(
  config: PatternConfig,
  currentIndex: number,
  fringe?: FringeData,
  rowShape?: RowShape[],
): WeaveProgressSummary | null {
  if (currentIndex < 0) return null
  const { technique, cols, rows } = config
  const order = buildWeaveOrder(technique, cols, rows, fringe, rowShape)
  const total = order.length
  if (total === 0) return null

  const clampedIndex = Math.min(currentIndex, total - 1)
  const step = order[clampedIndex]
  const isFringe = isFringeStep(step)
  const unit = weaveUnit(technique)
  const unitCount = unit === 'column' ? cols : rows
  const unitIndex = isFringe ? unitCount - 1 : unitIndexOf(technique, step)
  const percent = Math.round(((clampedIndex + 1) / total) * 100)

  return { unit, unitIndex, unitCount, percent, isFringe }
}

/**
 * Which pattern to feature as "continue weaving" on the home screen: the
 * one with the most recently updated in-progress record. Ignores patterns
 * with no progress at all (`currentIndex` < 0).
 */
export function pickMostRecentInProgress(
  progress: Record<string, { currentIndex: number; updatedAt: number }>,
): string | null {
  let bestId: string | null = null
  let bestUpdatedAt = -Infinity
  for (const [patternId, p] of Object.entries(progress)) {
    if (p.currentIndex < 0) continue
    if (p.updatedAt > bestUpdatedAt) {
      bestId = patternId
      bestUpdatedAt = p.updatedAt
    }
  }
  return bestId
}
