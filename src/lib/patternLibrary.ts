import type { PatternDoc } from '@/engine/types'

export type LibrarySort = 'recent' | 'name' | 'technique'

/** Only patterns whose name contains `query` (case/accent-insensitive substring match). Empty/blank query matches everything. */
export function filterPatternsByName(patterns: PatternDoc[], query: string): PatternDoc[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return patterns
  return patterns.filter((p) => p.name.toLowerCase().includes(normalized))
}

/** Sorts a pattern list for the library — 'recent' (default) matches the existing most-recently-updated-first order. */
export function sortPatterns(patterns: PatternDoc[], sort: LibrarySort): PatternDoc[] {
  const sorted = [...patterns]
  if (sort === 'name') return sorted.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  if (sort === 'technique') {
    return sorted.sort((a, b) => a.config.technique.localeCompare(b.config.technique) || b.updatedAt - a.updatedAt)
  }
  return sorted.sort((a, b) => b.updatedAt - a.updatedAt)
}
