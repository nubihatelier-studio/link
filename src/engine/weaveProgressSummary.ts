import type { FringeData, PatternConfig, RowShape } from './types'
import { beadsThrough, buildWeaveOrder, isFringeStep, totalBeadCount } from './weaveOrder'

export interface WeaveProgressSummary {
  /** 0-based index of the current row — pinned to the last row while `isFringe` is true, meaningless (0) while `grouped` is true (see below). */
  unitIndex: number
  /** total rows in the body. */
  unitCount: number
  /** 0-100, rounded — based on beads strung, not raw step count (a grouped step can be worth more than one). */
  percent: number
  /** True once progress has moved past the body into the fringe zone — callers should show a fringe-specific label instead of "Fila X de Y" (unitIndex/unitCount stop advancing here). */
  isFringe: boolean
  /** True while progress is still on peyote's foundation pass — callers should show that label instead of "Fila X de Y". */
  grouped: boolean
}

/**
 * Turns a raw `currentIndex` (position in the technique's step traversal —
 * see `buildWeaveOrder`) into the "Fila 23 de 50 · 46%" summary shown on
 * the home screen. Returns null when there's no real progress yet
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
  if (order.length === 0) return null

  const clampedIndex = Math.min(currentIndex, order.length - 1)
  const step = order[clampedIndex]
  const isFringe = isFringeStep(step)
  const unitCount = rows
  const unitIndex = isFringe ? unitCount - 1 : step.unit
  const percent = Math.round((beadsThrough(order, clampedIndex) / totalBeadCount(order)) * 100)

  return { unitIndex, unitCount, percent, isFringe, grouped: step.grouped }
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
