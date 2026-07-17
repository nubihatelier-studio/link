import type { PatternConfig } from './types'
import { buildWeaveOrder, unitIndexOf, weaveUnit } from './weaveOrder'

export interface WeaveProgressSummary {
  unit: 'row' | 'column'
  /** 0-based index of the current row/column. */
  unitIndex: number
  /** total rows or columns, whichever is this technique's weave unit. */
  unitCount: number
  /** 0-100, rounded. */
  percent: number
}

/**
 * Turns a raw `currentIndex` (position in the technique's bead traversal
 * order — see `buildWeaveOrder`) into the "Columna 23 de 50 · 46%" summary
 * shown on the home screen. Returns null when there's no real progress yet
 * (`currentIndex` < 0, i.e. weaving hasn't started) or the pattern has no
 * cells to weave at all.
 */
export function summarizeWeaveProgress(config: PatternConfig, currentIndex: number): WeaveProgressSummary | null {
  if (currentIndex < 0) return null
  const { technique, cols, rows } = config
  const order = buildWeaveOrder(technique, cols, rows)
  const total = order.length
  if (total === 0) return null

  const clampedIndex = Math.min(currentIndex, total - 1)
  const unit = weaveUnit(technique)
  const unitCount = unit === 'column' ? cols : rows
  const unitIndex = unitIndexOf(technique, order[clampedIndex])
  const percent = Math.round(((clampedIndex + 1) / total) * 100)

  return { unit, unitIndex, unitCount, percent }
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
