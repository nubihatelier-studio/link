import type { PatternDoc } from '@/engine/types'
import type { StorageAdapter, WeaveProgressRecord } from './types'

export const MIGRATION_FLAG_KEY = 'nubih-migration-done'
export const MIGRATION_FLAG_VALUE = 'v1'
const LEGACY_PATTERNS_KEY = 'nubih-patterns'
const LEGACY_WEAVE_KEY = 'nubih-weave-progress'

/** Shape zustand's `persist` middleware wrote to localStorage for these two stores. */
interface LegacyPatternsPersisted {
  state?: { patterns?: Record<string, PatternDoc>; order?: string[] }
}
interface LegacyWeavePersisted {
  state?: { progress?: Record<string, { currentIndex: number; updatedAt: number }> }
}

export interface MigrationResult {
  ran: boolean
  patternsMigrated: number
  progressMigrated: number
  errors: string[]
}

function readJson<T>(storage: Pick<Storage, 'getItem'>, key: string): T | null {
  const raw = storage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * One-time move of pre-existing localStorage data into the new storage
 * adapter. Never deletes `nubih-patterns` / `nubih-weave-progress` — they
 * stay as an emergency paper trail — and only flips the "done" flag after
 * every migrated pattern has been read back and verified to match, so a
 * failure partway through leaves the flag unset and simply retries next launch.
 */
export async function migrateFromLocalStorage(
  adapter: StorageAdapter,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): Promise<MigrationResult> {
  const result: MigrationResult = { ran: false, patternsMigrated: 0, progressMigrated: 0, errors: [] }

  if (storage.getItem(MIGRATION_FLAG_KEY) === MIGRATION_FLAG_VALUE) return result

  const legacyPatterns = readJson<LegacyPatternsPersisted>(storage, LEGACY_PATTERNS_KEY)
  const legacyWeave = readJson<LegacyWeavePersisted>(storage, LEGACY_WEAVE_KEY)
  const patterns = Object.values(legacyPatterns?.state?.patterns ?? {})
  const progress = Object.entries(legacyWeave?.state?.progress ?? {})

  if (patterns.length === 0 && progress.length === 0) {
    // Nothing to migrate (fresh install) — mark done so we don't keep checking.
    storage.setItem(MIGRATION_FLAG_KEY, MIGRATION_FLAG_VALUE)
    return result
  }

  result.ran = true

  for (const doc of patterns) {
    try {
      if (!isValidPatternDoc(doc)) {
        result.errors.push(`Patrón inválido omitido: ${String((doc as { id?: string })?.id)}`)
        continue
      }
      await adapter.savePattern(doc)
      const verify = await adapter.getPattern(doc.id)
      if (!verify || JSON.stringify(verify.cells) !== JSON.stringify(doc.cells)) {
        result.errors.push(`Verificación falló para el patrón ${doc.id}`)
        continue
      }
      result.patternsMigrated++
    } catch (err) {
      result.errors.push(`Error migrando patrón ${doc.id}: ${(err as Error).message}`)
    }
  }

  for (const [patternId, p] of progress) {
    try {
      const record: WeaveProgressRecord = { patternId, currentIndex: p.currentIndex, updatedAt: p.updatedAt }
      await adapter.setWeaveProgress(record)
      result.progressMigrated++
    } catch (err) {
      result.errors.push(`Error migrando progreso de tejido ${patternId}: ${(err as Error).message}`)
    }
  }

  // Only mark done if every pattern that existed made it across intact —
  // a partial failure should retry from scratch next launch, not get stuck
  // "done" with data silently missing.
  if (result.errors.length === 0) {
    storage.setItem(MIGRATION_FLAG_KEY, MIGRATION_FLAG_VALUE)
  }

  return result
}

function isValidPatternDoc(doc: unknown): doc is PatternDoc {
  if (!doc || typeof doc !== 'object') return false
  const d = doc as Record<string, unknown>
  return (
    typeof d.id === 'string' &&
    typeof d.name === 'string' &&
    typeof d.cells === 'object' &&
    d.cells !== null &&
    typeof d.config === 'object' &&
    d.config !== null
  )
}
