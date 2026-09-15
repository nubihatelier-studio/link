import type { PatternDoc } from '@/engine/types'
import { weaveProgressKey } from '@/store/weaveStore'

/** The library's filters: "Todos", "Favoritos", "En progreso", "Terminados". */
export type LibraryFilter = 'all' | 'favorites' | 'inProgress' | 'finished'

export const LIBRARY_FILTERS: LibraryFilter[] = ['all', 'favorites', 'inProgress', 'finished']

/** Where a pattern stands in weave mode. */
export type WeaveStatus = 'notStarted' | 'inProgress' | 'finished'

type ProgressMap = Record<string, { currentIndex: number; finishedAt?: number } | undefined>

/**
 * How far a pattern has been woven: finished once "Terminar" was tapped
 * (on both earrings, for a pair), in progress once any bead has been ticked
 * or one earring is finished, not started otherwise.
 */
export function weaveStatusOf(doc: PatternDoc, progress: ProgressMap): WeaveStatus {
  const records = (doc.pair ? (['left', 'right'] as const) : (['left'] as const)).map((side) => progress[weaveProgressKey(doc.id, side)])
  if (records.every((r) => r?.finishedAt)) return 'finished'
  if (records.some((r) => r && (r.currentIndex >= 0 || r.finishedAt))) return 'inProgress'
  return 'notStarted'
}

export function matchesLibraryFilter(doc: PatternDoc, status: WeaveStatus, filter: LibraryFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'favorites':
      return Boolean(doc.favorite)
    case 'inProgress':
      return status === 'inProgress'
    case 'finished':
      return status === 'finished'
  }
}
