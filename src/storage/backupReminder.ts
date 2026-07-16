const LAST_BACKUP_KEY = 'nubih-last-backup-at'
const DISMISSED_KEY = 'nubih-backup-reminder-dismissed-at'

const MIN_PATTERNS = 3
const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000
const RENAG_AFTER_MS = 7 * 24 * 60 * 60 * 1000

function readTimestamp(key: string): number | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(key)
  return raw ? Number(raw) : null
}

/** Call whenever a full backup actually gets downloaded, regardless of which screen triggered it. */
export function recordBackupNow(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()))
}

export function getLastBackupAt(): number | null {
  return readTimestamp(LAST_BACKUP_KEY)
}

/** Silences the reminder for a while — it comes back later if the patterns are still un-backed-up. */
export function dismissBackupReminder(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(DISMISSED_KEY, String(Date.now()))
}

/**
 * Whether the home screen should nudge the person to download a backup:
 * a handful of patterns are worth losing, none of them has ever been backed
 * up (or it's been over a month), and they haven't dismissed the nudge in
 * the last week.
 */
export function shouldShowBackupReminder(patternCount: number, now = Date.now()): boolean {
  if (patternCount < MIN_PATTERNS) return false
  const lastBackupAt = getLastBackupAt()
  const isStale = lastBackupAt === null || now - lastBackupAt > STALE_AFTER_MS
  if (!isStale) return false
  const dismissedAt = readTimestamp(DISMISSED_KEY)
  if (dismissedAt !== null && now - dismissedAt < RENAG_AFTER_MS) return false
  return true
}
