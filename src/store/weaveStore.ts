import { create } from 'zustand'
import type { EarringSide } from '@/engine/types'
import { getStorageAdapter } from '@/storage'
import { migrateFromLocalStorage } from '@/storage/migration'

interface WeaveProgress {
  /** index into the technique's traversal order (see engine/weaveOrder.ts); -1 = not started */
  currentIndex: number
  /** Which `WEAVE_ORDER_VERSION` this index was saved under — absent on records saved before that versioning existed, treated as version 1 by `getOrderVersion`. */
  orderVersion?: number
  /** Set by "Terminar" — see `WeaveProgressRecord.finishedAt`. */
  finishedAt?: number
  updatedAt: number
}

interface WeaveState {
  progress: Record<string, WeaveProgress>
  /** Which pattern ids have been fetched from storage at least once (avoids re-fetching on every render). */
  loaded: Record<string, boolean>
  /** Whether `loadAllProgress` has already run once this session. */
  allLoaded: boolean
  /** Lazily pulls one pattern's progress from storage into the in-memory cache — call when entering Weave Mode. */
  loadProgress: (patternId: string) => Promise<void>
  /** Pulls every pattern's progress in one go — call from the home screen to power "continue weaving" and per-card progress. */
  loadAllProgress: () => Promise<void>
  getIndex: (patternId: string) => number
  /** Which order version a pattern's saved index was recorded under — 1 (the original, pre-versioning order) if never stamped. See `engine/weaveOrder.ts#WEAVE_ORDER_VERSION`. */
  getOrderVersion: (patternId: string) => number
  /** Moves the progress. A piece marked finished is back in progress the moment it moves. */
  setIndex: (patternId: string, index: number, orderVersion: number) => void
  reset: (patternId: string) => void
  /** "Terminar": marks the piece finished where its progress is — at the end, or before it. */
  finish: (patternId: string) => void
  /** Takes the finished mark off again, leaving the progress where it was — "Seguir tejiendo". */
  unfinish: (patternId: string) => void
  isFinished: (patternId: string) => boolean
}

const RIGHT_EARRING_SUFFIX = '#derecho'

/**
 * The key a piece's weave progress is saved under. The left earring (and any
 * single piece) keeps the plain pattern id, so every progress saved before
 * pairs existed stays where it was; the right earring of a pair gets its own
 * key, so each earring remembers its own place. Every place that reads
 * progress back by key must go through `parseWeaveProgressKey`.
 */
export function weaveProgressKey(patternId: string, side: EarringSide = 'left'): string {
  return side === 'right' ? `${patternId}${RIGHT_EARRING_SUFFIX}` : patternId
}

export function parseWeaveProgressKey(key: string): { patternId: string; side: EarringSide } {
  return key.endsWith(RIGHT_EARRING_SUFFIX)
    ? { patternId: key.slice(0, -RIGHT_EARRING_SUFFIX.length), side: 'right' }
    : { patternId: key, side: 'left' }
}

function persistProgress(patternId: string, p: WeaveProgress) {
  getStorageAdapter()
    .then((adapter) => adapter.setWeaveProgress({ patternId, ...p }))
    .catch((err) => console.error('No se pudo guardar el progreso de tejido', err))
}

/**
 * Per-pattern weaving progress, persisted so closing the app and coming back
 * resumes exactly where the user left off. Kept separate from patternsStore
 * because progress is a very different write pattern (one counter, ticked
 * constantly) than pattern content (sparse cell edits). Weave Mode only
 * needs one pattern's progress at a time (`loadProgress`); the home screen's
 * "continue weaving" hero and per-card progress need all of them at once
 * (`loadAllProgress`).
 */
export const useWeaveStore = create<WeaveState>()((set, get) => ({
  progress: {},
  loaded: {},
  allLoaded: false,

  loadProgress: async (patternId) => {
    if (get().loaded[patternId]) return
    const adapter = await getStorageAdapter()
    await migrateFromLocalStorage(adapter)
    const record = await adapter.getWeaveProgress(patternId)
    set((s) => ({
      loaded: { ...s.loaded, [patternId]: true },
      progress: record
        ? {
            ...s.progress,
            [patternId]: {
              currentIndex: record.currentIndex,
              orderVersion: record.orderVersion,
              finishedAt: record.finishedAt,
              updatedAt: record.updatedAt,
            },
          }
        : s.progress,
    }))
  },

  loadAllProgress: async () => {
    if (get().allLoaded) return
    const adapter = await getStorageAdapter()
    await migrateFromLocalStorage(adapter)
    const records = await adapter.listWeaveProgress()
    set((s) => {
      const progress = { ...s.progress }
      const loaded = { ...s.loaded }
      for (const record of records) {
        progress[record.patternId] = {
          currentIndex: record.currentIndex,
          orderVersion: record.orderVersion,
          finishedAt: record.finishedAt,
          updatedAt: record.updatedAt,
        }
        loaded[record.patternId] = true
      }
      return { progress, loaded, allLoaded: true }
    })
  },

  getIndex: (patternId) => get().progress[patternId]?.currentIndex ?? -1,
  getOrderVersion: (patternId) => get().progress[patternId]?.orderVersion ?? 1,

  setIndex: (patternId, index, orderVersion) => {
    const p: WeaveProgress = { currentIndex: index, orderVersion, updatedAt: Date.now() }
    set((s) => ({ progress: { ...s.progress, [patternId]: p } }))
    persistProgress(patternId, p)
  },

  reset: (patternId) => {
    const p: WeaveProgress = { currentIndex: -1, updatedAt: Date.now() }
    set((s) => ({ progress: { ...s.progress, [patternId]: p } }))
    persistProgress(patternId, p)
  },

  finish: (patternId) => {
    const current = get().progress[patternId]
    const now = Date.now()
    const p: WeaveProgress = { currentIndex: current?.currentIndex ?? -1, orderVersion: current?.orderVersion, finishedAt: now, updatedAt: now }
    set((s) => ({ progress: { ...s.progress, [patternId]: p } }))
    persistProgress(patternId, p)
  },

  unfinish: (patternId) => {
    const current = get().progress[patternId]
    if (!current?.finishedAt) return
    const { finishedAt: _finishedAt, ...rest } = current
    const p: WeaveProgress = { ...rest, updatedAt: Date.now() }
    set((s) => ({ progress: { ...s.progress, [patternId]: p } }))
    persistProgress(patternId, p)
  },

  isFinished: (patternId) => Boolean(get().progress[patternId]?.finishedAt),
}))
