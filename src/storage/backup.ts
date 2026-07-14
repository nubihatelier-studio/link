import type { PatternDoc } from '@/engine/types'
import { getStorageAdapter } from './index'
import { SCHEMA_VERSION, type FullBackupFile, type PatternBackupFile, type WeaveProgressRecord } from './types'

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  // Some browsers only honor a synthetic click on an <a download> if it's
  // actually attached to the document, and revoking the blob URL right
  // away can race the download starting — so attach, click, detach, and
  // revoke on the next tick instead of doing all four synchronously.
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function slug(name: string): string {
  return name.trim().replace(/\s+/g, '_').replace(/[^\w-]/g, '') || 'patron'
}

export async function exportPatternBackup(doc: PatternDoc): Promise<void> {
  const file: PatternBackupFile = { schemaVersion: SCHEMA_VERSION, exportedAt: Date.now(), kind: 'pattern', pattern: doc }
  downloadJson(`${slug(doc.name)}.nubih.json`, file)
}

export async function exportFullBackup(): Promise<void> {
  const adapter = await getStorageAdapter()
  const patterns = await adapter.listPatterns()
  const weaveProgress: WeaveProgressRecord[] = []
  for (const p of patterns) {
    const rec = await adapter.getWeaveProgress(p.id)
    if (rec) weaveProgress.push(rec)
  }
  const file: FullBackupFile = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    kind: 'full-backup',
    patterns,
    weaveProgress,
  }
  const date = new Date().toISOString().slice(0, 10)
  downloadJson(`nubih-respaldo_${date}.json`, file)
}

export type ImportedFile = PatternBackupFile | FullBackupFile

/** Parses and shape-checks a backup file's contents; throws with a user-facing message if invalid. */
export function parseBackupFile(raw: string): ImportedFile {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new Error('El archivo no es un JSON válido.')
  }
  const obj = json as Record<string, unknown>
  if (obj?.kind === 'pattern' && obj.pattern) return obj as unknown as PatternBackupFile
  if (obj?.kind === 'full-backup' && Array.isArray(obj.patterns)) return obj as unknown as FullBackupFile
  throw new Error('El archivo no tiene el formato esperado de un respaldo de Nubih Creator.')
}

/**
 * Imports patterns from a parsed backup file as NEW patterns (fresh id,
 * "(importado)" suffix) so importing never silently overwrites something
 * already on this device with the same id.
 */
export async function importBackupFile(file: ImportedFile): Promise<{ importedCount: number }> {
  const adapter = await getStorageAdapter()
  const docs = file.kind === 'pattern' ? [file.pattern] : file.patterns
  let importedCount = 0
  for (const doc of docs) {
    const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const imported: PatternDoc = { ...doc, id, name: `${doc.name} (importado)`, updatedAt: Date.now() }
    await adapter.savePattern(imported)
    importedCount++
  }
  return { importedCount }
}
